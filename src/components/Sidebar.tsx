import React from 'react';
import {
  Compass,
  Grid,
  Tv,
  Youtube,
  Bookmark,
  Globe,
  Radio,
  HardDrive,
  X,
} from 'lucide-react';
import { NavView } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  offlineCount: number;
  driveConnected: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'hub', label: 'All Media Hub', icon: Grid },
  { id: 'tv', label: 'World TV', icon: Tv },
  { id: 'youtube', label: 'YouTube Songs', icon: Youtube },
  { id: 'pins', label: 'Spotify & Audiomack', icon: Bookmark },
  { id: 'ip', label: 'IP & Interests', icon: Globe },
  { id: 'radio', label: 'Radio (Online/Offline)', icon: Radio },
  { id: 'drive', label: 'Google Drive Vault', icon: HardDrive },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  offlineCount,
  driveConnected,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-[#0C111D] border-r border-white/[0.08] p-4">
      <div>
        <div className="flex items-center justify-between px-2 py-2 mb-6">
          <button
            type="button"
            onClick={() => {
              onSelectView('discover');
              onCloseMobile();
            }}
            className="text-left focus:outline-none cursor-pointer"
          >
            <span className="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap">
              KEZA Global Stream
            </span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-amber-500/12 text-amber-300'
                    : 'text-slate-300 hover:bg-white/[0.04] hover:text-slate-50'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-amber-400' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'radio' && offlineCount > 0 && (
                  <span className="font-mono tabular-nums text-[11px] text-slate-400">
                    {offlineCount}
                  </span>
                )}
                {item.id === 'drive' && driveConnected && (
                  <span className="text-[11px] font-medium text-emerald-400">
                    Synced
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 pt-4 border-t border-white/[0.08]">
        <PWAInstallButton />
        <p className="px-2 text-[11px] text-slate-500 leading-snug">
          World TV · YouTube · Radio Vault · Google Drive
        </p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[248px] shrink-0 h-full">
        {navContent}
      </aside>

      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[82vw] h-full z-10">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
