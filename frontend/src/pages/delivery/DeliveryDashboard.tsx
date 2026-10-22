import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Order, BusinessSettings } from '../../types';
import { LaundryService } from '../../services/laundryService';
import { supabase } from '../../services/supabase';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { PaymentModal } from '../../components/PaymentModal';
import {
  Phone, MapPin, CheckCircle, Package, Truck,
  AlertCircle, IndianRupee, RefreshCw, X, Search, Calendar, LogOut, Scale
} from 'lucide-react';

export const DeliveryDashboard: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'pickups' | 'deliveries' | 'history'>('pickups');
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Doorstep Intake & Scale Weighing Modal state
  const [collectedOrder, setCollectedOrder] = useState<Order | null>(null);
  const [measuredWeightInput, setMeasuredWeightInput] = useState<string>('');
  const [collectedNote, setCollectedNote] = useState<string>('');
  const [weightError, setWeightError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Payment Recording Modal
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadData();

    const handleFocus = () => {
      loadData();
    };
    window.addEventListener('focus', handleFocus);

    const channel = supabase
      .channel('delivery-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [s, allOrds] = await Promise.all([
        LaundryService.getSettings(),
        LaundryService.getAllOrders()
      ]);
      setSettings(s);

      // Filter orders assigned to this delivery associate for pickup OR delivery
      const assigned = allOrds.filter((o) => {
        if (currentUser?.role === 'owner') return true;
        const isAssignedPickup = o.assigned_pickup_id === currentUser?.id;
        const isAssignedDelivery = o.assigned_delivery_id === currentUser?.id;
        return isAssignedPickup || isAssignedDelivery;
      });
      setOrders(assigned);
    } catch (err) {
      console.error('Error loading delivery dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_phone.includes(q) ||
      o.pickup_address.toLowerCase().includes(q)
    );
  });

  // Pickups: Strictly assigned to this associate for pickup and in pickup_assigned state
  const pickups = filteredOrders.filter((o) =>
    (currentUser?.role === 'owner' || o.assigned_pickup_id === currentUser?.id) &&
    o.order_status === 'pickup_assigned'
  );

  // Deliveries: Strictly assigned to this associate for delivery at ready or out_for_delivery stage
  const deliveries = filteredOrders.filter((o) =>
    (currentUser?.role === 'owner' || o.assigned_delivery_id === currentUser?.id) &&
    (o.order_status === 'ready_for_delivery' || o.order_status === 'out_for_delivery')
  );

  // Completed Tasks: Doorstep collections completed or deliveries handed over
  const historyOrders = filteredOrders.filter((o) => {
    const isMyPickup = (currentUser?.role === 'owner' || o.assigned_pickup_id === currentUser?.id) &&
      ['collected', 'washing', 'ready_for_delivery', 'out_for_delivery', 'delivered'].includes(o.order_status);
    const isMyDelivery = (currentUser?.role === 'owner' || o.assigned_delivery_id === currentUser?.id) &&
      o.order_status === 'delivered';
    return isMyPickup || isMyDelivery;
  });

  const handleMarkCollected = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectedOrder) return;

    const parsedWeight = parseFloat(measuredWeightInput);
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      setWeightError('Please enter a valid scale weight in kilograms (e.g. 4.50).');
      return;
    }
    if (parsedWeight > 100) {
      setWeightError('Weight exceeds 100 kg limit. Please verify portable scale reading.');
      return;
    }

    setIsSubmitting(true);
    setWeightError(null);

    try {
      const updated = await LaundryService.recordPickupCollectionAndWeight(
        collectedOrder.id,
        parsedWeight,
        currentUser?.id,
        currentUser?.full_name || 'Delivery Associate',
        collectedNote.trim() || undefined
      );

      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        setCollectedOrder(null);
        setMeasuredWeightInput('');
        setCollectedNote('');
      }
    } catch (err: any) {
      console.error('Error recording pickup collection & weight:', err);
      setWeightError(err?.message || 'Failed to record pickup collection in database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkDelivered = async (order: Order) => {
    if (order.payment_status !== 'paid') {
      const confirmMsg = `Order #${order.order_number} has an unpaid balance of ₹${(((order.total_amount_paise || 0) - order.paid_amount_paise) / 100).toFixed(2)}. Are you sure you want to mark it as Delivered?`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    try {
      const updated = await LaundryService.markOrderDelivered(
        order.id,
        currentUser?.full_name || 'Delivery Staff'
      );
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      }
    } catch (err) {
      console.error('Error marking delivered:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24">
      {/* Header */}
      <div className="bg-emerald-700 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-200">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight">Delivery Associate Portal</h1>
              <p className="text-xs text-emerald-100">
                Doorstep Pickups & Deliveries • {currentUser?.full_name || 'Delivery Staff'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-emerald-800 hover:bg-emerald-600 transition text-emerald-100 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Refresh Orders"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={logout}
              className="p-2 rounded-xl bg-emerald-800 hover:bg-emerald-600 transition text-emerald-100 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white border-b border-slate-200 sticky top-[68px] z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('pickups')}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'pickups'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Pickups</span>
              <span className="text-[10px] opacity-80">({pickups.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('deliveries')}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'deliveries'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Deliveries</span>
              <span className="text-[10px] opacity-80">({deliveries.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              <span>Completed</span>
              <span className="text-[10px] opacity-80">({historyOrders.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search address, order #, name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-4">
        {/* ================= TAB 1: TODAY'S PICKUPS ================= */}
        {activeTab === 'pickups' && (
          <div className="space-y-4">
            {pickups.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm space-y-2">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">All pickups completed!</h3>
                <p>No pending clothes pickup tasks currently scheduled.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pickups.map((order) => {
                  const mapQuery = encodeURIComponent(`${order.pickup_address}, ${order.pickup_pincode}`);
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
                            <span className="text-[11px] text-slate-500 block">📞 {order.customer_phone}</span>
                          </div>
                          <StatusBadge status={order.order_status} size="sm" />
                        </div>

                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700 space-y-1">
                          <span className="font-bold text-slate-800 block text-[11px]">Pickup Location:</span>
                          <p className="leading-relaxed">{order.pickup_address}</p>
                          {order.pickup_landmark && (
                            <p className="text-slate-500 text-[11px]">Landmark: {order.pickup_landmark}</p>
                          )}
                          <div className="flex justify-between text-slate-500 text-[10px] mt-1 pt-1 border-t border-slate-200">
                            <span>Slot: {order.pickup_slot}</span>
                            <span>Date: {order.pickup_date}</span>
                          </div>
                        </div>

                        {/* Call & Maps Actions */}
                        <div className="grid grid-cols-2 gap-2">
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700 flex items-center justify-center gap-1.5 transition text-center"
                          >
                            <Phone className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                            <span>Call</span>
                          </a>

                          <a
                            href={LaundryService.getGoogleMapsDirectionsUrl(order)}
                            target="_blank"
                            rel="noreferrer"
                            className="py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold flex items-center justify-center gap-1.5 transition text-center"
                            title="Open driving directions in Google Maps"
                          >
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>Directions</span>
                          </a>
                        </div>
                      </div>

                      {/* Tap button: Mark Collected */}
                      <button
                        onClick={() => setCollectedOrder(order)}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Mark as Collected</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: TODAY'S DELIVERIES ================= */}
        {activeTab === 'deliveries' && (
          <div className="space-y-4">
            {deliveries.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm space-y-2">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">No pending deliveries!</h3>
                <p>Clean clothes ready for dispatch will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deliveries.map((order) => {
                  const totalPaise = order.total_amount_paise || 0;
                  const paidPaise = order.paid_amount_paise || 0;
                  const balancePaise = Math.max(0, totalPaise - paidPaise);
                  const isPaid = order.payment_status === 'paid';
                  const mapQuery = encodeURIComponent(`${order.pickup_address}, ${order.pickup_pincode}`);

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
                            <span className="text-[11px] text-slate-500 block">📞 {order.customer_phone}</span>
                          </div>
                          <StatusBadge status={order.order_status} size="sm" />
                        </div>

                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700 space-y-1">
                          <span className="font-bold text-slate-800 block text-[11px]">Delivery Address:</span>
                          <p>{order.pickup_address}</p>
                          {order.pickup_landmark && (
                            <p className="text-slate-500 text-[11px]">Landmark: {order.pickup_landmark}</p>
                          )}
                        </div>

                        {/* Bill & Balance Due Card */}
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-amber-900">Total Bill:</span>
                            <span className="font-black text-slate-900 text-sm">₹{(totalPaise / 100).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-amber-800">Status:</span>
                            <PaymentBadge status={order.payment_status} />
                          </div>
                          {!isPaid && (
                            <div className="flex justify-between items-center pt-1 border-t border-amber-200">
                              <span className="font-bold text-red-700">Amount Due:</span>
                              <span className="font-black text-red-700 text-base">₹{(balancePaise / 100).toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        {/* Call & Maps */}
                        <div className="grid grid-cols-2 gap-2">
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700 flex items-center justify-center gap-1.5 transition text-center"
                          >
                            <Phone className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                            <span>Call</span>
                          </a>

                          <a
                            href={LaundryService.getGoogleMapsDirectionsUrl(order)}
                            target="_blank"
                            rel="noreferrer"
                            className="py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold flex items-center justify-center gap-1.5 transition text-center"
                            title="Open driving directions in Google Maps"
                          >
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>Directions</span>
                          </a>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {/* Doorstep payment collection */}
                        {settings?.allow_delivery_payment_recording && !isPaid && (
                          <button
                            onClick={() => setPaymentOrder(order)}
                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                          >
                            <IndianRupee className="w-4 h-4" />
                            <span>Collect Doorstep Payment (Cash / UPI)</span>
                          </button>
                        )}

                        {/* Mark Delivered */}
                        <button
                          onClick={() => handleMarkDelivered(order)}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Mark as Delivered</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: COMPLETED TASKS ================= */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {historyOrders.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm space-y-2">
                <CheckCircle className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">No completed tasks yet</h3>
                <p>Pickups collected and deliveries completed by you will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {historyOrders.map((order) => {
                  const wasMyPickup = order.assigned_pickup_id === currentUser?.id;
                  const wasMyDelivery = order.assigned_delivery_id === currentUser?.id;
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
                            <span className="text-[11px] text-slate-500 block truncate">📍 {order.pickup_address}</span>
                          </div>
                          <StatusBadge status={order.order_status} size="sm" />
                        </div>

                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1 text-[11px] text-slate-700">
                          {order.measured_weight && (
                            <div className="flex justify-between">
                              <span>Measured Weight:</span>
                              <b className="text-slate-900">{order.measured_weight.toFixed(2)} kg</b>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Your Role:</span>
                            <b className="text-brand-700">
                              {wasMyPickup && wasMyDelivery
                                ? 'Pickup & Delivery'
                                : wasMyPickup
                                ? 'Pickup Executive'
                                : 'Delivery Courier'}
                            </b>
                          </div>
                          {order.collected_at && (
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>Collected:</span>
                              <span>{new Date(order.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          )}
                          {order.delivered_at && (
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>Delivered:</span>
                              <span>{new Date(order.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center text-slate-600">
                          <span>Total: <b>₹{((order.total_amount_paise || 0) / 100).toFixed(2)}</b></span>
                          <PaymentBadge status={order.payment_status} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Doorstep Intake & Scale Weighing Modal */}
      {collectedOrder && (() => {
        const parsedWeight = parseFloat(measuredWeightInput);
        const hasValidWeight = !isNaN(parsedWeight) && parsedWeight > 0;
        const ratePerKg = (collectedOrder.price_per_kg_paise || 8000) / 100;
        const minWeight = collectedOrder.min_weight_kg || 3.0;
        const billableKg = hasValidWeight ? Math.max(parsedWeight, minWeight) : minWeight;
        const previewTotalPaise = hasValidWeight
          ? Math.round(billableKg * (collectedOrder.price_per_kg_paise || 8000)) + (collectedOrder.delivery_charge_paise || 0)
          : null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-200 overflow-hidden">
              <div className="bg-emerald-700 p-4 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-emerald-200" />
                  <div>
                    <h3 className="font-bold text-sm">Doorstep Laundry Weighing</h3>
                    <p className="text-[10px] text-emerald-100">Portable Scale Intake • Order #{collectedOrder.order_number}</p>
                  </div>
                </div>
                <button onClick={() => setCollectedOrder(null)} className="p-1 text-white hover:bg-white/20 rounded-full cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleMarkCollected} className="p-5 space-y-4 text-xs">
                {/* Order Details Card */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                  <div className="flex justify-between items-start">
                    <span className="font-black text-slate-900">#{collectedOrder.order_number}</span>
                    <span className="font-bold text-slate-800">{collectedOrder.customer_name}</span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    📍 {collectedOrder.pickup_address}
                  </p>
                  <p className="text-slate-500 text-[10px]">
                    Slot: {collectedOrder.pickup_slot} ({collectedOrder.pickup_date})
                  </p>
                  {collectedOrder.notes && (
                    <p className="text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200 text-[10px] mt-1">
                      <strong>Customer note:</strong> {collectedOrder.notes}
                    </p>
                  )}
                </div>

                {weightError && (
                  <div className="p-2.5 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{weightError}</span>
                  </div>
                )}

                {/* Scale Weight Input */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5 flex justify-between items-center">
                    <span>Enter Scale Weight (kg) *</span>
                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Rate: ₹{ratePerKg.toFixed(0)}/kg (Min {minWeight}kg)
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="100"
                      placeholder="e.g. 4.50"
                      value={measuredWeightInput}
                      onChange={(e) => {
                        setMeasuredWeightInput(e.target.value);
                        setWeightError(null);
                      }}
                      required
                      autoFocus
                      className="w-full pl-9 pr-12 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 font-mono text-sm font-bold text-slate-900"
                    />
                    <Scale className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">kg</span>
                  </div>
                </div>

                {/* Live Bill Preview */}
                {hasValidWeight && previewTotalPaise !== null && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 space-y-1 animate-fade-in">
                    <div className="flex justify-between items-center text-[11px]">
                      <span>Billable Weight:</span>
                      <b>{billableKg.toFixed(2)} kg {parsedWeight < minWeight && <span className="text-[10px] font-normal text-emerald-700">(Min weight applied)</span>}</b>
                    </div>
                    <div className="flex justify-between items-center text-xs font-black border-t border-emerald-200 pt-1 mt-1">
                      <span>Calculated Customer Bill:</span>
                      <span className="text-emerald-700 text-sm">₹{(previewTotalPaise / 100).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Optional Collection Note */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Optional Collection Note / Bag Count
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2 bags collected from doorstep"
                    value={collectedNote}
                    onChange={(e) => setCollectedNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCollectedOrder(null)}
                    className="flex-1 py-2.5 px-3 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !hasValidWeight}
                    className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>{isSubmitting ? 'Recording...' : 'Confirm & Save Weight'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Payment Modal */}
      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          isOpen={!!paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onPaymentSuccess={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setPaymentOrder(null);
          }}
          recordedBy={currentUser?.id}
          recordedByName={currentUser?.full_name || 'Delivery Staff'}
          isStaff={true}
        />
      )}
    </div>
  );
};
