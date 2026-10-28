-- ==============================================================================
-- SuperWash Stage 5B Phase 2B: Suite B - Exhaustive Privileges and Security
-- ==============================================================================

\set ON_ERROR_STOP off
CREATE TEMP TABLE suite_b_results (
    test_id TEXT PRIMARY KEY,
    role_tested TEXT,
    operation TEXT,
    expected_sqlstate TEXT,
    actual_sqlstate TEXT,
    status TEXT,
    details TEXT
);

-- Seed a test customer user and profile
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
BEGIN
    INSERT INTO auth.users (id, email)
    VALUES (v_cust_id, 'customer_a@test.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (v_cust_id, 'customer_a@test.com', 'Customer A', '9876543210', 'customer')
    ON CONFLICT (id) DO NOTHING;
END $$;

-- 1. Catalog Verification: Check all 47 columns for anon, authenticated, service_role, PUBLIC
DO $$
DECLARE
    r RECORD;
    v_priv RECORD;
    v_fail_count INT := 0;
    v_allowed_update_count INT := 0;
BEGIN
    -- Check table-level write privileges
    FOR r IN
        SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']) AS rname
    LOOP
        IF has_table_privilege(r.rname, 'public.orders', 'INSERT') THEN
            INSERT INTO suite_b_results VALUES ('B1_TBL_INS_' || r.rname, r.rname, 'INSERT', 'NO PRIVILEGE', 'HAS PRIVILEGE', 'FAIL', 'Role has unwanted table INSERT');
            v_fail_count := v_fail_count + 1;
        ELSE
            INSERT INTO suite_b_results VALUES ('B1_TBL_INS_' || r.rname, r.rname, 'INSERT', 'NO PRIVILEGE', 'NO PRIVILEGE', 'PASS', 'Table INSERT denied as expected');
        END IF;

        IF has_table_privilege(r.rname, 'public.orders', 'DELETE') THEN
            INSERT INTO suite_b_results VALUES ('B1_TBL_DEL_' || r.rname, r.rname, 'DELETE', 'NO PRIVILEGE', 'HAS PRIVILEGE', 'FAIL', 'Role has unwanted table DELETE');
            v_fail_count := v_fail_count + 1;
        ELSE
            INSERT INTO suite_b_results VALUES ('B1_TBL_DEL_' || r.rname, r.rname, 'DELETE', 'NO PRIVILEGE', 'NO PRIVILEGE', 'PASS', 'Table DELETE denied as expected');
        END IF;

        IF has_table_privilege(r.rname, 'public.orders', 'TRUNCATE') THEN
            INSERT INTO suite_b_results VALUES ('B1_TBL_TRUNC_' || r.rname, r.rname, 'TRUNCATE', 'NO PRIVILEGE', 'HAS PRIVILEGE', 'FAIL', 'Role has unwanted table TRUNCATE');
            v_fail_count := v_fail_count + 1;
        ELSE
            INSERT INTO suite_b_results VALUES ('B1_TBL_TRUNC_' || r.rname, r.rname, 'TRUNCATE', 'NO PRIVILEGE', 'NO PRIVILEGE', 'PASS', 'Table TRUNCATE denied as expected');
        END IF;

        IF has_table_privilege(r.rname, 'public.orders', 'TRIGGER') THEN
            INSERT INTO suite_b_results VALUES ('B1_TBL_TRIG_' || r.rname, r.rname, 'TRIGGER', 'NO PRIVILEGE', 'HAS PRIVILEGE', 'FAIL', 'Role has unwanted table TRIGGER');
            v_fail_count := v_fail_count + 1;
        ELSE
            INSERT INTO suite_b_results VALUES ('B1_TBL_TRIG_' || r.rname, r.rname, 'TRIGGER', 'NO PRIVILEGE', 'NO PRIVILEGE', 'PASS', 'Table TRIGGER denied as expected');
        END IF;
    END LOOP;

    -- Check table-level PUBLIC grants in pg_class
    SELECT relacl INTO v_priv FROM pg_class WHERE relname = 'orders' AND relnamespace = 'public'::regnamespace;
    IF v_priv.relacl::text LIKE '%=w/%' OR v_priv.relacl::text LIKE '%=a/%' OR v_priv.relacl::text LIKE '%=d/%' OR v_priv.relacl::text LIKE '%=D/%' OR v_priv.relacl::text LIKE '%=t/%' THEN
        INSERT INTO suite_b_results VALUES ('B1_TBL_PUBLIC', 'PUBLIC', 'WRITE/TRIGGER', 'NO ACL', v_priv.relacl::text, 'FAIL', 'PUBLIC pseudo-role has write/trigger table privileges in ACL');
    ELSE
        INSERT INTO suite_b_results VALUES ('B1_TBL_PUBLIC', 'PUBLIC', 'WRITE/TRIGGER', 'NO ACL', 'CLEAN', 'PASS', 'PUBLIC has no write/trigger privileges on public.orders');
    END IF;

    -- Column-level assertions across all columns
    FOR r IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
    LOOP
        -- anon INSERT
        IF has_column_privilege('anon', 'public.orders', r.column_name, 'INSERT') THEN
            v_fail_count := v_fail_count + 1;
        END IF;
        -- anon UPDATE
        IF has_column_privilege('anon', 'public.orders', r.column_name, 'UPDATE') THEN
            v_fail_count := v_fail_count + 1;
        END IF;
        -- authenticated INSERT
        IF has_column_privilege('authenticated', 'public.orders', r.column_name, 'INSERT') THEN
            v_fail_count := v_fail_count + 1;
        END IF;
        -- authenticated UPDATE: must be FALSE for all except delivery_notes
        IF has_column_privilege('authenticated', 'public.orders', r.column_name, 'UPDATE') THEN
            IF r.column_name = 'delivery_notes' THEN
                v_allowed_update_count := v_allowed_update_count + 1;
            ELSE
                v_fail_count := v_fail_count + 1;
            END IF;
        END IF;
        -- service_role INSERT
        IF has_column_privilege('service_role', 'public.orders', r.column_name, 'INSERT') THEN
            v_fail_count := v_fail_count + 1;
        END IF;
        -- service_role UPDATE
        IF has_column_privilege('service_role', 'public.orders', r.column_name, 'UPDATE') THEN
            v_fail_count := v_fail_count + 1;
        END IF;
    END LOOP;

    IF v_fail_count = 0 AND v_allowed_update_count = 1 THEN
        INSERT INTO suite_b_results VALUES ('B2_COL_CATALOG', 'ALL ROLES', 'INSERT/UPDATE', 'ONLY delivery_notes', 'MATCH', 'PASS', 'Direct writes denied across all 47 columns; only delivery_notes granted to authenticated');
    ELSE
        INSERT INTO suite_b_results VALUES ('B2_COL_CATALOG', 'ALL ROLES', 'INSERT/UPDATE', 'ONLY delivery_notes', 'FAIL', 'FAIL', 'Unexpected column privileges found: fail_count=' || v_fail_count || ', allowed_updates=' || v_allowed_update_count);
    END IF;

    -- Check column-level PUBLIC grants in pg_attribute (pseudo-role PUBLIC has empty name before '=')
    SELECT count(*) INTO v_fail_count
    FROM pg_attribute
    WHERE attrelid = 'public.orders'::regclass
      AND attnum > 0
      AND NOT attisdropped
      AND (attacl::text ~ '(^|[,{])=[wa]/');

    IF v_fail_count = 0 THEN
        INSERT INTO suite_b_results VALUES ('B2_COL_PUBLIC_ACL', 'PUBLIC', 'INSERT/UPDATE', 'NO ACL', '0 ACL entries', 'PASS', 'PUBLIC pseudo-role has no column write grants in pg_attribute');
    ELSE
        INSERT INTO suite_b_results VALUES ('B2_COL_PUBLIC_ACL', 'PUBLIC', 'INSERT/UPDATE', 'NO ACL', v_fail_count || ' ACL entries', 'FAIL', 'PUBLIC pseudo-role has unwanted column write grants');
    END IF;
END $$;

-- 2. Execution-Time Verification: Attempt direct writes under roles and record SQLSTATE
-- Test B3: Direct INSERT under anon
DO $$
DECLARE
    v_sqlstate TEXT := '00000';
    v_msg TEXT := '';
BEGIN
    SET LOCAL ROLE anon;
    INSERT INTO public.orders (order_number, customer_id, customer_name, customer_phone, pickup_address, pickup_pincode, pickup_date, pickup_slot)
    VALUES ('ORD-TEST-ANON', '11111111-1111-4111-a111-111111111111'::uuid, 'Anon Cust', '9876543210', 'Addr', '560038', CURRENT_DATE, '09:00 - 12:00');
    RESET ROLE;
    INSERT INTO suite_b_results VALUES ('B3_ATTEMPT_INS_ANON', 'anon', 'INSERT', '42501', '00000', 'FAIL', 'Direct INSERT unexpectedly succeeded');
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RESET ROLE;
    IF v_sqlstate = '42501' THEN
        INSERT INTO suite_b_results VALUES ('B3_ATTEMPT_INS_ANON', 'anon', 'INSERT', '42501', v_sqlstate, 'PASS', 'Permission denied as expected: ' || v_msg);
    ELSE
        INSERT INTO suite_b_results VALUES ('B3_ATTEMPT_INS_ANON', 'anon', 'INSERT', '42501', v_sqlstate, 'FAIL', 'Unexpected error: ' || v_msg);
    END IF;
END $$;

-- Test B4: Direct INSERT under authenticated
DO $$
DECLARE
    v_sqlstate TEXT := '00000';
    v_msg TEXT := '';
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    INSERT INTO public.orders (order_number, customer_id, customer_name, customer_phone, pickup_address, pickup_pincode, pickup_date, pickup_slot)
    VALUES ('ORD-TEST-AUTH', '11111111-1111-4111-a111-111111111111'::uuid, 'Auth Cust', '9876543210', 'Addr', '560038', CURRENT_DATE, '09:00 - 12:00');
    RESET ROLE;
    INSERT INTO suite_b_results VALUES ('B4_ATTEMPT_INS_AUTH', 'authenticated', 'INSERT', '42501', '00000', 'FAIL', 'Direct INSERT unexpectedly succeeded');
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RESET ROLE;
    IF v_sqlstate = '42501' THEN
        INSERT INTO suite_b_results VALUES ('B4_ATTEMPT_INS_AUTH', 'authenticated', 'INSERT', '42501', v_sqlstate, 'PASS', 'Permission denied as expected: ' || v_msg);
    ELSE
        INSERT INTO suite_b_results VALUES ('B4_ATTEMPT_INS_AUTH', 'authenticated', 'INSERT', '42501', v_sqlstate, 'FAIL', 'Unexpected error: ' || v_msg);
    END IF;
END $$;

-- Test B5: Direct INSERT under service_role
DO $$
DECLARE
    v_sqlstate TEXT := '00000';
    v_msg TEXT := '';
BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.orders (order_number, customer_id, customer_name, customer_phone, pickup_address, pickup_pincode, pickup_date, pickup_slot)
    VALUES ('ORD-TEST-SRV', '11111111-1111-4111-a111-111111111111'::uuid, 'SRV Cust', '9876543210', 'Addr', '560038', CURRENT_DATE, '09:00 - 12:00');
    RESET ROLE;
    INSERT INTO suite_b_results VALUES ('B5_ATTEMPT_INS_SRV', 'service_role', 'INSERT', '42501', '00000', 'FAIL', 'Direct INSERT unexpectedly succeeded');
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RESET ROLE;
    IF v_sqlstate = '42501' THEN
        INSERT INTO suite_b_results VALUES ('B5_ATTEMPT_INS_SRV', 'service_role', 'INSERT', '42501', v_sqlstate, 'PASS', 'Permission denied as expected: ' || v_msg);
    ELSE
        INSERT INTO suite_b_results VALUES ('B5_ATTEMPT_INS_SRV', 'service_role', 'INSERT', '42501', v_sqlstate, 'FAIL', 'Unexpected error: ' || v_msg);
    END IF;
END $$;

-- Seed an order as postgres / SECURITY DEFINER for update tests
DO $$
BEGIN
    DELETE FROM public.orders WHERE id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid;

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        assigned_delivery_id,
        order_status, price_per_kg_paise, min_weight_kg, total_amount_paise, discount_paise
    ) VALUES (
        'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid,
        'ORD-TEST-0001',
        '11111111-1111-4111-a111-111111111111'::uuid,
        'Customer A', '9876543210',
        'Indiranagar Test Road', '560038', CURRENT_DATE, '09:00 - 12:00',
        '00000000-0000-4000-a000-000000000003'::uuid,
        'booked', 7900, 1.00, 50000, 0
    );
