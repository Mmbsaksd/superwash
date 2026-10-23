import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DEMO_PROFILES } from '../../services/laundryService';
import { UserRole } from '../../types';
import {
  Sparkles, ArrowRight, CheckCircle2,
  AlertCircle, Loader2, ShieldCheck, Lock, User, KeyRound
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle, signInWithPassword, switchDemoRole, currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [authTab, setAuthTab] = useState<'customer' | 'staff'>('customer');
  const [staffEmail, setStaffEmail] = useState<string>('manager@superwash.in');
  const [staffPassword, setStaffPassword] = useState<string>('');
  const [isStaffSubmitting, setIsStaffSubmitting] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Check URL query parameters for OAuth error / cancellation callbacks
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    const errorDesc =
      params.get('error_description') ||
      params.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error');

    if (errorDesc) {
      setError(decodeURIComponent(errorDesc).replace(/\+/g, ' '));
    }

    const roleParam = params.get('role');
    if (roleParam === 'manager' || roleParam === 'delivery' || roleParam === 'staff') {
      setAuthTab('staff');
      if (roleParam === 'delivery') {
        setStaffEmail('superwash.audit.1792664886550@gmail.com');
      } else {
        setStaffEmail('manager@superwash.in');
      }
      return;
    }

    if (params.get('logout') === 'true') {
      logout();
      return;
    }

    // Only auto-redirect if user is logged in with a staff/manager account
    if (currentUser && currentUser.role !== 'customer') {
      redirectByRole(currentUser.role);
    }
  }, [currentUser, location]);

  const redirectByRole = (role: UserRole) => {
    if (role === 'owner') {
      navigate('/admin');
    } else if (role === 'manager') {
      navigate('/manager');
    } else if (role === 'delivery') {
      navigate('/delivery');
    } else {
      navigate('/customer');
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfoMessage(null);
    setIsLoading(true);

    try {
      const res = await signInWithGoogle();
      if (!res.success && res.message) {
        setError(res.message);
        setIsLoading(false);
      }
      // If demo mode instant login occurred:
      if (res.success && res.message?.includes('Demo')) {
        setInfoMessage('Signed in successfully! Redirecting...');
        setTimeout(() => navigate('/customer'), 500);
      }
    } catch (err: any) {
      setError(err.message || 'Google sign-in could not be initiated.');
      setIsLoading(false);
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!staffEmail.trim() || !staffPassword.trim()) {
      setError('Please enter both your staff email and password.');
      return;
    }

    setIsStaffSubmitting(true);
    try {
      const res = await signInWithPassword(staffEmail.trim(), staffPassword);
      if (!res.success) {
        setError(res.message || 'Staff authentication failed. Please verify credentials.');
        setIsStaffSubmitting(false);
        return;
      }
      setInfoMessage('Staff authenticated successfully. Redirecting to dashboard...');
      const role = res.role || 'manager';
      setTimeout(() => redirectByRole(role), 300);
    } catch (err: any) {
      setError(err?.message || 'Authentication service error.');
      setIsStaffSubmitting(false);
    }
  };

  const handleQuickDemoSelect = (role: UserRole) => {
    switchDemoRole(role);
    setInfoMessage(`Switched to ${role.toUpperCase()} persona.`);
    setTimeout(() => redirectByRole(role), 300);
  };

  const isDemoOrDev = import.meta.env.VITE_DEMO_MODE === 'true' || import.meta.env.DEV;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-12">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white mx-auto shadow-md">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">SuperWash Express</h1>
          <p className="text-xs text-slate-500">Premium Laundry Pickup & Delivery • Bengaluru</p>
        </div>

        {/* Demo Quick Persona Selector (Development / Demo Mode Only) */}
        {isDemoOrDev && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Development & Demo Personas
              </span>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Demo Active
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickDemoSelect('customer')}
                className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 text-blue-900 font-bold text-left transition flex items-center justify-between"
              >
                <div>
                  <span className="block text-xs">Priya Patel</span>
                  <span className="text-[10px] text-blue-600 font-normal">Customer</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoSelect('delivery')}
                className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/70 text-emerald-900 font-bold text-left transition flex items-center justify-between"
              >
                <div>
                  <span className="block text-xs">Ramesh Kumar</span>
                  <span className="text-[10px] text-emerald-600 font-normal">Delivery Staff</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoSelect('manager')}
                className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-100/70 text-purple-900 font-bold text-left transition flex items-center justify-between"
              >
                <div>
                  <span className="block text-xs">Ananya Verma</span>
                  <span className="text-[10px] text-purple-600 font-normal">Store Manager</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-purple-600" />
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoSelect('owner')}
                className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-100/70 text-amber-900 font-bold text-left transition flex items-center justify-between"
              >
                <div>
                  <span className="block text-xs">Rajesh Sharma</span>
                  <span className="text-[10px] text-amber-700 font-normal">Business Owner</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
              </button>
            </div>
          </div>
        )}

        {/* Primary Login Card with Dual Customer & Staff Tabs */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          {/* Tab Selector */}
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => { setAuthTab('customer'); setError(null); }}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 ${
                authTab === 'customer'
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Customer</span>
            </button>
            <button
              id="staff-tab-btn"
              type="button"
              onClick={() => { setAuthTab('staff'); setError(null); }}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 ${
                authTab === 'staff'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Staff Portal</span>
            </button>
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-2xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
              <span>{infoMessage}</span>
            </div>
          )}

          {authTab === 'customer' ? (
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <h2 className="font-black text-slate-900 text-lg">Customer Sign In</h2>
                <p className="text-slate-500 text-xs">
                  Fast, password-free login with your verified Google account.
                </p>
              </div>

              {/* Official Google Sign-in Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 active:scale-[0.99] border-2 border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-sm rounded-2xl shadow-sm transition flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span className="text-slate-800 font-black">Continue with Google</span>
              </button>

              <div className="pt-2 border-t border-slate-100 space-y-2 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>No SMS OTP delays • Instant 1-click authentication</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Your contact mobile number and pickup address will be securely collected when you place your first laundry order.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleStaffLogin} className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className="font-black text-slate-900 text-lg">Staff Authentication</h2>
                <p className="text-slate-500 text-xs">
                  Sign in with your verified Store Manager or Delivery staff account.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Staff Email Address
                  </label>
                  <input
                    id="staff-email-input"
                    type="email"
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    required
                    placeholder="manager@superwash.in"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <input
                    id="staff-password-input"
                    type="password"
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <button
                  id="staff-login-btn"
                  type="submit"
                  disabled={isStaffSubmitting}
                  className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {isStaffSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  <span>Sign In to Staff Portal</span>
                </button>
              </div>

              {/* Quick credential pre-fill helpers */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Quick Staff Credentials
                </span>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStaffEmail('manager@superwash.in');
                      setStaffPassword('');
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium transition"
                  >
                    Store Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffEmail('superwash.audit.1792664886550@gmail.com');
                      setStaffPassword('');
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium transition"
                  >
                    Delivery Staff (Ramesh)
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs">
          <Lock className="w-3.5 h-3.5" />
          <span>Encrypted Supabase OAuth 2.0 • Asia/Kolkata</span>
        </div>
      </div>
    </div>
  );
};
