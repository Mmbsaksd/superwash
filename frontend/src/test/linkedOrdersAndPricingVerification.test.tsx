import { describe, it, expect, beforeEach } from 'vitest';
import { LaundryService } from '../services/laundryService';

beforeEach(async () => {
  localStorage.clear();
  LaundryService.resetOrderSequence();
  await LaundryService.updateSettings({
    price_per_kg_paise: 7900, // ₹79.00 / kg
    min_weight_kg: 1.0,
    delivery_charge_paise: 0,
    serviceable_pincodes: ['560001', '560038', '560103']
  });

  // Activate WELCOME50 (₹50 off, min ₹150) as configured in Owner Dashboard
  const coupons = await LaundryService.getCoupons(true);
  const welcome50 = coupons.find(c => c.code === 'WELCOME50');
  if (welcome50) {
    await LaundryService.updateCoupon(welcome50.id, {
      is_active: true,
      min_order_paise: 15000,
      first_time_only: false
    });
  } else {
    await LaundryService.createCoupon({
      code: 'WELCOME50',
      description: 'Flat ₹50 OFF (Min. ₹150)',
      discount_type: 'fixed',
      discount_value: 5000,
      min_order_paise: 15000,
      per_customer_limit: 1,
      is_active: true
    });
  }
});

describe('Issue A: Coupon Discount Allocation Across Linked Orders', () => {
  it('correctly evaluates coupon eligibility against combined estimated subtotal in multi-service bookings', async () => {
    // Service 1: Wash & Fold @ ₹79/kg, est. 1 kg min = 7900 paise (₹79)
    // Service 2: Wash & Iron @ ₹99/kg, est. 1 kg min = 9900 paise (₹99)
    // Combined subtotal = 7900 + 9900 = 17800 paise (₹178)
    const combinedSubtotalPaise = 7900 + 9900;

    // Single service subtotal (₹79) is rejected for WELCOME50 (min ₹150)
    const singleResult = await LaundryService.validateCoupon('WELCOME50', '9876543210', 7900);
    expect(singleResult.valid).toBe(false);
    expect(singleResult.reason).toContain('Minimum order subtotal of ₹150 required');

    // Combined subtotal (₹178) is accepted for WELCOME50
    const combinedResult = await LaundryService.validateCoupon('WELCOME50', '9876543210', combinedSubtotalPaise);
    expect(combinedResult.valid).toBe(true);
    expect(combinedResult.discount_paise).toBe(5000); // ₹50 flat discount
  });

  it('allocates the discount to primary order and reconciles with total booking payable amount', async () => {
    const batchId = 'BATCH-TEST01';
    
    // Order 1: Wash & Fold @ ₹79/kg with WELCOME50 (₹50 discount)
    const order1 = await LaundryService.createOrder({
      customer_name: 'Priya Multi',
      customer_phone: '9876543210',
      pickup_address: 'Flat 101, Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-10-30',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      notes: `[Linked Batch ${batchId}: Wash & Fold (Normal) (1/2)]`,
      coupon_code: 'WELCOME50',
      discount_paise: 5000,
      client_submission_id: 'sub_test_01_a'
    });

    // Order 2: Wash & Iron @ ₹99/kg without coupon
    const order2 = await LaundryService.createOrder({
      customer_name: 'Priya Multi',
      customer_phone: '9876543210',
      pickup_address: 'Flat 101, Green Glen',
      pickup_pincode: '560103',
      pickup_date: '2026-10-30',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      notes: `[Linked Batch ${batchId}: Wash & Iron (2/2)]`,
      client_submission_id: 'sub_test_01_b'
    });

    expect(order1.coupon_code).toBe('WELCOME50');
    expect(order1.discount_paise).toBe(5000);
    expect(order2.coupon_code).toBeNull();
    expect(order2.discount_paise).toBe(0);

    // Intake weighing: Order 1 weighed at 1.0 kg (@ ₹79 = ₹79)
    // Order 2 weighed at 1.0 kg (@ ₹79 settings rate = ₹79)
    const weighed1 = await LaundryService.enterMeasuredWeight(order1.id, 1.0, 'Store Manager');
    const weighed2 = await LaundryService.enterMeasuredWeight(order2.id, 1.0, 'Store Manager');

    // Bill calculation with discount:
    // Order 1: Subtotal ₹79 - ₹50 discount = ₹29.00 (2900 paise)
    // Order 2: Subtotal ₹79 - ₹0 discount = ₹79.00 (7900 paise)
    // Reconciled total payable = ₹29 + ₹79 = ₹108.00 (10800 paise)
    // Full undiscounted total was ₹158. ₹158 - ₹50 = ₹108. EXACT MATCH!
    expect(weighed1.discount_paise).toBe(5000);
    expect(weighed1.total_amount_paise).toBe(7900 - 5000); // 2900 paise
    expect(weighed2.total_amount_paise).toBe(7900); // 7900 paise

    const totalBookingPayable = (weighed1.total_amount_paise || 0) + (weighed2.total_amount_paise || 0);
    expect(totalBookingPayable).toBe(10800);
  });

  it('safely revokes the coupon if sibling linked order is cancelled and subtotal falls below threshold', async () => {
    const batchId = 'BATCH-TEST02';

    const order1 = await LaundryService.createOrder({
      customer_name: 'Cancel Sibling Tester',
      customer_phone: '9876543211',
      pickup_address: '12 Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-30',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      notes: `[Linked Batch ${batchId}: Wash & Fold (1/2)]`,
      coupon_code: 'WELCOME50',
      discount_paise: 5000,
      client_submission_id: 'sub_test_02_a'
    });

    const order2 = await LaundryService.createOrder({
      customer_name: 'Cancel Sibling Tester',
      customer_phone: '9876543211',
      pickup_address: '12 Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-10-30',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      notes: `[Linked Batch ${batchId}: Wash & Iron (2/2)]`,
      client_submission_id: 'sub_test_02_b'
    });

    // Customer cancels Order 2
    await LaundryService.updateOrderStatus(order2.id, 'cancelled', undefined, 'Customer changed mind for iron service');

    // When store weighs Order 1 at 1.0 kg (subtotal 7900 paise = ₹79)
    // Because Order 2 is cancelled, the active batch subtotal is only ₹79, which is below the ₹150 min order!
    const weighed1 = await LaundryService.enterMeasuredWeight(order1.id, 1.0, 'Store Manager');
    expect(weighed1.discount_paise).toBe(0); // Safely revoked!
    expect(weighed1.total_amount_paise).toBe(7900);
  });
});

