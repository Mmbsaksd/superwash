import React from 'react';
import { Order, OrderStatus } from '../types';
import {
  CalendarCheck, Truck, Scale, Sparkles, Package,
  CheckCircle2, AlertCircle, Clock, MapPin, ArrowRight
} from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { useNavigate } from 'react-router-dom';

export interface CustomerOrderTrackerProps {
  order: Order | null;
  variant?: 'compact' | 'full';
  onViewDetails?: (order: Order) => void;
  className?: string;
}

interface TrackerStage {
  stageNumber: number;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  description: (order: Order) => string;
  isActive: (status: OrderStatus) => boolean;
  isCompleted: (status: OrderStatus) => boolean;
}

export const TRACKER_STAGES: TrackerStage[] = [
  {
    stageNumber: 1,
    label: 'Order Placed',
    shortLabel: 'Placed',
    icon: CalendarCheck,
    description: (order) => `Booked for ${order.pickup_date} (${order.pickup_slot.split('(')[0].trim()})`,
    isActive: (status) => status === 'booked',
    isCompleted: (status) => ['pickup_assigned', 'collected', 'weighed', 'washing', 'ready_for_delivery', 'delivery_assigned', 'out_for_delivery', 'delivered'].includes(status)
  },
  {
    stageNumber: 2,
    label: 'Pickup & Collection',
    shortLabel: 'Pickup',
    icon: Truck,
    description: (order) => {
      if (order.order_status === 'collected' || order.order_status === 'weighed') {
        const weight = order.doorstep_scale_weight_kg || order.measured_weight;
        return weight ? `Collected • Weighed: ${weight.toFixed(2)} kg` : 'Collected at doorstep';
      }
      return order.assigned_pickup_name ? `Assigned to ${order.assigned_pickup_name}` : 'Pickup executive being assigned';
    },
    isActive: (status) => ['pickup_assigned', 'collected', 'weighed'].includes(status),
    isCompleted: (status) => ['washing', 'ready_for_delivery', 'delivery_assigned', 'out_for_delivery', 'delivered'].includes(status)
  },
  {
    stageNumber: 3,
    label: 'Washing & Care',
    shortLabel: 'Washing',
    icon: Sparkles,
    description: (_order) => 'Hygienic wash cycle & antibacterial sanitization',
    isActive: (status) => status === 'washing',
    isCompleted: (status) => ['ready_for_delivery', 'delivery_assigned', 'out_for_delivery', 'delivered'].includes(status)
  },
  {
    stageNumber: 4,
    label: 'Steam Press & Packaging',
    shortLabel: 'Packaging',
    icon: Package,
    description: (_order) => 'Steam ironed, folded, and quality checked',
    isActive: (status) => ['ready_for_delivery', 'delivery_assigned'].includes(status),
    isCompleted: (status) => ['out_for_delivery', 'delivered'].includes(status)
  },
  {
    stageNumber: 5,
    label: 'Out for Delivery',
    shortLabel: 'Delivery',
    icon: Truck,
    description: (order) => order.assigned_delivery_name ? `Courier: ${order.assigned_delivery_name}` : 'On the way to your doorstep',
    isActive: (status) => status === 'out_for_delivery',
    isCompleted: (status) => status === 'delivered'
  },
  {
    stageNumber: 6,
    label: 'Delivered',
    shortLabel: 'Delivered',
    icon: CheckCircle2,
    description: (_order) => 'Safely delivered to your doorstep',
    isActive: (status) => status === 'delivered',
    isCompleted: (status) => status === 'delivered'
  }
];

