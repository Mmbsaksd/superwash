import React from 'react';
import { CheckCircle, Circle, Clock, Package, RefreshCw, Sparkles, CheckCheck, XCircle } from 'lucide-react';
import { Order, OrderStatus } from '../types';

interface OrderTimelineProps {
  order: Order;
}

const ORDER_STAGES: { status: OrderStatus; label: string; desc: string; icon: any }[] = [
  { status: 'order_placed', label: 'Order Placed', desc: 'Order received and logged in system', icon: Clock },
  { status: 'pickup_scheduled', label: 'Pickup Scheduled', desc: 'Logistics staff dispatched for doorstep pickup', icon: Package },
  { status: 'clothes_received', label: 'Clothes Received', desc: 'Clothes safely received at shop counter', icon: Package },
  { status: 'garment_inspection', label: 'Inspection & Tagging', desc: 'Garments counted, checked for stains & tagged', icon: RefreshCw },
  { status: 'washing_drycleaning', label: 'Washing / Dry Cleaning', desc: 'Custom fabric cycle in progress', icon: RefreshCw },
  { status: 'ironing_finishing', label: 'Steam Pressing', desc: 'Vacuum table steam iron & folding/hanging', icon: Sparkles },
  { status: 'quality_check', label: 'Quality Check', desc: 'Double inspection for stain removal and finish', icon: CheckCircle },
  { status: 'ready_for_delivery', label: 'Ready for Collection', desc: 'Packed and ready for pickup / delivery', icon: Package },
  { status: 'out_for_delivery', label: 'Out for Delivery', desc: 'With delivery executive on route', icon: Package },
  { status: 'delivered_collected', label: 'Delivered / Collected', desc: 'Order successfully completed', icon: CheckCheck },
];

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ order }) => {
  // If order was shop drop-off, filter out pickup_scheduled from primary progression
  const visibleStages = ORDER_STAGES.filter(stage => {
    if (order.handover_method === 'shop_dropoff' && stage.status === 'pickup_scheduled') {
      return false;
    }
    return true;
  });

  const getStageIndex = (status: string) => {
    return visibleStages.findIndex(s => s.status === status);
  };

  const currentIndex = getStageIndex(order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="py-4">
      {isCancelled ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-red-900 text-sm">Order Cancelled</h4>
            <p className="text-red-700 text-xs mt-1">Reason: {order.cancellation_reason || 'Cancelled by customer/store.'}</p>
          </div>
        </div>
      ) : (
        <div className="relative">
          <ol className="relative border-l-2 border-slate-200 ml-4 space-y-6">
            {visibleStages.map((stage, idx) => {
              const isPassed = idx < currentIndex;
              const isCurrent = idx === currentIndex;
              const Icon = stage.icon;

              // Find matching history entry
              const historyEntry = order.status_history?.find(h => h.new_status === stage.status);

              return (
                <li key={stage.status} className="mb-6 ml-6">
                  <span
                    className={`absolute -left-3.5 flex items-center justify-center w-7 h-7 rounded-full ring-4 ring-white ${
                      isPassed
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-brand-600 text-white ring-brand-100 animate-pulse'
                        : 'bg-slate-100 text-slate-400 border border-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <h3 className={`text-sm font-bold ${isCurrent ? 'text-brand-600' : isPassed ? 'text-slate-900' : 'text-slate-400'}`}>
                      {stage.label}
                    </h3>
                    {historyEntry && (
                      <time className="text-[11px] font-mono text-slate-400">
                        {new Date(historyEntry.created_at).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </time>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 mt-0.5">{stage.desc}</p>

                  {historyEntry?.notes && (
                    <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                      <span className="font-medium text-slate-700">Note:</span> {historyEntry.notes}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
};
