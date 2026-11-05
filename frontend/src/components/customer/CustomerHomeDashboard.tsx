import React from 'react';
import { LaundryServiceItem, Order, BusinessSettings } from '../../types';
import { StatusBadge } from '../StatusBadge';
import {
  Sparkles, CalendarCheck, Clock, ArrowRight,
  Truck, ShieldCheck, Scale, Phone, MapPin, CheckCircle2,
  Package, Zap
} from 'lucide-react';

interface CustomerHomeDashboardProps {
  currentUser: { full_name?: string; phone?: string } | null;
  services: LaundryServiceItem[];
  settings?: BusinessSettings | null;
  currentActiveOrder: Order | null;
  onNavigateTab: (tab: 'book' | 'current' | 'history' | 'addresses' | 'profile' | 'settings' | 'contact') => void;
  onSelectServiceAndBook: (serviceId: string) => void;
}

export const CustomerHomeDashboard: React.FC<CustomerHomeDashboardProps> = ({
  currentUser,
  services,
  settings,
  currentActiveOrder,
  onNavigateTab,
  onSelectServiceAndBook
}) => {
  const firstName = currentUser?.full_name?.split(' ')[0] || null;
  const phone = settings?.business_phone || '+91 98765 43210';
  const cleanPhone = phone.replace(/[^0-9+]/g, '');

  const getServiceIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('iron') || lower.includes('press')) return Zap;
    if (lower.includes('dry') || lower.includes('suit') || lower.includes('delicate')) return ShieldCheck;
    if (lower.includes('duvet') || lower.includes('blanket') || lower.includes('heavy')) return Package;
    return Sparkles;
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* 1. Hero Welcome & Quick Action Card */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-cyan-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-bold text-cyan-100 border border-white/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Free Doorstep Pickup & Delivery • Bengaluru</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              {firstName ? `Welcome back, ${firstName}!` : 'Fresh laundry, delivered to your doorstep.'}
            </h1>
            <p className="text-xs sm:text-sm text-cyan-50 font-medium leading-relaxed max-w-xl">
              Hygienic wash, crisp steam press, and organic fabric care. Calibrated digital weighing at your doorstep — zero advance payment required.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigateTab('book')}
              className="py-3.5 px-6 sm:px-8 bg-white hover:bg-slate-100 active:scale-[0.99] text-brand-700 font-black text-sm rounded-2xl shadow-lg transition flex items-center gap-2 cursor-pointer"
            >
              <CalendarCheck className="w-5 h-5 text-brand-600" />
              <span>Schedule Home Pickup</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>

            {currentActiveOrder && (
              <button
                type="button"
                onClick={() => onNavigateTab('current')}
                className="py-3.5 px-5 bg-white/15 hover:bg-white/25 backdrop-blur-md text-white font-bold text-xs rounded-2xl border border-white/30 transition flex items-center gap-2 cursor-pointer"
              >
                <Clock className="w-4 h-4 text-cyan-200" />
                <span>Track Active Order</span>
              </button>
            )}
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-400/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
      </section>

      {/* 2. Active Order Banner (If In-Progress Order Exists) */}
      {currentActiveOrder && currentActiveOrder.order_status !== 'delivered' && currentActiveOrder.order_status !== 'cancelled' && (
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-brand-200 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-sm">Active Laundry Order</h3>
                  <span className="font-mono font-bold text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                    #{currentActiveOrder.order_number}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Scheduled: {currentActiveOrder.pickup_date} • {currentActiveOrder.pickup_slot?.split('(')[0].trim()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-center">
              <StatusBadge status={currentActiveOrder.order_status} />
              <button
                type="button"
                onClick={() => onNavigateTab('current')}
                className="py-2 px-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>Live Tracking</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 3. Available Laundry Services Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-600" />
              Laundry & Dry Cleaning Services
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Transparent per-kilogram and item pricing • Calibrated digital weighing at pickup
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('book')}
            className="text-xs font-bold text-brand-600 hover:text-brand-800 self-start sm:self-auto cursor-pointer"
          >
            Custom Multi-Service Booking →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {services.map((srv) => {
            const Icon = getServiceIcon(srv.name);
            const rateStr = (((srv.unit_price_paise || srv.price_paise || 7900) / 100)).toFixed(0);
            const unitLabel = srv.pricing_unit === 'per_kg' ? 'kg' : srv.pricing_unit.replace('per_', '');

            return (
              <div
                key={srv.id}
                className="bg-white rounded-3xl p-5 border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-slate-900">₹{rateStr}</span>
                      <span className="text-[11px] text-slate-400 font-medium">/{unitLabel}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 text-sm group-hover:text-brand-600 transition-colors">
                      {srv.name}
                    </h3>
                    {srv.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {srv.description}
                      </p>
                    )}
                  </div>

                  {srv.pricing_unit === 'per_kg' && srv.min_weight_kg > 0 && (
                    <div className="inline-block px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[10px] font-mono border border-slate-100">
                      Min. {srv.min_weight_kg} kg weight
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onSelectServiceAndBook(srv.id)}
                  className="w-full py-2.5 px-3 bg-slate-50 hover:bg-brand-600 text-slate-700 hover:text-white font-bold text-xs rounded-xl border border-slate-200 hover:border-brand-600 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CalendarCheck className="w-4 h-4" />
                  <span>Book This Service</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Simple 3-Step Pickup & Delivery Guide */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="w-5 h-5 text-brand-600" />
            How SuperWash Exprez Works
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reliable, doorstep laundry in 3 effortless steps
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-xs">
              1
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Schedule in 60 Seconds</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Choose your laundry services, convenient pickup date, and a 3-hour time slot.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-xs">
              2
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Doorstep Digital Scale</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Our associate arrives with calibrated scales and weighs your laundry directly at your door.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-xs">
              3
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Clean Clothes & COD</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Delivered fresh, sanitized and crisp within 24–48 hours. Pay cash or UPI QR upon delivery.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Customer Support & Facility Coverage */}
      <section className="bg-slate-100/70 rounded-3xl p-5 sm:p-6 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand-600" />
            SuperWash Exprez Laundry Hub
          </span>
          <p className="text-xs text-slate-500">
            Outer Ring Road, Bellandur, Bengaluru • Open Daily 08:00 AM – 08:00 PM
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`tel:${cleanPhone}`}
            className="py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 transition flex items-center gap-1.5 shadow-2xs"
          >
            <Phone className="w-4 h-4 text-emerald-600" />
            <span>Call Support</span>
          </a>
          <button
            type="button"
            onClick={() => onNavigateTab('book')}
            className="py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Book Now</span>
          </button>
        </div>
      </section>
    </div>
  );
};
