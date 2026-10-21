import React, { useState } from 'react';
import { X, Shirt, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Order } from '../types';
import { apiClient } from '../api/client';

interface InspectionModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const InspectionModal: React.FC<InspectionModalProps> = ({ order, isOpen, onClose, onSuccess }) => {
  const defaultCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const [actualCount, setActualCount] = useState<number>(defaultCount);
  const [existingStains, setExistingStains] = useState<string>('');
  const [customerInstructions, setCustomerInstructions] = useState<string>(order.special_instructions || '');
  const [inspectionNotes, setInspectionNotes] = useState<string>('');
  const [qcPassed, setQcPassed] = useState<boolean>(true);
  const [qcNotes, setQcNotes] = useState<string>('');
  const [incidents, setIncidents] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await apiClient.recordInspection(order.id, {
        actual_count_received: actualCount,
        existing_stains_damage: existingStains || undefined,
        customer_instructions: customerInstructions || undefined,
        inspection_notes: inspectionNotes || undefined,
        quality_check_passed: qcPassed,
        quality_check_notes: qcNotes || undefined,
        missing_damaged_incidents: incidents || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save inspection notes.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shirt className="w-5 h-5 text-brand-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Garment Intake & Inspection</h3>
              <p className="text-[11px] text-slate-500 font-mono">Order #{order.order_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Actual Garment Count Received
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                value={actualCount}
                onChange={(e) => setActualCount(parseInt(e.target.value) || 0)}
                className="w-28 px-3 py-2 rounded-xl border border-slate-300 font-bold font-mono text-sm focus:ring-2 focus:ring-brand-500"
                required
              />
              <span className="text-slate-500">
                (Customer booked: <strong className="text-slate-800">{defaultCount}</strong> items)
              </span>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Existing Stains, Tears, or Pre-existing Damage
            </label>
            <textarea
              rows={2}
              value={existingStains}
              onChange={(e) => setExistingStains(e.target.value)}
              placeholder="e.g., Oil stain on left sleeve of blue shirt, missing second button on blazer"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Customer Special Care Instructions
            </label>
            <input
              type="text"
              value={customerInstructions}
              onChange={(e) => setCustomerInstructions(e.target.value)}
              placeholder="e.g. Do not use hot water on silk saree, heavy starch on collar"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Tagging & Inspection Notes
            </label>
            <input
              type="text"
              value={inspectionNotes}
              onChange={(e) => setInspectionNotes(e.target.value)}
              placeholder="e.g. Tag #SW-102 attached to all 3 hangers"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-200">
            <label className="block font-bold text-slate-700 mb-2">
              Quality Check Assessment
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="radio"
                  name="qc_passed"
                  checked={qcPassed === true}
                  onChange={() => setQcPassed(true)}
                  className="text-brand-600 focus:ring-brand-500"
                />
                Pass Quality Inspection
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="radio"
                  name="qc_passed"
                  checked={qcPassed === false}
                  onChange={() => setQcPassed(false)}
                  className="text-brand-600 focus:ring-brand-500"
                />
                Requires Special Rewash / Attention
              </label>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition flex items-center gap-1.5 shadow-sm"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save Inspection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
