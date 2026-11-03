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

export interface MultiServiceItemInput {
  id?: string;
  service_id?: string;
  service_name?: string;
  pricing_unit: string;
  unit_price_paise: number;
  measured_weight: number;
  min_weight_kg?: number;
}

export interface MultiServiceCalculatedItem {
  id?: string;
  service_id?: string;
  service_name?: string;
  pricing_unit: string;
  unit_price_paise: number;
  measured_weight: number;
  billable_weight: number;
  line_total_paise: number;
  is_min_applied: boolean;
}

export interface MultiServicePricingResult {
  totalMeasuredWeightKg: number;
  totalBillableWeightKg: number;
  minWeightApplied: boolean;
  subtotalPaise: number;
  discountPaise: number;
  deliveryChargePaise: number;
  totalAmountPaise: number;
  items: MultiServiceCalculatedItem[];
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
   * Calculates service-wise multi-service pricing using the confirmed business rule:
   * 1. 1.00 kg minimum billable weight applies per complete customer order (not per service).
   * 2. For multiple weight-based services totaling < orderMinWeightKg, the minimum is allocated
   *    proportionally to each service's actual measured scale weight.
   * 3. Non-weight-based services (per_piece, per_load, per_order) are excluded from the weight calculation
   *    and 1 kg minimum order uplift.
   * 4. Actual scale readings remain unchanged in measured_weight.
   * 5. Uses largest-remainder distribution to guarantee exact 2-decimal sum equals orderMinWeightKg.
   */
  static calculateMultiServicePricing(
    items: MultiServiceItemInput[],
    orderMinWeightKg: number = 1.00,
    deliveryChargePaise: number = 0,
    discountPaise: number = 0,
    couponRules?: CouponDiscountRules
  ): MultiServicePricingResult {
    const safeMinWeight = Math.max(0, orderMinWeightKg);

    // 1. Separate weight-based items from non-weight-based items
    const weightItems = items.filter(
      (it) => (it.pricing_unit || 'per_kg') === 'per_kg'
    );
    const nonWeightItems = items.filter(
      (it) => (it.pricing_unit || 'per_kg') !== 'per_kg'
    );

    // 2. Sum actual measured scale readings for weight-based services
    const totalMeasuredWeightKg = weightItems.reduce(
      (sum, it) => sum + Math.max(0, it.measured_weight || 0),
      0
    );

    const minWeightApplied =
      weightItems.length > 0 &&
      totalMeasuredWeightKg < safeMinWeight &&
      safeMinWeight > 0;
    const totalBillableWeightKg = minWeightApplied
      ? safeMinWeight
      : totalMeasuredWeightKg;

    // 3. Proportional allocation for weight-based services
    type InternalWeightAlloc = {
      item: MultiServiceItemInput;
      measured_weight: number;
      raw_billable: number;
      base_cents: number;
      fractional: number;
      final_billable: number;
      is_min_applied: boolean;
    };

    let weightAllocations: InternalWeightAlloc[] = [];

    if (minWeightApplied) {
      if (totalMeasuredWeightKg > 0) {
        // Raw proportional allocation
        const ratio = totalBillableWeightKg / totalMeasuredWeightKg;
        const rawList = weightItems.map((item) => {
          const m = Math.max(0, item.measured_weight || 0);
          const raw = m * ratio;
          const baseCents = Math.floor(raw * 100);
          const fractional = (raw * 100) - baseCents;
          return {
            item,
            measured_weight: m,
            raw_billable: raw,
            base_cents: baseCents,
            fractional,
            final_billable: 0,
            is_min_applied: true
          };
        });

        // Remainder distribution
        const totalBaseCents = rawList.reduce((acc, it) => acc + it.base_cents, 0);
        let remainderCents = Math.round(totalBillableWeightKg * 100) - totalBaseCents;

        const sortedIndices = rawList
          .map((it, idx) => ({ idx, fractional: it.fractional }))
          .sort((a, b) => b.fractional - a.fractional);

        for (let i = 0; i < sortedIndices.length && remainderCents > 0; i++) {
          rawList[sortedIndices[i].idx].base_cents += 1;
          remainderCents -= 1;
        }

        weightAllocations = rawList.map((it) => ({
          ...it,
          final_billable: it.base_cents / 100
        }));
      } else {
        const perItem = Math.floor((totalBillableWeightKg * 100) / weightItems.length);
        let rem = Math.round(totalBillableWeightKg * 100) - perItem * weightItems.length;
        weightAllocations = weightItems.map((item) => {
          const cents = perItem + (rem > 0 ? 1 : 0);
          if (rem > 0) rem--;
          return {
            item,
            measured_weight: 0,
            raw_billable: cents / 100,
            base_cents: cents,
            fractional: 0,
            final_billable: cents / 100,
            is_min_applied: true
          };
        });
      }
    } else {
      weightAllocations = weightItems.map((item) => {
        const m = Math.max(0, item.measured_weight || 0);
        return {
          item,
          measured_weight: m,
          raw_billable: m,
          base_cents: Math.round(m * 100),
          fractional: 0,
          final_billable: m,
          is_min_applied: false
        };
      });
    }

    // 4. Build calculated items
    const calculatedItems: MultiServiceCalculatedItem[] = [];
    let subtotalPaise = 0;

    for (const alloc of weightAllocations) {
      const linePaise = PricingEngine.calculateSubtotal(
        alloc.final_billable,
        alloc.item.unit_price_paise,
        alloc.item.pricing_unit
      );
      subtotalPaise += linePaise;

      calculatedItems.push({
        id: alloc.item.id,
        service_id: alloc.item.service_id,
        service_name: alloc.item.service_name,
        pricing_unit: alloc.item.pricing_unit || 'per_kg',
        unit_price_paise: alloc.item.unit_price_paise,
        measured_weight: Number(alloc.measured_weight.toFixed(2)),
        billable_weight: Number(alloc.final_billable.toFixed(2)),
        line_total_paise: linePaise,
        is_min_applied: alloc.is_min_applied
      });
    }

    for (const item of nonWeightItems) {
      const measured = Math.max(0, item.measured_weight || 0);
      const linePaise = PricingEngine.calculateSubtotal(
        measured,
        item.unit_price_paise,
        item.pricing_unit
      );
      subtotalPaise += linePaise;

      calculatedItems.push({
        id: item.id,
        service_id: item.service_id,
        service_name: item.service_name,
        pricing_unit: item.pricing_unit,
        unit_price_paise: item.unit_price_paise,
        measured_weight: Number(measured.toFixed(2)),
        billable_weight: Number(measured.toFixed(2)),
        line_total_paise: linePaise,
        is_min_applied: false
      });
    }

    const orderedItems = items.map((orig) => {
      return (
        calculatedItems.find(
          (c) => (orig.id && c.id === orig.id) || (orig.service_id && c.service_id === orig.service_id)
        ) || calculatedItems[0]
      );
    });

    // 5. Option A Coupon evaluation against cumulative subtotal
    let finalDiscountPaise = Math.max(0, discountPaise);
    if (couponRules) {
      const evalRes = PricingEngine.evaluateCouponDiscount(couponRules, subtotalPaise);
      finalDiscountPaise = evalRes.isEligible ? evalRes.discountPaise : 0;
    }
    finalDiscountPaise = Math.min(finalDiscountPaise, subtotalPaise);

    const effectiveDelivery = Math.max(0, deliveryChargePaise);
    const totalAmountPaise = Math.max(
      0,
      subtotalPaise - finalDiscountPaise + effectiveDelivery
    );

    return {
      totalMeasuredWeightKg: Number(totalMeasuredWeightKg.toFixed(2)),
      totalBillableWeightKg: Number(totalBillableWeightKg.toFixed(2)),
      minWeightApplied,
      subtotalPaise,
      discountPaise: finalDiscountPaise,
      deliveryChargePaise: effectiveDelivery,
      totalAmountPaise,
      items: orderedItems
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

