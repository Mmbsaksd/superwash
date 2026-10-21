import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, Lock, Phone, AlertCircle, Loader2, ShieldCheck, UserCheck } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.login({
        phone_or_email: phoneOrEmail.trim(),
        password,
      });

      login(res.data.access_token, res.data.user);

      // Redirect appropriately based on user role
      if (res.data.user.role === 'customer') {
        const from = (location.state as any)?.from?.pathname || '/customer/orders';
        navigate(from, { replace: true });
      } else {
        navigate('/admin', { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid login credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoFill = (id: string, pwd: string) => {
    setPhoneOrEmail(id);
    setPassword(pwd);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white mx-auto shadow-md">
          <Sparkles className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Sign In to SuperWash</h1>
        <p className="text-xs text-slate-500">Access your customer orders or operational staff portal</p>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Demo Credentials Quick Switcher */}
      <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 space-y-2 text-xs">
        <span className="font-bold text-slate-700 block uppercase tracking-wider text-[10px]">
          Demo Quick Sign-In
        </span>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleDemoFill('admin@superwash.in', 'Admin@123')}
            className="p-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 font-bold text-slate-800 text-[11px] text-center transition"
          >
            Admin (Owner)
          </button>
          <button
            type="button"
            onClick={() => handleDemoFill('staff@superwash.in', 'Staff@123')}
            className="p-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 font-bold text-slate-800 text-[11px] text-center transition"
          >
            Store Manager
          </button>
          <button
            type="button"
            onClick={() => handleDemoFill('customer@superwash.in', 'Customer@123')}
            className="p-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 font-bold text-slate-800 text-[11px] text-center transition"
          >
            Customer
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone Number or Email
            </label>
            <input
              type="text"
              placeholder="e.g. 9876543210 or admin@superwash.in"
              value={phoneOrEmail}
              onChange={(e) => setPhoneOrEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-medium text-slate-900"
              required
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" /> Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-medium text-slate-900"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-md shadow-brand-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            Sign In
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          Don't have an account yet?{' '}
          <Link to="/register" className="font-bold text-brand-600 hover:underline">
            Register now
          </Link>
        </div>
      </div>
    </div>
  );
};
