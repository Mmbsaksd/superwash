const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

async function runAudit() {
  console.log('============================================================');
  console.log('SUPERWASH EXPREZ: ISOLATED POSTGRESQL (PGLITE) LIFECYCLE AUDIT');
  console.log('============================================================');

  const db = new PGlite();

  // 1. Setup Supabase mock schema & auth functions
  console.log('\n[1/4] Initializing Supabase Auth & Environment Extensions...');
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      instance_id UUID,
      aud VARCHAR(255),
      role VARCHAR(255),
      email VARCHAR(255),
      encrypted_password VARCHAR(255),
      email_confirmed_at TIMESTAMPTZ,
      raw_app_meta_data JSONB,
      raw_user_meta_data JSONB,
      created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
      updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
    );

    CREATE PUBLICATION supabase_realtime;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::JSONB;
    $$ LANGUAGE sql STABLE;

    -- Mock roles for RLS testing
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END $$;
  `);

  // 2. Load all historical migrations up to 20261101000000
  console.log('\n[2/4] Executing Migration Chain In Order...');
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      // Normalize '20261022_enhanced_schema.sql' to run before '20261022120000'
      const normA = a.replace('20261022_', '20261022000000_');
      const normB = b.replace('20261022_', '20261022000000_');
      return normA.localeCompare(normB);
    });

  for (const file of migrationFiles) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    try {
      await db.exec(sql);
      console.log(`  ✓ Applied: ${file}`);
    } catch (err) {
      console.error(`  ✗ FAILED on ${file}:`, err.message);
      throw err;
    }
  }

  // 3. Seed baseline profiles, service and pickup slot
  console.log('\n[3/4] Seeding Test Entities...');
  const customerA = 'a0000000-0000-4000-a000-000000000001';
  const customerB = 'a0000000-0000-4000-a000-000000000002';
  const staffOwner = 'a0000000-0000-4000-a000-000000000003';
  const staffCourier = 'a0000000-0000-4000-a000-000000000004';

  await db.exec(`
    INSERT INTO auth.users (id, email)
    VALUES 
      ('${customerA}', 'customerA@test.com'),
      ('${customerB}', 'customerB@test.com'),
      ('${staffOwner}', 'owner@test.com'),
      ('${staffCourier}', 'courier@test.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, phone, full_name, role, is_active)
    VALUES 
      ('${customerA}', '9876543210', 'Customer A', 'customer', true),
      ('${customerB}', '9876543211', 'Customer B', 'customer', true),
      ('${staffOwner}', '9876543212', 'Owner Staff', 'owner', true),
      ('${staffCourier}', '9876543213', 'Courier Staff', 'delivery', true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    -- Configure business settings
    UPDATE public.business_settings
    SET 
      advance_payment_enabled = true,
      advance_payment_type = 'fixed',
      advance_payment_amount_paise = 5000,
      price_per_kg_paise = 7900,
      min_weight_kg = 1.0;

    -- Ensure WELCOME50 coupon exists
    INSERT INTO public.coupons (
      code, description, discount_type, discount_value, min_order_paise, max_redemptions, per_customer_limit, total_redemptions, is_active
    ) VALUES (
      'WELCOME50', 'Get 50 off on min order 150', 'fixed', 5000, 15000, 500, 5, 0, true
    ) ON CONFLICT (code) DO UPDATE SET min_order_paise = 15000, discount_value = 5000, per_customer_limit = 5, total_redemptions = 0, is_active = true;
  `);

  const serviceRes = await db.query(`SELECT id FROM public.services WHERE is_active = true ORDER BY display_order ASC LIMIT 1;`);
  const serviceId = serviceRes.rows[0].id;

  // 4. Test all 10 priority scenarios
  console.log('\n[4/4] Executing 10 Audit Verification Scenarios...');

  // Scenario 1: Customer creates booking with coupon below minimum -> reservation created, no discount
  await db.exec(`SET request.jwt.claim.sub = '${customerA}'; SET request.jwt.claim.role = 'authenticated';`);
  const booking1Res = await db.query(`
    SELECT * FROM public.create_booking_idempotent(
      'audit-sub-001',
      'Customer A',
      '9876543210',
      '123 Main Street',
      'Near Park',
      '560001',
      CURRENT_DATE,
      'Morning (08:00 AM - 11:00 AM)',
      '${serviceId}',
      12.9716,
      77.5946,
      'Test notes',
      'WELCOME50',
      0
    );
  `);
  const order1 = booking1Res.rows[0];
  if (order1.discount_paise !== 0) throw new Error(`Scenario 1 Failed: Expected discount_paise 0, got ${order1.discount_paise}`);
  const res1Check = await db.query(`SELECT status FROM public.coupon_reservations WHERE order_id = '${order1.id}';`);
  if (res1Check.rows[0]?.status !== 'reserved') throw new Error(`Scenario 1 Failed: Expected reservation status 'reserved', got ${res1Check.rows[0]?.status}`);
  console.log('  ✓ Scenario 1: Customer creates booking with coupon below minimum → reservation created, no discount.');

  // Scenario 2: Associate weighs above minimum -> discount applied, redemption created
  // Owner assigns pickup courier
  await db.exec(`
    SET request.jwt.claim.sub = '${staffOwner}';
    UPDATE public.orders SET assigned_pickup_id = '${staffCourier}', order_status = 'pickup_assigned' WHERE id = '${order1.id}';
    SET request.jwt.claim.sub = '${staffCourier}';
  `);
  const weighAboveRes = await db.query(`
    SELECT public.record_courier_pickup_collection('${order1.id}', 3.00, 'Weighed 3 kg') AS res;
  `);
  const weighAboveData = weighAboveRes.rows[0].res;
  if (weighAboveData.discount_paise !== 5000) throw new Error(`Scenario 2 Failed: Expected discount 5000, got ${weighAboveData.discount_paise}`);
  const redCheck = await db.query(`SELECT count(*) as cnt FROM public.coupon_redemptions WHERE order_id = '${order1.id}';`);
  if (parseInt(redCheck.rows[0].cnt, 10) !== 1) throw new Error(`Scenario 2 Failed: Redemption row missing`);
  console.log('  ✓ Scenario 2: Associate weighs above minimum → discount applied (₹50), redemption created.');

  // Scenario 3: Associate weighs below minimum -> discount 0, reservation marked unqualified
  await db.exec(`SET request.jwt.claim.sub = '${customerB}';`);
  const booking2Res = await db.query(`
    SELECT * FROM public.create_booking_idempotent(
      'audit-sub-002',
      'Customer B',
      '9876543211',
      '456 High Street',
      'Near Station',
      '560008',
      CURRENT_DATE,
      'Morning (08:00 AM - 11:00 AM)',
      '${serviceId}',
      12.9716,
      77.5946,
      'Light load',
      'WELCOME50',
      0
    );
  `);
  const order2 = booking2Res.rows[0];
  // Owner assigns pickup courier
  await db.exec(`
    SET request.jwt.claim.sub = '${staffOwner}';
    UPDATE public.orders SET assigned_pickup_id = '${staffCourier}', order_status = 'pickup_assigned' WHERE id = '${order2.id}';
    SET request.jwt.claim.sub = '${staffCourier}';
  `);
  const weighBelowRes = await db.query(`
    SELECT public.record_courier_pickup_collection('${order2.id}', 1.00, 'Weighed 1 kg') AS res;
  `);
  const weighBelowData = weighBelowRes.rows[0].res;
  if (weighBelowData.discount_paise !== 0) throw new Error(`Scenario 3 Failed: Underweight order should have 0 discount`);
  const res2Check = await db.query(`SELECT status FROM public.coupon_reservations WHERE order_id = '${order2.id}';`);
  if (res2Check.rows[0]?.status !== 'unqualified') throw new Error(`Scenario 3 Failed: Expected unqualified reservation, got ${res2Check.rows[0]?.status}`);
  console.log('  ✓ Scenario 3: Associate weighs below minimum → discount 0, reservation marked unqualified.');

  // Scenario 4: Customer submits manual UPI -> status is pending/initiated, paid_amount_paise unchanged
  await db.exec(`SET request.jwt.claim.sub = '${customerB}';`);
  const custUpiRes = await db.query(`
    SELECT public.record_order_payment(
      '${order2.id}',
      7900,
      'upi_manual',
      'UTR-CUST-AUDIT-001',
      'Customer paid full amount via GPay',
      'idemp-cust-001',
      'full'
    ) AS res;
  `);
  const custUpiData = custUpiRes.rows[0].res;
  if (custUpiData.status !== 'initiated') throw new Error(`Scenario 4 Failed: Customer payment should have status 'initiated', got ${custUpiData.status}`);
  const order2Check = await db.query(`SELECT paid_amount_paise, payment_status FROM public.orders WHERE id = '${order2.id}';`);
  if (order2Check.rows[0].paid_amount_paise !== 0) throw new Error(`Scenario 4 Failed: paid_amount_paise must remain 0, got ${order2Check.rows[0].paid_amount_paise}`);
  console.log('  ✓ Scenario 4: Customer submits manual UPI → status is initiated, paid_amount_paise unchanged (0).');

  // Scenario 5: Staff confirms manual UPI -> status confirmed, paid_amount_paise increases
  await db.exec(`SET request.jwt.claim.sub = '${staffOwner}';`);
  const staffConfirmRes = await db.query(`
    SELECT public.record_order_payment(
      '${order2.id}',
      7900,
      'upi_manual',
      'UTR-CUST-AUDIT-001',
      'Owner verified bank SMS and confirmed UTR',
      'idemp-staff-001',
      'full'
    ) AS res;
  `);
  const staffConfirmData = staffConfirmRes.rows[0].res;
  if (staffConfirmData.status !== 'confirmed') throw new Error(`Scenario 5 Failed: Staff payment should be 'confirmed', got ${staffConfirmData.status}`);
  const order2AfterConfirm = await db.query(`SELECT paid_amount_paise, payment_status FROM public.orders WHERE id = '${order2.id}';`);
  if (order2AfterConfirm.rows[0].paid_amount_paise !== 7900) throw new Error(`Scenario 5 Failed: paid_amount_paise must be 7900, got ${order2AfterConfirm.rows[0].paid_amount_paise}`);
  if (order2AfterConfirm.rows[0].payment_status !== 'paid') throw new Error(`Scenario 5 Failed: payment_status must be 'paid', got ${order2AfterConfirm.rows[0].payment_status}`);
  console.log('  ✓ Scenario 5: Staff confirms manual UPI → status confirmed, paid_amount_paise increases to ₹79, payment_status paid.');

  // Scenario 6: Customer attempts to pay someone else's order -> rejected
  await db.exec(`SET request.jwt.claim.sub = '${customerA}';`); // Customer A attempts to pay for Customer B's order2
  let crossCustRejected = false;
  try {
    await db.query(`
      SELECT public.record_order_payment(
        '${order2.id}',
        1000,
        'upi_manual',
        'UTR-HACK-002',
        'Attempting cross order attack',
        'idemp-hack-002',
        'full'
      );
    `);
  } catch (err) {
    crossCustRejected = true;
  }
  if (!crossCustRejected) throw new Error('Scenario 6 Failed: Cross-customer payment was NOT rejected!');
  console.log("  ✓ Scenario 6: Customer attempts to pay someone else's order → rejected with authorization exception.");

  // Scenario 7: Customer attempts to confirm their own payment -> rejected / restricted to initiated
  await db.exec(`SET request.jwt.claim.sub = '${customerA}';`);
  // If customer tries to pass cash directly:
  let customerCashRejected = false;
  try {
    await db.query(`
      SELECT public.record_order_payment(
        '${order1.id}',
        5000,
        'cash',
        NULL,
        'Customer trying to self-record cash',
        'idemp-cash-hack-001',
        'balance'
      );
    `);
  } catch (err) {
    customerCashRejected = true;
  }
  if (!customerCashRejected) throw new Error('Scenario 7 Failed: Customer self-recording cash was NOT rejected!');
  console.log('  ✓ Scenario 7: Customer attempts to record/confirm direct cash payment → rejected.');

  // Scenario 8: Refund requested -> must not exceed paid amount
  await db.exec(`SET request.jwt.claim.sub = '${staffOwner}';`);
  let overRefundRejected = false;
  try {
    await db.query(`
      SELECT public.record_order_refund(
        '${order2.id}',
        15000, -- Order only has 7900 paid!
        'Attempting to refund more than paid',
        'UTR-OVERREFUND-001',
        'idemp-overref-001'
      );
    `);
  } catch (err) {
    overRefundRejected = true;
  }
  if (!overRefundRejected) throw new Error('Scenario 8 Failed: Over-refund exceeding paid amount was NOT rejected!');
  console.log('  ✓ Scenario 8: Refund requested exceeding paid amount (₹150 > ₹79) → rejected.');

  // Scenario 9: Refund processed -> paid_amount_paise decreases
  const validRefundRes = await db.query(`
    SELECT public.record_order_refund(
      '${order2.id}',
      3000, -- Refund ₹30 out of ₹79
      'Partial return to customer UPI',
      'UTR-VALID-REFUND-001',
      'idemp-refund-val-001'
    ) AS res;
  `);
  const refundData = validRefundRes.rows[0].res;
  if (refundData.paid_amount_paise !== 4900) throw new Error(`Scenario 9 Failed: Expected remaining paid balance 4900, got ${refundData.paid_amount_paise}`);
  const order2AfterRefund = await db.query(`SELECT paid_amount_paise, payment_status FROM public.orders WHERE id = '${order2.id}';`);
  if (order2AfterRefund.rows[0].paid_amount_paise !== 4900) throw new Error(`Scenario 9 Failed: Order paid_amount_paise was not decreased`);
  if (order2AfterRefund.rows[0].payment_status !== 'partially_refunded') throw new Error(`Scenario 9 Failed: Status should be partially_refunded`);
  console.log('  ✓ Scenario 9: Refund processed (₹30) → paid_amount_paise decreased to ₹49, status partially_refunded.');

  // Scenario 10: Order cancelled -> reservation released, unapplied coupon not counted as redeemed
  await db.exec(`SET request.jwt.claim.sub = '${customerA}';`);
  const booking3Res = await db.query(`
    SELECT * FROM public.create_booking_idempotent(
      'audit-sub-003',
      'Customer A',
      '9876543210',
      '123 Main Street',
      'Near Park',
      '560001',
      CURRENT_DATE,
      'Morning (08:00 AM - 11:00 AM)',
      '${serviceId}',
      12.9716,
      77.5946,
      'Will cancel',
      'WELCOME50',
      0
    );
  `);
  const order3 = booking3Res.rows[0];
  const couponBeforeCancel = await db.query(`SELECT total_redemptions FROM public.coupons WHERE code = 'WELCOME50';`);
  const redemptionsBefore = couponBeforeCancel.rows[0].total_redemptions;

  // Cancel order
  const cancelRes = await db.query(`
    SELECT public.cancel_order_with_batch_sync('${order3.id}', 'Customer requested cancellation') AS res;
  `);
  const cancelData = cancelRes.rows[0].res;
  if (!cancelData.success) throw new Error(`Scenario 10 Failed: Order cancellation failed`);

  const res3Check = await db.query(`SELECT status FROM public.coupon_reservations WHERE order_id = '${order3.id}';`);
  if (res3Check.rows[0]?.status !== 'cancelled') throw new Error(`Scenario 10 Failed: Reservation status should be 'cancelled', got ${res3Check.rows[0]?.status}`);

  const couponAfterCancel = await db.query(`SELECT total_redemptions FROM public.coupons WHERE code = 'WELCOME50';`);
  console.log('    [DEBUG] Redemptions before cancel:', redemptionsBefore, 'after cancel:', couponAfterCancel.rows[0].total_redemptions);
  if (couponAfterCancel.rows[0].total_redemptions !== redemptionsBefore) throw new Error(`Scenario 10 Failed: Unredeemed coupon should not change total_redemptions`);
  console.log('  ✓ Scenario 10: Order cancelled → reservation released (cancelled), unapplied coupon redemptions unchanged.');

  // Bonus Check: Test Store Intake Weighing RPC
  await db.exec(`SET request.jwt.claim.sub = '${staffOwner}';`);
  const storeIntakeRes = await db.query(`
    SELECT public.record_store_intake_weight(
      '${order1.id}',
      3.50,
      'Intake calibration check'
    ) AS res;
  `);
  const storeIntakeData = storeIntakeRes.rows[0].res;
  if (!storeIntakeData.success) throw new Error('Store intake weighing RPC failed');
  console.log('  ✓ Bonus Verification: record_store_intake_weight() executed successfully with Option A reconciliation.');

  // Scenario 11: Direct RPC with unserviceable PIN code (bypassing frontend)
  await db.exec(`SET request.jwt.claim.sub = '${customerA}'; SET request.jwt.claim.role = 'authenticated';`);
  let unserviceableRejected = false;
  try {
    await db.query(`
      SELECT * FROM public.create_booking_idempotent(
        'audit-sub-unserved-01',
        'Customer Unserved',
        '9876543210',
        'Outer Ring Road',
        'Near Flyover',
        '560099',
        CURRENT_DATE,
        'Morning (08:00 AM - 11:00 AM)',
        '${serviceId}',
        12.9716,
        77.5946,
        'Bypass attempt',
        NULL,
        0
      );
    `);
  } catch (err) {
    if (err.message.includes('outside our service coverage')) {
      unserviceableRejected = true;
    } else {
      throw new Error(`Scenario 11 Failed: Expected coverage exception, got: ${err.message}`);
    }
  }
  if (!unserviceableRejected) throw new Error('Scenario 11 Failed: Unserviceable PIN was not rejected by database RPC');
  console.log('  ✓ Scenario 11: Direct RPC with unserviceable PIN code (560099) → rejected by database backend.');

  // Scenario 12: Direct RPC with invalid PIN format
  let invalidFormatRejected = false;
  try {
    await db.query(`
      SELECT * FROM public.create_booking_idempotent(
        'audit-sub-invalid-pin',
        'Customer Invalid Pin',
        '9876543210',
        'Somewhere Street',
        'Near Pole',
        '56003',
        CURRENT_DATE,
        'Morning (08:00 AM - 11:00 AM)',
        '${serviceId}',
        12.9716,
        77.5946,
        'Bypass attempt',
        NULL,
        0
      );
    `);
  } catch (err) {
    if (err.message.includes('valid 6-digit Indian PIN code')) {
      invalidFormatRejected = true;
    } else {
      throw new Error(`Scenario 12 Failed: Expected format exception, got: ${err.message}`);
    }
  }
  if (!invalidFormatRejected) throw new Error('Scenario 12 Failed: Invalid PIN format was not rejected by database RPC');
  console.log('  ✓ Scenario 12: Direct RPC with invalid PIN format (56003) → rejected by database backend.');

  // Scenario 13: Direct INSERT INTO public.orders with unserviceable PIN
  let directInsertRejected = false;
  try {
    await db.query(`
      INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        order_status, payment_status, payment_method,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg, delivery_charge_paise
      ) VALUES (
        gen_random_uuid(), 'SW-BYPASS-01', '${customerA}', 'Hacker', '9876543210',
        'Malicious Address', '560099', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
        'booked', 'pending', 'cash',
        '${serviceId}', 'Wash & Fold', 'per_kg', 7900, 1.0, 0
      );
    `);
  } catch (err) {
    if (err.message.includes('outside our service coverage')) {
      directInsertRejected = true;
    } else {
      throw new Error(`Scenario 13 Failed: Expected coverage trigger exception, got: ${err.message}`);
    }
  }
  if (!directInsertRejected) throw new Error('Scenario 13 Failed: Direct INSERT with unserviceable PIN was not blocked by trigger');
  console.log('  ✓ Scenario 13: Direct INSERT bypass attempt with unserviceable PIN → blocked by trigger.');

  // Scenario 14: Owner expands coverage by adding a new PIN code
  await db.query(`
    INSERT INTO public.service_areas (pincode, area_name, city, state, is_active)
    VALUES ('560068', 'Bommanahalli / Madivala', 'Bengaluru', 'Karnataka', true)
    ON CONFLICT (pincode) DO UPDATE SET is_active = true;
  `);

  const expandedRes = await db.query(`
    SELECT * FROM public.create_booking_idempotent(
      'audit-sub-expanded-01',
      'Bommanahalli Customer',
      '9876543210',
      'Hosur Main Road',
      'Near Junction',
      '560068',
      CURRENT_DATE,
      'Morning (08:00 AM - 11:00 AM)',
      '${serviceId}',
      12.9100,
      77.6200,
      'Expanded area booking',
      NULL,
      0
    );
  `);
  const expandedOrder = expandedRes.rows[0];
  if (!expandedOrder || expandedOrder.pickup_pincode !== '560068') throw new Error('Scenario 14 Failed: Expanded booking failed');
  console.log('  ✓ Scenario 14: Owner adds new service area (560068) → customer booking immediately succeeds.');

  // Scenario 15: Deactivating area prevents new bookings while preserving existing orders & idempotency
  await db.query(`UPDATE public.service_areas SET is_active = false WHERE pincode = '560068';`);

  let deactivatedBookingBlocked = false;
  try {
    await db.query(`
      SELECT * FROM public.create_booking_idempotent(
        'audit-sub-expanded-02',
        'Another Customer',
        '9876543211',
        'Hosur Main Road #20',
        'Near Junction',
        '560068',
        CURRENT_DATE,
        'Morning (08:00 AM - 11:00 AM)',
        '${serviceId}',
        12.9100,
        77.6200,
        'Blocked booking',
        NULL,
        0
      );
    `);
  } catch (err) {
    if (err.message.includes('outside our service coverage')) {
      deactivatedBookingBlocked = true;
    }
  }
  if (!deactivatedBookingBlocked) throw new Error('Scenario 15 Failed: Deactivated area allowed new booking');

  // Idempotency retry of the previously booked order (audit-sub-expanded-01) succeeds
  const retryExisting = await db.query(`
    SELECT * FROM public.create_booking_idempotent(
      'audit-sub-expanded-01',
      'Bommanahalli Customer',
      '9876543210',
      'Hosur Main Road',
      'Near Junction',
      '560068',
      CURRENT_DATE,
      'Morning (08:00 AM - 11:00 AM)',
      '${serviceId}',
      12.9100,
      77.6200,
      'Expanded area booking',
      NULL,
      0
    );
  `);
  if (retryExisting.rows[0].id !== expandedOrder.id) throw new Error('Scenario 15 Failed: Idempotency recovery failed after deactivation');
  console.log('  ✓ Scenario 15: Deactivated PIN (560068) prevents new bookings while existing order and idempotency remain valid.');

  console.log('\n============================================================');
  console.log('ALL 15 PRIORITY AUDIT SCENARIOS PASSED IN ISOLATED POSTGRESQL');
  console.log('============================================================');
}

runAudit().catch(err => {
  console.error('\n❌ AUDIT EXECUTION FAILED:', err);
  process.exit(1);
});
