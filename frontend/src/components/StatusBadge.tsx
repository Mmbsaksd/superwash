import React from 'react';
import {
  Clock, Package, CheckCircle2,
  Truck, CheckCheck, XCircle, AlertCircle, RefreshCw
} from 'lucide-react';
import { OrderStatus, PaymentStatus } from '../types';

interface StatusBadgeProps {
  status: OrderStatus | string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'booked':
        return {
          label: 'Booked',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: Clock
        };
      case 'pickup_assigned':
        return {
          label: 'Pickup Assigned',
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: Truck
        };
      case 'collected':
        return {
          label: 'Collected',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: Package
        };
      case 'washing':
        return {
          label: 'Washing',
          bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
          icon: RefreshCw
        };
      case 'ready_for_delivery':
        return {
          label: 'Ready for Delivery',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: Package
        };
      case 'out_for_delivery':
        return {
          label: 'Out for Delivery',
          bg: 'bg-orange-50 text-orange-700 border-orange-200',
          icon: Truck
        };
      case 'delivered':
        return {
          label: 'Delivered',
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
  const sizeClasses = size === 'sm' ? 'text-[11px] px-2 py-0.5' : size === 'lg' ? 'text-sm px-3.5 py-1.5' : 'text-xs px-2.5 py-1';

  return (
    <span className={`inline-flex items-center font-semibold border rounded-full gap-1.5 capitalize ${bg} ${sizeClasses}`}>
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
          <CheckCircle2 className="w-3 h-3" /> Paid
        </span>
      );
    case 'partially_paid':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3" /> Partially Paid
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
          <AlertCircle className="w-3 h-3" /> Pending Payment
        </span>
      );
  }
};
