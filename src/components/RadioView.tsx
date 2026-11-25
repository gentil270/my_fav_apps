import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Play,
  Radio,
  Search,
  Square,
  Trash2,
  WifiOff,
  HardDrive,
} from 'lucide-react';
import { POPULAR_COUNTRIES } from '../constants/mediaCategories';
import { OfflineRadioClip, RadioStation } from '../types';
import {
  captureLiveStationForOffline,
  clearOfflineRadioVault,
  deleteOfflineRadioClip,
} from '../utils/offlineRadioStore';

interface RadioViewProps {
  offlineClips: OfflineRadioClip[];
  onRefreshOfflineClips: () => Promise<void>;
  onPlayRadio: (station: RadioStation) => void;
  onPlayOfflineClip: (clip: OfflineRadioClip, queue?: OfflineRadioClip[]) => void;
  onUploadClipToDrive?: (clip: OfflineRadioClip) => void;
}

const RADIO_GENRES = ['all', 'afrobeats', 'jazz', 'news', 'electronic', 'pop', 'hiphop', 'gospel', 'chill'];
const RADIO_DIR_CACHE = 'keza_radio_directory_cache_v1';

export const RadioView: React.FC<RadioViewProps> = ({
  offlineClips,
  onRefreshOfflineClips,
  onPlayRadio,
  onPlayOfflineClip,
}) => {
  const [tab, setTab] = useState<'online' | 'vault'>('online');
  const [country, setCountry] = useState('');
  const [genre, setGenre] = useState('all');
  const [query, setQuery] = useState('');
  const [stations, setStations] = useState<RadioStation[]>(() => {
    try {
      const c = localStorage.getItem(RADIO_DIR_CACHE);
      return c ? JSON.parse(c).stations || [] : [];
    } catch {
      return [];
    }
  });
  const [mixes, setMixes] = useState<RadioStation[]>(() => {
    try {
      const c = localStorage.getItem(RADIO_DIR_CACHE);
      return c ? JSON.parse(c).mixes || [] : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(stations.length === 0);

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordProgress, setRecordProgress] = useState<{ bytes: number; sec: number }>({
    bytes: 0,
    sec: 0,
  });
  const abortRef = useRef<AbortController | null>(null);
  const [syncingPack, setSyncingPack] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const loadStations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (country) params.set('country', country);
      if (genre !== 'all') params.set('genre', genre);
      if (query.trim()) params.set('q', query.trim());

      const res = await fetch(`/api/radio/stations?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setStations(json.stations || []);
      setMixes(json.mixes || []);
      try {
        localStorage.setItem(
          RADIO_DIR_CACHE,
          JSON.stringify({ stations: json.stations || [], mixes: json.mixes || [] })
        );
      } catch {
        // ignore storage quota
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStations();
  }, [country, genre]);

  const offlineStationIds = new Set(offlineClips.map((c) => c.stationId));
  const totalVaultBytes = offlineClips.reduce((acc, c) => acc + (c.sizeBytes || 0), 0);

  const handleSaveOffline = async (station: RadioStation) => {
    if (recordingId) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRecordingId(station.id);
    setRecordProgress({ bytes: 0, sec: 0 });
    setStatusMessage('');

    try {
      const clip = await captureLiveStationForOffline(station, {
        maxBytes: station.isMix ? 3_500_000 : 1_200_000,
        maxDurationMs: station.isMix ? 35_000 : 25_000,
        signal: ctrl.signal,
        onProgress: (bytes, sec) => setRecordProgress({ bytes, sec }),
      });
      await onRefreshOfflineClips();
      setStatusMessage(`Saved "${clip.title}" (${Math.round(clip.sizeBytes / 1024)} KB) for offline radio.`);
    } catch (err: any) {
      setStatusMessage(err?.message || 'Could not capture audio from this station.');
    } finally {
      setRecordingId(null);
      abortRef.current = null;
    }
  };

  const handleStopAndKeep = () => {
    abortRef.current?.abort();
  };

  const handleSyncOfflinePack = async () => {
    if (syncingPack) return;
    setSyncingPack(true);
    setStatusMessage('Downloading starter offline mixes and radio captures...');
    let saved = 0;
    const candidates = [...mixes.slice(0, 3), ...stations.slice(0, 2)].slice(0, 4);
    for (const item of candidates) {
      if (offlineStationIds.has(item.id)) continue;
      try {
        await captureLiveStationForOffline(item, {
          maxBytes: item.isMix ? 1_200_000 : 400_000,
          maxDurationMs: 10_000,
        });
        saved += 1;
      } catch {
        // continue
      }
    }
    await onRefreshOfflineClips();
    setSyncingPack(false);
    setStatusMessage(
      saved > 0
        ? `Synced ${saved} new radio sessions to your Offline Vault.`
        : 'Your Offline Radio Vault is already up to date.'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">
            Global Radio (Online & Offline)
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Stream live FM radio online, record broadcasts directly into device storage, and stream
            continuously with zero internet connection
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111827] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setTab('online')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                tab === 'online'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Live Stations & Mixes
            </button>
            <button
              type="button"
              onClick={() => setTab('vault')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                tab === 'vault'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Offline Vault ({offlineClips.length})
            </button>
          </div>

          <button
            type="button"
            disabled={syncingPack}
            onClick={handleSyncOfflinePack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111827] hover:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>{syncingPack ? 'Syncing...' : 'Sync Offline Pack'}</span>
          </button>

          {offlineClips.length > 0 && (
            <button
              type="button"
              onClick={() => onPlayOfflineClip(offlineClips[0], offlineClips)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>Stream Offline Radio</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
          {statusMessage}
        </div>
      )}

      {tab === 'online' ? (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {RADIO_GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenre(g)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap shrink-0 cursor-pointer ${
                    genre === g
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-[#111827] border border-white/[0.08] text-slate-300 hover:text-white'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadStations();
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-label="Filter radio by country"
                className="rounded-lg border border-white/10 bg-[#111827] px-3 py-2 text-xs text-slate-200"
              >
                {POPULAR_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.name === 'All Countries' ? '' : c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search station name..."
                  className="rounded-lg border border-white/10 bg-[#111827] pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 w-48 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-medium text-slate-100 cursor-pointer"
              >
                Search
              </button>
            </form>
          </div>

          {/* Live FM Stations */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-3">
              Live FM & Internet Radio
            </h2>
            {loading && stations.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stations.map((st) => {
                  const isRecording = recordingId === st.id;
                  const isSaved = offlineStationIds.has(st.id);
                  return (
                    <div
                      key={st.id}
                      className="rounded-xl border border-white/[0.08] bg-[#111827] p-4 flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => onPlayRadio(st)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <img
                          src={
                            st.favicon ||
                            '/src/assets/images/cover_global_radio_1795424586587.jpg'
                          }
                          alt={st.name}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-lg object-cover bg-slate-900 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{st.name}</p>
                          <p className="text-xs text-slate-400 truncate">
                            {st.country} · {st.codec || 'MP3'} · {st.bitrate || 128} kbps
                          </p>
                          <p className="text-[11px] font-medium text-amber-400">
                            {isSaved ? 'LIVE & OFFLINE' : 'Live Broadcast'}
                          </p>
                        </div>
                      </button>

                      {isRecording ? (
                        <button
                          type="button"
                          onClick={handleStopAndKeep}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 hover:bg-red-500 px-2.5 py-1.5 text-[11px] font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>
                            Save Now ({recordProgress.sec}s ·{' '}
                            {Math.round(recordProgress.bytes / 1024)}KB)
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(recordingId)}
                          onClick={() => handleSaveOffline(st)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 hover:bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                        >
                          <Download className="w-3.5 h-3.5 text-amber-400" />
                          <span>Save Offline</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Full-Length Radio Mixes */}
          <section>
            <h2 className="text-base font-semibold text-slate-100 mb-3">
              Full-Length Radio Mixes & Sessions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {mixes.map((mix) => {
                const isSaved = offlineStationIds.has(mix.id);
                const isRecording = recordingId === mix.id;
                return (
                  <div
                    key={mix.id}
                    className="rounded-xl border border-white/[0.08] bg-[#111827] p-4 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onPlayRadio(mix)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <img
                        src={
                          mix.favicon ||
                          '/src/assets/images/cover_global_radio_1795424586587.jpg'
                        }
                        alt={mix.name}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{mix.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {mix.tags.join(' · ')}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(recordingId)}
                      onClick={() => handleSaveOffline(mix)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 hover:bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isRecording ? 'Caching...' : isSaved ? 'Saved' : 'Save Mix'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        /* Offline Vault Tab */
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#111827] p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  Device Offline Radio Storage
                </p>
                <p className="text-xs font-mono tabular-nums text-slate-400">
                  {offlineClips.length} saved broadcasts ·{' '}
                  {(totalVaultBytes / (1024 * 1024)).toFixed(2)} MB stored in IndexedDB
                </p>
              </div>
            </div>

            {offlineClips.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await clearOfflineRadioVault();
                  await onRefreshOfflineClips();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Vault</span>
              </button>
            )}
          </div>

          {offlineClips.length === 0 ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#111827] p-10 text-center">
              <Radio className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="mt-2 text-sm font-medium text-slate-200">
                No offline radio captures yet
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Click Sync Offline Pack or Save Offline on any live station to listen without
                internet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {offlineClips.map((clip) => (
                <div
                  key={clip.id}
                  className="rounded-xl border border-white/[0.08] bg-[#111827] p-4 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onPlayOfflineClip(clip, offlineClips)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{clip.title}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {clip.subtitle} · {Math.round(clip.sizeBytes / 1024)} KB
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await deleteOfflineRadioClip(clip.id);
                      await onRefreshOfflineClips();
                    }}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                    aria-label={`Delete ${clip.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
