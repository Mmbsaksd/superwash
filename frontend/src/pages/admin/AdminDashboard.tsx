import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingBag, Clock, Package, RefreshCw,
  CheckCircle2, Truck, IndianRupee, AlertCircle, PlusCircle,
  FileDown, ChevronRight, Loader2, Sparkles
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { DashboardMetrics, Order } from '../../types';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';

export const AdminDashboard: React.FC = () => {
  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ['admin-metrics'],
    queryFn: async () => (await apiClient.getMetrics()).data,
    refetchInterval: 15000, // refresh every 15s
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['admin-recent-orders'],
    queryFn: async () => (await apiClient.listAdminOrders({ limit: 8 })).data,
  });

  if (metricsLoading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Operational Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">Live store metrics for shop drop-offs, pickups, and plant processing.</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/admin/walk-in"
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <PlusCircle className="w-4 h-4" /> New Walk-In Order
          </Link>

          <a
            href={apiClient.getExportCsvUrl()}
            className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <FileDown className="w-4 h-4 text-brand-600" /> Export CSV
          </a>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Orders Today */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Orders Today</span>
            <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
              {metrics?.orders_received_today || 0}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">New orders booked today</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Revenue Today */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Revenue Today</span>
            <span className="text-2xl font-black text-brand-600 font-mono mt-1 block">
              ₹{((metrics?.revenue_today_paise || 0) / 100).toFixed(0)}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">Gross booked value</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <IndianRupee className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Payments Collected */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cash & UPI Inflow</span>
            <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block">
              ₹{((metrics?.total_payments_collected_paise || 0) / 100).toFixed(0)}
            </span>
            <span className="text-[10px] text-emerald-700 font-medium mt-1 block">Actual cash received</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Outstanding Customer Balances */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Due</span>
            <span className="text-2xl font-black text-red-600 font-mono mt-1 block">
              ₹{((metrics?.outstanding_customer_balances_paise || 0) / 100).toFixed(0)}
            </span>
            <span className="text-[10px] text-red-700 font-medium mt-1 block">Awaiting customer payment</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Operational Stage Trackers */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">Active Order Processing Pipeline</h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Pending Intake</span>
            <span className="text-xl font-black text-indigo-600 font-mono mt-1 block">
              {metrics?.new_orders_awaiting_confirmation || 0}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">At Shop Counter</span>
            <span className="text-xl font-black text-amber-600 font-mono mt-1 block">
              {metrics?.garments_received_at_shop || 0}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">In Wash / Press</span>
            <span className="text-xl font-black text-cyan-600 font-mono mt-1 block">
              {metrics?.orders_processing || 0}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Awaiting QC</span>
            <span className="text-xl font-black text-purple-600 font-mono mt-1 block">
              {metrics?.orders_awaiting_qc || 0}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Ready for Pickup</span>
            <span className="text-xl font-black text-emerald-600 font-mono mt-1 block">
              {metrics?.orders_ready || 0}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Pickups / Drops</span>
            <span className="text-xl font-black text-slate-900 font-mono mt-1 block">
              {(metrics?.pickups_scheduled_today || 0) + (metrics?.deliveries_scheduled_today || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Recent Active Orders</h3>
            <p className="text-xs text-slate-500 mt-0.5">Showing latest bookings across all 3 channels</p>
          </div>
          <Link
            to="/admin/orders"
            className="text-xs font-bold text-brand-600 hover:text-brand-800 transition flex items-center gap-1"
          >
            View All Orders <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-6">Order ID</th>
                <th className="py-3 px-6">Customer</th>
                <th className="py-3 px-6">Channel</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Payment</th>
                <th className="py-3 px-6 text-right">Total (₹)</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentOrders?.map(order => (
                <tr key={order.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-6 font-mono font-bold text-slate-900">
                    <Link to={`/admin/orders/${order.id}`} className="hover:text-brand-600">
                      #{order.order_number}
                    </Link>
                  </td>
                  <td className="py-3.5 px-6">
                    <div className="font-bold text-slate-800">{order.customer_name}</div>
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
                  <td className="py-3.5 px-6 text-right">
                    <Link
                      to={`/admin/orders/${order.id}`}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-700 font-bold rounded-lg text-xs transition"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
