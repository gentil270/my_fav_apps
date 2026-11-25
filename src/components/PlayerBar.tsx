import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  FileText,
  ListMusic,
  Heart,
  WifiOff,
  HardDrive,
} from 'lucide-react';
import { TrackItem } from '../types';

interface PlayerBarProps {
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLiked: boolean;
  showQueue: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (sec: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleLike: () => void;
  onOpenLyrics: () => void;
  onToggleQueue: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  currentTrack,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  volume,
  isMuted,
  isLiked,
  showQueue,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleLike,
  onOpenLyrics,
  onToggleQueue,
}) => {
  return (
    <footer className="h-20 shrink-0 border-t border-white/[0.08] bg-[#0C111D] px-4 lg:px-6 flex items-center justify-between gap-4 z-30">
      {/* Left: Track identity */}
      <div className="flex items-center gap-3 min-w-0 w-1/3 max-w-xs">
        {currentTrack ? (
          <>
            <img
              src={
                currentTrack.coverUrl ||
                '/src/assets/images/cover_global_radio_1795424586587.jpg'
              }
              alt={currentTrack.title}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0 bg-slate-900"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-100 truncate">
                  {currentTrack.title}
                </p>
                {currentTrack.source === 'offline-radio' && (
                  <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                {currentTrack.source === 'drive' && (
                  <HardDrive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">
                {currentTrack.artist}
                {currentTrack.source ? ` · ${currentTrack.source.toUpperCase()}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleLike}
              className={`p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                isLiked
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
              aria-label={isLiked ? 'Unlike track' : 'Like track'}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
            </button>
          </>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">
              KEZA Global Stream Player
            </p>
            <p className="text-xs text-slate-500 truncate">
              Select a track, radio station, or Google Drive audio file
            </p>
          </div>
        )}
      </div>

      {/* Center: Transport & Scrubbing */}
      <div className="flex flex-col items-center justify-center flex-1 max-w-xl gap-1.5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onPrev}
            disabled={!currentTrack}
            className="p-1.5 text-slate-300 hover:text-white disabled:opacity-35 transition-colors cursor-pointer"
            aria-label="Previous track"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!currentTrack}
            className="w-9 h-9 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center disabled:opacity-40 transition-colors cursor-pointer"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isBuffering ? (
              <span className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!currentTrack}
            className="p-1.5 text-slate-300 hover:text-white disabled:opacity-35 transition-colors cursor-pointer"
            aria-label="Next track"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="w-full flex items-center gap-2.5 text-[11px] font-mono tabular-nums text-slate-400">
          <span className="w-9 text-right">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={currentTrack?.isLive ? 100 : Math.max(duration || 30, 1)}
            value={currentTrack?.isLive ? 100 : Math.min(currentTime, duration || 30)}
            disabled={!currentTrack || Boolean(currentTrack?.isLive)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Seek playback position"
            className="flex-1 h-1 accent-amber-500 bg-slate-800 rounded-lg cursor-pointer"
          />
          <span className="w-9">
            {currentTrack?.isLive ? 'LIVE' : formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Right: Lyrics, Queue, Volume */}
      <div className="hidden sm:flex items-center justify-end gap-2 w-1/3 max-w-xs">
        <button
          type="button"
          onClick={onOpenLyrics}
          disabled={!currentTrack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="View Lyrics"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Lyrics</span>
        </button>

        <button
          type="button"
          onClick={onToggleQueue}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showQueue
              ? 'bg-amber-500/15 text-amber-300'
              : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
          }`}
          title="Playback Queue"
        >
          <ListMusic className="w-3.5 h-3.5" />
          <span>Queue</span>
        </button>

        <div className="flex items-center gap-1.5 ml-1">
          <button
            type="button"
            onClick={onToggleMute}
            className="p-1.5 text-slate-300 hover:text-white cursor-pointer"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            aria-label="Volume"
            className="w-20 h-1 accent-amber-500 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </footer>
  );
};
