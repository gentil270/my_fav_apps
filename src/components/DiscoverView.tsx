import React, { useEffect, useState } from 'react';
import {
  Play,
  Tv,
  Youtube,
  Radio,
  Globe,
  Bookmark,
  HardDrive,
  Grid,
  WifiOff,
  ArrowRight,
} from 'lucide-react';
import {
  NavView,
  OfflineRadioClip,
  RadioStation,
  TVChannel,
  TrackItem,
} from '../types';
import { TheaterTarget } from './MediaTheaterModal';
import { PWAInstallButton } from './PWAInstallButton';

interface DiscoverViewProps {
  onNavigate: (view: NavView) => void;
  onPlayTrack: (track: TrackItem, queue?: TrackItem[]) => void;
  onPlayRadio: (station: RadioStation) => void;
  onOpenTheater: (target: TheaterTarget) => void;
  offlineClips: OfflineRadioClip[];
}

interface DiscoverPayload {
  stats?: {
    tvChannels: number;
    tvCountries: number;
    categories: number;
  };
  trendingTracks: TrackItem[];
  featuredRadio: RadioStation[];
  featuredTV: TVChannel[];
}

const CACHE_KEY = 'keza_discover_cache_v1';

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  onNavigate,
  onPlayTrack,
  onPlayRadio,
  onOpenTheater,
  offlineClips,
}) => {
  const [data, setData] = useState<DiscoverPayload | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!data);

  useEffect(() => {
    let active = true;
    fetch('/api/music/discover')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active || !json) return;
        setData(json);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(json));
        } catch {
          // ignore storage quota errors
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const offlineStationIds = new Set(offlineClips.map((c) => c.stationId));

  const quickLaunches: Array<{
    view: NavView;
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { view: 'hub', title: 'All Media Hub', subtitle: '17 unified categories', icon: Grid },
    { view: 'tv', title: 'World TV', subtitle: 'Global live HLS channels', icon: Tv },
    { view: 'youtube', title: 'YouTube Songs', subtitle: 'Music, concerts & clips', icon: Youtube },
    { view: 'pins', title: 'Spotify & Audiomack', subtitle: 'Masonry audio pinboard', icon: Bookmark },
    { view: 'ip', title: 'IP & Interests', subtitle: 'Local radar & custom feed', icon: Globe },
    { view: 'radio', title: 'Online / Offline Radio', subtitle: `${offlineClips.length} saved offline`, icon: Radio },
    { view: 'drive', title: 'Google Drive Vault', subtitle: 'Cloud audio, video & backups', icon: HardDrive },
  ];

  return (
    <div className="space-y-10">
      {/* Studio Editorial Hero */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#111827] overflow-hidden grid lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-6 p-7 lg:p-10 flex flex-col justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-amber-400">
              KEZA Global Stream
            </p>
            <h1 className="mt-2.5 text-3xl sm:text-4xl font-bold tracking-tight text-slate-50 text-balance leading-[1.12]">
              World Television, YouTube Music, Offline Radio & Google Drive in One Studio
            </h1>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed max-w-xl">
              Explore live broadcasts across {data?.stats?.tvCountries || 180}+ countries, stream
              curated YouTube music and concerts across 17 media categories, save global radio
              directly to your device for offline listening, and play your personal Google Drive
              media archive.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('hub')}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors cursor-pointer"
            >
              <span>Explore All Media Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('drive')}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 hover:bg-white/[0.06] px-4 py-2.5 text-xs font-medium text-slate-100 transition-colors cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
              <span>Open Google Drive Vault</span>
            </button>
            <PWAInstallButton variant="inline" />
          </div>
        </div>

        <div className="lg:col-span-6 relative min-h-[260px]">
          <img
            src="/src/assets/images/hero_umutuzo_studio_1795424585457.jpg"
            alt="KEZA Global Stream broadcast studio"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090D16]/80 via-[#090D16]/20 to-transparent" />
        </div>
      </section>

      {/* Quick Launch Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Media Workspaces</h2>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {data?.stats?.tvChannels?.toLocaleString() || '12,000+'} channels ·{' '}
            {data?.stats?.categories || 17} categories
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickLaunches.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => onNavigate(item.view)}
                className="group text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-4 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <Icon className="w-5 h-5 text-amber-400" />
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-300 transition-colors" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-100">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-400">{item.subtitle}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Live Country Radio Stations (Online + Offline Status) */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Live Global Radio Stations
            </h2>
            <p className="text-xs text-slate-400">
              Stations automatically cache a playable offline copy while you listen
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('radio')}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            Open Radio Vault →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(data?.featuredRadio || []).slice(0, 8).map((station) => {
            const isOfflineReady = offlineStationIds.has(station.id);
            return (
              <button
                key={station.id}
                type="button"
                onClick={() => onPlayRadio(station)}
                className="text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-4 transition-colors flex items-start gap-3 cursor-pointer"
              >
                <img
                  src={
                    station.favicon ||
                    '/src/assets/images/cover_global_radio_1795424586587.jpg'
                  }
                  alt={station.name}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-lg object-cover bg-slate-900 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">
                    {station.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-400 truncate">
                    {station.country} · {station.bitrate || 128} kbps
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-amber-400 flex items-center gap-1">
                    {isOfflineReady ? (
                      <>
                        <WifiOff className="w-3 h-3" />
                        <span>LIVE & OFFLINE</span>
                      </>
                    ) : (
                      <span>Live Stream</span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured World TV */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Featured World TV</h2>
          <button
            type="button"
            onClick={() => onNavigate('tv')}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            Browse All Channels →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(data?.featuredTV || []).slice(0, 8).map((channel) => (
            <button
              key={channel.id}
              type="button"
              onClick={() =>
                onOpenTheater({
                  type: 'tv',
                  channel,
                  playlist: data?.featuredTV || [],
                })
              }
              className="text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-4 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 truncate">
                  {channel.country} · {channel.mediaCategory}
                </span>
                <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-100 truncate">
                {channel.name}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Trending Music */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Trending Music & Sessions</h2>
          <button
            type="button"
            onClick={() => onNavigate('pins')}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            Open Spotify & Audiomack Pins →
          </button>
        </div>

        {loading && !data ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-44 rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(data?.trendingTracks || []).slice(0, 6).map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => onPlayTrack(track, data?.trendingTracks || [])}
                className="group text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 overflow-hidden transition-colors cursor-pointer"
              >
                <div className="aspect-square relative bg-slate-900">
                  <img
                    src={track.coverUrl}
                    alt={track.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="w-10 h-10 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </span>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-100 truncate">
                    {track.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                    {track.artist}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
