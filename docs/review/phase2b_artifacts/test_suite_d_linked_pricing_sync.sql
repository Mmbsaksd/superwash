-- ==============================================================================
-- SuperWash Stage 5B Phase 2B: Suite D - Linked Services & Batch Coupon Sync
-- ==============================================================================

\set ON_ERROR_STOP off
CREATE TEMP TABLE suite_d_results (
    test_id TEXT PRIMARY KEY,
    test_name TEXT,
    expected TEXT,
    actual TEXT,
    status TEXT,
    details TEXT
);

-- Seed services and coupons for Suite D
DO $$
BEGIN
    INSERT INTO public.services (id, name, unit_price_paise, pricing_unit, min_weight_kg, is_active)
    VALUES 
        ('d1111111-1111-4111-a111-111111111111'::uuid, 'Standard Wash', 7900, 'per_kg', 1.00, true),
        ('d2222222-2222-4222-a222-222222222222'::uuid, 'Delicate Silk', 20000, 'per_kg', 1.00, true),
        ('d3333333-3333-4333-a333-333333333333'::uuid, 'Woolen Care', 15000, 'per_kg', 1.00, true)
    ON CONFLICT (id) DO UPDATE SET unit_price_paise = EXCLUDED.unit_price_paise, is_active = true;

    INSERT INTO public.coupons (
        code, discount_type, discount_value, min_order_paise, max_discount_paise,
        max_redemptions, per_customer_limit, is_active, valid_until
    ) VALUES
        ('SYNC10', 'percentage', 10, 20000, 10000, 100, 5, true, now() + interval '30 days'),
        ('SYNCFIX50', 'fixed', 5000, 10000, NULL, 100, 5, true, now() + interval '30 days'),
        ('SYNCTHRESH', 'percentage', 20, 30000, 10000, 100, 5, true, now() + interval '30 days')
    ON CONFLICT (code) DO UPDATE 
    SET discount_value = EXCLUDED.discount_value,
        min_order_paise = EXCLUDED.min_order_paise,
        max_discount_paise = EXCLUDED.max_discount_paise,
        is_active = true;
END $$;

-- -----------------------------------------------------------------------------
-- D1 & D2: Permutation Independence (Weigh S1 then S2 vs S2 then S1)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_snap JSONB;
    v_a1 public.orders;
    v_a2 public.orders;
    v_b1 public.orders;
    v_b2 public.orders;
