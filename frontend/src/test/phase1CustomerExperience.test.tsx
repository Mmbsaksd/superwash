import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { formatCustomerError } from '../utils/errorHandling';
import { LaundryService, setLiveModeForTesting } from '../services/laundryService';
import { supabase } from '../services/supabase';
import { CustomerHome } from '../pages/customer/CustomerHome';
import { OwnerDashboard } from '../pages/admin/OwnerDashboard';
import { ManagerDashboard } from '../pages/manager/ManagerDashboard';
import { DeliveryDashboard } from '../pages/delivery/DeliveryDashboard';
import { LandingPage } from '../pages/public/LandingPage';
import { LoginPage } from '../pages/public/LoginPage';
import { MapLocationPicker } from '../components/MapLocationPicker';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { Profile } from '../types';
import {
  savePendingBooking,
  getPendingBooking,
  clearPendingBooking,
  PENDING_BOOKING_KEY,
  calculateBookingFingerprint,
  isAmbiguousNetworkError,
  updatePendingBookingStatus
} from '../utils/pendingBooking';

describe('Phase 1: Customer-Facing Error Handling & Sanitization', () => {
  it('converts raw PostgreSQL and PostgREST errors into safe customer-friendly messages', () => {
    const rawRls = new Error('new row violates row-level security policy for table "orders"');
    const result = formatCustomerError(rawRls);
    expect(result).toBe('A temporary service issue occurred while processing your request. Please try again in a few moments.');
    expect(result).not.toContain('row-level security');
    expect(result).not.toContain('orders');
  });

  it('provides actionable sign-in guidance for unauthenticated booking attempts', () => {
    const unauthError = new Error('User is unauthenticated');
    const result = formatCustomerError(unauthError);
    expect(result).toBe('Sign-in required: Please sign in with your account to confirm your pickup booking.');
  });

  it('converts expired JWT or token errors into clear session re-authentication guidance', () => {
    const rawJwt = new Error('JWT expired: token has expired or is invalid');
    const result = formatCustomerError(rawJwt);
    expect(result).toBe('Your sign-in session has expired. Please refresh the page or sign in again to continue.');
  });

  it('converts network failures and timeouts into actionable connection retry guidance', () => {
    const rawNetwork = new Error('Failed to fetch from backend server');
    const result = formatCustomerError(rawNetwork);
    expect(result).toBe('Unable to reach our server. Please check your internet connection and try again.');
  });

  it('converts API key errors into service busy retry guidance without leaking key internals', () => {
    const rawApiKey = new Error('Invalid API key provided in authorization header');
    const result = formatCustomerError(rawApiKey);
    expect(result).toBe('Our booking service is temporarily busy. Please wait a moment and retry.');
    expect(result).not.toContain('authorization header');
  });

  it('preserves actionable user validation guidance from business logic', () => {
    const coverageError = new Error('PIN code 560099 is currently outside our service coverage.');
    expect(formatCustomerError(coverageError)).toBe('PIN code 560099 is currently outside our service coverage.');

    const slotError = new Error("The pickup slot 'Morning' on 2026-10-26 is fully booked (5/5).");
    expect(formatCustomerError(slotError)).toBe("The pickup slot 'Morning' on 2026-10-26 is fully booked (5/5).");

    const phoneError = new Error('Please enter a valid 10-digit Indian mobile number.');
    expect(formatCustomerError(phoneError)).toBe('Please enter a valid 10-digit Indian mobile number.');
  });
});