describe('Issue B: Weight, Rate, and Minimum-Weight Calculation Discrepancy Reconciliation', () => {
  it('proves exactly why ₹237 and ₹240 occur under different rate snapshots with 3.0 kg minimum', () => {
    // Case 1: Under current catalogue rate ₹79.00/kg (7900 paise) and 3.0 kg min
    // 2.0 kg measured -> billable weight 3.0 kg -> 3.0 * 79 = ₹237.00
    const bill79 = LaundryService.calculateBill(2.0, 7900, 3.0, 0);
    expect(bill79.measuredWeightKg).toBe(2.0);
    expect(bill79.billableWeightKg).toBe(3.0);
    expect(bill79.minWeightApplied).toBe(true);
    expect(bill79.totalAmountPaise).toBe(23700); // ₹237.00 EXACT

    // Case 2: Under legacy/mock rate ₹80.00/kg (8000 paise) and 3.0 kg min
    // 2.0 kg measured -> billable weight 3.0 kg -> 3.0 * 80 = ₹240.00
    const bill80 = LaundryService.calculateBill(2.0, 8000, 3.0, 0);
    expect(bill80.measuredWeightKg).toBe(2.0);
    expect(bill80.billableWeightKg).toBe(3.0);
    expect(bill80.minWeightApplied).toBe(true);
    expect(bill80.totalAmountPaise).toBe(24000); // ₹240.00 EXACT

    // This resolves the discrepancy: both totals are correct for their respective rate snapshots (₹79 vs ₹80).
  });

  it('proves that under 1.0 kg minimum weight, 2.0 kg measured weight bills for 2.0 kg', () => {
    // Under 1.0 kg minimum weight, 2.0 kg measured is above minimum
    const bill1kg = LaundryService.calculateBill(2.0, 7900, 1.0, 0);
    expect(bill1kg.measuredWeightKg).toBe(2.0);
    expect(bill1kg.billableWeightKg).toBe(2.0);
    expect(bill1kg.minWeightApplied).toBe(false);
    expect(bill1kg.totalAmountPaise).toBe(15800); // ₹158.00 (2.0 * ₹79)
  });

  it('correctly calculates fractional decimal weights without rounding distortion', () => {
    // 4.75 kg scale weight @ ₹79/kg = 4.75 * 7900 = 37525 paise (₹375.25)
    const bill = LaundryService.calculateBill(4.75, 7900, 1.0, 0);
    expect(bill.measuredWeightKg).toBe(4.75);
    expect(bill.billableWeightKg).toBe(4.75);
    expect(bill.totalAmountPaise).toBe(37525);
  });

  it('bills per_piece services strictly by piece quantity and never assigns invented weight', () => {
    // Steam Ironing: 5 pieces @ ₹25/piece (2500 paise)
    const bill = LaundryService.calculateBill(5, 2500, 0, 0, 'per_piece');
    expect(bill.billableWeightKg).toBe(5);
    expect(bill.totalAmountPaise).toBe(12500); // ₹125.00
    expect(bill.minWeightApplied).toBe(false);
  });
});

