import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Order, CustomerAddress, PickupSlot, BusinessSettings, OrderFeedback, LaundryServiceItem, Coupon, PublicPromotion, ServiceArea } from '../../types';
import { LaundryService, DEFAULT_SETTINGS } from '../../services/laundryService';
import { PricingEngine } from '../../services/pricingEngine';
import { supabase } from '../../services/supabase';
import { StatusBadge, PaymentBadge } from '../../components/StatusBadge';
import { PaymentModal } from '../../components/PaymentModal';
import { FeedbackModal } from '../../components/FeedbackModal';
import { InvoiceModal } from '../../components/InvoiceModal';
import { PwaInstallPrompt } from '../../components/PwaInstallPrompt';
import { MapLocationPicker } from '../../components/MapLocationPicker';
import { LocationService } from '../../services/locationService';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { CustomerHomeDashboard } from '../../components/customer/CustomerHomeDashboard';
import { BookingStep1WhatAndWhen } from '../../components/customer/BookingStep1WhatAndWhen';
import { BookingStep2WhereAndWho } from '../../components/customer/BookingStep2WhereAndWho';
import { BookingStep3ReviewAndConfirm } from '../../components/customer/BookingStep3ReviewAndConfirm';
import { formatCustomerError } from '../../utils/errorHandling';
import {
  getPendingBooking,
  savePendingBooking,
  clearPendingBooking,
  updatePendingBookingStatus,
  calculateBookingFingerprint,
  isAmbiguousNetworkError,
  isAuthExpiredError,
  PendingBookingRecord,
  getGuestBookingDraft,
  saveGuestBookingDraft,
  clearGuestBookingDraft,
  isDraftAccountMismatch,
  hasMeaningfulDraftContent,
  GuestBookingDraftRecord,
  GuestBookingDraftPayload
} from '../../utils/pendingBooking';
import { getTodayDateIST } from '../../utils/dateUtils';
import {
  Calendar, Clock, MapPin, Plus, Phone,
  CheckCircle2, AlertCircle, Sparkles,
  QrCode, ArrowRight, User, Star, MessageSquareHeart,
  RefreshCw, LogOut, X, Scale, Lock,
  AlertTriangle, Loader2, Edit2, Trash2, Navigation,
  TicketPercent, Tag, Printer, CreditCard, ChevronLeft, ChevronRight, Check, Settings,
  Banknote
} from 'lucide-react';
import { Profile } from '../../types';

const CONFIRMED_ORDER_KEY = 'superwash_last_confirmed_order';

/**
 * Standard client submission ID generator for idempotent booking requests.
 */
const generateClientSubmissionId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

/**
 * Authoritative ownership verification helper for customer orders.
 * Verifies matching customer_id or normalized 10-digit customer_phone.
 */
const isCustomerOrderOwner = (
  order: { customer_id?: string | null; customer_phone?: string | null } | null | undefined,
  user: Profile | null | undefined
): boolean => {
  if (!order || !user) return false;
  if (order.customer_id && order.customer_id === user.id) return true;
  if (user.phone && order.customer_phone) {
    const cleanUserPhone = user.phone.replace(/[^0-9]/g, '');
    const cleanOrderPhone = order.customer_phone.replace(/[^0-9]/g, '');
    return cleanUserPhone.length > 0 && cleanOrderPhone === cleanUserPhone;
  }
  return false;
};

/**
 * Standard high-accuracy device geolocation helper wrapping LocationService with fallback error categorization.
 */
const requestDeviceLocation = (
  onSuccess: (lat: number, lng: number, details?: { accuracy?: number | null; message?: string }) => void,
  onError: (type: 'unsupported' | 'invalid' | 'permission_denied' | 'timeout' | 'error') => void,
  onComplete: () => void
) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError('unsupported');
    onComplete();
    return;
  }

  LocationService.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
    .then((pos) => {
      onSuccess(pos.latitude, pos.longitude, { accuracy: pos.accuracy, message: pos.accuracyMessage });
      onComplete();
    })
    .catch((err: any) => {
      console.warn('Geolocation error:', err);
      onComplete();
      if (err.code === 1 || err.code === 'PERMISSION_DENIED') onError('permission_denied');
      else if (err.code === 3 || err.code === 'TIMEOUT') onError('timeout');
      else if (err.code === 'UNSUPPORTED') onError('unsupported');
      else onError('error');
    });
};

interface AddressFields {
  line: string;
  landmark: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
}

interface AddressModalState {
  isOpen: boolean;
  editingId: string | null;
  label: string;
  address_line: string;
  landmark: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  isSaving: boolean;
  error: string | null;
  success: string | null;
}

const DEFAULT_ADDRESS_MODAL_STATE: AddressModalState = {
  isOpen: false,
  editingId: null,
  label: 'Home',
  address_line: '',
  landmark: '',
  pincode: '560103',
  latitude: null,
  longitude: null,
  is_default: false,
  isSaving: false,
  error: null,
  success: null
};

interface OrderLocationModalState {
  order: Order | null;
  address: string;
  landmark: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  isSaving: boolean;
  error: string | null;
  success: string | null;
}

const DEFAULT_ORDER_LOCATION_STATE: OrderLocationModalState = {
  order: null,
  address: '',
  landmark: '',
  pincode: '560038',
  latitude: null,
  longitude: null,
  isSaving: false,
  error: null,
  success: null
};

interface OnboardingModalState {
  isOpen: boolean;
  phone: string;
  name: string;
  address: string;
  landmark: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  isLocating: boolean;
  locationFeedback: string | null;
  isSaving: boolean;
  error: string | null;
}

const DEFAULT_ONBOARDING_MODAL_STATE: OnboardingModalState = {
  isOpen: false,
  phone: '',
  name: '',
  address: '',
  landmark: '',
  pincode: '560103',
  latitude: null,
  longitude: null,
  isLocating: false,
  locationFeedback: null,
  isSaving: false,
  error: null
};