describe('Phase 1: Booking Confirmation & Anti-Duplicate Refresh Behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns existing order idempotently on repeat booking submissions or refreshes', async () => {
    const bookingParams = {
      customer_name: 'Idempotency Tester',
      customer_phone: '9988112233',
      pickup_address: '100 Feet Rd, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-26',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    // First booking attempt
    const firstOrder = await LaundryService.createOrder(bookingParams);
    expect(firstOrder.id).toBeDefined();
    expect(firstOrder.order_number).toMatch(/^SW-\d+$/);

    // Refresh simulation / repeat submission with identical phone, date, slot
    const secondAttempt = await LaundryService.createOrder(bookingParams);
    expect(secondAttempt.id).toBe(firstOrder.id);
    expect(secondAttempt.order_number).toBe(firstOrder.order_number);

    // Ensure order list does not contain duplicate entries for this slot
    const allOrders = await LaundryService.getOrders();
    const matching = allOrders.filter(
      (o) =>
        o.customer_phone.replace(/[^0-9]/g, '') === '9988112233' &&
        o.pickup_date === '2026-10-26' &&
        o.pickup_slot === 'Morning (08:00 AM - 11:00 AM)'
    );
    expect(matching.length).toBe(1);
  });

  it('renders confirmation banner and maintains tracking tab on reload via sessionStorage and searchParams', async () => {
    const mockOrder = {
      id: 'ord-refresh-101',
      order_number: 'SW-1050',
      customer_id: 'cust-1',
      customer_name: 'Session Customer',
      customer_phone: '9876543210',
      pickup_address: 'Indiranagar 5th Main',
      pickup_pincode: '560038',
      pickup_date: '2026-10-26',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      order_status: 'booked' as const,
      payment_status: 'pending' as const,
      payment_method: 'cash' as const,
      paid_amount_paise: 0,
      timestamp: Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Store confirmed order into sessionStorage simulating post-booking reload
    sessionStorage.setItem('superwash_last_confirmed_order', JSON.stringify(mockOrder));

    const customerProfile: Profile = {
      id: 'cust-1',
      email: 'customer@test.com',
      role: 'customer',
      full_name: 'Session Customer',
      phone: '9876543210',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    render(
      <MemoryRouter initialEntries={['/customer?tab=current&confirmed=SW-1050']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for customer home to load
    await waitFor(() => {
      expect(screen.getByText(/Pickup Booked Successfully!/i)).toBeInTheDocument();
    });

    expect(screen.getByText('#SW-1050')).toBeInTheDocument();
    expect(screen.getByText(/Track Live Progress/i)).toBeInTheDocument();
  });

  it('allows two legitimate bookings with different services for the same customer, date, and slot', async () => {
    LaundryService.resetOrderSequence();
    const base = {
      customer_name: 'Multi-Service Customer',
      customer_phone: '9876500001',
      pickup_address: 'Flat 101, Indiranagar, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-27',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    const order1 = await LaundryService.createOrder({
      ...base,
      service_id: 'srv-iron-2'
    });
    const order2 = await LaundryService.createOrder({
      ...base,
      service_id: 'srv-bulk-4'
    });

    expect(order1.id).not.toBe(order2.id);
    expect(order1.order_number).not.toBe(order2.order_number);
    expect(order1.service_id).toBe('srv-iron-2');
    expect(order2.service_id).toBe('srv-bulk-4');
  });

  it('allows two legitimate bookings with different addresses for the same customer, date, slot, and service', async () => {
    LaundryService.resetOrderSequence();
    const base = {
      customer_name: 'Multi-Address Customer',
      customer_phone: '9876500002',
      pickup_pincode: '560038',
      pickup_date: '2026-10-27',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-iron-2'
    };

    const order1 = await LaundryService.createOrder({
      ...base,
      pickup_address: 'Flat 101, 100 Feet Rd, Indiranagar'
    });
    const order2 = await LaundryService.createOrder({
      ...base,
      pickup_address: 'Office 402, 12th Main, Indiranagar'
    });

    expect(order1.id).not.toBe(order2.id);
    expect(order1.order_number).not.toBe(order2.order_number);
    expect(order1.pickup_address).toBe('Flat 101, 100 Feet Rd, Indiranagar');
    expect(order2.pickup_address).toBe('Office 402, 12th Main, Indiranagar');
  });

  it('creates separate orders for two intentional bookings with identical details but different submission IDs', async () => {
    LaundryService.resetOrderSequence();
    const commonDetails = {
      customer_name: 'Identical Booking Customer',
      customer_phone: '9876500099',
      pickup_address: '100 Feet Rd, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-27',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-iron-2'
    };

    // First intentional booking
    const firstOrder = await LaundryService.createOrder({
      ...commonDetails,
      client_submission_id: 'sub-intent-001'
    });

    // Second intentional booking with identical phone, address, date, slot, and service,
    // submitted immediately (within 60 seconds) with a distinct submission ID
    const secondOrder = await LaundryService.createOrder({
      ...commonDetails,
      client_submission_id: 'sub-intent-002'
    });

    // Must create two separate, distinct orders rather than silently merging them
    expect(firstOrder.id).not.toBe(secondOrder.id);
    expect(firstOrder.order_number).not.toBe(secondOrder.order_number);
    expect(firstOrder.order_number).toMatch(/^SW-\d+$/);
    expect(secondOrder.order_number).toMatch(/^SW-\d+$/);

    const allOrders = await LaundryService.getOrders();
    const matching = allOrders.filter(
      (o) =>
        o.customer_phone.replace(/[^0-9]/g, '') === '9876500099' &&
        o.pickup_date === '2026-10-27' &&
        o.pickup_slot === 'Morning (08:00 AM - 11:00 AM)'
    );
    expect(matching.length).toBe(2);
    expect(matching.map((o) => o.id)).toContain(firstOrder.id);
    expect(matching.map((o) => o.id)).toContain(secondOrder.id);
  });

  it('safely reuses client_submission_id on retry after timeout without creating duplicate order', async () => {
    LaundryService.resetOrderSequence();
    const clientSubmissionId = 'req-sub-test-unique-123';
    const booking = {
      customer_name: 'Retry Customer',
      customer_phone: '9876500003',
      pickup_address: 'Flat 202, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-27',
      pickup_slot: 'Noon (11:00 AM - 02:00 PM)',
      client_submission_id: clientSubmissionId
    };

    const initialOrder = await LaundryService.createOrder(booking);
    // Simulate retry after network timeout with identical client_submission_id
    const retriedOrder = await LaundryService.createOrder({
      ...booking,
      client_submission_id: clientSubmissionId
    });
    expect(retriedOrder.id).toBe(initialOrder.id);
    expect(retriedOrder.order_number).toBe(initialOrder.order_number);

    const allOrders = await LaundryService.getOrders();
    const matching = allOrders.filter((o) => o.id === initialOrder.id);
    expect(matching.length).toBe(1);

    // If booking parameters change (different slot), a new submission ID is used and creates a new booking
    const changedBooking = {
      ...booking,
      pickup_slot: 'Evening (05:00 PM - 08:00 PM)',
      client_submission_id: 'req-sub-test-unique-456'
    };
    const newOrder = await LaundryService.createOrder(changedBooking);
    expect(newOrder.id).not.toBe(initialOrder.id);
    expect(newOrder.pickup_slot).toBe('Evening (05:00 PM - 08:00 PM)');
  });

  it('handles simultaneous submissions safely via in-flight de-duplication', async () => {
    LaundryService.resetOrderSequence();
    const submissionId = 'simultaneous-sub-789';
    const booking = {
      customer_name: 'Simultaneous Customer',
      customer_phone: '9876500004',
      pickup_address: 'Villa 12, Whitefield',
      pickup_pincode: '560066',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: submissionId
    };

    const [orderA, orderB] = await Promise.all([
      LaundryService.createOrder({ ...booking }),
      LaundryService.createOrder({ ...booking })
    ]);

    expect(orderA.id).toBe(orderB.id);
    expect(orderA.order_number).toBe(orderB.order_number);

    const allOrders = await LaundryService.getOrders();
    const matching = allOrders.filter((o) => o.customer_phone === '9876500004');
    expect(matching.length).toBe(1);
  });

  it('ensures a failed booking never appears successful and does not pollute submission registry', async () => {
    LaundryService.resetOrderSequence();
    const failedSubmissionId = 'sub-fail-outside-coverage-101';
    const invalidBooking = {
      customer_name: 'Fail Tester',
      customer_phone: '9876500066',
      pickup_address: 'Out of town location',
      pickup_pincode: '560099', // Non-serviceable PIN code
      pickup_date: '2026-10-27',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: failedSubmissionId
    };

    // 1. Must reject with appropriate validation error
    await expect(LaundryService.createOrder(invalidBooking)).rejects.toThrow(
      /outside our service coverage/i
    );

    // 2. Orders list must NOT contain any order for this failed submission
    const allOrders = await LaundryService.getOrders();
    const matching = allOrders.filter((o) => o.customer_phone === '9876500066');
    expect(matching.length).toBe(0);

    // 3. Retry after failure with corrected details but same submission ID must NOT return a false cached success
    const correctedBooking = {
      ...invalidBooking,
      pickup_pincode: '560038' // Valid PIN code
    };
    const successfulRetry = await LaundryService.createOrder(correctedBooking);
    expect(successfulRetry.id).toBeDefined();
    expect(successfulRetry.pickup_pincode).toBe('560038');
    expect(successfulRetry.order_status).toBe('booked');
  });

  it('preserves existing order-number generation mechanism and sequential progression', async () => {
    LaundryService.resetOrderSequence();
    const base = {
      customer_name: 'Seq Customer',
      customer_phone: '9876500077',
      pickup_address: 'Indiranagar 100 Feet Rd',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Evening (05:00 PM - 08:00 PM)'
    };

    const first = await LaundryService.createOrder({
      ...base,
      client_submission_id: 'sub-seq-1'
    });
    const second = await LaundryService.createOrder({
      ...base,
      client_submission_id: 'sub-seq-2'
    });

    expect(first.order_number).toMatch(/^SW-\d{4,}$/);
    expect(second.order_number).toMatch(/^SW-\d{4,}$/);

    const firstNum = parseInt(first.order_number.replace('SW-', ''), 10);
    const secondNum = parseInt(second.order_number.replace('SW-', ''), 10);
    expect(secondNum).toBe(firstNum + 1);
  });
});

describe('Phase 1: Session Privacy & Unauthenticated Booking Safeguards', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does not resurrect an old confirmation on a clean /customer visit without confirmed query param', async () => {
    const oldOrder = {
      id: 'ord-old-999',
      order_number: 'SW-9999',
      customer_name: 'Clean Visit Customer',
      customer_phone: '9876543210',
      pickup_address: 'Indiranagar 5th Main',
      pickup_pincode: '560038',
      pickup_date: '2026-10-26',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      order_status: 'booked' as const,
      payment_status: 'pending' as const,
      payment_method: 'cash' as const,
      paid_amount_paise: 0,
      timestamp: Date.now() - 3600000,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString()
    };
    sessionStorage.setItem('superwash_last_confirmed_order', JSON.stringify(oldOrder));

    const customerProfile: Profile = {
      id: 'cust-1',
      email: 'customer@test.com',
      role: 'customer',
      full_name: 'Clean Visit Customer',
      phone: '9876543210',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Clean visit: the booking form must be present and confirmation banner must NOT be shown
    await waitFor(() => {
      expect(screen.getByText(/Schedule Home Pickup/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Pickup Booked Successfully!/i)).not.toBeInTheDocument();
    expect(screen.queryByText('#SW-9999')).not.toBeInTheDocument();
  });

  it('clears stored confirmation and prevents leaking private order details to subsequent user', async () => {
    const userAOrder = {
      id: 'ord-user-a',
      order_number: 'SW-1111',
      customer_id: 'user-a-id',
      customer_name: 'User A',
      customer_phone: '9876500001',
      pickup_address: 'Private Home of User A',
      pickup_pincode: '560038',
      pickup_date: '2026-10-26',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      order_status: 'booked' as const,
      payment_status: 'pending' as const,
      payment_method: 'cash' as const,
      paid_amount_paise: 0,
      timestamp: Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    sessionStorage.setItem('superwash_last_confirmed_order', JSON.stringify(userAOrder));

    // User B logs in
    const userBProfile: Profile = {
      id: 'user-b-id',
      email: 'userb@test.com',
      role: 'customer',
      full_name: 'User B',
      phone: '9876500002',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(userBProfile));

    // User B visits with User A's confirmed param
    render(
      <MemoryRouter initialEntries={['/customer?tab=current&confirmed=SW-1111']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Should NOT display User A's confirmation banner or private address
    await waitFor(() => {
      expect(screen.queryByText('#SW-1111')).not.toBeInTheDocument();
      expect(sessionStorage.getItem('superwash_last_confirmed_order')).toBeNull();
    });
    expect(screen.queryByText('Private Home of User A')).not.toBeInTheDocument();
  });

  it('displays sign-in requirement and directs unauthenticated visitors through sign-in flow', async () => {
    localStorage.removeItem('superwash_auth_profile');

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
            <Route path="/login" element={<div>Login Page Mock</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Sign-in is required to confirm and live-track/i)).toBeInTheDocument();
    });

    // Check button label reflects sign-in requirement
    const signInButton = screen.getAllByRole('button', { name: /Sign In to Book Pickup/i })[0];
    expect(signInButton).toBeInTheDocument();
  });
});

describe('Phase 1: Portal Logo Navigation & Link Accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('makes customer portal header brand logo clickable to /customer', async () => {
    const customerProfile: Profile = {
      id: 'cust-1',
      email: 'customer@test.com',
      role: 'customer',
      full_name: 'Customer Logo Tester',
      phone: '9876543212',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

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
      const logoLink = screen.queryByTitle('SuperWash Exprez Home') || screen.queryByTitle('SuperWash Customer Laundry Hub');
      expect(logoLink).toBeInTheDocument();
      expect(['/', '/customer']).toContain(logoLink?.getAttribute('href'));
    });
  });

  it('makes owner dashboard header logo clickable to /admin', async () => {
    const ownerProfile: Profile = {
      id: 'owner-1',
      email: 'owner@test.com',
      role: 'owner',
      full_name: 'Owner Tester',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/admin" element={<OwnerDashboard />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTitle('SuperWash Business Owner Portal')).toBeInTheDocument();
    });

    const logoLink = screen.getByTitle('SuperWash Business Owner Portal');
    expect(logoLink.getAttribute('href')).toBe('/admin');
  });

  it('makes manager portal header logo clickable to /manager', async () => {
    const managerProfile: Profile = {
      id: 'mgr-1',
      email: 'manager@test.com',
      role: 'manager',
      full_name: 'Manager Tester',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(managerProfile));

    render(
      <MemoryRouter initialEntries={['/manager']}>
        <AuthProvider>
          <Routes>
            <Route path="/manager" element={<ManagerDashboard />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTitle('SuperWash Store Manager Portal')).toBeInTheDocument();
    });

    const logoLink = screen.getByTitle('SuperWash Store Manager Portal');
    expect(logoLink.getAttribute('href')).toBe('/manager');
  });

  it('makes delivery portal header logo clickable to /delivery', async () => {
    const deliveryProfile: Profile = {
      id: 'del-1',
      email: 'delivery@test.com',
      role: 'delivery',
      full_name: 'Delivery Tester',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(deliveryProfile));

    render(
      <MemoryRouter initialEntries={['/delivery']}>
        <AuthProvider>
          <Routes>
            <Route path="/delivery" element={<DeliveryDashboard />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTitle('SuperWash Delivery Associate Portal')).toBeInTheDocument();
    });

    const logoLink = screen.getByTitle('SuperWash Delivery Associate Portal');
    expect(logoLink.getAttribute('href')).toBe('/delivery');
  });

  it('makes public landing page footer logo clickable to /', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTitle('SuperWash Exprez Home')).toBeInTheDocument();
    });

    const footerLogo = screen.getByTitle('SuperWash Exprez Home');
    expect(footerLogo.getAttribute('href')).toBe('/');
  });
});

