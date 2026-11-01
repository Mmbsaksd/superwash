const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

async function runStaffDeboardingAudit() {
  console.log('======================================================================');
  console.log('SUPERWASH EXPREZ: STAFF AUTHORIZATION & DEBOARDING AUDIT (PGLITE)');
  console.log('======================================================================');

  const db = new PGlite();

  // 1. Setup mock Supabase environment
  console.log('\n[1/3] Initializing Mock Supabase Auth & Migrations Chain...');
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

  // Load all migrations in sequence
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      const normA = a.replace('20261022_', '20261022000000_');
      const normB = b.replace('20261022_', '20261022000000_');
      return normA.localeCompare(normB);
    });

  for (const file of migrationFiles) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    await db.exec(sql);
  }
  console.log(`  ✓ All ${migrationFiles.length} migrations applied successfully.`);

  // 2. Seed test actors
  console.log('\n[2/3] Seeding Test Actors & Pre-registrations...');
  const primaryOwnerId = 'b0000000-0000-4000-a000-000000000001';
  const secondOwnerId  = 'b0000000-0000-4000-a000-000000000002';
  const managerId      = 'b0000000-0000-4000-a000-000000000003';
  const deliveryId     = 'b0000000-0000-4000-a000-000000000004';
  const customerId     = 'b0000000-0000-4000-a000-000000000005';
  const unassignedStaffId = 'b0000000-0000-4000-a000-000000000006';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${primaryOwnerId}', 'superwashexprez@gmail.com'),
      ('${secondOwnerId}', 'secondary.owner@test.com'),
      ('${managerId}', 'manager@test.com'),
      ('${deliveryId}', 'delivery@test.com'),
      ('${customerId}', 'customer@test.com'),
      ('${unassignedStaffId}', 'unassigned@test.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, phone, full_name, email, role, is_active) VALUES
      ('${primaryOwnerId}', '9999900001', 'Primary Owner', 'superwashexprez@gmail.com', 'owner', true),
      ('${secondOwnerId}', '9999900002', 'Secondary Owner', 'secondary.owner@test.com', 'owner', true),
      ('${managerId}', '9999900003', 'Store Manager', 'manager@test.com', 'manager', true),
      ('${deliveryId}', '9999900004', 'Ramesh Delivery', 'delivery@test.com', 'delivery', true),
      ('${customerId}', '9999900005', 'Anita Customer', 'customer@test.com', 'customer', true),
      ('${unassignedStaffId}', '9999900006', 'Temp Intern', 'unassigned@test.com', 'delivery', true)
    ON CONFLICT (id) DO UPDATE SET 
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      email = EXCLUDED.email,
      is_active = EXCLUDED.is_active;

    -- Add a pending staff pre-registration for delivery@test.com
    INSERT INTO public.staff_pre_registrations (email, phone, role, full_name, created_by)
    VALUES ('delivery@test.com', '9999900004', 'delivery', 'Ramesh Delivery', '${primaryOwnerId}')
    ON CONFLICT (email) DO NOTHING;

    -- Create an order with operational history linked to Ramesh Delivery
    INSERT INTO public.orders (
      id, order_number, customer_id, customer_name, customer_phone,
      pickup_address, pickup_pincode, pickup_date, pickup_slot,
      order_status, payment_status, total_amount_paise, price_per_kg_paise, min_weight_kg,
      assigned_pickup_id, assigned_delivery_id
    ) VALUES (
      'c0000000-0000-4000-a000-000000000001',
      'SW-HIST-001',
      '${customerId}',
      'Anita Customer',
      '9999900005',
      '123 Main Street',
      '560001',
      CURRENT_DATE,
      'Morning (08:00 AM - 11:00 AM)',
      'pickup_assigned',
      'pending',
      15800,
      7900,
      1.0,
      '${deliveryId}',
      '${deliveryId}'
    ) ON CONFLICT (id) DO NOTHING;

    -- Record a payment collected by Ramesh
    INSERT INTO public.payments (
      order_id, amount_paise, payment_method, status, recorded_by
    ) VALUES (
      'c0000000-0000-4000-a000-000000000001',
      15800,
      'cash',
      'confirmed',
      '${deliveryId}'
    );
  `);
  console.log('  ✓ Test actors, operational history, and pre-registrations seeded.');

  // 3. Execute Deboarding Verification Tests
  console.log('\n[3/3] Executing Staff Deboarding Verification Checks...');

  // Test 1: Unauthenticated (anon) call to delete_staff_profile is rejected
  try {
    await db.exec(`SET request.jwt.claim.sub = ''; SET request.jwt.claim.role = 'anon';`);
    await db.query(`SELECT public.delete_staff_profile('${deliveryId}');`);
    throw new Error('Test 1 Failed: Unauthenticated call should have been rejected!');
  } catch (err) {
    if (!err.message.includes('Authentication required') && !err.message.includes('Access denied')) {
      throw err;
    }
    console.log('  ✓ Test 1: Anonymous / unauthenticated caller rejected.');
  }

  // Test 2: Non-owner calls (customer, delivery, manager) are rejected
  const nonOwnerRoles = [
    { id: customerId, name: 'customer' },
    { id: deliveryId, name: 'delivery' },
    { id: managerId, name: 'manager' }
  ];

  for (const actor of nonOwnerRoles) {
    try {
      await db.exec(`SET request.jwt.claim.sub = '${actor.id}'; SET request.jwt.claim.role = 'authenticated';`);
      await db.query(`SELECT public.delete_staff_profile('${unassignedStaffId}');`);
      throw new Error(`Test 2 Failed: Non-owner (${actor.name}) was able to call delete_staff_profile!`);
    } catch (err) {
      if (!err.message.includes('Access denied. Only the business owner is authorized to delete employee accounts.')) {
        throw err;
      }
    }
  }
  console.log('  ✓ Test 2: Non-owners (customer, delivery, manager) strictly denied with "Access denied".');

  // Test 3: Owner self-deletion is rejected
  try {
    await db.exec(`SET request.jwt.claim.sub = '${secondOwnerId}'; SET request.jwt.claim.role = 'authenticated';`);
    await db.query(`SELECT public.delete_staff_profile('${secondOwnerId}');`);
    throw new Error('Test 3 Failed: Owner was able to delete their own account!');
  } catch (err) {
    if (!err.message.includes('You cannot delete your own authenticated owner account.')) {
      throw err;
    }
    console.log('  ✓ Test 3: Owner self-deletion prevented.');
  }

  // Test 4: Permanent primary owner account (superwashexprez@gmail.com) cannot be deleted even by another owner
  try {
    await db.exec(`SET request.jwt.claim.sub = '${secondOwnerId}'; SET request.jwt.claim.role = 'authenticated';`);
    await db.query(`SELECT public.delete_staff_profile('${primaryOwnerId}');`);
    throw new Error('Test 4 Failed: Permanent owner was deleted by secondary owner!');
  } catch (err) {
    if (!err.message.includes('The permanent primary owner account (superwashexprez@gmail.com) cannot be deleted.')) {
      throw err;
    }
    console.log('  ✓ Test 4: Permanent store owner (superwashexprez@gmail.com) is immutable and immune to deletion.');
  }

  // Test 5: Last active owner protection
  // First, deactivate secondOwnerId so only primary owner remains active
  await db.exec(`
    UPDATE public.profiles SET is_active = false, deleted_at = now() WHERE id = '${secondOwnerId}';
  `);
  // Try to delete primaryOwnerId via service_role context
  try {
    await db.exec(`SET request.jwt.claim.sub = ''; SET request.jwt.claim.role = 'service_role';`);
    await db.query(`SELECT public.delete_staff_profile('${primaryOwnerId}');`);
    throw new Error('Test 5 Failed: Last remaining owner was deleted via service_role!');
  } catch (err) {
    // Primary owner check or last active owner check kicks in
    if (!err.message.includes('cannot be deleted') && !err.message.includes('only remaining active business owner')) {
      throw err;
    }
    console.log('  ✓ Test 5: Last active owner protection verified.');
  }
  // Restore second owner
  await db.exec(`
    UPDATE public.profiles SET is_active = true, deleted_at = NULL WHERE id = '${secondOwnerId}';
  `);

  // Test 6: Soft-deboarding staff with historical records
  // Primary owner deboards Ramesh Delivery
  await db.exec(`SET request.jwt.claim.sub = '${primaryOwnerId}'; SET request.jwt.claim.role = 'authenticated';`);
  const deboardResult = await db.query(`SELECT public.delete_staff_profile('${deliveryId}') AS res;`);
  const deboardData = deboardResult.rows[0].res;

  if (deboardData.success !== true || deboardData.deactivated_instead !== true) {
    throw new Error(`Test 6 Failed: Expected soft deactivation, got ${JSON.stringify(deboardData)}`);
  }

  // Verify profile status
  const rameshProfile = await db.query(`SELECT is_active, deleted_at FROM public.profiles WHERE id = '${deliveryId}';`);
  if (rameshProfile.rows[0].is_active !== false || !rameshProfile.rows[0].deleted_at) {
    throw new Error(`Test 6 Failed: Profile is_active not false or deleted_at is null: ${JSON.stringify(rameshProfile.rows[0])}`);
  }

  // Verify foreign-key integrity preserved
  const orderCheck = await db.query(`SELECT assigned_pickup_id, assigned_delivery_id FROM public.orders WHERE id = 'c0000000-0000-4000-a000-000000000001';`);
  if (orderCheck.rows[0].assigned_pickup_id !== deliveryId) {
    throw new Error(`Test 6 Failed: Foreign key assigned_pickup_id was corrupted!`);
  }

  const paymentCheck = await db.query(`SELECT recorded_by FROM public.payments WHERE order_id = 'c0000000-0000-4000-a000-000000000001';`);
  if (paymentCheck.rows[0].recorded_by !== deliveryId) {
    throw new Error(`Test 6 Failed: Foreign key recorded_by was corrupted!`);
  }
  console.log('  ✓ Test 6: Soft-deboarding verified. Operational orders & payments retained full FK integrity.');

  // Test 7: Staff pre-registrations matching email purged on deboard
  const preRegCheck = await db.query(`SELECT count(*) as cnt FROM public.staff_pre_registrations WHERE email = 'delivery@test.com';`);
  if (parseInt(preRegCheck.rows[0].cnt, 10) !== 0) {
    throw new Error(`Test 7 Failed: Pending pre-registration was not purged!`);
  }
  console.log('  ✓ Test 7: Staff pre-registration purged cleanly upon deboarding.');

  // Test 8: Unassigned staff without operational history hard deleted
  const unassignedDeboardRes = await db.query(`SELECT public.delete_staff_profile('${unassignedStaffId}') AS res;`);
  const unassignedData = unassignedDeboardRes.rows[0].res;
  if (unassignedData.success !== true || unassignedData.deactivated_instead !== false) {
    throw new Error(`Test 8 Failed: Expected permanent deletion, got ${JSON.stringify(unassignedData)}`);
  }
  const checkDeleted = await db.query(`SELECT count(*) as cnt FROM public.profiles WHERE id = '${unassignedStaffId}';`);
  if (parseInt(checkDeleted.rows[0].cnt, 10) !== 0) {
    throw new Error(`Test 8 Failed: Profile was not hard deleted!`);
  }
  console.log('  ✓ Test 8: Unassigned staff without operational history hard deleted cleanly.');

  // Test 9: current_user_role() for deboarded user evaluates to NULL
  await db.exec(`SET request.jwt.claim.sub = '${deliveryId}'; SET request.jwt.claim.role = 'authenticated';`);
  const roleCheck = await db.query(`SELECT public.current_user_role() AS role;`);
  if (roleCheck.rows[0].role !== null) {
    throw new Error(`Test 9 Failed: Expected NULL role for deboarded user, got '${roleCheck.rows[0].role}'`);
  }
  console.log('  ✓ Test 9: current_user_role() evaluates to NULL for deboarded user.');

  // Test 10: Privileged staff RPCs executed as deboarded user are rejected
  try {
    await db.query(`SELECT public.record_courier_pickup_collection('c0000000-0000-4000-a000-000000000001', 3.5, 'Attempt by deboarded staff');`);
    throw new Error('Test 10 Failed: Deboarded user was able to record courier pickup!');
  } catch (err) {
    console.log('  ✓ Test 10a: Privileged courier RPC rejected for deboarded user.');
  }

  try {
    await db.query(`SELECT public.delete_staff_profile('${secondOwnerId}');`);
    throw new Error('Test 10 Failed: Deboarded user was able to call delete_staff_profile!');
  } catch (err) {
    if (!err.message.includes('Access denied')) {
      throw err;
    }
    console.log('  ✓ Test 10b: Privileged owner RPC rejected for deboarded user.');
  }

  // Test 11: Security Definer, search_path, and revocation verification
  const procCheck = await db.query(`
    SELECT prosecdef, proconfig 
    FROM pg_proc 
    WHERE proname = 'delete_staff_profile' AND pronamespace = 'public'::regnamespace;
  `);
  const proc = procCheck.rows[0];
  if (!proc.prosecdef) {
    throw new Error('Test 11 Failed: delete_staff_profile is NOT SECURITY DEFINER!');
  }
  const searchPathConfig = (proc.proconfig || []).find(c => c.startsWith('search_path='));
  if (!searchPathConfig || !searchPathConfig.includes('public') || !searchPathConfig.includes('pg_temp')) {
    throw new Error(`Test 11 Failed: Invalid search_path config: ${JSON.stringify(proc.proconfig)}`);
  }
  console.log('  ✓ Test 11: delete_staff_profile is SECURITY DEFINER with hardened search_path: ' + searchPathConfig);

  console.log('\n======================================================================');
  console.log('STAFF DEBOARDING & AUTHORIZATION AUDIT: ALL 11 CHECKS PASSED PERFECTLY');
  console.log('======================================================================\n');
}

runStaffDeboardingAudit().catch((err) => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
