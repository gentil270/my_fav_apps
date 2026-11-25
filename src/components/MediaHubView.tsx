import React, { useEffect, useState } from 'react';
import { Play, Tv, Youtube, Music, Radio, Search } from 'lucide-react';
import { MEDIA_CATEGORIES, POPULAR_COUNTRIES } from '../constants/mediaCategories';
import { RadioStation, TVChannel, TrackItem, YouTubeVideoItem } from '../types';
import { TheaterTarget } from './MediaTheaterModal';

interface MediaHubViewProps {
  onPlayTrack: (track: TrackItem, queue?: TrackItem[]) => void;
  onPlayRadio: (station: RadioStation) => void;
  onOpenTheater: (target: TheaterTarget) => void;
}

export const MediaHubView: React.FC<MediaHubViewProps> = ({
  onPlayTrack,
  onPlayRadio,
  onOpenTheater,
}) => {
  const [category, setCategory] = useState('all');
  const [country, setCountry] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [tvChannels, setTvChannels] = useState<TVChannel[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideoItem[]>([]);
  const [musicTracks, setMusicTracks] = useState<TrackItem[]>([]);
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);

  const loadHub = async (cat = category, ctry = country, q = query) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category: cat });
      if (ctry) params.set('country', ctry);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/media/hub?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setTvChannels(json.tvChannels || []);
      setYoutubeVideos(json.youtubeVideos || []);
      setMusicTracks(json.musicTracks || []);
      setRadioStations(json.radioStations || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHub(category, country, query);
  }, [category, country]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">All Media Categories Hub</h1>
          <p className="mt-1 text-xs text-slate-400">
            World TV, YouTube songs & videos, music streams, and live radio unified across 17
            categories
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadHub(category, country, query);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Filter by country"
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
              placeholder="Search TV, songs, radio..."
              className="rounded-lg border border-white/10 bg-[#111827] pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 w-56 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
          >
            Filter
          </button>
        </form>
      </div>

      {/* 17 Category Segmented Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
        {MEDIA_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              category === cat.id
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'bg-[#111827] border border-white/[0.08] text-slate-300 hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="h-36 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* World TV Row */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Tv className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-slate-100">World Live TV</h2>
            </div>
            {tvChannels.length === 0 ? (
              <p className="text-xs text-slate-500">No TV channels matched this filter.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {tvChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() =>
                      onOpenTheater({ type: 'tv', channel: ch, playlist: tvChannels })
                    }
                    className="text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-4 transition-colors cursor-pointer"
                  >
                    <p className="text-xs text-slate-400 truncate">
                      {ch.country} · {ch.mediaCategory}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-slate-100 truncate">
                      {ch.name}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* YouTube Row */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Youtube className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-slate-100">
                YouTube Songs & Videos
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {youtubeVideos.map((vid) => (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => onOpenTheater({ type: 'youtube', video: vid })}
                  className="group text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 overflow-hidden transition-colors cursor-pointer"
                >
                  <div className="aspect-video relative bg-slate-900">
                    <img
                      src={vid.thumbnailUrl}
                      alt={vid.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-semibold text-slate-100 line-clamp-2">
                      {vid.title}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 truncate">
                      {vid.channelTitle} · {vid.durationText || 'Video'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Music Row */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Music className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-slate-100">Music Tracks</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {musicTracks.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => onPlayTrack(tr, musicTracks)}
                  className="text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-3 flex items-center gap-3 cursor-pointer"
                >
                  <img
                    src={tr.coverUrl}
                    alt={tr.title}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-lg object-cover shrink-0"
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

          {/* Radio Row */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-slate-100">Global Radio</h2>
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
