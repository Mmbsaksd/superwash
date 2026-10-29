import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, ShoppingBag, Plus, User, Settings, Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface CustomerBottomNavProps {
  activeTab?: string;
  hasActiveOrder?: boolean;
}

export const CustomerBottomNav: React.FC<CustomerBottomNavProps> = ({
  activeTab,
  hasActiveOrder = false
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  const isLandingPage = location.pathname === '/';
  const isCustomerPage = location.pathname.startsWith('/customer');

  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      action: () => navigate('/')
    },
    {
      id: 'orders',
      label: 'My Orders',
      icon: ShoppingBag,
      badge: hasActiveOrder,
      action: () => {
        if (!currentUser) {
          navigate('/login?redirect=/customer?tab=current');
        } else {
          navigate('/customer?tab=current');
        }
      }
    },
    {
      id: 'book',
      label: 'Book',
      icon: Plus,
      isPrimary: true,
      action: () => {
        navigate('/customer?tab=book');
      }
    },
    {
      id: 'profile',
      label: 'My Profile',
      icon: User,
      action: () => {
        if (!currentUser) {
          navigate('/login?redirect=/customer?tab=addresses');
        } else {
          navigate('/customer?tab=addresses');
        }
      }
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      action: () => {
        if (!currentUser) {
          navigate('/login?redirect=/customer?tab=settings');
        } else {
          navigate('/customer?tab=settings');
        }
      }
    }
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 shadow-lg select-none"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.isPrimary) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                aria-label="Book a Home Pickup"
                className="flex flex-col items-center justify-center -mt-5 group cursor-pointer focus:outline-none"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-brand-600 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/30 group-active:scale-95 transition-transform border-2 border-white">
                  <Plus className="w-6 h-6 stroke-[2.5]" />
                </div>
                <span className="text-[10px] font-black text-brand-700 mt-0.5 tracking-tight">
                  Book Now
                </span>
              </button>
            );
          }

          let isItemActive = false;
          if (item.id === 'home' && isLandingPage) isItemActive = true;
          if (item.id === 'orders' && isCustomerPage && (activeTab === 'current' || activeTab === 'history')) isItemActive = true;
          if (item.id === 'profile' && isCustomerPage && (activeTab === 'addresses' || activeTab === 'profile')) isItemActive = true;
          if (item.id === 'settings' && isCustomerPage && (activeTab === 'settings' || activeTab === 'contact')) isItemActive = true;

          return (
            <button
              key={item.id}
              type="button"
              onClick={item.action}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-colors cursor-pointer relative ${
                isItemActive
                  ? 'text-brand-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isItemActive ? 'stroke-[2.2]' : ''}`} />
                {item.badge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white animate-pulse" />
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight truncate">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
