import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShieldAlert, Sparkles, AlertCircle, FileText, CreditCard, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Order } from '../../types';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { OrderTimeline } from '../../components/OrderTimeline';
import { InvoiceModal } from '../../components/InvoiceModal';
import { PaymentModal } from '../../components/PaymentModal';

export const OrderTrackingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [orderNumber, setOrderNumber] = useState(searchParams.get('order') || '');
  const [phone, setPhone] = useState(searchParams.get('phone') || user?.phone || '');
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const fetchOrder = async (orderNum: string, phoneNum: string) => {
    if (!orderNum.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.trackOrder(orderNum.trim().toUpperCase(), phoneNum.trim());
      setOrder(res.data);
    } catch (err: any) {
      setOrder(null);
      setError(
        err.response?.data?.detail ||
        'Order not found or verification failed. Please enter the registered phone number.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (orderNumber) {
      fetchOrder(orderNumber, phone);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrder(orderNumber, phone);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-brand-600">Real-Time Progression</span>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Track Your Laundry Order</h1>
        <p className="text-slate-600 text-xs">
          Enter your order reference (e.g., SW-2026-1001) and registered phone number to view live processing status.
        </p>
      </div>

      {/* Tracking Search Form */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
        <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5">
            <label className="block text-xs font-bold text-slate-700 mb-1">Order Number *</label>
            <input
              type="text"
              placeholder="e.g. SW-2026-1001"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs uppercase font-bold focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1">Registered Phone Number *</label>
            <input
              type="tel"
              placeholder="10-digit mobile"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>

          <div className="sm:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Track Order
            </button>
          </div>
        </form>

        <p className="mt-3 text-[11px] text-slate-400 flex items-center gap-1">
          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
          Customer phone validation prevents unauthorized viewing of private laundry orders.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Order Details & Timeline Result */}
      {order && (
        <div className="space-y-6">
          {/* Top Order Summary Card */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-mono font-bold text-slate-400">ORDER REFERENCE</span>
                <h2 className="text-2xl font-black font-mono text-slate-900">#{order.order_number}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Placed on {new Date(order.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={order.status} size="lg" />
                <PaymentBadge status={order.payment_status} />
              </div>
            </div>

            {/* Actions: View Invoice & Pay */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <div className="text-xs text-slate-600">
                <span>Handover: </span>
                <strong className="text-slate-900 capitalize">
                  {order.handover_method === 'shop_dropoff' ? 'Shop Counter Drop-Off' : 'Doorstep Pickup & Delivery'}
                </strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowInvoiceModal(true)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-brand-600" /> View Tax Invoice
                </button>

                {order.outstanding_paise > 0 && (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Pay Due ₹{(order.outstanding_paise / 100).toFixed(2)}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Workflow Timeline */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Processing Progress</h3>
            <OrderTimeline order={order} />
          </div>

          {/* Garments Breakdown */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Garment Items ({order.items.length})</h3>

            <div className="divide-y divide-slate-100 text-xs">
              {order.items.map(item => (
                <div key={item.id} className="py-3 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-slate-900">{item.item_name_snapshot}</h4>
                    <p className="text-slate-500 text-[11px]">{item.service_name_snapshot}</p>
                    {item.special_instruction && (
                      <span className="text-[10px] text-amber-600 italic">Note: {item.special_instruction}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-slate-600">{item.quantity} × ₹{(item.unit_price_paise_snapshot / 100).toFixed(0)}</span>
                    <div className="font-mono font-bold text-slate-900">₹{(item.subtotal_paise / 100).toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Financial summary footer */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
              <span className="text-slate-500">Bill Breakdown (incl. GST):</span>
              <div className="flex items-center gap-4">
                <span>Total: <strong className="font-mono font-bold text-slate-900">₹{(order.total_paise / 100).toFixed(2)}</strong></span>
                <span>Paid: <strong className="font-mono font-bold text-emerald-700">₹{(order.paid_paise / 100).toFixed(2)}</strong></span>
                <span>Balance: <strong className="font-mono font-bold text-red-600">₹{(order.outstanding_paise / 100).toFixed(2)}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {order && (
        <>
          <InvoiceModal
            order={order}
            isOpen={showInvoiceModal}
            onClose={() => setShowInvoiceModal(false)}
          />
          <PaymentModal
            order={order}
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            onPaymentSuccess={() => fetchOrder(order.order_number, phone)}
          />
        </>
      )}
    </div>
  );
};
