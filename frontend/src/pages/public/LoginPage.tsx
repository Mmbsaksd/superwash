import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DEMO_PROFILES } from '../../services/laundryService';
import { UserRole } from '../../types';
import {
  Phone, Sparkles, KeyRound, ArrowRight,
  CheckCircle2, AlertCircle, Loader2, ArrowLeft, Shield
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { sendOtp, verifyOtp, currentUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [roleHint, setRoleHint] = useState<UserRole | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const clean = phoneNumber.replace(/[^0-9]/g, '');
    if (clean.length < 10) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }

    setIsLoading(true);
    try {
      const res = await sendOtp(clean);
      if (res.success) {
        setInfoMessage(res.message);
        setStep('otp');
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await verifyOtp(phoneNumber, otpCode.trim(), roleHint);
      if (res.success) {
        // Redirect based on role
        const clean = phoneNumber.replace(/[^0-9]/g, '').slice(-10);
        const demo = DEMO_PROFILES.find((p) => p.phone === clean);
        const role = roleHint || demo?.role || (clean === '9876543210' ? 'owner' : clean === '9876543211' ? 'manager' : clean === '9876543215' ? 'delivery' : 'customer');

        if (role === 'owner') {
          navigate('/admin');
        } else if (role === 'manager') {
          navigate('/manager');
        } else if (role === 'delivery') {
          navigate('/delivery');
        } else {
          navigate('/customer');
        }
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemoSelect = (phone: string, role: UserRole) => {
    setPhoneNumber(phone);
    setRoleHint(role);
    setOtpCode('123456');
    setStep('otp');
    setInfoMessage(`Testing as ${role.toUpperCase()}. OTP 123456 prefilled.`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-12">
      <div className="max-w-md w-full mx-auto space-y-5">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white mx-auto shadow-md">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">SuperWash Express</h1>
          <p className="text-xs text-slate-500">Simple Mobile Laundry Pickup & Delivery • Bengaluru</p>
        </div>

        {/* Demo Quick Sign-in Buttons */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            1-Click Test Login (Pre-configured Roles)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickDemoSelect('9876543212', 'customer')}
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
              onClick={() => handleQuickDemoSelect('9876543215', 'delivery')}
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
              onClick={() => handleQuickDemoSelect('9876543211', 'manager')}
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
              onClick={() => handleQuickDemoSelect('9876543210', 'owner')}
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

        {/* Card Form */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
              <span>{infoMessage}</span>
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-brand-600" />
                  Mobile Number
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 font-bold text-slate-500 text-sm">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full pl-12 pr-3 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono font-bold text-base text-slate-900"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  We'll send a 6-digit One-Time Password (OTP) via SMS to verify your phone.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || phoneNumber.length < 10}
                className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-sm rounded-xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="font-bold text-slate-700 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-brand-600" />
                    Enter 6-Digit OTP
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('phone');
                      setOtpCode('');
                      setError(null);
                    }}
                    className="text-[11px] text-brand-600 hover:underline flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" /> Change Number
                  </button>
                </div>

                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full px-3 py-3 text-center tracking-widest text-2xl font-mono font-black rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                  required
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1 text-center">
                  Sent to +91 {phoneNumber}. (Local test code: <b className="text-slate-700 font-mono">123456</b>)
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || otpCode.length !== 6}
                className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-sm rounded-xl shadow-lg shadow-brand-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify & Continue</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
