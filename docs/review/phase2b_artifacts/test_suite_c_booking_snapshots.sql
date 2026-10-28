-- ==============================================================================
-- SuperWash Stage 5B Phase 2B: Suite C - Booking, Idempotency & Coupon Snapshots
-- ==============================================================================

\set ON_ERROR_STOP off
CREATE TEMP TABLE suite_c_results (
    test_id TEXT PRIMARY KEY,
    test_name TEXT,
    expected TEXT,
    actual TEXT,
    status TEXT,
    details TEXT
);

-- Seed services and coupons with accurate column names
DO $$
BEGIN
    INSERT INTO public.services (id, name, unit_price_paise, pricing_unit, min_weight_kg, is_active)
    VALUES 
        ('0000000c-1111-4111-a111-111111111111'::uuid, 'Dry Cleaning', 10000, 'per_kg', 3.00, true),
        ('0000000c-2222-4222-a222-222222222222'::uuid, 'Wash & Fold', 8000, 'per_kg', 1.00, true),
        ('0000000c-3333-4333-a333-333333333333'::uuid, 'Delicate Wash', 10000, 'per_kg', 2.00, true)
    ON CONFLICT (id) DO UPDATE 
    SET unit_price_paise = EXCLUDED.unit_price_paise,
        min_weight_kg = EXCLUDED.min_weight_kg,
        is_active = true;

    INSERT INTO public.coupons (
        code, discount_type, discount_value, min_order_paise, max_discount_paise,
        max_redemptions, per_customer_limit, is_active, valid_until
    ) VALUES 
        ('SNAPFIX50', 'fixed', 5000, 15000, NULL, 100, 5, true, now() + interval '30 days'),
        ('SNAPPERC20', 'percentage', 20, 20000, 8000, 100, 5, true, now() + interval '30 days')
    ON CONFLICT (code) DO UPDATE 
    SET is_active = EXCLUDED.is_active,
        valid_until = EXCLUDED.valid_until,
        discount_value = EXCLUDED.discount_value,
        min_order_paise = EXCLUDED.min_order_paise;
END $$;

-- Test C1: Booking without coupon
DO $$
DECLARE
    v_order public.orders;
    v_svc_id UUID;
BEGIN
    SELECT id INTO v_svc_id FROM public.services WHERE name = 'Wash & Fold' LIMIT 1;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_order := public.create_booking_idempotent(
        p_client_submission_id => 'c1-no-coupon-test',
        p_customer_name => 'Customer C1',
        p_customer_phone => '9876543210',
        p_pickup_address => 'Indiranagar 100ft Road',
        p_pickup_landmark => 'Near Metro',
        p_pickup_pincode => '560038',
        p_pickup_date => CURRENT_DATE + 1,
        p_pickup_slot => 'Morning (08:00 AM - 11:00 AM)',
        p_service_id => v_svc_id,
        p_pickup_latitude => 12.9716,
        p_pickup_longitude => 77.5946,
        p_notes => 'No coupon booking',
        p_coupon_code => NULL,
        p_discount_paise => 0
    );
    RESET ROLE;

    IF v_order.coupon_code IS NULL AND v_order.coupon_snapshot IS NULL AND v_order.discount_paise = 0 THEN
        INSERT INTO suite_c_results VALUES ('C1_NO_COUPON', 'Booking without coupon', 'NULL snapshot, 0 discount', 'NULL snapshot, 0 discount', 'PASS', 'Booking created clean row without coupon');
    ELSE
        INSERT INTO suite_c_results VALUES ('C1_NO_COUPON', 'Booking without coupon', 'NULL snapshot, 0 discount', 'Snapshot or discount present', 'FAIL', 'Unexpected coupon fields on non-coupon booking');
    END IF;
END $$;

-- Test C2: Valid fixed-discount coupon snapshot
DO $$
DECLARE
    v_order public.orders;
    v_svc_id UUID;
    v_snap JSONB;
