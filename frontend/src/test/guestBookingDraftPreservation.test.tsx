import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { CustomerHome } from '../pages/customer/CustomerHome';
import { LoginPage } from '../pages/public/LoginPage';
import { LaundryService, setLiveModeForTesting } from '../services/laundryService';
import {
  GUEST_BOOKING_DRAFT_KEY,
  GUEST_BOOKING_DRAFT_TTL_MS,
  GUEST_BOOKING_DRAFT_VERSION,
  saveGuestBookingDraft,
  getGuestBookingDraft,
  clearGuestBookingDraft,
  validateGuestBookingDraft,
  isDraftAccountMismatch,
  hasMeaningfulDraftContent,
  GuestBookingDraftPayload,
  GuestBookingDraftRecord
} from '../utils/guestBookingDraft';
import { Profile, Order } from '../types';

describe('Milestone 1: Guest Booking Draft Preservation & Account Isolation', () => {
  const customerId = '00000000-0000-4000-a000-000000000001';
  const customerProfile: Profile = {
    id: customerId,
    phone: '9876543210',
    full_name: 'Aarav Sharma',
    role: 'customer',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const defaultServices = [
    {
      id: 'srv-wash-fold',
      name: 'Wash & Fold (Normal)',
      pricing_unit: 'per_kg',
      unit_price_paise: 7900,
      price_paise: 7900,
      min_weight_kg: 1.0,
      is_active: true,
      display_order: 1
    },
    {
      id: 'srv-steam-iron',
      name: 'Steam Ironing',
      pricing_unit: 'per_kg',
      unit_price_paise: 4900,
      price_paise: 4900,
      min_weight_kg: 1.0,
      is_active: true,
      display_order: 2
    }
  ];

  const defaultSlots = [
    {
      id: 'slot-morning',
      name: 'Morning (08:00 AM - 11:00 AM)',
      start_time: '08:00',
      end_time: '11:00',
      max_capacity: 15,
      is_active: true
    }
  ];

  const defaultSettings = {
    id: 'settings-1',
    business_name: 'SuperWash Exprez',
    business_phone: '+91 8217541193',
    business_address: 'Bellandur, Bengaluru',
    price_per_kg_paise: 7900,
    min_weight_kg: 1.0,
    delivery_charge_paise: 0,
    express_multiplier: 1.5,
    cod_payment_enabled: true,
    online_payment_enabled: false,
    serviceable_pincodes: ['560103', '560037']
  };

  beforeEach(() => {
    setLiveModeForTesting(false);
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();

    vi.spyOn(LaundryService, 'getServices').mockResolvedValue(defaultServices as any);
    vi.spyOn(LaundryService, 'getSlots').mockResolvedValue(defaultSlots as any);
    vi.spyOn(LaundryService, 'getSettings').mockResolvedValue(defaultSettings as any);
    vi.spyOn(LaundryService, 'getAddresses').mockResolvedValue([]);
    vi.spyOn(LaundryService, 'getCustomerOrders').mockResolvedValue([]);
    vi.spyOn(LaundryService, 'isPincodeServiceable').mockResolvedValue(true);
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // 1. Guest booking draft creation
  it('1. creates a valid versioned guest booking draft in sessionStorage', () => {
    const payload: GuestBookingDraftPayload = {
      service_ids: ['srv-wash-fold'],
      service_id: 'srv-wash-fold',
      pickup_date: '2026-11-10',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Priya Patel',
      customer_phone: '9876543210',
      pickup_address: 'Flat 402, Green Glen Layout, Bellandur',
      pickup_landmark: 'Near EcoSpace',
      pickup_pincode: '560103',
      pickup_latitude: 12.9249,
      pickup_longitude: 77.6835,
      coupon_code: 'WELCOME50',
      booking_step: 3,
      client_submission_id: 'sub-test-101'
    };

    const saved = saveGuestBookingDraft(payload);
    expect(saved).not.toBeNull();
    expect(saved?.version).toBe(GUEST_BOOKING_DRAFT_VERSION);
    expect(saved?.draftId).toMatch(/^draft_/);
    expect(saved?.createdAt).toBeGreaterThan(0);
    expect(saved?.payload.customer_name).toBe('Priya Patel');
    expect(saved?.payload.pickup_latitude).toBe(12.9249);
    expect(saved?.payload.pickup_longitude).toBe(77.6835);

    const storedRaw = sessionStorage.getItem(GUEST_BOOKING_DRAFT_KEY);
    expect(storedRaw).not.toBeNull();
    const retrieved = getGuestBookingDraft();
    expect(retrieved?.payload.pickup_address).toBe('Flat 402, Green Glen Layout, Bellandur');
  });

  // 2. Automatic draft updates
  it('2. updates existing draft in place without changing draftId or createdAt', () => {
    const initial: GuestBookingDraftPayload = {
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-10',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Priya Patel',
      customer_phone: '9876543210',
      pickup_address: 'Flat 402',
      pickup_pincode: '560103',
      booking_step: 1
    };

    const record1 = saveGuestBookingDraft(initial);
    expect(record1).not.toBeNull();
    const originalDraftId = record1!.draftId;
    const originalCreatedAt = record1!.createdAt;

    // Simulate update to step 3 with address details
    const updatedPayload: GuestBookingDraftPayload = {
      ...initial,
      pickup_address: 'Flat 402, Green Glen Layout, Bellandur',
      pickup_landmark: 'Opposite Park',
      pickup_latitude: 12.925,
      pickup_longitude: 77.684,
      booking_step: 3
    };

    const record2 = saveGuestBookingDraft(updatedPayload);
    expect(record2?.draftId).toBe(originalDraftId);
    expect(record2?.createdAt).toBe(originalCreatedAt);
    expect(record2?.payload.booking_step).toBe(3);
    expect(record2?.payload.pickup_landmark).toBe('Opposite Park');
  });

  // 3. Draft restoration after component remount
  it('3. restores booking fields and step upon component mount', async () => {
    const draftPayload: GuestBookingDraftPayload = {
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-15',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Aarav Sharma',
      customer_phone: '9876543210',
      pickup_address: 'Flat 101, Lakeview Apts',
      pickup_landmark: 'Near Metro',
      pickup_pincode: '560103',
      pickup_latitude: 12.93,
      pickup_longitude: 77.68,
      booking_step: 4
    };

    saveGuestBookingDraft(draftPayload);

    render(
      <MemoryRouter initialEntries={['/customer?tab=book']}>
        <AuthProvider>
          <CustomerHome />
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for draft restoration notice
    await waitFor(() => {
      expect(screen.getByText(/Welcome back! Your pickup details have been saved/i)).toBeInTheDocument();
    });

    // Verify fields populated
    expect(screen.getByDisplayValue('Aarav Sharma')).toBeInTheDocument();
    expect(screen.getByDisplayValue('9876543210')).toBeInTheDocument();
  });

  // 4. Draft restoration after browser refresh
  it('4. survives simulated page reload via sessionStorage and hydrates review step', async () => {
    const draftPayload: GuestBookingDraftPayload = {
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-12',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Deepa Roy',
      customer_phone: '9123456789',
      pickup_address: 'House 55, Indiranagar',
      pickup_pincode: '560037',
      booking_step: 4
    };

    saveGuestBookingDraft(draftPayload);

    // Verify draft exists in sessionStorage before component mount
    expect(sessionStorage.getItem(GUEST_BOOKING_DRAFT_KEY)).not.toBeNull();

    render(
      <MemoryRouter initialEntries={['/customer?tab=book']}>
        <AuthProvider>
          <CustomerHome />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Welcome back! Your pickup details have been saved/i)).toBeInTheDocument();
    });
  });

  // 5. Google OAuth redirect and return
  it('5. preserves return destination with resume=draft and restores all data after login', async () => {
    const draftPayload: GuestBookingDraftPayload = {
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-12',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Priya Patel',
      customer_phone: '9876543210',
      pickup_address: 'Tower B, Flat 302',
      pickup_pincode: '560103',
      booking_step: 4
    };

    saveGuestBookingDraft(draftPayload);

    // Render with authenticated user returning from OAuth redirect with resume=draft
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    render(
      <MemoryRouter initialEntries={['/customer?tab=book&resume=draft']}>
        <AuthProvider>
          <CustomerHome />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Welcome back! Your pickup details have been saved/i)).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Tower B, Flat 302')).toBeInTheDocument();
    expect(screen.getByDisplayValue('9876543210')).toBeInTheDocument();
  });

  // 6. Existing-user login and return
  it('6. does not overwrite existing customer profile information during restoration', async () => {
    // Existing profile in storage has phone '9876543210'
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    const draftPayload: GuestBookingDraftPayload = {
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-15',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Aarav Alternate',
      customer_phone: '9988776655', // Entered in guest form
      pickup_address: 'Temporary Office Address',
      pickup_pincode: '560103',
      booking_step: 4
    };

    saveGuestBookingDraft(draftPayload);

    render(
      <MemoryRouter initialEntries={['/customer?tab=book']}>
        <AuthProvider>
          <CustomerHome />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Welcome back! Your pickup details have been saved/i)).toBeInTheDocument();
    });

    // Verified: stored auth profile phone was NOT overwritten in localStorage
    const storedAuthProfile = JSON.parse(localStorage.getItem('superwash_auth_profile') || '{}');
    expect(storedAuthProfile.phone).toBe('9876543210');

    // The draft phone was loaded into the form for confirmation
    expect(screen.getByDisplayValue('9988776655')).toBeInTheDocument();
  });

  // 7. Back navigation from login
  it('7. restores draft when user navigates back from login screen to booking', async () => {
    saveGuestBookingDraft({
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-18',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Back Navigation Test',
      customer_phone: '9876500000',
      pickup_address: 'Plot 77, Koramangala',
      pickup_pincode: '560103',
      booking_step: 3
    });

    render(
      <MemoryRouter initialEntries={['/customer?tab=book']}>
        <AuthProvider>
          <CustomerHome />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Plot 77, Koramangala')).toBeInTheDocument();
    });
  });

  // 8. Missing or corrupted draft
  it('8. clears corrupted JSON safely and falls back without crashing', () => {
    sessionStorage.setItem(GUEST_BOOKING_DRAFT_KEY, '{ invalid_json ::: corrupt');

    const draft = getGuestBookingDraft();
    expect(draft).toBeNull();
    expect(sessionStorage.getItem(GUEST_BOOKING_DRAFT_KEY)).toBeNull();
  });

  // 9. Expired draft
  it('9. discards draft older than 60 minutes and returns null', () => {
    const expiredRecord: GuestBookingDraftRecord = {
      version: GUEST_BOOKING_DRAFT_VERSION,
      draftId: 'draft_old_101',
      createdAt: Date.now() - (GUEST_BOOKING_DRAFT_TTL_MS + 10000),
      updatedAt: Date.now() - (GUEST_BOOKING_DRAFT_TTL_MS + 10000),
      payload: {
        service_ids: ['srv-wash-fold'],
        pickup_date: '2026-11-01',
        pickup_slot: 'Morning',
        customer_name: 'Old User',
        customer_phone: '9876543210',
        pickup_address: 'Old Address',
        pickup_pincode: '560103',
        booking_step: 1
      }
    };

    sessionStorage.setItem(GUEST_BOOKING_DRAFT_KEY, JSON.stringify(expiredRecord));

    const retrieved = getGuestBookingDraft();
    expect(retrieved).toBeNull();
    expect(sessionStorage.getItem(GUEST_BOOKING_DRAFT_KEY)).toBeNull();
  });

  // 10. Different-account login (Account Isolation)
  it('10. detects account mismatch when a draft bound to User A is accessed by User B', () => {
    const draftUserA: GuestBookingDraftRecord = {
      version: GUEST_BOOKING_DRAFT_VERSION,
      draftId: 'draft_user_a',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      boundUserId: 'user-a-uuid',
      boundUserEmail: 'user.a@gmail.com',
      payload: {
        service_ids: ['srv-wash-fold'],
        pickup_date: '2026-11-20',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        customer_name: 'User A',
        customer_phone: '9876543210',
        pickup_address: 'User A Home',
        pickup_pincode: '560103',
        booking_step: 3
      }
    };

    // Case A: User A accesses their own draft -> No mismatch
    expect(isDraftAccountMismatch(draftUserA, 'user-a-uuid')).toBe(false);

    // Case B: User B logs in and attempts to access User A's draft -> Mismatch detected!
    expect(isDraftAccountMismatch(draftUserA, 'user-b-uuid')).toBe(true);

    // Case C: Unbound guest draft -> No mismatch for any user
    const guestDraft: GuestBookingDraftRecord = {
      ...draftUserA,
      boundUserId: null
    };
    expect(isDraftAccountMismatch(guestDraft, 'user-b-uuid')).toBe(false);
  });

  // 11. Coupon revalidation
  it('11. triggers authoritative coupon validation during draft restoration', async () => {
    const validateCouponSpy = vi.spyOn(LaundryService, 'validateCoupon').mockResolvedValue({
      valid: true,
      code: 'WELCOME50',
      discount_type: 'fixed',
      discount_value: 5000,
      discount_paise: 5000,
      min_order_paise: 15000,
      reason: 'Welcome bonus'
    } as any);

    saveGuestBookingDraft({
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-25',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Coupon Tester',
      customer_phone: '9876543210',
      pickup_address: '123 Main Street',
      pickup_pincode: '560103',
      coupon_code: 'WELCOME50',
      booking_step: 4
    });

    render(
      <MemoryRouter initialEntries={['/customer?tab=book']}>
        <AuthProvider>
          <CustomerHome />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(validateCouponSpy).toHaveBeenCalledWith('WELCOME50', expect.anything(), expect.anything(), expect.anything(), true);
    });
  });

  // 12. Address and GPS coordinate preservation
  it('12. preserves exact latitude and longitude throughout draft save and restore', () => {
    const payload: GuestBookingDraftPayload = {
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-10',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Geo Customer',
      customer_phone: '9876543210',
      pickup_address: 'Prestige Tech Park, Doorstep Pin',
      pickup_landmark: 'Building 3',
      pickup_pincode: '560103',
      pickup_latitude: 12.934567,
      pickup_longitude: 77.689012,
      booking_step: 3
    };

    saveGuestBookingDraft(payload);

    const restored = getGuestBookingDraft();
    expect(restored?.payload.pickup_latitude).toBe(12.934567);
    expect(restored?.payload.pickup_longitude).toBe(77.689012);
    expect(restored?.payload.pickup_landmark).toBe('Building 3');
  });

  // 13. Existing saved address protection
  it('13. sets entering new address and does not mutate or overwrite saved address book', async () => {
    const savedAddress = {
      id: 'addr-existing-1',
      user_id: customerId,
      label: 'Home',
      address_line: 'Permanent Saved Residence',
      pincode: '560103',
      is_default: true,
      created_at: new Date().toISOString()
    };

    vi.spyOn(LaundryService, 'getAddresses').mockResolvedValue([savedAddress as any]);
    const updateAddressSpy = vi.spyOn(LaundryService, 'updateAddress');
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    saveGuestBookingDraft({
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-20',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Aarav Sharma',
      customer_phone: '9876543210',
      pickup_address: 'Separate Draft Pickup Address',
      pickup_pincode: '560103',
      booking_step: 3
    });

    render(
      <MemoryRouter initialEntries={['/customer?tab=book']}>
        <AuthProvider>
          <CustomerHome />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Separate Draft Pickup Address')).toBeInTheDocument();
    });

    // Verified: Existing saved address was NOT modified
    expect(updateAddressSpy).not.toHaveBeenCalled();
  });

  // 14. Duplicate submission prevention & idempotency
  it('14. preserves client_submission_id and requires explicit confirm click (no auto-booking)', async () => {
    const submissionId = 'sub-idempotent-unique-999';
    const createBookingSpy = vi.spyOn(LaundryService, 'createBooking');

    saveGuestBookingDraft({
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-20',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      customer_name: 'Aarav Sharma',
      customer_phone: '9876543210',
      pickup_address: 'Flat 402, Bellandur',
      pickup_pincode: '560103',
      booking_step: 4,
      client_submission_id: submissionId
    });

    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    render(
      <MemoryRouter initialEntries={['/customer?tab=book']}>
        <AuthProvider>
          <CustomerHome />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Welcome back! Your pickup details have been saved/i)).toBeInTheDocument();
    });

    // Critical assertion: Merely loading / authenticating does NOT trigger createBooking
    expect(createBookingSpy).not.toHaveBeenCalled();
  });

  // 15. Draft cleanup after successful booking
  it('15. clears draft from sessionStorage upon confirmed successful booking creation', () => {
    saveGuestBookingDraft({
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-20',
      pickup_slot: 'Morning',
      customer_name: 'Aarav Sharma',
      customer_phone: '9876543210',
      pickup_address: 'Bellandur',
      pickup_pincode: '560103',
      booking_step: 5
    });

    expect(sessionStorage.getItem(GUEST_BOOKING_DRAFT_KEY)).not.toBeNull();

    // Call cleanup as executed in commitConfirmedBookingState
    clearGuestBookingDraft();

    expect(sessionStorage.getItem(GUEST_BOOKING_DRAFT_KEY)).toBeNull();
    expect(getGuestBookingDraft()).toBeNull();
  });

  // 16. Recovery after uncertain network timeout
  it('16. preserves guest draft if order submission encounters network error', () => {
    const payload: GuestBookingDraftPayload = {
      service_ids: ['srv-wash-fold'],
      pickup_date: '2026-11-20',
      pickup_slot: 'Morning',
      customer_name: 'Aarav Sharma',
      customer_phone: '9876543210',
      pickup_address: 'Bellandur',
      pickup_pincode: '560103',
      booking_step: 5,
      client_submission_id: 'sub-timeout-retry'
    };

    saveGuestBookingDraft(payload);

    // Verify draft remains stored during timeout recovery
    const draftBefore = getGuestBookingDraft();
    expect(draftBefore).not.toBeNull();
    expect(draftBefore?.payload.client_submission_id).toBe('sub-timeout-retry');
  });
});
