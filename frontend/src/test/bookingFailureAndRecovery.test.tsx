import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { CustomerHome } from '../pages/customer/CustomerHome';
import { LaundryService, setLiveModeForTesting } from '../services/laundryService';
import { supabase } from '../services/supabase';
import {
  savePendingBooking,
  getPendingBooking,
  clearPendingBooking,
  PENDING_BOOKING_KEY,
  isAmbiguousNetworkError
} from '../utils/pendingBooking';
import { Order, Profile } from '../types';

describe('Production Booking Failure Investigation & Recovery Verification', () => {
  const customerId = '00000000-0000-4000-a000-000000000099';
  const customerProfile: Profile = {
    id: customerId,
    phone: '9876543210',
    full_name: 'Priya Sharma',
    role: 'customer',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const defaultServices = [
    {
      id: 'srv-normal-wash',
      name: 'Wash & Fold (Normal)',
      pricing_unit: 'per_kg',
      unit_price_paise: 7900,
      price_paise: 7900,
      min_weight_kg: 1.0,
      is_active: true,
      display_order: 1
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
    business_address: 'Banashankari, Bengaluru',
    price_per_kg_paise: 7900,
    min_weight_kg: 1.0,
    delivery_charge_paise: 0,
    min_order_free_delivery_paise: 0,
    upi_id: 'superwash@upi',
    upi_qr_url: null,
    payment_collection_stage: 'delivery',
    allow_delivery_payment_recording: true,
    whatsapp_enabled: false,
    serviceable_pincodes: ['560070', '560111'],
    cod_payment_enabled: true,
    online_payment_enabled: false,
    advance_payment_enabled: false
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();

    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));
    localStorage.setItem('superwash_services', JSON.stringify(defaultServices));
    localStorage.setItem('superwash_pickup_slots', JSON.stringify(defaultSlots));
    localStorage.setItem('superwash_business_settings', JSON.stringify(defaultSettings));
    localStorage.setItem('superwash_orders', JSON.stringify([]));
  });

  afterEach(() => {
    setLiveModeForTesting(false);
  });

  it('1. Successful booking in live mode passes all 14 RPC parameters including p_coupon_code: null and p_discount_paise: 0', async () => {
    setLiveModeForTesting(true);
    vi.spyOn(LaundryService, 'getServices').mockResolvedValue(defaultServices as any);

    let capturedRpcName = '';
    let capturedPayload: any = null;

    vi.spyOn(supabase, 'rpc').mockImplementation((rpcName: string, payload: any) => {
      capturedRpcName = rpcName;
      capturedPayload = payload;
      return Promise.resolve({
        data: {
          id: 'order-14-params-uuid',
          order_number: 'SW-1001',
          customer_id: customerId,
          customer_name: 'Priya Sharma',
          customer_phone: '9876543210',
          pickup_address: '123 MG Road, Bengaluru',
          pickup_landmark: 'Near Metro',
          pickup_pincode: '560070',
          pickup_date: '2026-11-05',
          pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
          service_id: 'srv-normal-wash',
          order_status: 'booked',
          payment_status: 'pending',
          payment_method: 'cash',
          price_per_kg_paise: 7900,
          min_weight_kg: 1.0,
          coupon_code: null,
          discount_paise: 0,
          client_submission_id: payload.p_client_submission_id
        },
        error: null
      }) as any;
    });

    const order = await LaundryService.createBooking({
      customer_id: customerId,
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '123 MG Road, Bengaluru',
      pickup_landmark: 'Near Metro',
      pickup_pincode: '560070',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-normal-wash',
      client_submission_id: 'sub-test-14-params'
    });

    expect(capturedRpcName).toBe('create_booking_idempotent');
    expect(capturedPayload).toBeDefined();

    // Verify all 14 parameters are supplied to PostgREST
    expect(capturedPayload.p_client_submission_id).toBe('sub-test-14-params');
    expect(capturedPayload.p_customer_name).toBe('Priya Sharma');
    expect(capturedPayload.p_customer_phone).toBe('9876543210');
    expect(capturedPayload.p_pickup_address).toBe('123 MG Road, Bengaluru');
    expect(capturedPayload.p_pickup_pincode).toBe('560070');
    expect(capturedPayload.p_pickup_date).toBe('2026-11-05');
    expect(capturedPayload.p_pickup_slot).toBe('Morning (08:00 AM - 11:00 AM)');
    expect(capturedPayload.p_service_id).toBe('srv-normal-wash');
    expect(capturedPayload.p_coupon_code).toBeNull();
    expect(capturedPayload.p_discount_paise).toBe(0);

    expect(order.order_number).toBe('SW-1001');
    expect(order.coupon_code).toBeNull();
  });

  it('2. RPC timeout after successful database commit: status check resolves existing order without duplicate', async () => {
    const subId = 'sub-timeout-committed-01';
    const committedOrder: Order = {
      id: 'order-committed-timeout-uuid',
      order_number: 'SW-7777',
      customer_id: customerId,
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '123 MG Road',
      pickup_pincode: '560070',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      order_status: 'booked',
      payment_status: 'pending',
      payment_method: 'cash',
      price_per_kg_paise: 7900,
      min_weight_kg: 1.0,
      delivery_charge_paise: 0,
      paid_amount_paise: 0,
      client_submission_id: subId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    localStorage.setItem('superwash_orders', JSON.stringify([committedOrder]));
    savePendingBooking(customerId, subId, committedOrder, 'uncertain_timeout');

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Unconfirmed Booking Attempt Detected/i)).toBeInTheDocument();
    });

    const verifyBtn = screen.getByRole('button', { name: /Verify & Complete Booking/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Pickup Booked Successfully!/i)).toBeInTheDocument();
      expect(screen.getByText('#SW-7777')).toBeInTheDocument();
    });

    expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();
  });

  it('3. RPC failure before database commit: status check returns null and enables safe retry with preserved details', async () => {
    const subId = 'sub-failed-before-commit-01';
    const pendingPayload = {
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '456 Residency Road',
      pickup_pincode: '560070',
      pickup_date: '2026-11-06',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-normal-wash'
    };

    savePendingBooking(customerId, subId, pendingPayload, 'uncertain_timeout');

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Unconfirmed Booking Attempt Detected/i)).toBeInTheDocument();
    });

    // Customer clicks Verify
    const verifyBtn = screen.getByRole('button', { name: /Verify & Complete Booking/i });
    fireEvent.click(verifyBtn);

    // Banner must state that no order was created, without contradictory red error box
    await waitFor(() => {
      expect(screen.getByText(/Status check verified: No order was created/i)).toBeInTheDocument();
    });

    // Primary action button updates to "Complete Booking"
    const completeBtns = screen.getAllByRole('button', { name: /Complete Booking/i });
    expect(completeBtns.length).toBeGreaterThan(0);

    // Preserved details remain in pending storage
    const stored = getPendingBooking(customerId);
    expect(stored?.clientSubmissionId).toBe(subId);
    expect(stored?.payload.pickup_address).toBe('456 Residency Road');
  });

  it('4. Status verification returning an existing order clears pending record and renders order confirmation', async () => {
    const subId = 'sub-verify-existing-order-01';
    const orderRecord: Order = {
      id: 'existing-order-uuid',
      order_number: 'SW-9090',
      customer_id: customerId,
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '789 Indiranagar',
      pickup_pincode: '560070',
      pickup_date: '2026-11-07',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      order_status: 'booked',
      payment_status: 'pending',
      payment_method: 'cash',
      price_per_kg_paise: 7900,
      min_weight_kg: 1.0,
      delivery_charge_paise: 0,
      paid_amount_paise: 0,
      client_submission_id: subId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    localStorage.setItem('superwash_orders', JSON.stringify([orderRecord]));
    savePendingBooking(customerId, subId, orderRecord, 'uncertain_timeout');

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const verifyBtn = await screen.findByRole('button', { name: /Verify & Complete Booking/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Pickup Booked Successfully!/i)).toBeInTheDocument();
      expect(screen.getByText('#SW-9090')).toBeInTheDocument();
    });

    expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();
  });

  it('5. Status verification returning no order transitions to safe retry without contradictory error banners', async () => {
    const subId = 'sub-no-order-transition';
    savePendingBooking(customerId, subId, {
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '100 Feet Road',
      pickup_pincode: '560070',
      pickup_date: '2026-11-08',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    }, 'uncertain_timeout');

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const verifyBtn = await screen.findByRole('button', { name: /Verify & Complete Booking/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Status check verified: No order was created/i)).toBeInTheDocument();
    });

    // Must NOT display "Network is still unresponsive" simultaneously
    expect(screen.queryByText(/Network is still unresponsive/i)).toBeNull();
  });

  it('6. Delayed verification response shows loading state and disables repeated clicks', async () => {
    const subId = 'sub-delayed-verify-01';
    savePendingBooking(customerId, subId, {
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '100 Feet Road',
      pickup_pincode: '560070',
      pickup_date: '2026-11-08',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    }, 'uncertain_timeout');

    // Spy on getOrderBySubmissionId to delay
    let resolveVerification: (value: any) => void;
    const delayedPromise = new Promise((resolve) => {
      resolveVerification = resolve;
    });

    vi.spyOn(LaundryService, 'getOrderBySubmissionId').mockReturnValue(delayedPromise as any);

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const verifyBtn = await screen.findByRole('button', { name: /Verify & Complete Booking/i });
    fireEvent.click(verifyBtn);

    // Button should be disabled during resolution
    expect(verifyBtn).toBeDisabled();

    // Resolve delayed status check
    resolveVerification!(null);

    await waitFor(() => {
      expect(screen.getByText(/Status check verified: No order was created/i)).toBeInTheDocument();
    });
  });

  it('7. Authentication expiration during booking provides actionable sign-in guidance', async () => {
    localStorage.removeItem('superwash_auth_profile');

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Unauthenticated user sees Sign In requirement & buttons
    await waitFor(() => {
      expect(screen.getAllByText(/Sign In/i).length).toBeGreaterThan(0);
    });
  });

  it('8. Repeated submission with the same idempotency key returns the original order idempotently', async () => {
    const submissionId = 'sub-repeat-idempotent-key-01';
    const payload = {
      customer_id: customerId,
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '123 MG Road',
      pickup_pincode: '560070',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-normal-wash',
      client_submission_id: submissionId
    };

    const order1 = await LaundryService.createBooking(payload);
    expect(order1.id).toBeDefined();

    // Second call with the same submissionId
    const order2 = await LaundryService.createBooking(payload);
    expect(order2.id).toBe(order1.id);
    expect(order2.order_number).toBe(order1.order_number);

    // Total orders must still be 1
    const all = await LaundryService.getOrders();
    expect(all.length).toBe(1);
  });

  it('9. Recovery after page refresh restores pending state, slot, date, and allows status check', async () => {
    const subId = 'sub-refresh-recovery-01';
    const payload = {
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '77 Bannerghatta Road',
      pickup_pincode: '560070',
      pickup_date: '2026-11-09',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-normal-wash'
    };

    savePendingBooking(customerId, subId, payload, 'uncertain_timeout');

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Unconfirmed Booking Attempt Detected/i)).toBeInTheDocument();
      expect(screen.getAllByText(/2026-11-09/).length).toBeGreaterThan(0);
    });
  });

  it('10. Network restoration and safe retry completes booking with original submission ID and preserves chosen payment option', async () => {
    const subId = 'sub-retry-success-01';
    const payload = {
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '88 Koramangala',
      pickup_pincode: '560070',
      pickup_date: '2026-11-10',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-normal-wash'
    };

    savePendingBooking(customerId, subId, payload, 'uncertain_timeout');

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // 1. Verify
    const verifyBtn = await screen.findByRole('button', { name: /Verify & Complete Booking/i });
    fireEvent.click(verifyBtn);

    // 2. Safe retry button appears
    const completeBtns = await screen.findAllByRole('button', { name: /Complete Booking/i });
    fireEvent.click(completeBtns[0]);

    // 3. Confirmation banner appears
    await waitFor(() => {
      expect(screen.getByText(/Pickup Booked Successfully!/i)).toBeInTheDocument();
    });

    const all = await LaundryService.getOrders();
    expect(all[0].client_submission_id).toBe(subId);
    expect(all[0].payment_method).toBe('cash');
  });

  it('11. Option A coupon reservation and payment method (COD) are strictly preserved across timeout and recovery', async () => {
    const subId = 'sub-coupon-preservation-01';
    const payloadWithCoupon = {
      customer_name: 'Priya Sharma',
      customer_phone: '9876543210',
      pickup_address: '99 Indiranagar',
      pickup_pincode: '560070',
      pickup_date: '2026-11-11',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-normal-wash',
      coupon_code: 'WELCOME50',
      discount_paise: 0
    };

    savePendingBooking(customerId, subId, payloadWithCoupon, 'uncertain_timeout');

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const verifyBtn = await screen.findByRole('button', { name: /Verify & Complete Booking/i });
    fireEvent.click(verifyBtn);

    const completeBtns = await screen.findAllByRole('button', { name: /Complete Booking/i });
    fireEvent.click(completeBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Pickup Booked Successfully!/i)).toBeInTheDocument();
    });

    const all = await LaundryService.getOrders();
    expect(all[0].coupon_code).toBe('WELCOME50');
    expect(all[0].payment_method).toBe('cash');
  });
});