BEGIN
    SELECT jsonb_build_object(
        'code', code, 'discount_type', discount_type, 'discount_value', discount_value,
        'min_order_paise', min_order_paise, 'max_discount_paise', max_discount_paise
    ) INTO v_snap FROM public.coupons WHERE code = 'SYNC10';

    -- Batch A orders: A1 (Wash 7900), A2 (Silk 20000)
    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, notes, coupon_code, discount_paise, coupon_snapshot
    ) VALUES 
    ('da111111-0000-4000-a000-000000000001'::uuid, 'ORD-BATCH-DA1', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd1111111-1111-4111-a111-111111111111'::uuid, 'Standard Wash', 'per_kg', 7900, 1.00,
     'collected', '[Linked Batch batch_da] Service 1', 'SYNC10', 0, v_snap),
    ('da222222-0000-4000-a000-000000000002'::uuid, 'ORD-BATCH-DA2', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd2222222-2222-4222-a222-222222222222'::uuid, 'Delicate Silk', 'per_kg', 20000, 1.00,
     'collected', '[Linked Batch batch_da] Service 2', NULL, 0, NULL)
    ON CONFLICT (id) DO UPDATE SET order_status = 'collected', discount_paise = 0, measured_weight = NULL, total_amount_paise = NULL;

    -- Batch B orders: DB1 (Wash 7900), DB2 (Silk 20000)
    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, notes, coupon_code, discount_paise, coupon_snapshot
    ) VALUES 
    ('db111111-0000-4000-a000-000000000001'::uuid, 'ORD-BATCH-DB1', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd1111111-1111-4111-a111-111111111111'::uuid, 'Standard Wash', 'per_kg', 7900, 1.00,
     'collected', '[Linked Batch batch_db] Service 1', 'SYNC10', 0, v_snap),
    ('db222222-0000-4000-a000-000000000002'::uuid, 'ORD-BATCH-DB2', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd2222222-2222-4222-a222-222222222222'::uuid, 'Delicate Silk', 'per_kg', 20000, 1.00,
     'collected', '[Linked Batch batch_db] Service 2', NULL, 0, NULL)
    ON CONFLICT (id) DO UPDATE SET order_status = 'collected', discount_paise = 0, measured_weight = NULL, total_amount_paise = NULL;

    -- Sequence A: Weigh DA1 (2.0kg) then DA2 (1.0kg)
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    PERFORM public.record_store_intake_weight('da111111-0000-4000-a000-000000000001'::uuid, 2.00);
    PERFORM public.record_store_intake_weight('da222222-0000-4000-a000-000000000002'::uuid, 1.00);

    -- Sequence B: Weigh DB2 (1.0kg) then DB1 (2.0kg)
    PERFORM public.record_store_intake_weight('db222222-0000-4000-a000-000000000002'::uuid, 1.00);
    PERFORM public.record_store_intake_weight('db111111-0000-4000-a000-000000000001'::uuid, 2.00);
    RESET ROLE;

    SELECT * INTO v_a1 FROM public.orders WHERE id = 'da111111-0000-4000-a000-000000000001'::uuid;
    SELECT * INTO v_a2 FROM public.orders WHERE id = 'da222222-0000-4000-a000-000000000002'::uuid;
    SELECT * INTO v_b1 FROM public.orders WHERE id = 'db111111-0000-4000-a000-000000000001'::uuid;
    SELECT * INTO v_b2 FROM public.orders WHERE id = 'db222222-0000-4000-a000-000000000002'::uuid;

    IF v_a1.discount_paise = 3580 AND v_a1.total_amount_paise = 12220 AND v_a2.total_amount_paise = 20000 THEN
        INSERT INTO suite_d_results VALUES ('D1_WEIGH_SEQUENCE_A', 'Weigh S1 then S2 (Seq A)', 'disc=3580, S1=12220, S2=20000', 'disc=' || v_a1.discount_paise || ', S1=' || v_a1.total_amount_paise || ', S2=' || v_a2.total_amount_paise, 'PASS', 'Correct atomic pricing after weighing S1 then S2');
    ELSE
        INSERT INTO suite_d_results VALUES ('D1_WEIGH_SEQUENCE_A', 'Weigh S1 then S2 (Seq A)', 'disc=3580, S1=12220, S2=20000', 'disc=' || v_a1.discount_paise || ', S1=' || v_a1.total_amount_paise || ', S2=' || v_a2.total_amount_paise, 'FAIL', 'Pricing discrepancy');
    END IF;

    IF v_b1.discount_paise = v_a1.discount_paise AND v_b1.total_amount_paise = v_a1.total_amount_paise AND v_b2.total_amount_paise = v_a2.total_amount_paise THEN
        INSERT INTO suite_d_results VALUES ('D2_PERMUTATION_INDEPENDENCE', 'Weigh S2 then S1 (Seq B)', 'Identical to Seq A', 'Exact match down to the paise', 'PASS', 'Permutation independence confirmed: weighing order does not affect final discount or total');
    ELSE
        INSERT INTO suite_d_results VALUES ('D2_PERMUTATION_INDEPENDENCE', 'Weigh S2 then S1 (Seq B)', 'Identical to Seq A', 'Mismatch between Seq A and Seq B', 'FAIL', 'Sequence dependency detected');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- D3: 3 Linked Orders Batch Synchronization
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_snap JSONB;
    v_o1 public.orders;
    v_o2 public.orders;
    v_o3 public.orders;
