import React, { useState } from 'react';
import { Order } from '../types';
import { LaundryService } from '../services/laundryService';
import { Scale, X, AlertTriangle, CheckCircle } from 'lucide-react';

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
  const [weightInput, setWeightInput] = useState<string>(
    order.measured_weight ? order.measured_weight.toString() : ''
  );
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isEditing = order.measured_weight !== null && order.measured_weight !== undefined;
  const numWeight = parseFloat(weightInput);
  const isValidWeight = !isNaN(numWeight) && numWeight > 0 && numWeight < 200;

  // Live bill preview
  const billPreview = isValidWeight
    ? LaundryService.calculateBill(
        numWeight,
        order.price_per_kg_paise,
        order.min_weight_kg,
        order.delivery_charge_paise
      )
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidWeight) {
      setError('Please enter a valid weight in kilograms (e.g., 4.5)');
      return;
    }

    if (isEditing && !reason.trim()) {
      setError('Please enter a reason for changing the previously recorded weight');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updated = await LaundryService.enterMeasuredWeight(
        order.id,
        numWeight,
        managerName,
        isEditing ? reason.trim() : undefined
      );

      if (updated) {
        onSuccess(updated);
        onClose();
      } else {
        setError('Failed to update weight. Order might not be found.');
      }
    } catch (err: any) {
      setError(err.message || 'Error saving weight');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-cyan-600 p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-cyan-200" />
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isEditing ? 'Correct Measured Weight' : 'Enter Measured Weight'}
              </h3>
              <p className="text-xs text-brand-100">Order #{order.order_number} • {order.customer_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Actual Weight on Scale (in kg) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="200"
                autoFocus
                placeholder="e.g. 4.5"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="w-full pl-3 pr-12 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 text-lg font-bold text-slate-900"
                required
              />
              <span className="absolute right-3.5 top-3.5 text-xs font-bold text-slate-400">
                KG
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Minimum billable weight is <span className="font-semibold text-slate-700">{order.min_weight_kg} kg</span> at ₹{(order.price_per_kg_paise / 100).toFixed(0)}/kg.
            </p>
          </div>

          {/* Live Calculated Bill Breakdown */}
          {billPreview && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <span className="font-bold text-slate-700 block uppercase tracking-wider text-[10px]">
                Automatic Bill Calculation
              </span>
              <div className="flex justify-between text-slate-600">
                <span>Measured Weight:</span>
                <span className="font-semibold text-slate-800">{billPreview.measuredWeightKg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Billable Weight applied:</span>
                <span className="font-semibold text-brand-600">
                  {billPreview.billableWeightKg.toFixed(2)} kg
                  {billPreview.minWeightApplied && (
                    <span className="text-[10px] text-amber-600 font-normal ml-1">
                      (min. {order.min_weight_kg}kg rule)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Laundry Rate:</span>
                <span className="font-semibold text-slate-800">₹{(order.price_per_kg_paise / 100).toFixed(0)} / kg</span>
              </div>
              {order.delivery_charge_paise > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Charge:</span>
                  <span className="font-semibold text-slate-800">₹{(order.delivery_charge_paise / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                <span className="font-bold text-slate-900 text-sm">Total Bill:</span>
                <span className="font-black text-brand-600 text-lg">
                  ₹{(billPreview.totalAmountPaise / 100).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Reason if correcting existing weight */}
          {isEditing && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Correction Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Scale recalibrated / typo in previous entry"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                required
              />
              <span className="text-[10px] text-slate-400">
                An audit trail of the previous weight and amount will be saved.
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValidWeight || isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
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