BEGIN
    SELECT id INTO v_svc_id FROM public.services WHERE name = 'Dry Cleaning' LIMIT 1;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_order := public.create_booking_idempotent(
        p_client_submission_id => 'c2-fixed-coupon-test',
        p_customer_name => 'Customer C2',
        p_customer_phone => '9876543210',
        p_pickup_address => 'Koramangala 4th Block',
        p_pickup_landmark => 'Sony World Signal',
        p_pickup_pincode => '560034',
        p_pickup_date => CURRENT_DATE + 1,
        p_pickup_slot => 'Morning (08:00 AM - 11:00 AM)',
        p_service_id => v_svc_id,
        p_pickup_latitude => 12.9352,
        p_pickup_longitude => 77.6245,
        p_notes => 'Fixed coupon booking',
        p_coupon_code => 'SNAPFIX50',
        p_discount_paise => 5000
    );
    RESET ROLE;

    v_snap := v_order.coupon_snapshot;
    IF v_snap->>'code' = 'SNAPFIX50' AND v_snap->>'discount_type' = 'fixed' AND (v_snap->>'discount_value')::numeric = 5000 AND (v_snap->>'min_order_paise')::numeric = 15000 THEN
        INSERT INTO suite_c_results VALUES ('C2_FIXED_SNAPSHOT', 'Valid fixed coupon snapshot', 'code=SNAPFIX50, type=fixed, val=5000, min=15000', v_snap::text, 'PASS', 'Accurate fixed snapshot stored');
    ELSE
        INSERT INTO suite_c_results VALUES ('C2_FIXED_SNAPSHOT', 'Valid fixed coupon snapshot', 'code=SNAPFIX50, type=fixed, val=5000, min=15000', v_snap::text, 'FAIL', 'Snapshot mismatch');
    END IF;
END $$;

-- Test C3: Valid percentage-discount coupon snapshot
DO $$
DECLARE
    v_order public.orders;
    v_svc_id UUID;
    v_snap JSONB;
BEGIN
    SELECT id INTO v_svc_id FROM public.services WHERE name = 'Dry Cleaning' LIMIT 1;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_order := public.create_booking_idempotent(
        p_client_submission_id => 'c3-percent-coupon-test',
        p_customer_name => 'Customer C3',
        p_customer_phone => '9876543210',
        p_pickup_address => 'HSR Layout Sector 1',
        p_pickup_landmark => 'Near Park',
        p_pickup_pincode => '560102',
        p_pickup_date => CURRENT_DATE + 1,
        p_pickup_slot => 'Evening (04:00 PM - 07:00 PM)',
        p_service_id => v_svc_id,
        p_pickup_latitude => 12.9121,
        p_pickup_longitude => 77.6446,
        p_notes => 'Percent coupon booking',
        p_coupon_code => 'SNAPPERC20',
        p_discount_paise => 4000
    );
    RESET ROLE;

    v_snap := v_order.coupon_snapshot;
    IF v_snap->>'code' = 'SNAPPERC20' AND v_snap->>'discount_type' = 'percentage' AND (v_snap->>'discount_value')::numeric = 20 AND (v_snap->>'max_discount_paise')::numeric = 8000 THEN
        INSERT INTO suite_c_results VALUES ('C3_PERCENT_SNAPSHOT', 'Valid percent coupon snapshot', 'code=SNAPPERC20, type=percentage, val=20, max=8000', v_snap::text, 'PASS', 'Accurate percentage snapshot stored');
    ELSE
        INSERT INTO suite_c_results VALUES ('C3_PERCENT_SNAPSHOT', 'Valid percent coupon snapshot', 'code=SNAPPERC20, type=percentage, val=20, max=8000', v_snap::text, 'FAIL', 'Snapshot mismatch');
    END IF;
END $$;

-- Test C4: Rejection when subtotal is below minimum order requirement
DO $$
DECLARE
    v_svc_id UUID;
    v_order public.orders;
    v_err_msg TEXT := '';
BEGIN
    SELECT id INTO v_svc_id FROM public.services WHERE name = 'Wash & Fold' LIMIT 1;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    BEGIN
        -- Wash & Fold estimated subtotal is 8000 paise. SNAPPERC20 requires min_order 20000 paise.
        v_order := public.create_booking_idempotent(
            p_client_submission_id => 'c4-subtotal-below-min-test',
            p_customer_name => 'Customer C4',
            p_customer_phone => '9876543210',
            p_pickup_address => 'MG Road',
            p_pickup_landmark => 'Near Station',
            p_pickup_pincode => '560001',
            p_pickup_date => CURRENT_DATE + 1,
            p_pickup_slot => 'Morning (08:00 AM - 11:00 AM)',
            p_service_id => v_svc_id,
            p_pickup_latitude => 12.9716,
            p_pickup_longitude => 77.5946,
            p_notes => 'Subtotal below min test',
            p_coupon_code => 'SNAPPERC20',
            p_discount_paise => 0
        );
        RESET ROLE;
        INSERT INTO suite_c_results VALUES ('C4_REJECT_SUBTOTAL_BELOW_MIN', 'Reject coupon below min subtotal', 'EXCEPTION: Minimum order subtotal', 'SUCCESS', 'FAIL', 'Booking unexpectedly accepted coupon when subtotal was below min');
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%Minimum order subtotal%' THEN
            INSERT INTO suite_c_results VALUES ('C4_REJECT_SUBTOTAL_BELOW_MIN', 'Reject coupon below min subtotal', 'EXCEPTION: Minimum order subtotal', v_err_msg, 'PASS', 'Correctly rejected coupon below min order requirement: ' || v_err_msg);
        ELSE
            INSERT INTO suite_c_results VALUES ('C4_REJECT_SUBTOTAL_BELOW_MIN', 'Reject coupon below min subtotal', 'EXCEPTION: Minimum order subtotal', v_err_msg, 'FAIL', 'Unexpected exception message: ' || v_err_msg);
        END IF;
    END;
