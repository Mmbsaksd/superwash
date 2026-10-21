import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, FileDown, Calendar, IndianRupee,
  ShoppingBag, CheckCircle2, AlertCircle, Loader2, Shirt
} from 'lucide-react';
import { apiClient } from '../../api/client';

export const AdminReportsPage: React.FC = () => {
  const [days, setDays] = useState(30);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['admin-analytics', days],
    queryFn: async () => (await apiClient.getAnalytics(days)).data,
  });

  if (isLoading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Financial Reports & Analytics</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Clear distinction between gross booked order value and actual cash collected.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
            <option value={365}>Last 1 Year</option>
          </select>

          <a
            href={apiClient.getExportCsvUrl()}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <FileDown className="w-4 h-4" /> Download Complete Orders CSV
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Orders</span>
          <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
            {analytics?.total_orders || 0}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">In the last {days} days</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Gross Order Value</span>
          <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
            ₹{((analytics?.total_order_value_paise || 0) / 100).toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Total billed including GST</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Payments Received</span>
          <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block">
            ₹{((analytics?.total_payments_received_paise || 0) / 100).toFixed(2)}
          </span>
          <span className="text-[10px] text-emerald-700 font-semibold mt-1 block">Cash & UPI settled</span>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Balances</span>
          <span className="text-2xl font-black text-red-600 font-mono mt-1 block">
            ₹{((analytics?.outstanding_balance_paise || 0) / 100).toFixed(2)}
          </span>
          <span className="text-[10px] text-red-700 font-semibold mt-1 block">Pending collection</span>
        </div>
      </div>

      {/* Grid: Popular Services and Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Popular garments */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Shirt className="w-4 h-4 text-brand-600" /> Popular Garment Volume
          </h3>

          <div className="divide-y divide-slate-100 text-xs">
            {analytics?.popular_items?.map((item: any) => (
              <div key={item.item_name} className="py-2.5 flex justify-between items-center">
                <span className="font-bold text-slate-800">{item.item_name}</span>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900 mr-4">{item.quantity} pieces</span>
                  <span className="font-mono text-slate-500">₹{(item.revenue_paise / 100).toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders by Handover Method & Processing Status */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Channel Distribution</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {analytics?.orders_by_handover?.map((h: any) => (
                <div key={h.method} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    {h.method === 'shop_dropoff' ? 'Shop Drop-Off' : 'Home Pickup'}
                  </span>
                  <span className="text-xl font-black font-mono text-slate-900 mt-1 block">{h.count} orders</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm">Status Breakdown</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {analytics?.orders_by_status?.map((s: any) => (
                <div key={s.status} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-500 capitalize block truncate">{s.status.replace('_', ' ')}</span>
                  <span className="font-mono font-bold text-slate-800 mt-0.5 block">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