BEGIN
    SELECT jsonb_build_object(
        'code', code, 'discount_type', discount_type, 'discount_value', discount_value,
        'min_order_paise', min_order_paise, 'max_discount_paise', max_discount_paise
    ) INTO v_snap FROM public.coupons WHERE code = 'SYNC10';

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, notes, coupon_code, discount_paise, coupon_snapshot
    ) VALUES 
    ('d3111111-0000-4000-a000-000000000001'::uuid, 'ORD-3SVC-1', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd1111111-1111-4111-a111-111111111111'::uuid, 'Standard Wash', 'per_kg', 7900, 1.00,
     'collected', '[Linked Batch batch_3svc] S1', 'SYNC10', 0, v_snap),
    ('d3222222-0000-4000-a000-000000000002'::uuid, 'ORD-3SVC-2', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd2222222-2222-4222-a222-222222222222'::uuid, 'Delicate Silk', 'per_kg', 20000, 1.00,
     'collected', '[Linked Batch batch_3svc] S2', NULL, 0, NULL),
    ('d3333333-0000-4000-a000-000000000003'::uuid, 'ORD-3SVC-3', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd3333333-3333-4333-a333-333333333333'::uuid, 'Woolen Care', 'per_kg', 15000, 1.00,
     'collected', '[Linked Batch batch_3svc] S3', NULL, 0, NULL)
    ON CONFLICT (id) DO UPDATE SET order_status = 'collected', discount_paise = 0, measured_weight = NULL, total_amount_paise = NULL;

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    PERFORM public.record_store_intake_weight('d3111111-0000-4000-a000-000000000001'::uuid, 1.00);
    PERFORM public.record_store_intake_weight('d3222222-0000-4000-a000-000000000002'::uuid, 1.00);
    PERFORM public.record_store_intake_weight('d3333333-0000-4000-a000-000000000003'::uuid, 2.00);
    RESET ROLE;

    SELECT * INTO v_o1 FROM public.orders WHERE id = 'd3111111-0000-4000-a000-000000000001'::uuid;
    SELECT * INTO v_o2 FROM public.orders WHERE id = 'd3222222-0000-4000-a000-000000000002'::uuid;
    SELECT * INTO v_o3 FROM public.orders WHERE id = 'd3333333-0000-4000-a000-000000000003'::uuid;

    IF v_o1.discount_paise = 5790 AND v_o1.total_amount_paise = 2110 AND v_o2.total_amount_paise = 20000 AND v_o3.total_amount_paise = 30000 THEN
        INSERT INTO suite_d_results VALUES ('D3_3_LINKED_ORDERS', '3 Linked Orders Synchronization', 'disc=5790, S1=2110, S2=20000, S3=30000', 'disc=' || v_o1.discount_paise || ', S1=' || v_o1.total_amount_paise || ', S2=' || v_o2.total_amount_paise || ', S3=' || v_o3.total_amount_paise, 'PASS', 'Authoritative batch sync across 3 orders succeeded');
    ELSE
        INSERT INTO suite_d_results VALUES ('D3_3_LINKED_ORDERS', '3 Linked Orders Synchronization', 'disc=5790, S1=2110, S2=20000, S3=30000', 'disc=' || v_o1.discount_paise || ', S1=' || v_o1.total_amount_paise, 'FAIL', '3-order batch calculation mismatch');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- D4: Subtotal Boundary Cases (Below, At, Above Min Order Threshold)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_snap JSONB;
    v_bnd1 public.orders;
BEGIN
    SELECT jsonb_build_object(
        'code', code, 'discount_type', discount_type, 'discount_value', discount_value,
        'min_order_paise', min_order_paise, 'max_discount_paise', max_discount_paise
    ) INTO v_snap FROM public.coupons WHERE code = 'SYNCTHRESH';

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, notes, coupon_code, discount_paise, coupon_snapshot
    ) VALUES 
    ('dc000001-0000-4000-a000-000000000001'::uuid, 'ORD-BND-1', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd2222222-2222-4222-a222-222222222222'::uuid, 'Delicate Silk', 'per_kg', 20000, 1.00,
     'collected', 'Multi-service booking [Linked Batch D-BND: S1]', 'SYNCTHRESH', 0, v_snap)
    ON CONFLICT (id) DO UPDATE SET order_status = 'collected', discount_paise = 0, measured_weight = NULL, total_amount_paise = NULL, notes = 'Multi-service booking [Linked Batch D-BND: S1]';

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- Case 1: Weigh at 1.4kg -> 1.4 * 20000 = 28000 paise (< 30000 min) -> discount = 0
    PERFORM public.record_store_intake_weight('dc000001-0000-4000-a000-000000000001'::uuid, 1.40);
    SELECT * INTO v_bnd1 FROM public.orders WHERE id = 'dc000001-0000-4000-a000-000000000001'::uuid;

    IF v_bnd1.discount_paise = 0 AND v_bnd1.total_amount_paise = 28000 THEN
        -- Case 2: Reweigh at 1.5kg -> 1.5 * 20000 = 30000 paise (= 30000 min) -> 20% disc = 6000 paise
        PERFORM public.record_store_intake_weight('dc000001-0000-4000-a000-000000000001'::uuid, 1.50, 'Correction to boundary weight');
        SELECT * INTO v_bnd1 FROM public.orders WHERE id = 'dc000001-0000-4000-a000-000000000001'::uuid;

        RESET ROLE;

        IF v_bnd1.discount_paise = 6000 AND v_bnd1.total_amount_paise = 24000 THEN
            INSERT INTO suite_d_results VALUES ('D4_THRESHOLD_BOUNDARY', 'Threshold boundary below vs exactly at min', 'Below: disc=0; At min: disc=6000', 'Below: disc=0, total=28000; At min: disc=6000, total=24000', 'PASS', 'Exact threshold boundary evaluation verified');
        ELSE
            INSERT INTO suite_d_results VALUES ('D4_THRESHOLD_BOUNDARY', 'Threshold boundary below vs exactly at min', 'At min: disc=6000', 'At min: disc=' || v_bnd1.discount_paise, 'FAIL', 'Boundary evaluation failed at min');
        END IF;
    ELSE
        RESET ROLE;
        INSERT INTO suite_d_results VALUES ('D4_THRESHOLD_BOUNDARY', 'Threshold boundary below vs exactly at min', 'Below: disc=0', 'Below: disc=' || v_bnd1.discount_paise, 'FAIL', 'Boundary evaluation failed below min');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- D5: Fixed Discount Excess Forfeiture (Zero Spillover to Siblings)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_snap JSONB;
    v_f1 public.orders;
    v_f2 public.orders;
