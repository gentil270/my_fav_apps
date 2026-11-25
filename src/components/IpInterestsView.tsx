import React, { useEffect, useState } from 'react';
import { Globe, Play, Radio, Tv, Youtube, Music, RefreshCw, Plus, X } from 'lucide-react';
import { MEDIA_CATEGORIES, POPULAR_COUNTRIES } from '../constants/mediaCategories';
import {
  IpContextInfo,
  RadioStation,
  TVChannel,
  TrackItem,
  UserInterestsProfile,
  YouTubeVideoItem,
} from '../types';
import { TheaterTarget } from './MediaTheaterModal';

interface IpInterestsViewProps {
  interests: UserInterestsProfile;
  onUpdateInterests: (next: UserInterestsProfile) => void;
  onPlayTrack: (track: TrackItem, queue?: TrackItem[]) => void;
  onPlayRadio: (station: RadioStation) => void;
  onOpenTheater: (target: TheaterTarget) => void;
}

const GENRE_CHOICES = [
  'Afrobeats',
  'Hip-Hop',
  'Pop',
  'R&B',
  'Jazz',
  'Electronic',
  'Gospel',
  'Acoustic',
  'Reggae',
  'Classical',
];

export const IpInterestsView: React.FC<IpInterestsViewProps> = ({
  interests,
  onUpdateInterests,
  onPlayTrack,
  onPlayRadio,
  onOpenTheater,
}) => {
  const [ipCtx, setIpCtx] = useState<IpContextInfo | null>(null);
  const [ipInput, setIpInput] = useState('');
  const [ipError, setIpError] = useState('');
  const [loadingIp, setLoadingIp] = useState(true);
  const [topicInput, setTopicInput] = useState('');

  const [tvChannels, setTvChannels] = useState<TVChannel[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideoItem[]>([]);
  const [musicTracks, setMusicTracks] = useState<TrackItem[]>([]);
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);

  const loadIpContext = async (customIp?: string) => {
    setLoadingIp(true);
    setIpError('');
    try {
      const url = customIp
        ? `/api/ip/context?ip=${encodeURIComponent(customIp.trim())}`
        : '/api/ip/context';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setIpError(data.error || 'Could not inspect IP address.');
        return;
      }
      setIpCtx(data);
    } catch {
      setIpError('Network error while checking IP context.');
    } finally {
      setLoadingIp(false);
    }
  };

  useEffect(() => {
    loadIpContext();
  }, []);

  useEffect(() => {
    if (!ipCtx) return;
    let active = true;
    setLoadingFeed(true);
    const params = new URLSearchParams({
      countryCode: ipCtx.countryCode,
      country: ipCtx.country,
      categories: interests.categories.join(','),
      genres: interests.genres.join(','),
      topics: interests.topics.join(','),
    });

    fetch(`/api/ip/interests-feed?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active || !json) return;
        setTvChannels(json.tvChannels || []);
        setYoutubeVideos(json.youtubeVideos || []);
        setMusicTracks(json.musicTracks || []);
        setRadioStations(json.radioStations || []);
      })
      .finally(() => {
        if (active) setLoadingFeed(false);
      });

    return () => {
      active = false;
    };
  }, [ipCtx, interests]);

  const toggleCategory = (catId: string) => {
    const exists = interests.categories.includes(catId);
    const next = exists
      ? interests.categories.filter((c) => c !== catId)
      : [...interests.categories, catId].slice(0, 6);
    onUpdateInterests({ ...interests, categories: next });
  };

  const toggleGenre = (genre: string) => {
    const exists = interests.genres.includes(genre);
    const next = exists
      ? interests.genres.filter((g) => g !== genre)
      : [...interests.genres, genre].slice(0, 5);
    onUpdateInterests({ ...interests, genres: next });
  };

  const addTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = topicInput.trim();
    if (!cleaned || interests.topics.includes(cleaned)) return;
    onUpdateInterests({
      ...interests,
      topics: [...interests.topics, cleaned].slice(0, 8),
    });
    setTopicInput('');
  };

  return (
    <div className="space-y-8">
      {/* IP & Network Radar Card */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#111827] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
              <Globe className="w-4 h-4" />
              <span>Public IP & Network Radar</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-50">
              IP Location & Media Interests
            </h1>
            {ipCtx && (
              <p className="mt-1.5 text-xs text-slate-300 font-mono tabular-nums">
                {ipCtx.ip} · {ipCtx.city ? `${ipCtx.city}, ` : ''}
                {ipCtx.country} ({ipCtx.countryCode}) · {ipCtx.timezone} · {ipCtx.isp}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (ipInput.trim()) loadIpContext(ipInput);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="Inspect public IP (e.g. 8.8.8.8)"
                className="rounded-lg border border-white/10 bg-[#090D16] px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 w-52 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loadingIp}
                className="rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
              >
                Lookup IP
              </button>
            </form>

            <select
              value={ipCtx?.countryCode || ''}
              onChange={(e) => {
                const chosen = POPULAR_COUNTRIES.find((c) => c.code === e.target.value);
                if (chosen && chosen.code && ipCtx) {
                  setIpCtx({
                    ...ipCtx,
                    country: chosen.name,
                    countryCode: chosen.code,
                    city: '',
                  });
                }
              }}
              aria-label="Preview country"
              className="rounded-lg border border-white/10 bg-[#090D16] px-3 py-2 text-xs text-slate-200"
            >
              <option value="">Preview Country...</option>
              {POPULAR_COUNTRIES.filter((c) => c.code).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setIpInput('');
                loadIpContext();
              }}
              className="p-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.05] cursor-pointer"
              title="Detect my IP again"
            >
              <RefreshCw className={`w-4 h-4 ${loadingIp ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {ipError && (
          <p className="mt-3 text-xs text-red-400 font-medium">{ipError}</p>
        )}

        {/* Interests Customizer */}
        <div className="mt-6 pt-6 border-t border-white/[0.08] grid lg:grid-cols-3 gap-6">
          <div>
            <p className="text-xs font-semibold text-slate-200 mb-2">
              TV & Video Categories ({interests.categories.length}/6)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MEDIA_CATEGORIES.filter((c) => c.id !== 'all').map((cat) => {
                const active = interests.categories.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-[#090D16] border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {cat.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-200 mb-2">
              Music Genres ({interests.genres.length}/5)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {GENRE_CHOICES.map((g) => {
                const active = interests.genres.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGenre(g)}
                    className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-[#090D16] border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-200 mb-2">Custom Interest Topics</p>
            <form onSubmit={addTopic} className="flex items-center gap-2 mb-2.5">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="Add topic (e.g. Kigali Jazz)..."
                className="flex-1 rounded-lg border border-white/10 bg-[#090D16] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-xs font-medium text-slate-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {interests.topics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() =>
                    onUpdateInterests({
                      ...interests,
                      topics: interests.topics.filter((t) => t !== topic),
                    })
                  }
                  className="inline-flex items-center gap-1 rounded bg-[#090D16] border border-white/10 px-2.5 py-1 text-xs text-slate-200 hover:border-red-400/40 cursor-pointer"
                >
                  <span>{topic}</span>
                  <X className="w-3 h-3 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Personalized Feed */}
      {loadingFeed ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-36 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Tv className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-slate-100">
                Live TV for {ipCtx?.country || 'Your Region'}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {tvChannels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() =>
                    onOpenTheater({ type: 'tv', channel: ch, playlist: tvChannels })
                  }
                  className="text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-4 cursor-pointer"
                >
                  <p className="text-xs text-slate-400 truncate">
                    {ch.country} · {ch.mediaCategory}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-100 truncate">{ch.name}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Youtube className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-slate-100">YouTube for Your Interests</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {youtubeVideos.map((vid) => (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => onOpenTheater({ type: 'youtube', video: vid })}
                  className="text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 overflow-hidden cursor-pointer"
                >
                  <img
                    src={vid.thumbnailUrl}
                    alt={vid.title}
                    referrerPolicy="no-referrer"
                    className="w-full aspect-video object-cover"
                  />
                  <div className="p-3">
                    <p className="text-xs font-semibold text-slate-100 line-clamp-2">{vid.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400 truncate">{vid.channelTitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Music className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-slate-100">Music Matching Your Genres</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {musicTracks.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => onPlayTrack(tr, musicTracks)}
                  className="text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-3 flex items-center gap-2.5 cursor-pointer"
                >
                  <img
                    src={tr.coverUrl}
                    alt={tr.title}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-100 truncate">{tr.title}</p>
                    <p className="text-[11px] text-slate-400 truncate">{tr.artist}</p>
                  </div>
                  <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-slate-100">
                Local & Regional FM Radio
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {radioStations.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onPlayRadio(st)}
                  className="text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-3.5 cursor-pointer"
                >
                  <p className="text-xs font-semibold text-slate-100 truncate">{st.name}</p>
                  <p className="mt-1 text-[11px] text-slate-400 truncate">
                    {st.country} · {st.bitrate || 128} kbps
                  </p>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
