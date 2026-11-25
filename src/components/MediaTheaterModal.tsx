import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Tv,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { TVChannel, TVStreamSource, YouTubeVideoItem } from '../types';

export type TheaterTarget =
  | { type: 'tv'; channel: TVChannel; playlist?: TVChannel[] }
  | { type: 'youtube'; video: YouTubeVideoItem }
  | { type: 'drive-video'; title: string; mimeType: string; objectUrl: string; webViewLink?: string };

interface MediaTheaterModalProps {
  target: TheaterTarget | null;
  onClose: () => void;
  onSwitchChannel?: (channel: TVChannel) => void;
}

export const MediaTheaterModal: React.FC<MediaTheaterModalProps> = ({
  target,
  onClose,
  onSwitchChannel,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsText, setLyricsText] = useState<string>('');
  const [lyricsLoading, setLyricsLoading] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setErrorMsg('');
    setStatusMsg('');
    setShowLyrics(false);
    setLyricsText('');
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  useEffect(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!target || target.type !== 'tv') return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const sources: TVStreamSource[] =
      target.channel.sources?.length > 0
        ? target.channel.sources
        : [{ url: target.channel.streamUrl }];
    const activeSource = sources[sourceIndex] || sources[0];
    if (!activeSource) {
      setErrorMsg('No stream sources available for this channel.');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMsg('');
    setStatusMsg(`Connecting to stream source ${sourceIndex + 1} of ${sources.length}...`);

    const buildProxyUrl = (src: TVStreamSource) => {
      const params = new URLSearchParams({ url: src.url });
      if (src.referrer) params.set('ref', src.referrer);
      if (src.userAgent) params.set('ua', src.userAgent);
      return `/api/tv/proxy?${params.toString()}`;
    };

    const proxyUrl = buildProxyUrl(activeSource);
    const isDirectVideoFile = /\.(mp4|webm|ogg)(\?|$)/i.test(activeSource.url);

    const advanceOrFail = (reason: string) => {
      if (cancelled) return;
      if (sourceIndex + 1 < sources.length) {
        setStatusMsg(`Switching to backup stream ${sourceIndex + 2}...`);
        setSourceIndex((prev) => prev + 1);
      } else {
        setIsLoading(false);
        setErrorMsg(
          `${reason} You can try opening the broadcaster stream directly or switching channels.`
        );
      }
    };

    if (isDirectVideoFile) {
      videoEl.src = proxyUrl;
      videoEl
        .play()
        .then(() => {
          if (!cancelled) {
            setIsLoading(false);
            setStatusMsg('');
          }
        })
        .catch(() => advanceOrFail('Direct video playback could not start.'));
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });
      hlsRef.current = hls;
      let usingDirectFallback = false;

      hls.loadSource(proxyUrl);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        setIsLoading(false);
        setStatusMsg('');
        videoEl.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled || !data.fatal) return;
        if (!usingDirectFallback && activeSource.url.startsWith('https://')) {
          usingDirectFallback = true;
          setStatusMsg('Retrying direct HTTPS broadcast...');
          hls.loadSource(activeSource.url);
          return;
        }
        hls.destroy();
        advanceOrFail('Broadcaster stream is offline or region-restricted.');
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = proxyUrl;
      const onCanPlay = () => {
        if (!cancelled) {
          setIsLoading(false);
          setStatusMsg('');
          videoEl.play().catch(() => {});
        }
      };
      const onErr = () => advanceOrFail('Native HLS stream failed to load.');
      videoEl.addEventListener('canplay', onCanPlay);
      videoEl.addEventListener('error', onErr);
      return () => {
        cancelled = true;
        videoEl.removeEventListener('canplay', onCanPlay);
        videoEl.removeEventListener('error', onErr);
      };
    } else {
      advanceOrFail('HLS playback is not supported in this browser.');
    }

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [target, sourceIndex]);

  if (!target) return null;

  const handleFetchYouTubeLyrics = async () => {
    if (target.type !== 'youtube') return;
    setShowLyrics((prev) => !prev);
    if (lyricsText || lyricsLoading) return;
    setLyricsLoading(true);
    try {
      const cleanTitle = target.video.title
        .replace(/\(official.*?\)|\[official.*?\]|\(lyrics.*?\)|ft\..*/gi, '')
        .trim();
      const res = await fetch(
        `/api/music/lyrics?title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(
          target.video.channelTitle
        )}`
      );
      const data = await res.json();
      setLyricsText(data.lyrics || 'No synchronized lyrics found for this video.');
    } catch {
      setLyricsText('Could not load lyrics right now.');
    } finally {
      setLyricsLoading(false);
    }
  };

  const tvPlaylist = target.type === 'tv' ? target.playlist || [] : [];
  const currentTvIdx =
    target.type === 'tv'
      ? tvPlaylist.findIndex((c) => c.id === target.channel.id)
      : -1;

  const handleSurf = (delta: number) => {
    if (target.type !== 'tv' || !onSwitchChannel || tvPlaylist.length === 0) return;
    const nextIdx =
      currentTvIdx === -1
        ? 0
        : (currentTvIdx + delta + tvPlaylist.length) % tvPlaylist.length;
    onSwitchChannel(tvPlaylist[nextIdx]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 lg:p-8"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0E1525] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-white/[0.08]">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-100 truncate">
              {target.type === 'tv'
                ? target.channel.name
                : target.type === 'youtube'
                ? target.video.title
                : target.title}
            </h2>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {target.type === 'tv'
                ? `${target.channel.country} · ${target.channel.mediaCategory} · Live Broadcast`
                : target.type === 'youtube'
                ? `${target.video.channelTitle} · YouTube`
                : `Google Drive Video · ${target.mimeType}`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {target.type === 'tv' && tvPlaylist.length > 1 && onSwitchChannel && (
              <>
                <button
                  type="button"
                  onClick={() => handleSurf(-1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => handleSurf(1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {target.type === 'youtube' && (
              <button
                type="button"
                onClick={handleFetchYouTubeLyrics}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  showLyrics
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                    : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Lyrics
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              aria-label="Close theater player"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 bg-black relative aspect-video flex items-center justify-center">
            {target.type === 'tv' && (
              <>
                <video
                  ref={videoRef}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
                {isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 gap-2 text-slate-200">
                    <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
                    <p className="text-xs font-medium">{statusMsg || 'Loading stream...'}</p>
                  </div>
                )}
                {errorMsg && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center gap-3">
                    <AlertCircle className="w-8 h-8 text-amber-400" />
                    <p className="text-sm text-slate-200 max-w-md">{errorMsg}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                      <a
                        href={
                          (target.channel.sources[sourceIndex] || target.channel.sources[0])?.url ||
                          target.channel.streamUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open Broadcaster Link
                      </a>
                      {tvPlaylist.length > 1 && onSwitchChannel && (
                        <button
                          type="button"
                          onClick={() => handleSurf(1)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 cursor-pointer"
                        >
                          <Tv className="w-3.5 h-3.5" />
                          Try Next Channel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {target.type === 'youtube' && (
              <iframe
                src={target.video.embedUrl}
                title={target.video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            )}

            {target.type === 'drive-video' && (
              <video
                src={target.objectUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            )}
          </div>

          {showLyrics && target.type === 'youtube' && (
            <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/[0.08] bg-[#111827] p-4 overflow-y-auto max-h-72 lg:max-h-none">
              <h3 className="text-xs font-semibold text-amber-400 mb-2">Lyrics</h3>
              {lyricsLoading ? (
                <p className="text-xs text-slate-400">Searching lyrics...</p>
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed">
                  {lyricsText}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* TV Multi-Source Switcher Footer */}
        {target.type === 'tv' && target.channel.sources.length > 1 && (
          <div className="px-5 py-2.5 border-t border-white/[0.08] bg-[#0B101C] flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-400 shrink-0">Stream Sources:</span>
            {target.channel.sources.map((src, idx) => (
              <button
                key={src.url}
                type="button"
                onClick={() => setSourceIndex(idx)}
                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  idx === sourceIndex
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]'
                }`}
              >
                Feed {idx + 1}
                {src.quality ? ` (${src.quality})` : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
