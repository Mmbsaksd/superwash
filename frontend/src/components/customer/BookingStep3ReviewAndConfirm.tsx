import React from 'react';
import { LaundryServiceItem, PublicPromotion, Coupon } from '../../types';
import {
  CheckCircle2, ChevronLeft, Calendar, MapPin, User,
  TicketPercent, Tag, Banknote, Scale, Loader2,
  Lock, RefreshCw
} from 'lucide-react';

export interface AppliedCouponState {
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  discount_paise: number;
  min_order_paise?: number;
  max_discount_paise?: number | null;
  description?: string;
}

interface BookingStep3ReviewAndConfirmProps {
  selectedServices: LaundryServiceItem[];
  pickupDate: string;
  selectedSlotName: string;
  customerName: string;
  customerPhone: string;
  pickupAddressLine: string;
  pickupLandmark?: string;
  pickupPincode: string;
  hasGpsPin: boolean;
  estimatedSubtotalPaise: number;
  appliedCoupon: AppliedCouponState | null;
  availablePromotions: Array<PublicPromotion | Coupon>;
  couponCodeInput: string;
  onCouponCodeInputChange: (val: string) => void;
  onApplyCoupon: (codeOverride?: string) => void;
  onRemoveCoupon: () => void;
  couponValidationLoading: boolean;
  couponError: string | null;
  couponSuccessMessage: string | null;
  isSubmitting: boolean;
  isResolvingPending: boolean;
  pendingRecoveryStatus?: string;
  statusCheckOutcome?: string | null;
  isAuthenticated: boolean;
  onPrev: () => void;
  onConfirmBooking: (e: React.FormEvent) => void;
}

