import React from 'react';
import {
  Clock, Package, Sparkles, CheckCircle2,
  Truck, CheckCheck, XCircle, AlertCircle, RefreshCw, Shirt
} from 'lucide-react';
import { OrderStatus, PaymentStatus } from '../types';

interface StatusBadgeProps {
  status: OrderStatus | string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'order_placed':
        return {
          label: 'Order Placed',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: Clock
        };
      case 'pickup_scheduled':
        return {
          label: 'Pickup Scheduled',
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: Truck
        };
      case 'clothes_received':
        return {
          label: 'Clothes Received',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: Package
        };
      case 'garment_inspection':
        return {
          label: 'Inspection & Tagging',
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: Shirt
        };
      case 'washing_drycleaning':
        return {
          label: 'Washing / Dry Cleaning',
          bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
          icon: RefreshCw
        };
      case 'ironing_finishing':
        return {
          label: 'Steam Ironing & Press',
          bg: 'bg-sky-50 text-sky-700 border-sky-200',
          icon: Sparkles
        };
      case 'quality_check':
        return {
          label: 'Quality Check',
          bg: 'bg-teal-50 text-teal-700 border-teal-200',
          icon: CheckCircle2
        };
      case 'ready_for_delivery':
        return {
          label: 'Ready for Collection',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: Package
        };
      case 'out_for_delivery':
        return {
          label: 'Out for Delivery',
          bg: 'bg-orange-50 text-orange-700 border-orange-200',
          icon: Truck
        };
      case 'delivered_collected':
        return {
          label: 'Delivered / Collected',
          bg: 'bg-green-100 text-green-800 border-green-300',
          icon: CheckCheck
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          bg: 'bg-red-50 text-red-700 border-red-200',
          icon: XCircle
        };
      default:
        return {
          label: status.replace(/_/g, ' '),
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          icon: AlertCircle
        };
    }
  };

  const { label, bg, icon: Icon } = getStatusConfig();
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : size === 'lg' ? 'text-sm px-3.5 py-1.5' : 'text-xs px-2.5 py-1';

  return (
    <span className={`inline-flex items-center font-medium border rounded-full gap-1.5 capitalize ${bg} ${sizeClasses}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {label}
    </span>
  );
};

export const PaymentBadge: React.FC<{ status: PaymentStatus | string }> = ({ status }) => {
  switch (status) {
    case 'paid':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> Paid in Full
        </span>
      );
    case 'partially_paid':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3" /> Partially Paid
        </span>
      );
    case 'refunded':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
          <RefreshCw className="w-3 h-3" /> Refunded
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
          <XCircle className="w-3 h-3" /> Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          <AlertCircle className="w-3 h-3" /> Payment Pending
        </span>
      );
  }
};
