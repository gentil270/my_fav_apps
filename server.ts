import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  CATEGORY_MAP,
  MEDIA_CATEGORIES,
  mapIptvCategoryToMediaCategory,
} from './src/constants/mediaCategories.ts';
import type {
  IpContextInfo,
  PinboardItem,
  RadioStation,
  TVChannel,
  TVStreamSource,
  TrackItem,
  YouTubeVideoItem,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Rate limiting (lightweight sliding window)
// ---------------------------------------------------------------------------
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxPerMinute: number, prefix: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const key = `${prefix}:${ip}`;
    const now = Date.now();
    const entry = rateBuckets.get(key);
    if (!entry || entry.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    entry.count += 1;
    if (entry.count > maxPerMinute) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait briefly.' });
    }
    return next();
  };
}

// ---------------------------------------------------------------------------
// SSRF & Private IP Guard
// ---------------------------------------------------------------------------
function isPrivateOrReservedIp(ipRaw: string): boolean {
  const ip = ipRaw.replace(/^\[|\]$/g, '').split('%')[0];
  if (!net.isIP(ip)) return false;

  if (ip.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(ip.slice(7));
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    );
  }

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

async function validatePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS protocols are permitted');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    throw new Error('Private or local hostnames are blocked');
  }

  if (net.isIP(host.replace(/^\[|\]$/g, ''))) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Private or loopback IP addresses are blocked');
    }
    return parsed;
  }

  try {
    const records = await dns.lookup(host, { all: true });
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error('Hostname resolves to a private or reserved IP address');
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('private') || err?.message?.includes('blocked')) {
      throw err;
    }
    // Allow DNS lookup transient glitches only if hostname is clearly public TLD
    if (!host.includes('.')) {
      throw new Error('Invalid public hostname');
    }
  }
  return parsed;
}

