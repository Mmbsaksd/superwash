import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Order, BusinessSettings } from '../../types';
import { LaundryService } from '../../services/laundryService';
import { supabase } from '../../services/supabase';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { PaymentModal } from '../../components/PaymentModal';
import {
  Phone, MapPin, CheckCircle, Package, Truck,
  AlertCircle, IndianRupee, RefreshCw, X, Search, Calendar, LogOut, Scale, Clock, CheckCircle2
} from 'lucide-react';

type DeliveryTab = 'pickups' | 'deliveries' | 'completed_deliveries' | 'pickup_history';

export const DeliveryDashboard: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<DeliveryTab>('pickups');
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [deliveryActionError, setDeliveryActionError] = useState<string | null>(null);
  const [deliveryActionSuccess, setDeliveryActionSuccess] = useState<string | null>(null);

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

  // 1. Pickups: Strictly assigned to this associate for pickup and in pickup_assigned state
  const pickups = filteredOrders.filter((o) =>
    (currentUser?.role === 'owner' || o.assigned_pickup_id === currentUser?.id) &&
    o.order_status === 'pickup_assigned'
  );

  // 2. Deliveries: Strictly assigned to this associate for delivery in ready_for_delivery, delivery_assigned, or out_for_delivery
  const deliveries = filteredOrders.filter((o) =>
    (currentUser?.role === 'owner' || o.assigned_delivery_id === currentUser?.id) &&
    (o.order_status === 'ready_for_delivery' || o.order_status === 'delivery_assigned' || o.order_status === 'out_for_delivery')
  );

  // 3. Completed Deliveries: STRICTLY delivered orders handed over by this delivery courier
  const completedDeliveries = filteredOrders.filter((o) =>
    (currentUser?.role === 'owner' || o.assigned_delivery_id === currentUser?.id) &&
    o.order_status === 'delivered'
  );

  // 4. Pickup History: Orders collected by this pickup associate (doorstep weight recorded)
  const pickupHistory = filteredOrders.filter((o) =>
    (currentUser?.role === 'owner' || o.assigned_pickup_id === currentUser?.id) &&
    ['collected', 'washing', 'ready_for_delivery', 'delivery_assigned', 'out_for_delivery', 'delivered'].includes(o.order_status)
  );

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
        setDeliveryActionSuccess(`Order #${collectedOrder.order_number} collected & weighed (${parsedWeight.toFixed(2)} kg)! Stored in database.`);
        setCollectedOrder(null);
        setMeasuredWeightInput('');
        setCollectedNote('');
        await loadData();
      }
    } catch (err: any) {
      console.error('Error recording pickup collection & weight:', err);
      setWeightError(err?.message || 'Failed to record pickup collection in database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartDelivery = async (order: Order) => {
    setDeliveryActionError(null);
    setDeliveryActionSuccess(null);

    try {
      setIsSubmitting(true);
      const updated = await LaundryService.updateOrderStatus(
        order.id,
        'out_for_delivery',
        `Dispatched by delivery associate ${currentUser?.full_name || 'Courier'}`
      );
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        setDeliveryActionSuccess(`Order #${order.order_number} is now Out for Delivery! You can now complete the customer handover.`);
        await loadData();
      }
    } catch (err: any) {
      console.error('Error starting delivery:', err);
      setDeliveryActionError(err?.message || 'Failed to dispatch order for delivery.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkDelivered = async (order: Order) => {
    setDeliveryActionError(null);
    setDeliveryActionSuccess(null);

    if (order.order_status !== 'out_for_delivery') {
      setDeliveryActionError(`Order #${order.order_number} must be in 'out_for_delivery' status before completing delivery.`);
      return;
    }

    if (order.payment_status !== 'paid') {
      const remainingDue = ((order.total_amount_paise || 0) - order.paid_amount_paise) / 100;
      const confirmMsg = `Order #${order.order_number} has an unpaid balance of ₹${remainingDue.toFixed(2)}. Are you sure you want to mark it as Delivered?`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const updated = await LaundryService.markOrderDelivered(
        order.id,
        currentUser?.full_name || 'Delivery Staff'
      );
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        setDeliveryActionSuccess(`Order #${order.order_number} delivered successfully! Customer notified on WhatsApp.`);
        await loadData();
      }
    } catch (err: any) {
      console.error('Error marking delivered:', err);
      setDeliveryActionError(err?.message || 'Database rejected delivery completion. Please check network/session.');
    } finally {
      setIsSubmitting(false);
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto">
            <button
              onClick={() => { setActiveTab('pickups'); setDeliveryActionError(null); setDeliveryActionSuccess(null); }}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
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
              onClick={() => { setActiveTab('deliveries'); setDeliveryActionError(null); setDeliveryActionSuccess(null); }}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
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
              onClick={() => { setActiveTab('completed_deliveries'); setDeliveryActionError(null); setDeliveryActionSuccess(null); }}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'completed_deliveries'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              <span>Delivered</span>
              <span className="text-[10px] opacity-80">({completedDeliveries.length})</span>
            </button>

            <button
              onClick={() => { setActiveTab('pickup_history'); setDeliveryActionError(null); setDeliveryActionSuccess(null); }}
              className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'pickup_history'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Pickup History</span>
              <span className="text-[10px] opacity-80">({pickupHistory.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search address, order #, name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-600 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-4">
        {/* Global Action Alerts */}
        {deliveryActionSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs flex justify-between items-center shadow-sm">
            <span className="font-semibold">✓ {deliveryActionSuccess}</span>
            <button
              onClick={() => setDeliveryActionSuccess(null)}
              className="text-emerald-700 font-bold p-1 hover:bg-emerald-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {deliveryActionError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs flex justify-between items-center shadow-sm">
            <span className="font-semibold">⚠ {deliveryActionError}</span>
            <button
              onClick={() => setDeliveryActionError(null)}
              className="text-red-700 font-bold p-1 hover:bg-red-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ================= TAB 1: TODAY'S PICKUPS ================= */}
        {activeTab === 'pickups' && (
          <div className="space-y-4">
            {pickups.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm space-y-2">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">All pickups completed!</h3>
                <p>No pending clothes pickup tasks currently scheduled for collection.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pickups.map((order) => {
                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-sm text-xs flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-black text-slate-900 text-base block">#{order.order_number}</span>
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 my-0.5">
                              {order.service_name || 'Wash & Fold (Normal)'}
                            </span>
                            <span className="font-bold text-slate-800 text-sm block">{order.customer_name}</span>
                            <span className="text-[11px] text-slate-500 block">📞 {order.customer_phone}</span>
                          </div>
                          <StatusBadge status={order.order_status} size="sm" />
                        </div>

                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 block text-[11px]">Pickup Location:</span>
                            {LaundryService.hasValidCoordinates(order) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <MapPin className="w-2.5 h-2.5 text-emerald-600" /> GPS Pinned
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700">
                                📝 Text Address
                              </span>
                            )}
                          </div>
                          <p className="leading-relaxed">{order.pickup_address}</p>
                          {order.pickup_landmark && (
                            <p className="text-slate-500 text-[11px]">Landmark: {order.pickup_landmark}</p>
                          )}
                          <div className="pt-1 flex items-center gap-1.5 text-slate-500 text-[11px] font-mono">
                            <span>PIN: {order.pickup_pincode}</span>
                            <span>•</span>
                            <span>{order.pickup_slot}</span>
                          </div>
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
                            title={LaundryService.hasValidCoordinates(order) ? "Open exact GPS driving directions in Google Maps" : "Search address in Google Maps"}
                          >
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{LaundryService.hasValidCoordinates(order) ? 'Directions (GPS)' : 'Search Maps'}</span>
                          </a>
                        </div>
                      </div>

                      {/* Action: Open Doorstep Weigh & Collect Modal */}
                      <button
                        onClick={() => {
                          setCollectedOrder(order);
                          setMeasuredWeightInput('');
                          setCollectedNote('');
                          setWeightError(null);
                        }}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Scale className="w-4 h-4 text-emerald-200" />
                        <span>Weigh & Confirm Pickup (Portable Scale)</span>
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
                <p>Clean clothes assigned to you for delivery will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deliveries.map((order) => {
                  const totalPaise = order.total_amount_paise || 0;
                  const paidPaise = order.paid_amount_paise || 0;
                  const balancePaise = Math.max(0, totalPaise - paidPaise);
                  const isPaid = order.payment_status === 'paid';

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-sm text-xs flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-black text-slate-900 text-base block">#{order.order_number}</span>
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 my-0.5">
                              {order.service_name || 'Wash & Fold (Normal)'}
                            </span>
                            <span className="font-bold text-slate-800 text-sm block">{order.customer_name}</span>
                            <span className="text-[11px] text-slate-500 block">📞 {order.customer_phone}</span>
                          </div>
                          <StatusBadge status={order.order_status} size="sm" />
                        </div>

                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 block text-[11px]">Delivery Address:</span>
                            {LaundryService.hasValidCoordinates(order) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <MapPin className="w-2.5 h-2.5 text-emerald-600" /> GPS Pinned
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700">
                                📝 Text Address
                              </span>
                            )}
                          </div>
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
                            title={LaundryService.hasValidCoordinates(order) ? "Open exact GPS driving directions in Google Maps" : "Search address in Google Maps"}
                          >
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{LaundryService.hasValidCoordinates(order) ? 'Directions (GPS)' : 'Search Maps'}</span>
                          </a>
                        </div>
                      </div>

                      {/* Lifecycle Controlled Actions */}
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {/* 1. OUT FOR DELIVERY -> Active Handover */}
                        {order.order_status === 'out_for_delivery' && (
                          <>
                            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800 flex items-center gap-1.5 font-semibold">
                              <Truck className="w-4 h-4 text-blue-600 shrink-0" />
                              <span>Dispatched: Package in transit to customer</span>
                            </div>

                            {/* Doorstep payment collection if balance remains */}
                            {settings?.allow_delivery_payment_recording && !isPaid && (
                              <button
                                onClick={() => setPaymentOrder(order)}
                                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <IndianRupee className="w-4 h-4" />
                                <span>Collect Doorstep Payment (Cash / UPI)</span>
                              </button>
                            )}

                            {/* Mark Delivered button */}
                            <button
                              onClick={() => handleMarkDelivered(order)}
                              disabled={isSubmitting}
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>{isSubmitting ? 'Updating Database...' : 'Complete Delivery & Handover'}</span>
                            </button>
                          </>
                        )}

                        {/* 2. READY FOR DELIVERY / DELIVERY ASSIGNED -> At Store, Waiting Dispatch */}
                        {(order.order_status === 'ready_for_delivery' || order.order_status === 'delivery_assigned') && (
                          <div className="space-y-2">
                            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                              <div className="flex items-center gap-1.5 font-bold">
                                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>Ready at Store • Awaiting Dispatch</span>
                              </div>
                              <p className="text-[10px] text-amber-700 leading-tight">
                                Clean laundry is packed at the store. When departing with the package, click below to start delivery.
                              </p>
                            </div>

                            <button
                              onClick={() => handleStartDelivery(order)}
                              disabled={isSubmitting}
                              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Truck className="w-4 h-4" />
                              <span>Depart Store (Start Delivery)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: DELIVERED HISTORY ================= */}
        {activeTab === 'completed_deliveries' && (
          <div className="space-y-4">
            {completedDeliveries.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm space-y-2">
                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">No delivered orders yet</h3>
                <p>Deliveries successfully completed and handed over by you will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedDeliveries.map((order) => {
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
                          <StatusBadge status="delivered" size="sm" />
                        </div>

                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-1 text-[11px] text-emerald-900">
                          <div className="flex justify-between">
                            <span>Delivered At:</span>
                            <b>{order.delivered_at ? new Date(order.delivered_at).toLocaleString() : 'Completed'}</b>
                          </div>
                          {order.measured_weight && (
                            <div className="flex justify-between">
                              <span>Weight:</span>
                              <b>{order.measured_weight.toFixed(2)} kg</b>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Amount Billed:</span>
                            <b>₹{((order.total_amount_paise || 0) / 100).toFixed(2)}</b>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-emerald-200">
                            <span>Payment:</span>
                            <PaymentBadge status={order.payment_status} />
                          </div>
                        </div>

                        {order.delivery_notes && (
                          <div className="p-2 bg-slate-50 rounded-xl text-[10px] text-slate-600 italic">
                            "{order.delivery_notes}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: PICKUP HISTORY ================= */}
        {activeTab === 'pickup_history' && (
          <div className="space-y-4">
            {pickupHistory.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm space-y-2">
                <Package className="w-10 h-10 text-blue-400 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">No pickup history</h3>
                <p>Clothes collected and weighed on the portable scale by you will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pickupHistory.map((order) => {
                  const weightKg = order.pickup_measured_weight || order.measured_weight;
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

                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl space-y-1 text-[11px] text-blue-900">
                          <div className="flex justify-between">
                            <span>Doorstep Scale Weight:</span>
                            <b className="text-slate-950 text-xs">{weightKg ? `${weightKg.toFixed(2)} kg` : 'Recorded'}</b>
                          </div>
                          {order.collected_at && (
                            <div className="flex justify-between text-[10px] text-blue-700">
                              <span>Collected At:</span>
                              <span>{new Date(order.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Current Processing Stage:</span>
                            <span className="font-bold capitalize">{order.order_status.replace(/_/g, ' ')}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-slate-600">
                          <span>Total Bill: <b>₹{((order.total_amount_paise || 0) / 100).toFixed(2)}</b></span>
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
                    <h3 className="font-black text-sm">Doorstep Laundry Weighing</h3>
                    <p className="text-[11px] text-emerald-100">Order #{collectedOrder.order_number}</p>
                  </div>
                </div>
                <button
                  onClick={() => setCollectedOrder(null)}
                  className="p-1 hover:bg-emerald-800 rounded-xl transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleMarkCollected} className="p-5 space-y-4 text-xs">
                {/* Customer summary */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Customer:</span>
                    <span className="font-bold text-slate-800">{collectedOrder.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Phone:</span>
                    <span className="font-bold text-slate-800">{collectedOrder.customer_phone}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 truncate mt-1">
                    📍 {collectedOrder.pickup_address}
                  </div>
                </div>

                {/* Weight Input Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Measured Scale Reading (kg) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="100"
                      autoFocus
                      required
                      placeholder="e.g. 4.25"
                      value={measuredWeightInput}
                      onChange={(e) => {
                        setMeasuredWeightInput(e.target.value);
                        setWeightError(null);
                      }}
                      className="w-full px-3.5 py-2.5 text-base font-black rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <span className="absolute right-3.5 top-2.5 text-slate-400 font-bold text-sm">kg</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Read exact weight from portable digital scale (0.10 kg to 100 kg).
                  </p>
                </div>

                {/* Live Bill Preview */}
                {hasValidWeight && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1 animate-fade-in text-emerald-950">
                    <div className="flex justify-between text-[11px]">
                      <span>Rate:</span>
                      <span>₹{ratePerKg.toFixed(0)}/kg (Min {minWeight.toFixed(0)} kg)</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span>Billable Weight:</span>
                      <span className="font-bold">{billableKg.toFixed(2)} kg {parsedWeight < minWeight && '(Min Applied)'}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-emerald-200 text-xs font-black">
                      <span>Calculated Bill:</span>
                      <span className="text-emerald-700 text-sm">₹{((previewTotalPaise || 0) / 100).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Optional collection note */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pickup Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2 bags collected from security desk"
                    value={collectedNote}
                    onChange={(e) => setCollectedNote(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {weightError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{weightError}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCollectedOrder(null)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !hasValidWeight}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? 'Saving...' : 'Confirm Pickup'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Payment Recording Modal */}
      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          isOpen={true}
          onClose={() => setPaymentOrder(null)}
          onPaymentSuccess={async (updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setPaymentOrder(null);
            setDeliveryActionSuccess(`Payment of ₹${((updated.paid_amount_paise || 0) / 100).toFixed(2)} recorded for Order #${updated.order_number}!`);
            await loadData();
          }}
          recordedBy={currentUser?.id}
          recordedByName={currentUser?.full_name || 'Delivery Associate'}
          isStaff={true}
        />
      )}
    </div>
  );
};
