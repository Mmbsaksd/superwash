import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Order, CustomerAddress, PickupSlot, BusinessSettings, OrderFeedback, LaundryServiceItem, Coupon } from '../../types';
import { LaundryService, DEFAULT_SETTINGS } from '../../services/laundryService';
import { supabase } from '../../services/supabase';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { PaymentModal } from '../../components/PaymentModal';
import { FeedbackModal } from '../../components/FeedbackModal';
import { InvoiceModal } from '../../components/InvoiceModal';
import { PwaInstallPrompt } from '../../components/PwaInstallPrompt';
import { MapLocationPicker } from '../../components/MapLocationPicker';
import { formatCustomerError } from '../../utils/errorHandling';
import {
  getPendingBooking,
  savePendingBooking,
  clearPendingBooking,
  updatePendingBookingStatus,
  calculateBookingFingerprint,
  isAmbiguousNetworkError,
  PendingBookingRecord,
  PendingBookingPayload
} from '../../utils/pendingBooking';
import {
  Calendar, Clock, MapPin, Plus, Phone,
  CheckCircle2, AlertCircle, Sparkles,
  QrCode, ArrowRight, User, Star, MessageSquareHeart,
  ShieldCheck, RefreshCw, LogOut, X, Truck, Scale, Package, Lock,
  AlertTriangle, Loader2, Edit2, Trash2, Navigation,
  TicketPercent, Tag, Printer, FileText
} from 'lucide-react';

const CONFIRMED_ORDER_KEY = 'superwash_last_confirmed_order';

