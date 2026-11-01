import { describe, it, expect } from 'vitest';
import { PricingEngine } from '../services/pricingEngine';
import type { BusinessSettings, Payment } from '../types';

describe('PricingEngine — Core Financial & Pricing Calculations', () => {
  describe('calculateBillableWeight', () => {
    it('applies minimum weight when measured weight is below threshold', () => {
      const result = PricingEngine.calculateBillableWeight(0.65, 1.0);
      expect(result.measuredWeightKg).toBe(0.65);
      expect(result.billableWeightKg).toBe(1.0);
      expect(result.minWeightApplied).toBe(true);
    });

    it('does not apply minimum weight when measured weight exceeds threshold', () => {
      const result = PricingEngine.calculateBillableWeight(3.45, 1.0);
      expect(result.measuredWeightKg).toBe(3.45);
      expect(result.billableWeightKg).toBe(3.45);
      expect(result.minWeightApplied).toBe(false);
    });

    it('handles exact boundary weight correctly', () => {
      const result = PricingEngine.calculateBillableWeight(1.0, 1.0);
      expect(result.billableWeightKg).toBe(1.0);
      expect(result.minWeightApplied).toBe(false);
    });

    it('handles zero and negative measured weights defensively', () => {
      const zeroResult = PricingEngine.calculateBillableWeight(0, 1.5);
      expect(zeroResult.billableWeightKg).toBe(1.5);

      const negResult = PricingEngine.calculateBillableWeight(-2.5, 1.0);
      expect(negResult.measuredWeightKg).toBe(0);
      expect(negResult.billableWeightKg).toBe(1.0);
    });
  });

  describe('calculateSubtotal', () => {
    it('calculates standard per_kg pricing accurately in paise', () => {
      // 1 kg @ ₹79/kg (7900 paise) = 7900 paise (₹79.00)
      expect(PricingEngine.calculateSubtotal(1.0, 7900, 'per_kg')).toBe(7900);

      // 3.5 kg @ ₹79/kg = 27650 paise (₹276.50)
      expect(PricingEngine.calculateSubtotal(3.5, 7900, 'per_kg')).toBe(27650);

      // 2.25 kg @ ₹79/kg = 17775 paise (₹177.75)
      expect(PricingEngine.calculateSubtotal(2.25, 7900, 'per_kg')).toBe(17775);
    });

    it('calculates per_piece pricing by rounding units to nearest integer', () => {
      expect(PricingEngine.calculateSubtotal(5.0, 2500, 'per_piece')).toBe(12500);
      expect(PricingEngine.calculateSubtotal(4.8, 2500, 'per_piece')).toBe(12500);
    });

    it('calculates per_load pricing with minimum 1 load', () => {
      expect(PricingEngine.calculateSubtotal(0, 15000, 'per_load')).toBe(15000);
      expect(PricingEngine.calculateSubtotal(2.0, 15000, 'per_load')).toBe(30000);
    });

    it('calculates per_order flat pricing regardless of weight', () => {
      expect(PricingEngine.calculateSubtotal(10.0, 4900, 'per_order')).toBe(4900);
    });
  });

  describe('calculateOrderPricing', () => {
    it('computes full invoice for standard 1 kg launch booking (₹79/kg)', () => {
      const result = PricingEngine.calculateOrderPricing({
        measuredWeightKg: 0.8,
        unitPricePaise: 7900,
        minWeightKg: 1.0,
        pricingUnit: 'per_kg',
        deliveryChargePaise: 0,
        discountPaise: 0
      });

      expect(result.billableWeightKg).toBe(1.0);
      expect(result.minWeightApplied).toBe(true);
      expect(result.subtotalPaise).toBe(7900);
      expect(result.discountPaise).toBe(0);
      expect(result.deliveryChargePaise).toBe(0);
      expect(result.totalAmountPaise).toBe(7900);
    });

    it('correctly deducts coupon discount without exceeding subtotal', () => {
      const result = PricingEngine.calculateOrderPricing({
        measuredWeightKg: 2.0,
        unitPricePaise: 7900, // Subtotal = 15800 paise
        minWeightKg: 1.0,
        discountPaise: 20000 // Excess discount of ₹200 on ₹158 subtotal
      });

      expect(result.subtotalPaise).toBe(15800);
      expect(result.discountPaise).toBe(15800); // Capped to subtotal
      expect(result.totalAmountPaise).toBe(0);
    });

    it('correctly includes delivery charges', () => {
      const result = PricingEngine.calculateOrderPricing({
        measuredWeightKg: 2.0,
        unitPricePaise: 7900,
        deliveryChargePaise: 5000,
        discountPaise: 3000
      });

      // Subtotal (15800) - Discount (3000) + Delivery (5000) = 17800
      expect(result.subtotalPaise).toBe(15800);
      expect(result.totalAmountPaise).toBe(17800);
    });
  });

  describe('Option A Coupon Evaluation', () => {
    it('denies coupon when actual measured subtotal is below minimum order threshold', () => {
      const coupon = {
        code: 'SUPER25',
        discount_type: 'percentage' as const,
        discount_value: 25,
        min_order_paise: 25000 // ₹250 threshold
      };

      // 2 kg @ ₹79/kg = ₹158 (15800 paise) -> Below ₹250
      const evaluation = PricingEngine.evaluateCouponDiscount(coupon, 15800);
      expect(evaluation.isEligible).toBe(false);
      expect(evaluation.discountPaise).toBe(0);
      expect(evaluation.shortfallPaise).toBe(9200);
      expect(evaluation.reason).toContain('Minimum order subtotal of ₹250 required');
    });

    it('awards percentage coupon discount with cap when actual subtotal meets threshold', () => {
      const coupon = {
        code: 'SUPER25',
        discount_type: 'percentage' as const,
        discount_value: 25,
        min_order_paise: 25000, // ₹250 threshold
        max_discount_paise: 6000 // Max ₹60 cap
      };

      // 4 kg @ ₹79/kg = ₹316 (31600 paise) -> Meets ₹250 threshold
      // 25% of 31600 = 7900 paise -> Capped at 6000 paise (₹60)
      const evaluation = PricingEngine.evaluateCouponDiscount(coupon, 31600);
      expect(evaluation.isEligible).toBe(true);
      expect(evaluation.discountPaise).toBe(6000);
    });

    it('rejects coupon when order service is not in applicable services', () => {
      const coupon = {
        code: 'IRONONLY',
        discount_type: 'fixed' as const,
        discount_value: 5000,
        applicable_service_ids: ['service-iron-uuid']
      };

      const evaluation = PricingEngine.evaluateCouponDiscount(coupon, 20000, 'service-wash-uuid');
      expect(evaluation.isEligible).toBe(false);
      expect(evaluation.discountPaise).toBe(0);
      expect(evaluation.reason).toContain('not valid for this service');
    });
  });

  describe('Advance Payment Evaluation', () => {
    const baseSettings: BusinessSettings = {
      business_name: 'SuperWash Exprez',
      business_phone: '+91 98765 43210',
      business_address: 'Bangalore',
      price_per_kg_paise: 7900,
      min_weight_kg: 1.0,
      delivery_charge_paise: 0,
      upi_id: 'superwash@upi',
      allow_delivery_payment_recording: true,
      whatsapp_enabled: false
    };

    it('returns zero advance when advance payment is disabled', () => {
      const result = PricingEngine.evaluateAdvanceRequirement(30000, {
        ...baseSettings,
        advance_payment_enabled: false
      });
      expect(result.advanceRequiredPaise).toBe(0);
      expect(result.advanceType).toBe('none');
    });

    it('computes fixed advance payment correctly', () => {
      const result = PricingEngine.evaluateAdvanceRequirement(30000, {
        ...baseSettings,
        advance_payment_enabled: true,
        advance_payment_type: 'fixed',
        advance_payment_amount_paise: 5000 // ₹50
      });
      expect(result.advanceRequiredPaise).toBe(5000);
      expect(result.advanceType).toBe('fixed');
    });

    it('computes percentage advance payment correctly', () => {
      const result = PricingEngine.evaluateAdvanceRequirement(30000, { // ₹300 subtotal
        ...baseSettings,
        advance_payment_enabled: true,
        advance_payment_type: 'percentage',
        advance_payment_percentage: 20 // 20%
      });
      // 20% of 30000 = 6000 paise (₹60)
      expect(result.advanceRequiredPaise).toBe(6000);
      expect(result.advanceType).toBe('percentage');
    });
  });

  describe('Payment Ledger Accounting', () => {
    it('accurately credits advance payments against the final invoice balance', () => {
      const payments: Payment[] = [
        {
          id: 'pay-1',
          order_id: 'order-1',
          amount_paise: 5000, // ₹50 advance
          payment_method: 'upi_manual',
          payment_type: 'advance',
          created_at: new Date().toISOString()
        }
      ];

      // Final invoice: ₹250 (25000 paise)
      const ledger = PricingEngine.calculatePaymentLedger(25000, payments);
      expect(ledger.totalPayablePaise).toBe(25000);
      expect(ledger.advancePaidPaise).toBe(5000);
      expect(ledger.totalPaidPaise).toBe(5000);
      expect(ledger.balanceDuePaise).toBe(20000); // Remaining due = ₹200
      expect(ledger.paymentStatus).toBe('partially_paid');
      expect(ledger.isFullySettled).toBe(false);
    });

    it('settles fully when remaining balance is collected via COD at delivery', () => {
      const payments: Payment[] = [
        {
          id: 'pay-1',
          order_id: 'order-1',
          amount_paise: 5000,
          payment_method: 'upi_manual',
          payment_type: 'advance',
          created_at: new Date().toISOString()
        },
        {
          id: 'pay-2',
          order_id: 'order-1',
          amount_paise: 20000,
          payment_method: 'cash',
          payment_type: 'balance',
          created_at: new Date().toISOString()
        }
      ];

      const ledger = PricingEngine.calculatePaymentLedger(25000, payments);
      expect(ledger.totalPaidPaise).toBe(25000);
      expect(ledger.balanceDuePaise).toBe(0);
      expect(ledger.paymentStatus).toBe('paid');
      expect(ledger.isFullySettled).toBe(true);
    });
  });

  describe('Business Restrictions & Minimums', () => {
    const baseSettings: BusinessSettings = {
      business_name: 'SuperWash Exprez',
      business_phone: '+91 98765 43210',
      business_address: 'Bangalore',
      price_per_kg_paise: 7900,
      min_weight_kg: 1.0,
      delivery_charge_paise: 0,
      upi_id: 'superwash@upi',
      allow_delivery_payment_recording: true,
      whatsapp_enabled: false
    };

    it('validates minimum order spend restriction when enabled', () => {
      const settingsWithMinSpend: BusinessSettings = {
        ...baseSettings,
        min_order_spend_enabled: true,
        min_order_spend_paise: 30000 // ₹300 min spend
      };

      // ₹150 subtotal fails restriction
      const failCheck = PricingEngine.validateRestrictions(15000, 2.0, settingsWithMinSpend);
      expect(failCheck.isAllowed).toBe(false);
      expect(failCheck.violationReason).toContain('below the store minimum spend restriction of ₹300');

      // ₹350 subtotal passes restriction
      const passCheck = PricingEngine.validateRestrictions(35000, 4.5, settingsWithMinSpend);
      expect(passCheck.isAllowed).toBe(true);
    });

    it('permits any spend when minimum order spend is disabled', () => {
      const settingsDisabled: BusinessSettings = {
        ...baseSettings,
        min_order_spend_enabled: false,
        min_order_spend_paise: 30000
      };

      const check = PricingEngine.validateRestrictions(7900, 1.0, settingsDisabled);
      expect(check.isAllowed).toBe(true);
    });
  });
});

