import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Link as LinkIcon,
  Pause,
  Play,
  Search,
  X,
} from 'lucide-react';
import { PinboardItem, TrackItem } from '../types';

interface PinboardViewProps {
  savedPins: PinboardItem[];
  onToggleSavePin: (pin: PinboardItem) => void;
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  onPlayTrack: (track: TrackItem, queue?: TrackItem[]) => void;
  onTogglePlay: () => void;
}

const PIN_GENRES = ['All', 'Afrobeats', 'Hip-Hop', 'Pop', 'R&B', 'Electronic', 'Jazz', 'Acoustic'];

export const PinboardView: React.FC<PinboardViewProps> = ({
  savedPins,
  onToggleSavePin,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onTogglePlay,
}) => {
  const [tab, setTab] = useState<'explore' | 'saved'>('explore');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'spotify' | 'audiomack'>('all');
  const [genre, setGenre] = useState('All');
  const [query, setQuery] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [pins, setPins] = useState<PinboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectedPin, setInspectedPin] = useState<PinboardItem | null>(null);
  const [showEmbedInModal, setShowEmbedInModal] = useState(false);

  const loadPins = async (opts?: { customUrl?: string }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        source: sourceFilter,
        genre,
      });
      if (query.trim()) params.set('q', query.trim());
      if (opts?.customUrl) params.set('url', opts.customUrl);

      const res = await fetch(`/api/music/pinboard?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      if (opts?.customUrl && Array.isArray(json.items) && json.items.length > 0) {
        setPins((prev) => [...json.items, ...prev]);
        setInspectedPin(json.items[0]);
      } else {
        setPins(json.items || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'explore') {
      loadPins();
    }
  }, [sourceFilter, genre, tab]);

  const savedIds = new Set(savedPins.map((p) => p.id));
  const displayedPins = tab === 'saved' ? savedPins : pins;

  const toTrack = (pin: PinboardItem): TrackItem => ({
    id: pin.id,
    title: pin.title,
    artist: pin.artist,
    album: pin.album,
    coverUrl: pin.coverUrl,
    audioUrl: pin.audioUrl,
    durationSec: pin.durationSec,
    source: pin.source,
    genre: pin.genre,
    externalUrl: pin.externalUrl,
    embedUrl: pin.embedUrl,
  });

  const handlePlayPin = (pin: PinboardItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (currentTrack?.id === pin.id) {
      onTogglePlay();
    } else {
      const queue = displayedPins.filter((p) => Boolean(p.audioUrl)).map(toTrack);
      onPlayTrack(toTrack(pin), queue);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Spotify & Audiomack Pins</h1>
          <p className="mt-1 text-xs text-slate-400">
            Visual masonry board for discovering, pinning, and playing Spotify and Audiomack tracks
          </p>
        </div>

        {/* Explore vs Saved Board */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111827] border border-white/[0.08] self-start">
          <button
            type="button"
            onClick={() => setTab('explore')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              tab === 'explore'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Explore Pins
          </button>
          <button
            type="button"
            onClick={() => setTab('saved')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              tab === 'saved'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Saved Board ({savedPins.length})
          </button>
        </div>
      </div>

      {tab === 'explore' && (
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111827] border border-white/[0.08]">
                {(['all', 'spotify', 'audiomack'] as const).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setSourceFilter(src)}
                    className={`px-3 py-1 rounded-md text-xs font-medium capitalize cursor-pointer ${
                      sourceFilter === src
                        ? 'bg-white/15 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {src}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 overflow-x-auto">
                {PIN_GENRES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenre(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      genre === g
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-[#111827] border border-white/[0.08] text-slate-300 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadPins();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search artist or song..."
                  className="rounded-lg border border-white/10 bg-[#111827] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 w-48 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 cursor-pointer"
              >
                Find
              </button>
            </form>
          </div>

          {/* Direct Spotify / Audiomack Link Resolver */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (linkInput.trim()) {
                loadPins({ customUrl: linkInput.trim() });
                setLinkInput('');
              }
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1 max-w-xl">
              <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="url"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="Paste an open.spotify.com/... or audiomack.com/... song link to pin it..."
                className="w-full rounded-lg border border-white/10 bg-[#111827] pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-white/10 bg-[#111827] hover:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 whitespace-nowrap cursor-pointer"
            >
              Pin URL
            </button>
          </form>
        </div>
      )}

      {/* Masonry Grid */}
      {loading && tab === 'explore' ? (
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <div
              key={n}
              className="break-inside-avoid rounded-2xl bg-white/[0.04] animate-pulse"
              style={{ height: n % 2 === 0 ? 280 : 220 }}
            />
          ))}
        </div>
      ) : displayedPins.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#111827] p-10 text-center">
          <Bookmark className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="mt-2 text-sm font-medium text-slate-200">
            {tab === 'saved' ? 'Your Saved Board is empty' : 'No matching pins found'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {tab === 'saved'
              ? 'Save any Spotify or Audiomack song pin from Explore to collect it here.'
              : 'Try another genre or paste a direct Spotify / Audiomack song URL.'}
          </p>
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
          {displayedPins.map((pin) => {
            const isSaved = savedIds.has(pin.id);
            const isCurrent = currentTrack?.id === pin.id && isPlaying;
            const aspectClass =
              pin.aspectRatio === 'tall'
                ? 'aspect-[3/4]'
                : pin.aspectRatio === 'portrait'
                ? 'aspect-[4/5]'
                : 'aspect-square';

            return (
              <div
                key={pin.id}
                onClick={() => {
                  setShowEmbedInModal(false);
                  setInspectedPin(pin);
                }}
                className="group break-inside-avoid rounded-2xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 overflow-hidden cursor-pointer transition-colors"
              >
                <div className={`relative ${aspectClass} bg-slate-900`}>
                  <img
                    src={pin.coverUrl}
                    alt={pin.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSavePin(pin);
                        }}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                          isSaved
                            ? 'bg-slate-950/90 text-amber-300 border border-amber-500/40'
                            : 'bg-amber-500 text-slate-950'
                        }`}
                      >
                        {isSaved ? (
                          <>
                            <BookmarkCheck className="w-3.5 h-3.5" />
                            <span>Saved</span>
                          </>
                        ) : (
                          <>
                            <Bookmark className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex justify-end">
                      {pin.audioUrl && (
                        <button
                          type="button"
                          onClick={(e) => handlePlayPin(pin, e)}
                          className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg cursor-pointer"
                          aria-label={isCurrent ? 'Pause pin' : 'Play pin'}
                        >
                          {isCurrent ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-100 truncate">{pin.title}</p>
                  <p className="mt-1 text-[11px] text-slate-400 truncate">
                    {pin.artist} · {pin.source === 'audiomack' ? 'Audiomack' : 'Spotify'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pin Inspector Lightbox Modal */}
      {inspectedPin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#111827] overflow-hidden grid md:grid-cols-2 shadow-2xl">
            <div className="bg-black flex items-center justify-center min-h-[280px]">
              {showEmbedInModal ? (
                <iframe
                  src={inspectedPin.embedUrl}
                  title={inspectedPin.title}
                  className="w-full h-full min-h-[320px] border-0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                />
              ) : (
                <img
                  src={inspectedPin.coverUrl}
                  alt={inspectedPin.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover max-h-[420px]"
                />
              )}
            </div>

            <div className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-medium text-amber-400">
                    {inspectedPin.source === 'audiomack' ? 'Audiomack Pin' : 'Spotify Pin'} ·{' '}
                    {inspectedPin.genre}
                  </span>
                  <button
                    type="button"
                    onClick={() => setInspectedPin(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                    aria-label="Close pin inspector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="mt-2 text-xl font-bold text-slate-50">{inspectedPin.title}</h3>
                <p className="mt-1 text-sm text-slate-300">{inspectedPin.artist}</p>
                {inspectedPin.album && (
                  <p className="mt-0.5 text-xs text-slate-400">{inspectedPin.album}</p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {inspectedPin.audioUrl && (
                    <button
                      type="button"
                      onClick={() => handlePlayPin(inspectedPin)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
                    >
                      {currentTrack?.id === inspectedPin.id && isPlaying ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>
                        {currentTrack?.id === inspectedPin.id && isPlaying ? 'Pause' : 'Play Preview'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggleSavePin(inspectedPin)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.06] cursor-pointer"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                    <span>{savedIds.has(inspectedPin.id) ? 'Saved' : 'Save Pin'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowEmbedInModal((prev) => !prev)}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.06] cursor-pointer"
                  >
                    {showEmbedInModal ? 'Show Cover' : 'Inline Embed'}
                  </button>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between">
                <a
                  href={inspectedPin.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>
                    Open on {inspectedPin.source === 'audiomack' ? 'Audiomack' : 'Spotify'}
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