export const CustomerHome: React.FC = () => {
  const { currentUser, needsPhonePrompt, updateProfile, logout, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTabs: Array<'book' | 'current' | 'history' | 'addresses' | 'contact'> = ['book', 'current', 'history', 'addresses', 'contact'];
  const [activeTab, setActiveTab] = useState<'book' | 'current' | 'history' | 'addresses' | 'contact'>(
    tabParam && validTabs.includes(tabParam as any) ? (tabParam as any) : 'book'
  );
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [services, setServices] = useState<LaundryServiceItem[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const selectedServiceId = selectedServiceIds[0] || '';
  const setSelectedServiceId = (id: string) => setSelectedServiceIds([id]);
  const handleToggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) {
        if (prev.length <= 1) return prev; // Keep at least one service selected
        return prev.filter((id) => id !== serviceId);
      } else {
        return [...prev, serviceId];
      }
    });
  };
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, OrderFeedback>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  // Address Refinement during Booking State
  const [isRefiningAddress, setIsRefiningAddress] = useState<boolean>(false);
  const [refinedAddressLine, setRefinedAddressLine] = useState<string>('');
  const [refinedLandmark, setRefinedLandmark] = useState<string>('');
  const [refinedPincode, setRefinedPincode] = useState<string>('560103');
  const [refinedLatitude, setRefinedLatitude] = useState<number | null>(null);
  const [refinedLongitude, setRefinedLongitude] = useState<number | null>(null);
  const [updateSavedAddressBook, setUpdateSavedAddressBook] = useState<boolean>(true);

  // Address Book CRUD State (My Addresses Tab)
  const [addressModalOpen, setAddressModalOpen] = useState<boolean>(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addrLabel, setAddrLabel] = useState<string>('Home');
  const [addrLine, setAddrLine] = useState<string>('');
  const [addrLandmark, setAddrLandmark] = useState<string>('');
  const [addrPincode, setAddrPincode] = useState<string>('560103');
  const [addrLat, setAddrLat] = useState<number | null>(null);
  const [addrLng, setAddrLng] = useState<number | null>(null);
  const [addrIsDefault, setAddrIsDefault] = useState<boolean>(false);
  const [isSavingAddress, setIsSavingAddress] = useState<boolean>(false);
  const [addressActionError, setAddressActionError] = useState<string | null>(null);
  const [addressActionSuccess, setAddressActionSuccess] = useState<string | null>(null);

  const [addressToDelete, setAddressToDelete] = useState<CustomerAddress | null>(null);
  const [addressDeleteError, setAddressDeleteError] = useState<string | null>(null);
  const [isDeletingAddress, setIsDeletingAddress] = useState<boolean>(false);

  // Post-Booking Order Pickup Location Correction State (Track Order Tab)
  const [editingOrderLocation, setEditingOrderLocation] = useState<Order | null>(null);
  const [orderEditAddress, setOrderEditAddress] = useState<string>('');
  const [orderEditLandmark, setOrderEditLandmark] = useState<string>('');
  const [orderEditPincode, setOrderEditPincode] = useState<string>('');
  const [orderEditLat, setOrderEditLat] = useState<number | null>(null);
  const [orderEditLng, setOrderEditLng] = useState<number | null>(null);
  const [isSavingOrderLocation, setIsSavingOrderLocation] = useState<boolean>(false);
  const [orderLocationError, setOrderLocationError] = useState<string | null>(null);
  const [orderLocationSuccess, setOrderLocationSuccess] = useState<string | null>(null);

  // Interactive Map Location Picker State
  const [mapPickerState, setMapPickerState] = useState<{
    isOpen: boolean;
    target: 'booking_new' | 'booking_refine' | 'address_modal' | 'order_edit' | null;
    initialLat: number | null;
    initialLng: number | null;
    addressContext: string;
    title: string;
  }>({
    isOpen: false,
    target: null,
    initialLat: null,
    initialLng: null,
    addressContext: '',
    title: 'Adjust Pickup Location Pin'
  });

  // Booking Form State
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [isEnteringNewAddress, setIsEnteringNewAddress] = useState<boolean>(false);
  const [newAddressLine, setNewAddressLine] = useState<string>('');
  const [newLandmark, setNewLandmark] = useState<string>('');
  const [newPincode, setNewPincode] = useState<string>('560103');
  const [newLatitude, setNewLatitude] = useState<number | null>(null);
  const [newLongitude, setNewLongitude] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationFeedback, setLocationFeedback] = useState<{
    type: 'loading' | 'success' | 'permission_denied' | 'timeout' | 'error';
    message: string;
  } | null>(null);

  const [pickupDate, setPickupDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedSlotName, setSelectedSlotName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>(currentUser?.phone || '');
  const [customerName, setCustomerName] = useState<string>(currentUser?.full_name || 'Customer');
  
  const [isBookingSubmitting, setIsBookingSubmitting] = useState<boolean>(false);
  const [bookingSuccessOrder, setBookingSuccessOrder] = useState<Order | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Coupon Discount State
  const [couponCodeInput, setCouponCodeInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    discount_paise: number;
    min_order_paise?: number;
    max_discount_paise?: number | null;
    description?: string;
  } | null>(null);
  const [availablePromotions, setAvailablePromotions] = useState<Coupon[]>([]);
  const [couponValidationLoading, setCouponValidationLoading] = useState<boolean>(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccessMessage, setCouponSuccessMessage] = useState<string | null>(null);

  // Pending Booking Recovery State
  const [pendingRecovery, setPendingRecovery] = useState<PendingBookingRecord | null>(null);
  const [isResolvingPending, setIsResolvingPending] = useState<boolean>(false);
  const [statusCheckOutcome, setStatusCheckOutcome] = useState<'not_found' | null>(null);

  // Client submission request ID for safe idempotency & timeout retries
  const [submissionId, setSubmissionId] = useState<string>(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // Restore pending uncertain booking from sessionStorage across refreshes on mount
  useEffect(() => {
    if (!currentUser) {
      setPendingRecovery(null);
      return;
    }

    const pending = getPendingBooking(currentUser.id);
    if (pending) {
      setPendingRecovery(pending);
      setSubmissionId(pending.clientSubmissionId);
      if (pending.payload.pickup_date) setPickupDate(pending.payload.pickup_date);
      if (pending.payload.pickup_slot) setSelectedSlotName(pending.payload.pickup_slot);
      if (pending.payload.service_id) setSelectedServiceId(pending.payload.service_id);
    }
  }, [currentUser]);

  // Renew submission ID whenever booking parameters change so each distinct booking request gets a unique ID
  useEffect(() => {
    // If an uncertain booking is pending resolution, NEVER silently wipe it on form changes!
    if (pendingRecovery) {
      if (pendingRecovery.status === 'uncertain_timeout') {
        return;
      }

      const currentFingerprint = calculateBookingFingerprint({
        customer_phone: customerPhone || currentUser?.phone || '',
        pickup_address: isEnteringNewAddress
          ? newAddressLine
          : (addresses.find((a) => a.id === selectedAddressId)?.address_line || ''),
        pickup_pincode: isEnteringNewAddress
          ? newPincode
          : (addresses.find((a) => a.id === selectedAddressId)?.pincode || ''),
        pickup_date: pickupDate,
        pickup_slot: selectedSlotName,
        service_id: selectedServiceId
      });

      if (currentFingerprint !== pendingRecovery.fingerprint) {
        // Only discard if status is strictly in_flight and was uncompleted
        clearPendingBooking(currentUser?.id);
        setPendingRecovery(null);
        setSubmissionId(
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        );
      }
    } else {
      setSubmissionId(
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      );
    }
  }, [selectedServiceId, selectedSlotName, pickupDate, selectedAddressId, newAddressLine, newPincode, pendingRecovery, customerPhone, currentUser]);

  // Onboarding Modal State (Prompt for phone and initial address if missing after Google sign-in)
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState<boolean>(false);
  const [onboardPhone, setOnboardPhone] = useState<string>('');
  const [onboardName, setOnboardName] = useState<string>('');
  const [onboardAddress, setOnboardAddress] = useState<string>('');
  const [onboardLandmark, setOnboardLandmark] = useState<string>('');
  const [onboardPincode, setOnboardPincode] = useState<string>('560103');
  const [onboardLatitude, setOnboardLatitude] = useState<number | null>(null);
  const [onboardLongitude, setOnboardLongitude] = useState<number | null>(null);
  const [isOnboardLocating, setIsOnboardLocating] = useState<boolean>(false);
  const [onboardLocationFeedback, setOnboardLocationFeedback] = useState<string | null>(null);
  const [isOnboardingSaving, setIsOnboardingSaving] = useState<boolean>(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  // Modals
  const [selectedPaymentOrder, setSelectedPaymentOrder] = useState<Order | null>(null);
  const [selectedFeedbackOrder, setSelectedFeedbackOrder] = useState<Order | null>(null);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);

  const handleTabChange = (tab: 'book' | 'current' | 'history' | 'addresses' | 'contact') => {
    if (tab === 'book') {
      setSubmissionId(
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      );
    }
    setActiveTab(tab);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', tab);
        return p;
      },
      { replace: true }
    );
  };

  const handleDismissConfirmation = () => {
    setBookingSuccessOrder(null);
    try {
      sessionStorage.removeItem(CONFIRMED_ORDER_KEY);
    } catch {}
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('confirmed');
        return p;
      },
      { replace: true }
    );
  };

  // FIX 2: Restore confirmed booking state ONLY on explicit ?confirmed=... URL and valid ownership
  useEffect(() => {
    // Wait until auth state finishes hydrating before checking ownership
    if (isAuthLoading) {
      return;
    }

    const confirmedParam = searchParams.get('confirmed');
    // Never resurrect an old confirmation on a clean /customer visit without an explicit query parameter
    if (!confirmedParam) {
      return;
    }

    if (!bookingSuccessOrder) {
      try {
        const stored = sessionStorage.getItem(CONFIRMED_ORDER_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const isRecent = parsed && typeof parsed.timestamp === 'number' && Date.now() - parsed.timestamp < 86400000;
          const isOrderMatch = parsed && parsed.order_number === confirmedParam;

          // Verify ownership: order must belong to the currently authenticated customer
          const isOwner = currentUser && (
            (parsed.customer_id && parsed.customer_id === currentUser.id) ||
            (currentUser.phone && parsed.customer_phone && parsed.customer_phone.replace(/[^0-9]/g, '') === currentUser.phone.replace(/[^0-9]/g, ''))
          );

          if (isOrderMatch && isRecent && isOwner) {
            setBookingSuccessOrder(parsed as Order);
            if (!tabParam) {
              setActiveTab('current');
            }
          } else {
            // Mismatched, expired, or belongs to another user: clear invalid stored data
            sessionStorage.removeItem(CONFIRMED_ORDER_KEY);
          }
        }
      } catch {
        sessionStorage.removeItem(CONFIRMED_ORDER_KEY);
      }
    }
  }, [searchParams, bookingSuccessOrder, tabParam, currentUser, isAuthLoading]);

  // Keep bookingSuccessOrder in sync with loaded database orders (with ownership verification)
  useEffect(() => {
    if (isAuthLoading) return;
    const confirmedParam = searchParams.get('confirmed');
    if (confirmedParam && orders.length > 0) {
      const matched = orders.find((o) => o.order_number === confirmedParam);
      if (matched) {
        const isOwner = currentUser && (
          matched.customer_id === currentUser.id ||
          (currentUser.phone && matched.customer_phone && matched.customer_phone.replace(/[^0-9]/g, '') === currentUser.phone.replace(/[^0-9]/g, ''))
        );
        if (isOwner) {
          setBookingSuccessOrder(matched);
        }
      }
    }
  }, [orders, searchParams, currentUser, isAuthLoading]);

  // FIX 2: Clear stored confirmation on logout or account switch
  useEffect(() => {
    if (isAuthLoading) return;
    if (bookingSuccessOrder) {
      if (!currentUser) {
        setBookingSuccessOrder(null);
        try { sessionStorage.removeItem(CONFIRMED_ORDER_KEY); } catch {}
      } else {
        const isOwner =
          (bookingSuccessOrder.customer_id && bookingSuccessOrder.customer_id === currentUser.id) ||
          (currentUser.phone && bookingSuccessOrder.customer_phone && bookingSuccessOrder.customer_phone.replace(/[^0-9]/g, '') === currentUser.phone.replace(/[^0-9]/g, ''));
        if (!isOwner) {
          setBookingSuccessOrder(null);
          try { sessionStorage.removeItem(CONFIRMED_ORDER_KEY); } catch {}
        }
      }
    }
  }, [currentUser, bookingSuccessOrder, isAuthLoading]);

  useEffect(() => {
    if (currentUser) {
      setCustomerPhone(currentUser.phone || '');
      setCustomerName(currentUser.full_name || 'Customer');
      if (currentUser.role === 'customer' && (!currentUser.phone || currentUser.phone.trim().length < 10)) {
        setIsOnboardingModalOpen(true);
        setOnboardName(currentUser.full_name || 'Customer');
      }
    }
    loadData();

    // Auto-refresh when customer returns to the tab
    const handleFocus = () => {
      loadData();
    };
    window.addEventListener('focus', handleFocus);

    // Live Realtime updates for customer tracking timeline
    const channel = supabase
      .channel('customer-orders-realtime')
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

  const handleGetOnboardLocation = () => {
    if (!navigator.geolocation) {
      setOnboardLocationFeedback('Geolocation is not supported by your browser.');
      return;
    }
    setIsOnboardLocating(true);
    setOnboardLocationFeedback('Acquiring device GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
          setOnboardLatitude(lat);
          setOnboardLongitude(lng);
          setOnboardLocationFeedback('GPS location attached!');
        } else {
          setOnboardLocationFeedback('Invalid location received from device.');
        }
        setIsOnboardLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setIsOnboardLocating(false);
        if (err.code === 1) {
          setOnboardLocationFeedback('Location permission denied. Enter address manually.');
        } else if (err.code === 3) {
          setOnboardLocationFeedback('Location request timed out. Enter address manually.');
        } else {
          setOnboardLocationFeedback('Could not determine GPS position.');
        }
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handleSaveOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingError(null);
    const clean = onboardPhone.replace(/[^0-9]/g, '').slice(-10);
    if (clean.length < 10) {
      setOnboardingError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setIsOnboardingSaving(true);
    try {
      const res = await updateProfile({
        phone: clean,
        full_name: onboardName.trim() || currentUser?.full_name
      });
      if (!res.success) {
        setOnboardingError(res.message);
        setIsOnboardingSaving(false);
        return;
      }

      // If address provided and user has no addresses, save it
      if (onboardAddress.trim() && currentUser) {
        const savedAddr = await LaundryService.saveCustomerAddress({
          user_id: currentUser.id,
          label: 'Home',
          address_line: onboardAddress.trim(),
          landmark: onboardLandmark.trim() || undefined,
          pincode: onboardPincode.trim(),
          is_default: true,
          latitude: onboardLatitude,
          longitude: onboardLongitude
        });
        setAddresses([savedAddr]);
        setSelectedAddressId(savedAddr.id);
        setIsEnteringNewAddress(false);
      }

      setIsOnboardingModalOpen(false);
      setCustomerPhone(clean);
      setCustomerName(onboardName.trim() || customerName);
    } catch (err: any) {
      setOnboardingError(formatCustomerError(err, 'Error saving profile. Please verify your details and try again.'));
    } finally {
      setIsOnboardingSaving(false);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationFeedback({
        type: 'error',
        message: 'Geolocation is not supported by your browser. Please enter address manually.'
      });
      return;
    }
    setIsLocating(true);
    setLocationFeedback({
      type: 'loading',
      message: 'Requesting device GPS position...'
    });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
          setNewLatitude(lat);
          setNewLongitude(lng);
          setLocationFeedback({
            type: 'success',
            message: 'GPS location attached! Delivery associates will navigate directly to your coordinates.'
          });
        } else {
          setLocationFeedback({
            type: 'error',
            message: 'Invalid coordinates received from device. Please enter address manually.'
          });
        }
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setIsLocating(false);
        if (err.code === 1) { // PERMISSION_DENIED
          setLocationFeedback({
            type: 'permission_denied',
            message: 'Location permission was denied. You can continue by entering your address manually.'
          });
        } else if (err.code === 3) { // TIMEOUT
          setLocationFeedback({
            type: 'timeout',
            message: 'GPS location request timed out. Please enter your address manually.'
          });
        } else {
          setLocationFeedback({
            type: 'error',
            message: 'Could not determine GPS position. Please enter your address manually.'
          });
        }
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handleClearLocation = () => {
    setNewLatitude(null);
    setNewLongitude(null);
    setLocationFeedback(null);
  };

  // Map Pin Confirmation Handler
  const handleMapPinConfirmed = (coords: { latitude: number; longitude: number }) => {
    if (mapPickerState.target === 'booking_new') {
      setNewLatitude(coords.latitude);
      setNewLongitude(coords.longitude);
      setLocationFeedback({
        type: 'success',
        message: `Doorstep pin confirmed on map (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`
      });
    } else if (mapPickerState.target === 'booking_refine') {
      setRefinedLatitude(coords.latitude);
      setRefinedLongitude(coords.longitude);
    } else if (mapPickerState.target === 'address_modal') {
      setAddrLat(coords.latitude);
      setAddrLng(coords.longitude);
    } else if (mapPickerState.target === 'order_edit') {
      setOrderEditLat(coords.latitude);
      setOrderEditLng(coords.longitude);
    }
    setMapPickerState((prev) => ({ ...prev, isOpen: false, target: null }));
  };

  // Address Selection & Pre-population for Refinement
  const handleSelectSavedAddress = (addr: CustomerAddress) => {
    setSelectedAddressId(addr.id);
    setRefinedAddressLine(addr.address_line);
    setRefinedLandmark(addr.landmark || '');
    setRefinedPincode(addr.pincode);
    setRefinedLatitude(addr.latitude ?? null);
    setRefinedLongitude(addr.longitude ?? null);
    setIsRefiningAddress(false);
  };

  // Address CRUD Handlers (My Addresses Tab)
  const handleOpenAddAddress = () => {
    setEditingAddressId(null);
    setAddrLabel('Home');
    setAddrLine('');
    setAddrLandmark('');
    setAddrPincode('560103');
    setAddrLat(null);
    setAddrLng(null);
    setAddrIsDefault(addresses.length === 0);
    setAddressActionError(null);
    setAddressActionSuccess(null);
    setAddressModalOpen(true);
  };

  const handleOpenEditAddress = (addr: CustomerAddress) => {
    setEditingAddressId(addr.id);
    setAddrLabel(addr.label);
    setAddrLine(addr.address_line);
    setAddrLandmark(addr.landmark || '');
    setAddrPincode(addr.pincode);
    setAddrLat(addr.latitude ?? null);
    setAddrLng(addr.longitude ?? null);
    setAddrIsDefault(addr.is_default);
    setAddressActionError(null);
    setAddressActionSuccess(null);
    setAddressModalOpen(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setAddressActionError(null);

    const trimmedLine = addrLine.trim();
    const trimmedPin = addrPincode.trim();
    if (!trimmedLine) {
      setAddressActionError('Please enter a valid address line.');
      return;
    }
    if (!trimmedPin) {
      setAddressActionError('Please enter a valid PIN code.');
      return;
    }

    setIsSavingAddress(true);
    try {
      if (editingAddressId) {
        const updated = await LaundryService.updateCustomerAddress(editingAddressId, {
          label: addrLabel,
          address_line: trimmedLine,
          landmark: addrLandmark.trim() || undefined,
          pincode: trimmedPin,
          latitude: addrLat,
          longitude: addrLng,
          is_default: addrIsDefault,
          user_id: currentUser.id
        });
        setAddresses((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        if (selectedAddressId === updated.id) {
          setRefinedAddressLine(updated.address_line);
          setRefinedLandmark(updated.landmark || '');
          setRefinedPincode(updated.pincode);
          setRefinedLatitude(updated.latitude ?? null);
          setRefinedLongitude(updated.longitude ?? null);
        }
        setAddressActionSuccess('Address updated successfully.');
      } else {
        const saved = await LaundryService.saveCustomerAddress({
          user_id: currentUser.id,
          label: addrLabel,
          address_line: trimmedLine,
          landmark: addrLandmark.trim() || undefined,
          pincode: trimmedPin,
          latitude: addrLat,
          longitude: addrLng,
          is_default: addrIsDefault
        });
        setAddresses((prev) => {
          const exists = prev.some((a) => a.id === saved.id);
          return exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [...prev, saved];
        });
        setSelectedAddressId(saved.id);
        setRefinedAddressLine(saved.address_line);
        setRefinedLandmark(saved.landmark || '');
        setRefinedPincode(saved.pincode);
        setRefinedLatitude(saved.latitude ?? null);
        setRefinedLongitude(saved.longitude ?? null);
        setAddressActionSuccess('Address saved successfully.');
      }
      setTimeout(() => {
        setAddressModalOpen(false);
        setAddressActionSuccess(null);
      }, 700);
    } catch (err: any) {
      setAddressActionError(formatCustomerError(err) || 'Failed to save address.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleConfirmDeleteAddress = async () => {
    if (!addressToDelete || !currentUser) return;
    setIsDeletingAddress(true);
    setAddressDeleteError(null);
    try {
      await LaundryService.deleteCustomerAddress(addressToDelete.id, currentUser.id);
      setAddresses((prev) => {
        const remaining = prev.filter((a) => a.id !== addressToDelete.id);
        if (selectedAddressId === addressToDelete.id) {
          if (remaining.length > 0) {
            setSelectedAddressId(remaining[0].id);
            setRefinedAddressLine(remaining[0].address_line);
            setRefinedLandmark(remaining[0].landmark || '');
            setRefinedPincode(remaining[0].pincode);
            setRefinedLatitude(remaining[0].latitude ?? null);
            setRefinedLongitude(remaining[0].longitude ?? null);
          } else {
            setSelectedAddressId('');
            setIsEnteringNewAddress(true);
          }
        }
        return remaining;
      });
      setAddressToDelete(null);
    } catch (err: any) {
      setAddressDeleteError(formatCustomerError(err) || 'Failed to delete address.');
    } finally {
      setIsDeletingAddress(false);
    }
  };

  // Order Pickup Location Correction Handlers
  const handleOpenOrderLocationEdit = (order: Order) => {
    setEditingOrderLocation(order);
    setOrderEditAddress(order.pickup_address || '');
    setOrderEditLandmark(order.pickup_landmark || '');
    setOrderEditPincode(order.pickup_pincode || '560038');
    setOrderEditLat(order.pickup_latitude ?? null);
    setOrderEditLng(order.pickup_longitude ?? null);
    setOrderLocationError(null);
    setOrderLocationSuccess(null);
  };

  const handleSaveOrderLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrderLocation) return;
    setOrderLocationError(null);

    const trimmedAddress = orderEditAddress.trim();
    const trimmedPin = orderEditPincode.trim();
    if (!trimmedAddress) {
      setOrderLocationError('Please enter a valid pickup address.');
      return;
    }
    if (!trimmedPin) {
      setOrderLocationError('Please enter a valid PIN code.');
      return;
    }

    setIsSavingOrderLocation(true);
    try {
      const updatedOrder = await LaundryService.updateOrderPickupLocation(editingOrderLocation.id, {
        pickup_address: trimmedAddress,
        pickup_landmark: orderEditLandmark.trim() || undefined,
        pickup_pincode: trimmedPin,
        pickup_latitude: orderEditLat,
        pickup_longitude: orderEditLng
      });
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
      setOrderLocationSuccess('Pickup location updated successfully.');
      setTimeout(() => {
        setEditingOrderLocation(null);
        setOrderLocationSuccess(null);
      }, 700);
    } catch (err: any) {
      setOrderLocationError(formatCustomerError(err) || 'Could not update pickup location.');
    } finally {
      setIsSavingOrderLocation(false);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    setDataLoadError(null);
    try {
      const [s, sl, ords, srv, activeCoupons] = await Promise.all([
        LaundryService.getSettings(),
        LaundryService.getPickupSlots(),
        currentUser ? LaundryService.getCustomerOrders(currentUser.id, currentUser.phone) : [],
        LaundryService.getServices(false),
        LaundryService.getCoupons(false)
      ]);
      setSettings(s);
      setServices(srv || []);
      setAvailablePromotions(activeCoupons || []);
      if (srv && srv.length > 0) {
        setSelectedServiceIds((prev) => (prev.length > 0 ? prev : [srv[0].id]));
      }
      const activeSlots = sl && sl.length > 0 ? sl.filter((x) => x.is_active) : [];
      setSlots(activeSlots);
      if (activeSlots.length > 0) {
        setSelectedSlotName((prev) => prev || activeSlots[0].name);
      } else {
        setSelectedSlotName('Morning (08:00 AM - 11:00 AM)');
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
          setRefinedAddressLine(def.address_line);
          setRefinedLandmark(def.landmark || '');
          setRefinedPincode(def.pincode);
          setRefinedLatitude(def.latitude ?? null);
          setRefinedLongitude(def.longitude ?? null);
        } else {
          setIsEnteringNewAddress(true);
        }

        const map: Record<string, OrderFeedback> = {};
        userFeedbacks.forEach(f => { map[f.order_id] = f; });
        setFeedbackMap(map);
      }
    } catch (err: any) {
      console.error('Error loading customer data:', err);
      setDataLoadError(formatCustomerError(err) || 'Unable to load your laundry details. Please check your network and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError(null);

    // FIX 3: Unauthenticated booking guard - explain requirement and redirect preserving return destination
    if (!currentUser) {
      setBookingError('Sign-in required: Please sign in with your account to confirm your pickup booking.');
      navigate('/login?redirect=/customer');
      return;
    }

    // Guard against creating a duplicate booking while an uncertain submission is unresolved
    if (pendingRecovery?.status === 'uncertain_timeout') {
      setBookingError(
        'You have an unconfirmed booking attempt pending verification. Please click "Verify & Complete Booking" in the banner above before creating a new booking.'
      );
      return;
    }

    let addressLine = '';
    let landmark = '';
    let pincode = '';
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (isEnteringNewAddress || addresses.length === 0) {
      if (!newAddressLine.trim()) {
        setBookingError('Please enter your complete pickup address');
        return;
      }
      addressLine = newAddressLine.trim();
      landmark = newLandmark.trim();
      pincode = newPincode.trim() || '560001';
      latitude = newLatitude;
      longitude = newLongitude;

      if (currentUser) {
        try {
          const savedAddr = await LaundryService.saveCustomerAddress({
            user_id: currentUser.id,
            label: 'Home',
            address_line: addressLine,
            landmark,
            pincode,
            latitude,
            longitude,
            is_default: addresses.length === 0
          });
          setAddresses((prev) => {
            const exists = prev.some((a) => a.id === savedAddr.id);
            return exists ? prev.map((a) => (a.id === savedAddr.id ? savedAddr : a)) : [...prev, savedAddr];
          });
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

      if (isRefiningAddress) {
        if (!refinedAddressLine.trim()) {
          setBookingError('Please enter the refined pickup address');
          return;
        }
        addressLine = refinedAddressLine.trim();
        landmark = refinedLandmark.trim();
        pincode = refinedPincode.trim() || chosen.pincode;
        latitude = refinedLatitude ?? chosen.latitude ?? null;
        longitude = refinedLongitude ?? chosen.longitude ?? null;

        if (updateSavedAddressBook && currentUser) {
          try {
            const updatedAddr = await LaundryService.updateCustomerAddress(chosen.id, {
              address_line: addressLine,
              landmark,
              pincode,
              latitude,
              longitude,
              user_id: currentUser.id
            });
            setAddresses((prev) => prev.map((a) => (a.id === updatedAddr.id ? updatedAddr : a)));
          } catch (e) {
            console.warn('Could not update saved address book:', e);
          }
        }
      } else {
        addressLine = chosen.address_line;
        landmark = chosen.landmark || '';
        pincode = chosen.pincode;
        latitude = chosen.latitude || null;
        longitude = chosen.longitude || null;
      }
    }

    if (!selectedSlotName) {
      setBookingError('Please choose an available pickup time slot');
      return;
    }

    const activeSelected = services.filter((s) => selectedServiceIds.includes(s.id));
    const finalSelectedServices = activeSelected.length > 0 ? activeSelected : (services.length > 0 ? [services[0]] : []);
    const isMultiService = finalSelectedServices.length > 1;
    const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}`;

    const basePayloadData = {
      customer_name: customerName,
      customer_phone: customerPhone || currentUser?.phone || '9876543212',
      pickup_address: addressLine,
      pickup_landmark: landmark,
      pickup_pincode: pincode,
      pickup_date: pickupDate,
      pickup_slot: selectedSlotName,
      pickup_latitude: latitude,
      pickup_longitude: longitude
    };

    // 1. Persist pending record in sessionStorage with status 'in_flight' BEFORE sending network request
    if (currentUser?.id) {
      savePendingBooking(currentUser.id, submissionId, {
        ...basePayloadData,
        service_id: finalSelectedServices[0]?.id,
        notes: isMultiService ? `[Linked Batch ${batchId}: Multi-Service Booking (${finalSelectedServices.length} items)]` : undefined,
        coupon_code: appliedCoupon ? appliedCoupon.code : undefined,
        discount_paise: appliedCoupon ? appliedCoupon.discount_paise : 0
      }, 'in_flight');
    }

    setIsBookingSubmitting(true);

    try {
      const createdOrders: Order[] = [];
      for (let i = 0; i < finalSelectedServices.length; i++) {
        const srv = finalSelectedServices[i];
        const isFirst = i === 0;
        const currentSubId = isFirst ? submissionId : `${submissionId}_${i}`;
        const batchNote = isMultiService
          ? `[Linked Batch ${batchId}: ${srv.name} (${i + 1}/${finalSelectedServices.length})]`
          : undefined;

        // Apply coupon to first service order in linked batch
        const couponToApply = isFirst && appliedCoupon;

        const order = await LaundryService.createOrder({
          customer_id: currentUser?.id,
          ...basePayloadData,
          service_id: srv.id,
          notes: batchNote,
          coupon_code: couponToApply ? appliedCoupon?.code : undefined,
          discount_paise: couponToApply ? appliedCoupon?.discount_paise : 0,
          coupon_snapshot: couponToApply && appliedCoupon ? {
            code: appliedCoupon.code,
            discount_type: appliedCoupon.discount_type,
            discount_value: appliedCoupon.discount_value,
            min_order_paise: appliedCoupon.min_order_paise,
            max_discount_paise: appliedCoupon.max_discount_paise
          } : null,
          client_submission_id: currentSubId
        });
        createdOrders.push(order);
      }

      // Request succeeded: clear pending record immediately
      if (currentUser?.id) {
        clearPendingBooking(currentUser.id);
      }
      setPendingRecovery(null);

      // Renew submission ID for any subsequent separate booking
      setSubmissionId(
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      );

      const primaryOrder = createdOrders[0];
      setBookingSuccessOrder(primaryOrder);
      try {
        sessionStorage.setItem(CONFIRMED_ORDER_KEY, JSON.stringify({
          ...primaryOrder,
          timestamp: Date.now()
        }));
      } catch {}

      setOrders((prev) => {
        const newIds = new Set(createdOrders.map((o) => o.id));
        const filtered = prev.filter((o) => !newIds.has(o.id));
        return [...createdOrders, ...filtered];
      });
      setBookingError(null);
      handleTabChange('current');
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('tab', 'current');
          p.set('confirmed', primaryOrder.order_number);
          return p;
        },
        { replace: true }
      );
    } catch (err: any) {
      if (isAmbiguousNetworkError(err)) {
        // Retain pending record with 'uncertain_timeout' status
        const updated = updatePendingBookingStatus('uncertain_timeout');
        if (updated) {
          setPendingRecovery(updated);
        }
        setBookingError(
          'Network connection timed out. Your request may have reached our server. Please click "Verify & Complete Booking" to resolve your order without creating a duplicate.'
        );
      } else if (err?.code === 'BOOKING_SERVICE_UNAVAILABLE' || err?.code === 'SCHEMA_OR_SERVICE_UNAVAILABLE') {
        // Database migration missing or service undergoing upgrades: PRESERVE pending record!
        const updated = updatePendingBookingStatus('uncertain_timeout');
        if (updated) {
          setPendingRecovery(updated);
        }
        setBookingError(
          'The booking service is temporarily undergoing upgrades. Your pending booking is safely preserved. Please retry once the service is available.'
        );
      } else {
        // Definitive validation rejection: safe to clear pending record
        if (currentUser?.id) {
          clearPendingBooking(currentUser.id);
        }
        setPendingRecovery(null);
        setBookingError(formatCustomerError(err, 'Failed to create booking. Please try again.'));
      }
    } finally {
      setIsBookingSubmitting(false);
    }
  };

  const handleResolvePendingBooking = async () => {
    if (!currentUser || !pendingRecovery) return;

    setIsResolvingPending(true);
    setBookingError(null);

    try {
      // 1. Safe status check: Query if order was already committed under this submission ID
      const existingOrder = await LaundryService.getOrderBySubmissionId(
        pendingRecovery.clientSubmissionId,
        currentUser.id
      );

      if (existingOrder) {
        clearPendingBooking(currentUser.id);
        setPendingRecovery(null);
        setStatusCheckOutcome(null);

        setSubmissionId(
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        );

        setBookingSuccessOrder(existingOrder);
        try {
          sessionStorage.setItem(
            CONFIRMED_ORDER_KEY,
            JSON.stringify({
              ...existingOrder,
              timestamp: Date.now()
            })
          );
        } catch {}

        setOrders((prev) => {
          const exists = prev.some((o) => o.id === existingOrder.id);
          return exists ? prev : [existingOrder, ...prev];
        });
        handleTabChange('current');
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set('tab', 'current');
            p.set('confirmed', existingOrder.order_number);
            return p;
          },
          { replace: true }
        );
        return;
      }

      // 2. If no order exists in database, update status check outcome
      setStatusCheckOutcome('not_found');
      setBookingError(
        'Verified: No order was created for this previous attempt. You can now complete the booking or start fresh.'
      );
    } catch (err: any) {
      if (err?.code === 'SCHEMA_OR_SERVICE_UNAVAILABLE' || err?.code === 'BOOKING_SERVICE_UNAVAILABLE') {
        setBookingError(
          'The booking verification service is temporarily unavailable while database upgrades are pending. Your pending booking is safely preserved. Please try checking again in a few moments.'
        );
      } else if (isAmbiguousNetworkError(err)) {
        setBookingError(
          'Network is still unresponsive. We are keeping your pending booking record safe. Please check your connection and retry.'
        );
      } else {
        setBookingError(
          formatCustomerError(err, 'Unable to check booking status. Please check your connection and try again.')
        );
      }
    } finally {
      setIsResolvingPending(false);
    }
  };

  const handleCompleteUncommittedBooking = async () => {
    if (!currentUser || !pendingRecovery) return;

    setIsResolvingPending(true);
    setBookingError(null);

    try {
      const order = await LaundryService.createOrder({
        customer_id: currentUser.id,
        ...pendingRecovery.payload,
        client_submission_id: pendingRecovery.clientSubmissionId
      });

      clearPendingBooking(currentUser.id);
      setPendingRecovery(null);
      setStatusCheckOutcome(null);

      setSubmissionId(
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      );

      setBookingSuccessOrder(order);
      try {
        sessionStorage.setItem(
          CONFIRMED_ORDER_KEY,
          JSON.stringify({
            ...order,
            timestamp: Date.now()
          })
        );
      } catch {}

      setOrders((prev) => {
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev : [order, ...prev];
      });
      handleTabChange('current');
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('tab', 'current');
          p.set('confirmed', order.order_number);
          return p;
        },
        { replace: true }
      );
    } catch (err: any) {
      if (isAmbiguousNetworkError(err)) {
        setBookingError(
          'Network is still unresponsive. We are keeping your pending booking record safe. Please check your connection and retry.'
        );
      } else if (err?.code === 'BOOKING_SERVICE_UNAVAILABLE' || err?.code === 'SCHEMA_OR_SERVICE_UNAVAILABLE') {
        setBookingError(
          'The booking service is temporarily unavailable while database upgrades are pending. Your pending booking is safely preserved. Please try again in a few moments.'
        );
      } else {
        clearPendingBooking(currentUser.id);
        setPendingRecovery(null);
        setStatusCheckOutcome(null);
        setBookingError(
          formatCustomerError(err, 'Unable to confirm pending booking. Please adjust your details and try again.')
        );
      }
    } finally {
      setIsResolvingPending(false);
    }
  };

  const handleDiscardPendingBooking = (force = false) => {
    if (!force && statusCheckOutcome !== 'not_found') {
      const confirmed = window.confirm(
        'Warning: Your previous booking attempt may have already been recorded on the server. If an order was created, discarding this notice will not cancel the pickup. Are you sure you want to discard this check and start a new booking?'
      );
      if (!confirmed) return;
    }
    clearPendingBooking(currentUser?.id);
    setPendingRecovery(null);
    setStatusCheckOutcome(null);
    setSubmissionId(
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    );
  };

  const currentActiveOrder =
    (bookingSuccessOrder ? orders.find((o) => o.id === bookingSuccessOrder.id || o.order_number === bookingSuccessOrder.order_number) : null) ||
    orders.find((o) => o.order_status !== 'delivered' && o.order_status !== 'cancelled') ||
    orders[0] ||
    bookingSuccessOrder;
  const activeSelectedServices = services.filter((s) => selectedServiceIds.includes(s.id));
  const selectedService = activeSelectedServices[0] || services[0];
  const isMultiService = activeSelectedServices.length > 1;

  const effectiveUnitPricePaise = selectedService
    ? (selectedService.unit_price_paise || selectedService.price_paise || (settings?.price_per_kg_paise ?? 7900))
    : (settings?.price_per_kg_paise ?? 7900);
  const serviceRateStr = (effectiveUnitPricePaise / 100).toFixed(0);
  const serviceUnitLabel = selectedService
    ? (selectedService.pricing_unit === 'per_kg' ? 'kilogram' : selectedService.pricing_unit.replace('per_', ''))
    : 'kilogram';
  const effectiveMinWeight = selectedService && selectedService.pricing_unit === 'per_kg'
    ? (selectedService.min_weight_kg ?? (settings?.min_weight_kg ?? 1.0))
    : 0;

  // Combined estimated subtotal across all selected services
  const combinedEstimatedSubtotalPaise = (activeSelectedServices.length > 0 ? activeSelectedServices : [selectedService]).reduce((acc, s) => {
    if (!s) return acc;
    const price = s.unit_price_paise || s.price_paise || (settings?.price_per_kg_paise ?? 7900);
    const minQty = s.pricing_unit === 'per_kg' ? (s.min_weight_kg ?? (settings?.min_weight_kg ?? 1.0)) : 1;
    return acc + Math.round(price * (minQty > 0 ? minQty : 1));
  }, 0);

  const minBill = ((combinedEstimatedSubtotalPaise) / 100).toFixed(0);
  const pricePerKg = serviceRateStr;
  const minWeight = effectiveMinWeight.toString();

  const handleApplyCoupon = async (codeOverride?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = (codeOverride || couponCodeInput).trim().toUpperCase();
    if (!code) {
      setCouponError('Please enter a coupon code.');
      return;
    }
    setCouponValidationLoading(true);
    setCouponError(null);
    setCouponSuccessMessage(null);

    try {
      const valResult = await LaundryService.validateCoupon(
        code,
        customerPhone || currentUser?.phone || '',
        combinedEstimatedSubtotalPaise,
        activeSelectedServices.length === 1 ? selectedService?.id : undefined
      );

      if (!valResult.valid) {
        setCouponError(valResult.reason || 'Invalid or inapplicable coupon code.');
        setAppliedCoupon(null);
        return;
      }

      setAppliedCoupon({
        code: valResult.code,
        discount_type: valResult.discount_type || 'fixed',
        discount_value: valResult.discount_value || 0,
        discount_paise: valResult.discount_paise,
        min_order_paise: valResult.min_order_paise,
        description: valResult.reason
      });
      setCouponCodeInput(valResult.code);
      setCouponSuccessMessage(`Coupon "${valResult.code}" attached! Estimated discount of up to ₹${(valResult.discount_paise / 100).toFixed(0)} (pending final scale weight verification at store intake).`);
    } catch (err: any) {
      setCouponError(err.message || 'Failed to validate coupon');
      setAppliedCoupon(null);
    } finally {
      setCouponValidationLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponSuccessMessage(null);
    setCouponError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24">
      {/* PWA Installation Banner */}
      <PwaInstallPrompt variant="customer-banner" />

      {/* Top Customer Brand Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 group hover:opacity-90 transition cursor-pointer"
            title="SuperWash Exprez Home"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-500 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-black text-slate-900 text-lg leading-tight">SuperWash Exprez</h1>
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                Customer Laundry Hub • Bengaluru
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <>
                <div className="text-right hidden sm:block">
                  <span className="block text-xs font-bold text-slate-800 leading-tight">
                    {currentUser.full_name || 'Customer'}
                  </span>
                  <span className="block text-[11px] text-slate-500 font-mono">
                    {currentUser.phone ? `+91 ${currentUser.phone}` : (currentUser.email || 'Google User')}
                  </span>
                </div>
                {currentUser.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.full_name}
                    className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-sm"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 border border-brand-200 flex items-center justify-center font-bold text-xs shadow-sm">
                    {currentUser.full_name?.charAt(0) || <User className="w-4 h-4" />}
                  </div>
                )}
                <button
                  type="button"
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <Link
                to="/login?redirect=/customer"
                className="py-2 px-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5"
              >
                <User className="w-4 h-4" />
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Responsive Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-[65px] z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2 overflow-x-auto flex gap-2 scrollbar-none">
          <button
            onClick={() => handleTabChange('book')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'book'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" /> Book Pickup
          </button>

          <button
            onClick={() => handleTabChange('current')}
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
            onClick={() => handleTabChange('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'history'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Order History ({orders.length})
          </button>

          <button
            onClick={() => handleTabChange('addresses')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'addresses'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            My Addresses
          </button>

          <button
            onClick={() => handleTabChange('contact')}
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-6">
        {/* Customer Error Banner on Data Load Failure */}
        {dataLoadError && (
          <div
            className="p-4 sm:p-5 bg-red-50 border-2 border-red-300 rounded-3xl text-red-950 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            data-testid="data-load-error-banner"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-sm sm:text-base text-red-950">
                  Unable to load service information
                </h3>
                <p className="text-xs text-red-800 mt-0.5">
                  {dataLoadError}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}
        {/* Global Confirmation Banner (Visible across tabs when a booking is confirmed) */}
        {bookingSuccessOrder && (
          <div className="p-4 sm:p-5 bg-emerald-50 border-2 border-emerald-300 rounded-3xl text-emerald-950 shadow-sm animate-fade-in relative">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base sm:text-lg text-emerald-950">
                      Pickup Booked Successfully!
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-emerald-200 text-emerald-900 border border-emerald-300">
                      #{bookingSuccessOrder.order_number}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-emerald-800 mt-1">
                    Your pickup order has been confirmed for <span className="font-bold">{bookingSuccessOrder.pickup_date}</span> during <span className="font-bold">{bookingSuccessOrder.pickup_slot}</span>. Our delivery agent will arrive at your doorstep.
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      type="button"
                      onClick={() => handleTabChange('current')}
                      className="py-1.5 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Track Live Progress</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismissConfirmation}
                className="text-emerald-500 hover:text-emerald-800 p-1.5 rounded-xl hover:bg-emerald-100 transition"
                title="Dismiss confirmation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ================= 1. BOOK A PICKUP TAB ================= */}
        {activeTab === 'book' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Form (7 cols on desktop) */}
            <div className="lg:col-span-7 space-y-4">
              {!currentUser && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Sign-in is required to confirm and live-track your laundry pickup booking.</span>
                  </div>
                  <Link
                    to="/login?redirect=/customer"
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs whitespace-nowrap transition"
                  >
                    Sign In
                  </Link>
                </div>
              )}

              {bookingError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{bookingError}</span>
                </div>
              )}

              {/* Recovery Banner for Ambiguous / Timeout Pending Bookings */}
              {pendingRecovery && (
                <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-950 shadow-sm animate-fade-in space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-amber-950">
                          Unconfirmed Booking Attempt Detected
                        </h3>
                        <p className="text-xs text-amber-800 mt-1">
                          {statusCheckOutcome === 'not_found'
                            ? 'Status check verified: No order was created for this previous attempt. You can now complete the booking or start fresh.'
                            : `A network timeout interrupted your previous booking request for ${pendingRecovery.payload.pickup_date} during ${pendingRecovery.payload.pickup_slot}. Verify whether the order was recorded to prevent duplicate scheduling.`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDiscardPendingBooking(false)}
                      className="text-amber-600 hover:text-amber-900 p-1.5 rounded-xl hover:bg-amber-100 transition"
                      title="Discard notice"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    {statusCheckOutcome === 'not_found' ? (
                      <button
                        type="button"
                        disabled={isResolvingPending}
                        onClick={handleCompleteUncommittedBooking}
                        className="py-2 px-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {isResolvingPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Complete Booking</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isResolvingPending}
                        onClick={handleResolvePendingBooking}
                        className="py-2 px-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {isResolvingPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        <span>Verify & Complete Booking</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDiscardPendingBooking(false)}
                      className="py-1.5 px-2 text-amber-800 hover:text-amber-950 font-bold text-xs underline cursor-pointer"
                    >
                      Discard & Start Fresh
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateBooking} className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-sm">
                <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-brand-600" /> Schedule Home Pickup
                </h2>

                {/* 0. Service Selection */}
                {services.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-brand-600" /> Select Laundry Service(s)
                      </label>
                      {activeSelectedServices.length > 1 && (
                        <span className="text-[11px] font-bold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
                          {activeSelectedServices.length} Services Selected (Linked Pickup)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Select one or more services for this pickup. Distinct services are weighed and processed in separate batches.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {services.map((srv) => {
                        const isSelected = selectedServiceIds.includes(srv.id);
                        return (
                          <label
                            key={srv.id}
                            className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition select-none ${
                              isSelected
                                ? 'border-brand-600 bg-brand-50/70 text-slate-900 ring-2 ring-brand-500/20 shadow-sm'
                                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              name="selectedService"
                              value={srv.id}
                              checked={isSelected}
                              onChange={() => handleToggleService(srv.id)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                            />
                            <div className="text-xs flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">{srv.name}</span>
                                <span className="font-black text-brand-700">
                                  ₹{(((srv.unit_price_paise || srv.price_paise || 7900) / 100)).toFixed(0)}
                                  <span className="text-[10px] text-slate-400 font-normal">/{srv.pricing_unit === 'per_kg' ? 'kg' : srv.pricing_unit.replace('per_', '')}</span>
                                </span>
                              </div>
                              {srv.description && (
                                <span className="text-slate-500 text-[11px] block mt-0.5 line-clamp-1">{srv.description}</span>
                              )}
                              {srv.pricing_unit === 'per_kg' && srv.min_weight_kg > 0 && (
                                <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">Min. {srv.min_weight_kg} kg</span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                      {addresses.map((addr) => {
                        const isSelected = selectedAddressId === addr.id;
                        return (
                          <div
                            key={addr.id}
                            className={`p-3.5 rounded-2xl border transition ${
                              isSelected
                                ? 'border-brand-600 bg-brand-50/70 text-slate-900 ring-2 ring-brand-500/20'
                                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <label className="flex items-start gap-3 cursor-pointer">
                              <input
                                type="radio"
                                name="selectedAddress"
                                value={addr.id}
                                checked={isSelected}
                                onChange={() => handleSelectSavedAddress(addr)}
                                className="mt-1 text-brand-600 focus:ring-brand-500"
                              />
                              <div className="text-xs flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-900">{addr.label}</span>
                                  {isSelected && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIsRefiningAddress(!isRefiningAddress);
                                      }}
                                      className="text-[11px] font-bold text-brand-700 bg-white hover:bg-brand-100 border border-brand-300 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                                      data-testid={`refine-address-${addr.id}`}
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      <span>{isRefiningAddress ? 'Hide Refinement' : 'Refine / Edit Address'}</span>
                                    </button>
                                  )}
                                </div>
                                <span className="text-slate-600 block mt-0.5">{addr.address_line}</span>
                                {addr.landmark && (
                                  <span className="text-slate-500 text-[11px] block">Landmark: {addr.landmark}</span>
                                )}
                                <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-slate-400">
                                  <span>PIN: {addr.pincode}</span>
                                  {addr.latitude && addr.longitude && (
                                    <span className="text-emerald-700 font-sans font-semibold">📍 GPS Pin Attached</span>
                                  )}
                                </div>
                              </div>
                            </label>

                            {/* Refinement Sub-form for Selected Address */}
                            {isSelected && isRefiningAddress && (
                              <div className="mt-3 pt-3 border-t border-brand-200/80 space-y-2.5 text-xs animate-fade-in" data-testid="address-refinement-panel">
                                <span className="font-bold text-brand-900 block text-[11px] uppercase tracking-wider">
                                  Refine Address for this Pickup
                                </span>
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                    Door / Flat No., Building, Street
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Flat 301, Tower B, 12th Main Rd"
                                    value={refinedAddressLine}
                                    onChange={(e) => setRefinedAddressLine(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 bg-white"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                      Landmark
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. Opposite Park"
                                      value={refinedLandmark}
                                      onChange={(e) => setRefinedLandmark(e.target.value)}
                                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 bg-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                      PIN Code
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. 560038"
                                      value={refinedPincode}
                                      onChange={(e) => setRefinedPincode(e.target.value)}
                                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono bg-white"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                  <div className="text-[11px] text-slate-600 font-mono">
                                    {refinedLatitude && refinedLongitude ? (
                                      <span className="text-emerald-700 font-semibold">
                                        📍 Pin: {refinedLatitude.toFixed(4)}, {refinedLongitude.toFixed(4)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">No map pin set</span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setMapPickerState({
                                      isOpen: true,
                                      target: 'booking_refine',
                                      initialLat: refinedLatitude,
                                      initialLng: refinedLongitude,
                                      addressContext: refinedAddressLine || addr.address_line,
                                      title: 'Adjust Pickup Pin for Refined Address'
                                    })}
                                    className="py-1.5 px-3 bg-white hover:bg-slate-50 text-brand-700 font-bold rounded-lg border border-brand-300 text-[11px] flex items-center gap-1.5 cursor-pointer shadow-sm"
                                  >
                                    <Navigation className="w-3.5 h-3.5 text-brand-600" />
                                    <span>Adjust on Map</span>
                                  </button>
                                </div>

                                <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={updateSavedAddressBook}
                                    onChange={(e) => setUpdateSavedAddressBook(e.target.checked)}
                                    className="rounded text-brand-600 focus:ring-brand-500"
                                  />
                                  <span>Update my saved address book with these details</span>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleGetCurrentLocation}
                              disabled={isLocating}
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 px-3 py-1.5 rounded-lg border border-brand-200 transition cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5 text-brand-600" />
                              <span>{isLocating ? 'Acquiring GPS...' : '📍 Use current location'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setMapPickerState({
                                isOpen: true,
                                target: 'booking_new',
                                initialLat: newLatitude,
                                initialLng: newLongitude,
                                addressContext: newAddressLine || 'New Address',
                                title: 'Pin Exact Doorstep on Map'
                              })}
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg border border-brand-200 transition cursor-pointer"
                            >
                              <Navigation className="w-3.5 h-3.5 text-brand-600" />
                              <span>Adjust Pin on Map</span>
                            </button>
                          </div>
                          {newLatitude && newLongitude && (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                                ✓ GPS Attached
                              </span>
                              <button
                                type="button"
                                onClick={handleClearLocation}
                                className="text-[10px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                        {locationFeedback && (
                          <p
                            className={`text-[11px] leading-tight ${
                              locationFeedback.type === 'success'
                                ? 'text-emerald-700 font-medium'
                                : locationFeedback.type === 'loading'
                                ? 'text-brand-600 animate-pulse'
                                : 'text-amber-700'
                            }`}
                          >
                            {locationFeedback.message}
                          </p>
                        )}
                      </div>
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
                    {(slots.length > 0 ? slots : [
                      { id: 'slot-1', name: 'Morning (08:00 AM - 11:00 AM)' },
                      { id: 'slot-2', name: 'Noon (11:00 AM - 02:00 PM)' },
                      { id: 'slot-3', name: 'Afternoon (02:00 PM - 05:00 PM)' },
                      { id: 'slot-4', name: 'Evening (05:00 PM - 08:00 PM)' }
                    ]).map((s) => (
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

                {/* 5. Promotional Offers & Coupon Section */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <TicketPercent className="w-4 h-4 text-brand-600" /> Promotional Offers & Coupons
                    </label>
                    {appliedCoupon ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Offer Attached
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">
                        Pre-Booking Only
                      </span>
                    )}
                  </div>

                  {appliedCoupon ? (
                    <div className="bg-white border border-emerald-300 rounded-2xl p-3.5 space-y-2 shadow-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                            <Tag className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-slate-900 text-sm tracking-wider">
                                {appliedCoupon.code}
                              </span>
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full">
                                {appliedCoupon.discount_type === 'percentage'
                                  ? `${appliedCoupon.discount_value}% OFF`
                                  : `₹${(appliedCoupon.discount_paise / 100).toFixed(0)} OFF`}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1 font-medium">
                              Estimated Savings: <span className="font-bold text-emerald-700">Up to ₹{(appliedCoupon.discount_paise / 100).toFixed(0)}</span>
                            </p>
                            <p className="text-[10px] text-amber-700 font-medium mt-0.5 flex items-center gap-1">
                              <span>⏳</span> Final savings verified upon digital scale weighing at intake hub.
                            </p>
                            {appliedCoupon.min_order_paise ? (
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Condition: Requires final measured subtotal of min. ₹{(appliedCoupon.min_order_paise / 100).toFixed(0)}.
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveCoupon}
                          className="text-xs font-bold text-rose-600 hover:text-rose-700 px-2.5 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100">
                        🔒 Offer locked for this order. As per our pre-booking promotion policy, terms are snapshotted and will be applied at weighing.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Active Advertised Offers for 1-Tap Application */}
                      {availablePromotions.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold text-slate-600 block">
                            Featured Offers Available:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {availablePromotions.map((promo) => {
                              const isEligible = !promo.min_order_paise || combinedEstimatedSubtotalPaise >= promo.min_order_paise;
                              return (
                                <div
                                  key={promo.id}
                                  className="bg-white border border-slate-200 hover:border-brand-300 rounded-xl p-2.5 flex items-center justify-between gap-2 transition shadow-xs"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-xs text-brand-900 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200">
                                        {promo.code}
                                      </span>
                                      <span className="text-[10px] font-bold text-emerald-700">
                                        {promo.discount_type === 'percentage'
                                          ? `${promo.discount_value}% OFF`
                                          : `₹${(promo.discount_value / 100).toFixed(0)} OFF`}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1 truncate" title={promo.description}>
                                      {promo.description || 'Promotional discount'}
                                    </p>
                                    {promo.min_order_paise ? (
                                      <p className="text-[9px] text-amber-700 font-medium">
                                        Min. ₹{(promo.min_order_paise / 100).toFixed(0)} (pending weighing)
                                      </p>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyCoupon(promo.code)}
                                    disabled={couponValidationLoading}
                                    className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-600 text-brand-700 hover:text-white border border-brand-200 hover:border-brand-600 rounded-lg font-bold text-[11px] transition shrink-0 cursor-pointer disabled:opacity-50"
                                  >
                                    Apply
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Manual Code Input Field */}
                      <div className="pt-1 border-t border-slate-200/60 space-y-1.5">
                        <span className="text-[11px] text-slate-500 block">
                          Have another promo code?
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={couponCodeInput}
                            onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                            placeholder="Enter code (e.g. WELCOME50)"
                            className="flex-1 px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono uppercase text-xs bg-white"
                            data-testid="coupon-code-input"
                          />
                          <button
                            type="button"
                            onClick={() => handleApplyCoupon()}
                            disabled={couponValidationLoading || !couponCodeInput.trim()}
                            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50"
                            data-testid="apply-coupon-btn"
                          >
                            {couponValidationLoading ? 'Applying...' : 'Apply'}
                          </button>
                        </div>
                      </div>

                      {couponError && (
                        <p className="text-[11px] text-rose-600 font-semibold" data-testid="coupon-error-msg">
                          {couponError}
                        </p>
                      )}
                      {couponSuccessMessage && (
                        <p className="text-[11px] text-emerald-600 font-semibold" data-testid="coupon-success-msg">
                          {couponSuccessMessage}
                        </p>
                      )}

                      <p className="text-[10px] text-slate-400 italic">
                        ℹ️ Pre-booking policy: Coupons must be applied before confirming pickup. Once confirmed, promotions cannot be added or changed.
                      </p>
                    </div>
                  )}
                </div>

                {/* Submit button on mobile */}
                <div className="block lg:hidden pt-2">
                  <button
                    type="submit"
                    disabled={isBookingSubmitting}
                    className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {pendingRecovery?.status === 'uncertain_timeout' ? (
                      <>
                        <RefreshCw className="w-5 h-5" />
                        <span>Verify Unconfirmed Booking First</span>
                      </>
                    ) : currentUser ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Confirm Pickup Booking</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        <span>Sign In to Book Pickup</span>
                      </>
                    )}
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
                  {isMultiService ? (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black">₹{minBill}</span>
                        <span className="text-sm font-semibold text-brand-100">est. min total</span>
                      </div>
                      <p className="text-xs text-brand-100 mt-1 font-semibold">
                        {activeSelectedServices.length} Services Selected (Linked Pickup):
                      </p>
                      <div className="mt-2 space-y-1.5 bg-white/10 rounded-2xl p-2.5">
                        {activeSelectedServices.map((s) => (
                          <div key={s.id} className="flex justify-between items-center text-xs">
                            <span className="font-medium text-white">{s.name}</span>
                            <span className="text-cyan-200 font-mono font-bold">
                              ₹{(((s.unit_price_paise || s.price_paise || 7900) / 100)).toFixed(0)}/{s.pricing_unit === 'per_kg' ? 'kg' : s.pricing_unit.replace('per_', '')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black">₹{serviceRateStr}</span>
                        <span className="text-base font-semibold text-brand-100">/ {serviceUnitLabel}</span>
                      </div>
                      <p className="text-xs text-brand-100 mt-1">
                        {selectedService ? selectedService.name : 'Normal clothes washing'}
                        {selectedService?.pricing_unit === 'per_kg' && selectedService.min_weight_kg > 0
                          ? ` • Min. weight ${selectedService.min_weight_kg} kg (₹${((selectedService.unit_price_paise * selectedService.min_weight_kg) / 100).toFixed(0)}).`
                          : '.'}
                      </p>
                    </div>
                  )}
                </div>

                {appliedCoupon && (
                  <div className="p-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-2xl text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-white">
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-cyan-200" />
                        <span>Promo Code: {appliedCoupon.code}</span>
                      </span>
                      <span className="bg-emerald-400 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full">
                        {appliedCoupon.discount_type === 'percentage'
                          ? `-${appliedCoupon.discount_value}%`
                          : `-₹${(appliedCoupon.discount_paise / 100).toFixed(0)}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-cyan-100 leading-tight">
                      Estimated savings: Up to ₹{(appliedCoupon.discount_paise / 100).toFixed(0)} (Pending final scale weight verification). Final bill established upon store intake weighing.
                    </p>
                    {appliedCoupon.min_order_paise ? (
                      <p className="text-[10px] text-cyan-200">
                        *Condition: Requires final order subtotal of min. ₹{(appliedCoupon.min_order_paise / 100).toFixed(0)}.
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="p-3.5 bg-white/10 rounded-2xl text-xs space-y-1.5 text-brand-50">
                  <span className="font-bold block text-white">How billing works:</span>
                  <p className="text-[11px] leading-relaxed">
                    1. We collect your laundry bag{isMultiService ? 's' : ''} at your doorstep. <br />
                    2. Service rate verified from official catalogue{isMultiService ? ' for each selected service.' : `: ₹${serviceRateStr} / ${serviceUnitLabel}.`} <br />
                    3. Exact bill generated upon store intake & digital scale verification. <br />
                    4. Delivered clean & crisp. Pay via Cash or UPI.
                  </p>
                </div>

                <div className="hidden lg:block pt-2">
                  <button
                    onClick={handleCreateBooking}
                    disabled={isBookingSubmitting}
                    className="w-full py-3.5 bg-white hover:bg-slate-100 active:scale-[0.99] text-brand-700 font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {pendingRecovery?.status === 'uncertain_timeout' ? (
                      <>
                        <RefreshCw className="w-5 h-5" />
                        <span>Verify Unconfirmed Booking First</span>
                      </>
                    ) : currentUser ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Confirm Pickup Booking</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        <span>Sign In to Book Pickup</span>
                      </>
                    )}
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
            {/* Multi-Service Linked Batch Switcher & Combined Overview */}
            {(() => {
              const batchMatch = currentActiveOrder?.notes?.match(/\[Linked Batch ([^:\]]+)/);
              const batchId = batchMatch ? batchMatch[1] : null;
              const linkedSiblings = batchId
                ? orders.filter((o) => o.notes?.includes(batchId))
                : [];
              if (linkedSiblings.length <= 1) return null;

              const combinedTotalPaise = linkedSiblings.reduce((sum, o) => {
                if (o.order_status === 'cancelled') return sum;
                return sum + (o.total_amount_paise !== null && o.total_amount_paise !== undefined
                  ? o.total_amount_paise
                  : Math.max(0, Math.round((o.price_per_kg_paise || 7900) * (o.min_weight_kg || 1)) - (o.discount_paise || 0)));
              }, 0);

              return (
                <div className="bg-brand-50/80 border border-brand-200 rounded-3xl p-4 sm:p-5 space-y-3 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-brand-600" />
                          Linked Pickup Appointment ({linkedSiblings.length} Services)
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-brand-800 border border-brand-200">
                          Batch: {batchId}
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-700 mt-0.5">
                        These services share the scheduled pickup on {currentActiveOrder?.pickup_date} during {currentActiveOrder?.pickup_slot}.
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Combined Total</span>
                      <span className="text-base font-black text-brand-900">
                        ₹{(combinedTotalPaise / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1 border-t border-brand-200/60">
                    <span className="text-[11px] font-bold text-slate-600 self-center mr-1">Switch Service:</span>
                    {linkedSiblings.map((sib) => {
                      const isCurrent = sib.id === currentActiveOrder?.id;
                      return (
                        <button
                          key={sib.id}
                          type="button"
                          onClick={() => setBookingSuccessOrder(sib)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            isCurrent
                              ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-600/30'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span>#{sib.order_number}</span>
                          <span className="opacity-90 font-medium">({sib.service_name || 'Laundry'})</span>
                          <StatusBadge status={sib.order_status} size="sm" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {currentActiveOrder ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-sm">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Live Order Tracking
                    </span>
                    <div className="flex items-center gap-2">
                      <h2 className="font-black text-2xl text-slate-900 leading-tight">
                        Order #{currentActiveOrder.order_number}
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
                        {currentActiveOrder.service_name || 'Wash & Fold (Normal)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pickup Scheduled: {currentActiveOrder.pickup_date} • {currentActiveOrder.pickup_slot}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={currentActiveOrder.order_status} size="lg" />
                  </div>
                </div>

                {/* 7-Stage Live Progression Timeline */}
                <div className="py-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Order Progress Timeline</span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      7 Stages • Doorstep to Doorstep
                    </span>
                  </div>

                  {currentActiveOrder.order_status === 'cancelled' ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-center gap-2.5">
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                      <div>
                        <span className="font-bold block">Order Cancelled</span>
                        <p>{currentActiveOrder.cancellation_reason || 'This order was cancelled.'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                      {[
                        {
                          num: 1,
                          key: 'booking_confirmed',
                          label: '1. Booking Confirmed',
                          state: 'completed' as const,
                          desc: `${currentActiveOrder.pickup_date} (${currentActiveOrder.pickup_slot.split('(')[0].trim()})`
                        },
                        {
                          num: 2,
                          key: 'pickup_in_progress',
                          label: '2. Pickup in Progress',
                          state: ['collected', 'washing', 'ready_for_delivery', 'out_for_delivery', 'delivered'].includes(currentActiveOrder.order_status)
                            ? ('completed' as const)
                            : (currentActiveOrder.order_status === 'pickup_assigned' || currentActiveOrder.assigned_pickup_id)
                              ? ('current' as const)
                              : ('pending' as const),
                          desc: currentActiveOrder.assigned_pickup_name
                            ? `Agent: ${currentActiveOrder.assigned_pickup_name}`
                            : 'Awaiting assignment'
                        },
                        {
                          num: 3,
                          key: 'picked_up_weighed',
                          label: '3. Picked Up & Weighed',
                          state: ['washing', 'ready_for_delivery', 'out_for_delivery', 'delivered'].includes(currentActiveOrder.order_status)
                            ? ('completed' as const)
                            : (currentActiveOrder.order_status === 'collected' || (currentActiveOrder.measured_weight !== null && currentActiveOrder.measured_weight !== undefined))
                              ? ('current' as const)
                              : ('pending' as const),
                          desc: currentActiveOrder.measured_weight
                            ? `${currentActiveOrder.measured_weight.toFixed(2)} kg (₹${((currentActiveOrder.total_amount_paise || 0) / 100).toFixed(0)})`
                            : currentActiveOrder.order_status === 'collected'
                              ? 'At store intake'
                              : 'Pending weight'
                        },
                        {
                          num: 4,
                          key: 'washing',
                          label: '4. Washing & Processing',
                          state: ['ready_for_delivery', 'out_for_delivery', 'delivered'].includes(currentActiveOrder.order_status)
                            ? ('completed' as const)
                            : currentActiveOrder.order_status === 'washing'
                              ? ('current' as const)
                              : ('pending' as const),
                          desc: currentActiveOrder.order_status === 'washing' ? 'In batch machines' : 'Steam & hygienic wash'
                        },
                        {
                          num: 5,
                          key: 'ready_for_delivery',
                          label: '5. Ready for Delivery',
                          state: ['out_for_delivery', 'delivered'].includes(currentActiveOrder.order_status)
                            ? ('completed' as const)
                            : currentActiveOrder.order_status === 'ready_for_delivery'
                              ? ('current' as const)
                              : ('pending' as const),
                          desc: 'Steam-ironed & packed'
                        },
                        {
                          num: 6,
                          key: 'out_for_delivery',
                          label: '6. Out for Delivery',
                          state: currentActiveOrder.order_status === 'delivered'
                            ? ('completed' as const)
                            : currentActiveOrder.order_status === 'out_for_delivery'
                              ? ('current' as const)
                              : ('pending' as const),
                          desc: currentActiveOrder.assigned_delivery_name
                            ? `Courier: ${currentActiveOrder.assigned_delivery_name}`
                            : 'Dispatch staging'
                        },
                        {
                          num: 7,
                          key: 'delivered',
                          label: '7. Delivered',
                          state: currentActiveOrder.order_status === 'delivered'
                            ? ('completed' as const)
                            : ('pending' as const),
                          desc: currentActiveOrder.delivered_at
                            ? new Date(currentActiveOrder.delivered_at).toLocaleDateString()
                            : 'Doorstep handover'
                        }
                      ].map((step) => {
                        const isDone = step.state === 'completed';
                        const isCurr = step.state === 'current';
                        return (
                          <div
                            key={step.key}
                            className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                              isDone
                                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                                : isCurr
                                  ? 'bg-brand-50 border-brand-500 shadow-sm ring-2 ring-brand-500/20 text-brand-950'
                                  : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] ${
                                  isDone
                                    ? 'bg-emerald-600 text-white'
                                    : isCurr
                                      ? 'bg-brand-600 text-white animate-pulse'
                                      : 'bg-slate-200 text-slate-500'
                                }`}
                              >
                                {isDone ? '✓' : step.num}
                              </span>
                              {isCurr && (
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-brand-600 text-white px-1.5 py-0.5 rounded-full">
                                  Current
                                </span>
                              )}
                              {isDone && (
                                <span className="text-[9px] font-bold text-emerald-700">Done</span>
                              )}
                            </div>
                            <div>
                              <span className={`block font-bold text-xs ${isCurr ? 'text-brand-900' : isDone ? 'text-emerald-900' : 'text-slate-600'}`}>
                                {step.label}
                              </span>
                              <span className="block text-[10px] text-slate-500 mt-0.5 truncate" title={step.desc}>
                                {step.desc}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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

                    {currentActiveOrder.coupon_code && (
                      <div className="flex justify-between items-center text-slate-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-semibold text-emerald-950">
                            Coupon Redeemed: <span className="font-mono font-black">{currentActiveOrder.coupon_code}</span>
                          </span>
                        </div>
                        <span className="font-bold text-emerald-700">
                          {currentActiveOrder.total_amount_paise !== null && currentActiveOrder.total_amount_paise !== undefined
                            ? `-₹${((currentActiveOrder.discount_paise || 0) / 100).toFixed(2)}`
                            : `Est. -₹${((currentActiveOrder.discount_paise || 0) / 100).toFixed(2)} (Pending scale weigh-in)`}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="font-bold text-slate-900 text-sm">Final Payable Total:</span>
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

                    <div className="pt-2 flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedInvoiceOrder(currentActiveOrder)}
                        className="flex-1 py-2.5 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200 shadow-xs"
                        data-testid="view-invoice-btn"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-600" />
                        <span>{currentActiveOrder.measured_weight !== null && currentActiveOrder.measured_weight !== undefined ? 'View Invoice / Bill' : 'View Booking Estimate'}</span>
                      </button>

                      {currentActiveOrder.total_amount_paise && currentActiveOrder.payment_status !== 'paid' && (
                        <button
                          type="button"
                          onClick={() => setSelectedPaymentOrder(currentActiveOrder)}
                          className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <QrCode className="w-4 h-4" />
                          <span>Pay via UPI (₹{((currentActiveOrder.total_amount_paise - currentActiveOrder.paid_amount_paise) / 100).toFixed(2)})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Pickup & Courier Info Card */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                    <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">
                      Pickup & Delivery Logistics
                    </span>

                    <div className="text-slate-700 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold block text-slate-900">Address:</span>
                        {currentActiveOrder.order_status === 'booked' ? (
                          <button
                            type="button"
                            onClick={() => handleOpenOrderLocationEdit(currentActiveOrder)}
                            className="py-1 px-2.5 bg-white hover:bg-brand-50 text-brand-700 border border-brand-300 rounded-lg font-bold text-[11px] flex items-center gap-1 transition shadow-sm cursor-pointer"
                            data-testid="edit-order-pickup-location-button"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit Pickup Location & Pin</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">
                            Address locked (In progress)
                          </span>
                        )}
                      </div>
                      <p>{currentActiveOrder.pickup_address}</p>
                      {currentActiveOrder.pickup_landmark && (
                        <p className="text-slate-500">Landmark: {currentActiveOrder.pickup_landmark}</p>
                      )}
                      <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                        <span>PIN: {currentActiveOrder.pickup_pincode}</span>
                        {currentActiveOrder.pickup_latitude && currentActiveOrder.pickup_longitude && (
                          <span className="text-emerald-700 font-sans font-semibold">
                            📍 GPS Pin Attached
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pickup Logistics */}
                    <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                          1. Scheduled Pickup
                        </span>
                        <span className="text-[11px] font-semibold text-slate-700">
                          {currentActiveOrder.pickup_date} • {currentActiveOrder.pickup_slot}
                        </span>
                      </div>
                      <div className="pt-1 flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-slate-500">Pickup Agent: </span>
                          <span className="font-bold text-slate-900 text-xs">
                            {currentActiveOrder.assigned_pickup_name || 'Assignment in progress'}
                          </span>
                        </div>
                        {currentActiveOrder.assigned_pickup_phone && (
                          <a
                            href={`tel:${currentActiveOrder.assigned_pickup_phone}`}
                            className="py-1 px-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg font-bold text-[11px] flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3" /> Call
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Delivery Logistics */}
                    <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                        2. Delivery Courier
                      </span>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-slate-500">Delivery Agent: </span>
                          <span className="font-bold text-slate-900 text-xs">
                            {currentActiveOrder.assigned_delivery_name || 'Assigned upon ready stage'}
                          </span>
                        </div>
                        {currentActiveOrder.assigned_delivery_phone && (
                          <a
                            href={`tel:${currentActiveOrder.assigned_delivery_phone}`}
                            className="py-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-bold text-[11px] flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3" /> Call
                          </a>
                        )}
                      </div>
                    </div>
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
                  onClick={() => handleTabChange('book')}
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
                            <span className="text-[10px] font-bold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-md inline-block my-0.5">
                              {ord.service_name || 'Wash & Fold (Normal)'}
                            </span>
                            <span className="text-[11px] text-slate-500 block">{ord.pickup_date} • {ord.pickup_slot}</span>
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
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceOrder(ord)}
                            className="text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                            data-testid={`history-invoice-btn-${ord.order_number}`}
                          >
                            <Printer className="w-3 h-3 text-slate-500" />
                            <span>Invoice</span>
                          </button>

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
                              handleTabChange('current');
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
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-slate-900 text-base">Saved Delivery Addresses</h2>
                <p className="text-slate-500 text-xs">
                  Manage your pickup and delivery locations
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddAddress}
                className="py-2 px-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                data-testid="add-address-button"
              >
                <Plus className="w-4 h-4" />
                <span>Add Address</span>
              </button>
            </div>

            {addresses.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">No Saved Addresses</h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Save your home or office address for fast, 1-click laundry pickup bookings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddAddress}
                  className="py-2 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Your First Address
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2 text-xs shadow-sm flex flex-col justify-between"
                    data-testid={`address-card-${addr.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">{addr.label}</span>
                        {addr.is_default && (
                          <span className="text-[10px] bg-brand-50 text-brand-700 font-bold px-2 py-0.5 rounded-full border border-brand-200">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 leading-snug">{addr.address_line}</p>
                      {addr.landmark && (
                        <p className="text-slate-500 text-[11px]">Landmark: {addr.landmark}</p>
                      )}
                      <div className="flex items-center justify-between text-slate-400 font-mono text-[11px] pt-0.5">
                        <span>PIN: {addr.pincode}</span>
                        {addr.latitude && addr.longitude && (
                          <span className="text-emerald-700 font-sans font-semibold">📍 Pinned</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 justify-end">
                      <button
                        type="button"
                        onClick={() => handleOpenEditAddress(addr)}
                        className="py-1 px-2.5 text-slate-600 hover:text-brand-700 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 rounded-lg font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        data-testid={`edit-address-button-${addr.id}`}
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddressToDelete(addr)}
                        className="py-1 px-2.5 text-red-600 hover:text-red-800 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-lg font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        data-testid={`delete-address-button-${addr.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= 5. CONTACT US TAB ================= */}
        {activeTab === 'contact' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-4 shadow-sm text-xs max-w-xl">
            <h2 className="font-black text-slate-900 text-lg">Contact SuperWash Exprez</h2>
            <p className="text-slate-600">
              Need urgent laundry pickup or have a special garment care request? Reach out directly to our shop!
            </p>

            <div className="space-y-3 pt-2">
              <a
                href={`tel:${(settings?.business_phone || DEFAULT_SETTINGS.business_phone).replace(/[^0-9+]/g, '')}`}
                className="flex items-center gap-3 p-3.5 bg-brand-50 text-brand-800 rounded-2xl font-bold hover:bg-brand-100 transition"
              >
                <Phone className="w-5 h-5 text-brand-600" />
                <span>Call Store: {settings?.business_phone || DEFAULT_SETTINGS.business_phone}</span>
              </a>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 space-y-1">
                <span className="font-bold text-slate-900 block text-xs">Facility & Drop-off Shop:</span>
                <p>{settings?.business_address || DEFAULT_SETTINGS.business_address}</p>
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

      {/* Customer Invoice Modal */}
      {selectedInvoiceOrder && (
        <InvoiceModal
          order={selectedInvoiceOrder}
          isOpen={!!selectedInvoiceOrder}
          onClose={() => setSelectedInvoiceOrder(null)}
          linkedOrders={(() => {
            const batchMatch = selectedInvoiceOrder.notes?.match(/\[Linked Batch ([^:\]]+)/);
            const batchId = batchMatch ? batchMatch[1] : null;
            return batchId ? orders.filter((o) => o.notes?.includes(batchId)) : [selectedInvoiceOrder];
          })()}
          settings={settings}
          currentUser={currentUser}
        />
      )}

      {/* Interactive Leaflet Map Location Picker Modal */}
      <MapLocationPicker
        isOpen={mapPickerState.isOpen}
        onClose={() => setMapPickerState((prev) => ({ ...prev, isOpen: false, target: null }))}
        onConfirm={handleMapPinConfirmed}
        initialLatitude={mapPickerState.initialLat}
        initialLongitude={mapPickerState.initialLng}
        addressContext={mapPickerState.addressContext}
        title={mapPickerState.title}
      />

      {/* Saved Address Add / Edit Modal */}
      {addressModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          data-testid="address-form-modal"
        >
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <h3 className="font-black text-sm text-slate-900">
                  {editingAddressId ? 'Edit Saved Address' : 'Add New Delivery Address'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAddressModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addressActionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{addressActionError}</span>
              </div>
            )}

            {addressActionSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{addressActionSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveAddress} className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Address Label</label>
                <div className="flex gap-2">
                  {['Home', 'Work', 'Other'].map((lbl) => (
                    <button
                      type="button"
                      key={lbl}
                      onClick={() => setAddrLabel(lbl)}
                      className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        addrLabel === lbl
                          ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Door / Flat No., Building, Street <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Flat 402, Green Glen Layout, Bellandur"
                  value={addrLine}
                  onChange={(e) => setAddrLine(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Landmark (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Near Central Mall"
                    value={addrLandmark}
                    onChange={(e) => setAddrLandmark(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    PIN Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 560103"
                    value={addrPincode}
                    onChange={(e) => setAddrPincode(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="space-y-0.5">
                  <span className="block font-bold text-slate-700">Map Location Pin</span>
                  <span className="block text-[11px] text-slate-500 font-mono">
                    {addrLat && addrLng
                      ? `${addrLat.toFixed(4)}, ${addrLng.toFixed(4)}`
                      : 'Not pinned yet'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMapPickerState({
                    isOpen: true,
                    target: 'address_modal',
                    initialLat: addrLat,
                    initialLng: addrLng,
                    addressContext: addrLine,
                    title: 'Pin Address on Map'
                  })}
                  className="py-1.5 px-3 bg-white hover:bg-slate-100 text-brand-700 border border-brand-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5 text-brand-600" />
                  <span>{addrLat && addrLng ? 'Change Pin' : 'Set Pin on Map'}</span>
                </button>
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addrIsDefault}
                  onChange={(e) => setAddrIsDefault(e.target.checked)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span>Set as my default pickup address</span>
              </label>

              <div className="flex items-center gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setAddressModalOpen(false)}
                  className="py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAddress}
                  className="py-2.5 px-5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  data-testid="save-address-button"
                >
                  {isSavingAddress ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>{isSavingAddress ? 'Saving...' : 'Save Address'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Address Confirmation Modal */}
      {addressToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          data-testid="delete-address-modal"
        >
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900">Delete Saved Address</h3>
                <p className="text-[11px] text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 space-y-0.5">
              <span className="font-bold text-slate-900 block">{addressToDelete.label}</span>
              <p className="text-slate-600">{addressToDelete.address_line}</p>
              <span className="text-[11px] text-slate-400 font-mono">PIN: {addressToDelete.pincode}</span>
            </div>

            {addressDeleteError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{addressDeleteError}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setAddressToDelete(null);
                  setAddressDeleteError(null);
                }}
                className="py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAddress}
                disabled={isDeletingAddress}
                className="py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                data-testid="confirm-delete-address-button"
              >
                {isDeletingAddress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{isDeletingAddress ? 'Deleting...' : 'Delete Address'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Pickup Location Correction Modal (Phase 3) */}
      {editingOrderLocation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          data-testid="edit-order-location-modal"
        >
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    Correct Pickup Location
                  </h3>
                  <p className="text-[11px] text-slate-500">Order #{editingOrderLocation.order_number}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrderLocation(null)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-[11px] leading-relaxed">
              <strong>Order in Booked Status:</strong> You may adjust your pickup address, landmark, PIN code, or GPS pin before our pickup associate is dispatched.
            </div>

            {orderLocationError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{orderLocationError}</span>
              </div>
            )}

            {orderLocationSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{orderLocationSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveOrderLocation} className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pickup Address (Flat, Building, Street) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Flat 402, Green Glen Layout, Bellandur"
                  value={orderEditAddress}
                  onChange={(e) => setOrderEditAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Landmark (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Near Central Mall"
                    value={orderEditLandmark}
                    onChange={(e) => setOrderEditLandmark(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    PIN Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 560103"
                    value={orderEditPincode}
                    onChange={(e) => setOrderEditPincode(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="space-y-0.5">
                  <span className="block font-bold text-slate-700">Doorstep Map Pin</span>
                  <span className="block text-[11px] text-slate-500 font-mono">
                    {orderEditLat && orderEditLng
                      ? `${orderEditLat.toFixed(4)}, ${orderEditLng.toFixed(4)}`
                      : 'No GPS pin attached'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMapPickerState({
                    isOpen: true,
                    target: 'order_edit',
                    initialLat: orderEditLat,
                    initialLng: orderEditLng,
                    addressContext: orderEditAddress,
                    title: 'Correct Order Pickup Pin'
                  })}
                  className="py-1.5 px-3 bg-white hover:bg-slate-100 text-brand-700 border border-brand-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5 text-brand-600" />
                  <span>{orderEditLat && orderEditLng ? 'Adjust Pin' : 'Set Pin on Map'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingOrderLocation(null)}
                  className="py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingOrderLocation}
                  className="py-2.5 px-5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  data-testid="save-order-location-button"
                >
                  {isSavingOrderLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>{isSavingOrderLocation ? 'Updating...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post-Google-Login Customer Onboarding Modal (Phone & Default Address) */}
      {isOnboardingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex justify-between items-start pb-2 border-b">
              <div>
                <h3 className="font-black text-sm text-slate-900">Complete Your Delivery Profile</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Welcome to SuperWash! Please provide your mobile number for pickup coordination.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOnboardingModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {onboardingError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{onboardingError}</span>
              </div>
            )}

            <form onSubmit={handleSaveOnboarding} className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={onboardName}
                  onChange={(e) => setOnboardName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Contact Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-slate-400 text-xs">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={onboardPhone}
                    onChange={(e) => setOnboardPhone(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm text-slate-900"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Used by our delivery executive to call you at pickup and delivery. (No SMS OTP required).
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-700">Default Home Address (Optional)</label>
                  <div className="flex items-center gap-2">
                    {onboardLocationFeedback && (
                      <span className="text-[10px] text-slate-500">{onboardLocationFeedback}</span>
                    )}
                    <button
                      type="button"
                      onClick={handleGetOnboardLocation}
                      disabled={isOnboardLocating}
                      className="text-[11px] text-brand-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{isOnboardLocating ? 'Locating...' : onboardLatitude ? '✓ GPS Attached' : '📍 GPS'}</span>
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Flat / House No., Apartment, Street"
                  value={onboardAddress}
                  onChange={(e) => setOnboardAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Landmark (Optional)"
                    value={onboardLandmark}
                    onChange={(e) => setOnboardLandmark(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="PIN Code"
                    value={onboardPincode}
                    onChange={(e) => setOnboardPincode(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isOnboardingSaving || onboardPhone.length < 10}
                  className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isOnboardingSaving ? 'Saving Profile...' : 'Save & Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