END $$;

-- Test B6: Direct UPDATE on discount_paise under authenticated (must fail 42501)
DO $$
DECLARE
    v_sqlstate TEXT := '00000';
    v_msg TEXT := '';
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000003', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    UPDATE public.orders
    SET discount_paise = 10000
    WHERE id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid;
    RESET ROLE;
    INSERT INTO suite_b_results VALUES ('B6_ATTEMPT_UPD_DISCOUNT_AUTH', 'authenticated', 'UPDATE', '42501', '00000', 'FAIL', 'Direct UPDATE discount_paise unexpectedly succeeded');
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RESET ROLE;
    IF v_sqlstate = '42501' THEN
        INSERT INTO suite_b_results VALUES ('B6_ATTEMPT_UPD_DISCOUNT_AUTH', 'authenticated', 'UPDATE', '42501', v_sqlstate, 'PASS', 'Permission denied as expected: ' || v_msg);
    ELSE
        INSERT INTO suite_b_results VALUES ('B6_ATTEMPT_UPD_DISCOUNT_AUTH', 'authenticated', 'UPDATE', '42501', v_sqlstate, 'FAIL', 'Unexpected error: ' || v_msg);
    END IF;
END $$;

-- Test B7: Direct UPDATE on delivery_notes under authenticated by ASSIGNED courier (must SUCCEED and update 1 row)
DO $$
DECLARE
    v_sqlstate TEXT := '00000';
    v_msg TEXT := '';
    v_rows INT := 0;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000003', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    UPDATE public.orders
    SET delivery_notes = 'Gate code #4412'
    WHERE id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    IF v_rows = 1 THEN
        INSERT INTO suite_b_results VALUES ('B7_ATTEMPT_UPD_NOTES_ASSIGNED_COURIER', 'authenticated', 'UPDATE', '00000 (1 row)', '00000 (1 row)', 'PASS', 'Allowed under authenticated RLS policy as expected, 1 row updated');
    ELSE
        INSERT INTO suite_b_results VALUES ('B7_ATTEMPT_UPD_NOTES_ASSIGNED_COURIER', 'authenticated', 'UPDATE', '00000 (1 row)', '00000 (' || v_rows || ' rows)', 'FAIL', 'Expected 1 row updated, got ' || v_rows);
    END IF;
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RESET ROLE;
    INSERT INTO suite_b_results VALUES ('B7_ATTEMPT_UPD_NOTES_ASSIGNED_COURIER', 'authenticated', 'UPDATE', '00000 (1 row)', v_sqlstate, 'FAIL', 'Failed to update delivery_notes: ' || v_msg);