END $$;

-- Test C5: Percentage rounding & precision
DO $$
DECLARE
    v_order public.orders;
    v_svc_id UUID;
BEGIN
    SELECT id INTO v_svc_id FROM public.services WHERE name = 'Delicate Wash' LIMIT 1;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_order := public.create_booking_idempotent(
        p_client_submission_id => 'c5-precision-test',
        p_customer_name => 'Customer C5',
        p_customer_phone => '9876543210',
        p_pickup_address => 'Whitefield Main Road',
        p_pickup_landmark => 'Forum Mall',
        p_pickup_pincode => '560066',
        p_pickup_date => CURRENT_DATE + 1,
        p_pickup_slot => 'Morning (08:00 AM - 11:00 AM)',
        p_service_id => v_svc_id,
        p_pickup_latitude => 12.9698,
        p_pickup_longitude => 77.7499,
        p_notes => 'Precision test',
        p_coupon_code => 'SNAPPERC20',
        p_discount_paise => 4000
    );
    RESET ROLE;

    IF v_order.discount_paise = 4000 THEN
        INSERT INTO suite_c_results VALUES ('C5_ROUNDING_PRECISION', 'Percentage rounding and precision', '4000 paise', v_order.discount_paise || ' paise', 'PASS', 'Exact percentage discount evaluated at booking');
    ELSE
        INSERT INTO suite_c_results VALUES ('C5_ROUNDING_PRECISION', 'Percentage rounding and precision', '4000 paise', v_order.discount_paise || ' paise', 'FAIL', 'Discount calculation discrepancy');
    END IF;
END $$;

-- Test C6: Snapshot immutability trigger enforcement (SQLSTATE P0001)
DO $$
DECLARE
    v_err_msg TEXT := '';
    v_sqlstate TEXT := '';
BEGIN
    UPDATE public.orders
    SET coupon_snapshot = jsonb_build_object('code', 'TAMPERED', 'discount_type', 'fixed', 'discount_value', 99999)
    WHERE client_submission_id = 'c2-fixed-coupon-test';

    INSERT INTO suite_c_results VALUES ('C6_SNAPSHOT_IMMUTABILITY', 'Snapshot immutability trigger', 'SQLSTATE P0001', 'SUCCESS', 'FAIL', 'Direct update to coupon_snapshot unexpectedly succeeded');
EXCEPTION WHEN OTHERS THEN
    v_err_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
    IF v_sqlstate = 'P0001' AND v_err_msg LIKE '%coupon_snapshot is immutable%' THEN
        INSERT INTO suite_c_results VALUES ('C6_SNAPSHOT_IMMUTABILITY', 'Snapshot immutability trigger', 'SQLSTATE P0001', v_sqlstate || ': ' || v_err_msg, 'PASS', 'Trigger blocked snapshot modification: ' || v_err_msg);
    ELSE
        INSERT INTO suite_c_results VALUES ('C6_SNAPSHOT_IMMUTABILITY', 'Snapshot immutability trigger', 'SQLSTATE P0001', v_sqlstate || ': ' || v_err_msg, 'FAIL', 'Unexpected exception: ' || v_err_msg);
    END IF;
END $$;

-- Test C7: Repeated request with same idempotency key returns existing order
DO $$
DECLARE
    v_order1 public.orders;
    v_order2 public.orders;
    v_svc_id UUID;
BEGIN
    SELECT id INTO v_svc_id FROM public.services WHERE name = 'Wash & Fold' LIMIT 1;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    SELECT * INTO v_order1 FROM public.orders WHERE client_submission_id = 'c1-no-coupon-test';

    v_order2 := public.create_booking_idempotent(
        p_client_submission_id => 'c1-no-coupon-test',
        p_customer_name => 'Customer C1',
        p_customer_phone => '9876543210',
        p_pickup_address => 'Indiranagar 100ft Road',
        p_pickup_landmark => 'Near Metro',
        p_pickup_pincode => '560038',
        p_pickup_date => CURRENT_DATE + 1,
        p_pickup_slot => 'Morning (08:00 AM - 11:00 AM)',
        p_service_id => v_svc_id,
        p_pickup_latitude => 12.9716,
        p_pickup_longitude => 77.5946,
        p_notes => 'No coupon booking replay',
        p_coupon_code => NULL,
        p_discount_paise => 0
    );
    RESET ROLE;

    IF v_order1.id = v_order2.id AND v_order1.order_number = v_order2.order_number THEN
        INSERT INTO suite_c_results VALUES ('C7_IDEMPOTENT_REPLAY', 'Idempotent replay returns existing row', 'Same order ID ' || v_order1.id, 'Same order ID ' || v_order2.id, 'PASS', 'Idempotent resubmission returned existing order without creating duplicate');
    ELSE
        INSERT INTO suite_c_results VALUES ('C7_IDEMPOTENT_REPLAY', 'Idempotent replay returns existing row', 'Same order ID', 'Different order ID', 'FAIL', 'Duplicate order created on idempotent replay');
    END IF;
