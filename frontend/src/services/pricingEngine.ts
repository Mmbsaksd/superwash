/**
 * SuperWash Exprez — Configurable Pricing Engine
 * 
 * Production-ready, purely deterministic financial calculation engine.
 * Adheres strictly to the following architectural invariants:
 * 1. Zero hardcoded business prices/minimums (derives from database configuration).
 * 2. Strict integer-paise precision (prevents floating-point financial drift).
 * 3. Option A coupon mechanics (evaluates against actual measured bill).
 * 4. Advances are true payments crediting toward the final invoice balance.
 */

import type { BusinessSettings, Payment, PaymentStatus } from '../types';

export interface OrderPricingInput {
  measuredWeightKg: number;
  unitPricePaise: number;
  minWeightKg?: number;
  pricingUnit?: string; // 'per_kg' | 'per_piece' | 'per_load' | 'per_order'
  deliveryChargePaise?: number;
  discountPaise?: number;
}

export interface OrderPricingResult {
  measuredWeightKg: number;
  billableWeightKg: number;
  minWeightApplied: boolean;
  unitPricePaise: number;
  subtotalPaise: number;
  discountPaise: number;
  deliveryChargePaise: number;
  totalAmountPaise: number;
}

export interface CouponDiscountRules {
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number; // Percentage (e.g. 25) or Fixed Paise (e.g. 5000)
  min_order_paise?: number;
  max_discount_paise?: number | null;
  applicable_service_ids?: string[] | null;
}

export interface CouponEvaluationResult {
  isEligible: boolean;
  discountPaise: number;
  reason?: string;
  shortfallPaise?: number;
}

export interface AdvanceRequirementResult {
  advanceRequiredPaise: number;
  advanceType: 'fixed' | 'percentage' | 'none';
  ruleDescription: string;
}

export interface PaymentLedgerSummary {
  totalPayablePaise: number;
  advancePaidPaise: number;
  subsequentPaidPaise: number;
  totalPaidPaise: number;
  balanceDuePaise: number;
  paymentStatus: PaymentStatus;
  isFullySettled: boolean;
}

export class PricingEngine {
  /**
   * Calculates billable weight given a measured weight and an optional minimum weight threshold.
   * Handles scale boundaries and negative inputs defensively.
   */
  static calculateBillableWeight(
    measuredWeightKg: number,
    minWeightKg: number = 0
  ): {
    measuredWeightKg: number;
    billableWeightKg: number;
    minWeightApplied: boolean;
  } {
    const safeMeasured = Math.max(0, measuredWeightKg);
    const safeMin = Math.max(0, minWeightKg);
    const minWeightApplied = safeMeasured < safeMin && safeMin > 0;
    const billableWeightKg = Math.max(safeMeasured, safeMin);

    return {
      measuredWeightKg: safeMeasured,
      billableWeightKg: Number(billableWeightKg.toFixed(2)),
      minWeightApplied
    };
  }

  /**
   * Calculates subtotal in paise based on pricing unit and billable weight.
   */
  static calculateSubtotal(
    billableWeightKg: number,
    unitPricePaise: number,
    pricingUnit: string = 'per_kg'
  ): number {
    const safeUnitPrice = Math.max(0, unitPricePaise);
    const safeUnits = Math.max(0, billableWeightKg);

    switch (pricingUnit) {
      case 'per_piece':
      case 'per_item':
        return Math.round(Math.round(safeUnits) * safeUnitPrice);
      case 'per_load':
        return Math.round(Math.max(1, Math.round(safeUnits || 1)) * safeUnitPrice);
      case 'per_order':
        return safeUnitPrice;
      case 'per_kg':
      default:
        return Math.round(safeUnits * safeUnitPrice);
    }
  }

  /**
   * Authoritative order pricing calculation.
   * Total = Subtotal - Discount + Delivery Fee.
   * Invariant: Total is never negative; Discount never exceeds subtotal.
   */
  static calculateOrderPricing(input: OrderPricingInput): OrderPricingResult {
    const {
      measuredWeightKg,
      unitPricePaise,
      minWeightKg = 0,
      pricingUnit = 'per_kg',
      deliveryChargePaise = 0,
      discountPaise = 0
    } = input;

    const { billableWeightKg, minWeightApplied } = this.calculateBillableWeight(
      measuredWeightKg,
      minWeightKg
    );

    const subtotalPaise = this.calculateSubtotal(billableWeightKg, unitPricePaise, pricingUnit);
    const effectiveDiscount = Math.max(0, Math.min(discountPaise, subtotalPaise));
    const effectiveDelivery = Math.max(0, deliveryChargePaise);
    const totalAmountPaise = Math.max(0, subtotalPaise - effectiveDiscount + effectiveDelivery);

    return {
      measuredWeightKg: Math.max(0, measuredWeightKg),
      billableWeightKg,
      minWeightApplied,
      unitPricePaise: Math.max(0, unitPricePaise),
      subtotalPaise,
      discountPaise: effectiveDiscount,
      deliveryChargePaise: effectiveDelivery,
      totalAmountPaise
    };
  }

