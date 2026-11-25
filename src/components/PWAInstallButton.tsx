import React, { useState } from 'react';
import { Download, ExternalLink, Monitor, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'inline';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'sidebar',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const isInIframe =
    typeof window !== 'undefined' && window.self !== window.top;
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '/';

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowInstallModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === 'inline'
            ? 'inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2.5 text-xs font-semibold text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : 'w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
        }
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install KEZA App</span>
      </button>

      {showInstallModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-keza-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-amber-400">
                  Progressive Web App
                </p>
                <h3
                  id="install-keza-title"
                  className="mt-1 text-lg font-bold text-slate-50"
                >
                  Install KEZA Global Stream
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="Close install dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              Install KEZA Global Stream to your home screen or desktop dock for standalone
              window playback and offline radio access.
            </p>

            {isInIframe && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                <p className="text-xs font-medium text-amber-200 leading-relaxed">
                  Browser install prompts only appear when the app is opened in its own top-level
                  browser tab rather than inside an embedded preview frame.
                </p>
                <a
                  href={appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open KEZA in New Tab to Install</span>
                </a>
              </div>
            )}

            <div className="mt-4 space-y-3 text-xs text-slate-300">
              {isIOS ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#0B101C] p-3.5">
                  <div className="flex items-center gap-2 font-semibold text-slate-100 mb-1.5">
                    <Smartphone className="w-4 h-4 text-amber-400" />
                    <span>iPhone & iPad (Safari)</span>
                  </div>
                  <p className="leading-relaxed text-slate-400">
                    1. Tap the <strong className="text-slate-200">Share</strong> icon in Safari.
                    <br />
                    2. Scroll down and tap{' '}
                    <strong className="text-slate-200">Add to Home Screen</strong>.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-white/[0.08] bg-[#0B101C] p-3.5">
                    <div className="flex items-center gap-2 font-semibold text-slate-100 mb-1.5">
                      <Monitor className="w-4 h-4 text-amber-400" />
                      <span>Desktop (Chrome / Edge / Brave)</span>
                    </div>
                    <p className="leading-relaxed text-slate-400">
                      Open KEZA Global Stream in a top-level tab, then click the{' '}
                      <strong className="text-slate-200">Install</strong> icon in the address bar
                      or open browser menu →{' '}
                      <strong className="text-slate-200">Install KEZA Global Stream</strong>.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/[0.08] bg-[#0B101C] p-3.5">
                    <div className="flex items-center gap-2 font-semibold text-slate-100 mb-1.5">
                      <Smartphone className="w-4 h-4 text-amber-400" />
                      <span>Android & iOS Mobile</span>
                    </div>
                    <p className="leading-relaxed text-slate-400">
                      On Android Chrome tap <strong className="text-slate-200">Install app</strong>{' '}
                      from the menu. On iPhone/iPad Safari tap{' '}
                      <strong className="text-slate-200">Share → Add to Home Screen</strong>.
                    </p>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowInstallModal(false)}
              className="mt-5 w-full rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] py-2 text-xs font-semibold text-slate-100 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
