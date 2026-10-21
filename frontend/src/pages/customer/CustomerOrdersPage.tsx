import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShoppingBag, ChevronRight, FileText, Loader2, Plus, Calendar } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Order } from '../../types';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { InvoiceModal } from '../../components/InvoiceModal';

export const CustomerOrdersPage: React.FC = () => {
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['my-orders'],
    queryFn: async () => (await apiClient.getMyOrders()).data,
  });

  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);

  if (isLoading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">My Orders</h1>
          <p className="text-xs text-slate-500 mt-0.5">Track live progress and view past tax invoices.</p>
        </div>

        <Link
          to="/book"
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Book New Order
        </Link>
      </div>

      {orders && orders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">No Orders Placed Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              You haven't scheduled any laundry or dry cleaning bookings yet. Book a pickup in under 2 minutes!
            </p>
          </div>
          <Link
            to="/book"
            className="inline-block px-5 py-2.5 bg-brand-600 text-white text-xs font-bold rounded-xl shadow-md"
          >
            Book Your First Order
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders?.map(order => (
            <div
              key={order.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-brand-300 transition space-y-4"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-black text-base text-slate-900">#{order.order_number}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(order.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={order.status} size="sm" />
                  <PaymentBadge status={order.payment_status} />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs">
                <div>
                  <p className="font-semibold text-slate-800">
                    {order.items.map(i => `${i.item_name_snapshot} (${i.quantity})`).join(', ')}
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Channel: <strong className="capitalize text-slate-700">{order.handover_method.replace('_', ' ')}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Total Bill</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      ₹{(order.total_paise / 100).toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedInvoiceOrder(order)}
                    title="View Tax Invoice"
                    className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition"
                  >
                    <FileText className="w-4 h-4 text-brand-600" />
                  </button>

                  <Link
                    to={`/track?order=${order.order_number}&phone=${order.customer_phone}`}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    Track <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedInvoiceOrder && (
        <InvoiceModal
          order={selectedInvoiceOrder}
          isOpen={!!selectedInvoiceOrder}
          onClose={() => setSelectedInvoiceOrder(null)}
        />
      )}
    </div>
  );
};
