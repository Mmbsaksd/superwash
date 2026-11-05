import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, CalendarCheck, ShoppingBag, User, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BusinessSettings } from '../../types';

interface CustomerHeaderProps {
  settings?: BusinessSettings | null;
  activeTab: string;
  onTabChange: (tab: 'home' | 'book' | 'current' | 'history' | 'addresses' | 'profile' | 'settings' | 'contact') => void;
  hasActiveOrder?: boolean;
}

export const CustomerHeader: React.FC<CustomerHeaderProps> = ({
  activeTab,
  onTabChange,
  hasActiveOrder = false
}) => {
  const { currentUser, logout } = useAuth();

  const isHomeActive = activeTab === 'home';
  const isBookActive = activeTab === 'book';
  const isOrdersActive = activeTab === 'current' || activeTab === 'history';
  const isProfileActive = activeTab === 'addresses' || activeTab === 'profile';

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3">
        {/* Brand Logo & Name */}
        <Link
          to="/"
          className="flex items-center gap-2.5 group hover:opacity-95 transition cursor-pointer shrink-0"
          title="SuperWash Exprez Home"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="font-black text-lg sm:text-xl text-slate-900 tracking-tight flex items-center leading-tight">
              Super<span className="text-brand-600">Wash</span>
            </span>
            <span className="block text-[10px] sm:text-[11px] uppercase font-bold tracking-wider text-slate-500 -mt-0.5 truncate">
              Exprez • Bengaluru
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Destinations */}
        <nav
          aria-label="Desktop Customer Navigation"
          className="hidden md:flex items-center gap-2 lg:gap-3 text-xs sm:text-sm font-bold"
        >
          <button
            type="button"
            onClick={() => onTabChange('home')}
            className={`px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
              isHomeActive
                ? 'bg-brand-50 text-brand-700 font-extrabold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('book')}
            className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
              isBookActive
                ? 'bg-brand-600 text-white font-extrabold shadow-sm shadow-brand-500/25'
                : 'bg-brand-50 text-brand-700 hover:bg-brand-100 font-bold'
            }`}
          >
            <CalendarCheck className="w-4 h-4 shrink-0" />
            <span>Schedule Pickup</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('current')}
            className={`px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 relative cursor-pointer ${
              isOrdersActive
                ? 'bg-brand-50 text-brand-700 font-extrabold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span>My Orders</span>
            {hasActiveOrder && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onTabChange('addresses')}
            className={`px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
              isProfileActive
                ? 'bg-brand-50 text-brand-700 font-extrabold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <User className="w-4 h-4 shrink-0" />
            <span>Profile</span>
          </button>
        </nav>

        {/* Right CTA & Account Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {currentUser ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-right hidden sm:block">
                <span className="block text-xs font-bold text-slate-800 leading-tight truncate max-w-[150px]">
                  {currentUser.full_name || 'Customer'}
                </span>
                <span className="block text-[10px] text-slate-400 font-mono">
                  {currentUser.phone ? `+91 ${currentUser.phone}` : (currentUser.email ? currentUser.email.split('@')[0] : 'Account')}
                </span>
              </div>

              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.full_name || 'Profile'}
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-2xs"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 border border-brand-200 flex items-center justify-center font-bold text-xs shadow-2xs">
                  {currentUser.full_name?.charAt(0) || <User className="w-4 h-4" />}
                </div>
              )}

              <button
                type="button"
                onClick={logout}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              to={`/login?redirect=${encodeURIComponent('/customer?tab=book&resume=draft')}`}
              className="py-2 px-3.5 sm:px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <User className="w-4 h-4" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
