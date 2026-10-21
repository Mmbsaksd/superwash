import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  PlusCircle, Plus, Minus, CheckCircle2, Banknote, QrCode,
  Sparkles, AlertCircle, Loader2, User, Phone, ArrowLeft
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Service, ServicePrice } from '../../types';

export const AdminWalkInOrderPage: React.FC = () => {
  const navigate = useNavigate();

  const { data: services, isLoading } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => (await apiClient.getServices()).data,
  });

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Selected items: { [priceId]: { price, quantity, special_instruction } }
  const [selectedItems, setSelectedItems] = useState<{
    [priceId: string]: { price: ServicePrice; quantity: number; special_instruction?: string };
  }>({});

  // Payment state
  const [initialPaymentRs, setInitialPaymentRs] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi_manual'>('cash');
  const [transactionRef, setTransactionRef] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuantity = (price: ServicePrice, delta: number) => {
    setSelectedItems(prev => {
      const current = prev[price.id]?.quantity || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[price.id];
        return copy;
      }
      return {
        ...prev,
        [price.id]: {
          price,
          quantity: next,
          special_instruction: prev[price.id]?.special_instruction || ''
        }
      };
    });
  };

  const subtotalPaise = Object.values(selectedItems).reduce(
    (sum, item) => sum + item.price.price_paise * item.quantity,
    0
  );
  const taxPaise = Math.round(subtotalPaise * 0.18);
  const totalBillPaise = subtotalPaise + taxPaise;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(selectedItems).length === 0) {
      setError('Please add at least one garment item.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const initialPaise = Math.round(parseFloat(initialPaymentRs || '0') * 100);

    try {
      const itemsPayload = Object.values(selectedItems).map(i => ({
        service_price_id: i.price.id,
        quantity: i.quantity,
        special_instruction: i.special_instruction || undefined
      }));

      const res = await apiClient.createWalkInOrder({
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || undefined,
        special_instructions: specialInstructions || undefined,
        items: itemsPayload,
        initial_payment_paise: initialPaise,
        payment_method: paymentMethod,
        transaction_reference: transactionRef || undefined
      });

      navigate(`/admin/orders/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create walk-in order.');
    } finally {
      setIsSubmitting(false);
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
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Walk-In Customer Counter</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Record in-person customer drop-offs at the physical store counter.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Customer details & Item Catalog */}
        <div className="lg:col-span-7 space-y-6">
          {/* Customer info */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
              Customer Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Iyer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mobile Number (10 Digits) *</label>
                <input
                  type="tel"
                  placeholder="e.g. 9845011223"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-semibold"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Special Handling Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. Silk saree stain treatment, heavy starch on shirt collars"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Service items picker */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
              Select Garment Services
            </h3>

            <div className="space-y-6">
              {services?.map(service => (
                <div key={service.id} className="space-y-2">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-brand-600" /> {service.name}
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {service.prices?.map(price => {
                      const qty = selectedItems[price.id]?.quantity || 0;
                      return (
                        <div
                          key={price.id}
                          className={`p-3 rounded-xl border flex justify-between items-center transition ${
                            qty > 0 ? 'border-brand-500 bg-brand-50/30' : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">{price.item_name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              ₹{(price.price_paise / 100).toFixed(0)} / {price.pricing_type.replace('_', ' ')}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg p-0.5 shadow-sm">
                            <button
                              type="button"
                              onClick={() => handleQuantity(price, -1)}
                              disabled={qty === 0}
                              className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-20"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-5 text-center font-bold font-mono text-xs">{qty}</span>
                            <button
                              type="button"
                              onClick={() => handleQuantity(price, 1)}
                              className="p-1 text-brand-600 hover:text-brand-800"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Order Bill & Immediate Counter Payment */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
              Counter Bill & Immediate Payment
            </h3>

            {/* Selected items list */}
            {Object.keys(selectedItems).length === 0 ? (
              <p className="text-slate-400 italic text-center py-4">No garments added yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 space-y-1">
                {Object.values(selectedItems).map(({ price, quantity }) => (
                  <div key={price.id} className="pt-2 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-900">{price.item_name}</span>
                      <span className="ml-1 text-slate-500 font-mono">× {quantity}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-800">
                      ₹{((price.price_paise * quantity) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Subtotal, tax, total */}
            <div className="pt-4 border-t border-slate-200 space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Garments Subtotal:</span>
                <span className="font-mono font-semibold">₹{(subtotalPaise / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>18% GST (CGST + SGST):</span>
                <span className="font-mono">₹{(taxPaise / 100).toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-base text-slate-900">
                <span>Total Amount:</span>
                <span className="font-mono text-brand-700">₹{(totalBillPaise / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Counter Payment Collection */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <label className="block font-bold text-slate-700">
                Initial Payment Collected At Counter
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-2.5 rounded-xl border text-left flex items-center gap-2 ${
                    paymentMethod === 'cash' ? 'border-brand-600 bg-brand-50/50 font-bold text-brand-900' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>Cash Payment</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('upi_manual')}
                  className={`p-2.5 rounded-xl border text-left flex items-center gap-2 ${
                    paymentMethod === 'upi_manual' ? 'border-brand-600 bg-brand-50/50 font-bold text-brand-900' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <QrCode className="w-4 h-4 text-purple-600" />
                  <span>Shop QR (UPI)</span>
                </button>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Amount Collected (₹)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={(totalBillPaise / 100).toFixed(2)}
                    value={initialPaymentRs}
                    onChange={(e) => setInitialPaymentRs(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setInitialPaymentRs((totalBillPaise / 100).toFixed(2))}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold whitespace-nowrap"
                  >
                    Full Due
                  </button>
                </div>
              </div>

              {paymentMethod === 'upi_manual' && (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">UPI UTR / Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. 408219876543"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono text-xs"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || Object.keys(selectedItems).length === 0}
              className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Create Order & Print Intake Receipt
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
