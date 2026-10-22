import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Order, CustomerAddress, PickupSlot, BusinessSettings, OrderFeedback } from '../../types';
import { LaundryService } from '../../services/laundryService';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { PaymentModal } from '../../components/PaymentModal';
import { FeedbackModal } from '../../components/FeedbackModal';
import {
  Calendar, Clock, MapPin, Plus, Phone,
  CheckCircle2, AlertCircle, Sparkles,
  QrCode, ArrowRight, User, Star, MessageSquareHeart,
  ShieldCheck, RefreshCw
} from 'lucide-react';

export const CustomerHome: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'book' | 'current' | 'history' | 'addresses' | 'contact'>('book');
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, OrderFeedback>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Booking Form State
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [isEnteringNewAddress, setIsEnteringNewAddress] = useState<boolean>(false);
  const [newAddressLine, setNewAddressLine] = useState<string>('');
  const [newLandmark, setNewLandmark] = useState<string>('');
  const [newPincode, setNewPincode] = useState<string>('560103');
  const [pickupDate, setPickupDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedSlotName, setSelectedSlotName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>(currentUser?.phone || '');
  const [customerName, setCustomerName] = useState<string>(currentUser?.full_name || 'Customer');
  
  const [isBookingSubmitting, setIsBookingSubmitting] = useState<boolean>(false);
  const [bookingSuccessOrder, setBookingSuccessOrder] = useState<Order | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Modals
  const [selectedPaymentOrder, setSelectedPaymentOrder] = useState<Order | null>(null);
  const [selectedFeedbackOrder, setSelectedFeedbackOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [s, sl, ords] = await Promise.all([
        LaundryService.getSettings(),
        LaundryService.getPickupSlots(),
        currentUser ? LaundryService.getCustomerOrders(currentUser.id, currentUser.phone) : []
      ]);
      setSettings(s);
      setSlots(sl.filter((x) => x.is_active));
      if (sl.length > 0) {
        setSelectedSlotName(sl[0].name);
      }
      setOrders(ords);

      if (currentUser) {
        const [addrs, userFeedbacks] = await Promise.all([
          LaundryService.getCustomerAddresses(currentUser.id),
          LaundryService.getFeedbackForCustomer(currentUser.id)
        ]);
        setAddresses(addrs);
        if (addrs.length > 0) {
          const def = addrs.find((a) => a.is_default) || addrs[0];
          setSelectedAddressId(def.id);
        } else {
          setIsEnteringNewAddress(true);
        }

        const map: Record<string, OrderFeedback> = {};
        userFeedbacks.forEach(f => { map[f.order_id] = f; });
        setFeedbackMap(map);
      }
    } catch (err) {
      console.error('Error loading customer data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError(null);

    let addressLine = '';
    let landmark = '';
    let pincode = '';

    if (isEnteringNewAddress || addresses.length === 0) {
      if (!newAddressLine.trim()) {
        setBookingError('Please enter your complete pickup address');
        return;
      }
      addressLine = newAddressLine.trim();
      landmark = newLandmark.trim();
      pincode = newPincode.trim() || '560001';

      if (currentUser) {
        try {
          const savedAddr = await LaundryService.saveCustomerAddress({
            user_id: currentUser.id,
            label: 'Home',
            address_line: addressLine,
            landmark,
            pincode,
            is_default: addresses.length === 0
          });
          setAddresses((prev) => [...prev, savedAddr]);
          setSelectedAddressId(savedAddr.id);
          setIsEnteringNewAddress(false);
        } catch (e) {
          console.warn('Could not save address to library:', e);
        }
      }
    } else {
      const chosen = addresses.find((a) => a.id === selectedAddressId);
      if (!chosen) {
        setBookingError('Please select a pickup address');
        return;
      }
      addressLine = chosen.address_line;
      landmark = chosen.landmark || '';
      pincode = chosen.pincode;
    }

    if (!selectedSlotName) {
      setBookingError('Please choose an available pickup time slot');
      return;
    }

    setIsBookingSubmitting(true);

    try {
      const order = await LaundryService.createOrder({
        customer_id: currentUser?.id,
        customer_name: customerName,
        customer_phone: customerPhone || currentUser?.phone || '9876543212',
        pickup_address: addressLine,
        pickup_landmark: landmark,
        pickup_pincode: pincode,
        pickup_date: pickupDate,
        pickup_slot: selectedSlotName,
      });

      setBookingSuccessOrder(order);
      setOrders((prev) => [order, ...prev]);
      setActiveTab('current');
    } catch (err: any) {
      setBookingError(err.message || 'Failed to create booking. Please try again.');
    } finally {
      setIsBookingSubmitting(false);
    }
  };

  const currentActiveOrder = orders.find((o) => o.order_status !== 'delivered' && o.order_status !== 'cancelled') || orders[0];
  const pricePerKg = settings ? (settings.price_per_kg_paise / 100).toFixed(0) : '80';
  const minWeight = settings ? settings.min_weight_kg.toFixed(0) : '3';
  const minBill = settings ? ((settings.price_per_kg_paise * settings.min_weight_kg) / 100).toFixed(0) : '240';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24">
      {/* Top Customer Brand Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-black text-slate-900 text-lg leading-tight">SuperWash Express</h1>
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                Customer Laundry Hub • Bengaluru
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <span className="block text-xs font-bold text-slate-800 leading-tight">
                {currentUser?.full_name || 'Customer'}
              </span>
              <span className="block text-[11px] text-slate-500 font-mono">{currentUser?.phone || 'Guest'}</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 border border-brand-200 flex items-center justify-center font-bold text-xs shadow-sm">
              {currentUser?.full_name?.charAt(0) || <User className="w-4 h-4" />}
            </div>
          </div>
        </div>
      </div>

      {/* Responsive Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-[65px] z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2 overflow-x-auto flex gap-2 scrollbar-none">
          <button
            onClick={() => setActiveTab('book')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'book'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" /> Book Pickup
          </button>

          <button
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'current'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" /> Track Order
            {currentActiveOrder && currentActiveOrder.order_status !== 'delivered' && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'history'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Order History ({orders.length})
          </button>

          <button
            onClick={() => setActiveTab('addresses')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'addresses'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            My Addresses
          </button>

          <button
            onClick={() => setActiveTab('contact')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'contact'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Contact & Shop
          </button>
        </div>
      </div>

      {/* Main Responsive Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
        {/* ================= 1. BOOK A PICKUP TAB ================= */}
        {activeTab === 'book' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Form (7 cols on desktop) */}
            <div className="lg:col-span-7 space-y-4">
              {bookingSuccessOrder && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 space-y-2 animate-fade-in">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>Pickup Booked Successfully!</span>
                  </div>
                  <p className="text-xs">
                    Your order <span className="font-mono font-bold">#{bookingSuccessOrder.order_number}</span> has been confirmed. Our delivery agent will arrive during your selected slot.
                  </p>
                  <button
                    onClick={() => setActiveTab('current')}
                    className="text-xs font-bold text-emerald-700 underline flex items-center gap-1"
                  >
                    Track Live Progress <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {bookingError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{bookingError}</span>
                </div>
              )}

              <form onSubmit={handleCreateBooking} className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-sm">
                <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-brand-600" /> Schedule Home Pickup
                </h2>

                {/* 1. Address Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-brand-600" /> Pickup Address
                    </label>
                    {addresses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsEnteringNewAddress(!isEnteringNewAddress)}
                        className="text-xs font-bold text-brand-600 hover:underline"
                      >
                        {isEnteringNewAddress ? 'Choose Saved Address' : '+ New Address'}
                      </button>
                    )}
                  </div>

                  {!isEnteringNewAddress && addresses.length > 0 ? (
                    <div className="space-y-2">
                      {addresses.map((addr) => (
                        <label
                          key={addr.id}
                          className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                            selectedAddressId === addr.id
                              ? 'border-brand-600 bg-brand-50 text-slate-900 ring-2 ring-brand-500/20'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name="selectedAddress"
                            value={addr.id}
                            checked={selectedAddressId === addr.id}
                            onChange={() => setSelectedAddressId(addr.id)}
                            className="mt-1 text-brand-600 focus:ring-brand-500"
                          />
                          <div className="text-xs">
                            <span className="font-bold text-slate-900 block">{addr.label}</span>
                            <span className="text-slate-600 block mt-0.5">{addr.address_line}</span>
                            {addr.landmark && (
                              <span className="text-slate-500 text-[11px] block">Landmark: {addr.landmark}</span>
                            )}
                            <span className="text-[11px] font-mono text-slate-400">PIN: {addr.pincode}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      <input
                        type="text"
                        placeholder="House / Flat No., Apartment, Street name"
                        value={newAddressLine}
                        onChange={(e) => setNewAddressLine(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-medium"
                        required
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Landmark (e.g. Near Metro)"
                          value={newLandmark}
                          onChange={(e) => setNewLandmark(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                        />
                        <input
                          type="text"
                          placeholder="PIN Code (e.g. 560103)"
                          value={newPincode}
                          onChange={(e) => setNewPincode(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Date Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-brand-600" /> Pickup Date
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((offset) => {
                      const d = new Date();
                      d.setDate(d.getDate() + offset);
                      const isoDate = d.toISOString().split('T')[0];
                      const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
                      const isSelected = pickupDate === isoDate;
                      return (
                        <button
                          type="button"
                          key={isoDate}
                          onClick={() => setPickupDate(isoDate)}
                          className={`py-2.5 px-2 rounded-xl border text-center transition ${
                            isSelected
                              ? 'border-brand-600 bg-brand-50 text-brand-700 font-bold ring-2 ring-brand-500/20'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50 font-medium'
                          }`}
                        >
                          <span className="block text-xs">{label}</span>
                          <span className="block text-[10px] text-slate-500">{isoDate.split('-').reverse().slice(0, 2).join('/')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Slot Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-brand-600" /> Time Slot
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {slots.map((s) => (
                      <label
                        key={s.id}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition text-xs ${
                          selectedSlotName === s.name
                            ? 'border-brand-600 bg-brand-50 text-brand-900 font-bold ring-2 ring-brand-500/20'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="timeSlot"
                            value={s.name}
                            checked={selectedSlotName === s.name}
                            onChange={() => setSelectedSlotName(s.name)}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          <span>{s.name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 4. Contact Confirmation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Your Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Mobile Number</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono"
                      required
                    />
                  </div>
                </div>

                {/* Submit button on mobile */}
                <div className="block lg:hidden pt-2">
                  <button
                    type="submit"
                    disabled={isBookingSubmitting}
                    className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Confirm Pickup Booking</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Pricing & Confirmation Summary (5 cols on desktop) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Pricing Card */}
              <div className="bg-gradient-to-br from-brand-600 to-cyan-600 rounded-3xl p-6 text-white shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider bg-white/20 px-2.5 py-1 rounded-full">
                    Transparent Rate
                  </span>
                  <span className="text-xs font-semibold text-cyan-100">
                    ⚡ Free Pickup & Delivery
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black">₹{pricePerKg}</span>
                    <span className="text-base font-semibold text-brand-100">/ kilogram</span>
                  </div>
                  <p className="text-xs text-brand-100 mt-1">
                    Normal clothes washing • Min. weight {minWeight} kg (₹{minBill}).
                  </p>
                </div>

                <div className="p-3.5 bg-white/10 rounded-2xl text-xs space-y-1.5 text-brand-50">
                  <span className="font-bold block text-white">How it works:</span>
                  <p className="text-[11px] leading-relaxed">
                    1. We collect your laundry bag at your doorstep. <br />
                    2. Certified scale weights clothes at our shop. <br />
                    3. Final bill generated: <code className="bg-black/20 px-1 rounded">Weight × ₹{pricePerKg}</code>. <br />
                    4. Delivered clean & crisp. Pay via Cash or UPI.
                  </p>
                </div>

                <div className="hidden lg:block pt-2">
                  <button
                    onClick={handleCreateBooking}
                    disabled={isBookingSubmitting}
                    className="w-full py-3.5 bg-white hover:bg-slate-100 active:scale-[0.99] text-brand-700 font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Confirm Pickup Booking</span>
                  </button>
                </div>
              </div>

              {/* Guarantees Box */}
              <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3 text-xs shadow-sm">
                <span className="font-bold text-slate-800 block text-xs uppercase tracking-wider">
                  The SuperWash Promise
                </span>
                <div className="space-y-2 text-slate-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Skin-friendly, eco-certified detergents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Hygienic separate batch washing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Pay only after clothes are weighed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= 2. TRACK ORDER / CURRENT ORDER ================= */}
        {activeTab === 'current' && (
          <div className="space-y-6">
            {currentActiveOrder ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-sm">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Live Order Tracking
                    </span>
                    <h2 className="font-black text-2xl text-slate-900 leading-tight">
                      Order #{currentActiveOrder.order_number}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pickup Scheduled: {currentActiveOrder.pickup_date} • {currentActiveOrder.pickup_slot}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={currentActiveOrder.order_status} size="lg" />
                  </div>
                </div>

                {/* Progress Timeline */}
                <div className="py-2">
                  <span className="text-xs font-bold text-slate-700 block mb-4">Workflow Progression</span>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { key: 'booked', label: 'Booked' },
                      { key: 'collected', label: 'Collected' },
                      { key: 'washing', label: 'Washing' },
                      { key: 'delivered', label: 'Delivered' },
                    ].map((step, idx) => {
                      const stages = ['booked', 'pickup_assigned', 'collected', 'washing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];
                      const currentIdx = stages.indexOf(currentActiveOrder.order_status);
                      const stepIdx = stages.indexOf(step.key);
                      const isComplete = currentIdx >= stepIdx;
                      return (
                        <div key={step.key} className="flex flex-col items-center">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mb-1.5 transition ${
                              isComplete
                                ? 'bg-brand-600 text-white shadow-md'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <span
                            className={`text-xs font-semibold ${
                              isComplete ? 'text-brand-700 font-bold' : 'text-slate-400'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Post-Delivery Feedback Invitation Banner */}
                {currentActiveOrder.order_status === 'delivered' && (
                  <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                        <h4 className="font-bold text-slate-900 text-sm">
                          {feedbackMap[currentActiveOrder.id]
                            ? `You rated this order ${feedbackMap[currentActiveOrder.id].rating_overall} / 5 Stars`
                            : 'How did we do? Share your private feedback'}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-600">
                        {feedbackMap[currentActiveOrder.id]
                          ? 'Thank you! Your feedback helps our team maintain high washing and delivery standards.'
                          : 'Your feedback goes directly to store management and is strictly confidential.'}
                      </p>
                    </div>

                    <button
                      onClick={() => setSelectedFeedbackOrder(currentActiveOrder)}
                      className="py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition flex items-center gap-1.5 shrink-0"
                    >
                      <MessageSquareHeart className="w-4 h-4" />
                      <span>{feedbackMap[currentActiveOrder.id] ? 'Edit My Feedback' : 'Rate Service'}</span>
                    </button>
                  </div>
                )}

                {/* Grid of Details on Desktop */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  {/* Financial & Weight Card */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
                    <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">
                      Weight & Billing Status
                    </span>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Measured Weight:</span>
                      <span className="font-bold text-slate-900 text-sm">
                        {currentActiveOrder.measured_weight !== null && currentActiveOrder.measured_weight !== undefined
                          ? `${currentActiveOrder.measured_weight.toFixed(2)} kg`
                          : 'Pending Weight (Weighed upon intake)'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-600">
                      <span>Rate Applied:</span>
                      <span className="font-semibold text-slate-700">
                        ₹{(currentActiveOrder.price_per_kg_paise / 100).toFixed(0)} / kg (Min. {currentActiveOrder.min_weight_kg}kg)
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="font-bold text-slate-900 text-sm">Total Amount:</span>
                      <span className="font-black text-brand-600 text-lg">
                        {currentActiveOrder.total_amount_paise !== null && currentActiveOrder.total_amount_paise !== undefined
                          ? `₹${(currentActiveOrder.total_amount_paise / 100).toFixed(2)}`
                          : 'Calculating upon weighing'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-1">
                      <span className="text-slate-500">Payment Status:</span>
                      <PaymentBadge status={currentActiveOrder.payment_status} />
                    </div>

                    {currentActiveOrder.total_amount_paise && currentActiveOrder.payment_status !== 'paid' && (
                      <button
                        onClick={() => setSelectedPaymentOrder(currentActiveOrder)}
                        className="w-full mt-2 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Pay via UPI / QR Code (₹{((currentActiveOrder.total_amount_paise - currentActiveOrder.paid_amount_paise) / 100).toFixed(2)} due)</span>
                      </button>
                    )}
                  </div>

                  {/* Pickup & Courier Info Card */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                    <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">
                      Pickup & Delivery Logistics
                    </span>

                    <div className="text-slate-700 space-y-1">
                      <span className="font-bold block text-slate-900">Address:</span>
                      <p>{currentActiveOrder.pickup_address}</p>
                      {currentActiveOrder.pickup_landmark && (
                        <p className="text-slate-500">Landmark: {currentActiveOrder.pickup_landmark}</p>
                      )}
                      <p className="text-slate-400 font-mono">PIN: {currentActiveOrder.pickup_pincode}</p>
                    </div>

                    {currentActiveOrder.assigned_delivery_name ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                            Assigned Delivery Executive
                          </span>
                          <span className="font-bold text-emerald-900 text-sm block">
                            {currentActiveOrder.assigned_delivery_name}
                          </span>
                          <span className="text-emerald-700 text-[11px]">
                            📞 {currentActiveOrder.assigned_delivery_phone}
                          </span>
                        </div>
                        {currentActiveOrder.assigned_delivery_phone && (
                          <a
                            href={`tel:${currentActiveOrder.assigned_delivery_phone}`}
                            className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-sm"
                          >
                            <Phone className="w-3.5 h-3.5" /> Call
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-100 rounded-xl text-slate-500 text-center">
                        Delivery agent will be assigned shortly before your slot.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3 shadow-sm">
                <Clock className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">No Active Orders</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  You don't have any ongoing laundry orders right now. Book a pickup to get started!
                </p>
                <button
                  onClick={() => setActiveTab('book')}
                  className="py-2.5 px-5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                  Book a Pickup
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= 3. ORDER HISTORY TAB ================= */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-black text-slate-900 text-base">Past Orders ({orders.length})</h2>
              <button
                onClick={loadData}
                className="text-xs text-brand-600 font-bold hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-xs text-slate-500">
                No orders found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orders.map((ord) => {
                  const fb = feedbackMap[ord.id];
                  return (
                    <div
                      key={ord.id}
                      className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3 shadow-sm text-xs flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-black text-slate-900 text-sm block">#{ord.order_number}</span>
                            <span className="text-[11px] text-slate-500">{ord.pickup_date} • {ord.pickup_slot}</span>
                          </div>
                          <StatusBadge status={ord.order_status} size="sm" />
                        </div>

                        <div className="flex justify-between text-slate-600 pt-1">
                          <span>Measured Weight:</span>
                          <span className="font-semibold text-slate-800">
                            {ord.measured_weight ? `${ord.measured_weight.toFixed(2)} kg` : 'Pending Weight'}
                          </span>
                        </div>

                        <div className="flex justify-between text-slate-600">
                          <span>Total Amount:</span>
                          <span className="font-black text-brand-700 text-sm">
                            {ord.total_amount_paise ? `₹${(ord.total_amount_paise / 100).toFixed(2)}` : 'Pending'}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <PaymentBadge status={ord.payment_status} />

                        <div className="flex items-center gap-2">
                          {ord.order_status === 'delivered' && (
                            <button
                              onClick={() => setSelectedFeedbackOrder(ord)}
                              className="text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1"
                            >
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                              <span>{fb ? `${fb.rating_overall}★ Rated` : 'Rate Service'}</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setBookingSuccessOrder(ord);
                              setActiveTab('current');
                            }}
                            className="text-brand-600 font-bold hover:underline text-[11px]"
                          >
                            Details →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= 4. MY ADDRESSES TAB ================= */}
        {activeTab === 'addresses' && (
          <div className="space-y-4 max-w-2xl">
            <h2 className="font-black text-slate-900 text-base">Saved Delivery Addresses</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {addresses.map((addr) => (
                <div
                  key={addr.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1 text-xs shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{addr.label}</span>
                    {addr.is_default && (
                      <span className="text-[10px] bg-brand-50 text-brand-700 font-bold px-2 py-0.5 rounded-full border border-brand-200">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600">{addr.address_line}</p>
                  {addr.landmark && (
                    <p className="text-slate-500 text-[11px]">Landmark: {addr.landmark}</p>
                  )}
                  <p className="text-slate-400 font-mono text-[11px]">PIN: {addr.pincode}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setIsEnteringNewAddress(true);
                setActiveTab('book');
              }}
              className="py-3 px-5 bg-white border border-brand-300 text-brand-700 hover:bg-brand-50 rounded-2xl font-bold text-xs transition flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add New Address
            </button>
          </div>
        )}

        {/* ================= 5. CONTACT US TAB ================= */}
        {activeTab === 'contact' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-4 shadow-sm text-xs max-w-xl">
            <h2 className="font-black text-slate-900 text-lg">Contact SuperWash Express</h2>
            <p className="text-slate-600">
              Need urgent laundry pickup or have a special garment care request? Reach out directly to our shop!
            </p>

            <div className="space-y-3 pt-2">
              <a
                href={`tel:${settings?.business_phone || '+919876543210'}`}
                className="flex items-center gap-3 p-3.5 bg-brand-50 text-brand-800 rounded-2xl font-bold hover:bg-brand-100 transition"
              >
                <Phone className="w-5 h-5 text-brand-600" />
                <span>Call Store: {settings?.business_phone || '+91 98765 43210'}</span>
              </a>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 space-y-1">
                <span className="font-bold text-slate-900 block text-xs">Facility & Drop-off Shop:</span>
                <p>{settings?.business_address || 'Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038'}</p>
                <span className="text-slate-500 block text-[11px] pt-1">Open 7 days a week: 8:00 AM – 9:00 PM</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Customer Payment Modal */}
      {selectedPaymentOrder && (
        <PaymentModal
          order={selectedPaymentOrder}
          isOpen={!!selectedPaymentOrder}
          onClose={() => setSelectedPaymentOrder(null)}
          onPaymentSuccess={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setSelectedPaymentOrder(null);
          }}
          isStaff={false}
        />
      )}

      {/* Customer Feedback Modal */}
      {selectedFeedbackOrder && (
        <FeedbackModal
          order={selectedFeedbackOrder}
          isOpen={!!selectedFeedbackOrder}
          onClose={() => setSelectedFeedbackOrder(null)}
          onSuccess={(fb) => {
            setFeedbackMap((prev) => ({ ...prev, [fb.order_id]: fb }));
            setSelectedFeedbackOrder(null);
          }}
        />
      )}
    </div>
  );
};
