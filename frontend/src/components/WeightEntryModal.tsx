import React, { useState, useMemo } from 'react';
import { Order, OrderItem, ServiceMeasurementInput } from '../types';
import { LaundryService } from '../services/laundryService';
import { PricingEngine } from '../services/pricingEngine';
import { Scale, X, AlertTriangle, CheckCircle, Tag } from 'lucide-react';

interface WeightEntryModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedOrder: Order) => void;
  managerName?: string;
}

export const WeightEntryModal: React.FC<WeightEntryModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
  managerName = 'Store Manager'
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

  const isEditing = order.measured_weight !== null && order.measured_weight !== undefined;

  // Weight input map: { [itemId]: string }
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    items.forEach((item) => {
      initial[item.id] = item.measured_weight !== null && item.measured_weight !== undefined
        ? String(item.measured_weight)
        : '';
    });
    return initial;
  });

  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      return {
        itemId: item.id,
        isValid: false,
        numValue: 0,
        error: 'Enter a valid number'
      };
    }

    if (num < 0.10) {
      return {
        itemId: item.id,
        isValid: false,
        numValue: num,
        error: 'Min weight 0.10 kg'
      };
    }

    if (num > 100.00) {
      return {
        itemId: item.id,
        isValid: false,
        numValue: num,
        error: 'Max limit 100.00 kg'
      };
    }

    // Decimal precision check: up to 2 decimal places
    const parts = trimmed.split('.');
    if (parts.length > 1 && parts[1].length > 2) {
      return {
        itemId: item.id,
        isValid: false,
        numValue: num,
        error: 'Max 2 decimal places'
      };
    }

    return {
      itemId: item.id,
      isValid: true,
      numValue: Math.round(num * 100) / 100,
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
  const finalTotalPaise = pricingResult.totalAmountPaise;

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

  // Option A Coupon Evaluation Notice
  let couponNotice: string | null = null;
  if (order.coupon_snapshot) {
    const snap = order.coupon_snapshot;
    const minSpend = snap.min_order_paise || 0;
    if (subtotalPaise >= minSpend && discountPaise > 0) {
      couponNotice = `Coupon ${snap.code} applied: ₹${(discountPaise / 100).toFixed(0)} off`;
    } else if (allValid) {
      couponNotice = `Coupon ${snap.code} requires min spend of ₹${(minSpend / 100).toFixed(0)}`;
    }
  }

  const handleInputChange = (itemId: string, value: string) => {
    setWeights((prev) => ({ ...prev, [itemId]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid) {
      setError('Please enter valid scale weights for all services.');
      return;
    }

    if (isEditing && !reason.trim()) {
      setError('Please enter a reason for modifying previously recorded weight.');
      return;
    }

    // Downward paid-amount guard
    if (order.paid_amount_paise > 0 && finalTotalPaise < order.paid_amount_paise) {
      setError(`Cannot reduce total below already paid amount (₹${(order.paid_amount_paise / 100).toFixed(2)}). Modifications below paid amount require formal refund.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload: ServiceMeasurementInput[] = items.map((item, idx) => ({
      order_item_id: item.id,
      service_id: item.service_id,
      service_name: item.service_name,
      measured_weight: validationResults[idx].numValue
    }));

    try {
      const updated = await LaundryService.enterMeasuredWeight(
        order.id,
        payload,
        managerName,
        isEditing ? reason.trim() : undefined
      );

      if (updated) {
        onSuccess(updated);
        onClose();
      } else {
        setError('Failed to update weight. Order not found.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error recording weight');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-cyan-600 p-4 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Scale className="w-5 h-5 text-cyan-100" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isEditing ? 'Correct Service Weights' : 'Store Intake Weighing'}
              </h3>
              <p className="text-xs text-brand-100">
                Order #{order.order_number} • {order.customer_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Services list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Services & Measured Scale Readings ({items.length})
              </span>
              <span className="text-[10px] text-slate-500">Range: 0.10 - 100.00 kg</span>
            </div>

            {items.map((item, idx) => {
              const validation = validationResults[idx];
              const preview = itemPreviews[idx];
              const unit = item.pricing_unit || 'per_kg';
              const unitLabel = unit === 'per_piece' ? 'pc' : 'kg';

              return (
                <div
                  key={item.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-900 text-xs block">
                        {item.service_name}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Rate: ₹{preview.ratePerKg.toFixed(0)}/{unitLabel} (Min {preview.minWeight.toFixed(1)} {unitLabel})
                      </span>
                    </div>
                    {preview.isMinApplied && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold shrink-0">
                        Min {preview.minWeight}kg Rule Applied
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.05"
                        min="0.10"
                        max="100.00"
                        placeholder="e.g. 3.50"
                        value={weights[item.id] ?? ''}
                        onChange={(e) => handleInputChange(item.id, e.target.value)}
                        className={`w-full pl-3 pr-10 py-2 text-sm font-bold rounded-xl border bg-white focus:ring-2 focus:ring-brand-500 ${
                          validation.error
                            ? 'border-red-300 focus:border-red-500'
                            : 'border-slate-300 focus:border-brand-500'
                        }`}
                        required
                      />
                      <span className="absolute right-3 top-2 font-bold text-slate-400 text-xs uppercase">
                        {unitLabel}
                      </span>
                    </div>
                    {validation.error && (
                      <p className="text-[10px] text-red-600 mt-0.5">{validation.error}</p>
                    )}
                  </div>

                  {validation.isValid && (
                    <div className="flex justify-between items-center text-[11px] pt-1 text-slate-600 border-t border-slate-200/60">
                      <span>
                        Billable: <strong className="text-slate-800">{preview.billableKg.toFixed(2)} {unitLabel}</strong>
                      </span>
                      <span className="font-bold text-brand-700">
                        Line: ₹{(preview.linePaise / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Live Calculated Bill Breakdown */}
          {allValid && (
            <div className="p-3.5 bg-brand-50/50 border border-brand-200 rounded-2xl space-y-2">
              <span className="font-bold text-brand-900 block uppercase tracking-wider text-[10px]">
                Automatic Bill Summary
              </span>
              <div className="flex justify-between text-slate-600">
                <span>Total Measured Weight:</span>
                <span className="font-semibold text-slate-800">{totalMeasuredKg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Billable Weight:</span>
                <span className="font-semibold text-brand-700">{totalBillableKg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Laundry Subtotal:</span>
                <span className="font-semibold text-slate-800">₹{(subtotalPaise / 100).toFixed(2)}</span>
              </div>

              {couponNotice && (
                <div className="flex justify-between text-emerald-700 font-semibold text-[11px]">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3 text-emerald-600" />
                    <span>{couponNotice}</span>
                  </span>
                  {discountPaise > 0 && (
                    <span>-₹{(discountPaise / 100).toFixed(2)}</span>
                  )}
                </div>
              )}

              {deliveryChargePaise > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Charge:</span>
                  <span className="font-semibold text-slate-800">₹{(deliveryChargePaise / 100).toFixed(2)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-brand-200 flex justify-between items-center">
                <span className="font-bold text-slate-900 text-sm">Total Bill Payable:</span>
                <span className="font-black text-brand-700 text-base">
                  ₹{(finalTotalPaise / 100).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Reason if correcting existing weight */}
          {isEditing && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                Correction Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Facility scale calibrated / clothes sorted and re-weighed"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                required
              />
              <span className="text-[10px] text-slate-400 block">
                Logged to audit history (public.weight_change_history) with timestamp and operator ID.
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!allValid || isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save & Calculate Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