describe('Phase 1: Refresh-Safe Booking Idempotency & Uncertain Timeout Recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    LaundryService.resetOrderSequence();
  });

  it('safely recovers and resolves an uncertain timeout after page refresh without creating a duplicate', async () => {
    const customerId = 'cust-refresh-safe-1';
    const clientSubId = 'sub-uncertain-timeout-88';
    const customerProfile: Profile = {
      id: customerId,
      email: 'customer@test.com',
      role: 'customer',
      full_name: 'Refresh Safe Customer',
      phone: '9876543210',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    const bookingPayload = {
      customer_name: 'Refresh Safe Customer',
      customer_phone: '9876543210',
      pickup_address: '100 Feet Rd, Indiranagar',
      pickup_landmark: 'Near Metro',
      pickup_pincode: '560038',
      pickup_date: '2026-10-29',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-iron-2'
    };

    // 1. Pre-commit order into backend storage simulating database commit before timeout
    const committedOrder = await LaundryService.createOrder({
      ...bookingPayload,
      customer_id: customerId,
      client_submission_id: clientSubId
    });
    expect(committedOrder.id).toBeDefined();

    // 2. Simulate client saving an 'uncertain_timeout' in sessionStorage before refreshing
    savePendingBooking(customerId, clientSubId, bookingPayload, 'uncertain_timeout');

    // Verify sessionStorage has the uncertain record
    const stored = getPendingBooking(customerId);
    expect(stored?.clientSubmissionId).toBe(clientSubId);
    expect(stored?.status).toBe('uncertain_timeout');

    // 3. Simulate browser page refresh: mount CustomerHome under /customer
    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // 4. Recovery banner must appear indicating unconfirmed booking attempt
    await waitFor(() => {
      expect(screen.getByText(/Unconfirmed Booking Attempt Detected/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Verify & Complete Booking/i)).toBeInTheDocument();

    // 5. Customer clicks "Verify & Complete Booking" to resolve
    const verifyButton = screen.getByRole('button', { name: /Verify & Complete Booking/i });
    fireEvent.click(verifyButton);

    // 6. Confirms the original committed order without creating any duplicate
    await waitFor(() => {
      expect(screen.getByText(/Pickup Booked Successfully!/i)).toBeInTheDocument();
      expect(screen.getByText(`#${committedOrder.order_number}`)).toBeInTheDocument();
    });

    // 7. SessionStorage pending record must be cleared
    expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();

    // 8. Order list must have strictly 1 order for this customer
    const allOrders = await LaundryService.getOrders();
    const customerOrders = allOrders.filter((o) => o.customer_phone === '9876543210');
    expect(customerOrders.length).toBe(1);
    expect(customerOrders[0].id).toBe(committedOrder.id);
  });

  it('creates separate intentional orders for concurrent requests using different submission IDs', async () => {
    const base = {
      customer_name: 'Concurrent Multi Customer',
      customer_phone: '9876543211',
      pickup_address: 'Flat 501, Cambridge Layout',
      pickup_pincode: '560008',
      pickup_date: '2026-10-29',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: 'srv-iron-2'
    };

    // Parallel requests with distinct submission IDs (e.g. user opening two separate tabs to book two services)
    const [orderA, orderB] = await Promise.all([
      LaundryService.createOrder({
        ...base,
        client_submission_id: 'sub-concurrent-diff-1'
      }),
      LaundryService.createOrder({
        ...base,
        client_submission_id: 'sub-concurrent-diff-2'
      })
    ]);

    expect(orderA.id).not.toBe(orderB.id);
    expect(orderA.order_number).not.toBe(orderB.order_number);
    expect(orderA.order_number).toMatch(/^SW-\d+$/);
    expect(orderB.order_number).toMatch(/^SW-\d+$/);

    const allOrders = await LaundryService.getOrders();
    const customerOrders = allOrders.filter((o) => o.customer_phone === '9876543211');
    expect(customerOrders.length).toBe(2);
  });

  it('guarantees that a network timeout after a database commit does not create a duplicate on retry', async () => {
    const clientSubmissionId = 'sub-network-timeout-commit-1';
    const booking = {
      customer_name: 'Timeout Tester',
      customer_phone: '9876543213',
      pickup_address: '88 MG Road',
      pickup_pincode: '560001',
      pickup_date: '2026-10-30',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: clientSubmissionId
    };

    // First attempt commits to database
    const originalOrder = await LaundryService.createOrder(booking);
    expect(originalOrder.id).toBeDefined();

    // Client timed out before receiving 201 response.
    // Retry sends the exact same client_submission_id
    const retriedOrder = await LaundryService.createOrder({
      ...booking,
      client_submission_id: clientSubmissionId
    });

    expect(retriedOrder.id).toBe(originalOrder.id);
    expect(retriedOrder.order_number).toBe(originalOrder.order_number);

    const allOrders = await LaundryService.getOrders();
    const customerOrders = allOrders.filter((o) => o.customer_phone === '9876543213');
    expect(customerOrders.length).toBe(1);
  });

  it('enforces cross-account isolation: a pending booking cannot be restored for another customer', () => {
    const userAPayload = {
      customer_name: 'User A',
      customer_phone: '9876500001',
      pickup_address: 'Secret Home of User A',
      pickup_pincode: '560038',
      pickup_date: '2026-10-29',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    // User A stores a pending booking
    savePendingBooking('user-a-id', 'sub-user-a-01', userAPayload, 'uncertain_timeout');

    // User B attempts to access pending booking
    const resultForUserB = getPendingBooking('user-b-id');
    expect(resultForUserB).toBeNull();

    // SessionStorage must have purged the mismatched record to prevent leakage
    expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();
  });

  it('safely handles malformed and expired pending records without silently losing an uncertain booking', () => {
    const userId = 'cust-edge-case-1';
    const validPayload = {
      customer_name: 'Edge Tester',
      customer_phone: '9876500002',
      pickup_address: '100 Feet Rd, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-29',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    // 1. Malformed JSON handling
    sessionStorage.setItem(PENDING_BOOKING_KEY, '{ invalid: json ]');
    expect(getPendingBooking(userId)).toBeNull();
    expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();

    // 2. Tampered fingerprint handling
    savePendingBooking(userId, 'sub-tamper-1', validPayload, 'in_flight');
    const raw = JSON.parse(sessionStorage.getItem(PENDING_BOOKING_KEY)!);
    raw.fingerprint = 'tampered-invalid-hash';
    sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(raw));
    expect(getPendingBooking(userId)).toBeNull();

    // 3. Expired in_flight record is discarded (abandoned session)
    savePendingBooking(userId, 'sub-expired-in-flight', validPayload, 'in_flight');
    const expiredRaw = JSON.parse(sessionStorage.getItem(PENDING_BOOKING_KEY)!);
    expiredRaw.createdAt = Date.now() - (20 * 60 * 1000); // 20 minutes ago
    sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(expiredRaw));
    expect(getPendingBooking(userId)).toBeNull();

    // 4. Expired uncertain_timeout record is PRESERVED so customer can resolve it
    savePendingBooking(userId, 'sub-expired-uncertain', validPayload, 'uncertain_timeout');
    const uncertainRaw = JSON.parse(sessionStorage.getItem(PENDING_BOOKING_KEY)!);
    uncertainRaw.createdAt = Date.now() - (20 * 60 * 1000); // 20 minutes ago
    sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(uncertainRaw));
    const preserved = getPendingBooking(userId);
    expect(preserved).not.toBeNull();
    expect(preserved?.clientSubmissionId).toBe('sub-expired-uncertain');
    expect(preserved?.status).toBe('uncertain_timeout');
  });

  it('sanitizes pending booking records on logout and account switching', async () => {
    const userPayload = {
      customer_name: 'Logout Customer',
      customer_phone: '9876500003',
      pickup_address: 'Private Suite 90',
      pickup_pincode: '560038',
      pickup_date: '2026-10-29',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };
    savePendingBooking('cust-logout-1', 'sub-logout-101', userPayload, 'uncertain_timeout');
    expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).not.toBeNull();

    // Simulate clearing user operational cache on logout
    LaundryService.clearUserOperationalCache();
    expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();
  });
});

