import React from 'react';
import { LaundryServiceItem } from '../../types';
import { getOffsetDateIST, getDateOptionLabelIST } from '../../utils/dateUtils';
import {
  Sparkles, Calendar, Clock, ChevronRight, Check,
  Zap, Package, ShieldCheck, Info
} from 'lucide-react';

interface BookingStep1WhatAndWhenProps {
  services: LaundryServiceItem[];
  selectedServiceIds: string[];
  onToggleService: (serviceId: string) => void;
  pickupDate: string;
  onSelectPickupDate: (date: string) => void;
  selectedSlotName: string;
  onSelectSlot: (slotName: string) => void;
  slots: Array<{ id: string; name: string }>;
  estimatedSubtotalPaise: number;
  onNext: () => void;
  bookingStepError: string | null;
}

export const BookingStep1WhatAndWhen: React.FC<BookingStep1WhatAndWhenProps> = ({
  services,
  selectedServiceIds,
  onToggleService,
  pickupDate,
  onSelectPickupDate,
  selectedSlotName,
  onSelectSlot,
  slots,
  estimatedSubtotalPaise,
  onNext,
  bookingStepError
}) => {
  const getServiceIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('iron') || lower.includes('press')) return Zap;
    if (lower.includes('dry') || lower.includes('suit') || lower.includes('delicate')) return ShieldCheck;
    if (lower.includes('duvet') || lower.includes('blanket') || lower.includes('heavy')) return Package;
    return Sparkles;
  };

  const estimatedMinBillRupees = (estimatedSubtotalPaise / 100).toFixed(0);

  return (
    <div className="space-y-6 animate-fade-in" data-step="1">
      {/* Service Selection */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-600" />
            <span>Select Laundry Service(s)</span>
          </label>
          {selectedServiceIds.length > 1 && (
            <span className="text-[11px] font-bold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200 self-start sm:self-auto">
              {selectedServiceIds.length} Services Selected (Combined Pickup)
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((srv) => {
            const isSelected = selectedServiceIds.includes(srv.id);
            const Icon = getServiceIcon(srv.name);
            const rateStr = (((srv.unit_price_paise || srv.price_paise || 7900) / 100)).toFixed(0);
            const unitLabel = srv.pricing_unit === 'per_kg' ? 'kg' : srv.pricing_unit.replace('per_', '');

            return (
              <div
                key={srv.id}
                onClick={() => onToggleService(srv.id)}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer select-none flex items-start gap-3.5 ${
                  isSelected
                    ? 'border-brand-600 bg-brand-50/70 shadow-sm ring-4 ring-brand-500/10'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-slate-900 text-sm leading-snug">
                      {srv.name}
                    </h4>
                    <div className="text-right shrink-0">
                      <span className="font-black text-brand-700 text-sm">₹{rateStr}</span>
                      <span className="text-[10px] text-slate-400 block font-normal">/{unitLabel}</span>
                    </div>
                  </div>

                  {srv.description && (
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {srv.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    {srv.pricing_unit === 'per_kg' && srv.min_weight_kg > 0 && (
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                        Min. {srv.min_weight_kg} kg
                      </span>
                    )}
                    <div className="ml-auto">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                          isSelected
                            ? 'bg-brand-600 border-brand-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Simple Subtotal Estimate Pill */}
      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <Info className="w-4 h-4 text-brand-600 shrink-0" />
          <span>
            Estimated minimum total: <strong className="text-slate-900">₹{estimatedMinBillRupees}</strong>
            <span className="text-slate-400 ml-1">(combined 1 kg minimum order)</span>
          </span>
        </div>
        <span className="text-[11px] text-emerald-700 font-bold self-start sm:self-auto">
          ✓ Pay after doorstep weighing (COD)
        </span>
      </div>

      {/* Pickup Date Selector */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-600" />
          <span>Choose Pickup Date</span>
        </label>

        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((offset) => {
            const isoDate = getOffsetDateIST(offset);
            const label = getDateOptionLabelIST(offset);
            const isSelected = pickupDate === isoDate;

            return (
              <button
                type="button"
                key={isoDate}
                onClick={() => onSelectPickupDate(isoDate)}
                className={`py-3 px-3 rounded-2xl border-2 text-center transition cursor-pointer min-h-[48px] ${
                  isSelected
                    ? 'border-brand-600 bg-brand-50 text-brand-800 font-bold ring-4 ring-brand-500/10 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium'
                }`}
              >
                <span className="block text-xs font-bold">{label}</span>
                <span className="block text-[11px] text-slate-400 mt-0.5 font-mono">
                  {isoDate.split('-').reverse().slice(0, 2).join('/')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Window Selector */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-600" />
          <span>Select 3-Hour Time Window</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(slots.length > 0 ? slots : [
            { id: 'slot-1', name: 'Morning (08:00 AM - 11:00 AM)' },
            { id: 'slot-2', name: 'Noon (11:00 AM - 02:00 PM)' },
            { id: 'slot-3', name: 'Afternoon (02:00 PM - 05:00 PM)' },
            { id: 'slot-4', name: 'Evening (05:00 PM - 08:00 PM)' }
          ]).map((s) => {
            const isSelected = selectedSlotName === s.name;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSlot(s.name)}
                className={`p-3.5 rounded-2xl border-2 text-left transition flex items-center justify-between cursor-pointer min-h-[48px] ${
                  isSelected
                    ? 'border-brand-600 bg-brand-50 text-brand-900 font-bold ring-4 ring-brand-500/10'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
                    }`}
                  >
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs">{s.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {bookingStepError && (
        <p className="text-xs text-rose-600 font-bold bg-rose-50 p-3 rounded-xl border border-rose-200">
          {bookingStepError}
        </p>
      )}

      {/* Step 1 Primary Navigation Button */}
      <div className="pt-4 border-t border-slate-100 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="w-full sm:w-auto py-3.5 px-8 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-bold text-xs rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
        >
          <span>Continue to Location & Contact</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
