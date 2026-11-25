import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

export interface DrivePendingMutation {
  kind: 'backup' | 'upload-radio' | 'rename' | 'delete';
  title: string;
  description: string;
  targetNames: string[];
  confirmLabel: string;
  isDestructive?: boolean;
  initialInputValue?: string;
  inputLabel?: string;
  onConfirm: (inputValue?: string) => Promise<void>;
}

interface DriveConfirmModalProps {
  mutation: DrivePendingMutation | null;
  onCancel: () => void;
}

export const DriveConfirmModal: React.FC<DriveConfirmModalProps> = ({
  mutation,
  onCancel,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setInputValue(mutation?.initialInputValue || '');
    setIsSubmitting(false);
  }, [mutation]);

  if (!mutation) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await mutation.onConfirm(inputValue.trim() || undefined);
      onCancel();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-confirm-title"
    >
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#111827] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                mutation.isDestructive
                  ? 'bg-red-500/15 text-red-400'
                  : 'bg-amber-500/15 text-amber-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3
              id="drive-confirm-title"
              className="text-base font-semibold text-slate-100"
            >
              {mutation.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            aria-label="Cancel action"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          {mutation.description}
        </p>

        {mutation.targetNames.length > 0 && (
          <div className="mt-3 rounded-lg border border-white/[0.08] bg-[#0B101C] p-3 max-h-36 overflow-y-auto">
            <p className="text-[11px] font-medium text-slate-400 mb-1.5">
              Affected Google Drive item{mutation.targetNames.length > 1 ? `s (${mutation.targetNames.length})` : ''}:
            </p>
            <ul className="space-y-1">
              {mutation.targetNames.map((name) => (
                <li
                  key={name}
                  className="text-xs font-mono text-slate-200 truncate"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {mutation.inputLabel && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {mutation.inputLabel}
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0B101C] px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.05] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || (Boolean(mutation.inputLabel) && !inputValue.trim())}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
              mutation.isDestructive
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Working...' : mutation.confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
