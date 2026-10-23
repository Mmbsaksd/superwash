import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { currentUser, isLoading, logout } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" data-testid="auth-loading">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (currentUser.is_active === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" data-testid="account-deactivated">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Account Deactivated</h2>
            <p className="text-xs text-slate-500 mt-1">
              Your staff account has been deactivated by the business owner.
            </p>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            You no longer have access to staff tools or operational portals. Please contact the business owner if you believe this is an error.
          </p>
          <div className="pt-2">
            <button
              onClick={() => logout()}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition text-center cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" data-testid="access-denied">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Access Restricted</h2>
            <p className="text-xs text-slate-500 mt-1">
              The requested portal requires an authorized role.
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-700 font-mono text-left space-y-1">
            <div><span className="text-slate-400">Account:</span> {currentUser.email || currentUser.full_name}</div>
            <div>
              <span className="text-slate-400">Assigned Role:</span>{' '}
              <span className="font-bold uppercase text-amber-600">{currentUser.role}</span>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            {currentUser.role === 'customer'
              ? 'Your account does not have access to operational staff portals.'
              : 'You do not have permission to access this portal with your current operational role.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <a
              href="/admin/login"
              className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition text-center"
            >
              Staff Sign In
            </a>
            <a
              href={currentUser.role === 'customer' ? '/customer' : currentUser.role === 'delivery' ? '/delivery' : '/manager'}
              className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition text-center flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Return to Portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
