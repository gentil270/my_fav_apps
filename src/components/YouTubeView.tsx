import React, { useEffect, useState } from 'react';
import { Play, Search, Youtube } from 'lucide-react';
import { MEDIA_CATEGORIES, POPULAR_COUNTRIES } from '../constants/mediaCategories';
import { YouTubeVideoItem } from '../types';
import { TheaterTarget } from './MediaTheaterModal';

interface YouTubeViewProps {
  onOpenTheater: (target: TheaterTarget) => void;
}

export const YouTubeView: React.FC<YouTubeViewProps> = ({ onOpenTheater }) => {
  const [category, setCategory] = useState('music');
  const [country, setCountry] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<YouTubeVideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadVideos = async (cat = category, ctry = country, q = query) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category: cat, limit: '20' });
      if (ctry) params.set('country', ctry);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/youtube/browse?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVideos(category, country, query);
  }, [category, country]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">YouTube Songs & Videos</h1>
          <p className="mt-1 text-xs text-slate-400">
            Stream official music videos, live concerts, sports highlights, and documentaries with
            built-in lyrics
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadVideos(category, country, query);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Filter YouTube by country"
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
              placeholder="Search YouTube songs or topics..."
              className="rounded-lg border border-white/10 bg-[#111827] pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 w-60 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
          >
            Search
          </button>
        </form>
      </div>

      {/* 17 Categories */}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="h-56 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#111827] p-10 text-center">
          <Youtube className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="mt-2 text-sm font-medium text-slate-200">No YouTube videos returned</p>
          <p className="mt-1 text-xs text-slate-400">
            Try entering a specific artist, song title, or topic in the search box.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => onOpenTheater({ type: 'youtube', video })}
              className="group text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 overflow-hidden transition-colors cursor-pointer"
            >
              <div className="aspect-video relative bg-slate-900">
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="w-11 h-11 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </span>
                </div>
                {video.durationText && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-slate-100">
                    {video.durationText}
                  </span>
                )}
              </div>
              <div className="p-3.5">
                <p className="text-sm font-semibold text-slate-100 line-clamp-2 leading-snug">
                  {video.title}
                </p>
                <p className="mt-1.5 text-xs text-slate-400 truncate">
                  {video.channelTitle}
                  {video.viewsText ? ` · ${video.viewsText}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
