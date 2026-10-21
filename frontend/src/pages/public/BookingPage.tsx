import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  Sparkles, CheckCircle2, ChevronRight, ChevronLeft, MapPin, Truck,
  Plus, Minus, Clock, ShieldCheck, Tag, CreditCard, Banknote, AlertCircle, Loader2, ArrowRight
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Service, ServicePrice, DeliveryTimeSlot, ServiceableArea, Order } from '../../types';

export const BookingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Queries
  const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => (await apiClient.getServices()).data,
  });

  const { data: slots } = useQuery<DeliveryTimeSlot[]>({
    queryKey: ['slots'],
    queryFn: async () => (await apiClient.getSlots()).data,
  });

  const { data: areas } = useQuery<ServiceableArea[]>({
    queryKey: ['areas'],
    queryFn: async () => (await apiClient.getAreas()).data,
  });

  // Current Step (1 to 6)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<{ [priceId: string]: { price: ServicePrice; quantity: number; special_instruction?: string } }>({});

  const [handoverMethod, setHandoverMethod] = useState<'shop_dropoff' | 'home_pickup_delivery'>('shop_dropoff');
  const [customerName, setCustomerName] = useState(user?.full_name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');

  // Address & Slots
  const [pickupAddress, setPickupAddress] = useState('');
  const [pincode, setPincode] = useState('560038');
  const [pickupSlotId, setPickupSlotId] = useState('');
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDeliveryDate] = useState(
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [generalInstructions, setGeneralInstructions] = useState('');

  // Promo code
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount_paise: number; message: string } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Payment choice
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Select initial service once loaded
  useEffect(() => {
    if (services && services.length > 0 && !selectedServiceId) {
      setSelectedServiceId(services[0].id);
    }
  }, [services]);

  // Set default slot once loaded
  useEffect(() => {
    if (slots && slots.length > 0 && !pickupSlotId) {
      setPickupSlotId(slots[0].id);
    }
  }, [slots]);

  // Set user address if available
  useEffect(() => {
    if (user && user.addresses && user.addresses.length > 0) {
      const def = user.addresses.find(a => a.is_default) || user.addresses[0];
      setPickupAddress(def.address_line1);
      setPincode(def.pincode);
    }
  }, [user]);

  const activeService = services?.find(s => s.id === selectedServiceId) || services?.[0];

  // Helper to add or decrease item count
  const handleQuantityChange = (price: ServicePrice, delta: number) => {
    setSelectedItems(prev => {
      const current = prev[price.id]?.quantity || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[price.id];
        return copy;
      }
      return {
        ...prev,
        [price.id]: {
          price,
          quantity: next,
          special_instruction: prev[price.id]?.special_instruction || ''
        }
      };
    });
  };

  const handleInstructionChange = (priceId: string, instruction: string) => {
    setSelectedItems(prev => {
      if (!prev[priceId]) return prev;
      return {
        ...prev,
        [priceId]: {
          ...prev[priceId],
          special_instruction: instruction
        }
      };
    });
  };

  // Calculations
  const subtotalPaise = Object.values(selectedItems).reduce(
    (acc, curr) => acc + (curr.price.price_paise * curr.quantity),
    0
  );

  const deliveryFeePaise = handoverMethod === 'shop_dropoff' ? 0 : (subtotalPaise >= 50000 ? 0 : 4000);
  const discountPaise = appliedCoupon ? appliedCoupon.discount_paise : 0;
  const taxableValue = Math.max(0, subtotalPaise - discountPaise + deliveryFeePaise);
  const taxPaise = Math.round(taxableValue * 0.18);
  const estimatedTotalPaise = taxableValue + taxPaise;

  // Coupon apply
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError(null);
    try {
      const res = await apiClient.validateCoupon(couponCode, subtotalPaise);
      if (res.data.valid) {
        setAppliedCoupon(res.data);
      } else {
        setCouponError(res.data.message);
        setAppliedCoupon(null);
      }
    } catch {
      setCouponError('Failed to validate promo code.');
    }
  };

  // Validate step progression
  const canProceedStep = () => {
    if (currentStep === 1) return selectedServiceId !== '';
    if (currentStep === 2) return Object.keys(selectedItems).length > 0;
    if (currentStep === 3) {
      if (!customerName.trim() || !customerPhone.trim()) return false;
      if (handoverMethod === 'home_pickup_delivery') {
        if (!pickupAddress.trim() || !pincode.trim() || !pickupSlotId) return false;
      }
      return true;
    }
    return true;
  };

  // Submit order
  const handlePlaceOrder = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const itemsPayload = Object.values(selectedItems).map(item => ({
      service_price_id: item.price.id,
      quantity: item.quantity,
      special_instruction: item.special_instruction || undefined
    }));

    try {
      const { data: newOrder } = await apiClient.bookOrder({
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || undefined,
        handover_method: handoverMethod,
        pickup_address: handoverMethod === 'home_pickup_delivery' ? pickupAddress : undefined,
        delivery_address: handoverMethod === 'home_pickup_delivery' ? pickupAddress : undefined,
        pincode: handoverMethod === 'home_pickup_delivery' ? pincode : undefined,
        pickup_slot_id: handoverMethod === 'home_pickup_delivery' ? pickupSlotId : undefined,
        delivery_slot_id: handoverMethod === 'home_pickup_delivery' ? pickupSlotId : undefined,
        pickup_date: handoverMethod === 'home_pickup_delivery' ? pickupDate : undefined,
        delivery_date: handoverMethod === 'home_pickup_delivery' ? deliveryDate : undefined,
        special_instructions: generalInstructions || undefined,
        coupon_code: appliedCoupon?.code || undefined,
        payment_method: paymentMethod,
        items: itemsPayload
      });

      setCreatedOrder(newOrder);

      // If customer chose online Razorpay payment
      if (paymentMethod === 'razorpay') {
        try {
          const { data: rpData } = await apiClient.createRazorpayOrder(newOrder.id);
          // Simulate online payment verification in test mode
          const mockPaymentId = `pay_rzp_${Date.now()}`;
          const mockSig = `sandbox_sig_${Date.now()}`;
          await apiClient.verifyRazorpay({
            order_id: newOrder.id,
            razorpay_order_id: rpData.razorpay_order_id,
            razorpay_payment_id: mockPaymentId,
            razorpay_signature: mockSig
          });
        } catch (payErr) {
          console.warn('Payment verification will be settled upon delivery/collection:', payErr);
        }
      }

      setCurrentStep(6);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to place booking. Please check details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (servicesLoading) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Stepper Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center">
              {currentStep}
            </span>
            <span className="font-bold text-sm text-slate-900">
              {currentStep === 1 && 'Step 1: Choose Primary Service'}
              {currentStep === 2 && 'Step 2: Select Garments & Instructions'}
              {currentStep === 3 && 'Step 3: Handover & Address'}
              {currentStep === 4 && 'Step 4: Review Bill & Promo'}
              {currentStep === 5 && 'Step 5: Choose Payment Option'}
              {currentStep === 6 && 'Step 6: Booking Confirmed!'}
            </span>
          </div>

          <div className="text-xs text-slate-400 font-medium">Step {currentStep} of 6</div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
          <div
            className="bg-brand-600 h-full transition-all duration-300 rounded-full"
            style={{ width: `${(currentStep / 6) * 100}%` }}
          />
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: Select Service */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="text-center sm:text-left">
            <h2 className="text-2xl font-black text-slate-900">Select Laundry Service</h2>
            <p className="text-xs text-slate-500 mt-1">Pick a care category to customize your garment items.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {services?.map(service => {
              const isSelected = service.id === selectedServiceId;
              return (
                <div
                  key={service.id}
                  onClick={() => setSelectedServiceId(service.id)}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition text-left flex flex-col justify-between ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50/50 shadow-md ring-2 ring-brand-100'
                      : 'border-slate-200 bg-white hover:border-brand-200'
                  }`}
                >
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold mb-3">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm">{service.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{service.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-brand-700">
                    <span>{service.prices.length} garment items</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setCurrentStep(2)}
              disabled={!canProceedStep()}
              className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition disabled:opacity-50"
            >
              Continue to Garment Items <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Select Garments & Quantities */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="text-2xl font-black text-slate-900">Add Garments & Instructions</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Service: <strong className="text-brand-700">{activeService?.name}</strong>. Add quantities and fabric care notes.
              </p>
            </div>

            {/* Switching service dropdown if needed */}
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
            >
              {services?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Items selection cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeService?.prices?.map(price => {
              const currentQty = selectedItems[price.id]?.quantity || 0;
              const instruction = selectedItems[price.id]?.special_instruction || '';

              return (
                <div
                  key={price.id}
                  className={`p-4 rounded-2xl border transition ${
                    currentQty > 0 ? 'border-brand-500 bg-brand-50/30' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{price.item_name}</h4>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                        ₹{(price.price_paise / 100).toFixed(0)} / {price.pricing_type.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Quantity counter */}
                    <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(price, -1)}
                        disabled={currentQty === 0}
                        className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold font-mono text-slate-900">
                        {currentQty}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(price, 1)}
                        className="p-1 text-brand-600 hover:text-brand-800 rounded-lg hover:bg-brand-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {currentQty > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60">
                      <input
                        type="text"
                        placeholder="Special care (e.g. cuff stain treatment, delicate)"
                        value={instruction}
                        onChange={(e) => handleInstructionChange(price.id, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Running Subtotal Bar */}
          <div className="p-4 rounded-xl bg-slate-900 text-white flex justify-between items-center text-xs">
            <div>
              <span className="text-slate-400">Selected Items:</span>
              <strong className="ml-2 font-mono text-sm">
                {Object.values(selectedItems).reduce((sum, i) => sum + i.quantity, 0)} garments
              </strong>
            </div>
            <div>
              <span className="text-slate-400">Subtotal:</span>
              <strong className="ml-2 text-base font-black font-mono text-brand-400">
                ₹{(subtotalPaise / 100).toFixed(2)}
              </strong>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Services
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              disabled={!canProceedStep()}
              className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition disabled:opacity-50"
            >
              Continue to Handover <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Handover Method & Address */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Choose Handover Method</h2>
            <p className="text-xs text-slate-500 mt-1">Shop drop-off or doorstep pickup & delivery.</p>
          </div>

          {/* Handover Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => setHandoverMethod('shop_dropoff')}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition text-left ${
                handoverMethod === 'shop_dropoff'
                  ? 'border-brand-600 bg-brand-50/50 shadow-md ring-2 ring-brand-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2 font-bold text-slate-900 text-sm">
                <MapPin className="w-5 h-5 text-blue-600" /> Option A: Shop Drop-Off
              </div>
              <p className="text-xs text-slate-600">
                Bring clothes to our Indiranagar counter. Receive immediate physical receipt and tag.
              </p>
              <div className="mt-3 text-[11px] text-emerald-700 font-semibold">
                ✓ No minimum amount & zero delivery fee
              </div>
            </div>

            <div
              onClick={() => setHandoverMethod('home_pickup_delivery')}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition text-left ${
                handoverMethod === 'home_pickup_delivery'
                  ? 'border-brand-600 bg-brand-50/50 shadow-md ring-2 ring-brand-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2 font-bold text-slate-900 text-sm">
                <Truck className="w-5 h-5 text-brand-600" /> Option B: Home Pickup & Delivery
              </div>
              <p className="text-xs text-slate-600">
                Our driver collects and delivers clothes directly at your apartment or doorstep.
              </p>
              <div className="mt-3 text-[11px] text-brand-700 font-semibold">
                ✓ Free delivery on orders over ₹500
              </div>
            </div>
          </div>

          {/* Customer Details Form */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
              Customer Contact Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number (10-digit) *</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="e.g. rahul@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          {/* Specific fields for Home Pickup */}
          {handoverMethod === 'home_pickup_delivery' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2 flex items-center gap-2">
                <Truck className="w-4 h-4 text-brand-600" /> Logistics & Schedule
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Pickup & Delivery Address *</label>
                  <textarea
                    rows={2}
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="Flat/House number, Apartment/Building, Street, Landmark"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bengaluru PIN Code *</label>
                  <select
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-bold focus:ring-2 focus:ring-brand-500"
                  >
                    {areas?.map(area => (
                      <option key={area.id} value={area.pincode}>
                        {area.pincode} - {area.area_name} (₹{area.delivery_fee_paise / 100} fee)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pickup Time Window *</label>
                  <select
                    value={pickupSlotId}
                    onChange={(e) => setPickupSlotId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                  >
                    {slots?.map(slot => (
                      <option key={slot.id} value={slot.id}>{slot.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pickup Date *</label>
                  <input
                    type="date"
                    value={pickupDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Requested Delivery Date *</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    min={pickupDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Shop Location Details if Drop-Off */}
          {handoverMethod === 'shop_dropoff' && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-700" /> Store Counter Address:
              </div>
              <p>Shop #14, Metro Pillar 78, Indiranagar 100ft Road, Bengaluru, Karnataka 560038.</p>
              <p className="text-[11px] text-blue-700">Open 7 days a week from 8:00 AM to 9:00 PM.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              General Order Instructions (Optional)
            </label>
            <input
              type="text"
              value={generalInstructions}
              onChange={(e) => setGeneralInstructions(e.target.value)}
              placeholder="e.g., Ring doorbell, separate delicate white shirts"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Garments
            </button>
            <button
              onClick={() => setCurrentStep(4)}
              disabled={!canProceedStep()}
              className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition disabled:opacity-50"
            >
              Review Bill & Offers <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Review Bill & Promo Codes */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Review Your Order</h2>
            <p className="text-xs text-slate-500 mt-1">Review itemization, apply coupons, and verify estimated bill.</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            {/* Garments Table */}
            <div className="divide-y divide-slate-100 text-xs">
              <div className="pb-2 font-bold text-slate-400 uppercase tracking-wider text-[11px] flex justify-between">
                <span>Garment</span>
                <span>Subtotal</span>
              </div>
              {Object.values(selectedItems).map(({ price, quantity, special_instruction }) => (
                <div key={price.id} className="py-2.5 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-900">{price.item_name}</span>
                    <span className="ml-2 font-mono text-slate-500">× {quantity}</span>
                    {special_instruction && (
                      <p className="text-[10px] text-amber-600 italic">Care: {special_instruction}</p>
                    )}
                  </div>
                  <span className="font-mono font-semibold text-slate-900">
                    ₹{((price.price_paise * quantity) / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Promo Code Input */}
            <div className="pt-4 border-t border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-brand-600" /> Promo / Coupon Code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. WELCOME20 or SUPER50"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-xs uppercase focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
                >
                  Apply Code
                </button>
              </div>

              {appliedCoupon && (
                <p className="text-xs text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {appliedCoupon.message}
                </p>
              )}

              {couponError && (
                <p className="text-xs text-red-600 font-medium mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {couponError}
                </p>
              )}
            </div>

            {/* Financial Breakdown */}
            <div className="pt-4 border-t border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Garments Subtotal:</span>
                <span className="font-mono">₹{(subtotalPaise / 100).toFixed(2)}</span>
              </div>

              {discountPaise > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Coupon Discount:</span>
                  <span className="font-mono">-₹{(discountPaise / 100).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span>Handover & Delivery:</span>
                <span className="font-mono">
                  {deliveryFeePaise === 0 ? 'FREE' : `₹${(deliveryFeePaise / 100).toFixed(2)}`}
                </span>
              </div>

              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Applicable GST (18%):</span>
                <span className="font-mono">₹{(taxPaise / 100).toFixed(2)}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between text-base font-black text-slate-900">
                <span>Estimated Total Amount:</span>
                <span className="font-mono text-brand-700">₹{(estimatedTotalPaise / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setCurrentStep(3)}
              className="px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Handover
            </button>
            <button
              onClick={() => setCurrentStep(5)}
              className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition"
            >
              Select Payment Method <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Payment Method */}
      {currentStep === 5 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Payment Preference</h2>
            <p className="text-xs text-slate-500 mt-1">Select how you would like to settle this order.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Razorpay Online */}
            <div
              onClick={() => setPaymentMethod('razorpay')}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition text-left ${
                paymentMethod === 'razorpay'
                  ? 'border-brand-600 bg-brand-50/50 shadow-md ring-2 ring-brand-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2 font-bold text-slate-900 text-sm">
                <CreditCard className="w-5 h-5 text-brand-600" /> Pay Online (Razorpay)
              </div>
              <p className="text-xs text-slate-600">
                Instant UPI (GPay/PhonePe), Debit/Credit Cards & Net Banking via India test sandbox.
              </p>
              <span className="inline-block mt-3 px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                Test Mode Ready
              </span>
            </div>

            {/* Cash at Shop or On Delivery */}
            <div
              onClick={() => setPaymentMethod(handoverMethod === 'shop_dropoff' ? 'cash' : 'pay_on_delivery')}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition text-left ${
                paymentMethod === 'cash' || paymentMethod === 'pay_on_delivery'
                  ? 'border-brand-600 bg-brand-50/50 shadow-md ring-2 ring-brand-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2 font-bold text-slate-900 text-sm">
                <Banknote className="w-5 h-5 text-emerald-600" />
                {handoverMethod === 'shop_dropoff' ? 'Pay Cash at Shop Counter' : 'Cash on Delivery (COD)'}
              </div>
              <p className="text-xs text-slate-600">
                Pay in cash or scan the shop UPI QR code when clothes are handed over or delivered.
              </p>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setCurrentStep(4)}
              className="px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Bill
            </button>
            <button
              onClick={handlePlaceOrder}
              disabled={isSubmitting}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl flex items-center gap-2 shadow-lg transition transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing Booking...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" /> Confirm & Place Order
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: Confirmation Screen */}
      {currentStep === 6 && createdOrder && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">Order Confirmed!</span>
            <h2 className="text-3xl font-black text-slate-900 mt-1">Thank You, {createdOrder.customer_name}!</h2>
            <p className="text-xs text-slate-500 mt-1">
              Your laundry booking has been successfully recorded in our management system.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 max-w-md mx-auto space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Order Number:</span>
              <strong className="font-mono text-base text-slate-900">{createdOrder.order_number}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Handover Channel:</span>
              <span className="font-bold capitalize">{createdOrder.handover_method.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Total Amount:</span>
              <span className="font-mono font-bold text-slate-900">₹{(createdOrder.total_paise / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Payment Status:</span>
              <span className="font-bold text-emerald-700 capitalize">{createdOrder.payment_status.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="text-xs text-slate-600 max-w-lg mx-auto bg-brand-50 p-4 rounded-xl border border-brand-100">
            {createdOrder.handover_method === 'shop_dropoff' ? (
              <p>
                Please drop off your clothes at <strong>Shop #14, Indiranagar 100ft Road</strong>. Simply quote order #{createdOrder.order_number} at the counter.
              </p>
            ) : (
              <p>
                Our pickup associate will arrive during your scheduled slot at <strong>{createdOrder.pickup_address}</strong>. Keep your clothes bagged for handover.
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Link
              to={`/track?order=${createdOrder.order_number}&phone=${createdOrder.customer_phone}`}
              className="w-full sm:w-auto px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              Track Live Progress <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              to="/services"
              className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition"
            >
              Browse More Services
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
