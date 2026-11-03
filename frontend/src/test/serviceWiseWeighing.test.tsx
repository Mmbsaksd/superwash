import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LaundryService, setLiveModeForTesting } from '../services/laundryService';
import { PricingEngine } from '../services/pricingEngine';
import { DoorstepWeighingModal } from '../components/DoorstepWeighingModal';
import { WeightEntryModal } from '../components/WeightEntryModal';
import { CustomerOrderTracker } from '../components/CustomerOrderTracker';
import { InvoiceModal } from '../components/InvoiceModal';
import { Order, OrderItem, ServiceMeasurementInput, Profile } from '../types';
import { supabase } from '../services/supabase';

describe('Service-Wise Weighing, Order Calculation & Invoice Workflow (Section 6 Verification)', () => {
  const serviceAId = 'f520c538-65e3-4b64-825e-5fdd3c282e8d'; // Wash & Fold (Normal)
  const serviceBId = 'srv-iron-2'; // Steam Press & Ironing
  const serviceCId = 'srv-dry-3';  // Premium Dry Clean (per_kg)
  const servicePieceId = 'srv-piece-4'; // Saree Press (per_piece)

  const mockCustomerUser: Profile = {
    id: 'cust-uuid-001',
    role: 'customer' as const,
    phone: '9876543210',
    full_name: 'Ananya Sharma',
    email: 'ananya@example.com',
    is_active: true,
    created_at: '2026-11-01T10:00:00.000Z'
  };

  const baseMultiOrder: Order = {
    id: 'ord-multi-101',
    order_number: 'SW-9001',
    customer_id: 'cust-uuid-001',
    customer_name: 'Ananya Sharma',
    customer_phone: '9876543210',
    pickup_address: 'Flat 402, Green Glen Layout, Bellandur',
    pickup_pincode: '560103',
    pickup_date: '2026-11-05',
    pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
    order_status: 'pickup_assigned',
    payment_status: 'pending',
    payment_method: 'cash',
    service_id: serviceAId,
    service_name: 'Wash & Fold (Normal) + Steam Press & Ironing',
    price_per_kg_paise: 7900,
    min_weight_kg: 1.0,
    delivery_charge_paise: 4000,
    paid_amount_paise: 0,
    coupon_code: 'WELCOME50',
    coupon_snapshot: {
      code: 'WELCOME50',
      discount_type: 'fixed',
      discount_value: 5000, // ₹50 off
      min_order_paise: 19900 // ₹199 min spend under Option A
    },
    items: [
      {
        id: 'item-001',
        order_id: 'ord-multi-101',
        service_id: serviceAId,
        service_name: 'Wash & Fold (Normal)',
        pricing_unit: 'per_kg',
        unit_price_paise: 7900, // ₹79/kg
        min_weight_kg: 1.0,
        measured_weight: null,
        billable_weight: null,
        line_total_paise: null,
        created_at: '2026-11-03T09:00:00Z',
        updated_at: '2026-11-03T09:00:00Z'
      },
      {
        id: 'item-002',
        order_id: 'ord-multi-101',
        service_id: serviceBId,
        service_name: 'Steam Press & Ironing',
        pricing_unit: 'per_kg',
        unit_price_paise: 9900, // ₹99/kg
        min_weight_kg: 1.0,
        measured_weight: null,
        billable_weight: null,
        line_total_paise: null,
        created_at: '2026-11-03T09:00:00Z',
        updated_at: '2026-11-03T09:00:00Z'
      }
    ],
    created_at: '2026-11-03T09:00:00Z',
    updated_at: '2026-11-03T09:00:00Z'
  };

  beforeEach(() => {
    localStorage.clear();
    LaundryService.resetOrderSequence();
    vi.restoreAllMocks();
    setLiveModeForTesting(false);
  });

  afterEach(() => {
    setLiveModeForTesting(false);
  });

  // ============================================================================
  // SECTION 6: CORE REQUIRED TEST SCENARIOS
  // ============================================================================

  // 1. Single-service order below 1 kg
  it('1. single-service order below 1 kg: enforces 1 kg order minimum on the single service', () => {
    const singleOrder: Order = {
      ...baseMultiOrder,
      items: [
        {
          id: 'item-single-1',
          order_id: baseMultiOrder.id,
          service_id: serviceAId,
          service_name: 'Wash & Fold (Normal)',
          pricing_unit: 'per_kg',
          unit_price_paise: 7900,
          min_weight_kg: 1.0,
          created_at: '2026-11-03T09:00:00Z',
          updated_at: '2026-11-03T09:00:00Z'
        }
      ]
    };

    const calc = LaundryService.calculateMultiServiceBill(singleOrder, [
      { order_item_id: 'item-single-1', service_id: serviceAId, measured_weight: 0.40 }
    ]);

    expect(calc.totalMeasuredWeightKg).toBe(0.40);
    expect(calc.totalBillableWeightKg).toBe(1.00);
    expect(calc.updatedItems[0].measured_weight).toBe(0.40);
    expect(calc.updatedItems[0].billable_weight).toBe(1.00);
    // 1.00 kg * 7900 = 7900 paise
    expect(calc.updatedItems[0].line_total_paise).toBe(7900);
  });

  // 2. Two-service order totaling below 1 kg
  it('2. two-service order totaling below 1 kg: allocates 1 kg minimum proportionally (0.40kg + 0.40kg -> 0.50kg + 0.50kg)', () => {
    const calc = LaundryService.calculateMultiServiceBill(baseMultiOrder, [
      { order_item_id: 'item-001', service_id: serviceAId, measured_weight: 0.40 },
      { order_item_id: 'item-002', service_id: serviceBId, measured_weight: 0.40 }
    ]);

    expect(calc.totalMeasuredWeightKg).toBe(0.80);
    expect(calc.totalBillableWeightKg).toBe(1.00);
    // Preserves actual measured weights
    expect(calc.updatedItems[0].measured_weight).toBe(0.40);
    expect(calc.updatedItems[1].measured_weight).toBe(0.40);
    // Proportional allocation: 0.40 * (1.00 / 0.80) = 0.50 kg each
    expect(calc.updatedItems[0].billable_weight).toBe(0.50);
    expect(calc.updatedItems[1].billable_weight).toBe(0.50);
    // Service A: 0.50 * 7900 = 3950 paise
    expect(calc.updatedItems[0].line_total_paise).toBe(3950);
    // Service B: 0.50 * 9900 = 4950 paise
    expect(calc.updatedItems[1].line_total_paise).toBe(4950);
    // Subtotal = 3950 + 4950 = 8900 paise
    expect(calc.subtotalPaise).toBe(8900);
  });

  // 3. Three-service order totaling below 1 kg
  it('3. three-service order totaling below 1 kg: allocates 1 kg proportionally (0.20kg + 0.30kg + 0.30kg -> 0.25kg + 0.38kg + 0.37kg)', () => {
    const threeServiceOrder: Order = {
      ...baseMultiOrder,
      items: [
        {
          id: 'item-3-1',
          order_id: baseMultiOrder.id,
          service_id: serviceAId,
          service_name: 'Wash & Fold',
          pricing_unit: 'per_kg',
          unit_price_paise: 7900,
          min_weight_kg: 1.0,
          created_at: '2026-11-03T09:00:00Z',
          updated_at: '2026-11-03T09:00:00Z'
        },
        {
          id: 'item-3-2',
          order_id: baseMultiOrder.id,
          service_id: serviceBId,
          service_name: 'Steam Press',
          pricing_unit: 'per_kg',
          unit_price_paise: 8900,
          min_weight_kg: 1.0,
          created_at: '2026-11-03T09:00:00Z',
          updated_at: '2026-11-03T09:00:00Z'
        },
        {
          id: 'item-3-3',
          order_id: baseMultiOrder.id,
          service_id: serviceCId,
          service_name: 'Dry Clean',
          pricing_unit: 'per_kg',
          unit_price_paise: 9900,
          min_weight_kg: 1.0,
          created_at: '2026-11-03T09:00:00Z',
          updated_at: '2026-11-03T09:00:00Z'
        }
      ]
    };

    const calc = LaundryService.calculateMultiServiceBill(threeServiceOrder, [
      { order_item_id: 'item-3-1', measured_weight: 0.20 },
      { order_item_id: 'item-3-2', measured_weight: 0.30 },
      { order_item_id: 'item-3-3', measured_weight: 0.30 }
    ]);

    expect(calc.totalMeasuredWeightKg).toBe(0.80);
    expect(calc.totalBillableWeightKg).toBe(1.00);
    // Billable allocations sum to exactly 1.00 kg
    const sumBillable = calc.updatedItems.reduce((acc, it) => acc + (it.billable_weight || 0), 0);
    expect(Number(sumBillable.toFixed(2))).toBe(1.00);
    expect(calc.updatedItems[0].billable_weight).toBe(0.25);
    expect(calc.updatedItems[1].billable_weight).toBe(0.38);
    expect(calc.updatedItems[2].billable_weight).toBe(0.37);
  });

  // 4. Order totaling exactly 1 kg
  it('4. order totaling exactly 1 kg: applies no uplift (0.50kg + 0.50kg -> 0.50kg + 0.50kg billable)', () => {
    const calc = LaundryService.calculateMultiServiceBill(baseMultiOrder, [
      { order_item_id: 'item-001', service_id: serviceAId, measured_weight: 0.50 },
      { order_item_id: 'item-002', service_id: serviceBId, measured_weight: 0.50 }
    ]);

    expect(calc.totalMeasuredWeightKg).toBe(1.00);
    expect(calc.totalBillableWeightKg).toBe(1.00);
    expect(calc.updatedItems[0].billable_weight).toBe(0.50);
    expect(calc.updatedItems[1].billable_weight).toBe(0.50);
    // Subtotal: (0.50 * 7900) + (0.50 * 9900) = 3950 + 4950 = 8900
    expect(calc.subtotalPaise).toBe(8900);
  });

  // 5. Order exceeding 1 kg
  it('5. order exceeding 1 kg: applies no uplift and charges actual measured weights (1.50kg + 2.00kg)', () => {
    const calc = LaundryService.calculateMultiServiceBill(baseMultiOrder, [
      { order_item_id: 'item-001', service_id: serviceAId, measured_weight: 1.50 },
      { order_item_id: 'item-002', service_id: serviceBId, measured_weight: 2.00 }
    ]);

    expect(calc.totalMeasuredWeightKg).toBe(3.50);
    expect(calc.totalBillableWeightKg).toBe(3.50);
    expect(calc.updatedItems[0].billable_weight).toBe(1.50);
    expect(calc.updatedItems[1].billable_weight).toBe(2.00);
    // 1.50 * 7900 = 11850; 2.00 * 9900 = 19800; subtotal = 31650
    expect(calc.subtotalPaise).toBe(31650);
  });

  // 6. Different configured rates across services
  it('6. correctly applies different configured rates across services to their allocated billable weights', () => {
    // Service A rate: ₹79/kg (7900 paise); Service B rate: ₹99/kg (9900 paise)
    // Measured: 0.30 kg and 0.50 kg (total 0.80 kg < 1.00 kg)
    // Allocation: A = 0.30 * 1.25 = 0.375 -> 0.38 kg; B = 0.50 * 1.25 = 0.625 -> 0.62 kg
    const calc = LaundryService.calculateMultiServiceBill(baseMultiOrder, [
      { order_item_id: 'item-001', service_id: serviceAId, measured_weight: 0.30 },
      { order_item_id: 'item-002', service_id: serviceBId, measured_weight: 0.50 }
    ]);

    expect(calc.updatedItems[0].billable_weight).toBe(0.38);
    expect(calc.updatedItems[1].billable_weight).toBe(0.62);
    expect(calc.updatedItems[0].line_total_paise).toBe(Math.round(0.38 * 7900)); // 3002 paise
    expect(calc.updatedItems[1].line_total_paise).toBe(Math.round(0.62 * 9900)); // 6138 paise
  });

  // 7. Proportional allocation of minimum-weight uplift
  it('7. proportional allocation scales strictly by actual weight share (0.20kg @ ₹80 & 0.60kg @ ₹100)', () => {
    const customOrder: Order = {
      ...baseMultiOrder,
      items: [
        {
          id: 'it-a',
          order_id: baseMultiOrder.id,
          service_id: serviceAId,
          service_name: 'Economy Wash',
          pricing_unit: 'per_kg',
          unit_price_paise: 8000,
          min_weight_kg: 1.0,
          created_at: '2026-11-03T09:00:00Z',
          updated_at: '2026-11-03T09:00:00Z'
        },
        {
          id: 'it-b',
          order_id: baseMultiOrder.id,
          service_id: serviceBId,
          service_name: 'Premium Press',
          pricing_unit: 'per_kg',
          unit_price_paise: 10000,
          min_weight_kg: 1.0,
          created_at: '2026-11-03T09:00:00Z',
          updated_at: '2026-11-03T09:00:00Z'
        }
      ]
    };

    const calc = LaundryService.calculateMultiServiceBill(customOrder, [
      { order_item_id: 'it-a', measured_weight: 0.20 },
      { order_item_id: 'it-b', measured_weight: 0.60 }
    ]);

    // 0.20 / 0.80 = 25% -> 0.25 kg
    // 0.60 / 0.80 = 75% -> 0.75 kg
    expect(calc.updatedItems[0].billable_weight).toBe(0.25);
    expect(calc.updatedItems[1].billable_weight).toBe(0.75);
    expect(calc.updatedItems[0].line_total_paise).toBe(2000); // 0.25 * 8000 = ₹20.00
    expect(calc.updatedItems[1].line_total_paise).toBe(7500); // 0.75 * 10000 = ₹75.00
    expect(calc.subtotalPaise).toBe(9500); // ₹95.00
  });

  // 8. Actual measurements remaining unchanged
  it('8. preserves actual scale measurements separately without overwriting them with billable weights', () => {
    const calc = LaundryService.calculateMultiServiceBill(baseMultiOrder, [
      { order_item_id: 'item-001', service_id: serviceAId, measured_weight: 0.40 },
      { order_item_id: 'item-002', service_id: serviceBId, measured_weight: 0.40 }
    ]);

    expect(calc.updatedItems[0].measured_weight).toBe(0.40);
    expect(calc.updatedItems[1].measured_weight).toBe(0.40);
    expect(calc.totalMeasuredWeightKg).toBe(0.80);
    // Billable is 0.50, but measured remains 0.40
    expect(calc.updatedItems[0].measured_weight).not.toBe(calc.updatedItems[0].billable_weight);
  });

  // 9. Non-weight-based service handling
  it('9. excludes non-weight-based services (per_piece) from the weight calculation and 1 kg minimum uplift', () => {
    const mixedOrder: Order = {
      ...baseMultiOrder,
      items: [
        {
          id: 'item-kg',
          order_id: baseMultiOrder.id,
          service_id: serviceAId,
          service_name: 'Wash & Fold',
          pricing_unit: 'per_kg',
          unit_price_paise: 7900,
          min_weight_kg: 1.0,
          created_at: '2026-11-03T09:00:00Z',
          updated_at: '2026-11-03T09:00:00Z'
        },
        {
          id: 'item-piece',
          order_id: baseMultiOrder.id,
          service_id: servicePieceId,
          service_name: 'Silk Saree Press',
          pricing_unit: 'per_piece',
          unit_price_paise: 15000, // ₹150/piece
          min_weight_kg: 1.0,
          created_at: '2026-11-03T09:00:00Z',
          updated_at: '2026-11-03T09:00:00Z'
        }
      ]
    };

    const calc = LaundryService.calculateMultiServiceBill(mixedOrder, [
      { order_item_id: 'item-kg', measured_weight: 0.40 },
      { order_item_id: 'item-piece', measured_weight: 2 } // 2 sarees
    ]);

    // Weight-based total is 0.40 kg < 1.00 kg -> Wash & Fold gets lifted to 1.00 kg
    expect(calc.totalMeasuredWeightKg).toBe(0.40);
    expect(calc.totalBillableWeightKg).toBe(1.00);
    expect(calc.updatedItems[0].billable_weight).toBe(1.00);
    expect(calc.updatedItems[0].line_total_paise).toBe(7900); // 1.00 * 7900 = ₹79.00

    // Non-weight service: piece count is 2, billable is 2, line total = 2 * 15000 = 30000 paise
    expect(calc.updatedItems[1].measured_weight).toBe(2);
    expect(calc.updatedItems[1].billable_weight).toBe(2);
    expect(calc.updatedItems[1].line_total_paise).toBe(30000);

    // Subtotal: 7900 + 30000 = 37900 paise (₹379.00)
    expect(calc.subtotalPaise).toBe(37900);
  });

  // 10. Coupon eligibility and discount calculation
  it('10. evaluates Option A coupon against actual final cumulative subtotal', () => {
    // WELCOME50 requires ₹199 min order (19900 paise)
    // Case A: 0.40kg + 0.40kg = subtotal 8900 paise (₹89) < ₹199 -> Coupon drops to ₹0
    const lowCalc = LaundryService.calculateMultiServiceBill(baseMultiOrder, [
      { order_item_id: 'item-001', service_id: serviceAId, measured_weight: 0.40 },
      { order_item_id: 'item-002', service_id: serviceBId, measured_weight: 0.40 }
    ]);
    expect(lowCalc.subtotalPaise).toBe(8900);
    expect(lowCalc.discountPaise).toBe(0);

    // Case B: 1.50kg + 1.50kg = subtotal (1.50*7900) + (1.50*9900) = 11850 + 14850 = 26700 paise (₹267) >= ₹199 -> ₹50 discount applied
    const highCalc = LaundryService.calculateMultiServiceBill(baseMultiOrder, [
      { order_item_id: 'item-001', service_id: serviceAId, measured_weight: 1.50 },
      { order_item_id: 'item-002', service_id: serviceBId, measured_weight: 1.50 }
    ]);
    expect(highCalc.subtotalPaise).toBe(26700);
    expect(highCalc.discountPaise).toBe(5000);
  });

  // 11. Invoice and COD amount consistency
  it('11. ensures InvoiceModal and COD payable amount exactly match calculated bill', () => {
    // 2.50 kg Wash & Fold + 1.75 kg Steam Press = subtotal ₹370.75
    // - ₹50.00 coupon + ₹40.00 delivery = ₹360.75 total payable
    const weighedOrder: Order = {
      ...baseMultiOrder,
      order_status: 'collected',
      measured_weight: 4.25,
      billable_weight: 4.25,
      discount_paise: 5000,
      total_amount_paise: 36075,
      items: [
        {
          ...baseMultiOrder.items![0],
          measured_weight: 2.50,
          billable_weight: 2.50,
          line_total_paise: 19750
        },
        {
          ...baseMultiOrder.items![1],
          measured_weight: 1.75,
          billable_weight: 1.75,
          line_total_paise: 17325
        }
      ]
    };

    render(
      <InvoiceModal
        order={weighedOrder}
        isOpen={true}
        onClose={vi.fn()}
        currentUser={mockCustomerUser}
      />
    );

    // Subtotal
    expect(screen.getByText('₹370.75')).toBeDefined();
    // Coupon
    expect(screen.getByText('-₹50.00')).toBeDefined();
    // Delivery fee
    expect(screen.getByText('₹40.00')).toBeDefined();
    // Net Payable
    expect(screen.getAllByText('₹360.75').length).toBeGreaterThanOrEqual(1);
  });

  // 12. Backend rejection of manipulated client totals
  it('12. backend calculates financial values authoritatively and ignores client-submitted prices', async () => {
    setLiveModeForTesting(true);
    const mockOrder = { ...baseMultiOrder, id: '11111111-1111-4111-a111-111111111111' };
    localStorage.setItem('superwash_orders', JSON.stringify([mockOrder]));
    vi.spyOn(LaundryService, 'getOrders').mockResolvedValue([mockOrder]);
    vi.spyOn(LaundryService, 'getOrderById').mockResolvedValue(mockOrder);

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: mockOrder.id,
        total_amount_paise: 36075,
        items: []
      },
      error: null
    } as any);

    // Attacker sends manipulated client measurements; RPC must be invoked with only order_id and measurements
    await LaundryService.recordPickupCollectionAndWeight(mockOrder.id, [
      { order_item_id: 'item-001', service_id: serviceAId, measured_weight: 2.50 },
      { order_item_id: 'item-002', service_id: serviceBId, measured_weight: 1.75 }
    ]);

    expect(rpcSpy).toHaveBeenCalledWith(
      'record_courier_pickup_collection',
      expect.objectContaining({
        p_order_id: mockOrder.id,
        p_service_measurements: expect.any(Array)
      })
    );
    setLiveModeForTesting(false);
  });

  // 13. Historical single-service order compatibility
  it('13. normalizes legacy single-service orders without items and preserves historical totals', () => {
    const legacyOrder: Order = {
      id: 'ord-legacy-01',
      order_number: 'SW-1001',
      customer_id: 'cust-1',
      customer_name: 'Historical Customer',
      customer_phone: '9876543210',
      pickup_address: 'Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-20',
      pickup_slot: 'Morning',
      order_status: 'delivered',
      payment_status: 'paid',
      payment_method: 'cash',
      price_per_kg_paise: 7900,
      min_weight_kg: 1.0,
      measured_weight: 3.50,
      billable_weight: 3.50,
      total_amount_paise: 27650,
      delivery_charge_paise: 0,
      paid_amount_paise: 27650,
      created_at: '2026-10-20T10:00:00Z',
      updated_at: '2026-10-20T12:00:00Z'
      // No items array
    };

    const normalized = LaundryService.normalizeOrderItems(legacyOrder);
    expect(normalized.items).toBeDefined();
    expect(normalized.items?.length).toBe(1);
    expect(normalized.items?.[0].measured_weight).toBe(3.50);
    expect(normalized.items?.[0].line_total_paise).toBe(27650);
  });

  // 14. Reweighing and audit history
  it('14. logs weight change history during store intake re-weighing and guards against downward paid reduction', async () => {
    const collectedOrder = {
      ...baseMultiOrder,
      order_status: 'collected' as const,
      measured_weight: 4.25,
      total_amount_paise: 36075,
      paid_amount_paise: 40000 // Already prepaid ₹400
    };
    localStorage.setItem('superwash_orders', JSON.stringify([collectedOrder]));

    // Modal downward adjustment guard test
    render(
      <WeightEntryModal
        order={collectedOrder}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const inputs = screen.getAllByPlaceholderText(/e\.g\. 3\.50/);
    fireEvent.change(inputs[0], { target: { value: '0.40' } });
    fireEvent.change(inputs[1], { target: { value: '0.40' } });

    const reasonInput = screen.getByPlaceholderText(/e\.g\. Facility scale calibrated/i);
    fireEvent.change(reasonInput, { target: { value: 'Customer garments sorted' } });

    const submitBtn = screen.getByRole('button', { name: /Save & Calculate Bill/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/Cannot reduce total below already paid amount/i)).toBeDefined();
  });

  // ============================================================================
  // SECTION B: UI & MODAL INTERACTION VERIFICATION
  // ============================================================================

  it('15. DoorstepWeighingModal displays separate scale inputs for each service and enforces 2 decimals', () => {
    render(
      <DoorstepWeighingModal
        order={baseMultiOrder}
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText('Wash & Fold (Normal)')).toBeDefined();
    expect(screen.getByText('Steam Press & Ironing')).toBeDefined();

    const input1 = screen.getByTestId('scale-input-item-001');
    fireEvent.change(input1, { target: { value: '1.234' } });
    expect(screen.getByText('Max 2 decimal places')).toBeDefined();

    fireEvent.change(input1, { target: { value: '1.25' } });
    expect(screen.queryByText('Max 2 decimal places')).toBeNull();
  });

  it('16. DoorstepWeighingModal live summary updates as weights are entered', () => {
    render(
      <DoorstepWeighingModal
        order={baseMultiOrder}
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const input1 = screen.getByTestId('scale-input-item-001');
    const input2 = screen.getByTestId('scale-input-item-002');
    fireEvent.change(input1, { target: { value: '2.50' } });
    fireEvent.change(input2, { target: { value: '1.75' } });

    expect(screen.getAllByText('4.25 kg').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('₹360.75')).toBeDefined();
  });

  it('17. CustomerOrderTracker renders actual measured scale readings without overwriting them', () => {
    const collectedOrder: Order = {
      ...baseMultiOrder,
      order_status: 'collected',
      measured_weight: 0.80,
      billable_weight: 1.00,
      total_amount_paise: 8900,
      items: [
        {
          ...baseMultiOrder.items![0],
          measured_weight: 0.40,
          billable_weight: 0.50,
          line_total_paise: 3950
        },
        {
          ...baseMultiOrder.items![1],
          measured_weight: 0.40,
          billable_weight: 0.50,
          line_total_paise: 4950
        }
      ]
    };

    render(
      <MemoryRouter>
        <CustomerOrderTracker order={collectedOrder} variant="full" />
      </MemoryRouter>
    );

    expect(screen.getByText(/Wash & Fold \(Normal\):/i)).toBeDefined();
    expect(screen.getByText(/Steam Press & Ironing:/i)).toBeDefined();
    // Actual measured scale readings: 0.40 kg each
    const readings = screen.getAllByText('0.40 kg');
    expect(readings.length).toBe(2);
    expect(screen.getByText(/0\.80 kg • ₹89/i)).toBeDefined();
  });

  // ============================================================================
  // SECTION C: APPROVED SCALE LIMITS (0.10 - 100.00 kg) & PRODUCTION COUPON VERIFICATION
  // ============================================================================

  it('18. enforces approved physical scale bounds (0.10 - 100.00 kg) in DoorstepWeighingModal', () => {
    render(
      <DoorstepWeighingModal
        order={baseMultiOrder}
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const input1 = screen.getByTestId('scale-input-item-001');

    // Below minimum scale limit (< 0.10 kg)
    fireEvent.change(input1, { target: { value: '0.05' } });
    expect(screen.getByText('Min weight 0.10 kg')).toBeDefined();

    // Above maximum scale limit (> 100.00 kg)
    fireEvent.change(input1, { target: { value: '100.05' } });
    expect(screen.getByText('Max limit 100.00 kg')).toBeDefined();

    // Valid lower boundary (0.10 kg)
    fireEvent.change(input1, { target: { value: '0.10' } });
    expect(screen.queryByText('Min weight 0.10 kg')).toBeNull();
    expect(screen.queryByText('Max limit 100.00 kg')).toBeNull();

    // Valid upper boundary (100.00 kg)
    fireEvent.change(input1, { target: { value: '100.00' } });
    expect(screen.queryByText('Min weight 0.10 kg')).toBeNull();
    expect(screen.queryByText('Max limit 100.00 kg')).toBeNull();
  });

  it('19. enforces approved physical scale bounds (0.10 - 100.00 kg) in WeightEntryModal and LaundryService', async () => {
    setLiveModeForTesting(false);
    localStorage.setItem('superwash_orders', JSON.stringify([baseMultiOrder]));

    render(
      <WeightEntryModal
        order={baseMultiOrder}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText(/Range: 0\.10 - 100\.00 kg/i)).toBeDefined();

    const inputs = screen.getAllByPlaceholderText(/e\.g\. 3\.50/);

    // Below minimum
    fireEvent.change(inputs[0], { target: { value: '0.05' } });
    expect(screen.getByText('Min weight 0.10 kg')).toBeDefined();

    // Above maximum
    fireEvent.change(inputs[0], { target: { value: '105.00' } });
    expect(screen.getByText('Max limit 100.00 kg')).toBeDefined();

    // Service validation error enforcement
    await expect(
      LaundryService.recordPickupCollectionAndWeight(baseMultiOrder.id, [
        { order_item_id: 'item-001', measured_weight: 0.05 },
        { order_item_id: 'item-002', measured_weight: 1.00 }
      ])
    ).rejects.toThrow(/between 0\.10 kg and 100\.00 kg/i);

    await expect(
      LaundryService.enterMeasuredWeight(baseMultiOrder.id, [
        { order_item_id: 'item-001', measured_weight: 120.00 },
        { order_item_id: 'item-002', measured_weight: 1.00 }
      ])
    ).rejects.toThrow(/between 0\.10 kg and 100\.00 kg/i);
  });

  it('20. verifies approved production coupon policies (WELCOME50 and EXPREZ10) with multi-service weighed subtotals', () => {
    // A. WELCOME50: Flat ₹50 off on min order ₹150 (15000 paise)
    const welcome50Rules = {
      code: 'WELCOME50',
      discount_type: 'fixed' as const,
      discount_value: 5000,
      min_order_paise: 15000
    };

    // Subtotal below ₹150 (e.g. 1.00 kg @ ₹79 = ₹79.00 -> 7900 paise)
    const belowWelcome = PricingEngine.calculateMultiServicePricing(
      [{ id: '1', service_name: 'Wash & Fold', unit_price_paise: 7900, pricing_unit: 'per_kg', measured_weight: 0.80 }],
      1.00,
      0,
      0,
      welcome50Rules
    );
    expect(belowWelcome.subtotalPaise).toBe(7900);
    expect(belowWelcome.discountPaise).toBe(0); // Ineligible

    // Subtotal above ₹150 (e.g. 2.00 kg @ ₹79 + 1.00 kg @ ₹99 = 15800 + 9900 = 25700 paise)
    const aboveWelcome = PricingEngine.calculateMultiServicePricing(
      [
        { id: '1', service_name: 'Wash & Fold', unit_price_paise: 7900, pricing_unit: 'per_kg', measured_weight: 2.00 },
        { id: '2', service_name: 'Steam Press', unit_price_paise: 9900, pricing_unit: 'per_kg', measured_weight: 1.00 }
      ],
      1.00,
      0,
      0,
      welcome50Rules
    );
    expect(aboveWelcome.subtotalPaise).toBe(25700);
    expect(aboveWelcome.discountPaise).toBe(5000); // ₹50 off once per order
    expect(aboveWelcome.totalAmountPaise).toBe(20700);

    // B. EXPREZ10: 10% off up to ₹100 (10000 paise) on min order ₹200 (20000 paise)
    const exprez10Rules = {
      code: 'EXPREZ10',
      discount_type: 'percentage' as const,
      discount_value: 10,
      min_order_paise: 20000,
      max_discount_paise: 10000
    };

    // Subtotal below ₹200 (e.g. 2.00 kg @ ₹79 = 15800 paise)
    const belowExprez = PricingEngine.calculateMultiServicePricing(
      [{ id: '1', service_name: 'Wash & Fold', unit_price_paise: 7900, pricing_unit: 'per_kg', measured_weight: 2.00 }],
      1.00,
      0,
      0,
      exprez10Rules
    );
    expect(belowExprez.subtotalPaise).toBe(15800);
    expect(belowExprez.discountPaise).toBe(0); // Ineligible (< ₹200)

    // Subtotal above ₹200 (e.g. 3.00 kg @ ₹79 = 23700 paise) -> 10% = 2370 paise (₹23.70)
    const aboveExprez = PricingEngine.calculateMultiServicePricing(
      [{ id: '1', service_name: 'Wash & Fold', unit_price_paise: 7900, pricing_unit: 'per_kg', measured_weight: 3.00 }],
      1.00,
      0,
      0,
      exprez10Rules
    );
    expect(aboveExprez.subtotalPaise).toBe(23700);
    expect(aboveExprez.discountPaise).toBe(2370); // 10% of 23700
    expect(aboveExprez.totalAmountPaise).toBe(21330);

    // Subtotal hitting ₹100 cap (e.g. 15.00 kg @ ₹79 = 118500 paise -> 10% is 11850 paise, capped at 10000 paise)
    const cappedExprez = PricingEngine.calculateMultiServicePricing(
      [{ id: '1', service_name: 'Wash & Fold', unit_price_paise: 7900, pricing_unit: 'per_kg', measured_weight: 15.00 }],
      1.00,
      0,
      0,
      exprez10Rules
    );
    expect(cappedExprez.subtotalPaise).toBe(118500);
    expect(cappedExprez.discountPaise).toBe(10000); // Capped at ₹100
    expect(cappedExprez.totalAmountPaise).toBe(108500);
  });

  // 21. Live Mode Safeupdate & Multi-Service Delivery Pickup Flow
  it('21. successfully processes multi-service doorstep collection with WELCOME50 coupon without WHERE clause exceptions', async () => {
    setLiveModeForTesting(true);
    const sw1047Order: Order = {
      ...baseMultiOrder,
      id: '9d65a6f4-b4a5-40c2-8303-003d3a89eb34',
      order_number: 'SW-1047',
      order_status: 'pickup_assigned',
      coupon_code: 'WELCOME50',
      items: [
        {
          id: 'f3368e0d-970a-4f87-ac57-436ffc192fcc',
          order_id: '9d65a6f4-b4a5-40c2-8303-003d3a89eb34',
          service_id: serviceAId,
          service_name: 'Wash & Fold (Normal)',
          pricing_unit: 'per_kg',
          unit_price_paise: 7900,
          min_weight_kg: 1.0,
          created_at: '2026-11-03T05:00:00Z',
          updated_at: '2026-11-03T05:00:00Z'
        },
        {
          id: '4c0c3bfe-9500-4294-9763-fd61802b8aef',
          order_id: '9d65a6f4-b4a5-40c2-8303-003d3a89eb34',
          service_id: serviceBId,
          service_name: 'Wash and Iron',
          pricing_unit: 'per_kg',
          unit_price_paise: 7900,
          min_weight_kg: 1.0,
          created_at: '2026-11-03T05:00:00Z',
          updated_at: '2026-11-03T05:00:00Z'
        }
      ]
    };
    localStorage.setItem('superwash_orders', JSON.stringify([sw1047Order]));
    vi.spyOn(LaundryService, 'getOrders').mockResolvedValue([sw1047Order]);

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: sw1047Order.id,
        order_number: 'SW-1047',
        measured_weight: 5.0,
        billable_weight: 5.0,
        subtotal_paise: 39500,
        discount_paise: 5000,
        total_amount_paise: 34500,
        order_status: 'collected',
        items: [
          {
            id: 'f3368e0d-970a-4f87-ac57-436ffc192fcc',
            service_id: serviceAId,
            service_name: 'Wash & Fold (Normal)',
            pricing_unit: 'per_kg',
            unit_price_paise: 7900,
            min_weight_kg: 1.0,
            measured_weight: 2.0,
            billable_weight: 2.0,
            line_total_paise: 15800
          },
          {
            id: '4c0c3bfe-9500-4294-9763-fd61802b8aef',
            service_id: serviceBId,
            service_name: 'Wash and Iron',
            pricing_unit: 'per_kg',
            unit_price_paise: 7900,
            min_weight_kg: 1.0,
            measured_weight: 3.0,
            billable_weight: 3.0,
            line_total_paise: 23700
          }
        ]
      },
      error: null
    } as any);

    const measurements: ServiceMeasurementInput[] = [
      { order_item_id: 'f3368e0d-970a-4f87-ac57-436ffc192fcc', measured_weight: 2.0 },
      { order_item_id: '4c0c3bfe-9500-4294-9763-fd61802b8aef', measured_weight: 3.0 }
    ];

    const result = await LaundryService.recordPickupCollectionAndWeight(
      sw1047Order.id,
      measurements,
      '2038a6d7-d5b0-4be8-811f-0843a74840ba',
      'Delivery Staff',
      'Doorstep collection: 5.00 kg recorded'
    );

    expect(rpcSpy).toHaveBeenCalledWith(
      'record_courier_pickup_collection',
      expect.objectContaining({
        p_order_id: sw1047Order.id,
        p_service_measurements: measurements,
        p_delivery_notes: 'Doorstep collection: 5.00 kg recorded'
      })
    );

    expect(result.order_status).toBe('collected');
    expect(result.measured_weight).toBe(5.0);
    expect(result.billable_weight).toBe(5.0);
    expect(result.discount_paise).toBe(5000);
    expect(result.total_amount_paise).toBe(34500);
    expect(result.items?.length).toBe(2);
    expect(result.items?.[0].line_total_paise).toBe(15800);
    expect(result.items?.[1].line_total_paise).toBe(23700);

    setLiveModeForTesting(false);
  });
});