END $$;

-- Test B8a: Direct UPDATE on delivery_notes under authenticated by CUSTOMER (RLS must update 0 rows)
DO $$
DECLARE
    v_rows_affected INT := 0;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    UPDATE public.orders
    SET delivery_notes = 'Customer direct update attempt'
    WHERE id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid;
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RESET ROLE;
    IF v_rows_affected = 0 THEN
        INSERT INTO suite_b_results VALUES ('B8A_ATTEMPT_UPD_NOTES_CUSTOMER', 'authenticated', 'UPDATE (0 rows)', '0 rows', '0 rows', 'PASS', 'RLS prevented direct customer update (0 rows affected)');
    ELSE
        INSERT INTO suite_b_results VALUES ('B8A_ATTEMPT_UPD_NOTES_CUSTOMER', 'authenticated', 'UPDATE (0 rows)', '0 rows', v_rows_affected || ' rows', 'FAIL', 'RLS leaked customer direct update!');
    END IF;
END $$;

-- Test B8b: Direct UPDATE on delivery_notes under authenticated by UNASSIGNED courier (RLS must update 0 rows)
DO $$
DECLARE
    v_rows_affected INT := 0;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000004', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    UPDATE public.orders
    SET delivery_notes = 'Unassigned courier update attempt'
    WHERE id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid;
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RESET ROLE;
    IF v_rows_affected = 0 THEN
        INSERT INTO suite_b_results VALUES ('B8B_ATTEMPT_UPD_NOTES_UNASSIGNED_COURIER', 'authenticated', 'UPDATE (0 rows)', '0 rows', '0 rows', 'PASS', 'RLS prevented unassigned courier update (0 rows affected)');
    ELSE
        INSERT INTO suite_b_results VALUES ('B8B_ATTEMPT_UPD_NOTES_UNASSIGNED_COURIER', 'authenticated', 'UPDATE (0 rows)', '0 rows', v_rows_affected || ' rows', 'FAIL', 'RLS leaked unassigned courier update!');
    END IF;