describe('Phase 1: Real Live-Mode Mocked Idempotency & Failure Resilience', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    setLiveModeForTesting(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setLiveModeForTesting(false);
  });

  it('guarantees that a missing RPC in live mode NEVER triggers a direct insert and throws BOOKING_SERVICE_UNAVAILABLE', async () => {
    setLiveModeForTesting(true);

    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'could not find the function public.create_booking_idempotent in the schema cache',
        details: null,
        hint: null
      }
    } as any);

    const insertSpy = vi.fn();
    const queryBuilderMock: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: [], error: null }),
      insert: insertSpy
    };
    vi.spyOn(supabase, 'from').mockReturnValue(queryBuilderMock);

    const bookingPayload = {
      customer_name: 'RPC Missing Tester',
      customer_phone: '9876543299',
      pickup_address: '100 Feet Road, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-missing-rpc-1'
    };

    // Save pending booking in flight
    savePendingBooking('user-live-1', 'sub-missing-rpc-1', bookingPayload, 'in_flight');

    let thrownError: any = null;
    try {
      await LaundryService.createBooking(bookingPayload);
    } catch (err: any) {
      thrownError = err;
    }

    // 1. Must throw an explicit service unavailable error
    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe('BOOKING_SERVICE_UNAVAILABLE');
    expect(thrownError.message).toContain('temporarily unavailable');

    // 2. Must NEVER trigger fallback direct insert to table orders
    expect(insertSpy).not.toHaveBeenCalled();

    // 3. Error must be recognized as preserving the pending booking
    expect(isAmbiguousNetworkError(thrownError)).toBe(true);

    // 4. Pending submission ID and payload must remain safely preserved in sessionStorage
    const pendingRecord = getPendingBooking('user-live-1');
    expect(pendingRecord).not.toBeNull();
    expect(pendingRecord?.clientSubmissionId).toBe('sub-missing-rpc-1');
    expect(pendingRecord?.payload.pickup_address).toBe('100 Feet Road, Indiranagar');
  });

  it('preserves the exact submission ID and payload across an ambiguous network timeout in live mode', async () => {
    setLiveModeForTesting(true);

    // Mock RPC network abort / connection timeout
    vi.spyOn(supabase, 'rpc').mockRejectedValue(
      new Error('TypeError: Failed to fetch (connection timeout)')
    );

    const clientSubId = 'sub-live-timeout-abort-1';
    const payload = {
      customer_name: 'Network Timeout User',
      customer_phone: '9876543298',
      pickup_address: '42 Ring Road, Bellandur',
      pickup_pincode: '560103',
      pickup_date: '2026-10-31',
      pickup_slot: 'Noon (11:00 AM - 02:00 PM)'
    };

    // Customer starts booking: persisted before network call
    savePendingBooking('user-live-2', clientSubId, payload, 'in_flight');

    let caughtErr: any = null;
    try {
      await LaundryService.createBooking({
        ...payload,
        client_submission_id: clientSubId
      });
    } catch (err: any) {
      caughtErr = err;
    }

    expect(caughtErr).not.toBeNull();
    expect(isAmbiguousNetworkError(caughtErr)).toBe(true);

    // Update status to uncertain_timeout as CustomerHome does
    const updated = updatePendingBookingStatus('uncertain_timeout');
    expect(updated?.status).toBe('uncertain_timeout');

    // SessionStorage must retain the record with original submission ID
    const stored = getPendingBooking('user-live-2');
    expect(stored?.clientSubmissionId).toBe(clientSubId);
    expect(stored?.status).toBe('uncertain_timeout');
    expect(stored?.payload.pickup_date).toBe('2026-10-31');
  });

  it('returns original order on retry of the same submission ID in live mode', async () => {
    setLiveModeForTesting(true);

    const committedOrder = {
      id: '00000000-0000-4000-b000-000000000999',
      order_number: 'SW-9999',
      customer_id: 'user-live-3',
      customer_name: 'Retry Customer',
      customer_phone: '9876543297',
      pickup_address: '100 Feet Road, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: null,
      service_name: 'Wash & Fold (Normal)',
      pricing_unit: 'per_kg',
      price_per_kg_paise: 8000,
      min_weight_kg: 3,
      delivery_charge_paise: 0,
      total_amount_paise: null,
      paid_amount_paise: 0,
      payment_status: 'pending',
      payment_method: 'cash',
      order_status: 'booked',
      client_submission_id: 'sub-live-retry-exact-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: committedOrder,
      error: null
    } as any);

    const payload = {
      customer_name: 'Retry Customer',
      customer_phone: '9876543297',
      pickup_address: '100 Feet Road, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-live-retry-exact-1'
    };

    // First attempt returns order
    const order1 = await LaundryService.createBooking(payload);
    expect(order1.order_number).toBe('SW-9999');

    // Simulate page refresh (clearing in-memory client registry so retry hits RPC authoritatively)
    LaundryService.resetOrderSequence();

    // Second attempt (retry after timeout/refresh) passes the exact same submission ID
    const order2 = await LaundryService.createBooking(payload);
    expect(order2.order_number).toBe('SW-9999');
    expect(order2.id).toBe(order1.id);

    expect(rpcSpy).toHaveBeenCalledTimes(2);
    expect(rpcSpy).toHaveBeenLastCalledWith(
      'create_booking_idempotent',
      expect.objectContaining({
        p_client_submission_id: 'sub-live-retry-exact-1'
      })
    );
  });

  it('creates two distinct intentional orders when two different submission IDs are submitted in live mode', async () => {
    setLiveModeForTesting(true);

    const orderA = {
      id: '00000000-0000-4000-b000-000000000991',
      order_number: 'SW-9991',
      customer_id: 'user-live-4',
      customer_name: 'Multi Intent Customer',
      customer_phone: '9876543296',
      pickup_address: '77 Brigade Road',
      pickup_pincode: '560001',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      order_status: 'booked',
      client_submission_id: 'sub-live-distinct-A'
    };

    const orderB = {
      id: '00000000-0000-4000-b000-000000000992',
      order_number: 'SW-9992',
      customer_id: 'user-live-4',
      customer_name: 'Multi Intent Customer',
      customer_phone: '9876543296',
      pickup_address: '77 Brigade Road',
      pickup_pincode: '560001',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      order_status: 'booked',
      client_submission_id: 'sub-live-distinct-B'
    };

    (vi.spyOn(supabase, 'rpc') as any).mockImplementation(async (fnName: string, args: any) => {
      if (args?.p_client_submission_id === 'sub-live-distinct-A') {
        return { data: orderA, error: null } as any;
      }
      if (args?.p_client_submission_id === 'sub-live-distinct-B') {
        return { data: orderB, error: null } as any;
      }
      return { data: null, error: new Error('Unknown submission') } as any;
    });

    const basePayload = {
      customer_name: 'Multi Intent Customer',
      customer_phone: '9876543296',
      pickup_address: '77 Brigade Road',
      pickup_pincode: '560001',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    const resA = await LaundryService.createBooking({
      ...basePayload,
      client_submission_id: 'sub-live-distinct-A'
    });

    const resB = await LaundryService.createBooking({
      ...basePayload,
      client_submission_id: 'sub-live-distinct-B'
    });

    expect(resA.id).not.toBe(resB.id);
    expect(resA.order_number).toBe('SW-9991');
    expect(resB.order_number).toBe('SW-9992');
  });

  it('protects uncertain booking records from accidental deletion when form parameters change', async () => {
    const customerId = '00000000-0000-4000-a000-000000000005';
    const customerProfile: Profile = {
      id: customerId,
      phone: '9876543212',
      full_name: 'Priya Patel',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    const subId = 'sub-protect-uncertain-1';

    const payload = {
      customer_name: 'Priya Patel',
      customer_phone: '9876543212',
      pickup_address: 'Flat 402, Green Glen Layout, Bellandur, Bengaluru',
      pickup_pincode: '560103',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    // Customer has an uncertain booking stored
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

    // Banner must appear
    await waitFor(() => {
      expect(screen.getByText(/Unconfirmed Booking Attempt Detected/i)).toBeInTheDocument();
    });

    // Verify button exists
    expect(screen.getByRole('button', { name: /Verify & Complete Booking/i })).toBeInTheDocument();

    // Verify pending record was NOT purged by mounting or initial form states
    const preserved = getPendingBooking(customerId);
    expect(preserved).not.toBeNull();
    expect(preserved?.clientSubmissionId).toBe(subId);
    expect(preserved?.status).toBe('uncertain_timeout');
  });

  it('safe status check queries database and resolves committed order without creating a duplicate', async () => {
    const customerId = '00000000-0000-4000-a000-000000000005';
    const customerProfile: Profile = {
      id: customerId,
      phone: '9876543212',
      full_name: 'Priya Patel',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    const subId = 'sub-safe-status-check-1';

    const committedOrder = {
      id: '00000000-0000-4000-b000-000000000888',
      order_number: 'SW-8888',
      customer_id: customerId,
      customer_name: 'Priya Patel',
      customer_phone: '9876543212',
      pickup_address: 'Flat 402, Green Glen Layout, Bellandur, Bengaluru',
      pickup_pincode: '560103',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      order_status: 'booked' as const,
      client_submission_id: subId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      price_per_kg_paise: 8000,
      min_weight_kg: 3,
      delivery_charge_paise: 0,
      paid_amount_paise: 0,
      payment_status: 'pending' as const
    };

    // Pre-seed committed order in local storage
    localStorage.setItem('superwash_orders', JSON.stringify([committedOrder]));

    // Customer has uncertain booking in sessionStorage
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

    // Click "Verify & Complete Booking"
    const verifyBtn = screen.getByRole('button', { name: /Verify & Complete Booking/i });
    fireEvent.click(verifyBtn);

    // Must resolve cleanly to the committed order
    await waitFor(() => {
      expect(screen.getByText(/Pickup Booked Successfully!/i)).toBeInTheDocument();
      expect(screen.getByText('#SW-8888')).toBeInTheDocument();
    });

    // SessionStorage pending record must be cleared
    expect(sessionStorage.getItem(PENDING_BOOKING_KEY)).toBeNull();
  });

  it('rejects booking when pickup slot is missing, deactivated, or invalid [SQL behaviour not verified by mocks]', async () => {
    // NOTE: Strict pickup slot existence, active state, and capacity checks are enforced at PostgreSQL level
    // in migration 20261026200000_booking_idempotency_rpc.sql lines 210-224. This test verifies client error handling.
    setLiveModeForTesting(true);

    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'Pickup slot "Night (09:00 PM - 12:00 AM)" does not exist in the store schedule.',
        details: null,
        hint: null
      }
    } as any);

    let caughtErr: any = null;
    try {
      await LaundryService.createBooking({
        customer_name: 'Slot Tester',
        customer_phone: '9876543210',
        pickup_address: '123 Test St',
        pickup_pincode: '560038',
        pickup_date: '2026-10-31',
        pickup_slot: 'Night (09:00 PM - 12:00 AM)',
        client_submission_id: 'sub-invalid-slot-1'
      });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).not.toBeNull();
    expect(caughtErr.message).toContain('does not exist');
  });

  it('rejects booking when slot capacity is exhausted concurrently [SQL concurrency not verified by mocks]', async () => {
    // NOTE: Concurrency-safe capacity locking via pg_advisory_xact_lock(hashtext(...)) is enforced at PostgreSQL level
    // in migration 20261026200000_booking_idempotency_rpc.sql lines 228-243. This test verifies client rejection handling.
    setLiveModeForTesting(true);

    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'The pickup slot "Morning (08:00 AM - 11:00 AM)" on 2026-10-31 is fully booked (10/10). Please select another slot.',
        details: null,
        hint: null
      }
    } as any);

    let caughtErr: any = null;
    try {
      await LaundryService.createBooking({
        customer_name: 'Slot Exhausted Tester',
        customer_phone: '9876543210',
        pickup_address: '123 Test St',
        pickup_pincode: '560038',
        pickup_date: '2026-10-31',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        client_submission_id: 'sub-exhausted-slot-1'
      });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).not.toBeNull();
    expect(caughtErr.message).toContain('fully booked');
  });

  it('strictly rejects cross-account submission ID reuse [Database security not verified by mocks]', async () => {
    // NOTE: Strict customer_id = auth.uid() enforcement and exclusion of cross-account order retrieval are enforced
    // at PostgreSQL level in migration 20261026200000_booking_idempotency_rpc.sql lines 188-191 and 322-324.
    setLiveModeForTesting(true);

    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'Security violation: Submission ID conflict detected.',
        details: null,
        hint: null
      }
    } as any);

    let caughtErr: any = null;
    try {
      await LaundryService.createBooking({
        customer_name: 'Attacker Impersonator',
        customer_phone: '9876543219',
        pickup_address: 'Malicious Address',
        pickup_pincode: '560038',
        pickup_date: '2026-10-31',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        client_submission_id: 'sub-stolen-victim-id'
      });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).not.toBeNull();
    expect(caughtErr.message).toContain('Security violation: Submission ID conflict detected');
  });

  it('rejects reuse of the same submission ID with changed booking details [Database integrity not verified by mocks]', async () => {
    // NOTE: Server-validated payload fingerprinting (MD5 of normalized booking attributes) is enforced at PostgreSQL level
    // in migration 20261026200000_booking_idempotency_rpc.sql lines 173-203 and 326-336.
    setLiveModeForTesting(true);

    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'Idempotency conflict: client_submission_id "sub-reused-changed-payload" was already used for a booking with different details.',
        details: null,
        hint: null
      }
    } as any);

    let caughtErr: any = null;
    try {
      await LaundryService.createBooking({
        customer_name: 'Payload Tamperer',
        customer_phone: '9876543210',
        pickup_address: 'Different Address Changed',
        pickup_pincode: '560038',
        pickup_date: '2026-10-31',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        client_submission_id: 'sub-reused-changed-payload'
      });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).not.toBeNull();
    expect(caughtErr.message).toContain('Idempotency conflict');
  });

  it('safely handles missing migration or column during status recovery without declaring "not found"', async () => {
    const customerId = '00000000-0000-4000-a000-000000000005';
    const customerProfile: Profile = {
      id: customerId,
      phone: '9876543212',
      full_name: 'Priya Patel',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    const subId = 'sub-missing-column-recovery-1';
    const payload = {
      customer_name: 'Priya Patel',
      customer_phone: '9876543212',
      pickup_address: 'Flat 402, Green Glen Layout, Bellandur, Bengaluru',
      pickup_pincode: '560103',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    savePendingBooking(customerId, subId, payload, 'uncertain_timeout');

    // Simulate live mode where column client_submission_id does not exist yet (code 42703)
    setLiveModeForTesting(true);

    const queryBuilderMock: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '42703',
          message: 'column "client_submission_id" does not exist'
        }
      })
    };
    vi.spyOn(supabase, 'from').mockReturnValue(queryBuilderMock);

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

    // It must show the database upgrade notice and NOT say "Verified: No order was created"
    await waitFor(() => {
      expect(
        screen.getByText(/The booking verification service is temporarily unavailable while database upgrades are pending/i)
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/Verified: No order was created/i)).toBeNull();

    // The uncertain pending booking MUST be preserved in sessionStorage
    const preserved = getPendingBooking(customerId);
    expect(preserved).not.toBeNull();
    expect(preserved?.clientSubmissionId).toBe(subId);
    expect(preserved?.status).toBe('uncertain_timeout');
  });
});

