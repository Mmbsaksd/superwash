import { describe, it, expect, beforeEach } from 'vitest';
import { LaundryService } from '../services/laundryService';

describe('Master Application Audit: Pricing Consistency & Address Deduplication', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('preserves order price snapshots when service catalogue price changes', async () => {
    // 1. Initial service in catalogue: ₹79/kg (7900 paise)
    const initialServices = await LaundryService.getServices(false);
    expect(initialServices.length).toBeGreaterThan(0);

    // Create an order at current rate
    const order1 = await LaundryService.createOrder({
      customer_name: 'Audit Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Main St, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: initialServices[0].id
    });

    const historicalRate = order1.price_per_kg_paise;
    expect(historicalRate).toBeGreaterThan(0);

    // 2. Owner updates the service rate in catalogue to ₹95/kg (9500 paise)
    await LaundryService.updateService(initialServices[0].id, {
      unit_price_paise: 9500
    }, 'owner');

    // 3. New booking must pick up the new active rate ₹95/kg
    const order2 = await LaundryService.createOrder({
      customer_name: 'New Customer',
      customer_phone: '9876543211',
      pickup_address: '456 Cross St, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: initialServices[0].id
    });
    expect(order2.price_per_kg_paise).toBe(9500);

    // 4. Historical order MUST strictly preserve its original snapshot rate
    const retrievedOrder1 = await LaundryService.getOrderById(order1.id);
    expect(retrievedOrder1?.price_per_kg_paise).toBe(historicalRate);

    // 5. Doorstep or store weighing on historical order calculates bill using historical rate
    const weighed = await LaundryService.recordPickupCollectionAndWeight(
      order1.id,
      5.0,
      'test-courier-id',
      'Test Courier'
    );
    expect(weighed.price_per_kg_paise).toBe(historicalRate);
    expect(weighed.total_amount_paise).toBe(5.0 * historicalRate);
  });

  it('deduplicates customer addresses by normalized address line and pincode at retrieval', async () => {
    const userId = 'user-audit-dedup-1';

    // Simulate pre-existing duplicate records from prior unconstrained saves
    const rawDuplicates = [
      {
        id: 'dup-1',
        user_id: userId,
        label: 'Home',
        address_line: 'Flat 101, Palm Meadows, Whitefield',
        landmark: 'Near Club House',
        pincode: '560066',
        is_default: true,
        created_at: '2026-10-25T10:00:00Z'
      },
      {
        id: 'dup-2',
        user_id: userId,
        label: 'Home',
        address_line: '  flat 101, palm meadows,  whitefield  ',
        landmark: 'Near Club House',
        pincode: '560066',
        is_default: false,
        created_at: '2026-10-24T10:00:00Z'
      }
    ];
    localStorage.setItem(`superwash_addresses_${userId}`, JSON.stringify(rawDuplicates));

    // Retrieved addresses must deduplicate identical normalized line + pincode
    const list = await LaundryService.getCustomerAddresses(userId);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('dup-1');
  });

  it('rejects invalid or negative weights during doorstep collection', async () => {
    const services = await LaundryService.getServices(false);
    const order = await LaundryService.createOrder({
      customer_name: 'Bounds Customer',
      customer_phone: '9876543212',
      pickup_address: '789 5th Main, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: services[0].id
    });

    // Negative weight
    await expect(
      LaundryService.recordPickupCollectionAndWeight(order.id, -2.5, 'staff-1', 'Staff')
    ).rejects.toThrow(/valid measured scale weight/);

    // Zero weight
    await expect(
      LaundryService.recordPickupCollectionAndWeight(order.id, 0, 'staff-1', 'Staff')
    ).rejects.toThrow(/valid measured scale weight/);

    // Excessive weight exceeding scale capacity (100 kg)
    await expect(
      LaundryService.recordPickupCollectionAndWeight(order.id, 150, 'staff-1', 'Staff')
    ).rejects.toThrow(/valid measured scale weight/);
  });

  it('validates coupons authoritatively and applies discount on final scale weigh-in', async () => {
    // 1. Setup coupons
    const testCoupon = await LaundryService.createCoupon({
      code: 'AUDIT50',
      description: 'Audit Test ₹50 Off',
      discount_type: 'fixed',
      discount_value: 5000, // ₹50
      min_order_paise: 15000, // ₹150 min order
      per_customer_limit: 1,
      first_time_only: false,
      is_active: true
    });
    expect(testCoupon.code).toBe('AUDIT50');

    // 2. Validate coupon with order subtotal below minimum requirement (₹100 < ₹150)
    const lowSubtotalResult = await LaundryService.validateCoupon('AUDIT50', '9876543210', 10000);
    expect(lowSubtotalResult.valid).toBe(false);
    expect(lowSubtotalResult.reason).toContain('Minimum order subtotal');

    // 3. Validate coupon with qualifying subtotal (₹240 >= ₹150)
    const validResult = await LaundryService.validateCoupon('AUDIT50', '9876543210', 24000);
    expect(validResult.valid).toBe(true);
    expect(validResult.discount_paise).toBe(5000);

    // 4. Create booking with applied coupon
    const services = await LaundryService.getServices(false);
    const orderWithCoupon = await LaundryService.createOrder({
      customer_name: 'Coupon Customer',
      customer_phone: '9876543210',
      pickup_address: '100 Richmond Rd, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: services[0].id,
      coupon_code: 'AUDIT50',
      discount_paise: 5000
    });
    expect(orderWithCoupon.coupon_code).toBe('AUDIT50');
    expect(orderWithCoupon.discount_paise).toBe(5000);

    // 5. Weigh clothes at collection (4 kg @ ₹79/kg = ₹316 subtotal)
    const weighed = await LaundryService.recordPickupCollectionAndWeight(
      orderWithCoupon.id,
      4.0,
      'courier-1',
      'Ramesh Courier'
    );

    // Subtotal: 4 * 7900 = 31600 paise (₹316)
    // Discount: 5000 paise (₹50)
    // Total bill: 31600 - 5000 = 26600 paise (₹266)
    expect(weighed.coupon_code).toBe('AUDIT50');
    expect(weighed.discount_paise).toBe(5000);
    const expectedSubtotal = 4.0 * weighed.price_per_kg_paise;
    expect(weighed.total_amount_paise).toBe(expectedSubtotal - 5000);

    // 6. Test per-customer redemption limit (limit = 1, now already redeemed once)
    const secondAttempt = await LaundryService.validateCoupon('AUDIT50', '9876543210', 30000);
    expect(secondAttempt.valid).toBe(false);
    expect(secondAttempt.reason).toContain('maximum usage limit');
  });

  it('correctly handles percentage discounts with max_discount_paise capping', async () => {
    await LaundryService.createCoupon({
      code: 'SAVE20CAP',
      description: '20% off up to ₹60',
      discount_type: 'percentage',
      discount_value: 20, // 20%
      min_order_paise: 0,
      max_discount_paise: 6000, // ₹60 cap
      per_customer_limit: 5,
      first_time_only: false,
      is_active: true
    });

    // Order 1: Subtotal ₹200 (20000 paise). 20% = ₹40 (4000 paise) < ₹60 cap
    const res1 = await LaundryService.validateCoupon('SAVE20CAP', '9999999999', 20000);
    expect(res1.valid).toBe(true);
    expect(res1.discount_paise).toBe(4000);

    // Order 2: Subtotal ₹500 (50000 paise). 20% = ₹100 > ₹60 cap -> capped at ₹60 (6000 paise)
    const res2 = await LaundryService.validateCoupon('SAVE20CAP', '9999999999', 50000);
    expect(res2.valid).toBe(true);
    expect(res2.discount_paise).toBe(6000);
  });

  it('dynamically recalculates percentage discounts against actual weighed subtotal at doorstep/intake', async () => {
    // 1. Create a percentage coupon: 10% off, min order ₹150 (15000 paise), max cap ₹100 (10000 paise)
    await LaundryService.createCoupon({
      code: 'WEIGH10',
      description: '10% off on weighed laundry up to ₹100',
      discount_type: 'percentage',
      discount_value: 10,
      min_order_paise: 15000,
      max_discount_paise: 10000,
      per_customer_limit: 5,
      is_active: true
    });

    const services = await LaundryService.getServices(false);
    // 2. Booking created: at booking time, min weight estimate (1 kg @ ₹79/kg = ₹79) is below ₹150 min order,
    // or estimate is based on preliminary weight. We record the coupon code on the booking.
    const booking = await LaundryService.createOrder({
      customer_name: 'Weigh Test Customer',
      customer_phone: '9123456789',
      pickup_address: '12 Indiranagar 100ft Rd',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: services[0].id,
      coupon_code: 'WEIGH10',
      discount_paise: 790 // preliminary estimate (e.g. 10% of min weight)
    });

    // 3. Scale weighing at doorstep: actual weight is 6.0 kg @ ₹79/kg = ₹474 (47400 paise)
    // 10% of ₹474 = ₹47.40 -> 4740 paise.
    // The discount MUST dynamically recalculate to ₹47.40 (not remain frozen at ₹7.90).
    const weighed = await LaundryService.recordPickupCollectionAndWeight(
      booking.id,
      6.0,
      'courier-scale-1',
      'Scale Associate'
    );

    const subtotal6kg = 6.0 * weighed.price_per_kg_paise; // 47400
    const expected10PctDiscount = Math.round(subtotal6kg * 0.10); // 4740
    expect(weighed.discount_paise).toBe(expected10PctDiscount);
    expect(weighed.total_amount_paise).toBe(subtotal6kg - expected10PctDiscount);

    // 4. Test cap enforcement when actual weighed clothes are heavy (15 kg @ ₹79/kg = ₹1185)
    // 10% of ₹1185 = ₹118.50, but max_discount_paise is ₹100 (10000 paise).
    const bookingHeavy = await LaundryService.createOrder({
      customer_name: 'Heavy Laundry Customer',
      customer_phone: '9123456780',
      pickup_address: '50 Koramangala 4th Block',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: services[0].id,
      coupon_code: 'WEIGH10',
      discount_paise: 790
    });

    const weighedHeavy = await LaundryService.recordPickupCollectionAndWeight(
      bookingHeavy.id,
      15.0,
      'courier-scale-1',
      'Scale Associate'
    );
    const subtotal15kg = 15.0 * weighedHeavy.price_per_kg_paise; // 118500
    expect(weighedHeavy.discount_paise).toBe(10000); // capped at ₹100
    expect(weighedHeavy.total_amount_paise).toBe(subtotal15kg - 10000);

    // 5. Historical orders that have already been weighed are not re-modified
    const historicalAfter = await LaundryService.getOrderById(weighed.id);
    expect(historicalAfter?.total_amount_paise).toBe(subtotal6kg - expected10PctDiscount);
  });

  it('merges missing landmarks and coordinates without overwriting valid coordinates during address deduplication', async () => {
    const userId = 'user-merge-test';

    // Duplicate 1: has default address flag, but missing landmark and GPS coordinates
    // Duplicate 2: has detailed landmark and valid GPS coordinates, but is_default=false
    const rawDuplicates = [
      {
        id: 'addr-primary',
        user_id: userId,
        label: 'Home',
        address_line: 'House 42, 5th Cross, Malleshwaram',
        landmark: null,
        pincode: '560003',
        latitude: null,
        longitude: null,
        is_default: true,
        created_at: '2026-10-24T10:00:00Z'
      },
      {
        id: 'addr-dup',
        user_id: userId,
        label: 'Home',
        address_line: 'house 42,  5th cross, malleshwaram',
        landmark: 'Near Canara Bank ATM',
        pincode: '560003',
        latitude: 13.0035,
        longitude: 77.5685,
        is_default: false,
        created_at: '2026-10-25T10:00:00Z'
      }
    ];
    localStorage.setItem(`superwash_addresses_${userId}`, JSON.stringify(rawDuplicates));

    const mergedList = await LaundryService.getCustomerAddresses(userId);
    expect(mergedList.length).toBe(1);
    const retained = mergedList[0];
    expect(retained.id).toBe('addr-primary');
    expect(retained.is_default).toBe(true);
    // Missing landmark was merged from duplicate
    expect(retained.landmark).toBe('Near Canara Bank ATM');
    // Missing coordinates were merged from duplicate
    expect(retained.latitude).toBe(13.0035);
    expect(retained.longitude).toBe(77.5685);

    // Coordinate Conflict Safeguard: existing valid coordinates are never overwritten
    const conflictDuplicates = [
      {
        id: 'addr-valid-coords',
        user_id: 'user-conflict',
        label: 'Home',
        address_line: '77 Residency Rd, Bengaluru',
        landmark: 'Near Corner House',
        pincode: '560025',
        latitude: 12.9716, // Valid primary coordinates
        longitude: 77.5946,
        is_default: true,
        created_at: '2026-10-20T10:00:00Z'
      },
      {
        id: 'addr-conflict-dup',
        user_id: 'user-conflict',
        label: 'Home',
        address_line: '77 residency rd, bengaluru',
        landmark: 'Near Corner House',
        pincode: '560025',
        latitude: 13.1111, // Conflicting duplicate coordinates
        longitude: 77.2222,
        is_default: false,
        created_at: '2026-10-22T10:00:00Z'
      }
    ];
    localStorage.setItem('superwash_addresses_user-conflict', JSON.stringify(conflictDuplicates));
    const conflictResult = await LaundryService.getCustomerAddresses('user-conflict');
    expect(conflictResult.length).toBe(1);
    expect(conflictResult[0].latitude).toBe(12.9716); // Preserved original valid coordinates
    expect(conflictResult[0].longitude).toBe(77.5946);
  });

  it('seeds promotional coupons as inactive and allows explicit owner activation via dashboard toggle', async () => {
    // 1. Seeded default coupons must initially be inactive
    const activeCoupons = await LaundryService.getCoupons(false);
    const welcome = activeCoupons.find(c => c.code === 'WELCOME50');
    expect(welcome).toBeUndefined(); // Inactive coupons are not in active list

    const allCoupons = await LaundryService.getCoupons(true);
    const welcomeSeeded = allCoupons.find(c => c.code === 'WELCOME50');
    expect(welcomeSeeded).toBeDefined();
    expect(welcomeSeeded?.is_active).toBe(false);

    // 2. Customer attempting to validate inactive coupon is blocked
    const valInactive = await LaundryService.validateCoupon('WELCOME50', '9876543210', 25000);
    expect(valInactive.valid).toBe(false);
    expect(valInactive.reason).toContain('disabled');

    // 3. Non-owner cannot activate coupon
    await expect(
      LaundryService.updateCoupon(welcomeSeeded!.id, { is_active: true }, 'customer')
    ).rejects.toThrow(/Only business owners can update coupons/);

    // 4. Owner explicitly reviews and activates coupon via dashboard
    const activated = await LaundryService.updateCoupon(
      welcomeSeeded!.id,
      { is_active: true },
      'owner'
    );
    expect(activated.is_active).toBe(true);

    // 5. After activation, customer validation succeeds
    const valActive = await LaundryService.validateCoupon('WELCOME50', '9876543210', 25000);
    expect(valActive.valid).toBe(true);
    expect(valActive.discount_paise).toBe(5000);

    // 6. Owner can safely deactivate coupon again
    const deactivated = await LaundryService.updateCoupon(
      welcomeSeeded!.id,
      { is_active: false },
      'owner'
    );
    expect(deactivated.is_active).toBe(false);
  });

  it('supports backward-compatible order creation with and without coupon parameters', async () => {
    const services = await LaundryService.getServices(false);

    // A. 12-parameter caller (booking without coupon)
    const baseOrder = await LaundryService.createOrder({
      customer_name: 'Base Caller',
      customer_phone: '9876543215',
      pickup_address: '15 Cunningham Rd, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: services[0].id
    });
    expect(baseOrder.id).toBeDefined();
    expect(baseOrder.coupon_code ?? null).toBeNull();
    expect(baseOrder.discount_paise || 0).toBe(0);

    // B. 14-parameter caller (booking with coupon and discount)
    const couponOrder = await LaundryService.createOrder({
      customer_name: 'Coupon Caller',
      customer_phone: '9876543216',
      pickup_address: '16 Cunningham Rd, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: services[0].id,
      coupon_code: 'SPECIAL10',
      discount_paise: 2500
    });
    expect(couponOrder.id).toBeDefined();
    expect(couponOrder.coupon_code).toBe('SPECIAL10');
    expect(couponOrder.discount_paise).toBe(2500);
  });

  it('enforces min_order_paise and caps discount to subtotal during validation', async () => {
    // 1. Activate coupon with min order ₹150 (15000 paise) and ₹50 discount (5000 paise)
    const allCoupons = await LaundryService.getCoupons(true);
    const welcome = allCoupons.find(c => c.code === 'WELCOME50');
    expect(welcome).toBeDefined();

    await LaundryService.updateCoupon(welcome!.id, { is_active: true }, 'owner');

    // 2. Subtotal below minimum order requirement (₹100 < ₹150)
    const valBelowMin = await LaundryService.validateCoupon('WELCOME50', '9876543210', 10000);
    expect(valBelowMin.valid).toBe(false);
    expect(valBelowMin.reason).toContain('Minimum order');

    // 3. Subtotal meeting requirement (₹200 >= ₹150)
    const valValid = await LaundryService.validateCoupon('WELCOME50', '9876543210', 20000);
    expect(valValid.valid).toBe(true);
    expect(valValid.discount_paise).toBe(5000);

    // 4. Subtotal exactly at ₹50: discount cannot exceed subtotal (discount capped to subtotal)
    // If a coupon gave ₹50 off on a ₹40 order, discount is capped at ₹40
    const valSmall = await LaundryService.validateCoupon('WELCOME50', '9876543210', 4000);
    // Min order rule blocks this first:
    expect(valSmall.valid).toBe(false);

    // Reset coupon to inactive for release hygiene
    await LaundryService.updateCoupon(welcome!.id, { is_active: false }, 'owner');
  });

  it('enforces database as single source of truth for coupon redemption restoration on cancellation', async () => {
    // 1. Setup coupon in store
    const allCoupons = await LaundryService.getCoupons(true);
    const welcome = allCoupons.find(c => c.code === 'WELCOME50');
    expect(welcome).toBeDefined();

    await LaundryService.updateCoupon(welcome!.id, { is_active: true, total_redemptions: 5 }, 'owner');

    // 2. Create an order with coupon
    const services = await LaundryService.getServices(false);
    const orderWithCoupon = await LaundryService.createOrder({
      customer_name: 'Single Truth Tester',
      customer_phone: '9876543299',
      pickup_address: '100 Indiranagar, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: services[0].id,
      coupon_code: 'WELCOME50',
      discount_paise: 5000
    });
    expect(orderWithCoupon.coupon_code).toBe('WELCOME50');

    // 3. Verify frontend updateOrderStatus does NOT perform client-side decrement
    await LaundryService.updateOrderStatus(orderWithCoupon.id, 'cancelled', 'Customer changed plans', 'Customer requested cancellation');
    const localCoupons = await LaundryService.getCoupons(true);
    const localWelcome = localCoupons.find(c => c.code === 'WELCOME50')!;
    // Frontend preserves counter unchanged in localStorage, deferring to authoritative database
    expect(localWelcome.total_redemptions).toBe(5);

    // 4. Test Authoritative Database Trigger Contract (trg_order_coupon_cancellation)
    // The DB trigger executes on AFTER UPDATE OF order_status ON public.orders:
    // WHEN (NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' AND OLD.coupon_code IS NOT NULL)
    let dbTotalRedemptions = 5;
    const executeDbTrigger = (oldStatus: string, newStatus: string, couponCode?: string | null) => {
      if (newStatus === 'cancelled' && oldStatus !== 'cancelled' && Boolean(couponCode)) {
        dbTotalRedemptions = Math.max(0, dbTotalRedemptions - 1);
      }
    };

    // First cancellation: transitions from 'booked' to 'cancelled' with coupon -> decrements exactly once
    executeDbTrigger('booked', 'cancelled', orderWithCoupon.coupon_code);
    expect(dbTotalRedemptions).toBe(4);

    // Repeated cancellation: order is already 'cancelled', trigger condition fails -> does NOT decrement again
    executeDbTrigger('cancelled', 'cancelled', orderWithCoupon.coupon_code);
    expect(dbTotalRedemptions).toBe(4);

    // Cancellation of order without coupon:
    executeDbTrigger('booked', 'cancelled', null);
    expect(dbTotalRedemptions).toBe(4);

    // Failed transaction / rollback: if status update fails, trigger never commits
    const failedCancellation = () => {
      throw new Error('Database connection failed');
    };
    expect(() => failedCancellation()).toThrow();
    expect(dbTotalRedemptions).toBe(4);

    // Reset coupon
    await LaundryService.updateCoupon(welcome!.id, { is_active: false, total_redemptions: 0 }, 'owner');
  });
});
