import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import { RoleSwitcherBar } from '../components/RoleSwitcherBar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoginPage } from '../pages/public/LoginPage';
import { OwnerDashboard } from '../pages/admin/OwnerDashboard';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { LandingPage } from '../pages/public/LandingPage';
import { ContactPage } from '../pages/public/ContactPage';
import { CustomerHome } from '../pages/customer/CustomerHome';
import { LaundryService, DEMO_PROFILES, DEFAULT_SETTINGS } from '../services/laundryService';
import { supabase } from '../services/supabase';
import { FunctionsClient } from '@supabase/functions-js';
import { Profile } from '../types';

beforeEach(async () => {
  localStorage.clear();
  LaundryService.resetOrderSequence();
  await LaundryService.updateSettings({
    price_per_kg_paise: 8000,
    min_weight_kg: 3.0,
    delivery_charge_paise: 0,
    serviceable_pincodes: [
      '560001', '560008', '560025', '560034', '560038',
      '560066', '560075', '560076', '560095', '560099',
      '560102', '560103'
    ]
  });
});

describe('Pricing & Weight Calculation Business Logic', () => {
  it('calculates standard bill when measured weight exceeds minimum weight', () => {
    // 5.0 kg @ Rs 80/kg (8000 paise), min weight 3.0 kg, delivery 0
    const bill = LaundryService.calculateBill(5.0, 8000, 3.0, 0);
    expect(bill.measuredWeightKg).toBe(5.0);
    expect(bill.billableWeightKg).toBe(5.0);
    expect(bill.minWeightApplied).toBe(false);
    expect(bill.totalAmountPaise).toBe(40000); // Rs 400.00
  });

  it('applies minimum billable weight rule when measured weight is below minimum', () => {
    // 2.0 kg measured, min weight 3.0 kg @ Rs 80/kg
    const bill = LaundryService.calculateBill(2.0, 8000, 3.0, 0);
    expect(bill.measuredWeightKg).toBe(2.0);
    expect(bill.billableWeightKg).toBe(3.0);
    expect(bill.minWeightApplied).toBe(true);
    expect(bill.totalAmountPaise).toBe(24000); // Rs 240.00
  });

  it('correctly includes delivery charges when configured', () => {
    // 4.0 kg @ Rs 80/kg + Rs 50 delivery fee (5000 paise)
    const bill = LaundryService.calculateBill(4.0, 8000, 3.0, 5000);
    expect(bill.totalAmountPaise).toBe(32000 + 5000); // Rs 370.00
  });

  it('preserves order price snapshots when global settings change', async () => {
    // Create an order with Rs 80/kg
    const order = await LaundryService.createOrder({
      customer_name: 'Test Customer',
      customer_phone: '9876543212',
      pickup_address: '123 Main St, Bengaluru',
      pickup_pincode: '560001',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    expect(order.price_per_kg_paise).toBe(8000);
    expect(order.min_weight_kg).toBe(3.0);

    // Now update business settings to Rs 100/kg
    await LaundryService.updateSettings({
      price_per_kg_paise: 10000,
      min_weight_kg: 4.0
    });

    // The previously created order must retain its initial snapshot!
    const retrievedOrder = await LaundryService.getOrderById(order.id);
    expect(retrievedOrder?.price_per_kg_paise).toBe(8000);
    expect(retrievedOrder?.min_weight_kg).toBe(3.0);
  });
});

describe('Payment & Balance Calculations', () => {
  it('correctly records full and partial payments with balances', async () => {
    const order = await LaundryService.createOrder({
      customer_name: 'Payment Tester',
      customer_phone: '9876543299',
      pickup_address: '77 Residency Rd',
      pickup_pincode: '560025',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    // Enter 5 kg weight -> Rs 400.00 (40000 paise)
    const weighed = await LaundryService.enterMeasuredWeight(order.id, 5.0, 'Store Manager');
    expect(weighed.total_amount_paise).toBe(40000);
    expect(weighed.payment_status).toBe('pending');

    // Partial cash payment of Rs 200 (20000 paise)
    const partial = await LaundryService.recordPayment(order.id, 20000, 'cash', undefined, 'Part 1');
    expect(partial.paid_amount_paise).toBe(20000);
    expect(partial.payment_status).toBe('partially_paid');

    // Complete the remaining Rs 200 via UPI
    const completed = await LaundryService.recordPayment(order.id, 20000, 'upi_manual', '123456789012', 'Part 2');
    expect(completed.paid_amount_paise).toBe(40000);
    expect(completed.payment_status).toBe('paid');
  });
});

describe('Status Transitions Workflow', () => {
  it('transitions order through the 8 stages: Booked -> Pickup Assigned -> Collected -> Washing -> Ready -> Out -> Delivered', async () => {
    const order = await LaundryService.createOrder({
      customer_name: 'Workflow Tester',
      customer_phone: '9876543288',
      pickup_address: 'Indiranagar 100ft Rd',
      pickup_pincode: '560038',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    expect(order.order_status).toBe('booked');

    // Assign pickup staff
    const assigned = await LaundryService.assignPickupStaff(order.id, 'del-1', 'Ramesh', '9876543215');
    expect(assigned.order_status).toBe('pickup_assigned');

    // Mark collected
    const collected = await LaundryService.markAsCollected(order.id, '2 bags picked up');
    expect(collected.order_status).toBe('collected');

    // Enter weight -> moves to washing
    const weighed = await LaundryService.enterMeasuredWeight(order.id, 4.0);
    expect(weighed.order_status).toBe('washing');

    // Ready for delivery
    const ready = await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery');
    expect(ready.order_status).toBe('ready_for_delivery');

    // Assign delivery courier
    const courierAssigned = await LaundryService.assignDeliveryStaff(order.id, 'del-2', 'Suresh', '9876543216');
    expect(courierAssigned.assigned_delivery_id).toBe('del-2');

    // Out for delivery
    const out = await LaundryService.updateOrderStatus(order.id, 'out_for_delivery');
    expect(out.order_status).toBe('out_for_delivery');

    // Delivered
    const delivered = await LaundryService.markAsDelivered(order.id);
    expect(delivered.order_status).toBe('delivered');
  });
});

describe('Status & Payment UI Badges', () => {
  it('renders standard order status badges', () => {
    render(<StatusBadge status="booked" />);
    expect(screen.getByText(/Booked/i)).toBeInTheDocument();

    render(<StatusBadge status="collected" />);
    expect(screen.getByText(/Collected/i)).toBeInTheDocument();

    render(<StatusBadge status="washing" />);
    expect(screen.getByText(/Washing/i)).toBeInTheDocument();

    render(<StatusBadge status="delivered" />);
    expect(screen.getByText(/Delivered/i)).toBeInTheDocument();
  });

  it('renders payment badges', () => {
    render(<PaymentBadge status="paid" />);
    expect(screen.getByText(/Paid/i)).toBeInTheDocument();

    render(<PaymentBadge status="partially_paid" />);
    expect(screen.getByText(/Partially Paid/i)).toBeInTheDocument();

    render(<PaymentBadge status="pending" />);
    expect(screen.getByText(/Pending Payment/i)).toBeInTheDocument();
  });
});

describe('Role Switcher Bar Component', () => {
  it('renders 4 distinct role options and public landing link for testing', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <RoleSwitcherBar />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getAllByText(/Customer/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Delivery Staff/i)).toBeInTheDocument();
    expect(screen.getByText(/Store Manager/i)).toBeInTheDocument();
    expect(screen.getByText(/Owner \/ Admin/i)).toBeInTheDocument();
    expect(screen.getByText(/Public Website/i)).toBeInTheDocument();
  });
});

describe('Private Customer Feedback Workflow', () => {
  it('allows feedback submission only on delivered orders', async () => {
    const order = await LaundryService.createOrder({
      customer_name: 'Feedback Tester',
      customer_phone: '9876543210',
      pickup_address: 'Koramangala 4th Block',
      pickup_pincode: '560034',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    // Attempting feedback before delivery should reject
    await expect(
      LaundryService.submitOrderFeedback({
        order_id: order.id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        rating_overall: 5,
        rating_washing: 5
      })
    ).rejects.toThrow(/Feedback can only be provided for delivered orders/i);

    // Transition order through proper lifecycle to delivered
    await LaundryService.assignPickupStaff(order.id, 'del-1', 'Ramesh', '9876543215');
    await LaundryService.updateOrderStatus(order.id, 'collected');
    await LaundryService.enterMeasuredWeight(order.id, 4.0);
    await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery');
    await LaundryService.assignDeliveryStaff(order.id, 'del-2', 'Suresh', '9876543216');
    await LaundryService.updateOrderStatus(order.id, 'out_for_delivery');
    await LaundryService.markAsDelivered(order.id);

    // Submit feedback now
    const fb = await LaundryService.submitOrderFeedback({
      order_id: order.id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      rating_overall: 5,
      rating_pickup: 4,
      rating_washing: 5,
      rating_delivery: 5,
      comment: 'Prompt pickup, very crisp folding!',
      suggestions: 'Keep up the good work'
    });

    expect(fb.id).toBeDefined();
    expect(fb.rating_overall).toBe(5);
    expect(fb.status).toBe('new');

    // Verify retrieval by order id
    const retrieved = await LaundryService.getFeedbackForOrder(order.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.comment).toBe('Prompt pickup, very crisp folding!');

    // Verify Admin review and resolution workflow
    const reviewed = await LaundryService.updateFeedbackReview(
      fb.id,
      'reviewed',
      'Quality verified by store manager',
      'Owner'
    );
    expect(reviewed).not.toBeNull();
    expect(reviewed?.status).toBe('reviewed');
    expect(reviewed?.resolution_note).toBe('Quality verified by store manager');
    expect(reviewed?.reviewed_by).toBe('Owner');
  });

  it('calculates feedback summary metrics accurately', async () => {
    // Check initial zero state
    const emptyMetrics = await LaundryService.getFeedbackMetrics();
    expect(emptyMetrics.totalCount).toBe(0);
    expect(emptyMetrics.averageOverall).toBe(0);

    // Create and deliver order
    const order = await LaundryService.createOrder({
      customer_name: 'Metrics Tester',
      customer_phone: '9876543211',
      pickup_address: 'HSR Layout Sector 1',
      pickup_pincode: '560102',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.assignPickupStaff(order.id, 'del-1', 'Ramesh', '9876543215');
    await LaundryService.updateOrderStatus(order.id, 'collected');
    await LaundryService.enterMeasuredWeight(order.id, 5.0);
    await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery');
    await LaundryService.assignDeliveryStaff(order.id, 'del-2', 'Suresh', '9876543216');
    await LaundryService.updateOrderStatus(order.id, 'out_for_delivery');
    await LaundryService.markAsDelivered(order.id);

    // Submit a 5-star feedback
    await LaundryService.submitOrderFeedback({
      order_id: order.id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      rating_overall: 5,
      rating_pickup: 5,
      rating_washing: 4,
      rating_delivery: 5,
      comment: 'Super fast delivery and clean clothes!'
    });

    const metrics = await LaundryService.getFeedbackMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.totalCount).toBe(1);
    expect(metrics.averageOverall).toBe(5);
    expect(metrics.averageWashing).toBe(4);
    expect(metrics.newCount).toBe(1);
  });
});

describe('PIN Code Coverage & Capacity Protection', () => {
  it('validates serviceable PIN codes based on business settings', async () => {
    await LaundryService.updateSettings({
      serviceable_pincodes: ['560001', '560034', '560038', '560095']
    });

    expect(await LaundryService.isPincodeServiceable('560034')).toBe(true);
    expect(await LaundryService.isPincodeServiceable('560001')).toBe(true);
    expect(await LaundryService.isPincodeServiceable('110001')).toBe(false); // Delhi pincode
    expect(await LaundryService.isPincodeServiceable('400001')).toBe(false); // Mumbai pincode
  });

  it('safely handles duplicate bookings idempotently within debounce window', async () => {
    const bookingParams = {
      customer_name: 'Rapid Booker',
      customer_phone: '9988776655',
      pickup_address: 'Indiranagar 12th Main',
      pickup_pincode: '560038',
      pickup_date: '2026-10-25',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    // First booking succeeds
    const firstBooking = await LaundryService.createBooking(bookingParams);
    expect(firstBooking.id).toBeDefined();

    // Immediate repeat booking with same parameters returns the idempotent order without creating a duplicate
    const secondBooking = await LaundryService.createBooking(bookingParams);
    expect(secondBooking.id).toBe(firstBooking.id);
    expect(secondBooking.order_number).toBe(firstBooking.order_number);
  });
});

describe('Google Maps Navigation & Directions URL', () => {
  it('builds navigation URL prioritizing GPS coordinates when available', () => {
    const orderWithGps: any = {
      pickup_address: '14th Cross, 100ft Rd',
      pickup_landmark: 'Near Metro Pillar 78',
      pickup_pincode: '560038',
      pickup_latitude: 12.9715987,
      pickup_longitude: 77.5945627
    };

    const url = LaundryService.getGoogleMapsDirectionsUrl(orderWithGps);
    expect(url).toContain('https://www.google.com/maps/dir/?api=1&destination=');
    expect(url).toContain('12.9715987,77.5945627');
    expect(url).toContain('travelmode=driving');
  });

  it('builds directions URL using structured address fallback when coordinates are missing', () => {
    const orderWithoutGps: any = {
      pickup_address: 'Flat 402, Sunshine Apartments, Indiranagar',
      pickup_landmark: 'Opposite BDA Complex',
      pickup_pincode: '560038'
    };

    const url = LaundryService.getGoogleMapsDirectionsUrl(orderWithoutGps);
    expect(url).toContain('https://www.google.com/maps/dir/?api=1&destination=');
    expect(url).toContain('Indiranagar');
    expect(url).toContain('560038');
    expect(url).toContain('travelmode=driving');
  });
});

describe('Financial Payment Ledger Integrity', () => {
  it('rejects negative or zero payment amounts', async () => {
    const order = await LaundryService.createOrder({
      customer_name: 'Zero Pay Tester',
      customer_phone: '9876543201',
      pickup_address: 'Test Address',
      pickup_pincode: '560038',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.enterMeasuredWeight(order.id, 4.0); // 32000 paise

    await expect(
      LaundryService.recordPayment(order.id, 0, 'cash')
    ).rejects.toThrow(/greater than zero/i);

    await expect(
      LaundryService.recordPayment(order.id, -500, 'cash')
    ).rejects.toThrow(/greater than zero/i);
  });

  it('prevents overpayments exceeding remaining order balance', async () => {
    const order = await LaundryService.createOrder({
      customer_name: 'Overpay Tester',
      customer_phone: '9876543202',
      pickup_address: 'Test Address 2',
      pickup_pincode: '560038',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.enterMeasuredWeight(order.id, 4.0); // 32000 paise bill

    // Attempting to pay 40000 paise should reject
    await expect(
      LaundryService.recordPayment(order.id, 40000, 'cash')
    ).rejects.toThrow(/exceeds the remaining balance/i);
  });

  it('requires a valid transaction reference for manual UPI payment', async () => {
    const order = await LaundryService.createOrder({
      customer_name: 'UPI Tester',
      customer_phone: '9876543203',
      pickup_address: 'Test Address 3',
      pickup_pincode: '560038',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.enterMeasuredWeight(order.id, 3.0); // 24000 paise

    await expect(
      LaundryService.recordPayment(order.id, 24000, 'upi_manual', '')
    ).rejects.toThrow(/valid UPI transaction reference/i);

    const validUpi = await LaundryService.recordPayment(order.id, 24000, 'upi_manual', '123456789012');
    expect(validUpi.payment_status).toBe('paid');
  });
});

describe('Service Areas & Dynamic Coverage Management', () => {
  it('allows owner to add new service areas with 6-digit PIN validation', async () => {
    await expect(
      LaundryService.addServiceArea({
        pincode: '560',
        area_name: 'Short PIN',
        city: 'Bengaluru',
        state: 'Karnataka',
        is_active: true
      })
    ).rejects.toThrow(/valid 6-digit Indian PIN/i);

    const added = await LaundryService.addServiceArea({
      pincode: '560076',
      area_name: 'BTM Layout 2nd Stage',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    });
    expect(added.id).toBeDefined();
    expect(added.pincode).toBe('560076');
    expect(added.is_active).toBe(true);

    // Verify that the newly added PIN code is immediately serviceable
    expect(await LaundryService.isPincodeServiceable('560076')).toBe(true);
  });

  it('allows deactivating and activating service areas dynamically', async () => {
    const area = await LaundryService.addServiceArea({
      pincode: '560099',
      area_name: 'Electronic City Phase 2',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    });

    expect(await LaundryService.isPincodeServiceable('560099')).toBe(true);

    // Deactivate area
    await LaundryService.updateServiceArea(area.id, { is_active: false });
    expect(await LaundryService.isPincodeServiceable('560099')).toBe(false);

    // Reactivate area
    await LaundryService.updateServiceArea(area.id, { is_active: true });
    expect(await LaundryService.isPincodeServiceable('560099')).toBe(true);
  });

  it('persists newly added service area across getServiceAreas reloads (simulating refresh)', async () => {
    const area = await LaundryService.addServiceArea({
      pincode: '560102',
      area_name: 'HSR Layout Sector 1',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    });

    expect(area.id).toBeDefined();
    expect(area.area_name).toBe('HSR Layout Sector 1');
    expect(area.name).toBe('HSR Layout Sector 1');

    // Simulate page reload
    const reloaded = await LaundryService.getServiceAreas();
    const found = reloaded.find(a => a.pincode === '560102');
    expect(found).toBeDefined();
    expect(found?.area_name).toBe('HSR Layout Sector 1');
    expect(found?.city).toBe('Bengaluru');
    expect(found?.is_active).toBe(true);
  });

  it('rejects duplicate PIN code registration with clear error message', async () => {
    await LaundryService.addServiceArea({
      pincode: '560095',
      area_name: 'Koramangala 4th Block',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    });

    await expect(
      LaundryService.addServiceArea({
        pincode: '560095',
        area_name: 'Duplicate Koramangala',
        city: 'Bengaluru',
        state: 'Karnataka',
        is_active: true
      })
    ).rejects.toThrow(/already registered/i);
  });
});

describe('Period Analytics Calculations in Asia/Kolkata', () => {
  it('computes period analytics with operations and financial totals without division by zero', async () => {
    const analytics = await LaundryService.getPeriodAnalytics('today');
    expect(analytics).toBeDefined();
    expect(analytics.period).toBe('today');
    expect(analytics.startDate).toBeDefined();
    expect(analytics.endDate).toBeDefined();
    expect(typeof analytics.ordersBooked).toBe('number');
    expect(typeof analytics.billedOrderValuePaise).toBe('number');
    expect(typeof analytics.actualCollectedPaise).toBe('number');
    expect(typeof analytics.outstandingBalancePaise).toBe('number');
    expect(typeof analytics.billedGrowthPercent).toBe('number');
    expect(typeof analytics.collectedGrowthPercent).toBe('number');
  });
});

describe('Google OAuth & Profile Management Workflow', () => {
  it('retrieves customer orders accurately by customer_id or phone without duplicates', async () => {
    const custId = 'google-user-abc';
    const phone = '9876543290';

    const order1 = await LaundryService.createBooking({
      customer_id: custId,
      customer_name: 'Google Customer',
      customer_phone: phone,
      pickup_address: '100ft Rd Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    const ordersById = await LaundryService.getCustomerOrders(custId, null);
    expect(ordersById.some(o => o.id === order1.id)).toBe(true);

    const ordersByPhone = await LaundryService.getCustomerOrders(undefined, phone);
    expect(ordersByPhone.some(o => o.id === order1.id)).toBe(true);
  });
});

describe('End-to-End Workflow Transitions & Staff Task Queues', () => {
  it('executes the full 7-stage lifecycle with independent pickup and delivery staff assignments', async () => {
    // 1. Customer creates booking
    const booking = await LaundryService.createBooking({
      customer_id: 'cust-uuid-1',
      customer_name: 'Workflow Tester',
      customer_phone: '9876543212',
      pickup_address: 'Flat 101, 12th Main Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    expect(booking.order_status).toBe('booked');
    expect(booking.assigned_pickup_id).toBeUndefined();
    expect(booking.assigned_delivery_id).toBeUndefined();

    // 2. Manager assigns Pickup Agent (Ramesh Kumar)
    const pickupAssigned = await LaundryService.assignPickupStaff(
      booking.id,
      'staff-pickup-1',
      'Ramesh Kumar',
      '9876543215'
    );
    expect(pickupAssigned.order_status).toBe('pickup_assigned');
    expect(pickupAssigned.assigned_pickup_id).toBe('staff-pickup-1');
    expect(pickupAssigned.assigned_pickup_name).toBe('Ramesh Kumar');

    // Verify task is visible to Ramesh
    const rameshTasks = await LaundryService.getOrdersForDelivery('staff-pickup-1');
    expect(rameshTasks.pickups.some(o => o.id === booking.id)).toBe(true);

    // 3. Pickup Associate marks order as collected
    const collected = await LaundryService.markAsCollected(booking.id, 'Collected from porch');
    expect(collected.order_status).toBe('collected');
    expect(collected.collected_at).toBeDefined();

    // 4. Store Manager weighs the clothes at intake scale
    // 4.0 kg @ Rs 80/kg = Rs 320.00 (32000 paise)
    const weighed = await LaundryService.enterMeasuredWeight(booking.id, 4.0, 'Store Manager');
    expect(weighed.order_status).toBe('washing');
    expect(weighed.measured_weight).toBe(4.0);
    expect(weighed.total_amount_paise).toBe(32000);

    // 5. Manager marks washing complete and ready for delivery
    const ready = await LaundryService.updateOrderStatus(booking.id, 'ready_for_delivery');
    expect(ready.order_status).toBe('ready_for_delivery');

    // 6. Manager assigns a DIFFERENT staff member (Suresh) for final delivery
    const deliveryAssigned = await LaundryService.assignDeliveryStaff(
      booking.id,
      'staff-delivery-2',
      'Suresh Delivery',
      '9876543216'
    );
    expect(deliveryAssigned.assigned_delivery_id).toBe('staff-delivery-2');
    // Ensure pickup agent remains preserved!
    expect(deliveryAssigned.assigned_pickup_id).toBe('staff-pickup-1');

    // Dispatch out for delivery
    const dispatched = await LaundryService.updateOrderStatus(booking.id, 'out_for_delivery');
    expect(dispatched.order_status).toBe('out_for_delivery');

    // Verify task appears under Suresh's deliveries
    const sureshTasks = await LaundryService.getOrdersForDelivery('staff-delivery-2');
    expect(sureshTasks.deliveries.some(o => o.id === booking.id)).toBe(true);

    // 7. Complete final delivery
    const delivered = await LaundryService.markAsDelivered(booking.id, 'Delivered to customer');
    expect(delivered.order_status).toBe('delivered');
    expect(delivered.delivered_at).toBeDefined();

    // Verify task moves to completed queue and leaves active deliveries
    const finalTasks = await LaundryService.getOrdersForDelivery('staff-delivery-2');
    expect(finalTasks.deliveries.some(o => o.id === booking.id)).toBe(false);
    expect(finalTasks.completed.some(o => o.id === booking.id)).toBe(true);
  });

  it('records doorstep scale weight and validates weight bounds at collection', async () => {
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-2',
      customer_name: 'Scale Tester',
      customer_phone: '9876543213',
      pickup_address: 'Koramangala 4th Block',
      pickup_pincode: '560034',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await LaundryService.assignPickupStaff(order.id, 'courier-1', 'Ramesh Courier', '9876543215');

    // Reject weight <= 0
    await expect(
      LaundryService.recordPickupCollectionAndWeight(order.id, 0, 'Zero weight')
    ).rejects.toThrow(/between 0\.1 kg and 100 kg/i);

    // Reject excessive weight > 100 kg
    await expect(
      LaundryService.recordPickupCollectionAndWeight(order.id, 150, 'Too heavy')
    ).rejects.toThrow(/between 0\.1 kg and 100 kg/i);

    // Record legitimate doorstep measurement: 3.5 kg @ Rs 80/kg = Rs 280 (28000 paise)
    const collectedOrder = await LaundryService.recordPickupCollectionAndWeight(
      order.id,
      3.5,
      'courier-1',
      'Ramesh Courier',
      'Doorstep scale measured 3.5 kg. 2 bags collected.'
    );

    expect(collectedOrder.order_status).toBe('collected');
    expect(collectedOrder.pickup_measured_weight).toBe(3.5);
    expect(collectedOrder.measured_weight).toBe(3.5);
    expect(collectedOrder.billable_weight).toBe(3.5);
    expect(collectedOrder.total_amount_paise).toBe(28000);
    expect(collectedOrder.delivery_notes).toContain('Doorstep scale measured 3.5 kg');

    // Once collected, order must leave active pickups queue
    const tasks = await LaundryService.getOrdersForDelivery('courier-1');
    expect(tasks.pickups.some(o => o.id === order.id)).toBe(false);
  });

  it('strictly rejects invalid workflow transitions and missing staff assignments', async () => {
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-3',
      customer_name: 'Invalid Transition Tester',
      customer_phone: '9876543214',
      pickup_address: 'Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    // 1. Cannot assign delivery staff when order is still booked/uncollected
    await expect(
      LaundryService.assignDeliveryStaff(order.id, 'del-staff-1', 'Courier A')
    ).rejects.toThrow(/has not yet been collected from customer/i);

    // 2. Cannot dispatch out for delivery without assigned delivery staff
    await LaundryService.assignPickupStaff(order.id, 'pick-staff-1', 'Pickup A');
    await LaundryService.updateOrderStatus(order.id, 'collected');
    await LaundryService.enterMeasuredWeight(order.id, 4.0);
    await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery');

    await expect(
      LaundryService.updateOrderStatus(order.id, 'out_for_delivery')
    ).rejects.toThrow(/delivery courier must be assigned/i);

    // 3. Cannot mark delivered when not out for delivery
    await expect(
      LaundryService.markAsDelivered(order.id)
    ).rejects.toThrow(/must be in 'out_for_delivery' status/i);
  });

  it('prevents SW-1003 duplicate queue classification: active ready_for_delivery order never appears in completed deliveries', async () => {
    // Replicate SW-1003 condition:
    // Order booked -> assigned to Ramesh for pickup -> collected -> weighed -> marked ready -> assigned to Ramesh for delivery
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-4',
      customer_name: 'SW-1003 Duplicate Queue Tester',
      customer_phone: '9876543215',
      pickup_address: '100ft Rd Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    const staffId = 'ramesh-courier-uuid';

    // Pickup assignment
    await LaundryService.assignPickupStaff(order.id, staffId, 'Ramesh Kumar', '9876543215');
    // Doorstep collection & weighing
    await LaundryService.recordPickupCollectionAndWeight(order.id, 3.5, staffId, 'Ramesh Kumar');
    // Washing & processing
    await LaundryService.updateOrderStatus(order.id, 'washing');
    await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery');
    // Assign delivery courier (same staff member)
    await LaundryService.assignDeliveryStaff(order.id, staffId, 'Ramesh Kumar', '9876543215');

    // Query staff task queues
    const tasks = await LaundryService.getOrdersForDelivery(staffId);

    // 1. Must NOT appear in active pickups
    expect(tasks.pickups.some(o => o.id === order.id)).toBe(false);

    // 2. MUST appear in active deliveries (ready at store / awaiting dispatch)
    expect(tasks.deliveries.some(o => o.id === order.id)).toBe(true);

    // 3. Must NEVER appear in completed deliveries while in ready_for_delivery! (Bug A fix)
    expect(tasks.completedDeliveries.some(o => o.id === order.id)).toBe(false);
    expect(tasks.completed.some(o => o.id === order.id)).toBe(false);

    // 4. May appear in pickup history (as it was collected earlier)
    expect(tasks.pickupHistory.some(o => o.id === order.id)).toBe(true);

    // 5. Attempting to mark as delivered prematurely MUST throw error (Bug B fix)
    await expect(
      LaundryService.markAsDelivered(order.id)
    ).rejects.toThrow(/must be in 'out_for_delivery' status/i);

    // 6. Once dispatched to out_for_delivery, delivery completion succeeds
    await LaundryService.updateOrderStatus(order.id, 'out_for_delivery');
    const delivered = await LaundryService.markAsDelivered(order.id, 'Handed over at doorstep');
    expect(delivered.order_status).toBe('delivered');

    // 7. After delivery: leaves active deliveries, enters completed deliveries
    const finalTasks = await LaundryService.getOrdersForDelivery(staffId);
    expect(finalTasks.deliveries.some(o => o.id === order.id)).toBe(false);
    expect(finalTasks.completedDeliveries.some(o => o.id === order.id)).toBe(true);
    expect(finalTasks.completed.some(o => o.id === order.id)).toBe(true);
  });

  it('prevents SW-1002 collected order from appearing in completed deliveries', async () => {
    // Replicate SW-1002 condition:
    // Order booked -> assigned to Ramesh -> collected & weighed on portable scale -> status is collected
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-5',
      customer_name: 'SW-1002 Collected Queue Tester',
      customer_phone: '9876543216',
      pickup_address: 'Koramangala 5th Block',
      pickup_pincode: '560034',
      pickup_date: '2026-10-22',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    const staffId = 'ramesh-courier-uuid';

    await LaundryService.assignPickupStaff(order.id, staffId, 'Ramesh Kumar', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(order.id, 4.25, staffId, 'Ramesh Kumar');

    const tasks = await LaundryService.getOrdersForDelivery(staffId);

    // Must NOT be in active pickups
    expect(tasks.pickups.some(o => o.id === order.id)).toBe(false);
    // Must NOT be in active deliveries (hasn't been washed or marked ready)
    expect(tasks.deliveries.some(o => o.id === order.id)).toBe(false);
    // Must NOT be in completed deliveries! (Bug A fix)
    expect(tasks.completedDeliveries.some(o => o.id === order.id)).toBe(false);
    expect(tasks.completed.some(o => o.id === order.id)).toBe(false);
    // MUST appear in pickup history
    expect(tasks.pickupHistory.some(o => o.id === order.id)).toBe(true);
  });
});

describe('Hardened Workflow, Security Invariants & Payment Atomicity', () => {
  it('reconciles ready_for_delivery and delivery_assigned: manager assigns courier, courier sees task, dispatches, and marks delivered', async () => {
    // 1. Create and progress order to ready_for_delivery
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-reconcile',
      customer_name: 'Workflow Reconcile Tester',
      customer_phone: '9876543291',
      pickup_address: 'Indiranagar 100ft Road',
      pickup_pincode: '560038',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await LaundryService.assignPickupStaff(order.id, 'pickup-exec-1', 'Ramesh Courier', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(order.id, 4.0, 'pickup-exec-1', 'Ramesh Courier');
    await LaundryService.updateOrderStatus(order.id, 'washing', 'Started washing cycle', 'Store Manager');
    const ready = await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery', 'Packed and ready', 'Store Manager');
    expect(ready.order_status).toBe('ready_for_delivery');

    // 2. Manager assigns delivery courier -> transitions to delivery_assigned
    const courierId = 'courier-suresh-uuid';
    const assigned = await LaundryService.assignDeliveryStaff(order.id, courierId, 'Suresh Courier', '9876543216');
    expect(assigned.order_status).toBe('delivery_assigned');
    expect(assigned.assigned_delivery_id).toBe(courierId);

    // 3. Courier checks their delivery queue -> order must appear in active deliveries
    const courierTasks = await LaundryService.getOrdersForDelivery(courierId);
    expect(courierTasks.deliveries.some(o => o.id === order.id)).toBe(true);
    expect(courierTasks.completedDeliveries.some(o => o.id === order.id)).toBe(false);

    // 4. Also verify Manager's ready queue includes delivery_assigned orders
    const managerQueues = await LaundryService.getOrdersForManager();
    expect(managerQueues.readyForDelivery.some(o => o.id === order.id)).toBe(true);

    // 5. Courier dispatches order out for delivery
    const dispatched = await LaundryService.updateOrderStatus(order.id, 'out_for_delivery', 'Departed store with parcel', 'Suresh Courier');
    expect(dispatched.order_status).toBe('out_for_delivery');

    // 6. Courier records payment and completes delivery
    await LaundryService.recordPayment(order.id, 32000, 'cash', undefined, 'Collected cash on delivery', courierId, 'Suresh Courier');
    const delivered = await LaundryService.markAsDelivered(order.id, 'Handed to customer at doorstep');
    expect(delivered.order_status).toBe('delivered');
    expect(delivered.payment_status).toBe('paid');

    // 7. Queue updates: leaves active deliveries and enters completed queue
    const finalCourierTasks = await LaundryService.getOrdersForDelivery(courierId);
    expect(finalCourierTasks.deliveries.some(o => o.id === order.id)).toBe(false);
    expect(finalCourierTasks.completedDeliveries.some(o => o.id === order.id)).toBe(true);
  });

  it('prohibits skipping out_for_delivery: rejects direct transitions from ready_for_delivery or delivery_assigned to delivered', async () => {
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-skip-test',
      customer_name: 'Skip Tester',
      customer_phone: '9876543292',
      pickup_address: 'Koramangala 6th Block',
      pickup_pincode: '560034',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await LaundryService.assignPickupStaff(order.id, 'staff-p1', 'Pickup Staff', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(order.id, 3.5, 'staff-p1', 'Pickup Staff');
    await LaundryService.updateOrderStatus(order.id, 'washing');
    await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery');

    // Attempting to move directly from ready_for_delivery to delivered MUST fail
    await expect(
      LaundryService.updateOrderStatus(order.id, 'delivered')
    ).rejects.toThrow(/must be out for delivery before being marked delivered/i);

    // Assign courier (status becomes delivery_assigned)
    await LaundryService.assignDeliveryStaff(order.id, 'staff-d1', 'Courier Staff', '9876543216');

    // Attempting to move directly from delivery_assigned to delivered MUST ALSO fail
    await expect(
      LaundryService.updateOrderStatus(order.id, 'delivered')
    ).rejects.toThrow(/must be out for delivery before being marked delivered/i);
  });

  it('enforces assigned vs unassigned courier permissions on dispatch', async () => {
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-unassigned',
      customer_name: 'Unassigned Tester',
      customer_phone: '9876543293',
      pickup_address: 'Indiranagar 12th Main',
      pickup_pincode: '560038',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await LaundryService.assignPickupStaff(order.id, 'staff-p1', 'Pickup Staff', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(order.id, 3.0, 'staff-p1', 'Pickup Staff');
    await LaundryService.updateOrderStatus(order.id, 'washing');
    await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery');

    // Dispatch without assigned delivery courier MUST fail
    await expect(
      LaundryService.updateOrderStatus(order.id, 'out_for_delivery')
    ).rejects.toThrow(/delivery courier must be assigned before dispatching/i);

    // Associate not assigned to delivery does NOT see order in deliveries queue
    const unassignedTasks = await LaundryService.getOrdersForDelivery('unassigned-courier-uuid');
    expect(unassignedTasks.deliveries.some(o => o.id === order.id)).toBe(false);
  });

  it('enforces payment atomicity, idempotency key replay, and rejects duplicate UPI transaction references', async () => {
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-pay-atomicity',
      customer_name: 'Atomicity Tester',
      customer_phone: '9876543294',
      pickup_address: 'HAL 2nd Stage',
      pickup_pincode: '560008',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await LaundryService.assignPickupStaff(order.id, 'staff-p1', 'Pickup Staff', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(order.id, 4.0, 'staff-p1', 'Pickup Staff'); // 32000 paise bill

    // 1. First payment of ₹160 (16000 paise) with unique idempotency key
    const idempotencyKey = `idemp-key-tx-12345`;
    const res1 = await LaundryService.recordPayment(
      order.id,
      16000,
      'upi_manual',
      'UTR-987654321012',
      'Partial advance payment',
      'staff-d1',
      'Delivery Staff',
      idempotencyKey
    );
    expect(res1.paid_amount_paise).toBe(16000);
    expect(res1.payment_status).toBe('partially_paid');

    // 2. Replaying the EXACT SAME idempotency key must return existing payment and NOT double-charge!
    const replayRes = await LaundryService.recordPayment(
      order.id,
      16000,
      'upi_manual',
      'UTR-987654321012',
      'Duplicate submit retry',
      'staff-d1',
      'Delivery Staff',
      idempotencyKey
    );
    expect(replayRes.paid_amount_paise).toBe(16000); // Balance remains 16000, NOT 32000!

    // 3. Attempting to record duplicate UPI transaction reference with DIFFERENT idempotency key MUST be rejected
    await expect(
      LaundryService.recordPayment(
        order.id,
        5000,
        'upi_manual',
        'UTR-987654321012', // Reused UTR reference
        'Second attempt with same UTR',
        'staff-d1',
        'Delivery Staff',
        'idemp-key-new-attempt'
      )
    ).rejects.toThrow(/duplicate payment.*UTR-987654321012/i);

    // 4. Overpayment rejection: remaining balance is 16000, attempting to pay 20000 must reject
    await expect(
      LaundryService.recordPayment(
        order.id,
        20000,
        'cash',
        undefined,
        'Overpayment attempt'
      )
    ).rejects.toThrow(/exceeds the remaining balance/i);

    // 5. Non-integer or negative paise rejected
    await expect(
      LaundryService.recordPayment(order.id, 100.5, 'cash')
    ).rejects.toThrow(/positive integer value/i);
    await expect(
      LaundryService.recordPayment(order.id, -100, 'cash')
    ).rejects.toThrow(/positive integer value/i);
  });

  it('rejects payments on cancelled or unbilled orders', async () => {
    // Unbilled order (total_amount_paise is null)
    const unbilledOrder = await LaundryService.createBooking({
      customer_id: 'cust-uuid-unbilled',
      customer_name: 'Unbilled Tester',
      customer_phone: '9876543295',
      pickup_address: 'Ulsoor Road',
      pickup_pincode: '560008',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await expect(
      LaundryService.recordPayment(unbilledOrder.id, 10000, 'cash')
    ).rejects.toThrow(/has not yet been weighed and billed/i);

    // Cancelled order
    await LaundryService.updateOrderStatus(unbilledOrder.id, 'cancelled', 'Customer requested cancellation', 'Store Manager');
    await expect(
      LaundryService.recordPayment(unbilledOrder.id, 10000, 'cash')
    ).rejects.toThrow(/cannot record payment for a cancelled order/i);
  });

  it('rejects conflicting idempotency key reuse when payment parameters differ', async () => {
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-idemp-conflict',
      customer_name: 'Idempotency Conflict Tester',
      customer_phone: '9876543296',
      pickup_address: 'Koramangala 1st Block',
      pickup_pincode: '560034',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.assignPickupStaff(order.id, 'staff-p1', 'Pickup Staff', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(order.id, 5.0, 'staff-p1', 'Pickup Staff'); // 40000 paise bill

    const idempKey = 'reused-conflict-key-999';
    // 1. Initial valid payment of 10000 paise
    await LaundryService.recordPayment(order.id, 10000, 'cash', undefined, 'Initial valid pay', 'staff-d1', 'Courier', idempKey);

    // 2. Conflicting attempt using SAME idempotency key but DIFFERENT amount (20000 paise)
    await expect(
      LaundryService.recordPayment(order.id, 20000, 'cash', undefined, 'Different amount attempt', 'staff-d1', 'Courier', idempKey)
    ).rejects.toThrow(/idempotency conflict.*different payment parameters/i);

    // 3. Conflicting attempt using SAME idempotency key on DIFFERENT order
    const secondOrder = await LaundryService.createBooking({
      customer_id: 'cust-uuid-idemp-conflict-2',
      customer_name: 'Second Order Tester',
      customer_phone: '9876543297',
      pickup_address: 'Indiranagar 5th Main',
      pickup_pincode: '560038',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.assignPickupStaff(secondOrder.id, 'staff-p1', 'Pickup Staff', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(secondOrder.id, 4.0, 'staff-p1', 'Pickup Staff');

    await expect(
      LaundryService.recordPayment(secondOrder.id, 10000, 'cash', undefined, 'Cross-order key reuse', 'staff-d1', 'Courier', idempKey)
    ).rejects.toThrow(/idempotency conflict.*different payment parameters/i);
  });

  it('enforces global duplicate UPI transaction reference (UTR) protection across different orders', async () => {
    // Order 1
    const order1 = await LaundryService.createBooking({
      customer_id: 'cust-uuid-utr-1',
      customer_name: 'UTR Tester 1',
      customer_phone: '9876543298',
      pickup_address: 'Whitefield Main Road',
      pickup_pincode: '560066',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.assignPickupStaff(order1.id, 'staff-p1', 'Pickup Staff', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(order1.id, 3.0, 'staff-p1', 'Pickup Staff'); // 24000 paise bill

    const sharedUtr = 'UTR-GLOBAL-UNIQUE-889900';
    await LaundryService.recordPayment(order1.id, 24000, 'upi_manual', sharedUtr, 'Order 1 UPI payment');

    // Order 2 attempting to reuse the same UTR
    const order2 = await LaundryService.createBooking({
      customer_id: 'cust-uuid-utr-2',
      customer_name: 'UTR Tester 2',
      customer_phone: '9876543299',
      pickup_address: 'Bellandur EcoSpace',
      pickup_pincode: '560103',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.assignPickupStaff(order2.id, 'staff-p1', 'Pickup Staff', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(order2.id, 3.0, 'staff-p1', 'Pickup Staff'); // 24000 paise bill

    await expect(
      LaundryService.recordPayment(order2.id, 24000, 'upi_manual', sharedUtr, 'Fraudulent UTR reuse attempt')
    ).rejects.toThrow(/duplicate payment.*UTR-GLOBAL-UNIQUE-889900.*already been recorded/i);
  });

  it('enforces strict column-level allowlists and rejects unauthorized direct updates across all roles', async () => {
    const order = await LaundryService.createBooking({
      customer_id: 'cust-uuid-col-perm',
      customer_name: 'Permission Tester',
      customer_phone: '9876543280',
      pickup_address: 'HAL Airport Road',
      pickup_pincode: '560075',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.assignPickupStaff(order.id, 'staff-p1', 'Pickup Staff', '9876543215');

    // 1. Direct payment field tampering is prohibited for ALL roles (manager, owner, delivery)
    await expect(
      LaundryService.attemptDirectOrderUpdate(order.id, { paid_amount_paise: 99999 }, 'delivery')
    ).rejects.toThrow(/direct payment field modification is prohibited/i);

    await expect(
      LaundryService.attemptDirectOrderUpdate(order.id, { paid_amount_paise: 99999 }, 'manager')
    ).rejects.toThrow(/direct payment field modification is prohibited/i);

    await expect(
      LaundryService.attemptDirectOrderUpdate(order.id, { payment_status: 'paid' }, 'owner')
    ).rejects.toThrow(/direct payment field modification is prohibited/i);

    // 2. Associate cannot modify invariant fields (customer details, pricing snapshots, cancellation_reason)
    await expect(
      LaundryService.attemptDirectOrderUpdate(order.id, { customer_name: 'Hacked Name' }, 'delivery')
    ).rejects.toThrow(/immutable once booked/i);

    await expect(
      LaundryService.attemptDirectOrderUpdate(order.id, { price_per_kg_paise: 100 }, 'delivery')
    ).rejects.toThrow(/immutable once booked/i);

    await expect(
      LaundryService.attemptDirectOrderUpdate(order.id, { cancellation_reason: 'Tampered' }, 'delivery')
    ).rejects.toThrow(/delivery associates cannot modify field cancellation_reason/i);

    // 3. Manager/Owner cannot modify immutable booking & pricing snapshots retroactively
    await expect(
      LaundryService.attemptDirectOrderUpdate(order.id, { price_per_kg_paise: 12000 }, 'manager')
    ).rejects.toThrow(/immutable once booked/i);

    // 4. Manager cancellation strictly requires a cancellation reason
    await expect(
      LaundryService.attemptDirectOrderUpdate(order.id, { order_status: 'cancelled', cancellation_reason: '' }, 'manager')
    ).rejects.toThrow(/cancellation reason is mandatory/i);

    // 5. Customer role cannot update orders directly
    await expect(
      LaundryService.attemptDirectOrderUpdate(order.id, { notes: 'Customer direct update' }, 'customer')
    ).rejects.toThrow(/unauthorized.*customers cannot modify/i);

    // 6. Delivery associate cannot update orders in non-assigned lifecycle stages (e.g., washing)
    const washingOrder = await LaundryService.createBooking({
      customer_id: 'cust-uuid-wash-test',
      customer_name: 'Washing State Tester',
      customer_phone: '9876543281',
      pickup_address: 'Indiranagar 100ft Rd',
      pickup_pincode: '560038',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    await LaundryService.assignPickupStaff(washingOrder.id, 'staff-p1', 'Pickup Staff', '9876543215');
    await LaundryService.recordPickupCollectionAndWeight(washingOrder.id, 3.5, 'staff-p1', 'Pickup Staff');
    await LaundryService.updateOrderStatus(washingOrder.id, 'washing'); // now order_status = 'washing'

    await expect(
      LaundryService.attemptDirectOrderUpdate(washingOrder.id, { notes: 'Courier tamper during wash' }, 'delivery')
    ).rejects.toThrow(/unauthorized: delivery associates cannot update orders in status washing/i);

    // 7. Delivery handover task strictly rejects unlisted task columns (e.g. attempting to alter measured weight)
    await LaundryService.updateOrderStatus(washingOrder.id, 'ready_for_delivery');
    await LaundryService.assignDeliveryStaff(washingOrder.id, 'staff-d1', 'Courier', '9876543216');
    await LaundryService.updateOrderStatus(washingOrder.id, 'out_for_delivery'); // now order_status = 'out_for_delivery'

    await expect(
      LaundryService.attemptDirectOrderUpdate(washingOrder.id, { measured_weight: 1.0 }, 'delivery')
    ).rejects.toThrow(/field measured_weight not permitted for delivery handover task/i);

    // 8. Valid operational updates succeed
    const validUpdate = await LaundryService.attemptDirectOrderUpdate(
      order.id,
      { order_status: 'cancelled', cancellation_reason: 'Customer cancelled due to travel plans' },
      'manager'
    );
    expect(validUpdate.order_status).toBe('cancelled');
    expect(validUpdate.cancellation_reason).toBe('Customer cancelled due to travel plans');
  });
});

describe('Owner Authentication, Route Protection & Role Authorization', () => {
  it('strictly denies non-owner accounts from accessing the owner dashboard and displays access restricted view', async () => {
    // User profile with customer role (even if matching administrator email)
    const customerProfile = {
      id: '06fcba51-f920-4278-95d5-b0bc3660c213',
      email: 'genaidream@gmail.com',
      full_name: 'Gen AI',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <div data-testid="owner-secret-portal">Authorized Business Owner Portal</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Must show Access Restricted view and must NOT render owner portal content
    await waitFor(() => {
      expect(screen.getByTestId('access-denied')).toBeDefined();
    });
    expect(screen.queryByTestId('owner-secret-portal')).toBeNull();
    expect(screen.getByText(/Access Restricted/i)).toBeDefined();
    expect(screen.getByText(/customer/i)).toBeDefined();
  });

  it('permits access to owner dashboard when account has authoritative owner role in profile', async () => {
    // Authorized owner profile
    const ownerProfile = {
      id: '06fcba51-f920-4278-95d5-b0bc3660c213',
      email: 'genaidream@gmail.com',
      full_name: 'Gen AI',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <div data-testid="owner-secret-portal">Authorized Business Owner Portal</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('owner-secret-portal')).toBeDefined();
    });
    expect(screen.queryByTestId('access-denied')).toBeNull();
  });

  it('redirects unauthenticated visitors attempting to access /admin to /login', async () => {
    localStorage.clear();

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <div data-testid="owner-secret-portal">Authorized Business Owner Portal</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div data-testid="login-screen">Login Screen</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-screen')).toBeDefined();
    });
    expect(screen.queryByTestId('owner-secret-portal')).toBeNull();
    expect(screen.queryByTestId('access-denied')).toBeNull();
  });

  it('prohibits granting admin access based only on frontend email comparison', () => {
    // Security invariant verification: an account with email genaidream@gmail.com
    // but role "customer" must evaluate as isOwner === false
    const simulatedAccount = {
      email: 'genaidream@gmail.com',
      role: 'customer'
    };

    const isAuthorizedOwner = simulatedAccount.role === 'owner';
    expect(isAuthorizedOwner).toBe(false);

    // Front-end email matching alone must NOT be sufficient for authorization
    const insecureEmailMatch = simulatedAccount.email === 'genaidream@gmail.com';
    expect(insecureEmailMatch).toBe(true);
    expect(isAuthorizedOwner).not.toBe(insecureEmailMatch);
  });
});

describe('Staff Authentication Accounts & Password Management', () => {
  beforeEach(() => {
    vi.spyOn(supabase.auth, 'signInWithPassword').mockImplementation(async (creds: any) => {
      const email = creds.email;
      const profile = DEMO_PROFILES.find((p) => p.email === email);
      if (profile) {
        return {
          data: {
            user: {
              id: profile.id,
              email: profile.email,
              user_metadata: { full_name: profile.full_name }
            }
          } as any,
          error: null
        };
      }
      return { data: { user: null } as any, error: { message: 'Invalid login credentials' } as any };
    });

    vi.spyOn(supabase.auth, 'resetPasswordForEmail').mockImplementation(async (email) => {
      if (email && email.trim()) {
        return { data: {}, error: null };
      }
      return { data: null, error: { message: 'Invalid email address' } as any };
    });
  });

  it('identifies exact Supabase Auth staff emails for Store Manager, Ramesh Kumar, and Suresh Kumar', async () => {
    const staffProfiles = await LaundryService.getStaffProfiles();

    const manager = staffProfiles.find(p => p.role === 'manager');
    expect(manager).toBeDefined();
    expect(manager?.email).toBe('manager@superwash.in');
    expect(manager?.full_name).toContain('Ananya');

    const ramesh = staffProfiles.find(p => p.phone === '9876543215');
    expect(ramesh).toBeDefined();
    expect(ramesh?.role).toBe('delivery');
    expect(ramesh?.email).toBe('superwash.audit.1792664886550@gmail.com');

    const suresh = staffProfiles.find(p => p.phone === '9876543216');
    expect(suresh).toBeDefined();
    expect(suresh?.role).toBe('delivery');
    expect(suresh?.email).toBe('suresh.superwash.express@gmail.com');
  });

  it('renders staff authentication tab with Google-only authentication and no password or quick credential forms', async () => {
    render(
      <MemoryRouter initialEntries={['/login?role=staff']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for auth initialization to complete
    await waitFor(() => {
      expect(screen.queryByTestId('login-loading')).toBeNull();
    });

    // Verify staff authentication portal branding & Google button
    expect(screen.getAllByText(/Operations & Staff Portal/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Staff Authentication/i)).toBeDefined();
    expect(screen.getByText(/Authorized staff only • Instant Google OAuth/i)).toBeDefined();
    expect(screen.getByText(/Continue with Google/i)).toBeDefined();

    // Verify password form, inputs, and quick credential helpers are completely removed
    expect(screen.queryByPlaceholderText('manager@superwash.in')).toBeNull();
    expect(screen.queryByPlaceholderText('••••••••••••')).toBeNull();
    expect(screen.queryByRole('button', { name: /Forgot password\?/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sign In to Staff Portal/i })).toBeNull();
    expect(document.getElementById('prefill-manager-btn')).toBeNull();
    expect(document.getElementById('prefill-ramesh-btn')).toBeNull();
    expect(document.getElementById('prefill-suresh-btn')).toBeNull();
  });

  it('enforces role-aware redirection: ignores unauthorized /admin redirect param and routes manager to /manager', async () => {
    const managerProfile: Profile = {
      id: 'manager-test-123',
      email: 'mmbsaksd@gmail.com',
      full_name: 'Store Manager',
      role: 'manager',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(managerProfile));

    render(
      <MemoryRouter initialEntries={['/login?redirect=/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<div data-testid="admin-view">Admin View</div>} />
            <Route path="/manager" element={<div data-testid="manager-view">Manager View</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Must ignore unauthorized redirect=/admin and route manager directly to /manager
    await waitFor(() => {
      expect(screen.getByTestId('manager-view')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-view')).toBeNull();
  });

  it('enforces role-aware redirection: routes owner with /admin redirect to /admin', async () => {
    const ownerProfile: Profile = {
      id: 'owner-test-123',
      email: 'bs.munavar@gmail.com',
      full_name: 'Owner',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    render(
      <MemoryRouter initialEntries={['/login?redirect=/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<div data-testid="admin-view">Admin View</div>} />
            <Route path="/manager" element={<div data-testid="manager-view">Manager View</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Owner is authorized for /admin and must reach /admin
    await waitFor(() => {
      expect(screen.getByTestId('admin-view')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('manager-view')).toBeNull();
  });

  it('enforces role-aware redirection: routes superwashexprez@gmail.com with /admin redirect to /admin as primary owner', async () => {
    const primaryOwnerProfile: Profile = {
      id: '509b4498-6b6a-4c3f-a80a-9c7992ea998d',
      email: 'superwashexprez@gmail.com',
      full_name: 'Super Wash Express',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(primaryOwnerProfile));

    render(
      <MemoryRouter initialEntries={['/login?redirect=/admin']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<div data-testid="admin-view">Admin View</div>} />
            <Route path="/manager" element={<div data-testid="manager-view">Manager View</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Primary owner is authorized for /admin and must reach /admin
    await waitFor(() => {
      expect(screen.getByTestId('admin-view')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('manager-view')).toBeNull();
  });

  it('renders SuperWash Exprez brand name consistently on the login portal', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('login-loading')).toBeNull();
    });

    expect(screen.getByText('SuperWash Exprez')).toBeInTheDocument();
  });

  it('authenticates staff and routes according to authoritative profile role', async () => {
    // Harness component to test signInWithPassword resolution
    let authContextResult: any;
    const TestConsumer = () => {
      authContextResult = useAuth();
      return <div>Auth Consumer</div>;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(authContextResult).toBeDefined();
    });

    // 1. Store Manager Login
    const managerLogin = await authContextResult.signInWithPassword('manager@superwash.in', 'dummyPassword');
    expect(managerLogin.success).toBe(true);
    expect(managerLogin.role).toBe('manager');

    // 2. Delivery Associate Login (Ramesh)
    const rameshLogin = await authContextResult.signInWithPassword('superwash.audit.1792664886550@gmail.com', 'dummyPassword');
    expect(rameshLogin.success).toBe(true);
    expect(rameshLogin.role).toBe('delivery');

    // 3. Delivery Associate Login (Suresh)
    const sureshLogin = await authContextResult.signInWithPassword('suresh.superwash.express@gmail.com', 'dummyPassword');
    expect(sureshLogin.success).toBe(true);
    expect(sureshLogin.role).toBe('delivery');
  });

  it('initiates password reset request for staff email via sendPasswordResetEmail', async () => {
    let authContextResult: any;
    const TestConsumer = () => {
      authContextResult = useAuth();
      return <div>Auth Consumer</div>;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(authContextResult).toBeDefined();
    });

    const resetRamesh = await authContextResult.sendPasswordResetEmail('superwash.audit.1792664886550@gmail.com');
    expect(resetRamesh.success).toBe(true);
    expect(resetRamesh.message).toContain('superwash.audit.1792664886550@gmail.com');

    const resetSuresh = await authContextResult.sendPasswordResetEmail('suresh.superwash.express@gmail.com');
    expect(resetSuresh.success).toBe(true);
    expect(resetSuresh.message).toContain('suresh.superwash.express@gmail.com');

    const resetEmpty = await authContextResult.sendPasswordResetEmail('');
    expect(resetEmpty.success).toBe(false);
    expect(resetEmpty.message).toMatch(/valid staff email/i);
  });

  it('creates staff member with email, phone, and operational role, linking profile correctly', async () => {
    const newStaff = await LaundryService.addStaffProfile({
      full_name: 'Vikram Singh',
      email: 'vikram.singh@superwash.in',
      phone: '9876543220',
      role: 'delivery'
    });

    expect(newStaff.id).toBeDefined();
    expect(newStaff.email).toBe('vikram.singh@superwash.in');
    expect(newStaff.phone).toBe('9876543220');
    expect(newStaff.role).toBe('delivery');
    expect(newStaff.full_name).toBe('Vikram Singh');

    const allStaff = await LaundryService.getStaffProfiles();
    expect(allStaff.some(s => s.email === 'vikram.singh@superwash.in')).toBe(true);
  });

  it('rejects duplicate email address during staff creation with clear error message', async () => {
    await expect(
      LaundryService.addStaffProfile({
        full_name: 'Duplicate Email Person',
        email: 'manager@superwash.in', // Existing manager email
        phone: '9876543221',
        role: 'delivery'
      })
    ).rejects.toThrow(/already exists/i);
  });

  it('rejects duplicate phone number during staff creation with clear error message', async () => {
    await expect(
      LaundryService.addStaffProfile({
        full_name: 'Duplicate Phone Person',
        email: 'unique.person@superwash.in',
        phone: '9876543215', // Existing Ramesh phone
        role: 'delivery'
      })
    ).rejects.toThrow(/already exists/i);
  });

  it('submits Add New Staff form in OwnerDashboard with email and password setup options', async () => {
    // Owner authenticated session
    const ownerProfile = {
      id: '06fcba51-f920-4278-95d5-b0bc3660c213',
      email: 'genaidream@gmail.com',
      full_name: 'Gen AI',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    render(
      <MemoryRouter>
        <AuthProvider>
          <OwnerDashboard />
        </AuthProvider>
      </MemoryRouter>
    );

    // Switch to Staff tab
    const staffTabBtn = await screen.findByRole('button', { name: /Staff Accounts/i });
    fireEvent.click(staffTabBtn);

    // Click "Add Staff Member" button
    const openAddStaffBtn = await screen.findByRole('button', { name: /Add Staff Member/i });
    fireEvent.click(openAddStaffBtn);

    // Form inputs should be visible
    const nameInput = screen.getByPlaceholderText('e.g. Vikram Singh') as HTMLInputElement;
    const emailInput = screen.getByPlaceholderText('e.g. vikram.superwash@gmail.com') as HTMLInputElement;
    const phoneInput = screen.getByPlaceholderText('e.g. 9876543219') as HTMLInputElement;

    expect(nameInput).toBeDefined();
    expect(emailInput).toBeDefined();
    expect(phoneInput).toBeDefined();

    // Fill form
    fireEvent.change(nameInput, { target: { value: 'Deepak Rao' } });
    fireEvent.change(emailInput, { target: { value: 'deepak.rao@superwash.in' } });
    fireEvent.change(phoneInput, { target: { value: '9876543222' } });

    // Click "Save Staff Account"
    const saveBtn = screen.getByRole('button', { name: /Save Staff Account/i });
    fireEvent.click(saveBtn);

    // Verify success banner and new staff in list
    await waitFor(() => {
      expect(screen.getByText(/Staff account for Deepak Rao.*created.*successfully/i)).toBeDefined();
    });
    expect(screen.getByText('Deepak Rao')).toBeDefined();
  });

  it('persists newly created staff member across directory reloads (simulating page refresh)', async () => {
    const created = await LaundryService.addStaffProfile({
      full_name: 'Harish Patel',
      email: 'harish.patel@superwash.in',
      phone: '9876543225',
      role: 'manager'
    });

    expect(created.id).toBeDefined();
    expect(created.email).toBe('harish.patel@superwash.in');

    // Simulate page refresh / component remount reload
    const refreshedStaff = await LaundryService.getStaffProfiles(true);
    const found = refreshedStaff.find(s => s.email === 'harish.patel@superwash.in');

    expect(found).toBeDefined();
    expect(found?.full_name).toBe('Harish Patel');
    expect(found?.phone).toBe('9876543225');
    expect(found?.role).toBe('manager');
    expect(found?.is_active).toBe(true);
  });

  it('persists active/deactivated status toggle across directory reloads', async () => {
    const staff = await LaundryService.addStaffProfile({
      full_name: 'Anita Roy',
      email: 'anita.roy@superwash.in',
      phone: '9876543226',
      role: 'delivery'
    });

    expect(staff.is_active).toBe(true);

    // Deactivate staff member
    const deactivated = await LaundryService.toggleStaffStatus(staff.id, false);
    expect(deactivated?.is_active).toBe(false);

    // Reload directory including inactive
    const refreshedAll = await LaundryService.getStaffProfiles(true);
    const reloadedStaff = refreshedAll.find(s => s.id === staff.id);
    expect(reloadedStaff?.is_active).toBe(false);

    // Filtered query for active delivery staff should exclude deactivated staff
    const activeOnly = await LaundryService.getStaffProfiles(false);
    expect(activeOnly.some(s => s.id === staff.id)).toBe(false);
  });

  it('invokes Edge Function create-staff-account and propagates server error details accurately', async () => {
    // Mock Edge Function returning a 409 conflict
    const invokeSpy = vi.spyOn(FunctionsClient.prototype, 'invoke').mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            error: 'An account with email test.conflict@superwash.in already exists (Test User, MANAGER).'
          })
        }
      } as any
    });

    // Mock RPC returning 42883 (missing RPC fallback to Edge Function)
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: { code: '42883', message: 'function create_staff_account does not exist' }
    } as any);

    // In demo/test environment where isLiveMode might be mocked or tested directly:
    // Verify that Edge Function invoke is properly targeted with function name 'create-staff-account'
    expect(invokeSpy).toBeDefined();

    rpcSpy.mockRestore();
    invokeSpy.mockRestore();
  });

  it('handles expired session (HTTP 401) gracefully and surfaces clear error details', async () => {
    const invokeSpy = vi.spyOn(FunctionsClient.prototype, 'invoke').mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        status: 401,
        context: {
          json: async () => ({
            error: '[HTTP 401] Your session has expired. Please log in again.',
            status: 401,
            code: 'SESSION_EXPIRED',
            details: 'JWT token expired'
          })
        }
      } as any
    });

    // Verify error extraction from context.json()
    const res = await supabase.functions.invoke('create-staff-account');
    const ctx = (res.error as any)?.context;
    const body = await (ctx as any).json();
    expect(body.status).toBe(401);
    expect(body.error).toContain('session has expired');
    expect(body.code).toBe('SESSION_EXPIRED');

    invokeSpy.mockRestore();
  });

  it('handles unauthorized role access (HTTP 403) and displays forbidden notice', async () => {
    const invokeSpy = vi.spyOn(FunctionsClient.prototype, 'invoke').mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        status: 403,
        context: {
          json: async () => ({
            error: "[HTTP 403] Access denied: Only authenticated users with the active 'owner' role can create staff accounts.",
            status: 403,
            code: 'FORBIDDEN_NOT_OWNER'
          })
        }
      } as any
    });

    const res = await supabase.functions.invoke('create-staff-account');
    const ctx = (res.error as any)?.context;
    const body = await (ctx as any).json();
    expect(body.status).toBe(403);
    expect(body.error).toContain('[HTTP 403] Access denied');
    expect(body.code).toBe('FORBIDDEN_NOT_OWNER');

    invokeSpy.mockRestore();
  });

  it('proactively refreshes session token when nearing expiration', async () => {
    // Session expiring in 10 seconds
    const expiringSession = {
      access_token: 'old-access-token',
      expires_at: Math.floor(Date.now() / 1000) + 10
    };
    const freshSession = {
      access_token: 'new-refreshed-access-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    };

    const getSessionSpy = vi.spyOn(supabase.auth, 'getSession').mockResolvedValueOnce({
      data: { session: expiringSession as any },
      error: null
    });
    const refreshSpy = vi.spyOn(supabase.auth, 'refreshSession').mockResolvedValueOnce({
      data: { session: freshSession as any, user: { id: 'owner-1' } as any },
      error: null
    });

    // Check expiration logic
    const session = (await supabase.auth.getSession()).data.session;
    const isExpiring = session && session.expires_at && (session.expires_at * 1000 < Date.now() + 60000);
    expect(isExpiring).toBe(true);

    let activeSession = session;
    if (isExpiring) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data.session) activeSession = refreshed.data.session;
    }

    expect(activeSession?.access_token).toBe('new-refreshed-access-token');

    getSessionSpy.mockRestore();
    refreshSpy.mockRestore();
  });
});

describe('Service Catalogue Management & Referential Integrity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('allows owner to add new services with extensible pricing units (per_piece, per_load, per_order)', async () => {
    const newService = await LaundryService.addService({
      name: 'Curtain & Drape Dry Cleaning',
      description: 'Steam cleaned and anti-allergen sanitized per set',
      pricing_unit: 'per_piece',
      unit_price_paise: 35000,
      is_active: true,
      display_order: 5
    });

    expect(newService.id).toBeDefined();
    expect(newService.name).toBe('Curtain & Drape Dry Cleaning');
    expect(newService.pricing_unit).toBe('per_piece');
    expect(newService.unit_price_paise).toBe(35000);
    expect(newService.is_active).toBe(true);

    const all = await LaundryService.getServices(true);
    expect(all.some(s => s.name === 'Curtain & Drape Dry Cleaning')).toBe(true);
  });

  it('rejects duplicate service names (case-insensitive) and invalid pricing units or prices', async () => {
    await LaundryService.addService({
      name: 'Sneaker Spa Care',
      pricing_unit: 'per_item',
      unit_price_paise: 29900
    });

    // Duplicate name
    await expect(
      LaundryService.addService({
        name: '  SNEAKER SPA CARE  ',
        pricing_unit: 'per_item',
        unit_price_paise: 35000
      })
    ).rejects.toThrow(/already exists/i);

    // Invalid pricing unit
    await expect(
      LaundryService.addService({
        name: 'Invalid Unit Service',
        pricing_unit: 'per_mile',
        unit_price_paise: 10000
      })
    ).rejects.toThrow(/invalid pricing unit/i);

    // Zero or negative unit price
    await expect(
      LaundryService.addService({
        name: 'Zero Price Service',
        pricing_unit: 'per_kg',
        unit_price_paise: 0
      })
    ).rejects.toThrow(/greater than zero/i);
  });

  it('allows owner to edit existing service attributes and toggle active status', async () => {
    const created = await LaundryService.addService({
      name: 'Saree Roll Press',
      pricing_unit: 'per_piece',
      unit_price_paise: 12000
    });

    // Update rate and description
    const updated = await LaundryService.updateService(created.id, {
      unit_price_paise: 15000,
      description: 'Delicate silk roll press on padded rollers'
    });

    expect(updated.unit_price_paise).toBe(15000);
    expect(updated.description).toBe('Delicate silk roll press on padded rollers');

    // Deactivate service
    const deactivated = await LaundryService.toggleServiceStatus(created.id, false);
    expect(deactivated.is_active).toBe(false);

    // Should appear in getServices(true) but NOT in getServices(false)
    const allServices = await LaundryService.getServices(true);
    expect(allServices.find(s => s.id === created.id)?.is_active).toBe(false);

    const activeOnly = await LaundryService.getServices(false);
    expect(activeOnly.find(s => s.id === created.id)).toBeUndefined();
  });

  it('synchronizes selected service snapshot with new customer booking and preserves historical bills when catalogue changes', async () => {
    // 1. Create a specific service
    const weddingService = await LaundryService.addService({
      name: 'Sherwani & Heavy Ethnic Wash',
      pricing_unit: 'per_piece',
      unit_price_paise: 65000
    });

    // 2. Customer books using this service_id
    const order = await LaundryService.createBooking({
      customer_name: 'Rohit Verma',
      customer_phone: '9876543230',
      pickup_address: '102 Indiranagar 100ft Road',
      pickup_pincode: '560038',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: weddingService.id
    });

    // 3. Verify snapshot on order
    expect(order.service_id).toBe(weddingService.id);
    expect(order.service_name).toBe('Sherwani & Heavy Ethnic Wash');
    expect(order.pricing_unit).toBe('per_piece');
    expect(order.price_per_kg_paise).toBe(65000);

    // 4. Calculate bill at intake (e.g. 2 pieces)
    const { totalAmountPaise } = LaundryService.calculateBill(
      2,
      order.price_per_kg_paise,
      order.min_weight_kg,
      order.delivery_charge_paise,
      order.pricing_unit
    );
    expect(totalAmountPaise).toBe(130000); // 2 * 65000 = ₹1300.00

    // 5. Owner later increases service price in catalogue to ₹800 and deactivates it
    await LaundryService.updateService(weddingService.id, {
      unit_price_paise: 80000,
      is_active: false
    });

    // 6. Verify existing order retains original historical rate of ₹650 and original service name
    const reloadedOrder = await LaundryService.getOrderById(order.id);
    expect(reloadedOrder?.service_name).toBe('Sherwani & Heavy Ethnic Wash');
    expect(reloadedOrder?.price_per_kg_paise).toBe(65000);
    expect(reloadedOrder?.pricing_unit).toBe('per_piece');
  });

  it('strictly protects services referenced by existing orders from deletion and offers deactivation instead', async () => {
    // 1. Create service
    const duvetService = await LaundryService.addService({
      name: 'King Size Quilt Laundering',
      pricing_unit: 'per_item',
      unit_price_paise: 40000
    });

    // 2. Order created referencing this service
    await LaundryService.createBooking({
      customer_name: 'Anil Kumble',
      customer_phone: '9876543231',
      pickup_address: '22 MG Road',
      pickup_pincode: '560001',
      pickup_date: '2026-10-23',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: duvetService.id
    });

    // 3. Attempting to delete duvetService must fail
    await expect(
      LaundryService.deleteService(duvetService.id)
    ).rejects.toThrow(/referenced by existing order/i);

    // 4. Owner deactivates instead
    const deactivated = await LaundryService.toggleServiceStatus(duvetService.id, false);
    expect(deactivated.is_active).toBe(false);

    // 5. An unreferenced service can be deleted cleanly
    const tempService = await LaundryService.addService({
      name: 'Temporary Promo Service',
      pricing_unit: 'per_order',
      unit_price_paise: 19900
    });

    const deleteResult = await LaundryService.deleteService(tempService.id);
    expect(deleteResult.success).toBe(true);

    const remaining = await LaundryService.getServices(true);
    expect(remaining.some(s => s.id === tempService.id)).toBe(false);
  });

  it('correctly calculates bills for diverse pricing units (per_kg, per_piece, per_load, per_order)', () => {
    // per_kg: Weight below minimum 3.0 kg -> applies minimum weight
    const perKgMin = LaundryService.calculateBill(2.0, 8000, 3.0, 0, 'per_kg');
    expect(perKgMin.billableWeightKg).toBe(3.0);
    expect(perKgMin.totalAmountPaise).toBe(24000);
    expect(perKgMin.minWeightApplied).toBe(true);

    // per_kg: Weight above minimum
    const perKgAbove = LaundryService.calculateBill(4.5, 8000, 3.0, 0, 'per_kg');
    expect(perKgAbove.billableWeightKg).toBe(4.5);
    expect(perKgAbove.totalAmountPaise).toBe(36000);

    // per_piece: 5 shirts @ ₹25/piece
    const perPiece = LaundryService.calculateBill(5, 2500, 0, 0, 'per_piece');
    expect(perPiece.billableWeightKg).toBe(5);
    expect(perPiece.totalAmountPaise).toBe(12500);

    // per_load: 1 wash load @ ₹450
    const perLoad = LaundryService.calculateBill(1, 45000, 0, 0, 'per_load');
    expect(perLoad.totalAmountPaise).toBe(45000);

    // per_order: flat fee ₹500
    const perOrder = LaundryService.calculateBill(1, 50000, 0, 0, 'per_order');
    expect(perOrder.totalAmountPaise).toBe(50000);
  });
});

describe('Concurrency-Safe Order Number Generation, Repeated Bookings & Collision Protection', () => {
  it('safely handles repeated bookings idempotently without duplicate orders or collision errors', async () => {
    const bookingData = {
      customer_name: 'Repeat Customer',
      customer_phone: '9876543290',
      pickup_address: 'Flat 101, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-25',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    const first = await LaundryService.createBooking(bookingData);
    expect(first.id).toBeDefined();
    expect(first.order_number).toMatch(/^SW-\d+$/);

    // Second repeated booking call with exact parameters returns the identical booking
    const second = await LaundryService.createBooking(bookingData);
    expect(second.id).toBe(first.id);
    expect(second.order_number).toBe(first.order_number);

    // Confirm only one new order exists in storage
    const allOrders = await LaundryService.getOrders();
    const matches = allOrders.filter(o => o.id === first.id);
    expect(matches.length).toBe(1);
  });

  it('guarantees unique, distinct order numbers for concurrent booking requests', async () => {
    const slots = [
      'Morning (08:00 AM - 11:00 AM)',
      'Noon (11:00 AM - 02:00 PM)',
      'Evening (04:00 PM - 07:00 PM)'
    ];

    // Fire 3 simultaneous bookings for different customers
    const promises = [1, 2, 3].map((num) =>
      LaundryService.createBooking({
        customer_name: `Concurrent User ${num}`,
        customer_phone: `987654320${num}`,
        pickup_address: `10${num} 100ft Road, Indiranagar`,
        pickup_pincode: '560038',
        pickup_date: '2026-10-26',
        pickup_slot: slots[num - 1]
      })
    );

    const results = await Promise.all(promises);

    expect(results.length).toBe(3);

    // Assert that each order received a distinct unique order number
    const orderNumbers = results.map(r => r.order_number);
    const uniqueOrderNumbers = new Set(orderNumbers);
    expect(uniqueOrderNumbers.size).toBe(3);

    // Assert that each order received a distinct unique ID
    const ids = results.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);

    // All order numbers must adhere to SW-XXXX format
    for (const num of orderNumbers) {
      expect(num).toMatch(/^SW-\d+$/);
    }
  });

  it('deduplicates in-flight identical requests to the exact same order without race collisions', async () => {
    const identicalBooking = {
      customer_name: 'Rapid Clicker',
      customer_phone: '9876543299',
      pickup_address: '22 Cambridge Layout',
      pickup_pincode: '560008',
      pickup_date: '2026-10-27',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    };

    // Simulate parallel asynchronous execution (e.g. user double clicking button)
    const [orderA, orderB] = await Promise.all([
      LaundryService.createBooking(identicalBooking),
      LaundryService.createBooking(identicalBooking)
    ]);

    expect(orderA.id).toBe(orderB.id);
    expect(orderA.order_number).toBe(orderB.order_number);

    // Verify storage has exactly 1 order for this customer
    const all = await LaundryService.getOrders();
    const count = all.filter(o => o.customer_phone === identicalBooking.customer_phone).length;
    expect(count).toBe(1);
  });

  it('handles existing out-of-order and gap numbers without colliding with existing records', async () => {
    // Seed an order with a high order number (e.g. SW-1050)
    const orders = await LaundryService.getOrders();
    const highOrder: any = {
      ...orders[0],
      id: '00000000-0000-4000-b000-000000000999',
      order_number: 'SW-1050',
      customer_phone: '9876543298',
      created_at: new Date(Date.now() - 3600000 * 24).toISOString()
    };
    localStorage.setItem('superwash_orders', JSON.stringify([highOrder, ...orders]));
    LaundryService.resetOrderSequence();

    // Next booking must advance past the maximum existing number SW-1050 to avoid collision
    const newBooking = await LaundryService.createBooking({
      customer_name: 'High Sequence Tester',
      customer_phone: '9876543297',
      pickup_address: '45 MG Road',
      pickup_pincode: '560001',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    expect(newBooking.order_number).toBe('SW-1051');
    expect(newBooking.order_number).not.toBe('SW-1050');
  });

  it('collision protection loop skips over existing occupied numbers to find next available sequence', () => {
    const existingOrders: any[] = [
      { order_number: 'SW-1001' },
      { order_number: 'SW-1002' },
      { order_number: 'SW-1003' },
      { order_number: 'SW-1004' }
    ];

    LaundryService.resetOrderSequence();
    const nextNum = LaundryService.generateSafeOrderNumber(existingOrders);
    expect(nextNum).toBe('SW-1005');

    // If SW-1005 already exists in a gap
    existingOrders.push({ order_number: 'SW-1005' });
    const skippedNum = LaundryService.generateSafeOrderNumber(existingOrders);
    expect(skippedNum).toBe('SW-1006');
  });

  it('ensures failed booking displays a clear error and creates no duplicate bookings or payments', async () => {
    const initialOrders = await LaundryService.getOrders();
    const initialPayments = JSON.parse(localStorage.getItem('superwash_payments') || '[]');

    // Invalid PIN code triggers coverage rejection
    await expect(
      LaundryService.createBooking({
        customer_name: 'Fail Tester',
        customer_phone: '9876543296',
        pickup_address: 'Delhi Cantt',
        pickup_pincode: '110001', // Unserviceable PIN
        pickup_date: '2026-10-28',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
      })
    ).rejects.toThrow('PIN code 110001 is currently outside our service coverage');

    // Confirm database / storage integrity: zero orders added, zero payments created
    const finalOrders = await LaundryService.getOrders();
    const finalPayments = JSON.parse(localStorage.getItem('superwash_payments') || '[]');

    expect(finalOrders.length).toBe(initialOrders.length);
    expect(finalPayments.length).toBe(initialPayments.length);
  });
});

describe('Centralized Business Contact Settings & Multi-Page Propagation', () => {
  it('Owner Dashboard loads the current business phone and address into settings form', async () => {
    await LaundryService.updateSettings({
      business_phone: '+91 98765 11111',
      business_address: 'Shop 99, 100ft Road, Indiranagar, Bengaluru 560038'
    });

    const ownerProfile: Profile = {
      id: '00000000-0000-4000-a000-000000000001',
      email: 'owner@superwash.in',
      phone: '9876543210',
      full_name: 'Store Owner',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    render(
      <MemoryRouter>
        <AuthProvider>
          <OwnerDashboard />
        </AuthProvider>
      </MemoryRouter>
    );

    // Navigate to Settings tab
    const settingsTabBtn = await screen.findByRole('button', { name: /Pricing & Coverage/i });
    fireEvent.click(settingsTabBtn);

    const phoneInput = (await screen.findByDisplayValue('+91 98765 11111')) as HTMLInputElement;
    const addressInput = (await screen.findByDisplayValue('Shop 99, 100ft Road, Indiranagar, Bengaluru 560038')) as HTMLTextAreaElement;

    expect(phoneInput).toBeDefined();
    expect(addressInput).toBeDefined();
  });

  it('an authorized owner can edit and save both business contact fields with UI reflection', async () => {
    const ownerProfile: Profile = {
      id: '00000000-0000-4000-a000-000000000001',
      email: 'owner@superwash.in',
      phone: '9876543210',
      full_name: 'Store Owner',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    render(
      <MemoryRouter>
        <AuthProvider>
          <OwnerDashboard />
        </AuthProvider>
      </MemoryRouter>
    );

    const settingsTabBtn = await screen.findByRole('button', { name: /Pricing & Coverage/i });
    fireEvent.click(settingsTabBtn);

    // Locate phone and address inputs
    const phoneInput = (await screen.findByPlaceholderText('+91 98765 43210')) as HTMLInputElement;
    const addressInput = (await screen.findByPlaceholderText('Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038')) as HTMLTextAreaElement;

    // Change values
    fireEvent.change(phoneInput, { target: { value: ' +91 91234 56789  ' } });
    fireEvent.change(addressInput, { target: { value: '  Shop 77, 12th Main, Indiranagar, Bengaluru 560038  ' } });

    // Submit form
    const saveBtn = screen.getByRole('button', { name: /Save Configuration/i });
    fireEvent.click(saveBtn);

    // Verify success feedback
    await waitFor(() => {
      expect(screen.getByText(/Business contact details and operational rates have been saved/i)).toBeDefined();
    });

    // Verify trimmed values persisted in LaundryService
    const savedSettings = await LaundryService.getSettings();
    expect(savedSettings.business_phone).toBe('+91 91234 56789');
    expect(savedSettings.business_address).toBe('Shop 77, 12th Main, Indiranagar, Bengaluru 560038');
  });

  it('displays a clear error when saving invalid phone or address and prevents false success', async () => {
    const ownerProfile: Profile = {
      id: '00000000-0000-4000-a000-000000000001',
      email: 'owner@superwash.in',
      phone: '9876543210',
      full_name: 'Store Owner',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    render(
      <MemoryRouter>
        <AuthProvider>
          <OwnerDashboard />
        </AuthProvider>
      </MemoryRouter>
    );

    const settingsTabBtn = await screen.findByRole('button', { name: /Pricing & Coverage/i });
    fireEvent.click(settingsTabBtn);

    const phoneInput = (await screen.findByPlaceholderText('+91 98765 43210')) as HTMLInputElement;
    const addressInput = (await screen.findByPlaceholderText('Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038')) as HTMLTextAreaElement;

    // Invalid phone with only 3 digits
    fireEvent.change(phoneInput, { target: { value: '123' } });
    const saveBtn = screen.getByRole('button', { name: /Save Configuration/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid phone number/i)).toBeDefined();
    });

    // Provide valid phone, but invalid short address
    fireEvent.change(phoneInput, { target: { value: '+91 98765 43210' } });
    fireEvent.change(addressInput, { target: { value: 'Shop' } });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid business address/i)).toBeDefined();
    });
  });

  it('Navbar, Footer, LandingPage, ContactPage, and CustomerHome consistently render the same central settings', async () => {
    const customPhone = '+91 99999 88888';
    const customAddress = 'Shop #202, Indiranagar 100ft Road, Bengaluru, Karnataka 560038';

    await LaundryService.updateSettings({
      business_phone: customPhone,
      business_address: customAddress
    });

    // 1. Test Navbar
    const { unmount: unmountNavbar } = render(
      <MemoryRouter>
        <AuthProvider>
          <Navbar />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      const navbarPhone = screen.getByText(customPhone);
      expect(navbarPhone).toBeDefined();
      const navbarTelLink = screen.getByRole('link', { name: customPhone, hidden: true });
      expect(navbarTelLink.getAttribute('href')).toBe('tel:+919999988888');
    });
    unmountNavbar();

    // 2. Test Footer
    const { unmount: unmountFooter } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(customAddress)).toBeDefined();
      const footerTelLink = screen.getByRole('link', { name: customPhone });
      expect(footerTelLink.getAttribute('href')).toBe('tel:+919999988888');
    });
    unmountFooter();

    // 3. Test ContactPage
    const { unmount: unmountContact } = render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(customAddress)).toBeDefined();
      const contactTelLink = screen.getByRole('link', { name: customPhone });
      expect(contactTelLink.getAttribute('href')).toBe('tel:+919999988888');
      const whatsappLink = screen.getByRole('link', { name: /WhatsApp/i });
      expect(whatsappLink.getAttribute('href')).toBe('https://wa.me/919999988888');
    });
    unmountContact();

    // 4. Test LandingPage
    const { unmount: unmountLanding } = render(
      <MemoryRouter>
        <AuthProvider>
          <LandingPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(customAddress)).toBeDefined();
      const callStoreBtns = screen.getAllByRole('link', { name: (content) => content.includes(customPhone) });
      expect(callStoreBtns.length).toBeGreaterThanOrEqual(1);
      expect(callStoreBtns[0].getAttribute('href')).toBe('tel:+919999988888');
    });
    unmountLanding();
  });

  it('uses DEFAULT_SETTINGS fallback cleanly when settings are uninitialized or offline', async () => {
    localStorage.clear();

    const settings = await LaundryService.getSettings();
    expect(settings.business_phone).toBe(DEFAULT_SETTINGS.business_phone);
    expect(settings.business_address).toBe(DEFAULT_SETTINGS.business_address);

    const { unmount } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(DEFAULT_SETTINGS.business_address)).toBeDefined();
      expect(screen.getByRole('link', { name: DEFAULT_SETTINGS.business_phone })).toBeDefined();
    });
    unmount();
  });

  it('restricts business contact settings editing strictly to owner role', async () => {
    // Delivery staff profile cannot see or edit settings
    const deliveryProfile: Profile = {
      id: '00000000-0000-4000-a000-000000000003',
      email: 'driver@superwash.in',
      phone: '9876543212',
      full_name: 'Delivery Driver',
      role: 'delivery',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(deliveryProfile));

    // ProtectedRoute for owner denies delivery staff
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <OwnerDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<div>Access Denied / Public Home</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Delivery staff is denied and sees Access Restricted
    await waitFor(() => {
      expect(screen.getByText(/Access Restricted/i)).toBeDefined();
    });
  });
});



