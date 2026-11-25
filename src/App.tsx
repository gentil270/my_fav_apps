/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Menu,
  Search,
  HardDrive,
  X,
  Play,
  Trash2,
  LogOut,
} from 'lucide-react';
import {
  NavView,
  OfflineRadioClip,
  PinboardItem,
  RadioStation,
  TrackItem,
  UserInterestsProfile,
} from './types';
import {
  clearAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './services/googleAuth';
import {
  captureLiveStationForOffline,
  getOfflineClipById,
  getOfflineClipByStationId,
  listOfflineRadioClips,
  seedStarterOfflineRadioPack,
} from './utils/offlineRadioStore';
import { Sidebar } from './components/Sidebar';
import { PlayerBar } from './components/PlayerBar';
import { MediaTheaterModal, TheaterTarget } from './components/MediaTheaterModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { DiscoverView } from './components/DiscoverView';
import { MediaHubView } from './components/MediaHubView';
import { WorldTVView } from './components/WorldTVView';
import { YouTubeView } from './components/YouTubeView';
import { PinboardView } from './components/PinboardView';
import { IpInterestsView } from './components/IpInterestsView';
import { RadioView } from './components/RadioView';
import { GoogleDriveView } from './components/GoogleDriveView';

const SAVED_PINS_KEY = 'keza_saved_pins_v1';
const LIKED_TRACKS_KEY = 'keza_liked_tracks_v1';
const INTERESTS_KEY = 'keza_ip_interests_v1';

const DEFAULT_INTERESTS: UserInterestsProfile = {
  categories: ['music', 'news', 'documentary'],
  genres: ['Afrobeats', 'Jazz', 'Acoustic'],
  topics: ['live concerts', 'world news', 'east africa music'],
};

function resolveInitialView(): NavView {
  const params = new URLSearchParams(window.location.search);
  const v = (params.get('view') || '').toLowerCase();
  if (v === 'tv') return 'tv';
  if (v === 'youtube' || v === 'yt') return 'youtube';
  if (v === 'media' || v === 'hub') return 'hub';
  if (v === 'ip' || v === 'interests') return 'ip';
  if (v === 'pinboard' || v === 'pins') return 'pins';
  if (v === 'radio') return 'radio';
  if (v === 'drive') return 'drive';
  return 'discover';
}

const VIEW_TITLES: Record<NavView, string> = {
  discover: 'Discover',
  hub: 'All Media Hub',
  tv: 'World Live TV',
  youtube: 'YouTube Songs & Videos',
  pins: 'Spotify & Audiomack Pins',
  ip: 'IP & Interests',
  radio: 'Global Radio (Online & Offline)',
  drive: 'Google Drive Media Vault',
};

export default function App() {
  const [activeView, setActiveView] = useState<NavView>(resolveInitialView);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Google Drive / Firebase Auth State
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState('');

  // Persisted Local User Data
  const [savedPins, setSavedPins] = useState<PinboardItem[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_PINS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [likedTracks, setLikedTracks] = useState<TrackItem[]>(() => {
    try {
      const raw = localStorage.getItem(LIKED_TRACKS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [interests, setInterests] = useState<UserInterestsProfile>(() => {
    try {
      const raw = localStorage.getItem(INTERESTS_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_INTERESTS;
    } catch {
      return DEFAULT_INTERESTS;
    }
  });

  // Offline Radio Vault State
  const [offlineClips, setOfflineClips] = useState<OfflineRadioClip[]>([]);

  // Audio Player State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const [queue, setQueue] = useState<TrackItem[]>([]);
  const [currentTrack, setCurrentTrack] = useState<TrackItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  // Overlays & Search
  const [theaterTarget, setTheaterTarget] = useState<TheaterTarget | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [lyricsModal, setLyricsModal] = useState<{
    open: boolean;
    loading: boolean;
    text: string;
  }>({ open: false, loading: false, text: '' });

  const [globalSearch, setGlobalSearch] = useState('');
  const [searchResults, setSearchResults] = useState<TrackItem[] | null>(null);
  const [searching, setSearching] = useState(false);

  const refreshOfflineClips = useCallback(async () => {
    const clips = await listOfflineRadioClips();
    setOfflineClips(clips);
  }, []);

  // Initialize Firebase Auth & Listen for Auth Changes
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
        setAuthError('');
      },
      (maybeUser) => {
        setUser(maybeUser);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Load Offline Vault & Seed Starter Offline Radio Pack when online
  useEffect(() => {
    refreshOfflineClips();
    if (navigator.onLine) {
      fetch('/api/radio/stations?limit=6')
        .then((r) => (r.ok ? r.json() : null))
        .then(async (json) => {
          if (!json) return;
          const all = [...(json.mixes || []), ...(json.stations || [])];
          const added = await seedStarterOfflineRadioPack(all);
          if (added > 0) {
            await refreshOfflineClips();
          }
        })
        .catch(() => {});
    }
  }, [refreshOfflineClips]);

  // Persist local collections
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_PINS_KEY, JSON.stringify(savedPins));
    } catch {}
  }, [savedPins]);

  useEffect(() => {
    try {
      localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(likedTracks));
    } catch {}
  }, [likedTracks]);

  useEffect(() => {
    try {
      localStorage.setItem(INTERESTS_KEY, JSON.stringify(interests));
    } catch {}
  }, [interests]);

  const handleSelectView = (view: NavView) => {
    setActiveView(view);
    setSearchResults(null);
    const url = new URL(window.location.href);
    if (view === 'discover') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    window.history.replaceState({}, '', url.toString());
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError('');
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Google sign-in could not be completed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
  };

  const handleAuthExpired = () => {
    clearAccessToken();
    setNeedsAuth(true);
  };

  const revokePreviousObjectUrl = () => {
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
  };

  const startAudioTrack = useCallback(
    async (track: TrackItem, nextQueue?: TrackItem[]) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (nextQueue && nextQueue.length > 0) {
        setQueue(nextQueue);
      } else {
        setQueue((prev) =>
          prev.some((t) => t.id === track.id) ? prev : [track, ...prev.slice(0, 24)]
        );
      }

      setCurrentTrack(track);
      setIsBuffering(true);
      setCurrentTime(0);
      setDuration(track.durationSec || 0);

      revokePreviousObjectUrl();

      let playableSrc = track.audioUrl;

      // Resolve IndexedDB Blob when offline or playing from offline vault
      if (track.offlineId || (!navigator.onLine && track.source === 'radio')) {
        const clip = track.offlineId
          ? await getOfflineClipById(track.offlineId)
          : await getOfflineClipByStationId(track.id);
        if (clip?.blob) {
          const objUrl = URL.createObjectURL(clip.blob);
          activeObjectUrlRef.current = objUrl;
          playableSrc = objUrl;
        }
      }

      if (track.source === 'drive' && track.audioUrl.startsWith('blob:')) {
        activeObjectUrlRef.current = track.audioUrl;
      }

      audio.src = playableSrc;
      audio.volume = isMuted ? 0 : volume;

      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        // Offline fallback if live stream drops
        const fallbackClip = await getOfflineClipByStationId(track.id);
        if (fallbackClip?.blob) {
          const objUrl = URL.createObjectURL(fallbackClip.blob);
          activeObjectUrlRef.current = objUrl;
          audio.src = objUrl;
          await audio.play().catch(() => {});
          setIsPlaying(true);
        } else {
          setIsPlaying(false);
        }
      } finally {
        setIsBuffering(false);
      }
    },
    [isMuted, volume]
  );

  const handlePlayRadio = useCallback(
    async (station: RadioStation) => {
      const track: TrackItem = {
        id: station.id,
        title: station.name,
        artist: `${station.country} · ${station.codec || 'MP3'}`,
        coverUrl:
          station.favicon || '/src/assets/images/cover_global_radio_1795424586587.jpg',
        audioUrl: station.streamUrl,
        source: navigator.onLine ? 'radio' : 'offline-radio',
        country: station.country,
        isLive: !station.isMix,
        durationSec: station.durationSec,
      };
      await startAudioTrack(track);

      // Auto-capture playable offline copy in background when online
      if (navigator.onLine) {
        const existing = await getOfflineClipByStationId(station.id);
        if (!existing) {
          captureLiveStationForOffline(station, {
            maxBytes: station.isMix ? 900_000 : 350_000,
            maxDurationMs: 8_500,
          })
            .then(() => refreshOfflineClips())
            .catch(() => {});
        }
      }
    },
    [refreshOfflineClips, startAudioTrack]
  );

  const handlePlayOfflineClip = useCallback(
    async (clip: OfflineRadioClip, list?: OfflineRadioClip[]) => {
      const toTrack = (c: OfflineRadioClip): TrackItem => ({
        id: c.stationId || c.id,
        offlineId: c.id,
        title: c.title,
        artist: `${c.country} · Offline Radio Vault`,
        coverUrl: c.coverUrl || '/src/assets/images/cover_global_radio_1795424586587.jpg',
        audioUrl: '',
        durationSec: c.durationSec,
        source: 'offline-radio',
      });
      const mappedQueue = (list || offlineClips).map(toTrack);
      await startAudioTrack(toTrack(clip), mappedQueue);
    },
    [offlineClips, startAudioTrack]
  );

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleSkip = (delta: number) => {
    if (!currentTrack || queue.length === 0) return;
    const idx = queue.findIndex(
      (t) => t.id === currentTrack.id && t.offlineId === currentTrack.offlineId
    );
    const nextIdx = idx === -1 ? 0 : (idx + delta + queue.length) % queue.length;
    startAudioTrack(queue[nextIdx], queue);
  };

  const handleOpenTheater = (target: TheaterTarget) => {
    // Pause background audio when launching video/TV theater
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setTheaterTarget(target);
  };

  const handleToggleLike = () => {
    if (!currentTrack) return;
    setLikedTracks((prev) => {
      const exists = prev.some((t) => t.id === currentTrack.id);
      return exists ? prev.filter((t) => t.id !== currentTrack.id) : [currentTrack, ...prev];
    });
  };

  const handleToggleSavePin = (pin: PinboardItem) => {
    setSavedPins((prev) => {
      const exists = prev.some((p) => p.id === pin.id);
      return exists ? prev.filter((p) => p.id !== pin.id) : [pin, ...prev];
    });
  };

  const handleOpenLyrics = async () => {
    if (!currentTrack) return;
    setLyricsModal({ open: true, loading: true, text: '' });
    try {
      const res = await fetch(
        `/api/music/lyrics?artist=${encodeURIComponent(currentTrack.artist)}&title=${encodeURIComponent(
          currentTrack.title
        )}`
      );
      const json = await res.json();
      setLyricsModal({
        open: true,
        loading: false,
        text: json.lyrics || 'No lyrics available for this audio stream.',
      });
    } catch {
      setLyricsModal({ open: true, loading: false, text: 'Could not load lyrics.' });
    }
  };

  const handleGlobalSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = globalSearch.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.tracks || []);
      }
    } finally {
      setSearching(false);
    }
  };

  const isLiked = currentTrack ? likedTracks.some((t) => t.id === currentTrack.id) : false;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#090D16] text-slate-100">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          activeView={activeView}
          onSelectView={handleSelectView}
          offlineCount={offlineClips.length}
          driveConnected={!needsAuth}
          isOpenMobile={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Top Header Bar (3-zone contract) */}
          <header className="h-16 shrink-0 border-b border-white/[0.08] bg-[#090D16]/95 px-4 lg:px-6 flex items-center justify-between gap-6">
            {/* Zone 1: Menu + Context Title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06]"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="text-sm font-semibold text-slate-100 whitespace-nowrap truncate">
                {VIEW_TITLES[activeView]}
              </span>
            </div>

            {/* Zone 2: Quick Global Music Search */}
            <form
              onSubmit={handleGlobalSearchSubmit}
              className="hidden md:flex items-center flex-1 max-w-md relative"
            >
              <Search className="w-4 h-4 text-slate-400 absolute left-3" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  if (!e.target.value.trim()) setSearchResults(null);
                }}
                placeholder="Search songs, artists, or podcasts..."
                className="w-full rounded-lg border border-white/10 bg-[#111827] pl-9 pr-8 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setGlobalSearch('');
                    setSearchResults(null);
                  }}
                  className="absolute right-2.5 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            {/* Zone 3: 1 Primary Google Drive Account Action */}
            <div className="flex items-center gap-2 shrink-0">
              {needsAuth ? (
                <GoogleSignInButton
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  label={isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectView('drive')}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#111827] hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                    <span className="max-w-[150px] truncate">
                      {user?.displayName || user?.email || 'Drive Vault'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                    title="Sign out of Google"
                    aria-label="Sign out of Google"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Main Scrollable Viewport */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-8">
            {authError && (
              <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between">
                <span>{authError}</span>
                <button
                  type="button"
                  onClick={() => setAuthError('')}
                  className="text-red-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {searchResults !== null ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-100">
                    Search Results for &ldquo;{globalSearch}&rdquo;
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSearchResults(null)}
                    className="text-xs text-amber-400 hover:underline cursor-pointer"
                  >
                    Back to {VIEW_TITLES[activeView]}
                  </button>
                </div>

                {searching ? (
                  <p className="text-xs text-slate-400">Searching across music catalogs...</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-xs text-slate-400">No matching tracks found.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {searchResults.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => startAudioTrack(track, searchResults)}
                        className="text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-3 flex items-center gap-3 cursor-pointer"
                      >
                        <img
                          src={track.coverUrl}
                          alt={track.title}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-100 truncate">
                            {track.title}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {track.artist} · {track.source}
                          </p>
                        </div>
                        <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {activeView === 'discover' && (
                  <DiscoverView
                    onNavigate={handleSelectView}
                    onPlayTrack={startAudioTrack}
                    onPlayRadio={handlePlayRadio}
                    onOpenTheater={handleOpenTheater}
                    offlineClips={offlineClips}
                  />
                )}
                {activeView === 'hub' && (
                  <MediaHubView
                    onPlayTrack={startAudioTrack}
                    onPlayRadio={handlePlayRadio}
                    onOpenTheater={handleOpenTheater}
                  />
                )}
                {activeView === 'tv' && (
                  <WorldTVView onOpenTheater={handleOpenTheater} />
                )}
                {activeView === 'youtube' && (
                  <YouTubeView onOpenTheater={handleOpenTheater} />
                )}
                {activeView === 'pins' && (
                  <PinboardView
                    savedPins={savedPins}
                    onToggleSavePin={handleToggleSavePin}
                    currentTrack={currentTrack}
                    isPlaying={isPlaying}
                    onPlayTrack={startAudioTrack}
                    onTogglePlay={handleTogglePlay}
                  />
                )}
                {activeView === 'ip' && (
                  <IpInterestsView
                    interests={interests}
                    onUpdateInterests={setInterests}
                    onPlayTrack={startAudioTrack}
                    onPlayRadio={handlePlayRadio}
                    onOpenTheater={handleOpenTheater}
                  />
                )}
                {activeView === 'radio' && (
                  <RadioView
                    offlineClips={offlineClips}
                    onRefreshOfflineClips={refreshOfflineClips}
                    onPlayRadio={handlePlayRadio}
                    onPlayOfflineClip={handlePlayOfflineClip}
                  />
                )}
                {activeView === 'drive' && (
                  <GoogleDriveView
                    user={user}
                    needsAuth={needsAuth}
                    isLoggingIn={isLoggingIn}
                    onLogin={handleGoogleLogin}
                    onLogout={handleGoogleLogout}
                    onAuthExpired={handleAuthExpired}
                    onPlayTrack={startAudioTrack}
                    onOpenTheater={handleOpenTheater}
                    offlineClips={offlineClips}
                    savedPins={savedPins}
                    likedTracks={likedTracks}
                    interests={interests}
                    onRestoreBackup={(payload) => {
                      if (payload.savedPins) setSavedPins(payload.savedPins);
                      if (payload.likedTracks) setLikedTracks(payload.likedTracks);
                      if (payload.interests) setInterests(payload.interests);
                    }}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* Persistent Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => handleSkip(1)}
        onError={() => {
          setIsBuffering(false);
          setIsPlaying(false);
        }}
      />

      {/* Persistent Bottom Player Bar */}
      <PlayerBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isBuffering={isBuffering}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        isMuted={isMuted}
        isLiked={isLiked}
        showQueue={showQueue}
        onTogglePlay={handleTogglePlay}
        onPrev={() => handleSkip(-1)}
        onNext={() => handleSkip(1)}
        onSeek={(sec) => {
          if (audioRef.current) {
            audioRef.current.currentTime = sec;
            setCurrentTime(sec);
          }
        }}
        onVolumeChange={(val) => {
          setVolume(val);
          setIsMuted(val === 0);
          if (audioRef.current) audioRef.current.volume = val;
        }}
        onToggleMute={() => {
          const next = !isMuted;
          setIsMuted(next);
          if (audioRef.current) audioRef.current.volume = next ? 0 : volume;
        }}
        onToggleLike={handleToggleLike}
        onOpenLyrics={handleOpenLyrics}
        onToggleQueue={() => setShowQueue((prev) => !prev)}
      />

      {/* Queue Drawer */}
      {showQueue && (
        <aside className="fixed right-4 bottom-24 z-40 w-80 max-w-[90vw] rounded-xl border border-white/10 bg-[#111827] shadow-2xl p-4 max-h-96 flex flex-col">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
            <h3 className="text-xs font-semibold text-slate-100">
              Playback Queue ({queue.length})
            </h3>
            <div className="flex items-center gap-2">
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQueue([])}
                  className="text-slate-400 hover:text-red-400 cursor-pointer"
                  title="Clear queue"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowQueue(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 overflow-y-auto space-y-1">
            {queue.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Queue is empty.</p>
            ) : (
              queue.map((t, i) => {
                const active =
                  currentTrack?.id === t.id && currentTrack?.offlineId === t.offlineId;
                return (
                  <button
                    key={`${t.id}_${i}`}
                    type="button"
                    onClick={() => startAudioTrack(t, queue)}
                    className={`w-full text-left rounded-lg px-2.5 py-2 flex items-center gap-2.5 text-xs cursor-pointer ${
                      active ? 'bg-amber-500/15 text-amber-300' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="font-mono text-[10px] text-slate-500 w-4">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{t.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{t.artist}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* Lyrics Modal */}
      {lyricsModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#111827] p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  {currentTrack?.title || 'Lyrics'}
                </h3>
                <p className="text-xs text-slate-400">{currentTrack?.artist}</p>
              </div>
              <button
                type="button"
                onClick={() => setLyricsModal({ open: false, loading: false, text: '' })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 overflow-y-auto flex-1">
              {lyricsModal.loading ? (
                <p className="text-xs text-slate-400">Searching lyrics...</p>
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-200 leading-relaxed">
                  {lyricsModal.text}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Theater Modal for TV / YouTube / Drive Video */}
      <MediaTheaterModal
        target={theaterTarget}
        onClose={() => {
          if (theaterTarget?.type === 'drive-video') {
            URL.revokeObjectURL(theaterTarget.objectUrl);
          }
          setTheaterTarget(null);
        }}
        onSwitchChannel={(channel) => {
          if (theaterTarget?.type === 'tv') {
            setTheaterTarget({
              type: 'tv',
              channel,
              playlist: theaterTarget.playlist,
            });
          }
        }}
      />

      <OfflineIndicator onOpenRadio={() => handleSelectView('radio')} />
    </div>
  );
}
