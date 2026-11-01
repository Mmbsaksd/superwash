import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { PricingEngine } from '../services/pricingEngine';
import { RazorpayService } from '../services/razorpayService';
import { PaymentModal } from '../components/PaymentModal';
import { Order, BusinessSettings } from '../types';
import { AuthProvider } from '../context/AuthContext';
import { DEFAULT_SETTINGS } from '../services/laundryService';

describe('PricingEngine Deterministic Calculations', () => {
  it('correctly calculates billable weight and handles minimum weight thresholds', () => {
    // 0.5 kg measured when 1.0 kg is min -> billable is 1.0 kg, minWeightApplied is true
    const result1 = PricingEngine.calculateBillableWeight(0.5, 1.0);
    expect(result1.billableWeightKg).toBe(1.0);
    expect(result1.minWeightApplied).toBe(true);

    // 2.75 kg measured when 1.0 kg is min -> billable is 2.75 kg, minWeightApplied is false
    const result2 = PricingEngine.calculateBillableWeight(2.75, 1.0);
    expect(result2.billableWeightKg).toBe(2.75);
    expect(result2.minWeightApplied).toBe(false);

    // Edge case: zero or negative weight
    const result3 = PricingEngine.calculateBillableWeight(-1, 1.0);
    expect(result3.billableWeightKg).toBe(1.0);
    expect(result3.measuredWeightKg).toBe(0);
  });

  it('calculates order pricing in integer paise with zero floating-point error', () => {
    // ₹79/kg (7900 paise), 3.5 kg -> 3.5 * 7900 = 27650 paise (₹276.50)
    const pricing = PricingEngine.calculateOrderPricing({
      measuredWeightKg: 3.5,
      unitPricePaise: 7900,
      minWeightKg: 1.0,
      pricingUnit: 'per_kg',
      deliveryChargePaise: 4000,
      discountPaise: 5000
    });

    expect(pricing.billableWeightKg).toBe(3.5);
    expect(pricing.subtotalPaise).toBe(27650);
    expect(pricing.discountPaise).toBe(5000);
    expect(pricing.deliveryChargePaise).toBe(4000);
    // Total = 27650 - 5000 + 4000 = 26650
    expect(pricing.totalAmountPaise).toBe(26650);
  });

  it('evaluates Option A coupon discount strictly against actual measured subtotal with authoritative WELCOME50 rules (min ₹150)', () => {
    const coupon = {
      code: 'WELCOME50',
      discount_type: 'fixed' as const,
      discount_value: 5000, // Flat ₹50 off
      min_order_paise: 15000 // Authoritative production threshold: ₹150 (15,000 paise)
    };

    // Boundary 1: ₹149.99 (14,999 paise) -> 1 paise below ₹150 threshold -> ineligible
    const under = PricingEngine.evaluateCouponDiscount(coupon, 14999);
    expect(under.isEligible).toBe(false);
    expect(under.discountPaise).toBe(0);
    expect(under.shortfallPaise).toBe(1);

    // Legacy test subtotal ₹140 (14000 paise) -> ineligible, shortfall = 1000 paise (₹10)
    const wellUnder = PricingEngine.evaluateCouponDiscount(coupon, 14000);
    expect(wellUnder.isEligible).toBe(false);
    expect(wellUnder.discountPaise).toBe(0);
    expect(wellUnder.shortfallPaise).toBe(1000);

    // Boundary 2: Exactly ₹150.00 (15,000 paise) -> eligible, discount is 5000 paise
    const exact = PricingEngine.evaluateCouponDiscount(coupon, 15000);
    expect(exact.isEligible).toBe(true);
    expect(exact.discountPaise).toBe(5000);

    // Boundary 3: ₹200.00 (20,000 paise) -> comfortably above threshold -> eligible, discount remains 5000 paise
    const over = PricingEngine.evaluateCouponDiscount(coupon, 20000);
    expect(over.isEligible).toBe(true);
    expect(over.discountPaise).toBe(5000);

    // Subtotal ₹237 (23700 paise) -> eligible, discount is 5000 paise
    const higher = PricingEngine.evaluateCouponDiscount(coupon, 23700);
    expect(higher.isEligible).toBe(true);
    expect(higher.discountPaise).toBe(5000);
  });

  it('correctly calculates advance payments and payment ledger summaries', () => {
    const ledger = PricingEngine.calculatePaymentLedger(30000, [
      {
        id: 'pay-1',
        order_id: 'ord-1',
        amount_paise: 10000,
        payment_method: 'razorpay',
        payment_type: 'advance',
        status: 'confirmed',
        created_at: new Date().toISOString()
      },
      {
        id: 'pay-2',
        order_id: 'ord-1',
        amount_paise: 15000,
        payment_method: 'cash',
        payment_type: 'balance',
        status: 'confirmed',
        created_at: new Date().toISOString()
      }
    ]);

    expect(ledger.totalPayablePaise).toBe(30000);
    expect(ledger.advancePaidPaise).toBe(10000);
    expect(ledger.subsequentPaidPaise).toBe(15000);
    expect(ledger.totalPaidPaise).toBe(25000);
    expect(ledger.balanceDuePaise).toBe(5000);
    expect(ledger.paymentStatus).toBe('partially_paid');
    expect(ledger.isFullySettled).toBe(false);
  });
});