END $$;

-- Test B8c: Direct UPDATE on delivery_notes under authenticated by STORE MANAGER (RLS must update 1 row)
DO $$
DECLARE
    v_rows_affected INT := 0;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    UPDATE public.orders
    SET delivery_notes = 'Manager note added'
    WHERE id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid;
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RESET ROLE;
    IF v_rows_affected = 1 THEN
        INSERT INTO suite_b_results VALUES ('B8C_ATTEMPT_UPD_NOTES_MANAGER', 'authenticated', 'UPDATE (1 row)', '1 row', '1 row', 'PASS', 'Manager can update delivery_notes under RLS as expected');
    ELSE
        INSERT INTO suite_b_results VALUES ('B8C_ATTEMPT_UPD_NOTES_MANAGER', 'authenticated', 'UPDATE (1 row)', '1 row', v_rows_affected || ' rows', 'FAIL', 'Manager failed to update delivery_notes');
    END IF;
END $$;

-- Test B9: Direct UPDATE on order_status under service_role (must fail 42501)
DO $$
DECLARE
    v_sqlstate TEXT := '00000';
    v_msg TEXT := '';
BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.orders
    SET order_status = 'completed'
    WHERE id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid;
    RESET ROLE;
    INSERT INTO suite_b_results VALUES ('B9_ATTEMPT_UPD_STATUS_SRV', 'service_role', 'UPDATE', '42501', '00000', 'FAIL', 'Direct UPDATE unexpectedly succeeded');
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RESET ROLE;
    IF v_sqlstate = '42501' THEN
        INSERT INTO suite_b_results VALUES ('B9_ATTEMPT_UPD_STATUS_SRV', 'service_role', 'UPDATE', '42501', v_sqlstate, 'PASS', 'Permission denied as expected: ' || v_msg);
    ELSE
        INSERT INTO suite_b_results VALUES ('B9_ATTEMPT_UPD_STATUS_SRV', 'service_role', 'UPDATE', '42501', v_sqlstate, 'FAIL', 'Unexpected error: ' || v_msg);
    END IF;
