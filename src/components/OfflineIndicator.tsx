import React from 'react';
import { WifiOff, Radio } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  onOpenRadio: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ onOpenRadio }) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-24 left-4 z-40 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-[#151D2E] px-3.5 py-2 text-xs font-medium text-amber-200 shadow-xl">
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <span>Offline Mode — Cached radio & saved media available</span>
      <button
        type="button"
        onClick={onOpenRadio}
        className="inline-flex items-center gap-1 rounded bg-amber-600 hover:bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Radio className="w-3 h-3" />
        Open Radio
      </button>
    </div>
  );
};
