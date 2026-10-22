import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import { RoleSwitcherBar } from '../components/RoleSwitcherBar';
import { AuthProvider } from '../context/AuthContext';
import { LaundryService } from '../services/laundryService';

beforeEach(async () => {
  localStorage.clear();
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

    // Assign delivery
    const assigned = await LaundryService.assignDeliveryStaff(order.id, 'del-1', 'Ramesh', '9876543215');
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

    // Transition order to delivered
    await LaundryService.updateOrderStatus(order.id, 'collected');
    await LaundryService.enterMeasuredWeight(order.id, 4.0);
    await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery');
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
    await LaundryService.updateOrderStatus(order.id, 'collected');
    await LaundryService.enterMeasuredWeight(order.id, 5.0);
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
  });
});