describe('RazorpayService & Modal Client Integration', () => {
  const mockOrder: Order = {
    id: 'ord-test-razorpay-1',
    order_number: 'SW-1099',
    customer_id: 'cust-uuid-1',
    customer_name: 'Pooja Sharma',
    customer_phone: '9876543210',
    pickup_address: '12th Main, Indiranagar, Bengaluru',
    pickup_pincode: '560111',
    pickup_date: '2026-11-05',
    pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
    order_status: 'collected',
    payment_status: 'pending',
    payment_method: 'razorpay',
    delivery_charge_paise: 0,
    price_per_kg_paise: 7900,
    min_weight_kg: 1.0,
    measured_weight: 3.0,
    total_amount_paise: 23700,
    paid_amount_paise: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  it('creates a simulated sandbox Razorpay order and completes mock verification', async () => {
    const orderResult = await RazorpayService.createPaymentOrder(mockOrder, 23700);
    expect(orderResult.success).toBe(true);
    expect(orderResult.amount_paise).toBe(23700);
    expect(orderResult.razorpay_order_id).toBeDefined();

    const checkoutResponse = await RazorpayService.openCheckout(orderResult);
    expect(checkoutResponse.razorpay_order_id).toBe(orderResult.razorpay_order_id);
    expect(checkoutResponse.razorpay_payment_id).toBeDefined();

    const verification = await RazorpayService.verifyPayment(mockOrder.id, checkoutResponse);
    expect(verification.success).toBe(true);
  });

  it('renders Customer Payment Modal with approved COD-only guidance when online payments are disabled', async () => {
    const onPaymentSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AuthProvider>
        <PaymentModal
          order={mockOrder}
          isOpen={true}
          onClose={onClose}
          onPaymentSuccess={onPaymentSuccess}
          isStaff={false}
          settings={{
            ...DEFAULT_SETTINGS,
            online_payment_enabled: false,
            cod_payment_enabled: true
          }}
        />
      </AuthProvider>
    );

    // Assert customer-facing elements are present under approved COD policy
    expect(screen.getByText('Order Payment')).toBeDefined();
    expect(screen.getByText(/Cash on Delivery \(Doorstep Payment\)/i)).toBeDefined();
    expect(screen.getByText(/Amount Due at Delivery:/i)).toBeDefined();
    expect(screen.getAllByText('₹237.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Payment is collected in cash by our verified delivery courier/i)).toBeDefined();

    // Verify online gateway button and manual UPI inputs are strictly NOT shown to the customer
    expect(screen.queryByText(/Pay ₹237.00 Online via Razorpay/i)).toBeNull();
    expect(screen.queryByText(/Instant Online Payment/i)).toBeNull();
    expect(screen.queryByText(/UPI 12-Digit Reference/i)).toBeNull();
    expect(screen.queryByText(/Confirm & Record/i)).toBeNull();
  });

  it('renders Instant Online Payment when online_payment_enabled is explicitly activated', async () => {
    const onPaymentSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AuthProvider>
        <PaymentModal
          order={mockOrder}
          isOpen={true}
          onClose={onClose}
          onPaymentSuccess={onPaymentSuccess}
          isStaff={false}
          settings={{
            ...DEFAULT_SETTINGS,
            online_payment_enabled: true,
            cod_payment_enabled: true
          }}
        />
      </AuthProvider>
    );

    // Online payment button is present when explicitly enabled
    expect(screen.getByText(/Instant Online Payment/i)).toBeDefined();
    const payBtn = screen.getByText(/Pay ₹237.00 Online via Razorpay/i);
    expect(payBtn).toBeDefined();

    fireEvent.click(payBtn);

    // Wait for success confirmation
    await waitFor(() => {
      expect(screen.getByText(/Online payment of ₹237.00 confirmed successfully!/i)).toBeDefined();
    }, { timeout: 3000 });
  });
});
