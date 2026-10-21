import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles, Phone, User as UserIcon, LogOut,
  Menu, X, Shield, CalendarCheck, Search, ShoppingBag
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, logout, isStaff } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      {/* Top microbar */}
      <div className="bg-slate-900 text-slate-300 text-xs py-1.5 px-4 hidden sm:block">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Phone className="w-3.5 h-3.5 text-brand-400" /> +91 98765 43210 (Indiranagar, Bengaluru)
            </span>
            <span className="text-slate-500">|</span>
            <span>Shop Hours: Mon - Sun, 8:00 AM - 9:00 PM</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-emerald-400 font-medium">Free Pickup & Delivery on orders over ₹500</span>
            <Link to="/track" className="hover:text-white transition underline">Track Live Order</Link>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-20">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center">
                Super<span className="text-brand-600">Wash</span>
              </span>
              <span className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 -mt-1">
                Express & Dry Clean
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-700">
            <Link to="/" className="hover:text-brand-600 transition">Home</Link>
            <Link to="/services" className="hover:text-brand-600 transition">Services & Pricing</Link>
            <Link to="/how-it-works" className="hover:text-brand-600 transition">How It Works</Link>
            <Link to="/track" className="hover:text-brand-600 transition flex items-center gap-1.5 text-slate-600">
              <Search className="w-4 h-4 text-brand-500" /> Track Order
            </Link>
            <Link to="/contact" className="hover:text-brand-600 transition">Contact</Link>
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                {isStaff ? (
                  <Link
                    to="/admin"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-sm"
                  >
                    <Shield className="w-3.5 h-3.5 text-brand-400" /> Admin Dashboard
                  </Link>
                ) : (
                  <Link
                    to="/customer/orders"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold hover:bg-brand-100 transition border border-brand-200"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" /> My Orders
                  </Link>
                )}

                <div className="flex items-center gap-2 pl-2 border-l border-slate-200 text-sm">
                  <span className="font-semibold text-slate-800 text-xs">{user.full_name.split(' ')[0]}</span>
                  <button
                    onClick={handleLogout}
                    title="Sign Out"
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-brand-600 transition"
                >
                  Sign In
                </Link>
              </div>
            )}

            <Link
              to="/book"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-600 text-white text-sm font-bold shadow-md shadow-brand-500/25 hover:from-brand-700 hover:to-cyan-700 transition transform hover:-translate-y-0.5"
            >
              <CalendarCheck className="w-4 h-4" /> Book Service
            </Link>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex md:hidden items-center gap-2">
            <Link
              to="/book"
              className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-bold"
            >
              Book
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-600 hover:text-slate-900 focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-slate-700 font-medium"
          >
            Home
          </Link>
          <Link
            to="/services"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-slate-700 font-medium"
          >
            Services & Pricing
          </Link>
          <Link
            to="/how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-slate-700 font-medium"
          >
            How It Works
          </Link>
          <Link
            to="/track"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-slate-700 font-medium"
          >
            Track Order
          </Link>
          <Link
            to="/contact"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-slate-700 font-medium"
          >
            Contact & Location
          </Link>

          <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
            {user ? (
              <>
                {isStaff && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full py-2.5 text-center bg-slate-900 text-white text-sm font-semibold rounded-lg"
                  >
                    Admin Dashboard
                  </Link>
                )}
                <Link
                  to="/customer/orders"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-2.5 text-center bg-brand-50 text-brand-700 text-sm font-semibold rounded-lg border border-brand-200"
                >
                  My Orders ({user.full_name})
                </Link>
                <button
                  onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                  className="w-full py-2 text-center text-red-600 text-sm font-medium"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 py-2 text-center border border-slate-300 rounded-lg text-slate-700 font-semibold text-sm"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 py-2 text-center bg-brand-600 text-white rounded-lg font-semibold text-sm"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