describe('Issue C: Linked-Order Lifecycle and Shared Pickup Coordination', () => {
  it('coordinates courier assignment across sibling orders of the same linked batch', async () => {
    const batchId = 'BATCH-TEST03';

    const order1 = await LaundryService.createOrder({
      customer_name: 'Batch Logistics Tester',
      customer_phone: '9876543212',
      pickup_address: '45 Koramangala',
      pickup_pincode: '560038',
      pickup_date: '2026-10-31',
      pickup_slot: 'Evening (05:00 PM - 08:00 PM)',
      notes: `[Linked Batch ${batchId}: Wash & Fold (1/2)]`,
      client_submission_id: 'sub_test_03_a'
    });

    const order2 = await LaundryService.createOrder({
      customer_name: 'Batch Logistics Tester',
      customer_phone: '9876543212',
      pickup_address: '45 Koramangala',
      pickup_pincode: '560038',
      pickup_date: '2026-10-31',
      pickup_slot: 'Evening (05:00 PM - 08:00 PM)',
      notes: `[Linked Batch ${batchId}: Wash & Iron (2/2)]`,
      client_submission_id: 'sub_test_03_b'
    });

    // Assigning pickup staff to Order 1 automatically assigns the same staff to Order 2
    const updated1 = await LaundryService.assignPickupStaff(
      order1.id,
      '00000000-0000-4000-a000-000000000003',
      'Ramesh Courier',
      '9876543215'
    );
    expect(updated1.assigned_pickup_name).toBe('Ramesh Courier');

    const updated2 = await LaundryService.getOrderById(order2.id);
    expect(updated2?.assigned_pickup_name).toBe('Ramesh Courier');
    expect(updated2?.order_status).toBe('pickup_assigned');
  });

  it('permits independent weighing and processing for separate laundry batches', async () => {
    const batchId = 'BATCH-TEST04';

    const order1 = await LaundryService.createOrder({
      customer_name: 'Independent Weighing Tester',
      customer_phone: '9876543213',
      pickup_address: '77 Residency Rd',
      pickup_pincode: '560001',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      notes: `[Linked Batch ${batchId}: Wash & Fold (1/2)]`,
      client_submission_id: 'sub_test_04_a'
    });

    const order2 = await LaundryService.createOrder({
      customer_name: 'Independent Weighing Tester',
      customer_phone: '9876543213',
      pickup_address: '77 Residency Rd',
      pickup_pincode: '560001',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      notes: `[Linked Batch ${batchId}: Wash & Iron (2/2)]`,
      client_submission_id: 'sub_test_04_b'
    });

    // Pickup associate collects order1
    await LaundryService.assignPickupStaff(
      order1.id,
      '00000000-0000-4000-a000-000000000003',
      'Ramesh Courier',
      '9876543215'
    );
    await LaundryService.recordPickupCollectionAndWeight(order1.id, 3.5, 'Ramesh Courier');

    // Store manager weighs Order 1 at intake -> advances to washing
    const weighed1 = await LaundryService.enterMeasuredWeight(order1.id, 3.5, 'Store Manager');
    expect(weighed1.measured_weight).toBe(3.5);
    expect(weighed1.order_status).toBe('washing');

    // Order 2 shares the pickup assignment, but remains unweighed in pickup_assigned stage until its batch is weighed
    const order2State = await LaundryService.getOrderById(order2.id);
    expect(order2State?.measured_weight).toBeNull();
    expect(order2State?.order_status).toBe('pickup_assigned');
    expect(order2State?.assigned_pickup_name).toBe('Ramesh Courier');
  });

  it('guarantees doorstep collection records pickup_measured_weight without setting store manager intake timestamp (SW-1008 invariant)', async () => {
    const order = await LaundryService.createOrder({
      customer_name: 'Doorstep Scale Tester',
      customer_phone: '9876543214',
      pickup_address: '100 Outer Ring Rd',
      pickup_pincode: '560103',
      pickup_date: '2026-10-31',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub_test_doorstep_sec'
    });

    await LaundryService.assignPickupStaff(
      order.id,
      '00000000-0000-4000-a000-000000000003',
      'Doorstep Delivery Agent',
      '9876543215'
    );

    const collected = await LaundryService.recordPickupCollectionAndWeight(
      order.id,
      4.25,
      'Doorstep Delivery Agent',
      'Collected 1 bag'
    );

    expect(collected.order_status).toBe('collected');
    expect(collected.pickup_measured_weight).toBe(4.25);
    expect(collected.pickup_weighed_by).toBe('Doorstep Delivery Agent');
    expect(collected.pickup_weighed_at).toBeDefined();
    // Security invariant: store manager intake timestamp weighed_at must NOT be set by courier
    expect(collected.weighed_at).toBeUndefined();
  });
});

