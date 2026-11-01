import { describe, it, expect, beforeEach } from 'vitest';
import { LaundryService, setLiveModeForTesting } from '../services/laundryService';
import { PricingEngine } from '../services/pricingEngine';

describe('Advance Payment Accounting & True Balance Reconciliation', () => {
  beforeEach(() => {
    localStorage.clear();
    setLiveModeForTesting(false);
  });

  it('records an advance payment prior to scale weigh-in and sets status to partially_paid', async () => {
    // 1. Create a fresh booking (unweighed, total_amount_paise is null)
    const order = await LaundryService.createBooking({
      customer_name: 'Advance Test Customer',
      customer_phone: '9876543210',
      pickup_address: '77 Residency Rd, Bengaluru',
      pickup_pincode: '560070',
      pickup_date: '2026-11-06',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    expect(order.total_amount_paise).toBeNull();
    expect(order.paid_amount_paise).toBe(0);
    expect(order.payment_status).toBe('pending');

    // 2. Customer pays a ₹50 (5000 paise) advance payment
    const updatedOrder = await LaundryService.recordPayment(
      order.id,
      5000,
      'upi_manual',
      'UPI-ADV-12345',
      'Booking advance payment',
      'Customer',
      'Online Advance',
      undefined,
      'advance'
    );

    expect(updatedOrder.paid_amount_paise).toBe(5000);
    expect(updatedOrder.payment_status).toBe('partially_paid');
    expect(updatedOrder.payment.payment_type).toBe('advance');
  });

  it('credits the advance payment against the final invoice balance after physical weigh-in', async () => {
    // 1. Create booking and pay ₹50 advance
    const order = await LaundryService.createBooking({
      customer_name: 'Advance Credit Customer',
      customer_phone: '9876543210',
      pickup_address: '77 Residency Rd, Bengaluru',
      pickup_pincode: '560070',
      pickup_date: '2026-11-06',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await LaundryService.recordPayment(
      order.id,
      5000,
      'upi_manual',
      'UPI-ADV-12345',
      'Booking advance',
      'Customer',
      'Online Advance',
      undefined,
      'advance'
    );

    // 2. Doorstep collection: Courier weighs 3.0 kg (3.0 * ₹79 = ₹237 / 23700 paise)
    const collectedOrder = await LaundryService.recordPickupCollectionAndWeight(
      order.id,
      3.0,
      undefined,
      'Doorstep Courier'
    );

    expect(collectedOrder.total_amount_paise).toBe(23700);
    expect(collectedOrder.paid_amount_paise).toBe(5000); // Advance remains credited
    expect(collectedOrder.payment_status).toBe('partially_paid');

    // 3. Compute remaining balance due at delivery
    const balanceDuePaise = collectedOrder.total_amount_paise! - collectedOrder.paid_amount_paise;
    expect(balanceDuePaise).toBe(18700); // Exactly ₹187.00 remaining

    // 4. Delivery associate collects remaining ₹187.00 in cash at doorstep
    const finalOrder = await LaundryService.recordPayment(
      order.id,
      18700,
      'cash',
      undefined,
      'COD balance collected at delivery',
      'Courier Partner',
      'Delivery Courier',
      undefined,
      'balance'
    );

    expect(finalOrder.paid_amount_paise).toBe(23700);
    expect(finalOrder.payment_status).toBe('paid');
  });

  it('strictly blocks subsequent payments that exceed the remaining balance', async () => {
    // Total is ₹237, advance is ₹50, remaining balance is ₹187
    const order = await LaundryService.createBooking({
      customer_name: 'Overpayment Customer',
      customer_phone: '9876543210',
      pickup_address: '77 Residency Rd, Bengaluru',
      pickup_pincode: '560070',
      pickup_date: '2026-11-06',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    await LaundryService.recordPayment(
      order.id,
      5000,
      'upi_manual',
      'ADV-999',
      'Advance',
      'Customer',
      'Online',
      undefined,
      'advance'
    );

    await LaundryService.recordPickupCollectionAndWeight(order.id, 3.0);

    // Attempting to pay ₹200 when only ₹187 is remaining must fail
    await expect(
      LaundryService.recordPayment(
        order.id,
        20000, // ₹200.00
        'cash',
        undefined,
        'Excess payment attempt',
        'Staff',
        'Staff',
        undefined,
        'balance'
      )
    ).rejects.toThrow(/exceeds the remaining balance of ₹187/);
  });
});