async function fetchWithValidatedRedirects(
  targetUrl: string,
  headers: Record<string, string>,
  timeoutMs = 15_000,
  maxRedirects = 4
): Promise<{ response: globalThis.Response; finalUrl: string }> {
  let currentUrl = targetUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const valid = await validatePublicUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(valid.toString(), {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get('location')
      ) {
        const nextLoc = response.headers.get('location')!;
        currentUrl = new URL(nextLoc, valid.toString()).toString();
        continue;
      }
      return { response, finalUrl: valid.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Too many redirects');
}

// ---------------------------------------------------------------------------
// World TV Catalog Cache (iptv-org API)
// ---------------------------------------------------------------------------
interface TVCatalogCache {
  fetchedAt: number;
  channels: TVChannel[];
  countryNames: Record<string, string>;
}

let tvCatalogCache: TVCatalogCache | null = null;
let tvCatalogLoadingPromise: Promise<TVCatalogCache> | null = null;

const FALLBACK_TV_CHANNELS: TVChannel[] = [
  {
    id: 'France24English.fr',
    name: 'France 24 English',
    country: 'France',
    countryCode: 'FR',
    category: 'news',
    mediaCategory: 'news',
    logo: '',
    streamUrl: 'https://static.france24.com/live/F24_EN_LO_HLS/live_tv.m3u8',
    sources: [{ url: 'https://static.france24.com/live/F24_EN_LO_HLS/live_tv.m3u8', quality: '720p' }],
  },
  {
    id: 'DWEnglish.de',
    name: 'DW English',
    country: 'Germany',
    countryCode: 'DE',
    category: 'news',
    mediaCategory: 'news',
    logo: '',
    streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8',
    sources: [{ url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8', quality: '1080p' }],
  },
  {
    id: 'AlJazeeraEnglish.qa',
    name: 'Al Jazeera English',
    country: 'Qatar',
    countryCode: 'QA',
    category: 'news',
    mediaCategory: 'news',
    logo: '',
    streamUrl: 'https://live-hls-web-aje.getaj.net/AJE/index.m3u8',
    sources: [{ url: 'https://live-hls-web-aje.getaj.net/AJE/index.m3u8', quality: '1080p' }],
  },
  {
    id: 'NHKWorldJapan.jp',
    name: 'NHK World Japan',
    country: 'Japan',
    countryCode: 'JP',
    category: 'news',
    mediaCategory: 'news',
    logo: '',
    streamUrl: 'https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp-en/index.m3u8',
    sources: [{ url: 'https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp-en/index.m3u8', quality: '720p' }],
  },
  {
    id: 'NASATV.us',
    name: 'NASA+ Live',
    country: 'United States',
    countryCode: 'US',
    category: 'science',
    mediaCategory: 'documentary',
    logo: '',
    streamUrl: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8',
    sources: [{ url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8', quality: '1080p' }],
  },
  {
    id: 'RedBullTV.at',
    name: 'Red Bull TV',
    country: 'Austria',
    countryCode: 'AT',
    category: 'sports',
    mediaCategory: 'sports',
    logo: '',
    streamUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    sources: [{ url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8', quality: '1080p' }],
  },
];

async function getWorldTVCatalog(): Promise<TVCatalogCache> {
  if (tvCatalogCache && Date.now() - tvCatalogCache.fetchedAt < 30 * 60_000) {
    return tvCatalogCache;
  }
  if (tvCatalogLoadingPromise) {
    return tvCatalogLoadingPromise;
  }

  tvCatalogLoadingPromise = (async () => {
    try {
      const [channelsRes, streamsRes, countriesRes] = await Promise.all([
        fetch('https://iptv-org.github.io/api/channels.json', {
          signal: AbortSignal.timeout(15_000),
        }),
        fetch('https://iptv-org.github.io/api/streams.json', {
          signal: AbortSignal.timeout(15_000),
        }),
        fetch('https://iptv-org.github.io/api/countries.json', {
          signal: AbortSignal.timeout(10_000),
        }),
      ]);

      if (!channelsRes.ok || !streamsRes.ok) {
        throw new Error('Upstream IPTV API unavailable');
      }

      const [rawChannels, rawStreams, rawCountries] = await Promise.all([
        channelsRes.json() as Promise<any[]>,
        streamsRes.json() as Promise<any[]>,
        countriesRes.ok ? (countriesRes.json() as Promise<any[]>) : Promise.resolve([]),
      ]);

      const countryMap: Record<string, string> = {};
      for (const c of rawCountries) {
        if (c?.code && c?.name) {
          countryMap[String(c.code).toUpperCase()] = String(c.name);
        }
      }

      const channelMeta = new Map<string, any>();
      for (const ch of rawChannels) {
        if (ch?.id && !ch.is_nsfw) {
          channelMeta.set(String(ch.id), ch);
        }
      }

      const streamsByChannel = new Map<string, TVStreamSource[]>();
      const standaloneStreams: TVChannel[] = [];

      for (const st of rawStreams) {
        if (!st?.url || typeof st.url !== 'string') continue;
        if (!st.url.startsWith('http://') && !st.url.startsWith('https://')) continue;

        const src: TVStreamSource = {
          url: st.url,
          quality: st.quality || undefined,
          feed: st.feed || undefined,
          referrer: st.referrer || undefined,
          userAgent: st.user_agent || undefined,
        };

        if (st.channel) {
          const cid = String(st.channel);
          const arr = streamsByChannel.get(cid) || [];
          if (arr.length < 6 && !arr.some((s) => s.url === src.url)) {
            arr.push(src);
            streamsByChannel.set(cid, arr);
          }
        } else if (st.title) {
          const id = `standalone_${Buffer.from(st.url).toString('base64url').slice(0, 14)}`;
          standaloneStreams.push({
            id,
            name: String(st.title),
            country: 'International',
            countryCode: 'INTL',
            category: 'general',
            mediaCategory: 'entertainment',
            streamUrl: st.url,
            sources: [src],
          });
        }
      }

      const combined: TVChannel[] = [];
      for (const [cid, sources] of streamsByChannel.entries()) {
        if (sources.length === 0) continue;
        const meta = channelMeta.get(cid);
        if (!meta) continue;
        const cc = String(meta.country || 'INTL').toUpperCase();
        const rawCats: string[] = Array.isArray(meta.categories) ? meta.categories : [];
        const primaryCat = rawCats[0] || 'general';

        combined.push({
          id: cid,
          name: String(meta.name || cid),
          country: countryMap[cc] || cc,
          countryCode: cc,
          category: primaryCat,
          mediaCategory: mapIptvCategoryToMediaCategory(primaryCat),
          logo: typeof meta.logo === 'string' ? meta.logo : undefined,
          streamUrl: sources[0].url,
          sources,
          isNsfw: Boolean(meta.is_nsfw),
        });
      }

      // Deduplicate standalone streams by title+url and merge
      const seenStandalone = new Set<string>();
      for (const s of standaloneStreams) {
        if (!seenStandalone.has(s.streamUrl)) {
          seenStandalone.add(s.streamUrl);
          combined.push(s);
        }
      }

      const result: TVCatalogCache = {
        fetchedAt: Date.now(),
        channels: combined.length > 0 ? combined : FALLBACK_TV_CHANNELS,
        countryNames: countryMap,
      };
      tvCatalogCache = result;
      return result;
    } catch {
      const fallback: TVCatalogCache = {
        fetchedAt: Date.now() - 25 * 60_000,
        channels: FALLBACK_TV_CHANNELS,
        countryNames: { FR: 'France', DE: 'Germany', QA: 'Qatar', JP: 'Japan', US: 'United States', AT: 'Austria' },
      };
      if (!tvCatalogCache) tvCatalogCache = fallback;
      return tvCatalogCache;
    } finally {
      tvCatalogLoadingPromise = null;
    }
  })();

  return tvCatalogLoadingPromise;
}

// ---------------------------------------------------------------------------
// Music & Radio Helpers (Audius + iTunes + Deezer + Radio Browser)
// ---------------------------------------------------------------------------
const AUDIUS_DISCOVERY_FALLBACKS = [
  'https://discoveryprovider.audius.co',
  'https://discoveryprovider2.audius.co',
  'https://discoveryprovider3.audius.co',
];

let cachedAudiusHost: { host: string; ts: number } | null = null;

async function getAudiusHost(): Promise<string> {
  if (cachedAudiusHost && Date.now() - cachedAudiusHost.ts < 15 * 60_000) {
    return cachedAudiusHost.host;
  }
  try {
    const res = await fetch('https://api.audius.co', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = (await res.json()) as { data?: string[] };
      if (Array.isArray(data.data) && data.data.length > 0) {
        cachedAudiusHost = { host: data.data[0], ts: Date.now() };
        return cachedAudiusHost.host;
      }
    }
  } catch {
    // fallback
  }
  return AUDIUS_DISCOVERY_FALLBACKS[0];
}

async function searchAudiusTracks(query: string, limit = 12): Promise<TrackItem[]> {
  try {
    const host = await getAudiusHost();
    const url = query.trim()
      ? `${host}/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}&app_name=KEZAGlobalStream`
      : `${host}/v1/tracks/trending?limit=${limit}&app_name=KEZAGlobalStream`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6500) });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: any[] };
    const items = Array.isArray(json.data) ? json.data : [];
    return items
      .filter((t) => t?.id && t?.title)
      .map((t) => {
        const cover =
          t.artwork?.['480x480'] ||
          t.artwork?.['150x150'] ||
          '/src/assets/images/cover_global_radio_1795424586587.jpg';
        const streamTarget = `${host}/v1/tracks/${encodeURIComponent(t.id)}/stream?app_name=KEZAGlobalStream`;
        return {
          id: `audius_${t.id}`,
          title: String(t.title),
          artist: String(t.user?.name || 'Independent Artist'),
          album: t.genre ? `${t.genre} Session` : 'Audius Stream',
          coverUrl: cover,
          audioUrl: `/api/music/stream?url=${encodeURIComponent(streamTarget)}`,
          durationSec: Number(t.duration) || 180,
          source: 'audius' as const,
          genre: String(t.genre || 'Electronic'),
          externalUrl: `https://audius.co${t.permalink || ''}`,
        };
      });
  } catch {
    return [];
  }
}

async function searchItunesTracks(query: string, limit = 12): Promise<TrackItem[]> {
  try {
    const term = query.trim() || 'afrobeats top hits';
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: any[] };
    const rows = Array.isArray(data.results) ? data.results : [];
    return rows
      .filter((r) => r.previewUrl && r.trackName)
      .map((r) => ({
        id: `itunes_${r.trackId}`,
        title: String(r.trackName),
        artist: String(r.artistName || 'Artist'),
        album: String(r.collectionName || ''),
        coverUrl: String(r.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        audioUrl: `/api/music/stream?url=${encodeURIComponent(r.previewUrl)}`,
        durationSec: 30,
        source: 'itunes' as const,
        genre: String(r.primaryGenreName || 'Pop'),
        country: String(r.country || ''),
        externalUrl: r.trackViewUrl,
      }));
  } catch {
    return [];
  }
}

async function searchDeezerTracks(query: string, limit = 14): Promise<TrackItem[]> {
  try {
    const q = query.trim() || 'top global hits';
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: any[] };
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows
      .filter((r) => r.preview && r.title)
      .map((r) => ({
        id: `deezer_${r.id}`,
        title: String(r.title),
        artist: String(r.artist?.name || 'Artist'),
        album: String(r.album?.title || ''),
        coverUrl:
          r.album?.cover_big ||
          r.album?.cover_medium ||
          '/src/assets/images/cover_global_radio_1795424586587.jpg',
        audioUrl: `/api/music/stream?url=${encodeURIComponent(r.preview)}`,
        durationSec: 30,
        source: 'deezer' as const,
        genre: 'Global',
        externalUrl: r.link,
      }));
  } catch {
    return [];
  }
}

const RADIO_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://fr1.api.radio-browser.info',
];

async function fetchRadioStationsFromMirrors(params: {
  country?: string;
  countryCode?: string;
  genre?: string;
  q?: string;
  limit?: number;
}): Promise<RadioStation[]> {
  const limit = Math.min(48, Math.max(4, params.limit || 20));
  const search = new URLSearchParams({
    limit: String(limit),
    hidebroken: 'true',
    order: 'votes',
    reverse: 'true',
  });
  if (params.countryCode) search.set('countrycode', params.countryCode.toUpperCase());
  else if (params.country) search.set('country', params.country);
  if (params.genre && params.genre !== 'all') search.set('tag', params.genre.toLowerCase());
  if (params.q) search.set('name', params.q);

  for (const mirror of RADIO_MIRRORS) {
    try {
      const res = await fetch(`${mirror}/json/stations/search?${search.toString()}`, {
        headers: { 'User-Agent': 'KEZAGlobalStream/1.0' },
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) continue;
      const rows = (await res.json()) as any[];
      if (!Array.isArray(rows)) continue;

      return rows
        .filter((r) => r.url_resolved || r.url)
        .map((r) => {
          const rawUrl = String(r.url_resolved || r.url);
          return {
            id: `rb_${r.stationuuid}`,
            name: String(r.name || 'Live Radio').trim(),
            country: String(r.country || 'Global'),
            countryCode: String(r.countrycode || 'INTL').toUpperCase(),
            tags: String(r.tags || '')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 4),
            codec: String(r.codec || 'MP3'),
            bitrate: Number(r.bitrate) || 128,
            favicon: r.favicon && String(r.favicon).startsWith('http') ? String(r.favicon) : undefined,
            streamUrl: `/api/music/radio?url=${encodeURIComponent(rawUrl)}`,
            homepage: r.homepage || undefined,
            votes: Number(r.votes) || 0,
            isMix: false,
          };
        });
    } catch {
      continue;
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// YouTube Search Scraper (ytInitialData + Piped fallback)
// ---------------------------------------------------------------------------
function extractYtInitialData(html: string): any | null {
  const markers = ['var ytInitialData = ', 'window["ytInitialData"] = '];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const start = html.indexOf('{', idx);
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < html.length; i += 1) {
      const ch = html[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            try {
              return JSON.parse(html.slice(start, i + 1));
            } catch {
              return null;
            }
          }
        }
      }
    }
  }
  return null;
}

function collectVideoRenderers(node: unknown, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  if (obj.videoRenderer && typeof obj.videoRenderer === 'object') {
    out.push(obj.videoRenderer);
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') collectVideoRenderers(val, out);
  }
  return out;
}

async function searchYouTubeVideos(options: {
  q?: string;
  category?: string;
  country?: string;
  limit?: number;
}): Promise<YouTubeVideoItem[]> {
  const catDef = CATEGORY_MAP.get(options.category || 'all') || MEDIA_CATEGORIES[0];
  const parts: string[] = [];
  if (options.q?.trim()) parts.push(options.q.trim());
  else parts.push(catDef.youtubeQuery);
  if (options.country?.trim()) parts.push(options.country.trim());

  const queryStr = parts.join(' ').trim();
  const limit = Math.min(30, Math.max(4, options.limit || 18));

  try {
    const ytRes = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(queryStr)}&hl=en`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8500),
      }
    );
    if (ytRes.ok) {
      const html = await ytRes.text();
      const data = extractYtInitialData(html);
      const renderers = collectVideoRenderers(data);
      const items: YouTubeVideoItem[] = [];
      const seen = new Set<string>();

      for (const vr of renderers) {
        const videoId = vr?.videoId;
        if (!videoId || seen.has(videoId)) continue;
        const title =
          vr?.title?.runs?.map((r: any) => r.text).join('') ||
          vr?.title?.simpleText ||
          '';
        if (!title) continue;

        // Exclude obvious AI-generated spam when browsing music
        if (
          (catDef.id === 'music' || catDef.id === 'radio') &&
          /\b(ai cover|ai generated|suno ai|udio ai)\b/i.test(title)
        ) {
          continue;
        }

        seen.add(videoId);
        const channelTitle =
          vr?.ownerText?.runs?.[0]?.text ||
          vr?.longBylineText?.runs?.[0]?.text ||
          'YouTube Channel';
        const thumbs = vr?.thumbnail?.thumbnails || [];
        const thumbUrl =
          thumbs[thumbs.length - 1]?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        items.push({
          id: String(videoId),
          title: String(title),
          channelTitle: String(channelTitle),
          thumbnailUrl: String(thumbUrl),
          durationText: vr?.lengthText?.simpleText || 'LIVE',
          viewsText: vr?.shortViewCountText?.simpleText || '',
          publishedText: vr?.publishedTimeText?.simpleText || '',
          category: catDef.id,
          country: options.country || undefined,
          embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`,
        });
        if (items.length >= limit) break;
      }

      if (items.length > 0) return items;
    }
  } catch {
    // Fallback below
  }

  // Piped API fallback
  const pipedInstances = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de'];
  for (const inst of pipedInstances) {
    try {
      const res = await fetch(
        `${inst}/search?q=${encodeURIComponent(queryStr)}&filter=videos`,
        { signal: AbortSignal.timeout(5500) }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { items?: any[] };
      const list = Array.isArray(json.items) ? json.items : [];
      const mapped: YouTubeVideoItem[] = [];
      for (const item of list) {
        const match = String(item.url || '').match(/v=([a-zA-Z0-9_-]{6,})/);
        if (!match) continue;
        const vid = match[1];
        mapped.push({
          id: vid,
          title: String(item.title || 'YouTube Video'),
          channelTitle: String(item.uploaderName || 'YouTube'),
          thumbnailUrl: String(item.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`),
          durationText: item.duration > 0 ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}` : 'LIVE',
          viewsText: item.views ? `${Number(item.views).toLocaleString()} views` : '',
          publishedText: item.uploadedDate || '',
          category: catDef.id,
          country: options.country || undefined,
          embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?autoplay=1&rel=0`,
        });
        if (mapped.length >= limit) break;
      }
      if (mapped.length > 0) return mapped;
    } catch {
      continue;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, brand: 'KEZA Global Stream' });
});

// 1. World TV Channels Directory
app.get('/api/tv/channels', rateLimit(180, 'tv_list'), async (req, res) => {
  try {
    const catalog = await getWorldTVCatalog();
    const q = String(req.query.q || '').trim().toLowerCase();
    const country = String(req.query.country || '').trim().toLowerCase();
    const category = String(req.query.category || 'all').trim().toLowerCase();
    const limit = Math.min(120, Math.max(1, Number(req.query.limit) || 48));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const countryCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    const filtered: TVChannel[] = [];
    for (const ch of catalog.channels) {
      countryCounts[ch.country] = (countryCounts[ch.country] || 0) + 1;
      categoryCounts[ch.mediaCategory] = (categoryCounts[ch.mediaCategory] || 0) + 1;

      if (
        category &&
        category !== 'all' &&
        ch.mediaCategory !== category &&
        ch.category.toLowerCase() !== category
      ) {
        continue;
      }
      if (
        country &&
        country !== 'all' &&
        ch.countryCode.toLowerCase() !== country &&
        ch.country.toLowerCase() !== country
      ) {
        continue;
      }
      if (
        q &&
        !ch.name.toLowerCase().includes(q) &&
        !ch.country.toLowerCase().includes(q) &&
        !ch.category.toLowerCase().includes(q)
      ) {
        continue;
      }
      filtered.push(ch);
    }

    const total = filtered.length;
    const channels = filtered.slice(offset, offset + limit);

    res.json({
      total,
      totalCatalog: catalog.channels.length,
      countryCount: Object.keys(countryCounts).length,
      countryCounts,
      categoryCounts,
      channels,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load World TV catalog' });
  }
});

// 2. SSRF-Protected World TV HLS & Media Proxy
app.get('/api/tv/proxy', rateLimit(900, 'tv_proxy'), async (req, res) => {
  const rawUrl = String(req.query.url || '');
  const ref = String(req.query.ref || '');
  const ua = String(req.query.ua || '') || USER_AGENT;

  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    await validatePublicUrl(rawUrl);
  } catch (err: any) {
    return res.status(403).json({ error: err?.message || 'Forbidden media target' });
  }

  try {
    const reqHeaders: Record<string, string> = {
      'User-Agent': ua,
      Accept: '*/*',
    };
    if (ref && (ref.startsWith('http://') || ref.startsWith('https://'))) {
      reqHeaders.Referer = ref;
      try {
        reqHeaders.Origin = new URL(ref).origin;
      } catch {
        // ignore invalid origin
      }
    }
    if (req.headers.range) {
      reqHeaders.Range = String(req.headers.range);
    }

    const { response, finalUrl } = await fetchWithValidatedRedirects(rawUrl, reqHeaders, 15_000);
    if (!response.ok && response.status !== 206) {
      return res.status(response.status).json({ error: `Broadcaster returned ${response.status}` });
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const isLikelyPlaylist =
      contentType.includes('mpegurl') ||
      contentType.includes('x-mpegurl') ||
      finalUrl.toLowerCase().includes('.m3u8');

    if (isLikelyPlaylist || contentType.includes('text/plain') || contentType === '') {
      const buffer = Buffer.from(await response.arrayBuffer());
      const headText = buffer.subarray(0, 64).toString('utf8').trimStart();
      if (headText.startsWith('#EXTM3U')) {
        const text = buffer.toString('utf8');
        const rewriteUri = (rawLineUri: string) => {
          const abs = new URL(rawLineUri, finalUrl).toString();
          const params = new URLSearchParams({ url: abs });
          if (ref) params.set('ref', ref);
          if (req.query.ua) params.set('ua', String(req.query.ua));
          return `/api/tv/proxy?${params.toString()}`;
        };

        const rewritten = text
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
                try {
                  return `URI="${rewriteUri(uri)}"`;
                } catch {
                  return `URI="${uri}"`;
                }
              });
            }
            try {
              return rewriteUri(trimmed);
            } catch {
              return line;
            }
          })
          .join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).send(rewritten);
      }

      if (!isLikelyPlaylist) {
        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        return res.status(response.status).send(buffer);
      }
    }

    res.status(response.status);
    if (contentType) res.setHeader('Content-Type', contentType);
    const acceptRanges = response.headers.get('accept-ranges');
    const contentRange = response.headers.get('content-range');
    const contentLength = response.headers.get('content-length');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'no-store');

    const body = response.body;
    if (!body) {
      return res.end();
    }
    const reader = body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.writableEnded) {
          res.write(Buffer.from(value));
        } else {
          await reader.cancel();
          break;
        }
      }
      if (!res.writableEnded) res.end();
    };
    req.on('close', () => {
      reader.cancel().catch(() => {});
    });
    await pump();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).json({ error: err?.message || 'TV proxy stream error' });
    }
  }
});

// 3. YouTube Songs & Videos Browse
app.get('/api/youtube/browse', rateLimit(180, 'yt'), async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const category = String(req.query.category || 'all');
    const country = String(req.query.country || '');
    const limit = Number(req.query.limit) || 18;
    const items = await searchYouTubeVideos({ q, category, country, limit });
    res.json({ items, category, country });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'YouTube search failed' });
  }
});

// 4. Music Discover & Search
app.get('/api/music/search', rateLimit(180, 'music_search'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const [audius, deezer, itunes] = await Promise.all([
      searchAudiusTracks(q, 10),
      searchDeezerTracks(q || 'afrobeats', 10),
      searchItunesTracks(q || 'world music', 8),
    ]);

    const tracks: TrackItem[] = [];
    const maxLen = Math.max(audius.length, deezer.length, itunes.length);
    for (let i = 0; i < maxLen; i += 1) {
      if (audius[i]) tracks.push(audius[i]);
      if (deezer[i]) tracks.push(deezer[i]);
      if (itunes[i]) tracks.push(itunes[i]);
    }
    res.json({ tracks });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Music search failed' });
  }
});

app.get('/api/music/discover', rateLimit(120, 'discover'), async (_req, res) => {
  try {
    const [trendingAudius, globalHits, liveRadio, tvCatalog] = await Promise.all([
      searchAudiusTracks('', 8),
      searchDeezerTracks('kigali afrobeats global', 8),
      fetchRadioStationsFromMirrors({ limit: 8 }),
      getWorldTVCatalog(),
    ]);

    res.json({
      brand: 'KEZA Global Stream',
      tagline: 'Global Music, Live World TV, Radio & Google Drive Vault',
      stats: {
        tvChannels: tvCatalog.channels.length,
        tvCountries: new Set(tvCatalog.channels.map((c) => c.country)).size || 180,
        categories: MEDIA_CATEGORIES.length,
      },
      trendingTracks: [...trendingAudius.slice(0, 6), ...globalHits.slice(0, 6)],
      featuredRadio: liveRadio,
      featuredTV: tvCatalog.channels.slice(0, 8),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load Discover feed' });
  }
});

// 5. Spotify & Audiomack Pinterest-Style Pinboard
app.get('/api/music/pinboard', rateLimit(180, 'pinboard'), async (req, res) => {
  try {
    const sourceFilter = String(req.query.source || 'all').toLowerCase();
    const genre = String(req.query.genre || 'All');
    const q = String(req.query.q || '').trim();
    const pastedUrl = String(req.query.url || '').trim();

    // Direct URL resolver for open.spotify.com or audiomack.com links
    if (pastedUrl) {
      const items: PinboardItem[] = [];
      try {
        const parsed = await validatePublicUrl(pastedUrl);
        if (parsed.hostname.includes('audiomack.com')) {
          const oembedRes = await fetch(
            `https://audiomack.com/oembed?url=${encodeURIComponent(pastedUrl)}&format=json`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (oembedRes.ok) {
            const meta = (await oembedRes.json()) as any;
            const title = String(meta.title || 'Audiomack Track');
            const author = String(meta.author_name || 'Audiomack Artist');
            const preview = (await searchDeezerTracks(`${title} ${author}`, 1))[0];
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            const embedPath = pathParts.length >= 3 ? `${pathParts[0]}/song/${pathParts[2]}` : pathParts.join('/');
            items.push({
              id: `pin_am_${Date.now()}`,
              title,
              artist: author,
              source: 'audiomack',
              genre: genre === 'All' ? 'Afrobeats' : genre,
              coverUrl:
                meta.thumbnail_url ||
                preview?.coverUrl ||
                '/src/assets/images/cover_global_radio_1795424586587.jpg',
              audioUrl: preview?.audioUrl || '',
              externalUrl: pastedUrl,
              embedUrl: `https://audiomack.com/embed/${embedPath}?background=1`,
              aspectRatio: 'portrait',
              durationSec: preview?.durationSec || 30,
            });
          }
        } else if (parsed.hostname.includes('spotify.com')) {
          const oembedRes = await fetch(
            `https://open.spotify.com/oembed?url=${encodeURIComponent(pastedUrl)}`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (oembedRes.ok) {
            const meta = (await oembedRes.json()) as any;
            const title = String(meta.title || 'Spotify Track');
            const preview = (await searchDeezerTracks(title, 1))[0];
            const embedUrl = pastedUrl.replace('open.spotify.com/', 'open.spotify.com/embed/');
            items.push({
              id: `pin_sp_${Date.now()}`,
              title,
              artist: preview?.artist || 'Spotify Artist',
              source: 'spotify',
              genre: genre === 'All' ? 'Pop' : genre,
              coverUrl:
                meta.thumbnail_url ||
                preview?.coverUrl ||
                '/src/assets/images/cover_global_radio_1795424586587.jpg',
              audioUrl: preview?.audioUrl || '',
              externalUrl: pastedUrl,
              embedUrl,
              aspectRatio: 'square',
              durationSec: preview?.durationSec || 30,
            });
          }
        }
      } catch {
        // Return empty if invalid URL
      }
      return res.json({ items });
    }

    const searchTerm = [q, genre !== 'All' ? genre : ''].filter(Boolean).join(' ').trim() || 'afrobeats pop hip hop';
    const [deezer, itunes] = await Promise.all([
      searchDeezerTracks(searchTerm, 16),
      searchItunesTracks(searchTerm, 12),
    ]);

    const ratios: Array<'square' | 'portrait' | 'tall'> = ['portrait', 'square', 'tall'];
    const combined = [...deezer, ...itunes];
    const pins: PinboardItem[] = combined.map((track, idx) => {
      const isAudiomack =
        sourceFilter === 'audiomack'
          ? true
          : sourceFilter === 'spotify'
          ? false
          : idx % 2 === 1;
      const slugArtist = track.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const slugTitle = track.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const searchQ = encodeURIComponent(`${track.artist} ${track.title}`);

      return {
        id: `pin_${isAudiomack ? 'am' : 'sp'}_${track.id}`,
        title: track.title,
        artist: track.artist,
        album: track.album,
        source: isAudiomack ? 'audiomack' : 'spotify',
        genre: genre !== 'All' ? genre : track.genre || 'Global',
        coverUrl: track.coverUrl,
        audioUrl: track.audioUrl,
        externalUrl: isAudiomack
          ? `https://audiomack.com/search?q=${searchQ}`
          : `https://open.spotify.com/search/${searchQ}`,
        embedUrl: isAudiomack
          ? `https://audiomack.com/embed/song/${slugArtist}/${slugTitle}?background=1`
          : `https://open.spotify.com/embed/search/${searchQ}`,
        aspectRatio: ratios[idx % ratios.length],
        durationSec: track.durationSec || 30,
      };
    });

    res.json({ items: pins });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load pinboard' });
  }
});

// 6. Lyrics Lookup (lrclib.net)
app.get('/api/music/lyrics', rateLimit(120, 'lyrics'), async (req, res) => {
  try {
    const artist = String(req.query.artist || '').trim();
    const title = String(req.query.title || '').trim();
    if (!title) return res.json({ lyrics: '' });

    const q = `${artist} ${title}`.trim();
    const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(5500),
    });
    if (!r.ok) return res.json({ lyrics: '' });
    const rows = (await r.json()) as any[];
    const match = Array.isArray(rows) ? rows.find((x) => x.plainLyrics || x.syncedLyrics) : null;
    res.json({
      lyrics: match?.plainLyrics || match?.syncedLyrics || '',
      trackName: match?.trackName || title,
      artistName: match?.artistName || artist,
    });
  } catch {
    res.json({ lyrics: '' });
  }
});