END $$;

-- Test C8: Rejection of invalid or expired coupon
DO $$
DECLARE
    v_svc_id UUID;
    v_order public.orders;
    v_err_msg TEXT := '';
BEGIN
    SELECT id INTO v_svc_id FROM public.services WHERE name = 'Dry Cleaning' LIMIT 1;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    BEGIN
        v_order := public.create_booking_idempotent(
            p_client_submission_id => 'c8-invalid-coupon-test',
            p_customer_name => 'Customer C8',
            p_customer_phone => '9876543210',
            p_pickup_address => 'Koramangala',
            p_pickup_landmark => '',
            p_pickup_pincode => '560034',
            p_pickup_date => CURRENT_DATE + 1,
            p_pickup_slot => 'Morning (08:00 AM - 11:00 AM)',
            p_service_id => v_svc_id,
            p_pickup_latitude => 12.9352,
            p_pickup_longitude => 77.6245,
            p_notes => 'Invalid coupon test',
            p_coupon_code => 'NONEXISTENT999',
            p_discount_paise => 0
        );
        RESET ROLE;
        INSERT INTO suite_c_results VALUES ('C8_REJECT_INVALID_COUPON', 'Reject invalid / non-existent coupon', 'EXCEPTION: invalid or expired', 'SUCCESS', 'FAIL', 'Booking unexpectedly accepted non-existent coupon');
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%invalid or expired%' THEN
            INSERT INTO suite_c_results VALUES ('C8_REJECT_INVALID_COUPON', 'Reject invalid / non-existent coupon', 'EXCEPTION: invalid or expired', v_err_msg, 'PASS', 'Correctly rejected invalid coupon: ' || v_err_msg);
        ELSE
            INSERT INTO suite_c_results VALUES ('C8_REJECT_INVALID_COUPON', 'Reject invalid / non-existent coupon', 'EXCEPTION: invalid or expired', v_err_msg, 'FAIL', 'Unexpected exception: ' || v_err_msg);
        END IF;
    END;
END $$;

-- Test C9: Historical order with NULL snapshot preservation
DO $$
DECLARE
    v_hist_id UUID := 'c9999999-0000-4000-a000-000000000001'::uuid;
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_svc_id UUID;
    v_order public.orders;
BEGIN
    SELECT id INTO v_svc_id FROM public.services WHERE name = 'Wash & Fold' LIMIT 1;

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, paid_amount_paise, total_amount_paise, payment_status,
        coupon_code, discount_paise, coupon_snapshot, notes
    ) VALUES (
        v_hist_id, 'SW-LEGACY-001', v_cust_id, 'Legacy User', '9876543210',
        'Old Address', '560001', CURRENT_DATE - 30, 'Morning (08:00 AM - 11:00 AM)',
        v_svc_id, 'Wash & Fold', 'per_kg', 8000, 1.0,
        'delivered', 16000, 16000, 'paid',
        'LEGACY50', 5000, NULL, 'Legacy historical order'
    ) ON CONFLICT (id) DO NOTHING;

    SELECT * INTO v_order FROM public.orders WHERE id = v_hist_id;

    IF v_order.coupon_code = 'LEGACY50' AND v_order.coupon_snapshot IS NULL AND v_order.discount_paise = 5000 THEN
        INSERT INTO suite_c_results VALUES ('C9_HISTORICAL_NULL_SNAPSHOT', 'Historical order with NULL snapshot', 'NULL snapshot, preserved discount', 'NULL snapshot, preserved discount', 'PASS', 'Legacy row safely preserved with NULL snapshot');
    ELSE
        INSERT INTO suite_c_results VALUES ('C9_HISTORICAL_NULL_SNAPSHOT', 'Historical order with NULL snapshot', 'NULL snapshot, preserved discount', 'Discrepancy', 'FAIL', 'Legacy row compromised');
    END IF;
END $$;

SELECT test_id, test_name, status, details FROM suite_c_results ORDER BY test_id;