export const CustomerOrderTracker: React.FC<CustomerOrderTrackerProps> = ({
  order,
  variant = 'full',
  onViewDetails,
  className = ''
}) => {
  const navigate = useNavigate();

  if (!order) {
    return (
      <div className={`p-6 bg-white rounded-3xl border border-slate-200 text-center space-y-3 ${className}`}>
        <Clock className="w-8 h-8 text-slate-400 mx-auto" />
        <h4 className="font-bold text-slate-700 text-sm">No Active Laundry Order</h4>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          You don't have an in-progress laundry pickup right now. Schedule your next pickup in just a few taps!
        </p>
        <button
          type="button"
          onClick={() => navigate('/customer?tab=book')}
          className="py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Book a Home Pickup</span>
        </button>
      </div>
    );
  }

  const isCancelled = order.order_status === 'cancelled';
  const isDelivered = order.order_status === 'delivered';

  // Compact card view (ideal for Landing Page or top of customer dashboard)
  if (variant === 'compact') {
    return (
      <div className={`bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-md space-y-4 ${className}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center font-black text-sm shrink-0 border border-brand-100 shadow-xs">
              <Clock className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Live Order Tracker
                </span>
                <span className="font-mono font-bold text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                  #{order.order_number}
                </span>
              </div>
              <h3 className="font-black text-slate-900 text-base leading-tight">
                {order.service_name || 'Wash & Fold Laundry'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={order.order_status} size="sm" />
            <button
              type="button"
              onClick={() => {
                if (onViewDetails) onViewDetails(order);
                else navigate('/customer?tab=current');
              }}
              className="py-1.5 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
            >
              <span>View Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Cancelled State */}
        {isCancelled ? (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <span className="font-bold block">Order Cancelled</span>
              <p className="text-[11px] text-red-700">{order.cancellation_reason || 'This pickup order was cancelled.'}</p>
            </div>
          </div>
        ) : (
          /* 6-Stage Progression Bar */
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
              {TRACKER_STAGES.map((stage) => {
                const completed = stage.isCompleted(order.order_status);
                const current = stage.isActive(order.order_status);
                const Icon = stage.icon;

                return (
                  <div key={stage.stageNumber} className="flex flex-col items-center text-center">
                    <div
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all ${
                        completed
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : current
                          ? 'bg-brand-600 text-white ring-4 ring-brand-100 shadow-md animate-pulse'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                      title={stage.label}
                    >
                      {completed ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span
                      className={`text-[10px] font-bold mt-1.5 hidden sm:block truncate max-w-full ${
                        completed ? 'text-emerald-700' : current ? 'text-brand-700' : 'text-slate-400'
                      }`}
                    >
                      {stage.shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Current Stage Status Summary */}
            <div className="p-3 bg-slate-50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800">Current Status:</span>
                <span className="font-semibold text-brand-700">
                  {TRACKER_STAGES.find((s) => s.isActive(order.order_status))?.label || (isDelivered ? 'Delivered' : 'Order Placed')}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Scheduled: <span className="font-semibold text-slate-700">{order.pickup_date}</span> ({order.pickup_slot.split('(')[0].trim()})
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full detailed order tracking view
  return (
    <div className={`bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Live Order Tracking
          </span>
          <div className="flex items-center gap-2.5">
            <h2 className="font-black text-2xl text-slate-900 leading-tight">
              Order #{order.order_number}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
              {order.service_name || 'Wash & Fold'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Pickup: {order.pickup_date} • {order.pickup_slot}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.order_status} size="lg" />
        </div>
      </div>

      {/* Cancelled Alert */}
      {isCancelled ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-sm block text-red-950">Pickup Order Cancelled</span>
            <p className="text-xs text-red-800">
              {order.cancellation_reason || 'This order was cancelled. If you have questions, please contact our support team.'}
            </p>
          </div>
        </div>
      ) : (
        /* 6-Stage Timeline Display */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Order Lifecycle Progress
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              6 Stages • Doorstep to Doorstep
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {TRACKER_STAGES.map((stage) => {
              const completed = stage.isCompleted(order.order_status);
              const current = stage.isActive(order.order_status);
              const Icon = stage.icon;

              return (
                <div
                  key={stage.stageNumber}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    completed
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                      : current
                      ? 'bg-brand-50/70 border-brand-300 ring-2 ring-brand-500/20 text-brand-950 shadow-xs'
                      : 'bg-slate-50/80 border-slate-200/80 text-slate-400 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Stage {stage.stageNumber}
                    </span>
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        completed
                          ? 'bg-emerald-600 text-white'
                          : current
                          ? 'bg-brand-600 text-white animate-pulse'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      {completed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  <h4 className="font-bold text-xs text-slate-900 leading-tight">
                    {stage.label}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    {stage.description(order)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Order Context Details Strip */}
      <div className="p-4 bg-slate-50 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600 border border-slate-200">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Pickup Address</span>
          <p className="font-medium text-slate-800 mt-0.5 line-clamp-2">{order.pickup_address}</p>
          {order.pickup_landmark && (
            <span className="text-[11px] text-slate-500">Near: {order.pickup_landmark}</span>
          )}
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Billing & Weight</span>
          {order.measured_weight || order.doorstep_scale_weight_kg ? (
            <p className="font-bold text-slate-900 mt-0.5">
              Weight: {(order.measured_weight || order.doorstep_scale_weight_kg)?.toFixed(2)} kg
              {order.total_amount_paise ? ` • Bill: ₹${(order.total_amount_paise / 100).toFixed(0)}` : ''}
            </p>
          ) : (
            <p className="font-medium text-amber-700 mt-0.5">
              Pending digital scale weighing
            </p>
          )}
          <span className="text-[11px] text-slate-500 capitalize">
            Payment: {order.payment_method?.replace('_', ' ') || 'Cash on Delivery'} ({order.payment_status?.replace('_', ' ') || 'Pending'})
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Support & Help</span>
          <p className="font-medium text-slate-800 mt-0.5">
            Questions regarding this order?
          </p>
          <a
            href="tel:+919876543210"
            className="text-[11px] text-brand-600 hover:text-brand-700 font-bold inline-flex items-center gap-1 mt-0.5"
          >
            Call SuperWash Support
          </a>
        </div>
      </div>
    </div>
  );
};