export const BookingStep3ReviewAndConfirm: React.FC<BookingStep3ReviewAndConfirmProps> = ({
  selectedServices,
  pickupDate,
  selectedSlotName,
  customerName,
  customerPhone,
  pickupAddressLine,
  pickupLandmark,
  pickupPincode,
  hasGpsPin,
  estimatedSubtotalPaise,
  appliedCoupon,
  availablePromotions,
  couponCodeInput,
  onCouponCodeInputChange,
  onApplyCoupon,
  onRemoveCoupon,
  couponValidationLoading,
  couponError,
  couponSuccessMessage,
  isSubmitting,
  isResolvingPending,
  pendingRecoveryStatus,
  statusCheckOutcome,
  isAuthenticated,
  onPrev,
  onConfirmBooking
}) => {
  const estimatedMinBill = (estimatedSubtotalPaise / 100).toFixed(0);
  const estimatedDiscount = appliedCoupon ? (appliedCoupon.discount_paise / 100).toFixed(0) : '0';
  const estimatedPayable = appliedCoupon
    ? Math.max(0, Math.round((estimatedSubtotalPaise - appliedCoupon.discount_paise) / 100)).toFixed(0)
    : estimatedMinBill;

  return (
    <div className="space-y-6 animate-fade-in" data-step="3">
      {/* 1. Review Summary Grid */}
      <div className="space-y-3">
        <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-brand-600" />
          <span>Review Booking Details</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Services & Estimated Price */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Selected Service(s)
            </span>
            <div className="space-y-1">
              {selectedServices.map((s) => (
                <div key={s.id} className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-900">{s.name}</span>
                  <span className="font-mono text-brand-700 font-bold">
                    ₹{(((s.unit_price_paise || s.price_paise || 7900) / 100)).toFixed(0)}/{s.pricing_unit === 'per_kg' ? 'kg' : s.pricing_unit.replace('per_', '')}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-slate-200/80 flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">Est. Min Subtotal:</span>
              <span className="font-black text-slate-900">₹{estimatedMinBill}</span>
            </div>
          </div>

          {/* Schedule Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Scheduled Pickup
            </span>
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Calendar className="w-4 h-4 text-brand-600" />
              <span>{pickupDate}</span>
            </div>
            <p className="text-xs text-slate-600 font-medium">
              {selectedSlotName}
            </p>
          </div>

          {/* Address Card */}
          <div className="sm:col-span-2 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Pickup Address
              </span>
              {hasGpsPin && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                  📍 Exact Doorstep GPS Attached
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-900 leading-relaxed">
              {pickupAddressLine ? `Doorstep: ${pickupAddressLine}` : 'No address specified'}
            </p>
            <div className="text-[11px] text-slate-500 flex flex-wrap gap-2">
              <span>PIN: {pickupPincode}</span>
              {pickupLandmark && <span>• Landmark: {pickupLandmark}</span>}
            </div>
          </div>

          {/* Contact Card */}
          <div className="sm:col-span-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-brand-600 shrink-0" />
              <div>
                <span className="font-bold text-slate-900">{customerName || 'Customer'}</span>
                <span className="text-slate-500 ml-2 font-mono">+91 {customerPhone}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Promotional Coupon Section (Option A Policy) */}
      <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <TicketPercent className="w-4 h-4 text-brand-600" />
            <span>Promotional Offers & Coupons</span>
          </label>
          {appliedCoupon ? (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
              Coupon Attached
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-slate-400">
              Optional
            </span>
          )}
        </div>

        {appliedCoupon ? (
          <div className="bg-white border border-emerald-300 rounded-2xl p-4 space-y-2 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-slate-900 text-sm tracking-wider">
                      {appliedCoupon.code}
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full">
                      {appliedCoupon.discount_type === 'percentage'
                        ? `${appliedCoupon.discount_value}% OFF`
                        : `₹${(appliedCoupon.discount_paise / 100).toFixed(0)} OFF`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    Preliminary Discount: <strong className="text-emerald-700 font-bold">Up to ₹{estimatedDiscount}</strong>
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                    Final discount is confirmed from verified scale weight at intake.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onRemoveCoupon}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 px-2.5 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {availablePromotions.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600 block">
                  Available Offers:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availablePromotions.map((promo) => (
                    <div
                      key={promo.code}
                      className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-brand-900 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200">
                            {promo.code}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700">
                            {promo.discount_type === 'percentage'
                              ? `${promo.discount_value}% OFF`
                              : `₹${(promo.discount_value / 100).toFixed(0)} OFF`}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onApplyCoupon(promo.code)}
                        disabled={couponValidationLoading}
                        className="px-3 py-1 bg-brand-50 hover:bg-brand-600 text-brand-700 hover:text-white border border-brand-200 hover:border-brand-600 rounded-lg font-bold text-[11px] transition shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Promo Input */}
            <div className="pt-1 flex items-center gap-2">
              <input
                type="text"
                value={couponCodeInput}
                onChange={(e) => onCouponCodeInputChange(e.target.value.toUpperCase())}
                placeholder="Enter coupon code (e.g. WELCOME50)"
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono uppercase text-xs bg-white min-h-[44px]"
                data-testid="coupon-code-input"
              />
              <button
                type="button"
                onClick={() => onApplyCoupon()}
                disabled={couponValidationLoading || !couponCodeInput.trim()}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer disabled:opacity-50 min-h-[44px]"
                data-testid="apply-coupon-btn"
              >
                {couponValidationLoading ? 'Checking...' : 'Apply'}
              </button>
            </div>

            {couponError && (
              <p className="text-xs text-rose-600 font-bold" data-testid="coupon-error-msg">
                {couponError}
              </p>
            )}
            {couponSuccessMessage && (
              <p className="text-xs text-emerald-700 font-bold" data-testid="coupon-success-msg">
                {couponSuccessMessage}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 3. Payment Method: COD Only */}
      <div className="p-4 sm:p-5 bg-white border border-slate-200 rounded-3xl space-y-3">
        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
          <Banknote className="w-4 h-4 text-emerald-600" />
          <span>Payment Method • Cash on Delivery</span>
        </label>

        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Pay at Doorstep Upon Delivery
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-200 text-emerald-900 font-black text-[10px]">
              COD / UPI QR
            </span>
          </div>
          <p className="text-[11px] text-emerald-800 leading-relaxed">
            Zero advance charge required today. Pay via Cash or UPI scan to the delivery associate when your clean, pressed laundry is delivered.
          </p>
        </div>

        {/* Pricing Breakdown Card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
          <div className="flex justify-between items-center text-slate-600">
            <span>Estimated Minimum Subtotal:</span>
            <span className="font-semibold text-slate-900">₹{estimatedMinBill}</span>
          </div>
          {appliedCoupon && (
            <div className="flex justify-between items-center text-emerald-700 font-medium">
              <span>Promo Discount ({appliedCoupon.code}):</span>
              <span className="font-bold font-mono">-₹{estimatedDiscount}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-slate-600">
            <span>Doorstep Pickup & Delivery:</span>
            <span className="font-bold text-emerald-600 uppercase text-[11px]">Free</span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
            <span className="font-bold text-slate-900">Estimated Total Payable:</span>
            <span className="font-black text-brand-700 text-base">₹{estimatedPayable}</span>
          </div>
          <p className="text-[10px] text-slate-400 pt-1 leading-snug">
            *Final bill established by certified digital scale weighing at intake facility.
          </p>
        </div>
      </div>

      {/* 4. Single Obvious Primary Confirmation Action */}
      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          className="w-full sm:w-auto py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[48px]"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Location</span>
        </button>

        <button
          type="button"
          onClick={onConfirmBooking}
          disabled={isSubmitting || isResolvingPending}
          className="w-full sm:w-auto py-3.5 px-8 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[48px]"
        >
          {isSubmitting || isResolvingPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isResolvingPending ? 'Resolving Booking...' : 'Confirming Pickup Booking...'}</span>
            </>
          ) : isAuthenticated ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm Pickup Booking</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Sign In to Book Pickup</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
