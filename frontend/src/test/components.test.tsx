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
    delivery_charge_paise: 0
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