// 7. Global Radio Stations & Full-Length Mixes (Online + Offline Sync)
app.get('/api/radio/stations', rateLimit(180, 'radio_list'), async (req, res) => {
  try {
    const country = String(req.query.country || '').trim();
    const countryCode = String(req.query.countryCode || '').trim();
    const genre = String(req.query.genre || '').trim();
    const q = String(req.query.q || '').trim();
    const limit = Math.min(40, Math.max(4, Number(req.query.limit) || 18));

    const [stations, audiusMixes] = await Promise.all([
      fetchRadioStationsFromMirrors({ country, countryCode, genre, q, limit }),
      searchAudiusTracks(q || `${genre || 'chill electronic'} mix session`, 10),
    ]);

    const mixes: RadioStation[] = audiusMixes.map((track) => ({
      id: `mix_${track.id}`,
      name: `${track.title} — ${track.artist}`,
      country: 'Global Mix',
      countryCode: 'MIX',
      tags: [track.genre || 'Mix', 'Full Session'],
      codec: 'MP3',
      bitrate: 320,
      favicon: track.coverUrl,
      streamUrl: track.audioUrl,
      homepage: track.externalUrl,
      isMix: true,
      durationSec: track.durationSec || 180,
    }));

    res.json({ stations, mixes });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load radio stations' });
  }
});