  /**
   * Evaluates coupon eligibility and calculates final discount under Option A.
   * Under Option A, the coupon's min_order_paise is evaluated strictly against the actual measured subtotal.
   */
  static evaluateCouponDiscount(
    coupon: CouponDiscountRules,
    actualSubtotalPaise: number,
    serviceId?: string
  ): CouponEvaluationResult {
    if (coupon.applicable_service_ids && coupon.applicable_service_ids.length > 0 && serviceId) {
      if (!coupon.applicable_service_ids.includes(serviceId)) {
        return {
          isEligible: false,
          discountPaise: 0,
          reason: `Coupon "${coupon.code}" is not valid for this service.`
        };
      }
    }

    const minRequired = coupon.min_order_paise || 0;
    if (minRequired > 0 && actualSubtotalPaise < minRequired) {
      const shortfallPaise = minRequired - actualSubtotalPaise;
      const minRs = (minRequired / 100).toFixed(0);
      return {
        isEligible: false,
        discountPaise: 0,
        shortfallPaise,
        reason: `Minimum order subtotal of ₹${minRs} required for coupon "${coupon.code}".`
      };
    }

    let calculatedDiscount = 0;
    if (coupon.discount_type === 'percentage') {
      const rawDiscount = Math.round((actualSubtotalPaise * coupon.discount_value) / 100);
      calculatedDiscount = coupon.max_discount_paise
        ? Math.min(rawDiscount, coupon.max_discount_paise)
        : rawDiscount;
    } else {
      calculatedDiscount = coupon.discount_value;
    }

    const finalDiscount = Math.max(0, Math.min(calculatedDiscount, actualSubtotalPaise));

    return {
      isEligible: true,
      discountPaise: finalDiscount
    };
  }

  /**
   * Evaluates whether an advance payment is required for an order, and calculates the amount.
   */
  static evaluateAdvanceRequirement(
    subtotalPaise: number,
    settings: BusinessSettings
  ): AdvanceRequirementResult {
    if (!settings.advance_payment_enabled) {
      return {
        advanceRequiredPaise: 0,
        advanceType: 'none',
        ruleDescription: 'Advance payments are currently disabled.'
      };
    }

    if (settings.advance_payment_type === 'percentage') {
      const pct = Math.max(0, Math.min(100, settings.advance_payment_percentage || 0));
      const required = Math.round((subtotalPaise * pct) / 100);
      return {
        advanceRequiredPaise: required,
        advanceType: 'percentage',
        ruleDescription: `${pct}% advance payment required (₹${(required / 100).toFixed(2)})`
      };
    }

    const fixedAmount = Math.max(0, settings.advance_payment_amount_paise || 0);
    const required = Math.min(fixedAmount, subtotalPaise);
    return {
      advanceRequiredPaise: required,
      advanceType: 'fixed',
      ruleDescription: `Flat advance payment of ₹${(required / 100).toFixed(2)} required`
    };
  }

  /**
   * Calculates comprehensive payment ledger summary.
   * Invariant: Balance Due = Total Payable - (Advance Paid + Subsequent Payments).
   */
  static calculatePaymentLedger(
    totalPayablePaise: number,
    payments: Payment[] = []
  ): PaymentLedgerSummary {
    const safePayable = Math.max(0, totalPayablePaise);

    let advancePaidPaise = 0;
    let subsequentPaidPaise = 0;

    for (const payment of payments) {
      const amt = Math.max(0, payment.amount_paise || 0);
      if (payment.payment_type === 'advance') {
        advancePaidPaise += amt;
      } else {
        subsequentPaidPaise += amt;
      }
    }

    const totalPaidPaise = advancePaidPaise + subsequentPaidPaise;
    const balanceDuePaise = Math.max(0, safePayable - totalPaidPaise);

    let paymentStatus: PaymentStatus = 'pending';
    if (safePayable > 0 && totalPaidPaise >= safePayable) {
      paymentStatus = 'paid';
    } else if (totalPaidPaise > 0) {
      paymentStatus = 'partially_paid';
    }

    return {
      totalPayablePaise: safePayable,
      advancePaidPaise,
      subsequentPaidPaise,
      totalPaidPaise,
      balanceDuePaise,
      paymentStatus,
      isFullySettled: totalPaidPaise >= safePayable && safePayable > 0
    };
  }

  /**
   * Validates independent business restrictions (minimum order spend, minimum weight).
   */
  static validateRestrictions(
    subtotalPaise: number,
    weightKg: number,
    settings: BusinessSettings
  ): { isAllowed: boolean; violationReason?: string } {
    if (settings.min_weight_restriction_enabled && settings.min_weight_restriction_grams) {
      const minWeightKg = settings.min_weight_restriction_grams / 1000.0;
      if (weightKg < minWeightKg) {
        return {
          isAllowed: false,
          violationReason: `Order weight (${weightKg.toFixed(2)} kg) is below minimum restriction threshold of ${minWeightKg.toFixed(2)} kg.`
        };
      }
    }

    if (settings.min_order_spend_enabled && settings.min_order_spend_paise) {
      if (subtotalPaise < settings.min_order_spend_paise) {
        const minRs = (settings.min_order_spend_paise / 100).toFixed(0);
        return {
          isAllowed: false,
          violationReason: `Order subtotal (₹${(subtotalPaise / 100).toFixed(2)}) is below the store minimum spend restriction of ₹${minRs}.`
        };
      }
    }

    return { isAllowed: true };
  }
}

