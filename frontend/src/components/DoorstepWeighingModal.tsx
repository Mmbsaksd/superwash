import React, { useState, useMemo } from 'react';
import { Order, OrderItem, ServiceMeasurementInput } from '../types';
import { Scale, X, AlertCircle, CheckCircle, PackageCheck, AlertTriangle } from 'lucide-react';
import { PricingEngine } from '../services/pricingEngine';

interface DoorstepWeighingModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (measurements: ServiceMeasurementInput[], notes?: string) => Promise<void>;
  isSubmitting?: boolean;
}

export const DoorstepWeighingModal: React.FC<DoorstepWeighingModalProps> = ({
  order,
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false
}) => {
  // Normalize items from order
  const items: OrderItem[] = useMemo(() => {
    if (order.items && order.items.length > 0) {
      return order.items;
    }
    return [
      {
        id: `${order.id}-item-1`,
        order_id: order.id,
        service_id: order.service_id,
        service_name: order.service_name || 'Wash & Fold Laundry',
        pricing_unit: order.pricing_unit || 'per_kg',
        unit_price_paise: order.price_per_kg_paise || 7900,
        min_weight_kg: order.min_weight_kg || 1.0,
        measured_weight: order.measured_weight,
        billable_weight: order.billable_weight,
        line_total_paise: order.total_amount_paise,
        created_at: order.created_at,
        updated_at: order.updated_at
      }
    ];
  }, [order]);

  // Measurement input state map: { [itemId]: string }
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    items.forEach((item) => {
      initial[item.id] = item.measured_weight !== null && item.measured_weight !== undefined
        ? String(item.measured_weight)
        : '';
    });
    return initial;
  });

  const [notes, setNotes] = useState<string>(order.delivery_notes || '');
  const [generalError, setGeneralError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Validate each item measurement
  const validationResults = items.map((item) => {
    const rawVal = weights[item.id] ?? '';
    const trimmed = rawVal.trim();
    if (!trimmed) {
      return {
        itemId: item.id,
        isValid: false,
        numValue: 0,
        error: 'Weight is required'
      };
    }
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed <= 0) {
      return {
        itemId: item.id,
        isValid: false,
        numValue: 0,
        error: 'Min weight 0.10 kg'
      };
    }
    const parts = trimmed.split('.');
    if (parts.length > 1 && parts[1].length > 2) {
      return {
        itemId: item.id,
        isValid: false,
        numValue: parsed,
        error: 'Max 2 decimal places'
      };
    }
    if (parsed < 0.10) {
      return {
        itemId: item.id,
        isValid: false,
        numValue: parsed,
        error: 'Min weight 0.10 kg'
      };
    }
    if (parsed > 100.00) {
      return {
        itemId: item.id,
        isValid: false,
        numValue: parsed,
        error: 'Max limit 100.00 kg'
      };
    }
    return {
      itemId: item.id,
      isValid: true,
      numValue: parsed,
      error: null
    };
  });

  const allValid = validationResults.every((r) => r.isValid);

  // Live bill preview calculations using PricingEngine
  const pricingInputs = items.map((item, idx) => ({
    id: item.id,
    service_id: item.service_id,
    service_name: item.service_name,
    pricing_unit: item.pricing_unit || 'per_kg',
    unit_price_paise: item.unit_price_paise || 7900,
    measured_weight: validationResults[idx].isValid ? validationResults[idx].numValue : 0,
    min_weight_kg: item.min_weight_kg || 1.0
  }));

  const couponRules = order.coupon_snapshot ? {
    code: order.coupon_snapshot.code,
    discount_type: order.coupon_snapshot.discount_type,
    discount_value: order.coupon_snapshot.discount_value,
    min_order_paise: order.coupon_snapshot.min_order_paise,
    max_discount_paise: order.coupon_snapshot.max_discount_paise,
    applicable_service_ids: order.coupon_snapshot.applicable_service_ids
  } : undefined;

  const pricingResult = PricingEngine.calculateMultiServicePricing(
    pricingInputs,
    order.min_weight_kg ?? 1.00,
    order.delivery_charge_paise || 0,
    order.discount_paise || 0,
    couponRules
  );

  const totalMeasuredKg = pricingResult.totalMeasuredWeightKg;
  const totalBillableKg = pricingResult.totalBillableWeightKg;
  const subtotalPaise = pricingResult.subtotalPaise;
  const discountPaise = pricingResult.discountPaise;
  const deliveryChargePaise = pricingResult.deliveryChargePaise;
  const finalEstimatedPaise = pricingResult.totalAmountPaise;

  const itemPreviews = items.map((item, idx) => {
    const validation = validationResults[idx];
    const calc = pricingResult.items[idx];
    const ratePerKg = (item.unit_price_paise || 7900) / 100;
    const measuredKg = validation.isValid ? validation.numValue : 0;
    const billableKg = calc ? calc.billable_weight : measuredKg;
    const linePaise = calc ? calc.line_total_paise : 0;

    return {
      item,
      measuredKg,
      billableKg,
      ratePerKg,
      minWeight: item.min_weight_kg || 1.0,
      linePaise,
      isMinApplied: calc ? calc.is_min_applied : false
    };
  });

  // Option A Coupon Preview Notice
  let couponStatusNotice: string | null = null;
  if (order.coupon_snapshot) {
    const snap = order.coupon_snapshot;
    const minSpend = snap.min_order_paise || 0;
    if (subtotalPaise >= minSpend && discountPaise > 0) {
      couponStatusNotice = `Promo ${snap.code} applied: ₹${(discountPaise / 100).toFixed(0)} off`;
    } else if (allValid) {
      couponStatusNotice = `Promo ${snap.code} requires min bill of ₹${(minSpend / 100).toFixed(0)} (Current: ₹${(subtotalPaise / 100).toFixed(0)})`;
    }
  }

  const handleInputChange = (itemId: string, value: string) => {
    setWeights((prev) => ({ ...prev, [itemId]: value }));
    setGeneralError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid) {
      setGeneralError('Please enter valid measurements for all selected services before confirming.');
      return;
    }

    const payload: ServiceMeasurementInput[] = items.map((item, idx) => ({
      order_item_id: item.id,
      service_id: item.service_id,
      service_name: item.service_name,
      measured_weight: validationResults[idx].numValue
    }));

    try {
      setGeneralError(null);
      await onConfirm(payload, notes.trim() || undefined);
    } catch (err: any) {
      setGeneralError(err?.message || 'Failed to record pickup collection.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-emerald-700 p-4 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-800/80 rounded-xl">
              <Scale className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base leading-tight">
                Doorstep Laundry Weighing
              </h3>
              <p className="text-[11px] text-emerald-100 font-mono">
                Order #{order.order_number} • {items.length} {items.length === 1 ? 'Service' : 'Services'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-emerald-800 rounded-xl transition cursor-pointer text-emerald-100 hover:text-white"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
          {/* Customer Summary Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
            <div className="flex justify-between items-center text-slate-800">
              <span className="text-slate-500 font-medium">Customer:</span>
              <span className="font-bold text-slate-900">{order.customer_name}</span>
            </div>
            <div className="flex justify-between items-center text-slate-800">
              <span className="text-slate-500 font-medium">Phone:</span>
              <span className="font-bold text-slate-900 font-mono">{order.customer_phone}</span>
            </div>
            <div className="text-[11px] text-slate-600 truncate pt-1 border-t border-slate-200/60">
              📍 {order.pickup_address}
              {order.pickup_landmark ? ` (Near ${order.pickup_landmark})` : ''}
            </div>
          </div>

          {/* Service-wise Measurement Inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">
                Service-wise Measurements ({items.length})
              </h4>
              <span className="text-[10px] text-slate-500">
                Calibrated Portable Scale (0.10 to 100 kg)
              </span>
            </div>

            <div className="space-y-2.5">
              {itemPreviews.map(({ item, linePaise, ratePerKg, minWeight, isMinApplied, billableKg }, idx) => {
                const validation = validationResults[idx];
                const unitLabel = item.pricing_unit === 'per_piece' ? 'pcs' : 'kg';

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border transition ${
                      validation.isValid
                        ? 'border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-400/20'
                        : validation.error && weights[item.id]?.trim()
                        ? 'border-red-300 bg-red-50/40'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">
                            {item.service_name}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 ml-6">
                          Configured Rate: <span className="font-bold text-slate-700">₹{ratePerKg.toFixed(0)}/{unitLabel}</span>
                          {' '}(Min {minWeight.toFixed(1)} {unitLabel})
                        </p>
                      </div>

                      {/* Live line amount badge */}
                      {validation.isValid && (
                        <div className="text-right sm:self-center shrink-0">
                          <span className="text-[10px] text-slate-500 block">Line Amount</span>
                          <span className="font-black text-emerald-800 text-sm">
                            ₹{(linePaise / 100).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Weight Input Row */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="0.05"
                          min="0.10"
                          max="100.00"
                          placeholder="e.g. 2.50"
                          value={weights[item.id] ?? ''}
                          onChange={(e) => handleInputChange(item.id, e.target.value)}
                          className={`w-full px-3 py-2 text-sm font-black rounded-xl border focus:ring-2 transition ${
                            validation.isValid
                              ? 'border-emerald-500 bg-white focus:ring-emerald-500'
                              : validation.error && weights[item.id]?.trim()
                              ? 'border-red-400 bg-red-50 focus:ring-red-400'
                              : 'border-slate-300 bg-white focus:ring-emerald-500'
                          }`}
                          data-testid={`scale-input-${item.id}`}
                          autoFocus={idx === 0}
                          required
                        />
                        <span className="absolute right-3 top-2 text-slate-400 font-bold text-xs">
                          {unitLabel}
                        </span>
                      </div>

                      {/* Status indicator */}
                      <div className="shrink-0 w-6 flex justify-center">
                        {validation.isValid ? (
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        ) : validation.error && weights[item.id]?.trim() ? (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                            Required
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Validation error message or minimum applied notice */}
                    {validation.error && weights[item.id]?.trim() && (
                      <p className="text-[10px] text-red-600 font-medium mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{validation.error}</span>
                      </p>
                    )}

                    {isMinApplied && (
                      <p className="text-[10px] text-amber-700 font-medium mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>
                          Actual scale: {validation.numValue.toFixed(2)} {unitLabel} (Order 1 kg minimum allocated: {billableKg.toFixed(2)} {unitLabel} billable).
                        </span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Financial Summary */}
          {allValid && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1.5 animate-fade-in text-emerald-950">
              <div className="flex justify-between items-center text-xs">
                <span className="text-emerald-800">Total Measured Weight:</span>
                <span className="font-bold text-slate-900">{totalMeasuredKg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-emerald-800">Billable Weight:</span>
                <span className="font-bold text-slate-900">{totalBillableKg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-emerald-800">Laundry Subtotal:</span>
                <span className="font-bold text-slate-900">₹{(subtotalPaise / 100).toFixed(2)}</span>
              </div>

              {discountPaise > 0 && (
                <div className="flex justify-between items-center text-xs text-emerald-700 font-bold">
                  <span>Discount ({order.coupon_code || 'Promo'}):</span>
                  <span>-₹{(discountPaise / 100).toFixed(2)}</span>
                </div>
              )}

              {couponStatusNotice && discountPaise === 0 && (
                <p className="text-[10px] text-amber-700 font-medium pt-0.5">
                  ℹ️ {couponStatusNotice}
                </p>
              )}

              {deliveryChargePaise > 0 && (
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span>Delivery Charge:</span>
                  <span>₹{(deliveryChargePaise / 100).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-emerald-200 text-xs font-black">
                <span className="text-emerald-900 text-sm">Final Estimated Bill (COD):</span>
                <span className="text-emerald-700 text-base font-black">
                  ₹{(finalEstimatedPaise / 100).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Optional Collection Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Pickup Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. 2 bags collected from security desk"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500"
              data-testid="pickup-notes-input"
            />
          </div>

          {/* General Error Alert */}
          {generalError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !allValid}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer text-xs flex items-center justify-center gap-1.5"
              data-testid="confirm-pickup-weighing-btn"
            >
              {isSubmitting ? (
                <span>Saving Measurements...</span>
              ) : (
                <>
                  <PackageCheck className="w-4 h-4" />
                  <span>Confirm Pickup ({items.length} {items.length === 1 ? 'Service' : 'Services'})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