// 8. Audio / Radio Stream Proxy (SSRF-protected)
async function proxyAudioHandler(req: Request, res: Response) {
  const rawUrl = String(req.query.url || '');
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  try {
    await validatePublicUrl(rawUrl);
  } catch (err: any) {
    return res.status(403).json({ error: err?.message || 'Blocked stream URL' });
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: '*/*',
    };
    if (req.headers.range) headers.Range = String(req.headers.range);

    const { response } = await fetchWithValidatedRedirects(rawUrl, headers, 18_000);
    if (!response.ok && response.status !== 206) {
      return res.status(response.status).json({ error: `Upstream audio returned ${response.status}` });
    }

    res.status(response.status);
    const ct = response.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', ct);
    const cl = response.headers.get('content-length');
    const cr = response.headers.get('content-range');
    const ar = response.headers.get('accept-ranges');
    if (cl) res.setHeader('Content-Length', cl);
    if (cr) res.setHeader('Content-Range', cr);
    if (ar) res.setHeader('Accept-Ranges', ar);
    res.setHeader('Cache-Control', 'no-store');

    const body = response.body;
    if (!body) return res.end();
    const reader = body.getReader();
    req.on('close', () => {
      reader.cancel().catch(() => {});
    });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.writableEnded) {
        res.write(Buffer.from(value));
      } else {
        await reader.cancel();
        break;
      }
    }
    if (!res.writableEnded) res.end();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).json({ error: err?.message || 'Audio proxy error' });
    }
  }
}

