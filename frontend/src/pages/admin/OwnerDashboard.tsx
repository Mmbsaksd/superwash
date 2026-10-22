import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Order, BusinessSettings, Profile, PickupSlot,
  Payment, OrderFeedback, FeedbackStatus, FeedbackSummaryMetrics
} from '../../types';
import { LaundryService } from '../../services/laundryService';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { AssignStaffModal } from '../../components/AssignStaffModal';
import { PaymentModal } from '../../components/PaymentModal';
import { WeightEntryModal } from '../../components/WeightEntryModal';
import {
  IndianRupee, Package, CheckCircle2,
  Users, Settings, Plus, RefreshCw,
  Search, Shield, Phone, Sparkles, Star, MessageSquareHeart,
  Calendar, Check, AlertCircle, X, MapPin, Download, TrendingUp, TrendingDown, LogOut
} from 'lucide-react';
import {
  ServiceArea, LaundryServiceItem, PeriodFilter, DashboardPeriodAnalytics
} from '../../types';

export const OwnerDashboard: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'staff' | 'payments' | 'feedback' | 'settings'>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [staffList, setStaffList] = useState<Profile[]>([]);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [feedbacks, setFeedbacks] = useState<OrderFeedback[]>([]);
  const [feedbackMetrics, setFeedbackMetrics] = useState<FeedbackSummaryMetrics | null>(null);
  const [serviceAreasList, setServiceAreasList] = useState<ServiceArea[]>([]);
  const [servicesList, setServicesList] = useState<LaundryServiceItem[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('today');
  const [periodAnalytics, setPeriodAnalytics] = useState<DashboardPeriodAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Manual Order Creation State
  const [isCreatingManualOrder, setIsCreatingManualOrder] = useState<boolean>(false);
  const [custName, setCustName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [pickupAddr, setPickupAddr] = useState<string>('');
  const [pickupPincode, setPickupPincode] = useState<string>('560038');
  const [pickupDate, setPickupDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  // Settings Form State
  const [pricePerKgInput, setPricePerKgInput] = useState<string>('80');
  const [minWeightInput, setMinWeightInput] = useState<string>('3.0');
  const [deliveryChargeInput, setDeliveryChargeInput] = useState<string>('0');
  const [upiIdInput, setUpiIdInput] = useState<string>('superwash@upi');
  const [allowDeliveryPay, setAllowDeliveryPay] = useState<boolean>(true);
  const [pincodesInput, setPincodesInput] = useState<string>('560038, 560008, 560103, 560075, 560001, 560066, 560037');
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);

  // Service Area Creation State
  const [isAddingArea, setIsAddingArea] = useState<boolean>(false);
  const [newAreaPin, setNewAreaPin] = useState<string>('');
  const [newAreaName, setNewAreaName] = useState<string>('');
  const [newAreaCity, setNewAreaCity] = useState<string>('Bengaluru');
  const [areaSearchQuery, setAreaSearchQuery] = useState<string>('');

  // Add Staff State
  const [isAddingStaff, setIsAddingStaff] = useState<boolean>(false);
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffPhone, setNewStaffPhone] = useState<string>('');
  const [newStaffRole, setNewStaffRole] = useState<'delivery' | 'manager'>('delivery');

  // Feedback Resolution Modal State
  const [reviewingFeedback, setReviewingFeedback] = useState<OrderFeedback | null>(null);
  const [resolutionNoteInput, setResolutionNoteInput] = useState<string>('');
  const [resolutionStatusInput, setResolutionStatusInput] = useState<FeedbackStatus>('reviewed');

  // Modals
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [weighingOrder, setWeighingOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadAllData();
  }, [currentUser]);

  useEffect(() => {
    loadPeriodAnalytics(selectedPeriod);
  }, [selectedPeriod, orders]);

  const loadPeriodAnalytics = async (p: PeriodFilter) => {
    try {
      const pa = await LaundryService.getPeriodAnalytics(p);
      setPeriodAnalytics(pa);
    } catch (e) {
      console.warn('Analytics loading error:', e);
    }
  };

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [allOrds, s, st, sl, p, fb, fm, sa, srv, pa] = await Promise.all([
        LaundryService.getAllOrders(),
        LaundryService.getSettings(),
        LaundryService.getStaffProfiles(),
        LaundryService.getPickupSlots(),
        LaundryService.getAllPayments(),
        LaundryService.getAllFeedback(),
        LaundryService.getFeedbackMetrics(),
        LaundryService.getServiceAreas(),
        LaundryService.getServices(),
        LaundryService.getPeriodAnalytics(selectedPeriod)
      ]);
      setOrders(allOrds);
      setSettings(s);
      setStaffList(st);
      setSlots(sl);
      setPayments(p);
      setFeedbacks(fb);
      setFeedbackMetrics(fm);
      setServiceAreasList(sa);
      setServicesList(srv);
      setPeriodAnalytics(pa);

      setPricePerKgInput((s.price_per_kg_paise / 100).toString());
      setMinWeightInput(s.min_weight_kg.toString());
      setDeliveryChargeInput((s.delivery_charge_paise / 100).toString());
      setUpiIdInput(s.upi_id || 'superwash@upi');
      setAllowDeliveryPay(s.allow_delivery_payment_recording);
      if (s.serviceable_pincodes && s.serviceable_pincodes.length > 0) {
        setPincodesInput(s.serviceable_pincodes.join(', '));
      }

      if (sl.length > 0) {
        setSelectedSlot(sl[0].name);
      }
    } catch (err) {
      console.error('Error loading owner data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleServiceArea = async (areaId: string, currentActive: boolean) => {
    try {
      const updated = await LaundryService.updateServiceArea(areaId, { is_active: !currentActive });
      if (updated) {
        setServiceAreasList((prev) => prev.map((a) => (a.id === areaId ? updated : a)));
      }
    } catch (err: any) {
      alert(err.message || 'Error updating service area');
    }
  };

  const handleAddServiceArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaPin.trim() || !newAreaName.trim()) return;

    try {
      const added = await LaundryService.addServiceArea({
        pincode: newAreaPin.trim(),
        area_name: newAreaName.trim(),
        city: newAreaCity.trim() || 'Bengaluru',
        state: 'Karnataka',
        is_active: true
      });
      setServiceAreasList((prev) => [...prev, added]);
      setIsAddingArea(false);
      setNewAreaPin('');
      setNewAreaName('');
    } catch (err: any) {
      alert(err.message || 'Error adding service area');
    }
  };

  const handleExportCSV = () => {
    if (orders.length === 0) {
      alert('No orders to export');
      return;
    }
    const headers = [
      'Order Number',
      'Customer Name',
      'Customer Phone',
      'Address',
      'PIN Code',
      'Pickup Date',
      'Slot',
      'Weight (kg)',
      'Total Amount (INR)',
      'Paid Amount (INR)',
      'Payment Status',
      'Payment Method',
      'Order Status',
      'Created At'
    ];
    const rows = orders.map((o) => [
      `"${o.order_number}"`,
      `"${o.customer_name.replace(/"/g, '""')}"`,
      `"${o.customer_phone}"`,
      `"${o.pickup_address.replace(/"/g, '""')}"`,
      `"${o.pickup_pincode}"`,
      `"${o.pickup_date}"`,
      `"${o.pickup_slot}"`,
      o.measured_weight || '',
      o.total_amount_paise ? (o.total_amount_paise / 100).toFixed(2) : '',
      (o.paid_amount_paise / 100).toFixed(2),
      `"${o.payment_status}"`,
      `"${o.payment_method}"`,
      `"${o.order_status}"`,
      `"${o.created_at}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `superwash_orders_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // KPIs
  const todayStr = new Date().toISOString().split('T')[0];
  const todaysOrders = orders.filter((o) => o.created_at?.startsWith(todayStr));
  const newPickups = orders.filter((o) => o.order_status === 'booked' || o.order_status === 'pickup_assigned');
  const washingOrders = orders.filter((o) => o.order_status === 'washing');
  const readyOrders = orders.filter((o) => o.order_status === 'ready_for_delivery' || o.order_status === 'out_for_delivery');
  const deliveredOrders = orders.filter((o) => o.order_status === 'delivered');

  const totalCollectedPaise = orders.reduce((sum, o) => sum + (o.paid_amount_paise || 0), 0);
  const totalDuePaise = orders.reduce((sum, o) => {
    if (!o.total_amount_paise) return sum;
    return sum + Math.max(0, o.total_amount_paise - (o.paid_amount_paise || 0));
  }, 0);

  // Filtered Orders
  const filteredOrders = orders.filter((o) => {
    const matchStatus = statusFilter === 'all' || o.order_status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchQuery =
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_phone.includes(q) ||
      o.pickup_address.toLowerCase().includes(q);
    return matchStatus && matchQuery;
  });

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const pins = pincodesInput.split(',').map((p) => p.trim()).filter((p) => p.length >= 6);
      const updated = await LaundryService.updateSettings({
        price_per_kg_paise: Math.round(parseFloat(pricePerKgInput) * 100),
        min_weight_kg: parseFloat(minWeightInput),
        delivery_charge_paise: Math.round(parseFloat(deliveryChargeInput) * 100),
        upi_id: upiIdInput.trim(),
        allow_delivery_payment_recording: allowDeliveryPay,
        serviceable_pincodes: pins.length > 0 ? pins : undefined
      });
      setSettings(updated);
      setSettingsSavedMsg('Settings updated successfully! New rates and coverage will apply to upcoming orders.');
      setTimeout(() => setSettingsSavedMsg(null), 3000);
    } catch (err) {
      alert('Error updating settings');
    }
  };

  const handleCreateManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const order = await LaundryService.createOrder({
        customer_name: custName.trim(),
        customer_phone: custPhone.trim(),
        pickup_address: pickupAddr.trim(),
        pickup_pincode: pickupPincode.trim(),
        pickup_date: pickupDate,
        pickup_slot: selectedSlot || 'Morning (08:00 AM - 11:00 AM)'
      });
      setOrders((prev) => [order, ...prev]);
      setIsCreatingManualOrder(false);
      setCustName('');
      setCustPhone('');
      setPickupAddr('');
      setActiveTab('orders');
    } catch (err) {
      alert('Error creating manual order');
    }
  };

  const handleToggleStaffStatus = async (staffId: string, currentActive: boolean) => {
    try {
      const updated = await LaundryService.toggleStaffStatus(staffId, !currentActive);
      if (updated) {
        setStaffList((prev) => prev.map((s) => (s.id === staffId ? updated : s)));
      }
    } catch (err) {
      alert('Error toggling staff status');
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffPhone.trim()) return;

    try {
      const added = await LaundryService.addStaffProfile({
        full_name: newStaffName.trim(),
        phone: newStaffPhone.trim(),
        role: newStaffRole
      });
      setStaffList((prev) => [...prev, added]);
      setIsAddingStaff(false);
      setNewStaffName('');
      setNewStaffPhone('');
    } catch (err) {
      alert('Error adding staff');
    }
  };

  const handleSaveFeedbackReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingFeedback) return;

    try {
      const updated = await LaundryService.updateFeedbackReview(
        reviewingFeedback.id,
        resolutionStatusInput,
        resolutionNoteInput.trim() || undefined,
        currentUser?.full_name || 'Business Owner'
      );
      if (updated) {
        setFeedbacks((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        const fm = await LaundryService.getFeedbackMetrics();
        setFeedbackMetrics(fm);
        setReviewingFeedback(null);
      }
    } catch (err) {
      alert('Error updating feedback review');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24">
      {/* Header */}
      <div className="bg-slate-900 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight">SuperWash Express • Business Owner</h1>
              <p className="text-xs text-slate-400">Operations, Settings & Quality Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreatingManualOrder(true)}
              className="py-2 px-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>+ Manual Order</span>
            </button>
            <button
              onClick={loadAllData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={logout}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-[68px] z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 overflow-x-auto flex gap-2 scrollbar-none">
          {[
            { key: 'overview', label: 'Executive Dashboard' },
            { key: 'orders', label: `Orders (${orders.length})` },
            { key: 'feedback', label: `Private Feedback (${feedbacks.length})` },
            { key: 'staff', label: `Staff Accounts (${staffList.length})` },
            { key: 'payments', label: `Payments (${payments.length})` },
            { key: 'settings', label: 'Pricing & Coverage' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                activeTab === tab.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-6">
        {/* ================= TAB 1: EXECUTIVE DASHBOARD ================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Period Selector & CSV Export */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Period:</span>
                {[
                  { key: 'today', label: 'Today' },
                  { key: 'yesterday', label: 'Yesterday' },
                  { key: 'this_week', label: 'This Week' },
                  { key: 'last_week', label: 'Last Week' },
                  { key: 'this_month', label: 'This Month' },
                  { key: 'last_month', label: 'Last Month' }
                ].map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedPeriod(p.key as PeriodFilter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      selectedPeriod === p.key
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 self-end md:self-center">
                <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                  {periodAnalytics?.startDate} to {periodAnalytics?.endDate} (IST)
                </span>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-xs transition"
                  title="Export orders as CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Orders (CSV)</span>
                </button>
              </div>
            </div>

            {/* Operational KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Orders in Period</span>
                <span className="text-3xl font-black text-slate-900 block mt-1">{periodAnalytics?.ordersBooked ?? todaysOrders.length}</span>
                <span className="text-xs text-slate-500">{orders.length} total lifetime orders</span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">In Progress</span>
                <span className="text-3xl font-black text-blue-600 block mt-1">{periodAnalytics?.ordersInProgress ?? newPickups.length}</span>
                <span className="text-xs text-slate-500">Pickups, washing & delivery</span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider block">Awaiting Weighing</span>
                <span className="text-3xl font-black text-purple-600 block mt-1">{periodAnalytics?.ordersAwaitingWeight ?? washingOrders.length}</span>
                <span className="text-xs text-slate-500">Waiting for store scale</span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Delivered</span>
                <span className="text-3xl font-black text-emerald-600 block mt-1">{periodAnalytics?.ordersDelivered ?? deliveredOrders.length}</span>
                <span className="text-xs text-slate-500">{periodAnalytics?.ordersReadyForDelivery ?? readyOrders.length} ready for dispatch</span>
              </div>
            </div>

            {/* Financial Collections & Dues Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Money Collected in Period */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    Collected in Period
                  </span>
                  <IndianRupee className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-emerald-950">
                    ₹{(((periodAnalytics?.actualCollectedPaise ?? totalCollectedPaise) / 100)).toFixed(2)}
                  </span>
                  {periodAnalytics && periodAnalytics.collectedGrowthPercent !== 0 && (
                    <span className={`text-[11px] font-bold flex items-center ${periodAnalytics.collectedGrowthPercent > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {periodAnalytics.collectedGrowthPercent > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {periodAnalytics.collectedGrowthPercent > 0 ? `+${periodAnalytics.collectedGrowthPercent}%` : `${periodAnalytics.collectedGrowthPercent}%`}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-emerald-700 pt-1 border-t border-emerald-200/60 font-medium">
                  <span>Cash: ₹{(((periodAnalytics?.cashCollectedPaise ?? 0) / 100)).toFixed(0)}</span>
                  <span>UPI: ₹{(((periodAnalytics?.upiCollectedPaise ?? 0) / 100)).toFixed(0)}</span>
                </div>
              </div>

              {/* Billed Value in Period */}
              <div className="bg-blue-50 border border-blue-200 rounded-3xl p-5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">
                    Billed Value in Period
                  </span>
                  <IndianRupee className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-blue-950">
                    ₹{(((periodAnalytics?.billedOrderValuePaise ?? 0) / 100)).toFixed(2)}
                  </span>
                  {periodAnalytics && periodAnalytics.billedGrowthPercent !== 0 && (
                    <span className={`text-[11px] font-bold flex items-center ${periodAnalytics.billedGrowthPercent > 0 ? 'text-blue-700' : 'text-slate-500'}`}>
                      {periodAnalytics.billedGrowthPercent > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {periodAnalytics.billedGrowthPercent > 0 ? `+${periodAnalytics.billedGrowthPercent}%` : `${periodAnalytics.billedGrowthPercent}%`}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-blue-700 pt-1 border-t border-blue-200/60">
                  Total confirmed order value billed
                </p>
              </div>

              {/* Outstanding Balance */}
              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                    Outstanding Balances
                  </span>
                  <IndianRupee className="w-5 h-5 text-amber-600" />
                </div>
                <span className="text-3xl font-black text-amber-950 block">
                  ₹{(((periodAnalytics?.outstandingBalancePaise ?? totalDuePaise) / 100)).toFixed(2)}
                </span>
                <p className="text-[11px] text-amber-700 pt-1 border-t border-amber-200/60">
                  {periodAnalytics?.ordersAwaitingPayment ?? 0} orders awaiting payment
                </p>
              </div>
            </div>

            {/* Quick Actions & Recent Orders Table */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-sm">
              <div className="flex justify-between items-center">
                <h3 className="font-black text-base text-slate-900">Recent Customer Activity</h3>
                <button
                  onClick={() => setActiveTab('orders')}
                  className="text-xs font-bold text-brand-600 hover:underline"
                >
                  View All Orders →
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {orders.slice(0, 5).map((o) => (
                  <div key={o.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-900 text-sm">#{o.order_number}</span>
                      <span className="text-slate-600 ml-2 font-medium">{o.customer_name} ({o.customer_phone})</span>
                      <span className="text-slate-400 block text-[11px] mt-0.5">
                        📍 {o.pickup_address} • {o.pickup_slot}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-right">
                        <span className="font-bold text-slate-900 block">
                          {o.total_amount_paise ? `₹${(o.total_amount_paise / 100).toFixed(2)}` : 'Pending Weight'}
                        </span>
                        <PaymentBadge status={o.payment_status} />
                      </div>
                      <StatusBadge status={o.order_status} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: ORDERS MANAGEMENT ================= */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Search & Status Filters */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search order #, customer name, phone, address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto w-full sm:w-auto text-xs font-semibold py-1">
                {['all', 'booked', 'pickup_assigned', 'collected', 'washing', 'ready_for_delivery', 'delivered'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl capitalize whitespace-nowrap transition ${
                      statusFilter === st
                        ? 'bg-slate-900 text-white font-bold shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders Grid */}
            {filteredOrders.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm">
                No orders match your filter criteria.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-sm text-xs flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-black text-slate-900 text-base block">#{order.order_number}</span>
                          <span className="font-bold text-slate-800">{order.customer_name}</span>
                          <span className="text-[11px] text-slate-500 block">📞 {order.customer_phone}</span>
                        </div>
                        <div className="text-right space-y-1">
                          <StatusBadge status={order.order_status} size="sm" />
                          <div><PaymentBadge status={order.payment_status} /></div>
                        </div>
                      </div>

                      <p className="text-slate-600 bg-slate-50 p-2.5 rounded-xl text-[11px] leading-relaxed">
                        📍 {order.pickup_address} ({order.pickup_pincode}) <br />
                        <span className="text-slate-400">Slot: {order.pickup_date} • {order.pickup_slot}</span>
                      </p>

                      <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 bg-slate-50/70 rounded-xl">
                        <div>
                          <span className="text-slate-400 block">Measured:</span>
                          <span className="font-bold text-slate-800">
                            {order.measured_weight ? `${order.measured_weight.toFixed(2)} kg` : 'Pending'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Total Bill:</span>
                          <span className="font-bold text-slate-800">
                            {order.total_amount_paise ? `₹${(order.total_amount_paise / 100).toFixed(2)}` : 'Pending'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Paid:</span>
                          <span className="font-bold text-emerald-700">₹{(order.paid_amount_paise / 100).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Assigned:</span>
                          <span className="font-bold text-slate-800 truncate block">
                            {order.assigned_delivery_name || 'None'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => setAssigningOrder(order)}
                        className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[11px]"
                      >
                        {order.assigned_delivery_name ? 'Reassign' : 'Assign Courier'}
                      </button>

                      <button
                        onClick={() => setWeighingOrder(order)}
                        className="py-1.5 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl font-bold text-[11px]"
                      >
                        {order.measured_weight ? 'Adjust Weight' : 'Enter Weight'}
                      </button>

                      {order.payment_status !== 'paid' && order.total_amount_paise && (
                        <button
                          onClick={() => setPaymentOrder(order)}
                          className="py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-[11px]"
                        >
                          Record Payment
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: PRIVATE FEEDBACK DASHBOARD ================= */}
        {activeTab === 'feedback' && (
          <div className="space-y-6">
            {/* Feedback Scorecards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Average Overall</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
                  <span className="text-3xl font-black text-slate-900">{feedbackMetrics?.averageOverall || 0}</span>
                  <span className="text-xs text-slate-400">/ 5.0</span>
                </div>
                <span className="text-xs text-slate-500 mt-1 block">{feedbacks.length} total private reviews</span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Pickup Rating</span>
                <span className="text-3xl font-black text-blue-600 block mt-1">
                  {feedbackMetrics?.averagePickup || 0} ★
                </span>
                <span className="text-xs text-slate-500">Punctuality & Courtesy</span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Washing Quality</span>
                <span className="text-3xl font-black text-purple-600 block mt-1">
                  {feedbackMetrics?.averageWashing || 0} ★
                </span>
                <span className="text-xs text-slate-500">Freshness, scent & folding</span>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Delivery Experience</span>
                <span className="text-3xl font-black text-emerald-600 block mt-1">
                  {feedbackMetrics?.averageDelivery || 0} ★
                </span>
                <span className="text-xs text-slate-500">Speed & Doorstep handover</span>
              </div>
            </div>

            {/* Privacy Guarantee Note */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between text-xs text-blue-900">
              <div className="flex items-center gap-2">
                <MessageSquareHeart className="w-5 h-5 text-blue-600 shrink-0" />
                <span>
                  <strong>Strictly Confidential Customer Feedback:</strong> Reviews are visible only to store owners and managers to correct operational defects (e.g., late pickups, fabric quality, stains). They are never published publicly.
                </span>
              </div>
            </div>

            {/* Feedback List */}
            {feedbacks.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm">
                No customer feedback submitted yet. Feedback invitations appear automatically after delivery.
              </div>
            ) : (
              <div className="space-y-3">
                {feedbacks.map((fb) => (
                  <div
                    key={fb.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3 shadow-sm text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-sm">Order #{fb.order_number}</span>
                          <span className="text-slate-600 font-bold">{fb.customer_name} ({fb.customer_phone})</span>
                          <span className="text-slate-400 text-[11px]">
                            {new Date(fb.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            fb.status === 'new'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : fb.status === 'reviewed'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {fb.status}
                        </span>

                        <button
                          onClick={() => {
                            setReviewingFeedback(fb);
                            setResolutionStatusInput(fb.status === 'new' ? 'reviewed' : fb.status);
                            setResolutionNoteInput(fb.resolution_note || '');
                          }}
                          className="py-1 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-[11px] transition"
                        >
                          Review & Resolve
                        </button>
                      </div>
                    </div>

                    {/* Ratings Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-700 bg-slate-50 p-3 rounded-2xl">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Overall Rating</span>
                        <div className="flex items-center gap-1 font-bold text-amber-500">
                          <Star className="w-4 h-4 fill-amber-400" />
                          <span>{fb.rating_overall} / 5</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-400 text-[10px] block">Pickup</span>
                        <span className="font-semibold">{fb.rating_pickup ? `${fb.rating_pickup}★` : '—'}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 text-[10px] block">Washing</span>
                        <span className="font-semibold">{fb.rating_washing ? `${fb.rating_washing}★` : '—'}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 text-[10px] block">Delivery</span>
                        <span className="font-semibold">{fb.rating_delivery ? `${fb.rating_delivery}★` : '—'}</span>
                      </div>
                    </div>

                    {/* Written comments */}
                    {fb.comment && (
                      <div className="p-3 bg-slate-50 rounded-xl text-slate-700">
                        <span className="font-bold text-slate-800 block text-[11px] mb-0.5">Customer Comment:</span>
                        <p className="italic leading-relaxed">"{fb.comment}"</p>
                      </div>
                    )}

                    {fb.low_rating_reason && (
                      <div className="p-3 bg-red-50 text-red-900 rounded-xl border border-red-200">
                        <span className="font-bold block text-[11px] mb-0.5">Reported Issue:</span>
                        <p className="leading-relaxed">{fb.low_rating_reason}</p>
                      </div>
                    )}

                    {fb.suggestions && (
                      <div className="p-2.5 bg-blue-50/70 text-blue-900 rounded-xl">
                        <span className="font-bold block text-[11px] mb-0.5">Improvement Suggestion:</span>
                        <p className="leading-relaxed">{fb.suggestions}</p>
                      </div>
                    )}

                    {/* Resolution Note if reviewed */}
                    {fb.resolution_note && (
                      <div className="p-3 bg-emerald-50 text-emerald-950 rounded-xl border border-emerald-200">
                        <span className="font-bold block text-[11px] mb-0.5">
                          Resolution Note (by {fb.reviewed_by || 'Staff'} on {fb.reviewed_at ? new Date(fb.reviewed_at).toLocaleDateString('en-IN') : 'recently'}):
                        </span>
                        <p>{fb.resolution_note}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: STAFF MANAGEMENT ================= */}
        {activeTab === 'staff' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-black text-slate-900 text-base">Authorized Staff Directory</h2>
              <button
                onClick={() => setIsAddingStaff(true)}
                className="py-2 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Add Staff Member
              </button>
            </div>

            {isAddingStaff && (
              <form onSubmit={handleAddStaff} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 text-xs">
                <h3 className="font-bold text-slate-900 text-sm">Add New Staff Account</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Suresh Kumar"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543219"
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Operational Role</label>
                  <select
                    value={newStaffRole}
                    onChange={(e: any) => setNewStaffRole(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300"
                  >
                    <option value="delivery">Delivery Person</option>
                    <option value="manager">Store Manager</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingStaff(false)}
                    className="py-2.5 px-4 border border-slate-200 rounded-xl text-slate-700 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-5 bg-brand-600 text-white font-bold rounded-xl shadow-sm"
                  >
                    Save Staff Account
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {staffList.map((staff) => (
                <div
                  key={staff.id}
                  className="bg-white rounded-3xl border border-slate-200 p-5 flex items-center justify-between text-xs shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm">
                      {staff.full_name.charAt(0)}
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block text-sm">{staff.full_name}</span>
                      <span className="text-slate-500 font-mono">{staff.phone}</span>
                      <span className="ml-2 uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {staff.role}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleStaffStatus(staff.id, staff.is_active)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition ${
                      staff.is_active
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-red-50 text-red-800 border border-red-200 hover:bg-red-100'
                    }`}
                  >
                    {staff.is_active ? 'Active' : 'Deactivated'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 5: PAYMENTS AUDIT ================= */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <h2 className="font-black text-slate-900 text-base">Payment Ledger & Receipts ({payments.length})</h2>
            {payments.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm">
                No payments recorded yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2 text-xs shadow-sm"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-black text-emerald-700 text-base">
                        +₹{(p.amount_paise / 100).toFixed(2)}
                      </span>
                      <span className="uppercase text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {p.payment_method === 'upi_manual' ? 'UPI' : 'Cash'}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>By: {p.recorded_by || 'Staff'}</span>
                      <span>{new Date(p.created_at).toLocaleString('en-IN')}</span>
                    </div>
                    {p.transaction_reference && (
                      <p className="text-[11px] font-mono text-slate-700 bg-slate-50 p-2 rounded-xl">
                        UTR / Ref: {p.transaction_reference}
                      </p>
                    )}
                    {p.notes && <p className="text-slate-500 text-[11px]">Note: {p.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 6: PRICING & SETTINGS ================= */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-4xl">
            <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-sm text-xs">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-black text-slate-900 text-lg">Business Pricing & Operational Settings</h2>
                <p className="text-slate-500 text-xs mt-0.5">Configure live price-per-kg, minimum weight thresholds, and serviceable PIN codes.</p>
              </div>

              {settingsSavedMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{settingsSavedMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Laundry Price per Kilogram (₹) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="1"
                      min="10"
                      value={pricePerKgInput}
                      onChange={(e) => setPricePerKgInput(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 text-sm"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Normal clothes washing rate charged per kg.</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Minimum Billable Weight (kg) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={minWeightInput}
                      onChange={(e) => setMinWeightInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 text-sm"
                      required
                    />
                    <span className="absolute right-3.5 top-3 font-bold text-slate-400 text-xs">KG</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Orders below this weight are billed for the minimum weight.
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Home Pickup & Delivery Charge (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      value={deliveryChargeInput}
                      onChange={(e) => setDeliveryChargeInput(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 text-sm"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Set to 0 for Free Pickup & Delivery.</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Business UPI ID (for QR Code) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={upiIdInput}
                    onChange={(e) => setUpiIdInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 text-sm"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Used to generate dynamic QR codes for customers.</p>
                </div>
              </div>

              {/* Serviceable PIN codes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Serviceable PIN Codes (Comma-separated)
                </label>
                <textarea
                  rows={2}
                  value={pincodesInput}
                  onChange={(e) => setPincodesInput(e.target.value)}
                  placeholder="560038, 560008, 560103, 560075, 560001"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs text-slate-900"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Used by the Landing Page coverage checker and customer booking validation.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allowDeliveryPay}
                    onChange={(e) => setAllowDeliveryPay(e.target.checked)}
                    className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4"
                  />
                  <span>Allow Delivery Staff to Record Payments at Doorstep</span>
                </label>
                <p className="text-[11px] text-slate-500 pl-6">
                  When enabled, delivery associates can collect cash or verify UPI at the doorstep and record payment.
                </p>
              </div>

              <button
                type="submit"
                className="py-3 px-8 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl text-xs shadow-md transition"
              >
                Save Configuration
              </button>
            </form>

            {/* Service Areas Management */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-5 shadow-sm text-xs">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="font-black text-slate-900 text-base">Service Areas & PIN Coverage</h2>
                  <p className="text-slate-500 text-xs mt-0.5">Manage operational zones with active coverage enforcement.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-48">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search PIN / area..."
                      value={areaSearchQuery}
                      onChange={(e) => setAreaSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingArea(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-xs transition whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Area</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 text-[11px] uppercase font-bold tracking-wider">
                      <th className="pb-3">PIN Code</th>
                      <th className="pb-3">Locality / Area</th>
                      <th className="pb-3">City</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {serviceAreasList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400">
                          No dedicated service areas configured yet. Falling back to settings PIN list.
                        </td>
                      </tr>
                    ) : (
                      serviceAreasList
                        .filter((a) => {
                          const q = areaSearchQuery.toLowerCase();
                          const aName = (a.area_name || a.name || '').toLowerCase();
                          return a.pincode.includes(q) || aName.includes(q) || a.city.toLowerCase().includes(q);
                        })
                        .map((area) => (
                          <tr key={area.id} className="hover:bg-slate-50/60 transition">
                            <td className="py-3 font-mono font-bold text-slate-900 text-xs">{area.pincode}</td>
                            <td className="py-3 font-medium text-slate-700">{area.area_name || area.name}</td>
                            <td className="py-3 text-slate-500">{area.city}</td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  area.is_active
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                }`}
                              >
                                {area.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleServiceArea(area.id, area.is_active)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                                  area.is_active
                                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                {area.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Extensible Services Catalog */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-4 shadow-sm text-xs">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-black text-slate-900 text-base">Service Catalogue & Pricing Units</h2>
                <p className="text-slate-500 text-xs mt-0.5">Authoritative service catalogue supporting extensible units (per-kg baseline).</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {servicesList.length === 0 ? (
                  <div className="col-span-2 p-4 text-center text-slate-400 bg-slate-50 rounded-2xl">
                    Standard Wash & Fold (Normal) configured at ₹{(settings?.price_per_kg_paise ? settings.price_per_kg_paise / 100 : 80)} / kg.
                  </div>
                ) : (
                  servicesList.map((srv) => (
                    <div key={srv.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-black text-slate-900 text-sm">{srv.name}</h4>
                          <span className="text-[11px] text-slate-500">{srv.description || 'Standard wash and iron/fold'}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {srv.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="pt-2 flex items-baseline justify-between border-t border-slate-200/60">
                        <span className="text-slate-500 text-[11px]">Unit: per {srv.pricing_unit}</span>
                        <span className="font-black text-slate-900 text-base">₹{((srv.unit_price_paise || srv.price_paise || 8000) / 100).toFixed(0)} <span className="text-xs text-slate-400 font-normal">/ {srv.pricing_unit}</span></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Order Creation Modal */}
      {isCreatingManualOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-black text-sm text-slate-900">Create Manual Order (Walk-in or Phone)</h3>
              <button onClick={() => setIsCreatingManualOrder(false)} className="p-1 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateManualOrder} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mobile Number *</label>
                <input
                  type="tel"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Address / Walk-in Counter *</label>
                <input
                  type="text"
                  value={pickupAddr}
                  onChange={(e) => setPickupAddr(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">PIN Code</label>
                  <input
                    type="text"
                    value={pickupPincode}
                    onChange={(e) => setPickupPincode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingManualOrder(false)}
                  className="flex-1 py-2.5 px-3 border border-slate-200 rounded-xl font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md"
                >
                  Create Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Feedback Modal */}
      {reviewingFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center pb-2 border-b">
              <div>
                <h3 className="font-black text-sm text-slate-900">Review Customer Feedback</h3>
                <span className="text-slate-400 text-[11px]">Order #{reviewingFeedback.order_number} • {reviewingFeedback.customer_name}</span>
              </div>
              <button onClick={() => setReviewingFeedback(null)} className="p-1 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl space-y-1">
              <div className="flex justify-between font-bold">
                <span>Overall Rating:</span>
                <span className="text-amber-500">{reviewingFeedback.rating_overall} / 5 ★</span>
              </div>
              {reviewingFeedback.comment && <p className="text-slate-600 italic">"{reviewingFeedback.comment}"</p>}
              {reviewingFeedback.low_rating_reason && (
                <p className="text-red-700 font-semibold">Issue: {reviewingFeedback.low_rating_reason}</p>
              )}
            </div>

            <form onSubmit={handleSaveFeedbackReview} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={resolutionStatusInput}
                  onChange={(e: any) => setResolutionStatusInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                >
                  <option value="new">New</option>
                  <option value="reviewed">Reviewed (Acknowledged)</option>
                  <option value="resolved">Resolved (Customer Followed Up)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Internal Resolution Note (Private)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Called customer and offered complimentary wash; delivery driver instructed on punctuality."
                  value={resolutionNoteInput}
                  onChange={(e) => setResolutionNoteInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewingFeedback(null)}
                  className="flex-1 py-2.5 px-3 border border-slate-200 rounded-xl font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md"
                >
                  Save Review Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Assignment Modal */}
      {assigningOrder && (
        <AssignStaffModal
          order={assigningOrder}
          isOpen={!!assigningOrder}
          onClose={() => setAssigningOrder(null)}
          onSuccess={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setAssigningOrder(null);
          }}
          assignedByName={currentUser?.full_name || 'Owner'}
        />
      )}

      {/* Payment Recording Modal */}
      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          isOpen={!!paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onPaymentSuccess={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setPaymentOrder(null);
            LaundryService.getAllPayments().then(setPayments);
          }}
          recordedByName={currentUser?.full_name || 'Owner'}
          isStaff={true}
        />
      )}

      {/* Weight Modal */}
      {weighingOrder && (
        <WeightEntryModal
          order={weighingOrder}
          isOpen={!!weighingOrder}
          onClose={() => setWeighingOrder(null)}
          onSuccess={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setWeighingOrder(null);
          }}
          managerName={currentUser?.full_name || 'Owner'}
        />
      )}

      {/* Add Service Area Modal */}
      {isAddingArea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-black text-sm text-slate-900">Add Service Area</h3>
              <button onClick={() => setIsAddingArea(false)} className="p-1 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddServiceArea} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">6-Digit PIN Code *</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="560038"
                  value={newAreaPin}
                  onChange={(e) => setNewAreaPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Area / Locality Name *</label>
                <input
                  type="text"
                  placeholder="Indiranagar"
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={newAreaCity}
                  onChange={(e) => setNewAreaCity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingArea(false)}
                  className="flex-1 py-2.5 px-3 border border-slate-200 rounded-xl font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md"
                >
                  Save Area
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
