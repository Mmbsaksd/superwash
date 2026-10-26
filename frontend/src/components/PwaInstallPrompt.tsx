import React, { useState, useEffect } from 'react';
import { Download, Sparkles, X, Share, PlusSquare, Smartphone, CheckCircle2, Info } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export interface PwaInstallPromptProps {
  variant?: 'customer-banner' | 'staff-card' | 'inline-button';
  portalName?: string;
  className?: string;
}

export const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({
  variant = 'customer-banner',
  portalName = 'SuperWash Exprez',
  className = ''
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);
  const [showUnsupportedModal, setShowUnsupportedModal] = useState<boolean>(false);

  useEffect(() => {
    // 1. Check if already running in standalone / installed mode
    const isStandalone =
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (typeof window !== 'undefined' && (window.navigator as any)?.standalone === true) ||
      (typeof document !== 'undefined' && typeof document.referrer === 'string' && document.referrer.includes('android-app://'));

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 2. Check if user already dismissed during current session
    if (typeof sessionStorage !== 'undefined') {
      const dismissed = sessionStorage.getItem('superwash_pwa_dismissed');
      if (dismissed === 'true') {
        setIsDismissed(true);
      }
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // 4. Capture native beforeinstallprompt (Android Chrome, Edge, desktop Chromium)
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // 5. Detect app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('superwash_pwa_dismissed');
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('PWA install prompt error:', err);
      }
    } else if (isIOS) {
      setShowIosGuide(true);
    } else {
      setShowUnsupportedModal(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('superwash_pwa_dismissed', 'true');
    }
  };

  // If already installed, don't show any installation prompt
  if (isInstalled) {
    return null;
  }

  // If dismissed by user, only inline buttons stay visible if explicitly clicked
  if (isDismissed && variant !== 'inline-button') {
    return null;
  }

  // In customer-banner mode, if not iOS and deferredPrompt has not fired, do not show disruptive popup
  if (variant === 'customer-banner' && !deferredPrompt && !isIOS) {
    return null;
  }

  return (
    <>
      {/* Variant 1: Staff Header Inline Button */}
      {variant === 'inline-button' && (
        <button
          type="button"
          onClick={handleInstallClick}
          aria-label={`Install ${portalName} App`}
          title={`Install ${portalName} for quick home screen access`}
          className={`px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer shadow-xs ${className}`}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Install App</span>
        </button>
      )}

      {/* Variant 2: Staff Card */}
      {variant === 'staff-card' && (
        <div
          role="region"
          aria-label="Staff App Installation"
          className={`p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${className}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">Install {portalName}</h4>
              <p className="text-xs text-slate-300">
                Launch instantly from your phone home screen with full screen layout
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install Now</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss installation prompt"
              className="p-1.5 text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Variant 3: Customer Banner (Subtle, non-disruptive notification) */}
      {variant === 'customer-banner' && (
        <div
          role="region"
          aria-label="App Installation Offer"
          className={`bg-gradient-to-r from-brand-600 to-cyan-600 text-white shadow-md transition-all animate-fadeIn ${className}`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <p className="text-xs font-medium truncate">
                <span className="font-bold">Install SuperWash Exprez</span>
                <span className="hidden sm:inline text-white/90"> — Fast 1-tap bookings right from your home screen</span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-3 py-1 bg-white hover:bg-slate-100 text-brand-700 font-bold text-xs rounded-lg shadow-xs transition flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>Install</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss install notification"
                className="p-1 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari "Add to Home Screen" Step-by-Step Guide Modal */}
      {showIosGuide && (
        <div
          role="dialog"
          aria-labelledby="ios-guide-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative animate-scaleIn">
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              aria-label="Close guide"
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
              <Smartphone className="w-6 h-6" />
            </div>

            <h3 id="ios-guide-title" className="text-lg font-black text-slate-900 leading-tight">
              Install on iPhone or iPad
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Follow these simple steps in Apple Safari to add SuperWash to your home screen:
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  Tap the <strong className="inline-flex items-center gap-0.5 text-blue-600 font-semibold"><Share className="w-3.5 h-3.5 inline" /> Share</strong> button in Safari's bottom toolbar.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  Scroll down the share sheet and tap <strong className="inline-flex items-center gap-0.5 text-slate-900 font-semibold"><PlusSquare className="w-3.5 h-3.5 inline" /> Add to Home Screen</strong>.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  Tap <strong className="text-slate-900 font-semibold">Add</strong> in the top-right corner to complete installation.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="mt-5 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Fallback Instructions Modal for browsers without direct prompt API */}
      {showUnsupportedModal && (
        <div
          role="dialog"
          aria-labelledby="unsupported-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setShowUnsupportedModal(false)}
              aria-label="Close dialog"
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <Info className="w-6 h-6" />
            </div>

            <h3 id="unsupported-title" className="text-lg font-black text-slate-900 leading-tight">
              Install {portalName}
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              To install this app on your current browser:
            </p>
            <ul className="mt-3 text-xs text-slate-600 space-y-2 list-disc list-inside">
              <li>Open your browser's menu (three dots icon in Chrome / Edge).</li>
              <li>Select <strong>&quot;Install SuperWash Exprez&quot;</strong> or <strong>&quot;Add to Home Screen&quot;</strong>.</li>
            </ul>

            <button
              type="button"
              onClick={() => setShowUnsupportedModal(false)}
              className="mt-5 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </>
  );
};
