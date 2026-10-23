import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  Sparkles, Lock, KeyRound, CheckCircle2, AlertCircle,
  Loader2, ArrowRight, Eye, EyeOff, Mail, ArrowLeft, ShieldCheck
} from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendPasswordResetEmail, resetPassword } = useAuth();

  // Form states
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  // Status states
  const [isVerifying, setIsVerifying] = useState<boolean>(true);
  const [hasValidSession, setHasValidSession] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Resend / Request new link states
  const [resendEmail, setResendEmail] = useState<string>('');
  const [isResending, setIsResending] = useState<boolean>(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const verifyRecoverySession = async () => {
      setIsVerifying(true);
      setError(null);

      // 1. Inspect URL Query and Hash parameters for errors
      const params = new URLSearchParams(location.search);
      const hashClean = location.hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hashClean);

      const errorDesc =
        params.get('error_description') ||
        params.get('error') ||
        hashParams.get('error_description') ||
        hashParams.get('error');

      if (errorDesc) {
        if (isMounted) {
          const cleanDesc = decodeURIComponent(errorDesc).replace(/\+/g, ' ');
          setError(
            cleanDesc.toLowerCase().includes('expired') || cleanDesc.toLowerCase().includes('otp')
              ? 'This password reset link has expired or has already been used. Please request a fresh reset link below.'
              : cleanDesc
          );
          setIsVerifying(false);
          setHasValidSession(false);
        }
        return;
      }

      // 2. PKCE Authorization Code Exchange (e.g. ?code=...)
      const code = params.get('code');
      if (code) {
        try {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            if (isMounted) {
              setError('Failed to verify recovery code: ' + exchangeError.message);
              setIsVerifying(false);
              setHasValidSession(false);
            }
            return;
          }
          if (data?.session && isMounted) {
            setHasValidSession(true);
            setIsVerifying(false);
            return;
          }
        } catch (err: any) {
          if (isMounted) {
            setError(err?.message || 'Error exchanging authorization code.');
            setIsVerifying(false);
            setHasValidSession(false);
          }
          return;
        }
      }

      // 3. Token Hash OTP Verification (e.g. ?token_hash=...&type=recovery)
      const tokenHash = params.get('token_hash');
      const authType = params.get('type');
      if (tokenHash && authType === 'recovery') {
        try {
          const { data, error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery'
          });
          if (otpError) {
            if (isMounted) {
              setError('Recovery token verification failed: ' + otpError.message);
              setIsVerifying(false);
              setHasValidSession(false);
            }
            return;
          }
          if (data?.session && isMounted) {
            setHasValidSession(true);
            setIsVerifying(false);
            return;
          }
        } catch (err: any) {
          if (isMounted) {
            setError(err?.message || 'Error verifying recovery token.');
            setIsVerifying(false);
            setHasValidSession(false);
          }
          return;
        }
      }

      // 4. Implicit Hash Tokens or Active Session Check
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && isMounted) {
          setHasValidSession(true);
          setIsVerifying(false);
          return;
        }
      } catch (err) {
        console.warn('Session verification notice:', err);
      }

      // 5. In Demo Mode (local development without Supabase and not running test suite)
      if (!isSupabaseConfigured && import.meta.env.VITE_DEMO_MODE === 'true' && import.meta.env.MODE !== 'test') {
        if (isMounted) {
          setHasValidSession(true);
          setIsVerifying(false);
        }
        return;
      }

      // 6. No valid recovery session could be established
      if (isMounted) {
        setHasValidSession(false);
        setIsVerifying(false);
        setError('No active password recovery session. Please use the reset link sent to your inbox or request a new one below.');
      }
    };

    verifyRecoverySession();

    // Listen for PASSWORD_RECOVERY or SIGNED_IN event
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session?.user)) {
          if (isMounted) {
            setHasValidSession(true);
            setIsVerifying(false);
            setError(null);
          }
        }
      });
      subscription = data?.subscription || null;
    } catch {
      // Ignore in mock/testing environments without event subscription
    }

    return () => {
      isMounted = false;
      if (subscription?.unsubscribe) subscription.unsubscribe();
    };
  }, [location]);

  // Handle password submission
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one letter and one number.');
      return;
    }

    if (password !== confirmPassword) {
      setError('New Password and Confirm Password do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSupabaseConfigured || import.meta.env.MODE === 'test') {
        const { data, error: updateError } = await supabase.auth.updateUser({
          password: password.trim()
        });

        if (updateError) {
          setError(updateError.message || 'Failed to update password.');
          setIsSubmitting(false);
          return;
        }
      } else {
        // Context fallback / Demo mode
        const res = await resetPassword(password.trim());
        if (!res.success) {
          setError(res.message);
          setIsSubmitting(false);
          return;
        }
      }

      setSuccessMessage('Your password has been successfully reset! You can now sign in with your new credentials.');
      setIsSubmitting(false);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while updating your password.');
      setIsSubmitting(false);
    }
  };

  // Handle request for a fresh reset link
  const handleResendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError(null);
    setResendSuccess(null);

    const cleanEmail = resendEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setResendError('Please enter a valid staff email address.');
      return;
    }

    setIsResending(true);
    try {
      const res = await sendPasswordResetEmail(cleanEmail);
      if (res.success) {
        setResendSuccess(res.message);
        setResendEmail('');
      } else {
        setResendError(res.message);
      }
    } catch (err: any) {
      setResendError(err?.message || 'Failed to send password reset email.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sm:p-8 space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/30">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h1 className="font-black text-slate-900 text-xl tracking-tight">SuperWash Express</h1>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Staff Password Recovery
            </p>
          </div>
        </div>

        {/* Loading State during Token / Session Verification */}
        {isVerifying ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3" data-testid="verifying-recovery">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
            <p className="text-xs font-bold text-slate-600">Verifying secure password recovery link...</p>
          </div>
        ) : successMessage ? (
          /* ================= SUCCESS STATE ================= */
          <div className="space-y-5 text-center" data-testid="reset-success-card">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="font-black text-slate-900 text-lg">Password Reset Complete!</h2>
              <p className="text-slate-600 text-xs leading-relaxed">
                {successMessage}
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/login?role=staff')}
              className="w-full py-3.5 px-4 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-black text-sm rounded-2xl shadow-md shadow-brand-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Sign In with New Password</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : hasValidSession ? (
          /* ================= ACTIVE RECOVERY FORM ================= */
          <form onSubmit={handleResetSubmit} className="space-y-4" data-testid="reset-password-form">
            <div className="text-center space-y-1">
              <h2 className="font-black text-slate-900 text-lg">Set New Password</h2>
              <p className="text-slate-500 text-xs">
                Enter your new password below to secure your staff account.
              </p>
            </div>

            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl flex items-center gap-2" data-testid="reset-error">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              {/* New Password Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="new-password">
                  New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters with letters & numbers"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-sm font-semibold transition text-slate-800 placeholder:text-slate-400 bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="confirm-password">
                  Confirm New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-sm font-semibold transition text-slate-800 placeholder:text-slate-400 bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Password Validation Hints */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1 text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className={password.length >= 8 ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                  {password.length >= 8 ? '✓' : '•'} Minimum 8 characters ({password.length}/8)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={(/[A-Za-z]/.test(password) && /[0-9]/.test(password)) ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                  {(/[A-Za-z]/.test(password) && /[0-9]/.test(password)) ? '✓' : '•'} Includes both letters and numbers
                </span>
              </div>
              {confirmPassword.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className={password === confirmPassword ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
                    {password === confirmPassword ? '✓ Passwords match' : '✕ Passwords do not match'}
                  </span>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || password.length < 8 || password !== confirmPassword}
              className="w-full py-3.5 px-4 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-black text-sm rounded-2xl shadow-md shadow-brand-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <span>Save New Password</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <Link
                to="/login?role=staff"
                className="text-xs font-bold text-slate-500 hover:text-brand-600 inline-flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Staff Sign In</span>
              </Link>
            </div>
          </form>
        ) : (
          /* ================= INVALID / EXPIRED LINK STATE ================= */
          <div className="space-y-5" data-testid="expired-recovery-card">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-2">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h2 className="font-black text-slate-900 text-lg">Reset Link Expired or Invalid</h2>
              <p className="text-slate-500 text-xs leading-relaxed">
                {error || 'This recovery link is no longer valid or has already been used. You can request a fresh password reset link below.'}
              </p>
            </div>

            {resendSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Instructions Sent!</span>
                </div>
                <p>{resendSuccess}</p>
                <div className="pt-2">
                  <Link
                    to="/login?role=staff"
                    className="font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Return to Login</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResendReset} className="space-y-3" data-testid="resend-reset-form">
                {resendError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{resendError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="resend-email">
                    Staff Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="resend-email"
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="e.g. manager@superwash.in"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-xs font-semibold transition text-slate-800 placeholder:text-slate-400 bg-slate-50/50"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isResending || !resendEmail.trim()}
                  className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-bold text-xs rounded-2xl shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isResending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Instructions...</span>
                    </>
                  ) : (
                    <>
                      <span>Send New Reset Link</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="text-center pt-2 border-t border-slate-100">
              <Link
                to="/login?role=staff"
                className="text-xs font-bold text-slate-500 hover:text-brand-600 inline-flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Staff Sign In</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default ResetPasswordPage;
