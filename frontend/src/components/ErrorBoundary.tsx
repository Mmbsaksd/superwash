import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Sparkles, RefreshCw, Phone } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../services/laundryService';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  supportPhone?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error | null;
}

/**
 * SuperWash Exprez — Top-Level React Error Boundary
 *
 * Catches uncaught React rendering exceptions across child component trees,
 * logs safe diagnostics without leaking secrets or stack traces, and displays
 * a customer-friendly fallback screen with a "Reload SuperWash" CTA and direct
 * telephone support.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Safe diagnostic logging avoiding tokens, secrets, or PII
    if (process.env.NODE_ENV !== 'test') {
      const sanitized = (error?.message || 'Unknown error').replace(
        /Bearer\s+[A-Za-z0-9._-]+/gi,
        'Bearer [REDACTED]'
      );
      console.error('[SuperWash Error Boundary]:', sanitized, errorInfo?.componentStack);
    }
  }

  handleReload = (): void => {
    try {
      window.location.reload();
    } catch {
      window.location.href = '/';
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const phone = this.props.supportPhone || DEFAULT_SETTINGS.business_phone;
      const cleanPhone = phone.replace(/[^0-9+]/g, '');

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-[70vh] flex items-center justify-center p-4 bg-slate-50 font-sans"
          data-testid="error-boundary-fallback"
        >
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl text-center space-y-5 animate-fade-in">
            {/* SuperWash Branded Badge */}
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-brand-600 to-cyan-500 mx-auto flex items-center justify-center text-white shadow-lg shadow-brand-500/25">
              <Sparkles className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Super<span className="text-brand-600">Wash</span> Exprez
              </h1>
              <p className="text-sm font-semibold text-slate-700">
                Something went wrong. Please try again.
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                We encountered an unexpected issue while loading this page. You can reload the page or reach out to our doorstep care team.
              </p>
            </div>

            {/* Recovery Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto py-3 px-6 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                data-testid="reload-button"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload SuperWash</span>
              </button>

              <a
                href={`tel:${cleanPhone}`}
                className="w-full sm:w-auto py-3 px-5 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] text-slate-800 font-bold text-xs rounded-xl border border-slate-200 transition flex items-center justify-center gap-2 min-h-[44px]"
                data-testid="support-phone-link"
              >
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>Call Support ({phone})</span>
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