app.get('/api/music/radio', rateLimit(600, 'audio_radio'), proxyAudioHandler);
app.get('/api/music/stream', rateLimit(600, 'audio_stream'), proxyAudioHandler);

// 9. IP Context & Interests Personalized Feed
app.get('/api/ip/context', rateLimit(120, 'ip_ctx'), async (req, res) => {
  try {
    const requestedIp = String(req.query.ip || '').trim();
    if (requestedIp) {
      if (!net.isIP(requestedIp)) {
        return res.status(400).json({ error: 'Please enter a valid public IPv4 or IPv6 address.' });
      }
      if (isPrivateOrReservedIp(requestedIp)) {
        return res.status(400).json({
          error: 'Private, loopback, or reserved IP addresses cannot be geolocated.',
        });
      }
    }

    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const clientIp = requestedIp || (fwd && !isPrivateOrReservedIp(fwd) ? fwd : '');

    const ipwhoUrl = clientIp
      ? `https://ipwho.is/${encodeURIComponent(clientIp)}`
      : 'https://ipwho.is/';

    let ctx: IpContextInfo | null = null;
    try {
      const r = await fetch(ipwhoUrl, { signal: AbortSignal.timeout(5500) });
      if (r.ok) {
        const d = (await r.json()) as any;
        if (d.success !== false && d.country) {
          ctx = {
            ip: String(d.ip || clientIp || 'Auto'),
            country: String(d.country),
            countryCode: String(d.country_code || 'US').toUpperCase(),
            region: String(d.region || ''),
            city: String(d.city || ''),
            timezone: String(d.timezone?.id || 'UTC'),
            isp: String(d.connection?.isp || 'Public Network'),
            asn: d.connection?.asn ? `AS${d.connection.asn}` : 'AS0',
          };
        }
      }
    } catch {
      // Fallback below
    }

    if (!ctx) {
      const ipapiUrl = clientIp
        ? `https://ipapi.co/${encodeURIComponent(clientIp)}/json/`
        : 'https://ipapi.co/json/';
      try {
        const r = await fetch(ipapiUrl, { signal: AbortSignal.timeout(5500) });
        if (r.ok) {
          const d = (await r.json()) as any;
          if (!d.error && d.country_name) {
            ctx = {
              ip: String(d.ip || clientIp || 'Auto'),
              country: String(d.country_name),
              countryCode: String(d.country_code || 'US').toUpperCase(),
              region: String(d.region || ''),
              city: String(d.city || ''),
              timezone: String(d.timezone || 'UTC'),
              isp: String(d.org || 'Public Network'),
              asn: String(d.asn || 'AS0'),
            };
          }
        }
      } catch {
        // Fallback default
      }
    }

    if (!ctx) {
      ctx = {
        ip: clientIp || 'Detected Egress',
        country: 'Rwanda',
        countryCode: 'RW',
        region: 'Kigali',
        city: 'Kigali',
        timezone: 'Africa/Kigali',
        isp: 'Global Network',
        asn: 'AS37228',
      };
    }

    res.json(ctx);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'IP lookup failed' });
  }
});

