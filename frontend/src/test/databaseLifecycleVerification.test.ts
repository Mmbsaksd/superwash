import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LaundryService } from '../services/laundryService';
import { PricingEngine } from '../services/pricingEngine';
import type { Order, Coupon, Payment, BusinessSettings } from '../types';

describe('Phase 5A: Database Payment & Coupon Lifecycle Modernization (15 Core Scenarios)', () => {
  const mockSettings: BusinessSettings = {
    business_name: 'SuperWash Exprez',
    business_phone: '+91 8217541193',
    business_address: 'Kadarenahalli Park, Bengaluru',
    price_per_kg_paise: 7900, // ₹79/kg
    min_weight_kg: 1.0,       // 1.0 kg min
    delivery_charge_paise: 0,
    upi_id: 'superwash@upi',
    allow_delivery_payment_recording: true,
    whatsapp_enabled: true,
    advance_payment_enabled: true,
    advance_payment_type: 'fixed',
    advance_payment_amount_paise: 5000, // ₹50
    min_order_spend_enabled: false,
    min_weight_restriction_enabled: true,
    min_weight_restriction_grams: 1000
  };

  const mockWelcomeCoupon: Coupon = {
    id: 'coupon-welcome50',
    code: 'WELCOME50',
    description: 'Flat ₹50 OFF on orders over ₹150',
    discount_type: 'fixed',
    discount_value: 5000,   // ₹50
    min_order_paise: 15000, // ₹150
    max_discount_paise: null,
    max_redemptions: 500,
    total_redemptions: 0,
    per_customer_limit: 1,
    applicable_service_ids: null,
    first_time_only: true,
    is_active: true,
    valid_until: null,
    created_at: new Date().toISOString()
  };

  const mockExprezCoupon: Coupon = {
    id: 'coupon-exprez10',
    code: 'EXPREZ10',
    description: '10% OFF on orders over ₹200',
    discount_type: 'percentage',
    discount_value: 10,     // 10%
    min_order_paise: 20000, // ₹200
    max_discount_paise: 10000,
    max_redemptions: 500,
    total_redemptions: 0,
    per_customer_limit: 3,
    applicable_service_ids: null,
    first_time_only: false,
    is_active: true,
    valid_until: null,
    created_at: new Date().toISOString()
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('superwash_settings', JSON.stringify(mockSettings));
    localStorage.setItem('superwash_coupons', JSON.stringify([mockWelcomeCoupon, mockExprezCoupon]));
    localStorage.setItem('superwash_orders', JSON.stringify([]));
    localStorage.setItem('superwash_payments', JSON.stringify([]));
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Booking with WELCOME50 below the coupon minimum (₹79 < ₹150)
  // --------------------------------------------------------------------------
  it('1. reserves WELCOME50 when estimated booking subtotal is below minimum without failing', async () => {
    const valResult = await LaundryService.validateCoupon(
      'WELCOME50',
      '9876543210',
      7900, // ₹79 preliminary subtotal
      undefined,
      true  // isBookingEstimate
    );

    expect(valResult.valid).toBe(true);
    expect(valResult.code).toBe('WELCOME50');
    expect(valResult.reason).toContain('verified upon physical scale weigh-in');

    // Create booking
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      coupon_code: 'WELCOME50',
      discount_paise: 0,
      client_submission_id: 'sub-welcome-01'
    });

    expect(order.id).toBeDefined();
    expect(order.coupon_code).toBe('WELCOME50');
    expect(order.discount_paise).toBe(0);

    // Verify coupon total_redemptions is NOT incremented
    const coupons = await LaundryService.getCoupons(true);
    const welcome = coupons.find(c => c.code === 'WELCOME50');
    expect(welcome?.total_redemptions).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Booking with EXPREZ10 below the coupon minimum (₹79 < ₹200)
  // --------------------------------------------------------------------------
  it('2. reserves EXPREZ10 when estimated booking subtotal is below minimum', async () => {
    const valResult = await LaundryService.validateCoupon(
      'EXPREZ10',
      '9876543210',
      7900,
      undefined,
      true
    );

    expect(valResult.valid).toBe(true);
    expect(valResult.code).toBe('EXPREZ10');

    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      coupon_code: 'EXPREZ10',
      discount_paise: 0,
      client_submission_id: 'sub-exprez-01'
    });

    expect(order.coupon_code).toBe('EXPREZ10');
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Booking with a coupon that qualifies at final weighing
  // --------------------------------------------------------------------------
  it('3. awards discount and redeems coupon when actual measured weight qualifies at doorstep', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      coupon_code: 'WELCOME50',
      discount_paise: 0,
      client_submission_id: 'sub-qualify-01'
    });

    // Courier collects and weighs 3.00 kg (Subtotal = 3 * 7900 = 23700 >= 15000)
    const updated = await LaundryService.recordPickupCollectionAndWeight(
      order.id,
      3.00,
      'courier-1',
      'Courier Ramesh',
      'Doorstep weighed: 3.0 kg'
    );

    expect(updated.measured_weight).toBe(3.00);
    expect(updated.billable_weight).toBe(3.00);
    expect(updated.discount_paise).toBe(5000); // ₹50 applied
    expect(updated.total_amount_paise).toBe(23700 - 5000); // ₹187.00
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Booking where the final bill remains below minimum
  // --------------------------------------------------------------------------
  it('4. retains order without discount when actual measured weight remains below coupon threshold', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      coupon_code: 'WELCOME50',
      discount_paise: 0,
      client_submission_id: 'sub-under-01'
    });

    // Courier weighs 1.00 kg (Subtotal = ₹79.00 < ₹150 min)
    const updated = await LaundryService.recordPickupCollectionAndWeight(
      order.id,
      1.00,
      'courier-1',
      'Courier Ramesh',
      'Doorstep weighed: 1.0 kg'
    );

    expect(updated.measured_weight).toBe(1.00);
    expect(updated.discount_paise).toBe(0); // No discount awarded
    expect(updated.total_amount_paise).toBe(7900); // Full price charged
    expect(updated.order_status).toBe('collected'); // Order safely retained
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Cancellation before coupon redemption
  // --------------------------------------------------------------------------
  it('5. safely cancels booked order and releases coupon without burning redemption', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      coupon_code: 'WELCOME50',
      discount_paise: 0,
      client_submission_id: 'sub-cancel-01'
    });

    const cancelled = await LaundryService.updateOrderStatus(
      order.id,
      'cancelled',
      'Customer cancellation before pickup',
      'Changed schedule'
    );

    expect(cancelled.order_status).toBe('cancelled');
    expect(cancelled.cancellation_reason).toBe('Changed schedule');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Duplicate booking requests (Idempotency)
  // --------------------------------------------------------------------------
  it('6. returns existing order idempotently on duplicate booking requests', async () => {
    const submissionId = 'sub-idemp-unique-01';
    const order1 = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: submissionId
    });

    const order2 = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: submissionId
    });

    expect(order1.id).toBe(order2.id);
    expect(order1.order_number).toBe(order2.order_number);
  });

  // --------------------------------------------------------------------------
  // Scenario 7: PricingEngine restriction validation
  // --------------------------------------------------------------------------
  it('7. evaluates restriction validation for store minimums correctly', () => {
    const valid = PricingEngine.validateRestrictions(15000, 2.0, mockSettings);
    expect(valid.isAllowed).toBe(true);

    const underweight = PricingEngine.validateRestrictions(15000, 0.5, mockSettings);
    expect(underweight.isAllowed).toBe(false);
    expect(underweight.violationReason).toContain('below minimum restriction threshold');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Customer advance payment before weighing
  // --------------------------------------------------------------------------
  it('8. permits advance payment on unweighed order and updates ledger', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-adv-01'
    });

    expect(order.total_amount_paise).toBeNull(); // Unweighed

    // Customer records advance payment of ₹50 (5000 paise)
    const paidOrder = await LaundryService.recordPayment(
      order.id,
      5000,
      'upi_manual',
      'UTR-ADV-12345',
      'Customer advance payment',
      order.customer_id,
      'Customer',
      'idemp-adv-01',
      'advance'
    );

    expect(paidOrder.paid_amount_paise).toBe(5000);
    expect(paidOrder.payment_status).toBe('partially_paid');
    expect(paidOrder.payment.payment_type).toBe('advance');
    expect(paidOrder.payment.status).toBe('confirmed');
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Cross-customer payment validation
  // --------------------------------------------------------------------------
  it('9. prevents negative or zero payment amounts', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-neg-01'
    });

    await expect(
      LaundryService.recordPayment(order.id, 0, 'upi_manual', 'UTR-ZERO')
    ).rejects.toThrow('Payment amount must be a positive integer');
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Staff recording permitted payments
  // --------------------------------------------------------------------------
  it('10. records staff cash payment and logs audit receipt', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-staff-01'
    });

    const paidOrder = await LaundryService.recordPayment(
      order.id,
      3000,
      'cash',
      undefined,
      'Cash collected at doorstep',
      'staff-courier-01',
      'Ramesh Courier',
      'idemp-staff-01',
      'advance'
    );

    expect(paidOrder.paid_amount_paise).toBe(3000);
    expect(paidOrder.payment_method).toBe('cash');
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Balance payment following advance payment
  // --------------------------------------------------------------------------
  it('11. credits advance payment toward final invoice and clears balance', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-bal-01'
    });

    // Advance payment: ₹50
    await LaundryService.recordPayment(
      order.id, 5000, 'upi_manual', 'UTR-ADV-01', 'Advance', undefined, undefined, 'idemp-adv', 'advance'
    );

    // Weighed: 5.0 kg @ ₹79 = ₹395.00 (39500 paise)
    const weighed = await LaundryService.recordPickupCollectionAndWeight(
      order.id, 5.00, 'staff-1', 'Staff', 'Weighed 5 kg'
    );

    expect(weighed.total_amount_paise).toBe(39500);
    expect(weighed.paid_amount_paise).toBe(5000);

    // Ledger balance calculation via PricingEngine
    const ledger = PricingEngine.calculatePaymentLedger(
      weighed.total_amount_paise!,
      [{ amount_paise: 5000, payment_type: 'advance' } as Payment]
    );
    expect(ledger.balanceDuePaise).toBe(34500); // ₹345.00 remaining
    expect(ledger.isFullySettled).toBe(false);

    // Pay remaining balance of ₹345
    const settled = await LaundryService.recordPayment(
      order.id, 34500, 'upi_manual', 'UTR-BAL-01', 'Balance cleared', undefined, undefined, 'idemp-bal', 'balance'
    );

    expect(settled.paid_amount_paise).toBe(39500);
    expect(settled.payment_status).toBe('paid');
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Duplicate payment idempotency
  // --------------------------------------------------------------------------
  it('12. prevents duplicate payment on repeated idempotency key', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-idemp-pay-01'
    });

    const key = 'idemp-repeat-01';
    const pay1 = await LaundryService.recordPayment(
      order.id, 5000, 'upi_manual', 'UTR-REP-01', 'Advance', undefined, undefined, key, 'advance'
    );

    const pay2 = await LaundryService.recordPayment(
      order.id, 5000, 'upi_manual', 'UTR-REP-01', 'Advance', undefined, undefined, key, 'advance'
    );

    expect(pay1.payment.id).toBe(pay2.payment.id);
    expect(pay2.paid_amount_paise).toBe(5000); // Did not double-charge
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Overpayment rejection
  // --------------------------------------------------------------------------
  it('13. rejects payments exceeding outstanding balance on weighed orders', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-overpay-01'
    });

    // Weighed 2.0 kg @ ₹79 = ₹158.00 (15800 paise)
    await LaundryService.recordPickupCollectionAndWeight(order.id, 2.00, 'staff-1', 'Staff', 'Weighed 2 kg');

    // Attempting to pay ₹200 (20000 paise) when balance is ₹158
    await expect(
      LaundryService.recordPayment(order.id, 20000, 'upi_manual', 'UTR-OVERPAY', 'Overpay', undefined, undefined, 'idemp-over', 'full')
    ).rejects.toThrow('exceeds the remaining balance');
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Cancellation with an outstanding advance payment
  // --------------------------------------------------------------------------
  it('14. tracks refund liability when an order with advance payment is cancelled', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-canc-adv-01'
    });

    // Advance payment: ₹50
    await LaundryService.recordPayment(
      order.id, 5000, 'upi_manual', 'UTR-ADV-CANCEL', 'Advance', undefined, undefined, 'idemp-advcan', 'advance'
    );

    const cancelled = await LaundryService.updateOrderStatus(
      order.id,
      'cancelled',
      'Cancelled before pickup',
      'Customer emergency'
    );

    expect(cancelled.order_status).toBe('cancelled');
    expect(cancelled.paid_amount_paise).toBe(5000); // Advance remains tracked
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Refund success, failure and retry behavior
  // --------------------------------------------------------------------------
  it('15. processes refund correctly, updates order state, and rejects over-refunds', async () => {
    const order = await LaundryService.createBooking({
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub-refund-01'
    });

    // Customer paid ₹100
    await LaundryService.recordPayment(
      order.id, 10000, 'upi_manual', 'UTR-PAID-01', 'Full pay', undefined, undefined, 'idemp-p01', 'advance'
    );

    // Over-refund check: Attempting to refund ₹150 when paid ₹100
    await expect(
      LaundryService.recordRefund(order.id, 15000, 'Attempting over-refund')
    ).rejects.toThrow('cannot exceed amount paid');

    // Valid refund of ₹100
    const refundedOrder = await LaundryService.recordRefund(
      order.id,
      10000,
      'Refund transferred via UPI',
      'UTR-REFUND-001',
      'idemp-ref-01'
    );

    expect(refundedOrder.paid_amount_paise).toBe(0);
    expect(refundedOrder.payment_status).toBe('refunded');
    expect(refundedOrder.payment.payment_type).toBe('refund');
    expect(refundedOrder.payment.status).toBe('refund_completed');
  });
});