BEGIN
    SELECT jsonb_build_object(
        'code', code, 'discount_type', discount_type, 'discount_value', discount_value,
        'min_order_paise', min_order_paise, 'max_discount_paise', max_discount_paise
    ) INTO v_snap FROM public.coupons WHERE code = 'SYNCFIX50';

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, notes, coupon_code, discount_paise, coupon_snapshot
    ) VALUES 
    ('df111111-0000-4000-a000-000000000001'::uuid, 'ORD-FORFEIT-1', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd1111111-1111-4111-a111-111111111111'::uuid, 'Standard Wash', 'per_kg', 3000, 1.00,
     'collected', '[Linked Batch batch_forfeit] S1', 'SYNCFIX50', 0, v_snap),
    ('df222222-0000-4000-a000-000000000002'::uuid, 'ORD-FORFEIT-2', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd2222222-2222-4222-a222-222222222222'::uuid, 'Delicate Silk', 'per_kg', 20000, 1.00,
     'collected', '[Linked Batch batch_forfeit] S2', NULL, 0, NULL)
    ON CONFLICT (id) DO UPDATE SET order_status = 'collected', discount_paise = 0, measured_weight = NULL, total_amount_paise = NULL;

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    PERFORM public.record_store_intake_weight('df111111-0000-4000-a000-000000000001'::uuid, 1.00);
    PERFORM public.record_store_intake_weight('df222222-0000-4000-a000-000000000002'::uuid, 1.00);
    RESET ROLE;

    SELECT * INTO v_f1 FROM public.orders WHERE id = 'df111111-0000-4000-a000-000000000001'::uuid;
    SELECT * INTO v_f2 FROM public.orders WHERE id = 'df222222-0000-4000-a000-000000000002'::uuid;

    IF v_f1.discount_paise = 3000 AND v_f1.total_amount_paise = 0 AND v_f2.discount_paise = 0 AND v_f2.total_amount_paise = 20000 THEN
        INSERT INTO suite_d_results VALUES ('D5_FIXED_EXCESS_FORFEITED', 'Fixed discount excess forfeited', 'S1 disc=3000, S1 total=0, S2 disc=0, S2 total=20000', 'S1 disc=' || v_f1.discount_paise || ', S1 total=' || v_f1.total_amount_paise || ', S2 disc=' || v_f2.discount_paise || ', S2 total=' || v_f2.total_amount_paise, 'PASS', 'Excess 2000 paise forfeited without spillover');
    ELSE
        INSERT INTO suite_d_results VALUES ('D5_FIXED_EXCESS_FORFEITED', 'Fixed discount excess forfeited', 'S1 disc=3000, S1 total=0, S2 disc=0, S2 total=20000', 'Discrepancy', 'FAIL', 'Fixed coupon excess leaked to sibling');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- D6: Cancelling Sibling Disqualifies Coupon
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_snap JSONB;
    v_c1 public.orders;
    v_c2 public.orders;
