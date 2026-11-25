import React, { useEffect, useState } from 'react';
import { Play, Search, Tv } from 'lucide-react';
import { MEDIA_CATEGORIES } from '../constants/mediaCategories';
import { TVChannel } from '../types';
import { TheaterTarget } from './MediaTheaterModal';

interface WorldTVViewProps {
  onOpenTheater: (target: TheaterTarget) => void;
}

export const WorldTVView: React.FC<WorldTVViewProps> = ({ onOpenTheater }) => {
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [total, setTotal] = useState(0);
  const [totalCatalog, setTotalCatalog] = useState(0);
  const [countryCount, setCountryCount] = useState(0);
  const [countryCounts, setCountryCounts] = useState<Record<string, number>>({});
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  const [category, setCategory] = useState('all');
  const [country, setCountry] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchChannels = async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        limit: '48',
        offset: String(offset),
        category,
      });
      if (country) params.set('country', country);
      if (query.trim()) params.set('q', query.trim());

      const res = await fetch(`/api/tv/channels?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setChannels((prev) => (append ? [...prev, ...(json.channels || [])] : json.channels || []));
      setTotal(json.total || 0);
      setTotalCatalog(json.totalCatalog || 0);
      setCountryCount(json.countryCount || 0);
      if (!append) {
        setCountryCounts(json.countryCounts || {});
        setCategoryCounts(json.categoryCounts || {});
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchChannels(0, false);
  }, [category, country]);

  const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111827] overflow-hidden grid lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 p-6 flex flex-col justify-center">
          <p className="text-xs font-medium text-amber-400">Live Global Broadcasts</p>
          <h1 className="mt-1.5 text-2xl font-bold text-slate-50">World Live TV</h1>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Browse <span className="font-mono tabular-nums font-semibold">{totalCatalog.toLocaleString()}</span> live
            streams across <span className="font-mono tabular-nums font-semibold">{countryCount}</span> countries
            with multi-feed automatic failover.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchChannels(0, false);
            }}
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-label="Filter TV channels by country"
              className="rounded-lg border border-white/10 bg-[#090D16] px-3 py-2 text-xs text-slate-200 max-w-[200px]"
            >
              <option value="">All Countries ({countryCount})</option>
              {sortedCountries.map(([name, cnt]) => (
                <option key={name} value={name}>
                  {name} ({cnt})
                </option>
              ))}
            </select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search channel or country..."
                className="w-full rounded-lg border border-white/10 bg-[#090D16] pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
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

        <div className="lg:col-span-5 relative min-h-[180px]">
          <img
            src="/src/assets/images/cover_world_tv_broadcast_1795424585942.jpg"
            alt="Global television control desk"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#111827] via-transparent to-transparent" />
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
        {MEDIA_CATEGORIES.map((cat) => {
          const count = cat.id === 'all' ? totalCatalog : categoryCounts[cat.id] || 0;
          return (
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
              {cat.shortLabel}
              {count > 0 ? ` · ${count.toLocaleString()}` : ''}
            </button>
          );
        })}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Showing <span className="font-mono tabular-nums text-slate-200">{channels.length}</span> of{' '}
          <span className="font-mono tabular-nums text-slate-200">{total.toLocaleString()}</span> channels
        </span>
      </div>

      {/* Channels Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#111827] p-8 text-center">
          <Tv className="w-7 h-7 text-slate-500 mx-auto" />
          <p className="mt-2 text-sm font-medium text-slate-200">No TV channels found</p>
          <p className="mt-1 text-xs text-slate-400">
            Try clearing your country filter or searching another station name.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() =>
                onOpenTheater({
                  type: 'tv',
                  channel: ch,
                  playlist: channels,
                })
              }
              className="group text-left rounded-xl border border-white/[0.08] bg-[#111827] hover:border-amber-500/40 p-4 transition-colors flex items-center gap-3 cursor-pointer"
            >
              {ch.logo ? (
                <img
                  src={ch.logo}
                  alt={ch.name}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-lg object-contain bg-white/5 p-1 shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0 text-amber-400">
                  <Tv className="w-5 h-5" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100 truncate">{ch.name}</p>
                <p className="mt-0.5 text-xs text-slate-400 truncate">
                  {ch.country} · {ch.mediaCategory}
                </p>
                <p className="mt-0.5 text-[11px] font-mono tabular-nums text-amber-400">
                  {ch.sources.length} feed{ch.sources.length > 1 ? 's' : ''}
                </p>
              </div>

              <Play className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {channels.length < total && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => fetchChannels(channels.length, true)}
            className="rounded-lg border border-white/10 bg-[#111827] hover:bg-slate-800 px-5 py-2.5 text-xs font-semibold text-slate-100 cursor-pointer disabled:opacity-50"
          >
            {loadingMore ? 'Loading channels...' : 'Load More Channels'}
          </button>
        </div>
      )}
    </div>
  );
};
