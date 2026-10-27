import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Order, BusinessSettings, Profile, PickupSlot,
  Payment, OrderFeedback, FeedbackStatus, FeedbackSummaryMetrics, UserRole
} from '../../types';
import { LaundryService, DEFAULT_SETTINGS } from '../../services/laundryService';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { AssignStaffModal } from '../../components/AssignStaffModal';
import { PaymentModal } from '../../components/PaymentModal';
import { WeightEntryModal } from '../../components/WeightEntryModal';
import { PwaInstallPrompt } from '../../components/PwaInstallPrompt';
import {
  IndianRupee, Package, CheckCircle2,
  Users, Settings, Plus, RefreshCw,
  Search, Shield, Star, MessageSquareHeart,
  AlertCircle, X, Download, TrendingUp, TrendingDown, LogOut, Loader2,
  Edit2, Trash2
} from 'lucide-react';
import {
  ServiceArea, LaundryServiceItem, PeriodFilter, DashboardPeriodAnalytics
} from '../../types';

export const OwnerDashboard: React.FC = () => {
  const { currentUser, logout, sendPasswordResetEmail } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'staff' | 'payments' | 'feedback' | 'settings'>('staff');
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
  const [manualOrderError, setManualOrderError] = useState<string | null>(null);
  const [orderActionNotice, setOrderActionNotice] = useState<string | null>(null);
  const [feedbackReviewError, setFeedbackReviewError] = useState<string | null>(null);
  const [serviceActionError, setServiceActionError] = useState<string | null>(null);

  // Settings Form State
  const [businessPhoneInput, setBusinessPhoneInput] = useState<string>(DEFAULT_SETTINGS.business_phone);
  const [businessAddressInput, setBusinessAddressInput] = useState<string>(DEFAULT_SETTINGS.business_address);
  const [pricePerKgInput, setPricePerKgInput] = useState<string>('80');
  const [minWeightInput, setMinWeightInput] = useState<string>('3.0');
  const [deliveryChargeInput, setDeliveryChargeInput] = useState<string>('0');
  const [upiIdInput, setUpiIdInput] = useState<string>('superwash@upi');
  const [allowDeliveryPay, setAllowDeliveryPay] = useState<boolean>(true);
  const [pincodesInput, setPincodesInput] = useState<string>('560038, 560008, 560103, 560075, 560001, 560066, 560037');
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // Service Area Creation State
  const [isAddingArea, setIsAddingArea] = useState<boolean>(false);
  const [newAreaPin, setNewAreaPin] = useState<string>('');
  const [newAreaName, setNewAreaName] = useState<string>('');
  const [newAreaCity, setNewAreaCity] = useState<string>('Bengaluru');
  const [areaSearchQuery, setAreaSearchQuery] = useState<string>('');
  const [areaFormError, setAreaFormError] = useState<string | null>(null);
  const [areaActionSuccess, setAreaActionSuccess] = useState<string | null>(null);
  const [isSubmittingArea, setIsSubmittingArea] = useState<boolean>(false);

  // Add Staff State
  const [isAddingStaff, setIsAddingStaff] = useState<boolean>(false);
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffEmail, setNewStaffEmail] = useState<string>('');
  const [newStaffPhone, setNewStaffPhone] = useState<string>('');
  const [newStaffRole, setNewStaffRole] = useState<'delivery' | 'manager'>('delivery');
  const [staffPasswordOption, setStaffPasswordOption] = useState<'invite' | 'password'>('invite');
  const [newStaffPassword, setNewStaffPassword] = useState<string>('');
  const [isSubmittingStaff, setIsSubmittingStaff] = useState<boolean>(false);
  const [staffFormError, setStaffFormError] = useState<string | null>(null);

  // Staff Search & Filter State
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<'all' | 'owner' | 'manager' | 'delivery'>('all');
  const [staffStatusFilter, setStaffStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Staff Edit Modal State
  const [editingStaff, setEditingStaff] = useState<Profile | null>(null);
  const [editStaffName, setEditStaffName] = useState<string>('');
  const [editStaffEmail, setEditStaffEmail] = useState<string>('');
  const [editStaffPhone, setEditStaffPhone] = useState<string>('');
  const [editStaffRole, setEditStaffRole] = useState<UserRole>('delivery');
  const [editStaffIsActive, setEditStaffIsActive] = useState<boolean>(true);
  const [isConfirmingRoleChange, setIsConfirmingRoleChange] = useState<boolean>(false);
  const [editStaffError, setEditStaffError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // Staff Delete Modal State
  const [deletingStaff, setDeletingStaff] = useState<Profile | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState<boolean>(false);
  const [deleteStaffError, setDeleteStaffError] = useState<string | null>(null);

  // Staff Toggle Confirmation State
  const [confirmToggleStaff, setConfirmToggleStaff] = useState<{ staff: Profile; nextActive: boolean } | null>(null);
  const [isTogglingStaff, setIsTogglingStaff] = useState<boolean>(false);

  // Feedback Resolution Modal State
  const [reviewingFeedback, setReviewingFeedback] = useState<OrderFeedback | null>(null);
  const [resolutionNoteInput, setResolutionNoteInput] = useState<string>('');
  const [resolutionStatusInput, setResolutionStatusInput] = useState<FeedbackStatus>('reviewed');

  // Modals
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);
  const [assignmentType, setAssignmentType] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [weighingOrder, setWeighingOrder] = useState<Order | null>(null);

  // Service Catalogue Management State
  const [isAddingService, setIsAddingService] = useState<boolean>(false);
  const [editingService, setEditingService] = useState<LaundryServiceItem | null>(null);
  const [deletingService, setDeletingService] = useState<LaundryServiceItem | null>(null);
  const [serviceDeleteError, setServiceDeleteError] = useState<string | null>(null);
  const [serviceFormError, setServiceFormError] = useState<string | null>(null);
  const [isSubmittingService, setIsSubmittingService] = useState<boolean>(false);
  const [serviceActionSuccess, setServiceActionSuccess] = useState<string | null>(null);

  // Service form fields
  const [serviceName, setServiceName] = useState<string>('');
  const [serviceDescription, setServiceDescription] = useState<string>('');
  const [servicePricingUnit, setServicePricingUnit] = useState<string>('per_kg');
  const [serviceUnitPrice, setServiceUnitPrice] = useState<string>('80');
  const [serviceMinWeight, setServiceMinWeight] = useState<string>('3.0');
  const [serviceIsActive, setServiceIsActive] = useState<boolean>(true);
  const [serviceDisplayOrder, setServiceDisplayOrder] = useState<number>(1);
  const [selectedManualServiceId, setSelectedManualServiceId] = useState<string>('');

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
        LaundryService.getStaffProfiles(true),
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

      setBusinessPhoneInput(s.business_phone || DEFAULT_SETTINGS.business_phone);
      setBusinessAddressInput(s.business_address || DEFAULT_SETTINGS.business_address);
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
        const fresh = await LaundryService.getServiceAreas();
        setServiceAreasList(fresh);
        setAreaActionSuccess(`Service area "${updated.area_name || updated.name}" ${updated.is_active ? 'activated' : 'deactivated'}.`);
        setTimeout(() => setAreaActionSuccess(null), 3000);
      }
    } catch (err: any) {
      setAreaFormError(err.message || 'Error updating service area');
    }
  };

  const handleAddServiceArea = async (e: React.FormEvent) => {
    e.preventDefault();
    setAreaFormError(null);

    const pin = newAreaPin.trim().replace(/\D/g, '');
    const name = newAreaName.trim();
    const city = newAreaCity.trim() || 'Bengaluru';

    if (pin.length !== 6) {
      setAreaFormError('Please enter a valid 6-digit Indian PIN code.');
      return;
    }
    if (!name) {
      setAreaFormError('Please provide an area or locality name.');
      return;
    }

    setIsSubmittingArea(true);
    try {
      await LaundryService.addServiceArea({
        pincode: pin,
        area_name: name,
        city: city,
        state: 'Karnataka',
        is_active: true
      });

      // Reload authoritative service areas directly from database
      const freshAreas = await LaundryService.getServiceAreas();
      setServiceAreasList(freshAreas);

      setIsAddingArea(false);
      setNewAreaPin('');
      setNewAreaName('');
      setNewAreaCity('Bengaluru');
      setAreaActionSuccess(`Service area "${name} (${pin})" added successfully.`);
      setTimeout(() => setAreaActionSuccess(null), 4000);
    } catch (err: any) {
      setAreaFormError(err.message || 'Error adding service area. Please check PIN and locality name.');
    } finally {
      setIsSubmittingArea(false);
    }
  };

  const handleExportCSV = () => {
    if (orders.length === 0) {
      setOrderActionNotice('No orders found to export as CSV.');
      setTimeout(() => setOrderActionNotice(null), 4000);
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
    if (isSavingSettings) return;

    const cleanPhone = businessPhoneInput.trim();
    const cleanAddress = businessAddressInput.trim();

    if (!cleanPhone) {
      setSettingsError('Business phone number is required.');
      return;
    }
    const digitsOnly = cleanPhone.replace(/[^0-9]/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      setSettingsError('Please enter a valid phone number (7 to 15 digits).');
      return;
    }

    if (!cleanAddress || cleanAddress.length < 5) {
      setSettingsError('Please enter a valid business address (at least 5 characters).');
      return;
    }

    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSavedMsg(null);

    try {
      const pins = pincodesInput.split(',').map((p) => p.trim()).filter((p) => p.length >= 6);
      const updated = await LaundryService.updateSettings({
        business_phone: cleanPhone,
        business_address: cleanAddress,
        price_per_kg_paise: Math.round(parseFloat(pricePerKgInput) * 100),
        min_weight_kg: parseFloat(minWeightInput),
        delivery_charge_paise: Math.round(parseFloat(deliveryChargeInput) * 100),
        upi_id: upiIdInput.trim(),
        allow_delivery_payment_recording: allowDeliveryPay,
        serviceable_pincodes: pins.length > 0 ? pins : undefined
      });
      setSettings(updated);
      setBusinessPhoneInput(updated.business_phone);
      setBusinessAddressInput(updated.business_address);
      setSettingsSavedMsg('Settings updated successfully! Business contact details and operational rates have been saved.');
      setTimeout(() => setSettingsSavedMsg(null), 4000);
    } catch (err: any) {
      setSettingsError(err?.message || 'Error updating settings');
    } finally {
      setIsSavingSettings(false);
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
        pickup_slot: selectedSlot || 'Morning (08:00 AM - 11:00 AM)',
        service_id: selectedManualServiceId || undefined
      });
      setOrders((prev) => [order, ...prev]);
      setIsCreatingManualOrder(false);
      setCustName('');
      setCustPhone('');
      setPickupAddr('');
      setSelectedManualServiceId('');
      setActiveTab('orders');
    } catch (err: any) {
      setManualOrderError(err.message || 'Error creating manual order');
    }
  };

  // Staff Directory Filtering Logic
  const filteredStaff = staffList.filter((staff) => {
    if (staffSearchQuery.trim()) {
      const q = staffSearchQuery.trim().toLowerCase();
      const matchName = staff.full_name?.toLowerCase().includes(q);
      const matchEmail = staff.email?.toLowerCase().includes(q);
      const matchPhone = staff.phone?.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchPhone) return false;
    }
    if (staffRoleFilter !== 'all' && staff.role !== staffRoleFilter) {
      return false;
    }
    if (staffStatusFilter === 'active' && !staff.is_active) return false;
    if (staffStatusFilter === 'inactive' && staff.is_active) return false;
    return true;
  });

  const handleResetStaffFilters = () => {
    setStaffSearchQuery('');
    setStaffRoleFilter('all');
    setStaffStatusFilter('all');
  };

  const handleOpenEdit = (staff: Profile) => {
    setEditingStaff(staff);
    setEditStaffName(staff.full_name);
    setEditStaffEmail(staff.email || '');
    setEditStaffPhone(staff.phone || '');
    setEditStaffRole(staff.role);
    setEditStaffIsActive(staff.is_active);
    setEditStaffError(null);
    setIsConfirmingRoleChange(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setEditStaffError(null);

    const trimmedName = editStaffName.trim();
    if (trimmedName.length < 2) {
      setEditStaffError('Full name must be at least 2 characters.');
      return;
    }

    const cleanPhone = editStaffPhone.replace(/[^0-9]/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setEditStaffError('Please enter a valid 10-digit Indian phone number.');
      return;
    }

    const cleanEmail = editStaffEmail.trim().toLowerCase();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setEditStaffError('Please enter a valid email address.');
      return;
    }

    if (editingStaff.email?.toLowerCase() === 'superwashexprez@gmail.com') {
      if (cleanEmail && cleanEmail !== 'superwashexprez@gmail.com') {
        setEditStaffError('The permanent primary owner email cannot be changed.');
        return;
      }
      if (editStaffRole !== 'owner') {
        setEditStaffError('The permanent primary owner role cannot be changed.');
        return;
      }
      if (!editStaffIsActive) {
        setEditStaffError('The permanent primary owner account cannot be deactivated.');
        return;
      }
    }

    if (editingStaff.id === currentUser?.id) {
      if (editStaffRole !== editingStaff.role) {
        setEditStaffError('Business owners cannot demote their own account role.');
        return;
      }
      if (!editStaffIsActive) {
        setEditStaffError('You cannot deactivate your own owner account.');
        return;
      }
    }

    // Require confirmation if role changed
    if (editStaffRole !== editingStaff.role && !isConfirmingRoleChange) {
      setIsConfirmingRoleChange(true);
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const updated = await LaundryService.updateStaffProfile(
        editingStaff.id,
        {
          full_name: trimmedName,
          email: cleanEmail || undefined,
          phone: cleanPhone,
          role: editStaffRole,
          is_active: editStaffIsActive
        },
        currentUser?.id,
        currentUser?.role
      );

      const freshStaff = await LaundryService.getStaffProfiles(true);
      setStaffList(freshStaff);
      setEditingStaff(null);
      setStaffActionMsg(`Successfully updated employee details for ${updated.full_name}.`);
      setTimeout(() => setStaffActionMsg(null), 5000);
    } catch (err: any) {
      setEditStaffError(err.message || 'Failed to update employee details.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleConfirmDeleteStaff = async () => {
    if (!deletingStaff) return;
    setDeleteStaffError(null);
    setIsSubmittingDelete(true);
    try {
      const res = await LaundryService.deleteStaffProfile(
        deletingStaff.id,
        currentUser?.id,
        currentUser?.role
      );
      const freshStaff = await LaundryService.getStaffProfiles(true);
      setStaffList(freshStaff);
      setDeletingStaff(null);
      setStaffActionMsg(res.message);
      setStaffActionType(res.deactivatedInstead ? 'warning' : 'success');
      setTimeout(() => {
        setStaffActionMsg(null);
        setStaffActionType(null);
      }, 6000);
    } catch (err: any) {
      setDeleteStaffError(err.message || 'Failed to delete staff member.');
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  const [staffActionMsg, setStaffActionMsg] = useState<string | null>(null);
  const [staffActionType, setStaffActionType] = useState<'success' | 'warning' | null>(null);

  const handleRequestToggleStatus = (staff: Profile) => {
    if (staff.email?.toLowerCase() === 'superwashexprez@gmail.com') {
      setStaffActionMsg('The permanent primary owner account cannot be deactivated.');
      setTimeout(() => setStaffActionMsg(null), 5000);
      return;
    }
    if (staff.id === currentUser?.id) {
      setStaffActionMsg('You cannot deactivate your own owner account.');
      setTimeout(() => setStaffActionMsg(null), 5000);
      return;
    }
    setConfirmToggleStaff({
      staff,
      nextActive: !staff.is_active
    });
  };

  const handleConfirmToggleStatus = async () => {
    if (!confirmToggleStaff) return;
    setIsTogglingStaff(true);
    try {
      const updated = await LaundryService.toggleStaffStatus(
        confirmToggleStaff.staff.id,
        confirmToggleStaff.nextActive,
        currentUser?.id
      );
      if (updated) {
        const fresh = await LaundryService.getStaffProfiles(true);
        setStaffList(fresh);
        setStaffActionMsg(
          confirmToggleStaff.nextActive
            ? `Successfully reactivated ${updated.full_name}. Their operational access as ${updated.role} has been restored.`
            : `Successfully deactivated ${updated.full_name}. They have been blocked from operational tools.`
        );
        setTimeout(() => setStaffActionMsg(null), 5000);
      }
      setConfirmToggleStaff(null);
    } catch (err: any) {
      setStaffActionMsg(err.message || 'Error updating staff status');
      setTimeout(() => setStaffActionMsg(null), 5000);
    } finally {
      setIsTogglingStaff(false);
    }
  };

  const handleSendStaffReset = async (email: string) => {
    try {
      const res = await sendPasswordResetEmail(email);
      setStaffActionMsg(res.message);
      setTimeout(() => setStaffActionMsg(null), 6000);
    } catch (err: any) {
      setStaffActionMsg(err.message || 'Failed to send reset email');
      setTimeout(() => setStaffActionMsg(null), 5000);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffFormError(null);

    const email = newStaffEmail.trim().toLowerCase();
    const phone = newStaffPhone.trim();
    const name = newStaffName.trim();

    if (!name || !email || !phone) {
      setStaffFormError('Please fill out all required fields: Name, Email, and Phone Number.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStaffFormError('Please enter a valid email address.');
      return;
    }

    const cleanDigits = phone.replace(/[^0-9]/g, '').slice(-10);
    if (cleanDigits.length !== 10) {
      setStaffFormError('Please enter a valid 10-digit Indian phone number.');
      return;
    }

    if (staffPasswordOption === 'password' && newStaffPassword.length < 8) {
      setStaffFormError('Initial password must be at least 8 characters long.');
      return;
    }

    setIsSubmittingStaff(true);
    try {
      await LaundryService.addStaffProfile({
        full_name: name,
        email: email,
        phone: phone,
        role: newStaffRole,
        password: staffPasswordOption === 'password' ? newStaffPassword : undefined,
        send_invite: staffPasswordOption === 'invite'
      });

      // Reload authoritative directory from database to guarantee persistence and avoid phantom records
      const freshStaff = await LaundryService.getStaffProfiles(true);
      setStaffList(freshStaff);

      setIsAddingStaff(false);
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPhone('');
      setNewStaffPassword('');
      setStaffPasswordOption('invite');
      setStaffActionMsg(`Staff account for ${name} (${email}) created and persisted successfully.`);
      setTimeout(() => setStaffActionMsg(null), 6000);
    } catch (err: any) {
      setStaffActionMsg(null);
      setStaffFormError(err.message || 'Error creating staff account. Please verify details.');
    } finally {
      setIsSubmittingStaff(false);
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
    } catch (err: any) {
      setFeedbackReviewError(err?.message || 'Error updating feedback review');
    }
  };

  // Service Catalogue Handlers
  const handleOpenAddService = () => {
    setServiceName('');
    setServiceDescription('');
    setServicePricingUnit('per_kg');
    setServiceUnitPrice('80');
    setServiceMinWeight('3.0');
    setServiceIsActive(true);
    setServiceDisplayOrder(servicesList.length + 1);
    setServiceFormError(null);
    setIsAddingService(true);
  };

  const handleOpenEditService = (srv: LaundryServiceItem) => {
    setEditingService(srv);
    setServiceName(srv.name);
    setServiceDescription(srv.description || '');
    setServicePricingUnit(srv.pricing_unit);
    setServiceUnitPrice(((srv.unit_price_paise || srv.price_paise || 8000) / 100).toString());
    setServiceMinWeight((srv.min_weight_kg || 0).toString());
    setServiceIsActive(srv.is_active);
    setServiceDisplayOrder(srv.display_order || 1);
    setServiceFormError(null);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiceFormError(null);

    const priceNum = parseFloat(serviceUnitPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setServiceFormError('Please enter a valid unit price greater than zero.');
      return;
    }

    const minWeightNum = servicePricingUnit === 'per_kg' ? parseFloat(serviceMinWeight) || 0 : 0;
    if (servicePricingUnit === 'per_kg' && minWeightNum < 0) {
      setServiceFormError('Minimum weight cannot be negative.');
      return;
    }

    setIsSubmittingService(true);
    try {
      if (editingService) {
        const updated = await LaundryService.updateService(editingService.id, {
          name: serviceName.trim(),
          description: serviceDescription.trim(),
          pricing_unit: servicePricingUnit,
          unit_price_paise: Math.round(priceNum * 100),
          min_weight_kg: minWeightNum,
          is_active: serviceIsActive,
          display_order: Number(serviceDisplayOrder) || 1
        }, currentUser?.role);
        setServicesList((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        setServiceActionSuccess(`Service '${updated.name}' updated successfully.`);
        setEditingService(null);
      } else {
        const created = await LaundryService.addService({
          name: serviceName.trim(),
          description: serviceDescription.trim(),
          pricing_unit: servicePricingUnit,
          unit_price_paise: Math.round(priceNum * 100),
          min_weight_kg: minWeightNum,
          is_active: serviceIsActive,
          display_order: Number(serviceDisplayOrder) || (servicesList.length + 1)
        }, currentUser?.role);
        setServicesList((prev) => [...prev, created]);
        setServiceActionSuccess(`New service '${created.name}' added to catalogue.`);
        setIsAddingService(false);
      }
      setTimeout(() => setServiceActionSuccess(null), 4000);
    } catch (err: any) {
      setServiceFormError(err.message || 'Failed to save service.');
    } finally {
      setIsSubmittingService(false);
    }
  };

  const handleToggleServiceStatus = async (srv: LaundryServiceItem) => {
    try {
      const updated = await LaundryService.toggleServiceStatus(srv.id, !srv.is_active, currentUser?.role);
      setServicesList((prev) => prev.map((s) => (s.id === srv.id ? updated : s)));
      setServiceActionSuccess(`Service '${srv.name}' ${updated.is_active ? 'activated' : 'deactivated'}.`);
      setTimeout(() => setServiceActionSuccess(null), 3000);
    } catch (err: any) {
      setServiceActionError(err.message || 'Error updating service status.');
      setTimeout(() => setServiceActionError(null), 5000);
    }
  };

  const handleDeleteService = async () => {
    if (!deletingService) return;
    setServiceDeleteError(null);
    setIsSubmittingService(true);
    try {
      await LaundryService.deleteService(deletingService.id, currentUser?.role);
      setServicesList((prev) => prev.filter((s) => s.id !== deletingService.id));
      setServiceActionSuccess(`Service '${deletingService.name}' deleted.`);
      setTimeout(() => setServiceActionSuccess(null), 3000);
      setDeletingService(null);
    } catch (err: any) {
      setServiceDeleteError(err.message || 'Cannot delete service.');
    } finally {
      setIsSubmittingService(false);
    }
  };

  const handleDeactivateInstead = async () => {
    if (!deletingService) return;
    try {
      const updated = await LaundryService.toggleServiceStatus(deletingService.id, false, currentUser?.role);
      setServicesList((prev) => prev.map((s) => (s.id === deletingService.id ? updated : s)));
      setServiceActionSuccess(`Service '${deletingService.name}' has been deactivated. Historical orders remain intact.`);
      setTimeout(() => setServiceActionSuccess(null), 4000);
      setDeletingService(null);
      setServiceDeleteError(null);
    } catch (err: any) {
      setServiceDeleteError(err.message || 'Error deactivating service.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24">
      {/* Header */}
      <div className="bg-slate-900 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link
            to="/admin"
            onClick={() => setActiveTab('overview')}
            className="flex items-center gap-3 group hover:opacity-90 transition"
            title="SuperWash Business Owner Portal"
          >
            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight">SuperWash Exprez • Business Owner</h1>
              <p className="text-xs text-slate-400">Operations, Settings & Quality Portal</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <PwaInstallPrompt
              variant="inline-button"
              portalName="Business Owner"
              className="bg-slate-800 hover:bg-slate-700 text-slate-300"
            />
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
            { key: 'staff', label: `Staff Accounts (${staffList.length})` },
            { key: 'settings', label: 'Pricing & Coverage' },
            { key: 'overview', label: 'Executive Dashboard' },
            { key: 'orders', label: `Orders (${orders.length})` },
            { key: 'feedback', label: `Private Feedback (${feedbacks.length})` },
            { key: 'payments', label: `Payments (${payments.length})` },
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

            {orderActionNotice && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl flex items-center justify-between gap-2 text-xs shadow-xs animate-fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{orderActionNotice}</span>
                </div>
                <button onClick={() => setOrderActionNotice(null)} className="text-amber-600 hover:text-amber-800 p-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

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
                          <span className="text-slate-400 block">Pickup Agent:</span>
                          <span className="font-bold text-slate-800 truncate block">
                            {order.assigned_pickup_name || 'Unassigned'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Delivery Courier:</span>
                          <span className="font-bold text-slate-800 truncate block">
                            {order.assigned_delivery_name || 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                      {(order.order_status === 'booked' || order.order_status === 'pickup_assigned') ? (
                        <button
                          onClick={() => {
                            setAssigningOrder(order);
                            setAssignmentType('pickup');
                          }}
                          className="py-1.5 px-3 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl font-bold text-[11px]"
                        >
                          {order.assigned_pickup_name ? 'Reassign Pickup' : 'Assign Pickup'}
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setAssigningOrder(order);
                            setAssignmentType('delivery');
                          }}
                          className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[11px]"
                        >
                          {order.assigned_delivery_name ? 'Reassign Courier' : 'Assign Courier'}
                        </button>
                      )}

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

            {staffActionMsg && (
              <div
                className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 ${
                  staffActionType === 'warning'
                    ? 'bg-amber-50 border border-amber-300 text-amber-900'
                    : 'bg-purple-50 border border-purple-200 text-purple-900'
                }`}
              >
                {staffActionType === 'warning' ? (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                )}
                <span className="font-medium">{staffActionMsg}</span>
              </div>
            )}



            {isAddingStaff && (
              <form onSubmit={handleAddStaff} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 text-xs">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-900 text-sm">Add New Staff Account</h3>
                  <button
                    type="button"
                    onClick={() => { setIsAddingStaff(false); setStaffFormError(null); }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                    title="Close form"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {staffFormError && (
                  <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                      <span className="font-medium">{staffFormError}</span>
                    </div>
                    {(staffFormError.includes('401') || staffFormError.toLowerCase().includes('session')) && (
                      <button
                        type="button"
                        onClick={() => { window.location.href = '/login?role=owner&redirect=/admin'; }}
                        className="text-xs font-bold text-red-700 underline hover:text-red-900 shrink-0 self-end sm:self-auto cursor-pointer"
                      >
                        Log In Again &rarr;
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="staff-fullname-input"
                      placeholder="e.g. Vikram Singh"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="staff-email-input"
                      placeholder="e.g. vikram.superwash@gmail.com"
                      value={newStaffEmail}
                      onChange={(e) => setNewStaffEmail(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      id="staff-phone-input"
                      placeholder="e.g. 9876543219"
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">
                      Operational Role <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="staff-role-select"
                      value={newStaffRole}
                      onChange={(e: any) => setNewStaffRole(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    >
                      <option value="delivery">Delivery Person</option>
                      <option value="manager">Store Manager</option>
                    </select>
                  </div>
                </div>

                {/* Password / Invitation Setup Options */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <label className="block text-slate-700 font-bold text-xs">
                    Password Setup & Activation Flow
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="radio"
                        name="passwordOption"
                        checked={staffPasswordOption === 'invite'}
                        onChange={() => setStaffPasswordOption('invite')}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span>Send Setup / Invitation Link to Email (Recommended)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="radio"
                        name="passwordOption"
                        checked={staffPasswordOption === 'password'}
                        onChange={() => setStaffPasswordOption('password')}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span>Set Initial Temporary Password</span>
                    </label>
                  </div>

                  {staffPasswordOption === 'password' && (
                    <div className="pt-2">
                      <label className="block text-slate-600 font-semibold mb-1">
                        Temporary Password (min 8 chars)
                      </label>
                      <input
                        type="password"
                        id="staff-initial-password-input"
                        placeholder="••••••••••••"
                        value={newStaffPassword}
                        onChange={(e) => setNewStaffPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        The staff member will be advised to update this password upon initial sign-in.
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsAddingStaff(false); setStaffFormError(null); }}
                    className="py-2.5 px-4 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="save-staff-btn"
                    disabled={isSubmittingStaff}
                    className="py-2.5 px-5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                  >
                    {isSubmittingStaff ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <span>Save Staff Account</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Staff Search & Filters Bar */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Search input */}
                <div className="sm:col-span-6 relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    id="staff-search-input"
                    value={staffSearchQuery}
                    onChange={(e) => setStaffSearchQuery(e.target.value)}
                    placeholder="Search staff by name, email, or phone..."
                    className="w-full pl-10 pr-9 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-semibold text-slate-800 placeholder:text-slate-400 bg-slate-50/50"
                  />
                  {staffSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStaffSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Role Filter */}
                <div className="sm:col-span-3">
                  <select
                    id="staff-role-filter"
                    aria-label="Filter staff by operational role"
                    value={staffRoleFilter}
                    onChange={(e) => setStaffRoleFilter(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-semibold text-slate-700 bg-slate-50/50"
                  >
                    <option value="all">All Roles</option>
                    <option value="manager">Store Manager</option>
                    <option value="delivery">Delivery Person</option>
                    <option value="owner">Business Owner</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="sm:col-span-3">
                  <select
                    id="staff-status-filter"
                    aria-label="Filter staff by active status"
                    value={staffStatusFilter}
                    onChange={(e) => setStaffStatusFilter(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-semibold text-slate-700 bg-slate-50/50"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Deactivated Only</option>
                  </select>
                </div>
              </div>

              {/* Status Row & Reset Filters */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                <div>
                  Showing <strong className="text-slate-800">{filteredStaff.length}</strong> of{' '}
                  <strong className="text-slate-800">{staffList.length}</strong> staff accounts
                </div>
                {(staffSearchQuery || staffRoleFilter !== 'all' || staffStatusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={handleResetStaffFilters}
                    className="text-purple-600 hover:text-purple-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Reset Filters</span>
                  </button>
                )}
              </div>
            </div>

            {/* Empty State */}
            {filteredStaff.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 text-xs shadow-sm space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">No staff members found</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {staffList.length === 0
                      ? 'No staff accounts have been added yet. Click Add Staff Member above.'
                      : 'No employee accounts match your current search and filter selections.'}
                  </p>
                </div>
                {staffList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetStaffFilters}
                    className="py-2 px-4 rounded-xl font-bold text-xs bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear Search & Filters</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredStaff.map((staff) => (
                  <div
                    key={staff.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 flex flex-col justify-between gap-3 text-xs shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm shrink-0">
                          {staff.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 block text-sm">{staff.full_name}</span>
                            {staff.email?.toLowerCase() === 'superwashexprez@gmail.com' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                Permanent Primary Owner
                              </span>
                            ) : staff.id === currentUser?.id ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 border border-purple-200">
                                You
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-slate-500 font-mono text-[11px]">{staff.phone || 'No phone'}</span>
                            <span className={`uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded border ${
                              staff.role === 'owner'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : staff.role === 'manager'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {staff.role}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              staff.is_active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {staff.is_active ? 'Active' : 'Deactivated'}
                            </span>
                          </div>
                          {staff.email && (
                            <span className="text-slate-400 font-mono text-[11px] block mt-1 truncate max-w-[220px]" title={staff.email}>
                              {staff.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 justify-end">
                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(staff)}
                        className="px-2.5 py-1.5 rounded-xl font-bold text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 flex items-center gap-1 transition cursor-pointer"
                        title={`Edit ${staff.full_name}'s details`}
                      >
                        <Edit2 className="w-3 h-3 text-slate-500" />
                        <span>Edit</span>
                      </button>

                      {/* Send Reset Link Button */}
                      {staff.email && (
                        <button
                          type="button"
                          onClick={() => handleSendStaffReset(staff.email!)}
                          className="px-2.5 py-1.5 rounded-xl font-bold text-[11px] bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition whitespace-nowrap cursor-pointer"
                          title={`Send password reset email to ${staff.email}`}
                        >
                          Reset Link
                        </button>
                      )}

                      {/* Activate / Deactivate Button */}
                      {staff.email?.toLowerCase() === 'superwashexprez@gmail.com' ? (
                        <span
                          className="px-3 py-1.5 rounded-xl font-bold text-[11px] bg-amber-50 text-amber-800 border border-amber-300 cursor-not-allowed"
                          title="The permanent primary owner account cannot be deactivated"
                        >
                          Permanent Owner
                        </span>
                      ) : staff.id === currentUser?.id ? (
                        <span
                          className="px-3 py-1.5 rounded-xl font-bold text-[11px] bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                          title="You cannot deactivate your own owner account"
                        >
                          Active (Owner)
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestToggleStatus(staff)}
                          className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition whitespace-nowrap cursor-pointer ${
                            staff.is_active
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-red-50 hover:text-red-800 hover:border-red-200'
                              : 'bg-red-50 text-red-800 border border-red-200 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200'
                          }`}
                          title={staff.is_active ? `Click to deactivate ${staff.full_name}` : `Click to reactivate ${staff.full_name}`}
                        >
                          {staff.is_active ? 'Active' : 'Deactivated'}
                        </button>
                      )}

                      {/* Delete Staff Button */}
                      {staff.email?.toLowerCase() === 'superwashexprez@gmail.com' || staff.id === currentUser?.id ? (
                        <span
                          className="px-2.5 py-1.5 rounded-xl font-bold text-[11px] bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                          title="Protected account cannot be deleted"
                        >
                          Protected
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingStaff(staff);
                            setDeleteStaffError(null);
                          }}
                          className="px-2.5 py-1.5 rounded-xl font-bold text-[11px] bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 flex items-center gap-1 transition cursor-pointer"
                          title={`Delete ${staff.full_name}'s account`}
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Edit Staff Modal */}
            {editingStaff && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-100">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-black text-slate-900 text-lg">Edit Employee Details</h3>
                      <p className="text-xs text-slate-500">Update operational profile and contact details.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingStaff(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {editStaffError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{editStaffError}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1" htmlFor="edit-staff-name">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="edit-staff-name"
                        type="text"
                        value={editStaffName}
                        onChange={(e) => setEditStaffName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-semibold text-slate-800"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1" htmlFor="edit-staff-phone">
                        Phone Number (10 digits) <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="edit-staff-phone"
                        type="tel"
                        value={editStaffPhone}
                        onChange={(e) => setEditStaffPhone(e.target.value)}
                        placeholder="9876543210"
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono font-semibold text-slate-800"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1" htmlFor="edit-staff-role">
                        Operational Role <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="edit-staff-role"
                        value={editStaffRole}
                        onChange={(e) => {
                          setEditStaffRole(e.target.value as any);
                          setIsConfirmingRoleChange(false);
                        }}
                        disabled={editingStaff.id === currentUser?.id || editingStaff.email?.toLowerCase() === 'superwashexprez@gmail.com'}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-semibold text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      >
                        <option value="delivery">Delivery Person</option>
                        <option value="manager">Store Manager</option>
                        {editingStaff.role === 'owner' && <option value="owner">Business Owner</option>}
                      </select>
                      {editingStaff.email?.toLowerCase() === 'superwashexprez@gmail.com' ? (
                        <span className="text-[11px] text-amber-700 font-semibold mt-1 block">
                          The permanent primary owner role cannot be changed.
                        </span>
                      ) : editingStaff.id === currentUser?.id ? (
                        <span className="text-[11px] text-slate-400 mt-1 block">
                          You cannot change your own business owner role from the staff directory.
                        </span>
                      ) : null}
                    </div>

                    {/* Email Address */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-slate-700 font-bold" htmlFor="edit-staff-email">
                          Email Address <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          Auth Identity • Read Only Sync
                        </span>
                      </div>
                      <input
                        id="edit-staff-email"
                        type="email"
                        value={editStaffEmail}
                        onChange={(e) => setEditStaffEmail(e.target.value)}
                        disabled={editingStaff.email?.toLowerCase() === 'superwashexprez@gmail.com'}
                        className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono font-semibold text-slate-800 disabled:bg-slate-100 disabled:cursor-not-allowed"
                        required
                      />
                      <span className="text-[11px] text-slate-400 block mt-1">
                        Employee login email and operational notifications contact.
                      </span>
                    </div>

                    {/* Active Status */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Account Status
                      </label>
                      <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-200 bg-slate-50/50 cursor-pointer">
                        <input
                          type="checkbox"
                          id="edit-staff-active-checkbox"
                          checked={editStaffIsActive}
                          onChange={(e) => setEditStaffIsActive(e.target.checked)}
                          disabled={editingStaff.email?.toLowerCase() === 'superwashexprez@gmail.com' || editingStaff.id === currentUser?.id}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                          <span className="text-xs font-bold text-slate-800">
                            {editStaffIsActive ? 'Account Active' : 'Account Deactivated'}
                          </span>
                          <p className="text-[11px] text-slate-500">
                            {editStaffIsActive
                              ? 'Staff member can log in and perform assigned operational duties.'
                              : 'Staff access is suspended. Operational actions are blocked.'}
                          </p>
                        </div>
                      </label>
                    </div>

                    {/* Role Change Confirmation Alert */}
                    {editStaffRole !== editingStaff.role && (
                      <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs space-y-2">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                          <span>Role Change Confirmation Required</span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          You are changing this employee's role from <strong className="uppercase">{editingStaff.role}</strong> to <strong className="uppercase">{editStaffRole}</strong>.
                          Their operational access permissions will be updated immediately upon saving.
                        </p>
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-950 pt-1">
                          <input
                            type="checkbox"
                            id="confirm-role-change-checkbox"
                            checked={isConfirmingRoleChange}
                            onChange={(e) => setIsConfirmingRoleChange(e.target.checked)}
                            className="rounded text-purple-600 focus:ring-purple-500"
                          />
                          <span>I confirm this role transition and permission change</span>
                        </label>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingStaff(null)}
                        className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-slate-700 font-bold hover:bg-slate-50 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        id="save-edit-staff-btn"
                        disabled={isSubmittingEdit || (editStaffRole !== editingStaff.role && !isConfirmingRoleChange)}
                        className="flex-1 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        {isSubmittingEdit ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <span>Save Changes</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Delete Staff Confirmation Dialog */}
            {deletingStaff && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 text-xs">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto bg-red-100 text-red-600">
                    <Trash2 className="w-6 h-6" />
                  </div>

                  <div className="text-center space-y-1">
                    <h3 className="font-black text-slate-900 text-base">
                      Delete Employee Account?
                    </h3>
                    <p className="text-slate-600 leading-relaxed">
                      Are you sure you want to delete <strong className="text-slate-900">{deletingStaff.full_name}</strong> ({deletingStaff.role.toUpperCase()})?
                      This action may revoke their access to SuperWash operational portals immediately.
                    </p>
                    <p className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-left mt-2">
                      <strong>Note:</strong> If this staff member has historical order assignments, their account will be safely deactivated instead of deleted to protect order audit history and referential integrity.
                    </p>
                  </div>

                  {deleteStaffError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{deleteStaffError}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isSubmittingDelete}
                      onClick={() => {
                        setDeletingStaff(null);
                        setDeleteStaffError(null);
                      }}
                      className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-slate-700 font-bold hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      id="confirm-delete-staff-btn"
                      disabled={isSubmittingDelete}
                      onClick={handleConfirmDeleteStaff}
                      className="flex-1 py-2.5 px-4 font-bold rounded-xl shadow-sm text-white bg-red-600 hover:bg-red-700 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingDelete ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <span>Confirm Delete</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Activate / Deactivate Confirmation Dialog */}
            {confirmToggleStaff && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 text-xs">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${
                    confirmToggleStaff.nextActive ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {confirmToggleStaff.nextActive ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                  </div>

                  <div className="text-center space-y-1">
                    <h3 className="font-black text-slate-900 text-base">
                      {confirmToggleStaff.nextActive ? 'Reactivate Employee Account?' : 'Deactivate Employee Account?'}
                    </h3>
                    <p className="text-slate-600 leading-relaxed">
                      {confirmToggleStaff.nextActive ? (
                        <>
                          Are you sure you want to reactivate <strong className="text-slate-900">{confirmToggleStaff.staff.full_name}</strong>?
                          Their operational permissions as <strong className="uppercase">{confirmToggleStaff.staff.role}</strong> will be restored.
                          Their existing login credentials and password will remain unchanged.
                        </>
                      ) : (
                        <>
                          Are you sure you want to deactivate <strong className="text-slate-900">{confirmToggleStaff.staff.full_name}</strong>?
                          They will immediately lose access to operational tools and cannot take actions on orders.
                          Historical orders, payments, and assignments will remain intact.
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isTogglingStaff}
                      onClick={() => setConfirmToggleStaff(null)}
                      className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-slate-700 font-bold hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      id="confirm-toggle-staff-btn"
                      disabled={isTogglingStaff}
                      onClick={handleConfirmToggleStatus}
                      className={`flex-1 py-2.5 px-4 font-bold rounded-xl shadow-sm text-white transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        confirmToggleStaff.nextActive
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {isTogglingStaff ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Processing...</span>
                        </>
                      ) : confirmToggleStaff.nextActive ? (
                        'Confirm Activation'
                      ) : (
                        'Confirm Deactivation'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
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

              {settingsError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl font-semibold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span>{settingsError}</span>
                </div>
              )}

              {/* Business Contact Details */}
              <div className="border-t border-slate-100 pt-5">
                <h3 className="font-bold text-slate-900 text-sm mb-1">Business Contact & Store Location</h3>
                <p className="text-slate-500 text-xs mb-4">Official customer-facing phone number and shop address displayed across all website pages and receipts.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">
                      Business Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={businessPhoneInput}
                      onChange={(e) => setBusinessPhoneInput(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 text-sm"
                      required
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Displayed in website header, footer, contact page, and used for click-to-call.</p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">
                      Business Address <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={businessAddressInput}
                      onChange={(e) => setBusinessAddressInput(e.target.value)}
                      placeholder="Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-900 text-xs"
                      required
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Physical store and counter drop-off address displayed to customers.</p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="py-3 px-8 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl text-xs shadow-md transition flex items-center gap-2"
              >
                {isSavingSettings && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{isSavingSettings ? 'Saving Configuration...' : 'Save Configuration'}</span>
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
                    onClick={() => {
                      setAreaFormError(null);
                      setIsAddingArea(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-xs transition whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Area</span>
                  </button>
                </div>
              </div>

              {areaActionSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-xs">{areaActionSuccess}</span>
                </div>
              )}

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

            {/* Service Catalogue & Pricing Units Management */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-5 shadow-sm text-xs">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="font-black text-slate-900 text-base">Service Catalogue & Pricing Units</h2>
                  <p className="text-slate-500 text-xs mt-0.5">Authoritative database-driven services supporting extensible units (per kg, per piece/item, per load, per order).</p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddService}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-xs transition whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Service</span>
                </button>
              </div>

              {serviceActionSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-xs">{serviceActionSuccess}</span>
                </div>
              )}

              {serviceActionError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span className="font-semibold text-xs">{serviceActionError}</span>
                  </div>
                  <button onClick={() => setServiceActionError(null)} className="text-red-500 hover:text-red-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {servicesList.length === 0 ? (
                  <div className="col-span-2 p-6 text-center text-slate-400 bg-slate-50 rounded-2xl">
                    No services configured. Click "Add New Service" above to create one.
                  </div>
                ) : (
                  servicesList.map((srv) => (
                    <div
                      key={srv.id}
                      className={`p-5 rounded-2xl border transition space-y-3 ${
                        srv.is_active
                          ? 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                          : 'border-slate-200 bg-slate-50/70 opacity-75'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-slate-900 text-sm">{srv.name}</h4>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
                              #{srv.display_order ?? 1}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                            {srv.description || 'No detailed description provided.'}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                            srv.is_active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {srv.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="pt-2 flex items-baseline justify-between border-t border-slate-100">
                        <div>
                          <span className="text-slate-400 text-[11px] block">Pricing Formula</span>
                          <span className="font-mono font-bold text-slate-700 uppercase text-[11px]">
                            {srv.pricing_unit.replace('_', ' ')}
                            {srv.pricing_unit === 'per_kg' && srv.min_weight_kg > 0 ? ` (Min. ${srv.min_weight_kg}kg)` : ''}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-slate-900 text-lg">
                            ₹{(((srv.unit_price_paise || srv.price_paise || 8000) / 100)).toFixed(0)}
                          </span>
                          <span className="text-xs text-slate-500 font-normal"> / {srv.pricing_unit === 'per_kg' ? 'kg' : srv.pricing_unit.replace('per_', '')}</span>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleToggleServiceStatus(srv)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                            srv.is_active
                              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {srv.is_active ? 'Deactivate' : 'Activate'}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditService(srv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] transition"
                            title="Edit Service Details"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingService(srv);
                              setServiceDeleteError(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-[11px] transition"
                            title="Delete Service"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
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
              <button
                onClick={() => {
                  setIsCreatingManualOrder(false);
                  setManualOrderError(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {manualOrderError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{manualOrderError}</span>
              </div>
            )}
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">Service *</label>
                <select
                  value={selectedManualServiceId}
                  onChange={(e) => setSelectedManualServiceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="">Default Service (Wash & Fold)</option>
                  {servicesList.filter((s) => s.is_active).map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} (₹{(((srv.unit_price_paise || srv.price_paise || 8000) / 100)).toFixed(0)} / {srv.pricing_unit})
                    </option>
                  ))}
                </select>
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
              <button
                onClick={() => {
                  setReviewingFeedback(null);
                  setFeedbackReviewError(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {feedbackReviewError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{feedbackReviewError}</span>
              </div>
            )}

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
          assignmentType={assignmentType}
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
          recordedBy={currentUser?.id}
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
              <button
                onClick={() => {
                  setIsAddingArea(false);
                  setAreaFormError(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {areaFormError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-medium text-[11px]">{areaFormError}</span>
              </div>
            )}

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
                  onClick={() => {
                    setIsAddingArea(false);
                    setAreaFormError(null);
                  }}
                  className="flex-1 py-2.5 px-3 border border-slate-200 rounded-xl font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingArea}
                  className="flex-1 py-2.5 px-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {isSubmittingArea ? 'Saving...' : 'Save Area'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Service Modal */}
      {(isAddingService || editingService) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-black text-sm text-slate-900">
                {editingService ? `Edit Service: ${editingService.name}` : 'Add New Service to Catalogue'}
              </h3>
              <button
                onClick={() => {
                  setIsAddingService(false);
                  setEditingService(null);
                  setServiceFormError(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {serviceFormError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-medium text-[11px]">{serviceFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveService} className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Service Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Premium Steam Ironing"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief description displayed to customers..."
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pricing Unit *</label>
                  <select
                    value={servicePricingUnit}
                    onChange={(e) => setServicePricingUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium"
                  >
                    <option value="per_kg">Per Kilogram (per_kg)</option>
                    <option value="per_piece">Per Piece (per_piece)</option>
                    <option value="per_item">Per Item (per_item)</option>
                    <option value="per_load">Per Load (per_load)</option>
                    <option value="per_order">Per Order (per_order)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rate / Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="80"
                    value={serviceUnitPrice}
                    onChange={(e) => setServiceUnitPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                    required
                  />
                </div>
              </div>

              {servicePricingUnit === 'per_kg' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Minimum Weight (kg)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="3.0"
                    value={serviceMinWeight}
                    onChange={(e) => setServiceMinWeight(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Applied as baseline floor for per-kg billing calculations.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min="1"
                    value={serviceDisplayOrder}
                    onChange={(e) => setServiceDisplayOrder(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={serviceIsActive}
                      onChange={(e) => setServiceIsActive(e.target.checked)}
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4"
                    />
                    <span>Active for Bookings</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingService(false);
                    setEditingService(null);
                    setServiceFormError(null);
                  }}
                  className="flex-1 py-2.5 px-3 border border-slate-200 rounded-xl font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingService}
                  className="flex-1 py-2.5 px-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {isSubmittingService ? 'Saving...' : editingService ? 'Update Service' : 'Add Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Service Confirmation Modal */}
      {deletingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-1.5 text-red-600">
                <AlertCircle className="w-4 h-4" /> Delete Service
              </h3>
              <button
                onClick={() => {
                  setDeletingService(null);
                  setServiceDeleteError(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-slate-700">
                Are you sure you want to delete service <strong className="text-slate-900 font-bold">"{deletingService.name}"</strong>?
              </p>
              <p className="text-slate-500 text-[11px]">
                Note: Services referenced by past or active customer orders cannot be permanently deleted in order to maintain historical billing snapshots and financial records.
              </p>
            </div>

            {serviceDeleteError && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl space-y-2 text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span className="font-medium text-[11px] leading-relaxed">{serviceDeleteError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleDeactivateInstead}
                  className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition shadow-xs"
                >
                  Deactivate Service Instead (Recommended)
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => {
                  setDeletingService(null);
                  setServiceDeleteError(null);
                }}
                className="flex-1 py-2.5 px-3 border border-slate-200 rounded-xl font-bold text-slate-700"
              >
                Cancel
              </button>
              {!serviceDeleteError && (
                <button
                  type="button"
                  onClick={handleDeleteService}
                  disabled={isSubmittingService}
                  className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {isSubmittingService ? 'Checking & Deleting...' : 'Confirm Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