app.get('/api/ip/interests-feed', rateLimit(120, 'ip_feed'), async (req, res) => {
  try {
    const countryCode = String(req.query.countryCode || 'RW').toUpperCase();
    const country = String(req.query.country || 'Rwanda');
    const categories = String(req.query.categories || 'music,news')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const genres = String(req.query.genres || 'Afrobeats,Jazz')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const topics = String(req.query.topics || 'live concerts,world news')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const [catalog, youtubeItems, musicTracks, localRadio] = await Promise.all([
      getWorldTVCatalog(),
      searchYouTubeVideos({
        q: `${topics.slice(0, 2).join(' ')} ${genres[0] || ''}`.trim(),
        category: categories[0] || 'all',
        country,
        limit: 8,
      }),
      searchDeezerTracks(`${genres.slice(0, 2).join(' ')} ${country}`.trim(), 10),
      fetchRadioStationsFromMirrors({ countryCode, limit: 8 }),
    ]);

    const countryTv = catalog.channels.filter(
      (c) =>
        c.countryCode === countryCode ||
        c.country.toLowerCase() === country.toLowerCase()
    );
    const matchingTv = countryTv.filter(
      (c) => categories.length === 0 || categories.includes(c.mediaCategory)
    );
    const tvFeed = (matchingTv.length > 0 ? matchingTv : countryTv).slice(0, 12);

    res.json({
      tvChannels: tvFeed.length > 0 ? tvFeed : catalog.channels.slice(0, 12),
      youtubeVideos: youtubeItems,
      musicTracks,
      radioStations:
        localRadio.length > 0
          ? localRadio
          : await fetchRadioStationsFromMirrors({ limit: 8 }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to build IP & Interests feed' });
  }
});

// 10. Unified All Media Categories Hub
app.get('/api/media/hub', rateLimit(180, 'hub'), async (req, res) => {
  try {
    const category = String(req.query.category || 'all').toLowerCase();
    const country = String(req.query.country || '').trim();
    const q = String(req.query.q || '').trim();
    const catDef = CATEGORY_MAP.get(category) || MEDIA_CATEGORIES[0];

    const [catalog, youtube, music, radio] = await Promise.all([
      getWorldTVCatalog(),
      searchYouTubeVideos({ q, category, country, limit: 8 }),
      searchDeezerTracks(q || `${catDef.musicGenre} ${country}`.trim(), 8),
      fetchRadioStationsFromMirrors({
        country: country || undefined,
        genre: catDef.radioTag,
        q: q || undefined,
        limit: 8,
      }),
    ]);

    const tvChannels = catalog.channels
      .filter((ch) => {
        if (category !== 'all' && ch.mediaCategory !== category) return false;
        if (
          country &&
          ch.country.toLowerCase() !== country.toLowerCase() &&
          ch.countryCode.toLowerCase() !== country.toLowerCase()
        ) {
          return false;
        }
        if (q && !ch.name.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .slice(0, 12);

    res.json({
      category: catDef,
      tvChannels,
      youtubeVideos: youtube,
      musicTracks: music,
      radioStations: radio,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load Media Hub' });
  }
});

// ---------------------------------------------------------------------------
// Server Bootstrap (Vite dev middleware or Production dist/)
// ---------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KEZA Global Stream server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