export const CustomerHome: React.FC = () => {
  const { currentUser, updateProfile, logout, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTabs: Array<'home' | 'book' | 'current' | 'history' | 'addresses' | 'profile' | 'settings' | 'contact'> = [
    'home', 'book', 'current', 'history', 'addresses', 'profile', 'settings', 'contact'
  ];
  const [activeTab, setActiveTab] = useState<'home' | 'book' | 'current' | 'history' | 'addresses' | 'profile' | 'settings' | 'contact'>(
    tabParam && (validTabs.includes(tabParam as any) || tabParam === 'orders')
      ? (tabParam === 'orders' ? 'current' : (tabParam as any))
      : 'book'
  );

  // Synchronize activeTab with URL tab query parameter on direct navigation
  useEffect(() => {
    if (tabParam) {
      if (tabParam === 'orders') {
        setActiveTab('current');
      } else if (validTabs.includes(tabParam as any)) {
        setActiveTab(tabParam as any);
      }
    }
  }, [tabParam]);

  // Guided Sequential Booking Flow State (Steps 1 to 5)
  const [bookingStep, setBookingStep] = useState<number>(1);
  const [bookingStepError, setBookingStepError] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cash' | 'razorpay'>('cash');

  // Customer Profile & Settings State
  const [profilePhoneInput, setProfilePhoneInput] = useState<string>(currentUser?.phone || '');
  const [profileFullNameInput, setProfileFullNameInput] = useState<string>(currentUser?.full_name || '');
  const [profileUpdateSuccess, setProfileUpdateSuccess] = useState<string | null>(null);
  const [profileUpdateError, setProfileUpdateError] = useState<string | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState<boolean>(false);
  const [whatsappNotifications, setWhatsappNotifications] = useState<boolean>(true);
  const [smsNotifications, setSmsNotifications] = useState<boolean>(true);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  // Authoritative payment gateway availability
  const isCodAvailable = settings ? settings.cod_payment_enabled !== false : true;
  const isOnlineAvailable = Boolean(settings?.online_payment_enabled === true);
  const hasAvailablePaymentMethod = isCodAvailable || isOnlineAvailable;

  // Synchronize payment method preference if store settings change
  useEffect(() => {
    if (isCodAvailable) {
      if (selectedPaymentMethod !== 'cash' && !isOnlineAvailable) {
        setSelectedPaymentMethod('cash');
      }
    } else if (isOnlineAvailable) {
      setSelectedPaymentMethod('razorpay');
    }
  }, [settings, isCodAvailable, isOnlineAvailable]);
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
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);

  const getPincodeCoverageInfo = (pin: string) => {
    const cleanPin = (pin || '').trim().replace(/\D/g, '');
    if (cleanPin.length !== 6) return null;
    const area = serviceAreas.find((a) => a.pincode === cleanPin);
    if (area) {
      return {
        areaName: area.area_name || area.name,
        city: area.city,
        isActive: Boolean(area.is_active)
      };
    }
    const isServiceableInSettings = Boolean(settings?.serviceable_pincodes?.includes(cleanPin));
    if (isServiceableInSettings) {
      return {
        areaName: 'Active Service Zone',
        city: 'Bengaluru',
        isActive: true
      };
    }
    return {
      areaName: undefined,
      city: undefined,
      isActive: false
    };
  };

  // Address Refinement during Booking State
  const [refinedAddress, setRefinedAddress] = useState<AddressFields>({
    line: '',
    landmark: '',
    pincode: '560103',
    latitude: null,
    longitude: null
  });
  const [isRefiningAddress, setIsRefiningAddress] = useState<boolean>(false);
  const [updateSavedAddressBook, setUpdateSavedAddressBook] = useState<boolean>(true);
  const updateRefinedAddress = (patch: Partial<AddressFields>) =>
    setRefinedAddress((prev) => ({ ...prev, ...patch }));

  // Address Book CRUD State (My Addresses Tab)
  const [addressModal, setAddressModal] = useState<AddressModalState>(DEFAULT_ADDRESS_MODAL_STATE);
  const updateAddressModal = (patch: Partial<AddressModalState>) =>
    setAddressModal((prev) => ({ ...prev, ...patch }));

  const [addressToDelete, setAddressToDelete] = useState<CustomerAddress | null>(null);
  const [addressDeleteError, setAddressDeleteError] = useState<string | null>(null);
  const [isDeletingAddress, setIsDeletingAddress] = useState<boolean>(false);

  // Post-Booking Order Pickup Location Correction State (Track Order Tab)
  const [orderLocationModal, setOrderLocationModal] = useState<OrderLocationModalState>(DEFAULT_ORDER_LOCATION_STATE);
  const updateOrderLocationModal = (patch: Partial<OrderLocationModalState>) =>
    setOrderLocationModal((prev) => ({ ...prev, ...patch }));

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
  const [newAddress, setNewAddress] = useState<AddressFields>({
    line: '',
    landmark: '',
    pincode: '560103',
    latitude: null,
    longitude: null
  });
  const updateNewAddress = (patch: Partial<AddressFields>) =>
    setNewAddress((prev) => ({ ...prev, ...patch }));
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationFeedback, setLocationFeedback] = useState<{
    type: 'loading' | 'success' | 'permission_denied' | 'timeout' | 'error';
    message: string;
  } | null>(null);

  const [pickupDate, setPickupDate] = useState<string>(getTodayDateIST());
  const [selectedSlotName, setSelectedSlotName] = useState<string>('Morning (08:00 AM - 11:00 AM)');
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
  const [availablePromotions, setAvailablePromotions] = useState<Array<PublicPromotion | Coupon>>([]);
  const [couponValidationLoading, setCouponValidationLoading] = useState<boolean>(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccessMessage, setCouponSuccessMessage] = useState<string | null>(null);

  // Pending Booking Recovery State
  const [pendingRecovery, setPendingRecovery] = useState<PendingBookingRecord | null>(null);
  const [isResolvingPending, setIsResolvingPending] = useState<boolean>(false);
  const [statusCheckOutcome, setStatusCheckOutcome] = useState<'not_found' | null>(null);

  // Client submission request ID for safe idempotency & timeout retries
  const [submissionId, setSubmissionId] = useState<string>(generateClientSubmissionId);

  // Guest Booking Draft State (Preserves booking across OAuth login, refresh, & remounts)
  const [restoredDraftNotice, setRestoredDraftNotice] = useState<string | null>(null);
  const [draftAccountMismatch, setDraftAccountMismatch] = useState<{
    draft: GuestBookingDraftRecord;
    currentUserId: string;
  } | null>(null);
  const [isDraftHydrated, setIsDraftHydrated] = useState<boolean>(false);
  const hasRestoredDraftRef = React.useRef<boolean>(false);

  // Safely serializes and persists current booking parameters as a guest draft
  const autoSaveGuestDraft = (stepOverride?: number) => {
    const currentAddressLine = isEnteringNewAddress || addresses.length === 0
      ? newAddress.line
      : (isRefiningAddress ? refinedAddress.line : (addresses.find((a) => a.id === selectedAddressId)?.address_line || ''));
    const currentLandmark = isEnteringNewAddress || addresses.length === 0
      ? newAddress.landmark
      : (isRefiningAddress ? refinedAddress.landmark : (addresses.find((a) => a.id === selectedAddressId)?.landmark || ''));
    const currentPincode = isEnteringNewAddress || addresses.length === 0
      ? newAddress.pincode
      : (isRefiningAddress ? refinedAddress.pincode : (addresses.find((a) => a.id === selectedAddressId)?.pincode || ''));
    const currentLat = isEnteringNewAddress || addresses.length === 0
      ? newAddress.latitude
      : (isRefiningAddress ? refinedAddress.latitude : (addresses.find((a) => a.id === selectedAddressId)?.latitude ?? null));
    const currentLng = isEnteringNewAddress || addresses.length === 0
      ? newAddress.longitude
      : (isRefiningAddress ? refinedAddress.longitude : (addresses.find((a) => a.id === selectedAddressId)?.longitude ?? null));

    const payload: GuestBookingDraftPayload = {
      service_ids: selectedServiceIds,
      service_id: selectedServiceId,
      pickup_date: pickupDate,
      pickup_slot: selectedSlotName,
      customer_name: customerName,
      customer_phone: customerPhone,
      pickup_address: currentAddressLine,
      pickup_landmark: currentLandmark,
      pickup_pincode: currentPincode,
      pickup_latitude: currentLat,
      pickup_longitude: currentLng,
      coupon_code: appliedCoupon?.code,
      coupon_snapshot: appliedCoupon ? {
        code: appliedCoupon.code,
        discount_type: appliedCoupon.discount_type,
        discount_value: appliedCoupon.discount_value,
        discount_paise: appliedCoupon.discount_paise,
        min_order_paise: appliedCoupon.min_order_paise,
        max_discount_paise: appliedCoupon.max_discount_paise,
        description: appliedCoupon.description
      } : null,
      booking_step: stepOverride ?? bookingStep,
      client_submission_id: submissionId
    };

    if (hasMeaningfulDraftContent(payload)) {
      saveGuestBookingDraft(payload, {
        boundUserId: currentUser?.id || null,
        boundUserEmail: currentUser?.email || null
      });
    }
  };

  const handleDiscardDraft = () => {
    clearGuestBookingDraft();
    setRestoredDraftNotice(null);
    setDraftAccountMismatch(null);
    setBookingStep(1);
    setCustomerPhone(currentUser?.phone || '');
    setCustomerName(currentUser?.full_name || 'Customer');
    setNewAddress({
      line: '',
      landmark: '',
      pincode: '560103',
      latitude: null,
      longitude: null
    });
    setIsEnteringNewAddress(false);
    setAppliedCoupon(null);
    setSubmissionId(generateClientSubmissionId());
  };

  // Automatically save draft whenever booking inputs change while in the Book tab
  useEffect(() => {
    if (activeTab !== 'book') return;
    if (!isDraftHydrated) return; // Prevent initial blank state from overwriting stored draft
    autoSaveGuestDraft();
  }, [
    isDraftHydrated,
    activeTab,
    selectedServiceIds,
    selectedServiceId,
    pickupDate,
    selectedSlotName,
    customerName,
    customerPhone,
    newAddress.line,
    newAddress.landmark,
    newAddress.pincode,
    newAddress.latitude,
    newAddress.longitude,
    selectedAddressId,
    isEnteringNewAddress,
    refinedAddress.line,
    refinedAddress.landmark,
    refinedAddress.pincode,
    refinedAddress.latitude,
    refinedAddress.longitude,
    isRefiningAddress,
    appliedCoupon,
    bookingStep,
    submissionId,
    currentUser?.id,
    currentUser?.email
  ]);

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
          ? newAddress.line
          : (addresses.find((a) => a.id === selectedAddressId)?.address_line || ''),
        pickup_pincode: isEnteringNewAddress
          ? newAddress.pincode
          : (addresses.find((a) => a.id === selectedAddressId)?.pincode || ''),
        pickup_date: pickupDate,
        pickup_slot: selectedSlotName,
        service_id: selectedServiceId
      });

      if (currentFingerprint !== pendingRecovery.fingerprint) {
        // Only discard if status is strictly in_flight and was uncompleted
        clearPendingBooking(currentUser?.id);
        setPendingRecovery(null);
        setSubmissionId(generateClientSubmissionId());
      }
    } else {
      setSubmissionId(generateClientSubmissionId());
    }
  }, [selectedServiceId, selectedSlotName, pickupDate, selectedAddressId, newAddress.line, newAddress.pincode, pendingRecovery, customerPhone, currentUser]);

  // Onboarding Modal State (Prompt for phone and initial address if missing after Google sign-in)
  const [onboardingModal, setOnboardingModal] = useState<OnboardingModalState>(DEFAULT_ONBOARDING_MODAL_STATE);
  const updateOnboardingModal = (patch: Partial<OnboardingModalState>) =>
    setOnboardingModal((prev) => ({ ...prev, ...patch }));

  // Modals
  const [selectedPaymentOrder, setSelectedPaymentOrder] = useState<Order | null>(null);
  const [selectedFeedbackOrder, setSelectedFeedbackOrder] = useState<Order | null>(null);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);

  const handleTabChange = (tab: 'home' | 'book' | 'current' | 'history' | 'addresses' | 'profile' | 'settings' | 'contact') => {
    if (tab === 'book') {
      const existingDraft = getGuestBookingDraft();
      if (!existingDraft) {
        setSubmissionId(generateClientSubmissionId());
        setBookingStep(1);
      }
    }
    setActiveTab(tab);
    setBookingError(null);
    setBookingStepError(null);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', tab);
        return p;
      },
      { replace: true }
    );
  };

  const handleSelectServiceAndBook = (serviceId: string) => {
    setSelectedServiceIds([serviceId]);
    handleTabChange('book');
    setBookingStep(1);
  };

  // Step advancement logic for 3-step simplified booking flow:
  // Step 1: What & When (Laundry Services & Pickup Schedule)
  // Step 2: Where & Who (Customer Contact & Doorstep Map Pin / Address)
  // Step 3: Review & Confirm (Order Summary, Promotional Coupon, COD Payment & Confirm)
  const handleNextStep = async (current: number) => {
    setBookingStepError(null);
    setBookingError(null);

    if (current === 1) {
      if (!pickupDate) {
        setBookingStepError('Please select a pickup date.');
        return;
      }
      if (selectedServiceIds.length === 0 && services.length > 0) {
        setSelectedServiceIds([services[0].id]);
      }
      if (!selectedSlotName) {
        setSelectedSlotName('Morning (08:00 AM - 11:00 AM)');
      }
      setBookingStep(2);
    } else if (current === 2) {
      // Validate Contact
      const cleanPhone = (customerPhone || currentUser?.phone || '').replace(/[^0-9]/g, '');
      if (!cleanPhone || cleanPhone.length < 10) {
        setBookingStepError('Please enter a valid 10-digit Indian mobile number.');
        return;
      }
      if (!customerName.trim()) {
        setBookingStepError('Please enter your full name.');
        return;
      }

      // Validate Address
      if (isEnteringNewAddress || addresses.length === 0) {
        if (!newAddress.line.trim()) {
          setBookingStepError('Please enter your complete pickup address.');
          return;
        }
        const pin = newAddress.pincode.trim().replace(/\D/g, '');
        if (pin.length !== 6 || !/^[1-9][0-9]{5}$/.test(pin)) {
          setBookingStepError('Please enter a valid 6-digit Indian PIN code.');
          return;
        }
        const isServiceable = await LaundryService.isPincodeServiceable(pin);
        if (!isServiceable) {
          const area = await LaundryService.getServiceAreaForPincode(pin);
          const areaSuffix = area ? ` (${area.area_name || area.name})` : '';
          setBookingStepError(`PIN code ${pin}${areaSuffix} is currently outside our service coverage. Please select or enter a serviceable address.`);
          return;
        }
      } else {
        const chosen = addresses.find((a) => a.id === selectedAddressId);
        if (!chosen) {
          setBookingStepError('Please select a saved pickup address or enter a new one.');
          return;
        }
        const pin = (chosen.pincode || '').trim().replace(/\D/g, '');
        if (pin.length === 6) {
          const isServiceable = await LaundryService.isPincodeServiceable(pin);
          if (!isServiceable) {
            setBookingStepError(`Your saved address PIN code ${pin} is currently outside our service coverage. Please select or enter another address.`);
            return;
          }
        }
      }

      // Default COD payment method
      setSelectedPaymentMethod('cash');
      setBookingStep(3);
    } else if (current === 3) {
      // Step 3 triggers final booking creation
      handleCreateBooking();
    }
  };

  const handlePrevStep = () => {
    setBookingStepError(null);
    setBookingError(null);
    setBookingStep((prev) => Math.max(1, prev - 1));
  };

  const handleStepIndicatorClick = (targetStep: number) => {
    setBookingStepError(null);
    if (targetStep > bookingStep) {
      if (bookingStep === 1 && (selectedServiceIds.length === 0 || !pickupDate || !selectedSlotName)) {
        setBookingStepError('Please select a service, date, and pickup slot before proceeding.');
        return;
      }
      if (targetStep >= 3) {
        const cleanPhone = (customerPhone || currentUser?.phone || '').replace(/[^0-9]/g, '');
        if (!cleanPhone || cleanPhone.length < 10 || !customerName.trim()) {
          setBookingStepError('Please enter your full name and 10-digit mobile number first.');
          return;
        }
        if (isEnteringNewAddress || addresses.length === 0) {
          if (!newAddress.line.trim() || newAddress.pincode.trim().length !== 6) {
            setBookingStepError('Please complete your pickup address first.');
            return;
          }
        } else if (!selectedAddressId) {
          setBookingStepError('Please select or complete your pickup address first.');
          return;
        }
      }
    }
    setBookingStep(targetStep);
  };

      const handleUpdateCustomerProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        setIsUpdatingProfile(true);
        setProfileUpdateError(null);
        setProfileUpdateSuccess(null);

        const cleanPhone = profilePhoneInput.replace(/[^0-9]/g, '');
        if (cleanPhone && cleanPhone.length < 10) {
          setProfileUpdateError('Please enter a valid 10-digit mobile number.');
          setIsUpdatingProfile(false);
          return;
        }

        try {
          const res = await updateProfile({
            phone: cleanPhone || undefined,
            full_name: profileFullNameInput.trim() || undefined
          });
          if (res.success) {
            setProfileUpdateSuccess('Profile updated successfully.');
            setCustomerPhone(cleanPhone);
            setCustomerName(profileFullNameInput.trim());
          } else {
            setProfileUpdateError(res.message || 'Failed to update profile.');
          }
        } catch (err: any) {
          setProfileUpdateError(err.message || 'Error updating profile.');
        } finally {
          setIsUpdatingProfile(false);
        }
      };

      const handleDismissConfirmation = () => {
        setBookingSuccessOrder(null);
        try {
          sessionStorage.removeItem(CONFIRMED_ORDER_KEY);
        } catch { }
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.delete('confirmed');
            return p;
          },
          { replace: true }
        );
      };

      /**
       * Consolidates post-booking state updates across creation, status verification, and timeout recovery.
       * Preserves bookingSuccessOrder state, sessionStorage timestamped payload, orders list deduplication, and URL navigation.
       */
      const commitConfirmedBookingState = (primaryOrder: Order, batchOrders?: Order[]) => {
        const ordersToCommit = batchOrders && batchOrders.length > 0 ? batchOrders : [primaryOrder];
        setBookingSuccessOrder(primaryOrder);
        try {
          sessionStorage.setItem(
            CONFIRMED_ORDER_KEY,
            JSON.stringify({
              ...primaryOrder,
              timestamp: Date.now()
            })
          );
        } catch { }

        setOrders((prev) => {
          const newIds = new Set(ordersToCommit.map((o) => o.id));
          const filtered = prev.filter((o) => !newIds.has(o.id));
          return [...ordersToCommit, ...filtered];
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
              const isOwner = isCustomerOrderOwner(parsed, currentUser);

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
          if (matched && isCustomerOrderOwner(matched, currentUser)) {
            setBookingSuccessOrder(matched);
          }
        }
      }, [orders, searchParams, currentUser, isAuthLoading]);

      // FIX 2: Clear stored confirmation on logout or account switch
      useEffect(() => {
        if (isAuthLoading) return;
        if (bookingSuccessOrder && !isCustomerOrderOwner(bookingSuccessOrder, currentUser)) {
          setBookingSuccessOrder(null);
          try { sessionStorage.removeItem(CONFIRMED_ORDER_KEY); } catch { }
        }
      }, [currentUser, bookingSuccessOrder, isAuthLoading]);

      useEffect(() => {
        if (currentUser) {
          const existingDraft = getGuestBookingDraft();
          if (!existingDraft?.payload?.customer_phone) {
            setCustomerPhone(currentUser.phone || '');
          }
          if (!existingDraft?.payload?.customer_name) {
            setCustomerName(currentUser.full_name || 'Customer');
          }
          if (currentUser.role === 'customer' && (!currentUser.phone || currentUser.phone.trim().length < 10)) {
            // Suppress onboarding popup if guest booking draft is present
            if (!existingDraft) {
              updateOnboardingModal({
                isOpen: true,
                name: currentUser.full_name || 'Customer'
              });
            }
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
        updateOnboardingModal({ isLocating: true, locationFeedback: 'Acquiring high-accuracy GPS...' });
        requestDeviceLocation(
          async (lat, lng, details) => {
            let addrSug = '';
            let pinSug = '';
            try {
              const geo = await LocationService.reverseGeocode(lat, lng);
              if (geo) {
                addrSug = geo.addressLine || geo.area;
                pinSug = geo.pincode;
              }
            } catch {}

            setOnboardingModal((prev) => ({
              ...prev,
              latitude: lat,
              longitude: lng,
              address: prev.address.trim() ? prev.address : (addrSug || prev.address),
              pincode: prev.pincode.trim() && prev.pincode !== '560103' ? prev.pincode : (pinSug || prev.pincode),
              locationFeedback: details?.message || 'High-accuracy GPS location attached!'
            }));
          },
          (errType) => {
            const msgs = {
              unsupported: 'Geolocation is not supported by your browser.',
              invalid: 'Invalid location received from device.',
              permission_denied: 'Location permission denied. Enter address manually.',
              timeout: 'Location request timed out. Enter address manually.',
              error: 'Could not determine GPS position.'
            };
            updateOnboardingModal({ locationFeedback: msgs[errType] });
          },
          () => updateOnboardingModal({ isLocating: false })
        );
      };

      const handleSaveOnboarding = async (e: React.FormEvent) => {
        e.preventDefault();
        updateOnboardingModal({ error: null });
        const clean = onboardingModal.phone.replace(/[^0-9]/g, '').slice(-10);
        if (clean.length < 10) {
          updateOnboardingModal({ error: 'Please enter a valid 10-digit Indian mobile number.' });
          return;
        }

        updateOnboardingModal({ isSaving: true });
        try {
          const res = await updateProfile({
            phone: clean,
            full_name: onboardingModal.name.trim() || currentUser?.full_name
          });
          if (!res.success) {
            updateOnboardingModal({ error: res.message, isSaving: false });
            return;
          }

          // If address provided and user has no addresses, save it
          if (onboardingModal.address.trim() && currentUser) {
            const savedAddr = await LaundryService.saveAddress({
              user_id: currentUser.id,
              label: 'Home',
              address_line: onboardingModal.address.trim(),
              landmark: onboardingModal.landmark.trim() || undefined,
              pincode: onboardingModal.pincode.trim(),
              is_default: true,
              latitude: onboardingModal.latitude,
              longitude: onboardingModal.longitude
            });
            setAddresses([savedAddr]);
            setSelectedAddressId(savedAddr.id);
            setIsEnteringNewAddress(false);
          }

          updateOnboardingModal({ isOpen: false });
          setCustomerPhone(clean);
          setCustomerName(onboardingModal.name.trim() || customerName);
        } catch (err: any) {
          updateOnboardingModal({ error: formatCustomerError(err, 'Error saving profile. Please verify your details and try again.') });
        } finally {
          updateOnboardingModal({ isSaving: false });
        }
      };

      const handleGetCurrentLocation = () => {
        setIsLocating(true);
        setLocationFeedback({
          type: 'loading',
          message: 'Acquiring high-accuracy GPS fix from device...'
        });
        requestDeviceLocation(
          async (lat, lng, details) => {
            let addrSug = '';
            let pinSug = '';
            try {
              const geo = await LocationService.reverseGeocode(lat, lng);
              if (geo) {
                addrSug = geo.addressLine || geo.area;
                pinSug = geo.pincode;
              }
            } catch {}

            setNewAddress((prev) => ({
              ...prev,
              latitude: lat,
              longitude: lng,
              line: prev.line.trim() ? prev.line : (addrSug || prev.line),
              pincode: prev.pincode.trim() && prev.pincode !== '560103' ? prev.pincode : (pinSug || prev.pincode)
            }));

            setLocationFeedback({
              type: 'success',
              message: `${details?.message || 'High-accuracy GPS attached!'} (${lat.toFixed(4)}, ${lng.toFixed(4)})${addrSug ? ` near ${addrSug}` : ''}`
            });
          },
          (errType) => {
            const msgs = {
              unsupported: 'Geolocation is not supported by your browser. Please enter address manually.',
              invalid: 'Invalid coordinates received from device. Please enter address manually.',
              permission_denied: 'Location permission was denied. You can continue by entering your address manually or picking on the map.',
              timeout: 'GPS location request timed out. Please enter your address manually or pick on the map.',
              error: 'Could not determine GPS position. Please enter your address manually or pick on the map.'
            };
            setLocationFeedback({
              type: errType === 'unsupported' || errType === 'invalid' ? 'error' : errType,
              message: msgs[errType]
            });
          },
          () => setIsLocating(false)
        );
      };

      const handleClearLocation = () => {
        updateNewAddress({ latitude: null, longitude: null });
        setLocationFeedback(null);
      };

      // Map Pin Confirmation Handler
      const handleMapPinConfirmed = (coords: {
        latitude: number;
        longitude: number;
        addressSuggestion?: string;
        pincodeSuggestion?: string;
        areaSuggestion?: string;
        formattedAddress?: string;
        flatBuilding?: string;
        street?: string;
        pincode?: string;
        isVerified?: boolean;
      }) => {
        const { latitude, longitude, formattedAddress, addressSuggestion, pincodeSuggestion } = coords;
        const confirmedAddress = formattedAddress || addressSuggestion;
        const confirmedPin = coords.pincode || pincodeSuggestion;

        switch (mapPickerState.target) {
          case 'booking_new':
            setNewAddress((prev) => ({
              ...prev,
              latitude,
              longitude,
              line: confirmedAddress ? confirmedAddress : prev.line,
              pincode: confirmedPin ? confirmedPin : prev.pincode
            }));
            setLocationFeedback({
              type: 'success',
              message: `Doorstep pin confirmed on map (${latitude.toFixed(4)}, ${longitude.toFixed(4)})${confirmedAddress ? ` - ${confirmedAddress}` : ''}`
            });
            break;
          case 'booking_refine':
            setRefinedAddress((prev) => ({
              ...prev,
              latitude,
              longitude,
              line: confirmedAddress ? confirmedAddress : prev.line,
              pincode: confirmedPin ? confirmedPin : prev.pincode
            }));
            break;
          case 'address_modal':
            setAddressModal((prev) => ({
              ...prev,
              latitude,
              longitude,
              address_line: confirmedAddress ? confirmedAddress : prev.address_line,
              pincode: confirmedPin ? confirmedPin : prev.pincode
            }));
            break;
          case 'order_edit':
            setOrderLocationModal((prev) => ({
              ...prev,
              latitude,
              longitude,
              address: confirmedAddress ? confirmedAddress : prev.address,
              pincode: confirmedPin ? confirmedPin : prev.pincode
            }));
            break;
        }
        setMapPickerState((prev) => ({ ...prev, isOpen: false, target: null }));
      };

      const handleOpenMapPicker = (target: 'booking_new' | 'booking_refine') => {
        const isRefine = target === 'booking_refine';
        const lat = isRefine ? refinedAddress.latitude : newAddress.latitude;
        const lng = isRefine ? refinedAddress.longitude : newAddress.longitude;
        const addressContext = isRefine ? refinedAddress.line : newAddress.line;
        setMapPickerState({
          isOpen: true,
          target,
          initialLat: lat,
          initialLng: lng,
          addressContext,
          title: isRefine ? 'Adjust Pin for Refined Address' : 'Pin Pickup Location on Map'
        });
      };

      // Populate refined address fields from selected CustomerAddress
      const populateRefinedAddress = (addr: CustomerAddress) => {
        setSelectedAddressId(addr.id);
        setRefinedAddress({
          line: addr.address_line,
          landmark: addr.landmark || '',
          pincode: addr.pincode,
          latitude: addr.latitude ?? null,
          longitude: addr.longitude ?? null
        });
        setIsRefiningAddress(false);
      };

      // Address Selection & Pre-population for Refinement
      const handleSelectSavedAddress = (addr: CustomerAddress) => {
        populateRefinedAddress(addr);
      };

      // Address CRUD Handlers (My Addresses Tab)
      const handleOpenAddAddress = () => {
        setAddressModal({
          ...DEFAULT_ADDRESS_MODAL_STATE,
          isOpen: true,
          is_default: addresses.length === 0
        });
      };

      const handleOpenEditAddress = (addr: CustomerAddress) => {
        setAddressModal({
          isOpen: true,
          editingId: addr.id,
          label: addr.label,
          address_line: addr.address_line,
          landmark: addr.landmark || '',
          pincode: addr.pincode,
          latitude: addr.latitude ?? null,
          longitude: addr.longitude ?? null,
          is_default: addr.is_default,
          isSaving: false,
          error: null,
          success: null
        });
      };

      const handleSaveAddress = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        updateAddressModal({ error: null });

        const trimmedLine = addressModal.address_line.trim();
        const trimmedPin = addressModal.pincode.trim().replace(/\D/g, '');
        if (!trimmedLine) {
          updateAddressModal({ error: 'Please enter a valid address line.' });
          return;
        }
        if (!trimmedPin) {
          updateAddressModal({ error: 'Please enter a valid PIN code.' });
          return;
        }
        if (trimmedPin.length !== 6 || !/^[1-9][0-9]{5}$/.test(trimmedPin)) {
          updateAddressModal({ error: 'Please enter a valid 6-digit Indian PIN code.' });
          return;
        }

          updateAddressModal({ isSaving: true });
          try {
            if (addressModal.editingId) {
              const updated = await LaundryService.updateAddress(addressModal.editingId, {
                label: addressModal.label,
                address_line: trimmedLine,
                landmark: addressModal.landmark.trim() || undefined,
                pincode: trimmedPin,
                latitude: addressModal.latitude,
                longitude: addressModal.longitude,
                is_default: addressModal.is_default,
                user_id: currentUser.id
              });
              setAddresses((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
              if (selectedAddressId === updated.id) {
                populateRefinedAddress(updated);
              }
              updateAddressModal({ success: 'Address updated successfully.' });
            } else {
              const saved = await LaundryService.saveAddress({
                user_id: currentUser.id,
                label: addressModal.label,
                address_line: trimmedLine,
                landmark: addressModal.landmark.trim() || undefined,
                pincode: trimmedPin,
                latitude: addressModal.latitude,
                longitude: addressModal.longitude,
                is_default: addressModal.is_default
              });
              setAddresses((prev) => {
                const exists = prev.some((a) => a.id === saved.id);
                return exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [...prev, saved];
              });
              populateRefinedAddress(saved);
              updateAddressModal({ success: 'Address saved successfully.' });
            }
            setTimeout(() => {
              updateAddressModal({ isOpen: false, success: null });
            }, 700);
          } catch (err: any) {
            updateAddressModal({ error: formatCustomerError(err) || 'Failed to save address.' });
          } finally {
            updateAddressModal({ isSaving: false });
          }
        };

        const handleConfirmDeleteAddress = async () => {
          if (!addressToDelete || !currentUser) return;
          setIsDeletingAddress(true);
          setAddressDeleteError(null);
          try {
            await LaundryService.deleteAddress(addressToDelete.id, currentUser.id);
            setAddresses((prev) => {
              const remaining = prev.filter((a) => a.id !== addressToDelete.id);
              if (selectedAddressId === addressToDelete.id) {
                if (remaining.length > 0) {
                  populateRefinedAddress(remaining[0]);
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
          setOrderLocationModal({
            order,
            address: order.pickup_address || '',
            landmark: order.pickup_landmark || '',
            pincode: order.pickup_pincode || '560038',
            latitude: order.pickup_latitude ?? null,
            longitude: order.pickup_longitude ?? null,
            isSaving: false,
            error: null,
            success: null
          });
        };

        const handleSaveOrderLocation = async (e: React.FormEvent) => {
          e.preventDefault();
          if (!orderLocationModal.order) return;
          updateOrderLocationModal({ error: null });

          const trimmedAddress = orderLocationModal.address.trim();
          const trimmedPin = orderLocationModal.pincode.trim().replace(/\D/g, '');
          if (!trimmedAddress) {
            updateOrderLocationModal({ error: 'Please enter a valid pickup address.' });
            return;
          }
          if (!trimmedPin) {
            updateOrderLocationModal({ error: 'Please enter a valid PIN code.' });
            return;
          }
          if (trimmedPin.length !== 6 || !/^[1-9][0-9]{5}$/.test(trimmedPin)) {
            updateOrderLocationModal({ error: 'Please enter a valid 6-digit Indian PIN code.' });
            return;
          }

            updateOrderLocationModal({ isSaving: true });
            try {
              const updatedOrder = await LaundryService.updateOrderPickupLocation(orderLocationModal.order.id, {
                pickup_address: trimmedAddress,
                pickup_landmark: orderLocationModal.landmark.trim() || undefined,
                pickup_pincode: trimmedPin,
                pickup_latitude: orderLocationModal.latitude,
                pickup_longitude: orderLocationModal.longitude
              });
              setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
              updateOrderLocationModal({ success: 'Pickup location updated successfully.' });
              setTimeout(() => {
                setOrderLocationModal(DEFAULT_ORDER_LOCATION_STATE);
              }, 700);
            } catch (err: any) {
              updateOrderLocationModal({ error: formatCustomerError(err) || 'Could not update pickup location.' });
            } finally {
              updateOrderLocationModal({ isSaving: false });
            }
          };

          const loadData = async () => {
            setIsLoading(true);
            setDataLoadError(null);
            try {
              const [s, sl, ords, srv, activeCoupons, sa] = await Promise.all([
                LaundryService.getSettings(),
                LaundryService.getSlots(),
                currentUser ? LaundryService.getCustomerOrders(currentUser.id, currentUser.phone) : [],
                LaundryService.getServices(false),
                LaundryService.getPublicPromotions(),
                LaundryService.getServiceAreas()
              ]);
              setSettings(s);
              setServices(srv || []);
              setAvailablePromotions(activeCoupons || []);
              setServiceAreas(sa || []);
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
                  LaundryService.getAddresses(currentUser.id),
                  LaundryService.getFeedbackForCustomer(currentUser.id)
                ]);
                setAddresses(addrs);
                if (addrs.length > 0) {
                  const def = addrs.find((a) => a.is_default) || addrs[0];
                  populateRefinedAddress(def);
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

          const handleCreateBooking = async (e?: React.FormEvent) => {
            if (e && e.preventDefault) e.preventDefault();
            if (isBookingSubmitting || isResolvingPending) return;
            setBookingError(null);

            // FIX 3: Unauthenticated booking guard - save guest draft and redirect preserving return destination
            if (!currentUser) {
              autoSaveGuestDraft(bookingStep >= 3 ? bookingStep : 3);
              setBookingError('Sign-in required: Please sign in with your account to confirm your pickup booking.');
              const returnUrl = '/customer?tab=book&resume=draft';
              navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`);
              return;
            }

            // Guard against creating a duplicate booking while an uncertain submission is unresolved:
            // Intelligently route to completing or verifying the pending booking
            if (pendingRecovery?.status === 'uncertain_timeout') {
              if (statusCheckOutcome === 'not_found') {
                handleCompleteUncommittedBooking();
                return;
              }
              handleResolvePendingBooking();
              return;
            }

            let addressLine = '';
            let landmark = '';
            let pincode = '';
            let latitude: number | null = null;
            let longitude: number | null = null;

            if (isEnteringNewAddress || addresses.length === 0) {
              if (!newAddress.line.trim()) {
                setBookingError('Please enter your complete pickup address');
                return;
              }
              addressLine = newAddress.line.trim();
              landmark = newAddress.landmark.trim();
              pincode = newAddress.pincode.trim() || '560001';
              latitude = newAddress.latitude;
              longitude = newAddress.longitude;

              if (currentUser) {
                try {
                  const savedAddr = await LaundryService.saveAddress({
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
                if (!refinedAddress.line.trim()) {
                  setBookingError('Please enter the refined pickup address');
                  return;
                }
                addressLine = refinedAddress.line.trim();
                landmark = refinedAddress.landmark.trim();
                pincode = refinedAddress.pincode.trim() || chosen.pincode;
                latitude = refinedAddress.latitude ?? chosen.latitude ?? null;
                longitude = refinedAddress.longitude ?? chosen.longitude ?? null;

                if (updateSavedAddressBook && currentUser) {
                  try {
                    const updatedAddr = await LaundryService.updateAddress(chosen.id, {
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
                latitude = chosen.latitude ?? null;
                longitude = chosen.longitude ?? null;
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
                service_ids: finalSelectedServices.map((s) => s.id),
                coupon_code: appliedCoupon ? appliedCoupon.code : undefined,
                discount_paise: appliedCoupon ? appliedCoupon.discount_paise : 0
              }, 'in_flight');
            }

            setIsBookingSubmitting(true);

            try {
              const order = await LaundryService.createBooking({
                customer_id: currentUser?.id,
                ...basePayloadData,
                service_id: finalSelectedServices[0]?.id,
                service_ids: finalSelectedServices.map((s) => s.id),
                coupon_code: appliedCoupon ? appliedCoupon.code : undefined,
                discount_paise: appliedCoupon ? appliedCoupon.discount_paise : 0,
                coupon_snapshot: appliedCoupon ? {
                  code: appliedCoupon.code,
                  discount_type: appliedCoupon.discount_type,
                  discount_value: appliedCoupon.discount_value,
                  min_order_paise: appliedCoupon.min_order_paise,
                  max_discount_paise: appliedCoupon.max_discount_paise
                } : null,
                client_submission_id: submissionId
              });

              // Request succeeded: clear pending record and draft immediately
              if (currentUser?.id) {
                clearPendingBooking(currentUser.id);
              }
              clearGuestBookingDraft();
              setRestoredDraftNotice(null);
              setPendingRecovery(null);

              // Renew submission ID for any subsequent separate booking
              setSubmissionId(generateClientSubmissionId());

              commitConfirmedBookingState(order);
            } catch (err: any) {
              if (err?.code === 'BOOKING_SERVICE_UNAVAILABLE' || err?.code === 'SCHEMA_OR_SERVICE_UNAVAILABLE') {
                // Database migration missing or service undergoing upgrades: PRESERVE pending record!
                const updated = updatePendingBookingStatus('uncertain_timeout');
                if (updated) {
                  setPendingRecovery(updated);
                }
                setBookingError(
                  'The booking service is temporarily undergoing upgrades. Your pending booking is safely preserved. Please retry once the service is available.'
                );
              } else if (isAmbiguousNetworkError(err)) {
                // Retain pending record with 'uncertain_timeout' status
                const updated = updatePendingBookingStatus('uncertain_timeout');
                if (updated) {
                  setPendingRecovery(updated);
                }
                setBookingError(
                  'Network connection timed out. Your request may have reached our server. Please click "Verify & Complete Booking" to resolve your order without creating a duplicate.'
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
            if (!currentUser || !pendingRecovery || isResolvingPending || isBookingSubmitting) return;

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
                setSubmissionId(generateClientSubmissionId());
                commitConfirmedBookingState(existingOrder);
                return;
              }

              // 2. If no order exists in database, update status check outcome (clear bookingError so no contradictory red alert appears)
              setStatusCheckOutcome('not_found');
              setBookingError(null);
            } catch (err: any) {
              if (isAuthExpiredError(err)) {
                setBookingError(
                  'Your sign-in session has expired. Please sign in again to verify your booking status.'
                );
              } else if (err?.code === 'SCHEMA_OR_SERVICE_UNAVAILABLE' || err?.code === 'BOOKING_SERVICE_UNAVAILABLE') {
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
            if (!currentUser || !pendingRecovery || isResolvingPending || isBookingSubmitting) return;

            setIsResolvingPending(true);
            setBookingError(null);

            // Normalize pickup date so it is never in the past (which PostgreSQL rejects with P0001)
            const todayStr = getTodayDateIST();
            const payloadDate = pendingRecovery.payload.pickup_date;
            const effectivePickupDate = (payloadDate && payloadDate >= todayStr) ? payloadDate : todayStr;

            try {
              const order = await LaundryService.createBooking({
                customer_id: currentUser.id,
                ...pendingRecovery.payload,
                pickup_date: effectivePickupDate,
                client_submission_id: pendingRecovery.clientSubmissionId
              });

              clearPendingBooking(currentUser.id);
              setPendingRecovery(null);
              setStatusCheckOutcome(null);
              setSubmissionId(generateClientSubmissionId());
              commitConfirmedBookingState(order);
            } catch (err: any) {
              if (isAuthExpiredError(err)) {
                setBookingError(
                  'Your sign-in session has expired. Please sign in again to complete your booking.'
                );
              } else if (err?.code === 'BOOKING_SERVICE_UNAVAILABLE' || err?.code === 'SCHEMA_OR_SERVICE_UNAVAILABLE') {
                setBookingError(
                  'The booking service is temporarily unavailable while database upgrades are pending. Your pending booking is safely preserved. Please try again in a few moments.'
                );
              } else if (isAmbiguousNetworkError(err)) {
                setBookingError(
                  'Network connection timed out. We are keeping your pending booking record safe. Please check your connection and retry.'
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
            setBookingError(null);
            setSubmissionId(generateClientSubmissionId());
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
            return acc + PricingEngine.calculateSubtotal(minQty > 0 ? minQty : 1, price, s.pricing_unit || 'per_kg');
          }, 0);

          const minBill = ((combinedEstimatedSubtotalPaise) / 100).toFixed(0);

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
                activeSelectedServices.length === 1 ? selectedService?.id : undefined,
                true // Option A: Booking phase preliminary estimate
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

          // Auto-apply coupon from URL if present (e.g. from promotional banner carousel)
          const couponQueryParam = searchParams.get('coupon');
          useEffect(() => {
            if (couponQueryParam && !appliedCoupon) {
              handleApplyCoupon(couponQueryParam);
            }
          }, [couponQueryParam]);

          // Restore guest booking draft on mount or after login redirect
          useEffect(() => {
            if (isAuthLoading) return;
            if (hasRestoredDraftRef.current) return;

            const draft = getGuestBookingDraft();
            if (!draft) {
              hasRestoredDraftRef.current = true;
              setIsDraftHydrated(true);
              return;
            }

            // Check account isolation: if draft was created by user-A and user-B logs in
            if (currentUser && isDraftAccountMismatch(draft, currentUser.id)) {
              setDraftAccountMismatch({ draft, currentUserId: currentUser.id });
              hasRestoredDraftRef.current = true;
              setIsDraftHydrated(true);
              return;
            }

            hasRestoredDraftRef.current = true;

            // 1. Services
            if (draft.payload.service_ids && draft.payload.service_ids.length > 0) {
              setSelectedServiceIds(draft.payload.service_ids);
            } else if (draft.payload.service_id) {
              setSelectedServiceIds([draft.payload.service_id]);
            }

            // 2. Pickup Date & Slot
            const todayStr = getTodayDateIST();
            let targetDate = draft.payload.pickup_date;
            if (!targetDate || targetDate < todayStr) {
              targetDate = todayStr;
            }
            setPickupDate(targetDate);

            if (draft.payload.pickup_slot) {
              setSelectedSlotName(draft.payload.pickup_slot);
            }

            // 3. Contact Details
            // Per instructions: Restore into form, ask customer to confirm, DO NOT silently update profile.
            if (draft.payload.customer_name) {
              setCustomerName(draft.payload.customer_name);
            } else if (currentUser?.full_name) {
              setCustomerName(currentUser.full_name);
            }

            if (draft.payload.customer_phone) {
              setCustomerPhone(draft.payload.customer_phone);
            } else if (currentUser?.phone) {
              setCustomerPhone(currentUser.phone);
            }

            // 4. Address & Doorstep GPS Pin
            if (draft.payload.pickup_address) {
              setNewAddress({
                line: draft.payload.pickup_address,
                landmark: draft.payload.pickup_landmark || '',
                pincode: draft.payload.pickup_pincode || '560103',
                latitude: draft.payload.pickup_latitude ?? null,
                longitude: draft.payload.pickup_longitude ?? null
              });
              setIsEnteringNewAddress(true);
            }

            // 5. Client submission ID (idempotency preservation)
            if (draft.payload.client_submission_id) {
              setSubmissionId(draft.payload.client_submission_id);
            }

            // 6. Coupon Revalidation (uses authoritative handleApplyCoupon)
            if (draft.payload.coupon_code) {
              handleApplyCoupon(draft.payload.coupon_code);
            }

            // 7. Booking Step: Restore to step 3 (Review & Confirm) if user was on step 3 or beyond
            const step = draft.payload.booking_step || 1;
            setBookingStep(step >= 3 ? 3 : step);
            setActiveTab('book');

            // 8. Notice Banner
            setRestoredDraftNotice(
              'Welcome back! Your pickup details have been saved. Please review and confirm your booking.'
            );

            // Allow subsequent user edits to auto-save to storage
            setIsDraftHydrated(true);
          }, [currentUser, isAuthLoading, services]);

          // Internal JSX Helpers for Address Input & Map Pin Box Consolidation (Stage 3C)
          const renderAddressInputFields = (cfg: {
            line: string;
            landmark: string;
            pincode: string;
            onLineChange: (val: string) => void;
            onLandmarkChange: (val: string) => void;
            onPincodeChange: (val: string) => void;
            lineLabel?: React.ReactNode;
            landmarkLabel?: React.ReactNode;
            pincodeLabel?: React.ReactNode;
            labelClass?: string;
            linePlaceholder?: string;
            landmarkPlaceholder?: string;
            pincodePlaceholder?: string;
            required?: boolean;
            pinRequired?: boolean;
            pinMaxLength?: number;
            inputClass?: string;
            subInputClass?: string;
            middleSlot?: React.ReactNode;
          }) => {
            const lblClass = cfg.labelClass || 'block font-bold text-slate-700 mb-1';
            const mainClass = cfg.inputClass || 'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-medium';
            const subClass = cfg.subInputClass || cfg.inputClass || 'w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500';

            return (
              <>
                <div>
                  {cfg.lineLabel && <label className={lblClass}>{cfg.lineLabel}</label>}
                  <input
                    type="text"
                    placeholder={cfg.linePlaceholder}
                    value={cfg.line}
                    onChange={(e) => cfg.onLineChange(e.target.value)}
                    className={mainClass}
                    required={cfg.required}
                  />
                </div>

                {cfg.middleSlot}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    {cfg.landmarkLabel && <label className={lblClass}>{cfg.landmarkLabel}</label>}
                    <input
                      type="text"
                      placeholder={cfg.landmarkPlaceholder}
                      value={cfg.landmark}
                      onChange={(e) => cfg.onLandmarkChange(e.target.value)}
                      className={subClass}
                    />
                  </div>
                  <div>
                    {cfg.pincodeLabel && <label className={lblClass}>{cfg.pincodeLabel}</label>}
                    <input
                      type="text"
                      maxLength={cfg.pinMaxLength}
                      placeholder={cfg.pincodePlaceholder}
                      value={cfg.pincode}
                      onChange={(e) => cfg.onPincodeChange(e.target.value)}
                      className={`${subClass} font-mono`}
                      required={cfg.pinRequired}
                    />
                    {(() => {
                      const cov = getPincodeCoverageInfo(cfg.pincode);
                      if (!cov) return null;
                      if (cov.isActive) {
                        return (
                          <p className="mt-1 text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span>{cov.areaName ? `${cov.areaName} (Covered)` : 'Covered Zone'}</span>
                          </p>
                        );
                      }
                      return (
                        <p className="mt-1 text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>Outside coverage area</span>
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </>
            );
          };

          const renderMapPinBox = (
            lat: number | null,
            lng: number | null,
            target: 'booking_refine' | 'address_modal' | 'order_edit',
            addressContext: string,
            title: string,
            options?: {
              label?: string;
              fallbackText?: string;
              buttonText?: string;
              cardStyle?: boolean;
            }
          ) => {
            const hasPin = Boolean(lat && lng);
            const cardStyle = options?.cardStyle ?? true;
            const buttonLabel = options?.buttonText || (hasPin ? 'Change Pin' : 'Set Pin on Map');

            return (
              <div className={`flex items-center justify-between ${cardStyle ? 'p-3 bg-slate-50 rounded-2xl border border-slate-200' : 'pt-1'}`}>
                <div className={cardStyle ? 'space-y-0.5' : 'text-[11px] text-slate-600 font-mono'}>
                  {cardStyle && options?.label && (
                    <span className="block font-bold text-slate-700">{options.label}</span>
                  )}
                  <span className={`block font-mono ${cardStyle ? 'text-[11px] text-slate-500' : hasPin ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                    {hasPin ? (cardStyle ? `${lat!.toFixed(4)}, ${lng!.toFixed(4)}` : `📍 Pin: ${lat!.toFixed(4)}, ${lng!.toFixed(4)}`) : (options?.fallbackText || 'Not pinned yet')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMapPickerState({
                    isOpen: true,
                    target,
                    initialLat: lat,
                    initialLng: lng,
                    addressContext,
                    title
                  })}
                  className={`py-1.5 px-3 bg-white text-brand-700 font-bold border border-brand-300 flex items-center gap-1.5 cursor-pointer shadow-sm transition ${cardStyle ? 'hover:bg-slate-100 rounded-xl text-xs' : 'hover:bg-slate-50 rounded-lg text-[11px]'
                    }`}
                >
                  <Navigation className="w-3.5 h-3.5 text-brand-600" />
                  <span>{buttonLabel}</span>
                </button>
              </div>
            );
          };

          const renderModalFooter = (cfg: {
            onCancel: () => void;
            submitLabel: string;
            loadingLabel?: string;
            isSubmitting: boolean;
            submitTestId?: string;
            submitVariant?: 'brand' | 'danger';
            submitType?: 'submit' | 'button';
            onSubmitClick?: () => void;
            icon?: React.ReactNode;
          }) => {
            const isDanger = cfg.submitVariant === 'danger';
            const bgClass = isDanger ? 'bg-red-600 hover:bg-red-700 px-4' : 'bg-brand-600 hover:bg-brand-700 px-5';

            return (
              <div className="flex items-center gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={cfg.onCancel}
                  className="py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type={cfg.submitType || 'submit'}
                  onClick={cfg.onSubmitClick}
                  disabled={cfg.isSubmitting}
                  className={`py-2.5 ${bgClass} text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50`}
                  data-testid={cfg.submitTestId}
                >
                  {cfg.isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    cfg.icon || null
                  )}
                  <span>{cfg.isSubmitting ? (cfg.loadingLabel || 'Saving...') : cfg.submitLabel}</span>
                </button>
              </div>
            );
          };

          const renderModalShell = (cfg: {
            testId?: string;
            maxWidth?: 'max-w-lg' | 'max-w-md' | 'max-w-sm';
            icon?: React.ReactNode;
            title: React.ReactNode;
            subtitle?: React.ReactNode;
            error?: string | null;
            success?: string | null;
            notice?: React.ReactNode;
            onClose?: () => void;
            children: React.ReactNode;
          }) => {
            const alignClass = !cfg.icon && cfg.subtitle ? 'items-start' : 'items-center';

            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
                data-testid={cfg.testId}
              >
                <div className={`bg-white rounded-3xl w-full ${cfg.maxWidth || 'max-w-lg'} shadow-2xl border border-slate-200 p-6 space-y-4 text-xs`}>
                  <div className={`flex justify-between ${alignClass} ${cfg.onClose ? 'pb-2 border-b border-slate-100' : ''}`}>
                    <div className={`flex ${cfg.icon && cfg.maxWidth === 'max-w-sm' ? 'items-center gap-3' : 'items-center gap-2'}`}>
                      {cfg.icon}
                      <div>
                        <h3 className="font-black text-sm text-slate-900">{cfg.title}</h3>
                        {cfg.subtitle && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{cfg.subtitle}</p>
                        )}
                      </div>
                    </div>
                    {cfg.onClose && (
                      <button
                        type="button"
                        onClick={cfg.onClose}
                        className="p-1 hover:bg-slate-100 rounded-full text-slate-400 cursor-pointer shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {cfg.notice}

                  {cfg.error && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{cfg.error}</span>
                    </div>
                  )}

                  {cfg.success && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>{cfg.success}</span>
                    </div>
                  )}

                  {cfg.children}
                </div>
              </div>
            );
          };

          return (
            <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-28 sm:pb-24 md:pb-12">
              {/* PWA Installation Banner */}
              <PwaInstallPrompt variant="customer-banner" />

              {/* Top Customer Brand Bar */}
              <CustomerHeader
                settings={settings}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                hasActiveOrder={!!currentActiveOrder && currentActiveOrder.order_status !== 'delivered'}
              />

              {/* Secondary Navigation Pills (Desktop & Mobile) */}
              <div className="bg-white border-b border-slate-200 sticky top-16 sm:top-20 z-20">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2 overflow-x-auto flex gap-2 scrollbar-none">
                  <button
                    onClick={() => handleTabChange('home')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'home'
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>Home</span>
                  </button>

                  <button
                    onClick={() => handleTabChange('book')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'book'
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Book Pickup</span>
                  </button>

                  <button
                    onClick={() => handleTabChange('current')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'current'
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Track Order</span>
                    {currentActiveOrder && currentActiveOrder.order_status !== 'delivered' && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </button>

                  <button
                    onClick={() => handleTabChange('history')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      activeTab === 'history'
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>Order History ({orders.length})</span>
                  </button>

                  <button
                    onClick={() => handleTabChange('addresses')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'addresses' || activeTab === 'profile'
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>My Profile & Addresses</span>
                  </button>

                  <button
                    onClick={() => handleTabChange('settings')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'settings'
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Settings</span>
                  </button>

                  <button
                    onClick={() => handleTabChange('contact')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      activeTab === 'contact'
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>Contact & Shop</span>
                  </button>
                </div>
              </div>

              {/* Main Responsive Body (with pb-28 mobile clearance for fixed CustomerBottomNav) */}
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28 md:pb-8 w-full flex-1 space-y-6">
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

                {/* ================= 0. CUSTOMER HOME DASHBOARD TAB ================= */}
                {activeTab === 'home' && (
                  <CustomerHomeDashboard
                    currentUser={currentUser}
                    services={services}
                    settings={settings}
                    currentActiveOrder={currentActiveOrder}
                    onNavigateTab={handleTabChange}
                    onSelectServiceAndBook={handleSelectServiceAndBook}
                  />
                )}

                {/* ================= 1. BOOK A PICKUP TAB ================= */}
                {activeTab === 'book' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left Column: Form (7 cols on desktop) */}
                    <div className="lg:col-span-7 space-y-4">
                      {/* Saved Booking Draft Account Mismatch Warning */}
                      {draftAccountMismatch && (
                        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-950 space-y-2 text-xs animate-fade-in shadow-sm">
                          <div className="flex items-center gap-2 font-bold">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Saved Booking Draft from Another Account</span>
                          </div>
                          <p className="text-[11px] text-amber-900 leading-relaxed">
                            A saved booking draft was found from a previous session ({draftAccountMismatch.draft.boundUserEmail || 'another user'}). Would you like to restore it to this account or discard it?
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                const d = draftAccountMismatch.draft;
                                saveGuestBookingDraft(d.payload, {
                                  draftId: d.draftId,
                                  boundUserId: currentUser?.id,
                                  boundUserEmail: currentUser?.email
                                });
                                setDraftAccountMismatch(null);
                                hasRestoredDraftRef.current = false;
                              }}
                              className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                            >
                              Restore to this Account
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                clearGuestBookingDraft();
                                setDraftAccountMismatch(null);
                              }}
                              className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition cursor-pointer"
                            >
                              Discard Draft
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Restored Draft Confirmation Banner */}
                      {restoredDraftNotice && (
                        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs flex items-center justify-between gap-3 shadow-sm animate-fade-in">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="font-medium">{restoredDraftNotice}</span>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <button
                              type="button"
                              onClick={handleDiscardDraft}
                              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                              title="Discard this saved draft"
                            >
                              Discard
                            </button>
                            <button
                              type="button"
                              onClick={() => setRestoredDraftNotice(null)}
                              className="p-1 text-emerald-700 hover:text-emerald-900 rounded-lg hover:bg-emerald-100 transition cursor-pointer"
                              title="Dismiss notice"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {!currentUser && (
                        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs flex items-center justify-between gap-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Sign-in is required to confirm and live-track your laundry pickup booking.</span>
                          </div>
                          <Link
                            to={`/login?redirect=${encodeURIComponent('/customer?tab=book&resume=draft')}`}
                            onClick={() => autoSaveGuestDraft()}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs whitespace-nowrap transition"
                          >
                            Sign In
                          </Link>
                        </div>
                      )}

                      {/* Show error banner when not handling pending recovery or when in standard error states */}
                      {bookingError && !pendingRecovery && (
                        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{bookingError}</span>
                        </div>
                      )}

                      {/* Recovery Banner for Ambiguous / Timeout Pending Bookings */}
                      {pendingRecovery && (
                        <div className={`p-4 rounded-2xl shadow-sm animate-fade-in space-y-3 ${
                          statusCheckOutcome === 'not_found'
                            ? 'bg-sky-50 border-2 border-sky-300 text-sky-950'
                            : 'bg-amber-50 border-2 border-amber-300 text-amber-950'
                        }`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm mt-0.5 text-white ${
                                statusCheckOutcome === 'not_found' ? 'bg-sky-600' : 'bg-amber-500'
                              }`}>
                                {statusCheckOutcome === 'not_found' ? (
                                  <CheckCircle2 className="w-5 h-5" />
                                ) : (
                                  <AlertTriangle className="w-5 h-5" />
                                )}
                              </div>
                              <div>
                                <h3 className={`font-black text-sm ${
                                  statusCheckOutcome === 'not_found' ? 'text-sky-950' : 'text-amber-950'
                                }`}>
                                  Unconfirmed Booking Attempt Detected
                                </h3>
                                <p className={`text-xs mt-1 ${
                                  statusCheckOutcome === 'not_found' ? 'text-sky-800' : 'text-amber-800'
                                }`}>
                                  {statusCheckOutcome === 'not_found'
                                    ? 'Status check verified: No order was created for this previous attempt. You can now complete the booking or start fresh.'
                                    : `A network timeout interrupted your previous booking request for ${pendingRecovery.payload.pickup_date} during ${pendingRecovery.payload.pickup_slot}. Verify whether the order was recorded to prevent duplicate scheduling.`}
                                </p>
                                {bookingError && (
                                  <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-1.5">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{bookingError}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDiscardPendingBooking(false)}
                              className={`p-1.5 rounded-xl transition ${
                                statusCheckOutcome === 'not_found'
                                  ? 'text-sky-600 hover:text-sky-900 hover:bg-sky-100'
                                  : 'text-amber-600 hover:text-amber-900 hover:bg-amber-100'
                              }`}
                              title="Discard notice"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-3 pt-1">
                            {statusCheckOutcome === 'not_found' ? (
                              <button
                                type="button"
                                disabled={isResolvingPending || isBookingSubmitting}
                                onClick={handleCompleteUncommittedBooking}
                                className="py-2 px-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                {isResolvingPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                <span>Complete Booking</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isResolvingPending || isBookingSubmitting}
                                onClick={handleResolvePendingBooking}
                                className="py-2 px-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                {isResolvingPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                <span>Verify & Complete Booking</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isResolvingPending || isBookingSubmitting}
                              onClick={() => handleDiscardPendingBooking(false)}
                              className={`py-1.5 px-2 font-bold text-xs underline cursor-pointer disabled:opacity-50 ${
                                statusCheckOutcome === 'not_found'
                                  ? 'text-sky-800 hover:text-sky-950'
                                  : 'text-amber-800 hover:text-amber-950'
                              }`}
                            >
                              Discard & Start Fresh
                            </button>
                          </div>
                        </div>
                      )}

                      <form onSubmit={handleCreateBooking} className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                          <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-brand-600" /> Schedule Home Pickup
                          </h2>
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Step {bookingStep} of 3
                          </span>
                        </div>

                        {/* Visible Step Indicator (Steps 1 to 3) */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-2xs select-none">
                          <div className="flex items-center justify-between">
                            {[
                              { num: 1, label: 'What & When', icon: Calendar },
                              { num: 2, label: 'Where & Who', icon: MapPin },
                              { num: 3, label: 'Review & Confirm', icon: CheckCircle2 }
                            ].map((s, idx) => {
                              const isCompleted = bookingStep > s.num;
                              const isCurrent = bookingStep === s.num;
                              return (
                                <React.Fragment key={s.num}>
                                  {idx > 0 && (
                                    <div className={`flex-1 h-0.5 mx-2 sm:mx-4 transition-colors ${isCompleted ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleStepIndicatorClick(s.num)}
                                    className="flex flex-col items-center group cursor-pointer focus:outline-none"
                                    title={`Step ${s.num}: ${s.label}`}
                                  >
                                    <div
                                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition ${isCompleted
                                          ? 'bg-emerald-600 text-white shadow-2xs'
                                          : isCurrent
                                            ? 'bg-brand-600 text-white ring-4 ring-brand-100 shadow-sm'
                                            : 'bg-white border border-slate-300 text-slate-500 hover:border-slate-400'
                                        }`}
                                    >
                                      {isCompleted ? <Check className="w-3.5 h-3.5" /> : s.num}
                                    </div>
                                    <span
                                      className={`text-[10px] sm:text-[11px] font-bold mt-1.5 hidden sm:block ${isCurrent ? 'text-brand-700' : isCompleted ? 'text-emerald-700' : 'text-slate-500'}`}
                                    >
                                      {s.label}
                                    </span>
                                  </button>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>

                        {bookingStepError && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2 animate-fade-in">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{bookingStepError}</span>
                          </div>
                        )}

                        {/* ================= STEP 1: WHAT & WHEN ================= */}
                        <div className={bookingStep === 1 ? 'block' : 'hidden'} data-step="1">
                          <BookingStep1WhatAndWhen
                            services={services}
                            selectedServiceIds={selectedServiceIds}
                            onToggleService={handleToggleService}
                            pickupDate={pickupDate}
                            onSelectPickupDate={setPickupDate}
                            selectedSlotName={selectedSlotName}
                            onSelectSlot={setSelectedSlotName}
                            slots={slots}
                            estimatedSubtotalPaise={combinedEstimatedSubtotalPaise}
                            onNext={() => handleNextStep(1)}
                            bookingStepError={bookingStep === 1 ? bookingStepError : null}
                          />
                        </div>

                        {/* ================= STEP 2: WHERE & WHO ================= */}
                        <div className={bookingStep === 2 ? 'block' : 'hidden'} data-step="2">
                          <BookingStep2WhereAndWho
                            customerName={customerName}
                            onCustomerNameChange={setCustomerName}
                            customerPhone={customerPhone}
                            onCustomerPhoneChange={setCustomerPhone}
                            addresses={addresses}
                            selectedAddressId={selectedAddressId}
                            onSelectSavedAddress={(addr) => {
                              setSelectedAddressId(addr.id);
                              setIsEnteringNewAddress(false);
                              setIsRefiningAddress(false);
                            }}
                            isEnteringNewAddress={isEnteringNewAddress}
                            onToggleNewAddress={(val) => {
                              setIsEnteringNewAddress(val);
                              if (!val && addresses.length > 0) {
                                setSelectedAddressId(addresses[0].id);
                              }
                            }}
                            newAddress={newAddress}
                            onUpdateNewAddress={(patch) => setNewAddress((prev) => ({ ...prev, ...patch }))}
                            isRefiningAddress={isRefiningAddress}
                            onToggleRefineAddress={() => setIsRefiningAddress((prev) => !prev)}
                            refinedAddress={refinedAddress}
                            onUpdateRefinedAddress={(patch) => setRefinedAddress((prev) => ({ ...prev, ...patch }))}
                            updateSavedAddressBook={updateSavedAddressBook}
                            onToggleUpdateSavedAddressBook={setUpdateSavedAddressBook}
                            onGetCurrentLocation={handleGetCurrentLocation}
                            isLocating={isLocating}
                            locationFeedback={locationFeedback}
                            onOpenMapPicker={(target) => handleOpenMapPicker(target)}
                            onClearLocation={handleClearLocation}
                            onPrev={handlePrevStep}
                            onNext={() => handleNextStep(2)}
                            bookingStepError={bookingStep === 2 ? bookingStepError : null}
                          />
                        </div>

                        {/* ================= STEP 3: REVIEW & CONFIRM ================= */}
                        <div className={bookingStep === 3 ? 'block' : 'hidden'} data-step="3">
                          <BookingStep3ReviewAndConfirm
                              selectedServices={activeSelectedServices}
                              pickupDate={pickupDate}
                              selectedSlotName={selectedSlotName}
                              customerName={customerName}
                              customerPhone={customerPhone || currentUser?.phone || ''}
                              pickupAddressLine={
                                isEnteringNewAddress || addresses.length === 0
                                  ? newAddress.line
                                  : (isRefiningAddress ? refinedAddress.line : (addresses.find((a) => a.id === selectedAddressId)?.address_line || ''))
                              }
                              pickupLandmark={
                                isEnteringNewAddress || addresses.length === 0
                                  ? newAddress.landmark
                                  : (isRefiningAddress ? refinedAddress.landmark : (addresses.find((a) => a.id === selectedAddressId)?.landmark || ''))
                              }
                              pickupPincode={
                                isEnteringNewAddress || addresses.length === 0
                                  ? newAddress.pincode
                                  : (isRefiningAddress ? refinedAddress.pincode : (addresses.find((a) => a.id === selectedAddressId)?.pincode || ''))
                              }
                              hasGpsPin={
                                !!(isEnteringNewAddress
                                  ? (newAddress.latitude && newAddress.longitude)
                                  : (isRefiningAddress
                                      ? (refinedAddress.latitude && refinedAddress.longitude)
                                      : (addresses.find((a) => a.id === selectedAddressId)?.latitude && addresses.find((a) => a.id === selectedAddressId)?.longitude)))
                              }
                              estimatedSubtotalPaise={combinedEstimatedSubtotalPaise}
                              appliedCoupon={appliedCoupon}
                              availablePromotions={availablePromotions}
                              couponCodeInput={couponCodeInput}
                              onCouponCodeInputChange={setCouponCodeInput}
                              onApplyCoupon={handleApplyCoupon}
                              onRemoveCoupon={handleRemoveCoupon}
                              couponValidationLoading={couponValidationLoading}
                              couponError={couponError}
                              couponSuccessMessage={couponSuccessMessage}
                              isSubmitting={isBookingSubmitting}
                              isResolvingPending={isResolvingPending}
                              pendingRecoveryStatus={pendingRecovery?.status}
                              statusCheckOutcome={statusCheckOutcome}
                              isAuthenticated={!!currentUser}
                              onPrev={handlePrevStep}
                              onConfirmBooking={handleCreateBooking}
                            />
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
                            4. Delivered clean & crisp. Pay at your doorstep after your laundry is weighed (Cash on Delivery).
                          </p>
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
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${isCurrent
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

                        {/* 6-Stage Customer-Friendly Live Progression Timeline */}
                        <div className="py-2 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700">Order Progress Timeline</span>
                            <span className="text-[11px] font-semibold text-slate-500">
                              6 Stages • Doorstep to Doorstep
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
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                              {[
                                {
                                  num: 1,
                                  key: 'order_placed',
                                  label: '1. Order Placed',
                                  state: 'completed' as const,
                                  desc: `${currentActiveOrder.pickup_date} (${currentActiveOrder.pickup_slot.split('(')[0].trim()})`
                                },
                                {
                                  num: 2,
                                  key: 'pickup_in_progress',
                                  label: '2. Pickup & Collection',
                                  state: ['washing', 'ready_for_delivery', 'delivery_assigned', 'out_for_delivery', 'delivered'].includes(currentActiveOrder.order_status)
                                    ? ('completed' as const)
                                    : (['pickup_assigned', 'collected', 'weighed'].includes(currentActiveOrder.order_status) || currentActiveOrder.assigned_pickup_id)
                                      ? ('current' as const)
                                      : ('pending' as const),
                                  desc: (currentActiveOrder.measured_weight || currentActiveOrder.doorstep_scale_weight_kg)
                                    ? `Weighed: ${(currentActiveOrder.measured_weight || currentActiveOrder.doorstep_scale_weight_kg)?.toFixed(2)} kg`
                                    : currentActiveOrder.assigned_pickup_name
                                      ? `Agent: ${currentActiveOrder.assigned_pickup_name}`
                                      : 'Awaiting assignment'
                                },
                                {
                                  num: 3,
                                  key: 'washing',
                                  label: '3. Washing & Care',
                                  state: ['ready_for_delivery', 'delivery_assigned', 'out_for_delivery', 'delivered'].includes(currentActiveOrder.order_status)
                                    ? ('completed' as const)
                                    : currentActiveOrder.order_status === 'washing'
                                      ? ('current' as const)
                                      : ('pending' as const),
                                  desc: currentActiveOrder.order_status === 'washing' ? 'In batch machines' : 'Steam & hygienic wash'
                                },
                                {
                                  num: 4,
                                  key: 'packaging',
                                  label: '4. Packaging & Press',
                                  state: ['out_for_delivery', 'delivered'].includes(currentActiveOrder.order_status)
                                    ? ('completed' as const)
                                    : ['ready_for_delivery', 'delivery_assigned'].includes(currentActiveOrder.order_status)
                                      ? ('current' as const)
                                      : ('pending' as const),
                                  desc: 'Steam-ironed & quality packed'
                                },
                                {
                                  num: 5,
                                  key: 'out_for_delivery',
                                  label: '5. Out for Delivery',
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
                                  num: 6,
                                  key: 'delivered',
                                  label: '6. Delivered',
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
                                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${isDone
                                        ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                                        : isCurr
                                          ? 'bg-brand-50 border-brand-500 shadow-sm ring-2 ring-brand-500/20 text-brand-950'
                                          : 'bg-slate-50 border-slate-200 text-slate-400'
                                      }`}
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span
                                        className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] ${isDone
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
                                isOnlineAvailable ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPaymentOrder(currentActiveOrder)}
                                    className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                                  >
                                    <CreditCard className="w-4 h-4" />
                                    <span>Pay Online (₹{((currentActiveOrder.total_amount_paise - currentActiveOrder.paid_amount_paise) / 100).toFixed(2)})</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPaymentOrder(currentActiveOrder)}
                                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
                                  >
                                    <Banknote className="w-4 h-4" />
                                    <span>Cash on Delivery (₹{((currentActiveOrder.total_amount_paise - currentActiveOrder.paid_amount_paise) / 100).toFixed(2)} due at doorstep)</span>
                                  </button>
                                )
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

                {/* ================= 6. PROFILE TAB ================= */}
                {activeTab === 'profile' && (
                  <div className="space-y-6 max-w-2xl">
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-5 shadow-sm">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            Customer Account
                          </span>
                          <h2 className="font-black text-slate-900 text-xl">My Profile Details</h2>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200 capitalize">
                          {currentUser?.role || 'Customer'}
                        </span>
                      </div>

                      {profileUpdateSuccess && (
                        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{profileUpdateSuccess}</span>
                        </div>
                      )}

                      {profileUpdateError && (
                        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>{profileUpdateError}</span>
                        </div>
                      )}

                      <form onSubmit={handleUpdateCustomerProfile} className="space-y-4 text-xs">
                        <div>
                          <label className="block text-slate-700 font-bold mb-1">Full Name</label>
                          <input
                            type="text"
                            value={profileFullNameInput}
                            onChange={(e) => setProfileFullNameInput(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-medium bg-white"
                            placeholder="Your name"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 font-bold mb-1">Mobile Number</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-2.5 text-slate-400 font-mono font-bold">+91</span>
                            <input
                              type="tel"
                              maxLength={10}
                              value={profilePhoneInput}
                              onChange={(e) => setProfilePhoneInput(e.target.value.replace(/[^0-9]/g, ''))}
                              className="w-full pl-12 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 font-mono font-medium bg-white"
                              placeholder="10-digit number"
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 mt-1 block">
                            Used for pickup notifications, order updates, and driver contact.
                          </span>
                        </div>

                        <div>
                          <label className="block text-slate-700 font-bold mb-1">Email Address</label>
                          <input
                            type="email"
                            value={currentUser?.email || ''}
                            disabled
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-mono cursor-not-allowed"
                          />
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            Managed by Google SSO / Auth Provider.
                          </span>
                        </div>

                        <div className="pt-2 flex justify-between items-center">
                          <button
                            type="button"
                            onClick={() => handleTabChange('addresses')}
                            className="text-xs font-bold text-brand-600 hover:text-brand-700 underline cursor-pointer"
                          >
                            Manage Saved Addresses ({addresses.length}) →
                          </button>

                          <button
                            type="submit"
                            disabled={isUpdatingProfile}
                            className="py-2.5 px-5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
                          >
                            {isUpdatingProfile ? 'Saving...' : 'Save Profile Changes'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* ================= 7. SETTINGS TAB ================= */}
                {activeTab === 'settings' && (
                  <div className="space-y-6 max-w-2xl text-xs">
                    {/* Preferences */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-4 shadow-sm">
                      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                        <Settings className="w-5 h-5 text-brand-600" />
                        <h2 className="font-black text-slate-900 text-base">Application Settings & Preferences</h2>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">WhatsApp Order Notifications</span>
                            <span className="text-[11px] text-slate-500">
                              Receive live pickup updates and digital scale receipts on WhatsApp.
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={whatsappNotifications}
                            onChange={(e) => setWhatsappNotifications(e.target.checked)}
                            className="h-5 w-5 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                          <div>
                            <span className="font-bold text-slate-900 block text-xs">SMS Dispatch Alerts</span>
                            <span className="text-[11px] text-slate-500">
                              Receive SMS alert when the courier is out for delivery.
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={smsNotifications}
                            onChange={(e) => setSmsNotifications(e.target.checked)}
                            className="h-5 w-5 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Store Information & Support */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-4 shadow-sm">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                        Support & Contact
                      </span>
                      <div className="space-y-2 text-slate-700">
                        <div className="flex items-start gap-2.5">
                          <MapPin className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                          <span>{settings?.business_address || DEFAULT_SETTINGS.business_address}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Phone className="w-4 h-4 text-brand-600 shrink-0" />
                          <span>{settings?.business_phone || DEFAULT_SETTINGS.business_phone}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Clock className="w-4 h-4 text-brand-600 shrink-0" />
                          <span>Hours: Monday – Sunday, 8:00 AM – 9:00 PM</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-[11px] text-slate-500">
                        <Link to="/privacy" className="hover:text-brand-600 underline">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-brand-600 underline">Terms of Service</Link>
                        <Link to="/contact" className="hover:text-brand-600 underline">Help Desk</Link>
                      </div>
                    </div>

                    {/* Session Management */}
                    {currentUser && (
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900 block">Signed in as {currentUser.full_name}</span>
                          <span className="text-[11px] text-slate-500">{currentUser.email || currentUser.phone}</span>
                        </div>
                        <button
                          type="button"
                          onClick={logout}
                          className="py-2 px-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    )}
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
                  settings={settings}
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
              {addressModal.isOpen && renderModalShell({
                testId: 'address-form-modal',
                maxWidth: 'max-w-lg',
                icon: (
                  <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                ),
                title: addressModal.editingId ? 'Edit Saved Address' : 'Add New Delivery Address',
                error: addressModal.error,
                success: addressModal.success,
                onClose: () => updateAddressModal({ isOpen: false }),
                children: (
                  <form onSubmit={handleSaveAddress} className="space-y-3.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Address Label</label>
                      <div className="flex gap-2">
                        {['Home', 'Work', 'Other'].map((lbl) => (
                          <button
                            type="button"
                            key={lbl}
                            onClick={() => updateAddressModal({ label: lbl })}
                            className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${addressModal.label === lbl
                                ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20'
                                : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                              }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {renderAddressInputFields({
                      line: addressModal.address_line,
                      landmark: addressModal.landmark,
                      pincode: addressModal.pincode,
                      onLineChange: (val) => updateAddressModal({ address_line: val }),
                      onLandmarkChange: (val) => updateAddressModal({ landmark: val }),
                      onPincodeChange: (val) => updateAddressModal({ pincode: val }),
                      lineLabel: <>Door / Flat No., Building, Street <span className="text-red-500">*</span></>,
                      landmarkLabel: 'Landmark (Optional)',
                      pincodeLabel: <>PIN Code <span className="text-red-500">*</span></>,
                      linePlaceholder: 'e.g. Flat 402, Green Glen Layout, Bellandur',
                      landmarkPlaceholder: 'e.g. Near Central Mall',
                      pincodePlaceholder: 'e.g. 560103',
                      required: true,
                      pinRequired: true
                    })}

                    {renderMapPinBox(
                      addressModal.latitude,
                      addressModal.longitude,
                      'address_modal',
                      addressModal.address_line,
                      'Pin Address on Map',
                      { label: 'Map Location Pin', fallbackText: 'Not pinned yet' }
                    )}

                    <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addressModal.is_default}
                        onChange={(e) => updateAddressModal({ is_default: e.target.checked })}
                        className="rounded text-brand-600 focus:ring-brand-500"
                      />
                      <span>Set as my default pickup address</span>
                    </label>

                    {renderModalFooter({
                      onCancel: () => updateAddressModal({ isOpen: false }),
                      submitLabel: 'Save Address',
                      loadingLabel: 'Saving...',
                      isSubmitting: addressModal.isSaving,
                      submitTestId: 'save-address-button'
                    })}
                  </form>
                )
              })}

              {/* Delete Address Confirmation Modal */}
              {addressToDelete && renderModalShell({
                testId: 'delete-address-modal',
                maxWidth: 'max-w-sm',
                icon: (
                  <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                ),
                title: 'Delete Saved Address',
                subtitle: 'This action cannot be undone.',
                error: addressDeleteError,
                children: (
                  <>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 space-y-0.5">
                      <span className="font-bold text-slate-900 block">{addressToDelete.label}</span>
                      <p className="text-slate-600">{addressToDelete.address_line}</p>
                      <span className="text-[11px] text-slate-400 font-mono">PIN: {addressToDelete.pincode}</span>
                    </div>

                    {renderModalFooter({
                      onCancel: () => {
                        setAddressToDelete(null);
                        setAddressDeleteError(null);
                      },
                      submitLabel: 'Delete Address',
                      loadingLabel: 'Deleting...',
                      isSubmitting: isDeletingAddress,
                      submitTestId: 'confirm-delete-address-button',
                      submitVariant: 'danger',
                      submitType: 'button',
                      onSubmitClick: handleConfirmDeleteAddress,
                      icon: <Trash2 className="w-4 h-4" />
                    })}
                  </>
                )
              })}

              {/* Order Pickup Location Correction Modal (Phase 3) */}
              {orderLocationModal.order && renderModalShell({
                testId: 'edit-order-location-modal',
                maxWidth: 'max-w-lg',
                icon: (
                  <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                ),
                title: 'Correct Pickup Location',
                subtitle: `Order #${orderLocationModal.order.order_number}`,
                notice: (
                  <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-[11px] leading-relaxed">
                    <strong>Order in Booked Status:</strong> You may adjust your pickup address, landmark, PIN code, or GPS pin before our pickup associate is dispatched.
                  </div>
                ),
                error: orderLocationModal.error,
                success: orderLocationModal.success,
                onClose: () => updateOrderLocationModal({ order: null }),
                children: (
                  <form onSubmit={handleSaveOrderLocation} className="space-y-3.5">
                    {renderAddressInputFields({
                      line: orderLocationModal.address,
                      landmark: orderLocationModal.landmark,
                      pincode: orderLocationModal.pincode,
                      onLineChange: (val) => updateOrderLocationModal({ address: val }),
                      onLandmarkChange: (val) => updateOrderLocationModal({ landmark: val }),
                      onPincodeChange: (val) => updateOrderLocationModal({ pincode: val }),
                      lineLabel: <>Pickup Address (Flat, Building, Street) <span className="text-red-500">*</span></>,
                      landmarkLabel: 'Landmark (Optional)',
                      pincodeLabel: <>PIN Code <span className="text-red-500">*</span></>,
                      linePlaceholder: 'e.g. Flat 402, Green Glen Layout, Bellandur',
                      landmarkPlaceholder: 'e.g. Near Central Mall',
                      pincodePlaceholder: 'e.g. 560103',
                      required: true,
                      pinRequired: true
                    })}

                    {renderMapPinBox(
                      orderLocationModal.latitude,
                      orderLocationModal.longitude,
                      'order_edit',
                      orderLocationModal.address,
                      'Correct Order Pickup Pin',
                      {
                        label: 'Doorstep Map Pin',
                        fallbackText: 'No GPS pin attached',
                        buttonText: orderLocationModal.latitude && orderLocationModal.longitude ? 'Adjust Pin' : 'Set Pin on Map'
                      }
                    )}

                    {renderModalFooter({
                      onCancel: () => updateOrderLocationModal({ order: null }),
                      submitLabel: 'Save Changes',
                      loadingLabel: 'Updating...',
                      isSubmitting: orderLocationModal.isSaving,
                      submitTestId: 'save-order-location-button'
                    })}
                  </form>
                )
              })}

              {/* Post-Google-Login Customer Onboarding Modal (Phone & Default Address) */}
              {onboardingModal.isOpen && renderModalShell({
                maxWidth: 'max-w-md',
                title: 'Complete Your Delivery Profile',
                subtitle: 'Welcome to SuperWash! Please provide your mobile number for pickup coordination.',
                error: onboardingModal.error,
                onClose: () => updateOnboardingModal({ isOpen: false }),
                children: (
                  <form onSubmit={handleSaveOnboarding} className="space-y-3.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={onboardingModal.name}
                        onChange={(e) => updateOnboardingModal({ name: e.target.value })}
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
                          value={onboardingModal.phone}
                          onChange={(e) => updateOnboardingModal({ phone: e.target.value.replace(/[^0-9]/g, '') })}
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
                          {onboardingModal.locationFeedback && (
                            <span className="text-[10px] text-slate-500">{onboardingModal.locationFeedback}</span>
                          )}
                          <button
                            type="button"
                            onClick={handleGetOnboardLocation}
                            disabled={onboardingModal.isLocating}
                            className="text-[11px] text-brand-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <MapPin className="w-3 h-3" />
                            <span>{onboardingModal.isLocating ? 'Locating...' : onboardingModal.latitude ? '✓ GPS Attached' : '📍 GPS'}</span>
                          </button>
                        </div>
                      </div>
                      {renderAddressInputFields({
                        line: onboardingModal.address,
                        landmark: onboardingModal.landmark,
                        pincode: onboardingModal.pincode,
                        onLineChange: (val) => updateOnboardingModal({ address: val }),
                        onLandmarkChange: (val) => updateOnboardingModal({ landmark: val }),
                        onPincodeChange: (val) => updateOnboardingModal({ pincode: val.replace(/[^0-9]/g, '') }),
                        linePlaceholder: 'Flat / House No., Apartment, Street',
                        landmarkPlaceholder: 'Landmark (Optional)',
                        pincodePlaceholder: 'PIN Code',
                        pinMaxLength: 6,
                        inputClass: 'w-full px-3 py-2 rounded-xl border border-slate-300'
                      })}
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={onboardingModal.isSaving || onboardingModal.phone.length < 10}
                        className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
                      >
                        {onboardingModal.isSaving ? 'Saving Profile...' : 'Save & Continue'}
                      </button>
                    </div>
                  </form>
                )
              })}

              {/* Fixed Mobile Bottom Navigation */}
              <CustomerBottomNav
                activeTab={activeTab}
                hasActiveOrder={Boolean(currentActiveOrder && currentActiveOrder.order_status !== 'delivered' && currentActiveOrder.order_status !== 'cancelled')}
              />
            </div>
          );
        };