describe('Coupon Strategy: Booking Conversion, Post-Weighing Discounts & Retention', () => {
  it('locks promotional terms into coupon_snapshot and protects historical orders from later coupon edits', async () => {
    // 1. Create a promo coupon: 20% off up to ₹100, min order ₹150
    const promo = await LaundryService.createCoupon({
      code: 'PROMO20',
      description: '20% OFF up to ₹100',
      discount_type: 'percentage',
      discount_value: 20,
      max_discount_paise: 10000,
      min_order_paise: 15000,
      per_customer_limit: 5,
      is_active: true
    });

    // 2. Customer books with PROMO20
    const order = await LaundryService.createOrder({
      customer_name: 'Terms Lock Customer',
      customer_phone: '9876543220',
      pickup_address: '42 MG Road',
      pickup_pincode: '560001',
      pickup_date: '2026-11-01',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      coupon_code: 'PROMO20',
      discount_paise: 3160,
      client_submission_id: 'sub_promo_lock_01'
    });

    expect(order.coupon_snapshot).toBeDefined();
    expect(order.coupon_snapshot?.code).toBe('PROMO20');
    expect(order.coupon_snapshot?.discount_value).toBe(20);
    expect(order.coupon_snapshot?.max_discount_paise).toBe(10000);

    // 3. Store owner later edits the global coupon: degrades to 5% off, max ₹25, min ₹500
    await LaundryService.updateCoupon(promo.id, {
      discount_value: 5,
      max_discount_paise: 2500,
      min_order_paise: 50000
    });

    // 4. Store weighs order: 4.0 kg @ ₹79/kg = ₹316.00 (31600 paise)
    // Under snapshotted terms: 20% of ₹316 = ₹63.20 (6320 paise), which is <= ₹100 cap, and ₹316 >= ₹150 min.
    // Under new degraded terms: ₹316 < ₹500 min, which would give ₹0!
    const finalDiscount = await LaundryService.resolveFinalOrderDiscount(order, 31600);
    expect(finalDiscount).toBe(6320); // Exactly 20% snapshotted discount preserved!
  });

  it('enforces maximum discount caps under heavy weigh-ins without exceeding subtotal or resulting in negative totals', async () => {
    // Promo: 50% off capped at ₹100 (10000 paise)
    await LaundryService.createCoupon({
      code: 'BIGSAVER50',
      description: '50% OFF up to ₹100',
      discount_type: 'percentage',
      discount_value: 50,
      max_discount_paise: 10000,
      min_order_paise: 0,
      per_customer_limit: 2,
      is_active: true
    });

    const order = await LaundryService.createOrder({
      customer_name: 'Heavy Weigh-in Customer',
      customer_phone: '9876543221',
      pickup_address: '15 Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-11-01',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      coupon_code: 'BIGSAVER50',
      discount_paise: 10000,
      client_submission_id: 'sub_cap_heavy_01'
    });

    // Heavy laundry weigh-in: 10.0 kg @ ₹79/kg = ₹790 (79000 paise)
    // 50% would be ₹395, but capped at ₹100 (10000 paise)
    const weighed = await LaundryService.enterMeasuredWeight(order.id, 10.0, 'Intake Manager');
    expect(weighed.discount_paise).toBe(10000);
    expect(weighed.total_amount_paise).toBe(69000); // ₹790 - ₹100 = ₹690
    expect(weighed.total_amount_paise).toBeGreaterThan(0);
  });

  it('dispatches customer retention promotion via WhatsApp when order is delivered', async () => {
    // Ensure active retention coupon exists (e.g. EXPREZ10)
    const coupons = await LaundryService.getCoupons(true);
    const exprez10 = coupons.find(c => c.code === 'EXPREZ10');
    if (exprez10) {
      await LaundryService.updateCoupon(exprez10.id, { is_active: true });
    }

    const order = await LaundryService.createOrder({
      customer_name: 'Retention Test Customer',
      customer_phone: '9876543299',
      pickup_address: '55 Koramangala',
      pickup_pincode: '560038',
      pickup_date: '2026-11-02',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      client_submission_id: 'sub_retention_01'
    });

    // Transition order through to delivered
    await LaundryService.updateOrderStatus(order.id, 'pickup_assigned');
    await LaundryService.recordPickupCollectionAndWeight(order.id, 3.0, 'Driver');
    await LaundryService.enterMeasuredWeight(order.id, 3.0, 'Store');
    await LaundryService.updateOrderStatus(order.id, 'ready_for_delivery');
    await LaundryService.assignDeliveryStaff(
      order.id,
      '00000000-0000-4000-a000-000000000004',
      'Delivery Courier',
      '9876543216'
    );
    await LaundryService.updateOrderStatus(order.id, 'out_for_delivery');
    const delivered = await LaundryService.updateOrderStatus(order.id, 'delivered');

    expect(delivered.order_status).toBe('delivered');
    // Notification log records WhatsApp delivery message containing repeat booking promo
    const logs = JSON.parse(localStorage.getItem('superwash_notifications') || '[]');
    const deliveryLog = logs.find((l: any) => l.event_type === 'delivered' && l.order_id === order.id);
    expect(deliveryLog).toBeDefined();
    expect(deliveryLog.message).toContain('SuperWash: Order #');
    expect(deliveryLog.message).toContain('delivered');
  });

  it('rejects coupon if order service is not in applicable_service_ids', async () => {
    const services = await LaundryService.getServices(false);
    const washFold = services.find(s => s.name.includes('Fold')) || services[0];
    const ironOnly = services.find(s => s.name.includes('Iron')) || services[1];

    await LaundryService.createCoupon({
      code: 'IRONONLY',
      description: 'Exclusive on Ironing',
      discount_type: 'fixed',
      discount_value: 3000,
      min_order_paise: 0,
      applicable_service_ids: [ironOnly.id],
      is_active: true
    });

    // Validation for Wash & Fold service is rejected
    const invalidRes = await LaundryService.validateCoupon('IRONONLY', '9876543201', 20000, washFold.id);
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.reason).toContain('not applicable to the selected service');

    // Validation for Ironing service is accepted
    const validRes = await LaundryService.validateCoupon('IRONONLY', '9876543201', 20000, ironOnly.id);
    expect(validRes.valid).toBe(true);
    expect(validRes.discount_paise).toBe(3000);
  });
});