describe('Phase 1: Customer Saved Address Management, Deduplication & Pre-Booking Refinement', () => {
  const testUserId = 'test-customer-addr-uuid-1';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setLiveModeForTesting(false);
  });

  it('deduplicates saved addresses when identical address line and pincode are saved', async () => {
    const addr1 = await LaundryService.saveCustomerAddress({
      user_id: testUserId,
      label: 'Home',
      address_line: 'Flat 402, Green Glen Layout, Bellandur',
      pincode: '560103',
      landmark: 'Near Central Mall',
      is_default: true
    });
    expect(addr1.id).toBeDefined();

    // Re-saving the same address line & pincode
    const addr2 = await LaundryService.saveCustomerAddress({
      user_id: testUserId,
      label: 'Home',
      address_line: 'Flat 402,   green glen layout, bellandur  ',
      pincode: '560103',
      is_default: false
    });

    // Should return existing record, not create duplicate
    expect(addr2.id).toBe(addr1.id);

    const allAddrs = await LaundryService.getCustomerAddresses(testUserId);
    const matching = allAddrs.filter((a) => a.pincode === '560103');
    expect(matching.length).toBe(1);
  });

  it('preserves custom label (e.g. Work) when re-saving address with default Home label', async () => {
    const customAddr = await LaundryService.saveCustomerAddress({
      user_id: testUserId,
      label: 'Work',
      address_line: 'Tower C, Bagmane Tech Park, CV Raman Nagar',
      pincode: '560093',
      landmark: 'Near Back Gate',
      is_default: false
    });
    expect(customAddr.label).toBe('Work');

    // Attempting to re-save the exact same address with generic default 'Home' label
    const resaved = await LaundryService.saveCustomerAddress({
      user_id: testUserId,
      label: 'Home',
      address_line: 'Tower C, Bagmane Tech Park, CV Raman Nagar',
      pincode: '560093',
      landmark: 'Near Main Gate', // Updated landmark
      is_default: false
    });

    expect(resaved.id).toBe(customAddr.id);
    expect(resaved.label).toBe('Work'); // Label preserved as Work, NOT overwritten with Home!
    expect(resaved.landmark).toBe('Near Main Gate'); // Landmark updated

    const freshList = await LaundryService.getCustomerAddresses(testUserId);
    const persisted = freshList.find((a) => a.id === customAddr.id);
    expect(persisted?.label).toBe('Work');
  });

  it('deduplicates concurrent in-flight saveAddress calls to avoid duplicate records', async () => {
    const addressPayload = {
      user_id: testUserId,
      label: 'Home',
      address_line: '42 MG Road, Brigade Junction',
      pincode: '560001',
      is_default: false
    };

    // Fire 3 simultaneous saves for the identical address
    const [res1, res2, res3] = await Promise.all([
      LaundryService.saveCustomerAddress(addressPayload),
      LaundryService.saveCustomerAddress(addressPayload),
      LaundryService.saveCustomerAddress(addressPayload)
    ]);

    expect(res1.id).toBe(res2.id);
    expect(res2.id).toBe(res3.id);

    const allAddrs = await LaundryService.getCustomerAddresses(testUserId);
    const matches = allAddrs.filter((a) => a.pincode === '560001');
    expect(matches.length).toBe(1);
  });

  it('updates saved address details via updateCustomerAddress', async () => {
    const saved = await LaundryService.saveCustomerAddress({
      user_id: testUserId,
      label: 'Office',
      address_line: 'Old Tower 1, EGL Tech Park',
      pincode: '560071',
      is_default: false
    });

    const updated = await LaundryService.updateCustomerAddress(saved.id, {
      user_id: testUserId,
      address_line: 'New Tower 4, Suite 300, EGL Tech Park',
      landmark: 'Next to Domlur Flyover',
      latitude: 12.9602,
      longitude: 77.6485
    });

    expect(updated.id).toBe(saved.id);
    expect(updated.address_line).toBe('New Tower 4, Suite 300, EGL Tech Park');
    expect(updated.landmark).toBe('Next to Domlur Flyover');
    expect(updated.latitude).toBe(12.9602);
  });

  it('deletes saved address via deleteCustomerAddress', async () => {
    const saved = await LaundryService.saveCustomerAddress({
      user_id: testUserId,
      label: 'Temporary Flat',
      address_line: 'Room 12, Indiranagar',
      pincode: '560038',
      is_default: false
    });

    const deleted = await LaundryService.deleteCustomerAddress(saved.id, testUserId);
    expect(deleted).toBe(true);

    const remaining = await LaundryService.getCustomerAddresses(testUserId);
    expect(remaining.some((a) => a.id === saved.id)).toBe(false);
  });

  it('renders Edit and Delete actions in My Addresses tab and opens delete confirmation', async () => {
    const customerProfile: Profile = {
      id: testUserId,
      full_name: 'Anita Roy',
      phone: '9876543210',
      email: 'anita@example.com',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    const initialAddr = {
      id: 'addr-anita-1',
      user_id: testUserId,
      label: 'Home',
      address_line: 'Flat 101, Palm Meadows, Whitefield',
      pincode: '560066',
      is_default: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem(`superwash_addresses_${testUserId}`, JSON.stringify([initialAddr]));

    render(
      <MemoryRouter initialEntries={['/customer?tab=addresses']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Saved Delivery Addresses')).toBeInTheDocument();
      expect(screen.getByText('Flat 101, Palm Meadows, Whitefield')).toBeInTheDocument();
    });

    // Check Edit and Delete buttons exist
    const editBtn = screen.getByTestId('edit-address-button-addr-anita-1');
    const deleteBtn = screen.getByTestId('delete-address-button-addr-anita-1');
    expect(editBtn).toBeInTheDocument();
    expect(deleteBtn).toBeInTheDocument();

    // Click Delete button to trigger confirmation modal
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByTestId('delete-address-modal')).toBeInTheDocument();
      expect(screen.getByText(/This action cannot be undone/i)).toBeInTheDocument();
    });

    // Confirm deletion
    const confirmDeleteBtn = screen.getByTestId('confirm-delete-address-button');
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('delete-address-modal')).toBeNull();
      expect(screen.queryByText('Flat 101, Palm Meadows, Whitefield')).toBeNull();
    });
  });

  it('allows customer to refine a saved address during booking and toggle saving to address book', async () => {
    const customerProfile: Profile = {
      id: testUserId,
      full_name: 'Ravi Kumar',
      phone: '9876543211',
      email: 'ravi@example.com',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    const initialAddr = {
      id: 'addr-ravi-1',
      user_id: testUserId,
      label: 'Home',
      address_line: 'Indiranagar 12th Main',
      pincode: '560038',
      is_default: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem(`superwash_addresses_${testUserId}`, JSON.stringify([initialAddr]));

    render(
      <MemoryRouter initialEntries={['/customer?tab=book']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Schedule Home Pickup')).toBeInTheDocument();
      expect(screen.getByText('Indiranagar 12th Main')).toBeInTheDocument();
    });

    // Click Refine / Edit Address button
    const refineBtn = screen.getByTestId('refine-address-addr-ravi-1');
    expect(refineBtn).toBeInTheDocument();
    fireEvent.click(refineBtn);

    // Refinement sub-panel should appear
    await waitFor(() => {
      expect(screen.getByTestId('address-refinement-panel')).toBeInTheDocument();
      expect(screen.getByText(/Refine Address for this Pickup/i)).toBeInTheDocument();
      expect(screen.getByText(/Update my saved address book with these details/i)).toBeInTheDocument();
    });
  });
});

