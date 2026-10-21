import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search, Filter, PlusCircle, FileText, ChevronRight,
  Loader2, RefreshCw, X, Calendar
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Order } from '../../types';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';

export const AdminOrdersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [handoverFilter, setHandoverFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  const { data: orders, isLoading, refetch } = useQuery<Order[]>({
    queryKey: ['admin-orders', search, statusFilter, handoverFilter, paymentFilter],
    queryFn: async () => {
      const res = await apiClient.listAdminOrders({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        handover_method: handoverFilter || undefined,
        payment_status: paymentFilter || undefined,
        limit: 100,
      });
      return res.data;
    },
  });

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setHandoverFilter('');
    setPaymentFilter('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Orders Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">Search, filter, inspect, and update laundry orders across all channels.</p>
        </div>

        <Link
          to="/admin/walk-in"
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
        >
          <PlusCircle className="w-4 h-4" /> New Walk-In Order
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
          {/* Search box */}
          <div className="sm:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by Order ID, Name, Phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Status filter */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white"
            >
              <option value="">All Processing Stages</option>
              <option value="order_placed">Order Placed</option>
              <option value="pickup_scheduled">Pickup Scheduled</option>
              <option value="clothes_received">Clothes Received</option>
              <option value="garment_inspection">Garment Inspection</option>
              <option value="washing_drycleaning">Washing / Dry Cleaning</option>
              <option value="ironing_finishing">Ironing / Finishing</option>
              <option value="quality_check">Quality Check</option>
              <option value="ready_for_delivery">Ready for Delivery / Collection</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered_collected">Delivered / Collected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Handover filter */}
          <div className="sm:col-span-2">
            <select
              value={handoverFilter}
              onChange={(e) => setHandoverFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white"
            >
              <option value="">All Channels</option>
              <option value="shop_dropoff">Shop Drop-Off</option>
              <option value="home_pickup_delivery">Home Pickup</option>
            </select>
          </div>

          {/* Payment filter */}
          <div className="sm:col-span-2">
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white"
            >
              <option value="">All Payment States</option>
              <option value="paid">Paid</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Reset button */}
          <div className="sm:col-span-1 flex items-center">
            <button
              onClick={handleResetFilters}
              title="Reset Filters"
              className="p-2.5 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-500 w-full flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          </div>
        ) : orders && orders.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500">
            No matching orders found. Try clearing your search or filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-6">Order ID</th>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">Customer</th>
                  <th className="py-3.5 px-6">Handover</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Payment</th>
                  <th className="py-3.5 px-6 text-right">Total Bill</th>
                  <th className="py-3.5 px-6 text-right">Balance Due</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders?.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-6 font-mono font-bold text-slate-900">
                      <Link to={`/admin/orders/${order.id}`} className="hover:text-brand-600">
                        #{order.order_number}
                      </Link>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-slate-500">
                      {new Date(order.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short'
                      })}
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="font-bold text-slate-900">{order.customer_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{order.customer_phone}</div>
                    </td>
                    <td className="py-3.5 px-6 capitalize text-slate-600 font-medium">
                      {order.handover_method === 'shop_dropoff' ? 'Shop Drop-Off' : 'Home Pickup'}
                    </td>
                    <td className="py-3.5 px-6">
                      <StatusBadge status={order.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-6">
                      <PaymentBadge status={order.payment_status} />
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-bold text-slate-900">
                      ₹{(order.total_paise / 100).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-bold">
                      <span className={order.outstanding_paise > 0 ? 'text-red-600' : 'text-slate-400'}>
                        ₹{(order.outstanding_paise / 100).toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs transition"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
