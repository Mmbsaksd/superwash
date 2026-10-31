import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles, CalendarCheck, ShoppingBag, User,
  Settings, LogOut, Phone, Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BusinessSettings } from '../types';
import { DEFAULT_SETTINGS } from '../services/laundryService';

interface CustomerTopNavProps {
  settings?: BusinessSettings | null;
  activeTab?: string;
  hasActiveOrder?: boolean;
}

export const CustomerTopNav: React.FC<CustomerTopNavProps> = ({
  settings,
  activeTab,
  hasActiveOrder = false
}) => {
  const { currentUser, logout, isStaff } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const phone = settings?.business_phone || DEFAULT_SETTINGS.business_phone;
  const isLandingPage = location.pathname === '/';
  const isCustomerPage = location.pathname.startsWith('/customer');

  const navLinks = [
    {
      id: 'home',
      label: 'Home',
      to: '/',
      isActive: isLandingPage
    },
    {
      id: 'orders',
      label: 'My Orders',
      to: '/customer?tab=current',
      badge: hasActiveOrder,
      isActive: isCustomerPage && (activeTab === 'current' || activeTab === 'history')
    },
    {
      id: 'profile',
      label: 'My Profile',
      to: '/customer?tab=addresses',
      isActive: isCustomerPage && (activeTab === 'addresses' || activeTab === 'profile')
    },
    {
      id: 'settings',
      label: 'Settings',
      to: '/customer?tab=settings',
      isActive: isCustomerPage && (activeTab === 'settings' || activeTab === 'contact')
    }
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      {/* Top Brand & Actions Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2">
        {/* Brand Logo & Name */}
        <Link
          to="/"
          className="flex items-center gap-2 group hover:opacity-95 transition cursor-pointer shrink-0"
          title="SuperWash Exprez Home"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform shrink-0">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <span className="font-black text-lg sm:text-xl text-slate-900 tracking-tight flex items-center leading-tight">
              Super<span className="text-brand-600">Wash</span>
            </span>
            <span className="block text-[9px] sm:text-[10px] uppercase font-bold tracking-wider sm:tracking-widest text-slate-500 -mt-0.5 truncate">
              Exprez • Bengaluru
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav
          aria-label="Desktop Customer Navigation"
          className="hidden md:flex items-center gap-3 lg:gap-6 text-xs lg:text-sm font-bold text-slate-700"
        >
          {navLinks.map((link) => (
            <Link
              key={link.id}
              to={link.to}
              className={`transition relative py-1 flex items-center gap-1.5 ${
                link.isActive
                  ? 'text-brand-600 font-extrabold border-b-2 border-brand-600'
                  : 'text-slate-600 hover:text-brand-600 font-semibold'
              }`}
            >
              <span>{link.label}</span>
              {link.badge && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </Link>
          ))}
        </nav>

        {/* Right CTA & Profile Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 lg:gap-3 shrink-0">
          {/* Prominent Primary Call To Action */}
          <Link
            to="/customer?tab=book"
            className="py-2 sm:py-2.5 px-2.5 sm:px-4 lg:px-5 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-black text-xs rounded-xl shadow-md shadow-brand-500/20 transition flex items-center gap-1.5 cursor-pointer shrink-0"
            title="Book a Home Pickup"
          >
            <CalendarCheck className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">Book a Home Pickup</span>
            <span className="lg:hidden font-bold">Book</span>
          </Link>

          {/* User Profile / Auth State */}
          {currentUser ? (
            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 pl-1.5 sm:pl-2 border-l border-slate-200">
              <div className="text-right hidden lg:block">
                <span className="block text-xs font-bold text-slate-800 leading-tight truncate max-w-[120px]">
                  {currentUser.full_name?.split(' ')[0] || 'Customer'}
                </span>
                <span className="block text-[10px] text-slate-400 font-mono">
                  {currentUser.phone ? `+91 ${currentUser.phone}` : 'Account'}
                </span>
              </div>

              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.full_name}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-50 text-brand-700 border border-brand-200 flex items-center justify-center font-bold text-xs shrink-0">
                  {currentUser.full_name?.charAt(0) || <User className="w-4 h-4" />}
                </div>
              )}

              {isStaff && (
                <Link
                  to="/admin"
                  className="p-1.5 sm:p-2 text-slate-600 hover:text-brand-600 rounded-xl hover:bg-slate-100 transition shrink-0"
                  title="Staff Portal"
                >
                  <Shield className="w-4 h-4" />
                </Link>
              )}

              <button
                type="button"
                onClick={logout}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/login?redirect=/customer"
              className="py-2 px-2.5 sm:px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0"
              title="Sign In"
            >
              <User className="w-4 h-4 text-slate-600 shrink-0" />
              <span className="hidden sm:inline">Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