describe('Phase 2: Interactive Map Location Picker Component', () => {
  it('renders MapLocationPicker with address context and selected pin readout', () => {
    const onConfirmMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <MapLocationPicker
        isOpen={true}
        onClose={onCloseMock}
        onConfirm={onConfirmMock}
        initialLatitude={12.9716}
        initialLongitude={77.5946}
        addressContext="100 Feet Rd, Indiranagar"
        title="Doorstep Pickup Pin"
      />
    );

    expect(screen.getByTestId('map-location-picker-modal')).toBeInTheDocument();
    expect(screen.getByText('Doorstep Pickup Pin')).toBeInTheDocument();
    expect(screen.getByText(/100 Feet Rd, Indiranagar/i)).toBeInTheDocument();
    expect(screen.getByText(/12.971600, 77.594600/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Confirm Location Pin/i });
    fireEvent.click(confirmBtn);

    expect(onConfirmMock).toHaveBeenCalledWith({
      latitude: 12.9716,
      longitude: 77.5946
    });
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('disables Confirm button and displays unpinned notice when opened without coordinates', () => {
    const onConfirmMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <MapLocationPicker
        isOpen={true}
        onClose={onCloseMock}
        onConfirm={onConfirmMock}
        initialLatitude={null}
        initialLongitude={null}
        addressContext="100 Feet Rd, Indiranagar"
      />
    );

    expect(screen.getByText(/Pin not placed yet/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /Confirm Location Pin/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.click(confirmBtn);
    expect(onConfirmMock).not.toHaveBeenCalled();
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it('enables Confirm button after user clicks Use My GPS successfully', async () => {
    const onConfirmMock = vi.fn();
    const onCloseMock = vi.fn();

    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((success) => {
        success({
          coords: {
            latitude: 12.9352,
            longitude: 77.6245
          }
        });
      })
    };
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: mockGeolocation
    });

    render(
      <MapLocationPicker
        isOpen={true}
        onClose={onCloseMock}
        onConfirm={onConfirmMock}
        initialLatitude={null}
        initialLongitude={null}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: /Confirm Location Pin/i });
    expect(confirmBtn).toBeDisabled();

    const gpsBtn = screen.getByRole('button', { name: /Use My GPS/i });
    fireEvent.click(gpsBtn);

    await waitFor(() => {
      expect(screen.getByText(/12.935200, 77.624500/i)).toBeInTheDocument();
      expect(confirmBtn).not.toBeDisabled();
    });

    fireEvent.click(confirmBtn);
    expect(onConfirmMock).toHaveBeenCalledWith({
      latitude: 12.9352,
      longitude: 77.6245
    });
    expect(onCloseMock).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe('Phase 3: Post-Booking Pickup Location Correction', () => {
  const customerId = 'cust-pickup-correction-1';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setLiveModeForTesting(false);
  });

  it('updates pickup address and GPS coordinates for an order in booked status', async () => {
    const initialOrder = await LaundryService.createOrder({
      customer_id: customerId,
      customer_name: 'Correction Tester',
      customer_phone: '9876543200',
      pickup_address: 'Initial Road, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    expect(initialOrder.order_status).toBe('booked');

    const updated = await LaundryService.updateOrderPickupLocation(initialOrder.id, {
      pickup_address: 'Flat 5B, Skyline Apts, 100ft Rd, Indiranagar',
      pickup_landmark: 'Opposite Metro Station',
      pickup_pincode: '560038',
      pickup_latitude: 12.9784,
      pickup_longitude: 77.6408
    });

    expect(updated.id).toBe(initialOrder.id);
    expect(updated.pickup_address).toBe('Flat 5B, Skyline Apts, 100ft Rd, Indiranagar');
    expect(updated.pickup_landmark).toBe('Opposite Metro Station');
    expect(updated.pickup_latitude).toBe(12.9784);
    expect(updated.pickup_longitude).toBe(77.6408);
  });

  it('strictly rejects pickup location updates once order has progressed beyond booked', async () => {
    const order = await LaundryService.createOrder({
      customer_id: customerId,
      customer_name: 'Progressed Order Tester',
      customer_phone: '9876543201',
      pickup_address: 'Stage 1 St',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    // Simulate order advancement to collected
    await LaundryService.updateOrderStatus(order.id, 'collected', 'manager');

    await expect(
      LaundryService.updateOrderPickupLocation(order.id, {
        pickup_address: 'New St',
        pickup_pincode: '560038'
      })
    ).rejects.toThrow(/Pickup location can only be updated while the order is in "booked" status/i);
  });

  it('rejects invalid PIN code format in updateOrderPickupLocation', async () => {
    const order = await LaundryService.createOrder({
      customer_id: customerId,
      customer_name: 'Pin Tester',
      customer_phone: '9876543209',
      pickup_address: 'Stage 1 St',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await expect(
      LaundryService.updateOrderPickupLocation(order.id, {
        pickup_address: 'Updated St',
        pickup_pincode: '056001' // Invalid: starts with 0
      })
    ).rejects.toThrow(/Invalid PIN code format/i);

    await expect(
      LaundryService.updateOrderPickupLocation(order.id, {
        pickup_address: 'Updated St',
        pickup_pincode: '5600' // Invalid: less than 6 digits
      })
    ).rejects.toThrow(/Invalid PIN code format/i);
  });

  it('rejects unmatched coordinate pair in updateOrderPickupLocation', async () => {
    const order = await LaundryService.createOrder({
      customer_id: customerId,
      customer_name: 'Pair Tester',
      customer_phone: '9876543210',
      pickup_address: 'Stage 1 St',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await expect(
      LaundryService.updateOrderPickupLocation(order.id, {
        pickup_address: 'Updated St',
        pickup_pincode: '560038',
        pickup_latitude: 12.9716,
        pickup_longitude: null
      })
    ).rejects.toThrow(/coordinate pair/i);

    await expect(
      LaundryService.updateOrderPickupLocation(order.id, {
        pickup_address: 'Updated St',
        pickup_pincode: '560038',
        pickup_latitude: null,
        pickup_longitude: 77.5946
      })
    ).rejects.toThrow(/coordinate pair/i);
  });

  it('rejects out-of-range coordinates in updateOrderPickupLocation', async () => {
    const order = await LaundryService.createOrder({
      customer_id: customerId,
      customer_name: 'Bounds Tester',
      customer_phone: '9876543211',
      pickup_address: 'Stage 1 St',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await expect(
      LaundryService.updateOrderPickupLocation(order.id, {
        pickup_address: 'Updated St',
        pickup_pincode: '560038',
        pickup_latitude: 95.0, // Invalid: > 90
        pickup_longitude: 77.5946
      })
    ).rejects.toThrow(/outside the valid geographic range/i);

    await expect(
      LaundryService.updateOrderPickupLocation(order.id, {
        pickup_address: 'Updated St',
        pickup_pincode: '560038',
        pickup_latitude: 12.9716,
        pickup_longitude: 195.0 // Invalid: > 180
      })
    ).rejects.toThrow(/outside the valid geographic range/i);
  });

  it('renders Edit Pickup Location button in CustomerHome for booked orders and opens modal', async () => {
    const customerProfile: Profile = {
      id: customerId,
      full_name: 'Varun S',
      phone: '9876543202',
      email: 'varun@example.com',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    const activeOrder = await LaundryService.createOrder({
      customer_id: customerId,
      customer_name: 'Varun S',
      customer_phone: '9876543202',
      pickup_address: 'Plot 12, Indiranagar 12th Main',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    render(
      <MemoryRouter initialEntries={['/customer?tab=current']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(`Order #${activeOrder.order_number}`)).toBeInTheDocument();
    });

    const editPickupBtn = screen.getByTestId('edit-order-pickup-location-button');
    expect(editPickupBtn).toBeInTheDocument();

    fireEvent.click(editPickupBtn);

    await waitFor(() => {
      expect(screen.getByTestId('edit-order-location-modal')).toBeInTheDocument();
      expect(screen.getByText(/Correct Pickup Location/i)).toBeInTheDocument();
    });
  });
});

describe('Phase 4: Brand Logo Navigation across Portals', () => {
  it('navigates to landing page "/" when SuperWash Exprez logo is clicked in LoginPage', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div data-testid="landing-page-root">Landing Page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      const logoLink = screen.getByTitle('SuperWash Exprez Home');
      expect(logoLink).toBeInTheDocument();
      expect(logoLink.getAttribute('href')).toBe('/');
    });
  });

  it('navigates to landing page "/" when SuperWash Exprez logo is clicked in CustomerHome', async () => {
    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
            <Route path="/" element={<div data-testid="landing-page-root">Landing Page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      const homeLink = screen.getByTitle('SuperWash Exprez Home');
      expect(homeLink).toBeInTheDocument();
      expect(homeLink.getAttribute('href')).toBe('/');
    });
  });
});

describe('Phase 5: Customer Error Handling & Retry Banner', () => {
  it('displays user-friendly dataLoadError banner with Retry button on data load failure', async () => {
    // Force getSettings to throw
    vi.spyOn(LaundryService, 'getSettings').mockRejectedValueOnce(
      new Error('fetch failed: connection refused to Supabase database')
    );

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
      expect(screen.getByTestId('data-load-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/Unable to load service information/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });
  });
});