BEGIN
    SELECT jsonb_build_object(
        'code', code, 'discount_type', discount_type, 'discount_value', discount_value,
        'min_order_paise', min_order_paise, 'max_discount_paise', max_discount_paise
    ) INTO v_snap FROM public.coupons WHERE code = 'SYNC10';

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, notes, coupon_code, discount_paise, coupon_snapshot
    ) VALUES 
    ('dc111111-0000-4000-a000-000000000001'::uuid, 'ORD-CANCEL-1', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd1111111-1111-4111-a111-111111111111'::uuid, 'Standard Wash', 'per_kg', 7900, 1.00,
     'collected', '[Linked Batch batch_cancel] S1', 'SYNC10', 0, v_snap),
    ('dc222222-0000-4000-a000-000000000002'::uuid, 'ORD-CANCEL-2', v_cust_id, 'Cust A', '9876543210',
     'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
     'd2222222-2222-4222-a222-222222222222'::uuid, 'Delicate Silk', 'per_kg', 20000, 1.00,
     'collected', '[Linked Batch batch_cancel] S2', NULL, 0, NULL)
    ON CONFLICT (id) DO UPDATE SET order_status = 'collected', discount_paise = 0, measured_weight = NULL, total_amount_paise = NULL;

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    PERFORM public.record_store_intake_weight('dc111111-0000-4000-a000-000000000001'::uuid, 2.00);
    PERFORM public.record_store_intake_weight('dc222222-0000-4000-a000-000000000002'::uuid, 1.00);

    PERFORM public.cancel_order_with_batch_sync('dc222222-0000-4000-a000-000000000002'::uuid, 'Customer cancelled S2 Silk');
    RESET ROLE;

    SELECT * INTO v_c1 FROM public.orders WHERE id = 'dc111111-0000-4000-a000-000000000001'::uuid;
    SELECT * INTO v_c2 FROM public.orders WHERE id = 'dc222222-0000-4000-a000-000000000002'::uuid;

    IF v_c2.order_status = 'cancelled' AND v_c1.discount_paise = 0 AND v_c1.total_amount_paise = 15800 THEN
        INSERT INTO suite_d_results VALUES ('D6_SIBLING_CANCEL_REVOCATION', 'Sibling cancellation revokes discount', 'S2 cancelled, S1 disc=0, S1 total=15800', 'S2 status=' || v_c2.order_status || ', S1 disc=' || v_c1.discount_paise || ', S1 total=' || v_c1.total_amount_paise, 'PASS', 'Sibling cancellation cleanly revoked coupon when subtotal dropped below min');
    ELSE
        INSERT INTO suite_d_results VALUES ('D6_SIBLING_CANCEL_REVOCATION', 'Sibling cancellation revokes discount', 'S2 cancelled, S1 disc=0, S1 total=15800', 'Discrepancy', 'FAIL', 'Discount was not revoked after sibling cancellation');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- D7: Downward Paid Amount Floor Invariant
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_err_msg TEXT := '';
BEGIN
    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, paid_amount_paise, total_amount_paise, payment_status, notes
    ) VALUES (
        'df000002-0000-4000-a000-000000000001'::uuid, 'ORD-FLOOR-1', v_cust_id, 'Cust A', '9876543210',
        'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
        'd1111111-1111-4111-a111-111111111111'::uuid, 'Standard Wash', 'per_kg', 7900, 1.00,
        'washing', 15800, 15800, 'paid', 'Floor invariant test'
    ) ON CONFLICT (id) DO UPDATE SET order_status = 'washing', paid_amount_paise = 15800, total_amount_paise = 15800;

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    BEGIN
        PERFORM public.record_store_intake_weight('df000002-0000-4000-a000-000000000001'::uuid, 1.00, 'Invalid downward reweighing');
        RESET ROLE;
        INSERT INTO suite_d_results VALUES ('D7_PAID_AMOUNT_FLOOR', 'Prevent downward reweighing below paid amount', 'EXCEPTION: less than already paid', 'SUCCESS', 'FAIL', 'Downward reweighing below paid amount unexpectedly succeeded');
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%less than already paid amount%' THEN
            INSERT INTO suite_d_results VALUES ('D7_PAID_AMOUNT_FLOOR', 'Prevent downward reweighing below paid amount', 'EXCEPTION: less than already paid', v_err_msg, 'PASS', 'Paid amount floor protected: ' || v_err_msg);
        ELSE
            INSERT INTO suite_d_results VALUES ('D7_PAID_AMOUNT_FLOOR', 'Prevent downward reweighing below paid amount', 'EXCEPTION: less than already paid', v_err_msg, 'FAIL', 'Unexpected error: ' || v_err_msg);
        END IF;
    END;
END $$;

SELECT test_id, test_name, status, details FROM suite_d_results ORDER BY test_id;
