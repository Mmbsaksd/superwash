import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Edit2, Plus, CheckCircle2, Loader2, IndianRupee } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Service, ServicePrice } from '../../types';

export const AdminServicesPage: React.FC = () => {
  const { data: services, isLoading, refetch } = useQuery<Service[]>({
    queryKey: ['admin-services'],
    queryFn: async () => (await apiClient.getServices()).data,
  });

  const [editingPrice, setEditingPrice] = useState<ServicePrice | null>(null);
  const [newPriceRs, setNewPriceRs] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleEditClick = (price: ServicePrice) => {
    setEditingPrice(price);
    setNewPriceRs((price.price_paise / 100).toString());
    setSuccessMsg(null);
  };

  const handleUpdatePriceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrice) return;
    setIsUpdating(true);
    try {
      const paise = Math.round(parseFloat(newPriceRs) * 100);
      await apiClient.updateServicePrice(editingPrice.id, {
        price_paise: paise,
      });

      setSuccessMsg(`Updated ${editingPrice.item_name} price to ₹${newPriceRs} successfully! Historical orders retain snapshot rates.`);
      setEditingPrice(null);
      await refetch();
    } catch {
      alert('Failed to update price.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Service Catalogue & Pricing</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Live prices can be updated here without code changes. Past orders and existing invoices remain protected by immutable order-time snapshots.
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Edit Modal */}
      {editingPrice && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm">
              Update Price: {editingPrice.item_name}
            </h3>

            <form onSubmit={handleUpdatePriceSubmit} className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">New Price (₹)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={newPriceRs}
                  onChange={(e) => setNewPriceRs(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPrice(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold"
                >
                  {isUpdating ? 'Saving...' : 'Save New Price'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {services?.map(service => (
          <div
            key={service.id}
            className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-600" /> {service.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{service.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
              {service.prices?.map(price => (
                <div
                  key={price.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center"
                >
                  <div>
                    <h4 className="font-bold text-slate-900">{price.item_name}</h4>
                    <span className="text-[10px] text-slate-400 capitalize block">
                      {price.pricing_type.replace('_', ' ')}
                    </span>
                    <span className="font-mono font-black text-brand-700 text-sm mt-1 block">
                      ₹{(price.price_paise / 100).toFixed(0)}
                    </span>
                  </div>

                  <button
                    onClick={() => handleEditClick(price)}
                    className="p-2 border border-slate-200 hover:bg-white rounded-lg text-slate-600 hover:text-brand-600 transition"
                    title="Edit Rate"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
