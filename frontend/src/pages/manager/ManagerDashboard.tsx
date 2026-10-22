import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Order, BusinessSettings } from '../../types';
import { LaundryService } from '../../services/laundryService';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { WeightEntryModal } from '../../components/WeightEntryModal';
import { AssignStaffModal } from '../../components/AssignStaffModal';
import {
  Scale, RefreshCw, Sparkles, CheckCircle,
  Truck, ArrowRight, UserPlus, Search, Phone, Calendar
} from 'lucide-react';

export const ManagerDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'collected' | 'washing' | 'ready'>('collected');
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modals
  const [weighingOrder, setWeighingOrder] = useState<Order | null>(null);
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [s, allOrds] = await Promise.all([
        LaundryService.getSettings(),
        LaundryService.getAllOrders()
      ]);
      setSettings(s);
      setOrders(allOrds);
    } catch (err) {
      console.error('Error loading manager orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter orders by search
  const filteredOrders = orders.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_phone.includes(q)
    );
  });

  // Section 1: New or Collected Orders (waiting for weight or just collected)
  const collectedOrders = filteredOrders.filter((o) =>
    o.order_status === 'collected' || o.order_status === 'booked' || o.order_status === 'pickup_assigned'
  );

  // Section 2: Washing (in washing machines)
  const washingOrders = filteredOrders.filter((o) => o.order_status === 'washing');

  // Section 3: Ready for Delivery (clean, awaiting dispatch)
  const readyOrders = filteredOrders.filter((o) => o.order_status === 'ready_for_delivery' || o.order_status === 'out_for_delivery');

  const handleStartWashing = async (order: Order) => {
    if (!order.measured_weight) {
      alert('Please enter and save the measured weight before starting washing.');
      return;
    }

    try {
      const updated = await LaundryService.updateOrderStatus(
        order.id,
        'washing',
        'Clothes placed into washing machine',
        currentUser?.full_name || 'Store Manager'
      );
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        setActiveTab('washing');
      }
    } catch (err) {
      console.error('Error starting washing:', err);
    }
  };

  const handleMarkReadyForDelivery = async (order: Order) => {
    try {
      const updated = await LaundryService.updateOrderStatus(
        order.id,
        'ready_for_delivery',
        'Clothes washed, dried, packed and ready for delivery',
        currentUser?.full_name || 'Store Manager'
      );
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        setActiveTab('ready');
      }
    } catch (err) {
      console.error('Error marking ready:', err);
    }
  };

  const handleDispatchOutForDelivery = async (order: Order) => {
    if (!order.assigned_delivery_id) {
      setAssigningOrder(order);
      return;
    }

    try {
      const updated = await LaundryService.updateOrderStatus(
        order.id,
        'out_for_delivery',
        `Dispatched with delivery agent ${order.assigned_delivery_name}`,
        currentUser?.full_name || 'Store Manager'
      );
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      }
    } catch (err) {
      console.error('Error dispatching order:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24">
      {/* Header */}
      <div className="bg-purple-900 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-purple-200">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight">Store Manager Portal</h1>
              <p className="text-xs text-purple-200">
                Scale Intake, Washing & Delivery Staging • {currentUser?.full_name || 'Manager'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-purple-800 hover:bg-purple-700 transition text-purple-200 flex items-center gap-1.5 text-xs font-semibold"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs & Search Filter */}
      <div className="bg-white border-b border-slate-200 sticky top-[68px] z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('collected')}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'collected'
                  ? 'bg-purple-700 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>1. New / Weighed</span>
              <span className="text-[10px] opacity-80">({collectedOrders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('washing')}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'washing'
                  ? 'bg-purple-700 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>2. Washing</span>
              <span className="text-[10px] opacity-80">({washingOrders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('ready')}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'ready'
                  ? 'bg-purple-700 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>3. Ready for Delivery</span>
              <span className="text-[10px] opacity-80">({readyOrders.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter order #, name, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-600"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-4">
        {/* ================= TAB 1: NEW / COLLECTED ORDERS ================= */}
        {activeTab === 'collected' && (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-xs text-purple-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-sm block">Intake Scale Station</span>
                <p className="text-purple-700">Weigh received batches in kilograms. The bill calculates automatically using the rate snapshot.</p>
              </div>
              <span className="font-bold bg-white px-3 py-1.5 rounded-xl border border-purple-200 text-purple-900 shrink-0">
                Current Rate: ₹{settings ? (settings.price_per_kg_paise / 100).toFixed(0) : '80'}/kg
              </span>
            </div>

            {collectedOrders.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm">
                No orders waiting for scale weighing or intake.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {collectedOrders.map((order) => {
                  const hasWeight = order.measured_weight !== null && order.measured_weight !== undefined;
                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-sm text-xs flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-black text-slate-900 text-base block">#{order.order_number}</span>
                            <span className="font-bold text-slate-800 text-sm">{order.customer_name}</span>
                            <span className="text-slate-500 block text-[11px] mt-0.5">📞 {order.customer_phone}</span>
                          </div>
                          <StatusBadge status={order.order_status} size="sm" />
                        </div>

                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Pickup: {order.pickup_date} ({order.pickup_slot})</span>
                        </div>

                        {order.delivery_notes && (
                          <p className="p-2.5 bg-amber-50 text-amber-900 rounded-xl text-[11px] border border-amber-200">
                            <strong>Note:</strong> {order.delivery_notes}
                          </p>
                        )}

                        {/* Weight & Bill Display */}
                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Scale Weight:</span>
                            <span className="font-bold text-slate-900 text-sm">
                              {hasWeight ? `${order.measured_weight?.toFixed(2)} kg` : 'Pending Weight'}
                            </span>
                          </div>

                          {hasWeight && (
                            <>
                              <div className="flex justify-between items-center text-slate-500 text-[11px]">
                                <span>Billable Weight:</span>
                                <span className="font-semibold text-slate-700">
                                  {order.billable_weight?.toFixed(2)} kg (Min. {order.min_weight_kg}kg)
                                </span>
                              </div>
                              <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                                <span className="font-bold text-slate-900">Total Calculated Bill:</span>
                                <span className="font-black text-brand-700 text-base">
                                  ₹{((order.total_amount_paise || 0) / 100).toFixed(2)}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => setWeighingOrder(order)}
                          className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                            hasWeight
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                              : 'bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-500/20'
                          }`}
                        >
                          <Scale className="w-4 h-4" />
                          {hasWeight ? 'Edit Weight' : 'Enter Weight (kg)'}
                        </button>

                        {hasWeight && (
                          <button
                            onClick={() => handleStartWashing(order)}
                            className="flex-1 py-2.5 px-3 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                          >
                            <Sparkles className="w-4 h-4" />
                            Start Washing
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: WASHING ================= */}
        {activeTab === 'washing' && (
          <div className="space-y-4">
            {washingOrders.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm">
                No clothes currently being washed.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {washingOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-sm text-xs flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-black text-slate-900 text-base block">#{order.order_number}</span>
                          <span className="font-bold text-slate-800 text-sm">{order.customer_name}</span>
                          <span className="text-[11px] text-slate-500 block">📞 {order.customer_phone}</span>
                        </div>
                        <StatusBadge status={order.order_status} size="sm" />
                      </div>

                      <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-2xl flex justify-between items-center text-cyan-900">
                        <div>
                          <span className="font-bold text-xs block">Weight: {order.measured_weight?.toFixed(2)} kg</span>
                          <span className="text-[11px] text-cyan-700">Bill: ₹{((order.total_amount_paise || 0) / 100).toFixed(2)}</span>
                        </div>
                        <button
                          onClick={() => setWeighingOrder(order)}
                          className="text-[11px] font-bold text-cyan-800 underline hover:text-cyan-900"
                        >
                          Correct Weight
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => handleMarkReadyForDelivery(order)}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mark Ready for Delivery
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: READY FOR DELIVERY ================= */}
        {activeTab === 'ready' && (
          <div className="space-y-4">
            {readyOrders.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm">
                No orders waiting for delivery dispatch.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {readyOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-sm text-xs flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-black text-slate-900 text-base block">#{order.order_number}</span>
                          <span className="font-bold text-slate-800 text-sm">{order.customer_name}</span>
                          <span className="text-[11px] text-slate-500 block truncate">📍 {order.pickup_address}</span>
                        </div>
                        <StatusBadge status={order.order_status} size="sm" />
                      </div>

                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Courier</span>
                          <span className="font-bold text-slate-900">
                            {order.assigned_delivery_name || 'Unassigned'}
                          </span>
                        </div>
                        <button
                          onClick={() => setAssigningOrder(order)}
                          className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-[11px] flex items-center gap-1 shadow-sm"
                        >
                          <UserPlus className="w-3 h-3" />
                          {order.assigned_delivery_name ? 'Reassign' : 'Assign'}
                        </button>
                      </div>

                      <div className="flex justify-between items-center text-slate-600">
                        <span>Total: <b>₹{((order.total_amount_paise || 0) / 100).toFixed(2)}</b></span>
                        <PaymentBadge status={order.payment_status} />
                      </div>
                    </div>

                    {order.order_status === 'ready_for_delivery' && (
                      <button
                        onClick={() => handleDispatchOutForDelivery(order)}
                        className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                      >
                        <Truck className="w-4 h-4" />
                        Dispatch Out for Delivery
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Weighing Modal */}
      {weighingOrder && (
        <WeightEntryModal
          order={weighingOrder}
          isOpen={!!weighingOrder}
          onClose={() => setWeighingOrder(null)}
          onSuccess={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setWeighingOrder(null);
          }}
          managerName={currentUser?.full_name || 'Store Manager'}
        />
      )}

      {/* Assign Staff Modal */}
      {assigningOrder && (
        <AssignStaffModal
          order={assigningOrder}
          isOpen={!!assigningOrder}
          onClose={() => setAssigningOrder(null)}
          onSuccess={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setAssigningOrder(null);
          }}
          assignedByName={currentUser?.full_name || 'Store Manager'}
        />
      )}
    </div>
  );
};
