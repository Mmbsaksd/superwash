import { describe, it, expect, beforeEach } from 'vitest';
import { LaundryService, setLiveModeForTesting } from '../services/laundryService';
import { PricingEngine } from '../services/pricingEngine';
import type { Coupon } from '../types';

describe('Option A Coupon Lifecycle — Booking Reservation & Final Weighed Validation', () => {
  const mockCouponWithThreshold: Coupon = {
    id: 'coupon-super25',
    code: 'SUPER25',
    description: 'Flat ₹50 OFF on orders above ₹250',
    discount_type: 'fixed',
    discount_value: 5000, // ₹50.00
    min_order_paise: 25000, // ₹250.00 threshold
    per_customer_limit: 1,
    first_time_only: false,
    is_active: true,
    total_redemptions: 0,
    created_at: new Date().toISOString()
  };

  beforeEach(async () => {
    localStorage.clear();
    setLiveModeForTesting(false);
    await LaundryService.createCoupon(mockCouponWithThreshold, 'owner');
  });

  it('attaches coupon provisionally during preliminary booking estimate even if subtotal is below minimum threshold (Option A)', async () => {
    // 1 kg @ ₹79/kg = ₹79 (7900 paise), which is below ₹250 threshold
    const preliminaryEstimatePaise = 7900;

    const bookingValidation = await LaundryService.validateCoupon(
      'SUPER25',
      '9876543210',
      preliminaryEstimatePaise,
      undefined,
      true // isBookingEstimate = true (Option A)
    );

    expect(bookingValidation.valid).toBe(true);
    expect(bookingValidation.code).toBe('SUPER25');
    expect(bookingValidation.min_order_paise).toBe(25000);
    expect(bookingValidation.reason).toContain('Minimum order of ₹250 will be verified upon physical scale weigh-in');
  });

  it('strictly rejects subtotal below threshold when NOT a booking estimate (standard validation)', async () => {
    const directValidation = await LaundryService.validateCoupon(
      'SUPER25',
      '9876543210',
      7900,
      undefined,
      false // direct / final check
    );

    expect(directValidation.valid).toBe(false);
    expect(directValidation.reason).toContain('Minimum order subtotal of ₹250 required');
  });

  it('awards discount when actual measured weight exceeds the coupon threshold upon weigh-in', async () => {
    // Customer books with SUPER25 attached
    const order = await LaundryService.createBooking({
      customer_name: 'Option A Customer',
      customer_phone: '9876543210',
      pickup_address: '123 MG Road, Bengaluru',
      pickup_pincode: '560070',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      coupon_code: 'SUPER25'
    });

    expect(order.coupon_code).toBe('SUPER25');

    // Customer gives 4.0 kg of laundry (4.0 * ₹79 = ₹316 >= ₹250 threshold)
    const weighedOrder = await LaundryService.recordPickupCollectionAndWeight(
      order.id,
      4.0,
      undefined,
      'Test Courier',
      'Doorstep weigh-in'
    );

    expect(weighedOrder.measured_weight).toBe(4.0);
    expect(weighedOrder.billable_weight).toBe(4.0);
    expect(weighedOrder.discount_paise).toBe(5000); // ₹50 discount applied!
    // Subtotal ₹316 (31600) - Discount ₹50 (5000) = ₹266 (26600 paise)
    expect(weighedOrder.total_amount_paise).toBe(26600);
  });

  it('gracefully sets discount to zero without failing the order when actual measured weight falls short of threshold', async () => {
    // Customer books with SUPER25 attached
    const order = await LaundryService.createBooking({
      customer_name: 'Lightweight Customer',
      customer_phone: '9876543210',
      pickup_address: '123 MG Road, Bengaluru',
      pickup_pincode: '560070',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      coupon_code: 'SUPER25'
    });

    // Customer hands over only 1.5 kg (1.5 * ₹79 = ₹118.50 -> 11850 paise < ₹250)
    const weighedOrder = await LaundryService.recordPickupCollectionAndWeight(
      order.id,
      1.5,
      undefined,
      'Test Courier',
      'Doorstep weigh-in'
    );

    expect(weighedOrder.measured_weight).toBe(1.5);
    expect(weighedOrder.billable_weight).toBe(1.5);
    expect(weighedOrder.discount_paise).toBe(0); // Discount is 0 because threshold was unmet
    expect(weighedOrder.total_amount_paise).toBe(11850); // Billed at full normal rate
    expect(weighedOrder.order_status).not.toBe('cancelled'); // Order is completely healthy
  });
});