END $$;

-- Test B10: Direct DELETE under authenticated (must fail 42501)
DO $$
DECLARE
    v_sqlstate TEXT := '00000';
    v_msg TEXT := '';
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    DELETE FROM public.orders WHERE id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid;
    RESET ROLE;
    INSERT INTO suite_b_results VALUES ('B10_ATTEMPT_DEL_AUTH', 'authenticated', 'DELETE', '42501', '00000', 'FAIL', 'Direct DELETE unexpectedly succeeded');
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RESET ROLE;
    IF v_sqlstate = '42501' THEN
        INSERT INTO suite_b_results VALUES ('B10_ATTEMPT_DEL_AUTH', 'authenticated', 'DELETE', '42501', v_sqlstate, 'PASS', 'Permission denied as expected: ' || v_msg);
    ELSE
        INSERT INTO suite_b_results VALUES ('B10_ATTEMPT_DEL_AUTH', 'authenticated', 'DELETE', '42501', v_sqlstate, 'FAIL', 'Unexpected error: ' || v_msg);
    END IF;
END $$;

-- Test B11: SECURITY DEFINER RPC execution grant verification for authenticated
DO $$
DECLARE
    v_fn TEXT;
    v_fn_list TEXT[] := ARRAY[
        'create_booking_idempotent(text,text,text,text,text,text,date,text,uuid,numeric,numeric,text,text,integer)',
        'create_booking_idempotent(text,text,text,text,text,text,date,text,uuid,numeric,numeric,text)',
        'record_store_intake_weight(uuid,numeric,text)',
        'record_courier_pickup_collection(uuid,numeric,text)',
        'assign_order_courier(uuid,text,uuid,text,text)',
        'advance_order_workflow_status(uuid,text,text)',
        'cancel_order_with_batch_sync(uuid,text)',
        'update_order_delivery_notes(uuid,text)'
    ];
BEGIN
    FOREACH v_fn IN ARRAY v_fn_list
    LOOP
        IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
            INSERT INTO suite_b_results VALUES ('B11_RPC_AUTH_' || split_part(v_fn, '(', 1) || '_' || array_length(string_to_array(v_fn, ','), 1), 'authenticated', 'EXECUTE', 'ALLOWED', 'ALLOWED', 'PASS', 'authenticated has EXECUTE on ' || v_fn);
        ELSE
            INSERT INTO suite_b_results VALUES ('B11_RPC_AUTH_' || split_part(v_fn, '(', 1) || '_' || array_length(string_to_array(v_fn, ','), 1), 'authenticated', 'EXECUTE', 'ALLOWED', 'DENIED', 'FAIL', 'authenticated missing EXECUTE on ' || v_fn);
        END IF;
    END LOOP;
END $$;

-- Output results table
SELECT test_id, role_tested, operation, expected_sqlstate, actual_sqlstate, status, details FROM suite_b_results ORDER BY test_id;
