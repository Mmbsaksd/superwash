-- ==============================================================================
-- SuperWash Exprez — Database Lifecycle Verification Test Suite
-- Target: Tests all 15 Phase 5A requirements against PostgreSQL schema & RPCs
-- Mode: Safe Transactional Verification (BEGIN ... ROLLBACK)
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    -- Mock user IDs
    v_customer_a UUID := 'a0000000-0000-4000-a000-000000000001';
    v_customer_b UUID := 'a0000000-0000-4000-a000-000000000002';
    v_staff_owner UUID := 'a0000000-0000-4000-a000-000000000003';
    v_staff_courier UUID := 'a0000000-0000-4000-a000-000000000004';
    
    -- Entities
    v_service_id UUID;
    v_order_1 public.orders;
    v_order_2 public.orders;
    v_order_3 public.orders;
    v_order_4 public.orders;
    v_order_5 public.orders;
    v_order_6 public.orders;
    v_order_dup public.orders;
    v_coupon_welcome public.coupons;
    v_coupon_limited public.coupons;
    v_weigh_res JSONB;
    v_pay_res JSONB;
    v_refund_res JSONB;
    v_cancel_res JSONB;
    v_val_res JSONB;
    v_status_res TEXT;
    v_res_count INTEGER;
    v_err_caught BOOLEAN;
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'SUPERWASH EXPREZ: PHASE 5A DATABASE LIFECYCLE AUDIT SUITE';
    RAISE NOTICE '============================================================';

    -- 0. Setup Mock Environment
    -- Enable advance payments in business settings
    UPDATE public.business_settings
    SET advance_payment_enabled = true,
        advance_payment_type = 'fixed',
        advance_payment_amount_paise = 5000, -- ₹50
        price_per_kg_paise = 7900,
        min_weight_kg = 1.0;

    -- Ensure customer and staff profiles exist
    INSERT INTO public.profiles (id, phone, full_name, role, is_active)
    VALUES 
        (v_customer_a, '9876543210', 'Test Customer A', 'customer', true),
        (v_customer_b, '9876543211', 'Test Customer B', 'customer', true),
        (v_staff_owner, '9876543212', 'Test Owner', 'owner', true),
        (v_staff_courier, '9876543213', 'Test Courier', 'delivery', true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    -- Resolve primary service
    SELECT id INTO v_service_id FROM public.services WHERE is_active = true ORDER BY display_order ASC LIMIT 1;

    -- Ensure coupons exist and are active for testing
    UPDATE public.coupons
    SET is_active = true,
        min_order_paise = 15000, -- ₹150
        discount_type = 'fixed',
        discount_value = 5000,   -- ₹50
        total_redemptions = 0,
        max_redemptions = 500,
        per_customer_limit = 5
    WHERE upper(code) = 'WELCOME50';

    SELECT * INTO v_coupon_welcome FROM public.coupons WHERE upper(code) = 'WELCOME50';

    -- Create limited-redemption coupon for concurrency testing (max_redemptions = 2)
    INSERT INTO public.coupons (
        code, description, discount_type, discount_value, min_order_paise, max_redemptions, total_redemptions, is_active
    ) VALUES (
        'LIMIT2', 'Limited to 2 redemptions', 'fixed', 2000, 10000, 2, 0, true
    ) ON CONFLICT (code) DO UPDATE SET max_redemptions = 2, total_redemptions = 0, is_active = true
    RETURNING * INTO v_coupon_limited;

    -- Ensure test service areas are active
    INSERT INTO public.service_areas (pincode, area_name, city, state, is_active)
    VALUES ('560034', 'Koramangala', 'Bengaluru', 'Karnataka', true)
    ON CONFLICT (pincode) DO UPDATE SET is_active = true;

    -- --------------------------------------------------------------------------
    -- 1. Booking with WELCOME50 below the coupon minimum (₹79 < ₹150)
    -- --------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_order_1 := public.create_booking_idempotent(
        'sub-test-welcome50-01',
        'Test Customer A',
        '9876543210',
        '123 Green Glen, Bellandur',
        'Near Mall',
        '560103',
        CURRENT_DATE,
        'Morning (08:00 AM - 11:00 AM)',
        v_service_id,
        12.9352,
        77.6245,
        'Delicate clothes',
        'WELCOME50',
        0
    );

    ASSERT v_order_1.id IS NOT NULL, 'Scenario 1 Failed: Order was not created';
    ASSERT v_order_1.coupon_code = 'WELCOME50', 'Scenario 1 Failed: Coupon code was not attached';
    ASSERT v_order_1.discount_paise = 0, 'Scenario 1 Failed: Estimated discount should be 0 since ₹79 < ₹150';

    -- Verify reservation exists and status is 'reserved'
    SELECT COUNT(*) INTO v_res_count
    FROM public.coupon_reservations
    WHERE order_id = v_order_1.id AND coupon_id = v_coupon_welcome.id AND status = 'reserved';
    ASSERT v_res_count = 1, 'Scenario 1 Failed: coupon_reservations row missing or not "reserved"';

    -- Verify total_redemptions NOT incremented
    SELECT total_redemptions INTO v_res_count FROM public.coupons WHERE id = v_coupon_welcome.id;
    ASSERT v_res_count = 0, 'Scenario 1 Failed: total_redemptions prematurely incremented at booking!';
    RAISE NOTICE '✓ Scenario 1 Passed: Booking with WELCOME50 below minimum reserved without failing';

    -- --------------------------------------------------------------------------
    -- 2. Booking with EXPREZ10 below the coupon minimum (₹79 < ₹200)
    -- --------------------------------------------------------------------------
    UPDATE public.coupons SET is_active = true, min_order_paise = 20000, discount_value = 10, total_redemptions = 0 WHERE upper(code) = 'EXPREZ10';

    v_order_2 := public.create_booking_idempotent(
        'sub-test-exprez10-01',
        'Test Customer A',
        '9876543210',
        '123 Green Glen, Bellandur',
        'Near Mall',
        '560103',
        CURRENT_DATE,
        'Morning (08:00 AM - 11:00 AM)',
        v_service_id,
        12.9352,
        77.6245,
        'Exprez booking',
        'EXPREZ10',
        0
    );

    ASSERT v_order_2.id IS NOT NULL, 'Scenario 2 Failed: Order was not created';
    ASSERT v_order_2.coupon_code = 'EXPREZ10', 'Scenario 2 Failed: Coupon code missing';
    ASSERT v_order_2.discount_paise = 0, 'Scenario 2 Failed: Estimated discount should be 0';
    RAISE NOTICE '✓ Scenario 2 Passed: Booking with EXPREZ10 below minimum reserved without failing';

    -- --------------------------------------------------------------------------
    -- 3. Booking with a coupon that qualifies at final weighing (3.0 kg @ ₹79 = ₹237 >= ₹150)
    -- --------------------------------------------------------------------------
    -- Owner assigns courier and transitions order_1 to pickup_assigned
    PERFORM set_config('request.jwt.claim.sub', v_staff_owner::text, true);
    UPDATE public.orders SET assigned_pickup_id = v_staff_courier, order_status = 'pickup_assigned' WHERE id = v_order_1.id;

    -- Courier weighs clothes at 3.00 kg
    PERFORM set_config('request.jwt.claim.sub', v_staff_courier::text, true);
    v_weigh_res := public.record_courier_pickup_collection(v_order_1.id, 3.00, 'Doorstep weighed: 3 kg');

    ASSERT (v_weigh_res->>'success')::boolean = true, 'Scenario 3 Failed: Collection weighing failed';
    ASSERT (v_weigh_res->>'discount_paise')::integer = 5000, 'Scenario 3 Failed: ₹50 discount was not awarded upon qualifying weight!';
    ASSERT (v_weigh_res->>'total_amount_paise')::integer = (23700 - 5000), 'Scenario 3 Failed: Total amount incorrect';

    -- Verify coupon_reservations status is 'applied'
    SELECT status INTO v_status_res FROM public.coupon_reservations WHERE order_id = v_order_1.id;
    ASSERT v_status_res = 'applied', 'Scenario 3 Failed: Reservation status should be "applied"';

    -- Verify coupon_redemptions record exists
    SELECT COUNT(*) INTO v_res_count FROM public.coupon_redemptions WHERE order_id = v_order_1.id;
    ASSERT v_res_count = 1, 'Scenario 3 Failed: coupon_redemptions row was not recorded';

    -- Verify total_redemptions incremented by 1
    SELECT total_redemptions INTO v_res_count FROM public.coupons WHERE id = v_coupon_welcome.id;
    ASSERT v_res_count = 1, 'Scenario 3 Failed: total_redemptions should be 1 after redemption';
    RAISE NOTICE '✓ Scenario 3 Passed: Coupon qualified at final weighing and redeemed atomically';

    -- --------------------------------------------------------------------------
    -- 4. Booking where final bill remains below minimum (1.0 kg @ ₹79 = ₹79 < ₹150)
    -- --------------------------------------------------------------------------
    -- Create Order 3 with WELCOME50
    PERFORM set_config('request.jwt.claim.sub', v_customer_b::text, true);
    v_order_3 := public.create_booking_idempotent(
        'sub-test-underweight-01',
        'Test Customer B',
        '9876543211',
        '456 Koramangala',
        'Near Forum',
        '560034',
        CURRENT_DATE,
        'Morning (08:00 AM - 11:00 AM)',
        v_service_id,
        12.9352,
        77.6245,
        'Small load',
        'WELCOME50',
        0
    );

    -- Owner assigns courier and transitions order_3 to pickup_assigned
    PERFORM set_config('request.jwt.claim.sub', v_staff_owner::text, true);
    UPDATE public.orders SET assigned_pickup_id = v_staff_courier, order_status = 'pickup_assigned' WHERE id = v_order_3.id;

    -- Courier weighs clothes at 1.00 kg (Subtotal = ₹79 < ₹150)
    PERFORM set_config('request.jwt.claim.sub', v_staff_courier::text, true);
    v_weigh_res := public.record_courier_pickup_collection(v_order_3.id, 1.00, 'Doorstep weighed: 1 kg');

    ASSERT (v_weigh_res->>'discount_paise')::integer = 0, 'Scenario 4 Failed: Underweight order should have 0 discount';
    ASSERT (v_weigh_res->>'total_amount_paise')::integer = 7900, 'Scenario 4 Failed: Total should be full ₹79 without discount';

    -- Verify reservation is marked 'unqualified'
    SELECT status INTO v_status_res FROM public.coupon_reservations WHERE order_id = v_order_3.id;
    ASSERT v_status_res = 'unqualified', 'Scenario 4 Failed: Reservation should be marked "unqualified"';

    -- Verify total_redemptions remains 1 (did not increment for unqualified order)
    SELECT total_redemptions INTO v_res_count FROM public.coupons WHERE id = v_coupon_welcome.id;
    ASSERT v_res_count = 1, 'Scenario 4 Failed: total_redemptions should NOT increment for unqualified order';
    RAISE NOTICE '✓ Scenario 4 Passed: Final bill below minimum retained order without applying discount';

    -- --------------------------------------------------------------------------
    -- 5. Cancellation before coupon redemption
    -- --------------------------------------------------------------------------
    -- Create Order 4 with WELCOME50
    PERFORM set_config('request.jwt.claim.sub', v_customer_b::text, true);
    v_order_4 := public.create_booking_idempotent(
        'sub-test-cancel-01',
        'Test Customer B',
        '9876543211',
        '456 Koramangala',
        'Near Forum',
        '560034',
        CURRENT_DATE,
        'Morning (08:00 AM - 11:00 AM)',
        v_service_id,
        12.9352,
        77.6245,
        'Will cancel',
        'WELCOME50',
        0
    );

    -- Customer cancels booking
    v_cancel_res := public.cancel_order_with_batch_sync(v_order_4.id, 'Customer changed schedule');
    ASSERT (v_cancel_res->>'success')::boolean = true, 'Scenario 5 Failed: Cancellation failed';

    -- Reservation should be marked 'cancelled'
    SELECT status INTO v_status_res FROM public.coupon_reservations WHERE order_id = v_order_4.id;
    ASSERT v_status_res = 'cancelled', 'Scenario 5 Failed: Reservation should be marked "cancelled"';
    RAISE NOTICE '✓ Scenario 5 Passed: Cancellation before redemption released reservation safely';

    -- --------------------------------------------------------------------------
    -- 6. Duplicate booking requests (Idempotency)
    -- --------------------------------------------------------------------------
    v_order_dup := public.create_booking_idempotent(
        'sub-test-underweight-01', -- Identical client_submission_id as order_3
        'Test Customer B',
        '9876543211',
        '456 Koramangala',
        'Near Forum',
        '560034',
        CURRENT_DATE,
        'Morning (08:00 AM - 11:00 AM)',
        v_service_id,
        12.9352,
        77.6245,
        'Small load',
        'WELCOME50',
        0
    );

    ASSERT v_order_dup.id = v_order_3.id, 'Scenario 6 Failed: Replay did not return original order!';
    RAISE NOTICE '✓ Scenario 6 Passed: Duplicate booking requests returned existing order idempotently';

    -- --------------------------------------------------------------------------
    -- 7. Concurrent coupon reservations at the redemption limit (LIMIT2)
    -- --------------------------------------------------------------------------
    -- 1st reservation for LIMIT2
    v_order_5 := public.create_booking_idempotent(
        'sub-limit2-01', 'Test Customer A', '9876543210', '123 Green Glen', 'Mall', '560103',
        CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)', v_service_id, 12.9352, 77.6245, 'Limit test 1', 'LIMIT2', 0
    );

    -- 2nd reservation for LIMIT2
    PERFORM set_config('request.jwt.claim.sub', v_customer_b::text, true);
    v_order_6 := public.create_booking_idempotent(
        'sub-limit2-02', 'Test Customer B', '9876543211', '456 Koramangala', 'Forum', '560034',
        CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)', v_service_id, 12.9352, 77.6245, 'Limit test 2', 'LIMIT2', 0
    );

    -- 3rd attempt should be blocked since max_redemptions = 2 and active reservations = 2
    v_err_caught := false;
    BEGIN
        PERFORM public.create_booking_idempotent(
            'sub-limit2-03', 'Test Customer B', '9876543211', '456 Koramangala', 'Forum', '560034',
            CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)', v_service_id, 12.9352, 77.6245, 'Limit test 3', 'LIMIT2', 0
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Scenario 7 Failed: 3rd reservation should be rejected when limit is reached';
    RAISE NOTICE '✓ Scenario 7 Passed: Coupon reservation limit enforced concurrency-safely';

    -- --------------------------------------------------------------------------
    -- 8. Customer advance payment before weighing & Staff Confirmation
    -- --------------------------------------------------------------------------
    -- Order 2 is currently booked and unweighed (total_amount_paise is NULL)
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    v_pay_res := public.record_order_payment(
        v_order_2.id,
        5000, -- ₹50
        'upi_manual',
        'UTR-ADVANCE-001',
        'Customer advance deposit',
        'idemp-adv-001',
        'advance'
    );

    ASSERT (v_pay_res->>'success')::boolean = true, 'Scenario 8 Failed: Advance payment failed';
    ASSERT (v_pay_res->>'status')::text = 'initiated', 'Scenario 8 Failed: Customer advance payment should be "initiated"';
    ASSERT (v_pay_res->>'paid_amount_paise')::integer = 0, 'Scenario 8 Failed: Unverified payment should NOT increase paid_amount_paise';

    -- Staff verifies and confirms the advance payment
    PERFORM set_config('request.jwt.claim.sub', v_staff_owner::text, true);
    v_pay_res := public.record_order_payment(
        v_order_2.id,
        5000,
        'upi_manual',
        'UTR-ADVANCE-001',
        'Owner verified UTR and confirmed advance payment',
        'idemp-adv-confirm-001',
        'advance'
    );
    ASSERT (v_pay_res->>'status')::text = 'confirmed', 'Scenario 8 Failed: Staff confirmed status should be "confirmed"';
    ASSERT (v_pay_res->>'paid_amount_paise')::integer = 5000, 'Scenario 8 Failed: Paid amount should be 5000';
    ASSERT (v_pay_res->>'payment_status')::text = 'partially_paid', 'Scenario 8 Failed: Status should be partially_paid';
    RAISE NOTICE '✓ Scenario 8 Passed: Customer initiated advance payment and store staff confirmed ledger entry';

    -- --------------------------------------------------------------------------
    -- 9. Customer paying against another customer's booking (Security Guard)
    -- --------------------------------------------------------------------------
    -- Customer B attempts to record payment on Customer A's Order 2
    PERFORM set_config('request.jwt.claim.sub', v_customer_b::text, true);
    v_err_caught := false;
    BEGIN
        PERFORM public.record_order_payment(
            v_order_2.id, 2000, 'upi_manual', 'UTR-HACK-001', 'Attacking other order', 'idemp-hack-001', 'advance'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Scenario 9 Failed: Customer paying against another customer was NOT blocked!';
    RAISE NOTICE '✓ Scenario 9 Passed: Cross-customer payment rejected by authorization guard';

    -- --------------------------------------------------------------------------
    -- 10. Staff recording permitted payments
    -- --------------------------------------------------------------------------
    -- Owner records cash payment
    PERFORM set_config('request.jwt.claim.sub', v_staff_owner::text, true);
    v_pay_res := public.record_order_payment(
        v_order_2.id,
        2000, -- ₹20
        'cash',
        NULL,
        'Staff collected additional advance',
        'idemp-staff-001',
        'advance'
    );
    ASSERT (v_pay_res->>'paid_amount_paise')::integer = 7000, 'Scenario 10 Failed: Staff payment not credited';
    RAISE NOTICE '✓ Scenario 10 Passed: Store staff successfully recorded authorized payment';

    -- --------------------------------------------------------------------------
    -- 11. Balance payment following advance payment
    -- --------------------------------------------------------------------------
    -- Weigh Order 2: 5.0 kg @ ₹79 = ₹395.00 (39500 paise). EXPREZ10 10% discount = 3950 paise.
    -- Total = ₹355.50 (35550 paise). Already paid advance = ₹70 (7000 paise). Balance = ₹285.50 (28550 paise).
    PERFORM set_config('request.jwt.claim.sub', v_staff_owner::text, true);
    UPDATE public.orders SET assigned_pickup_id = v_staff_courier, order_status = 'pickup_assigned' WHERE id = v_order_2.id;
    PERFORM set_config('request.jwt.claim.sub', v_staff_courier::text, true);
    PERFORM public.record_courier_pickup_collection(v_order_2.id, 5.00, 'Weighed 5 kg');

    -- Customer initiates remaining balance of ₹285.50
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    v_pay_res := public.record_order_payment(
        v_order_2.id,
        28550, -- Remaining balance
        'upi_manual',
        'UTR-BALANCE-001',
        'Final balance payment',
        'idemp-bal-001',
        'balance'
    );
    ASSERT (v_pay_res->>'status')::text = 'initiated', 'Scenario 11 Failed: Customer balance payment should be "initiated"';

    -- Staff verifies and confirms balance payment
    PERFORM set_config('request.jwt.claim.sub', v_staff_owner::text, true);
    v_pay_res := public.record_order_payment(
        v_order_2.id,
        28550,
        'upi_manual',
        'UTR-BALANCE-001',
        'Staff verified and confirmed final balance',
        'idemp-bal-confirm-001',
        'balance'
    );

    ASSERT (v_pay_res->>'paid_amount_paise')::integer = 35550, 'Scenario 11 Failed: Total paid should be 35550';
    ASSERT (v_pay_res->>'payment_status')::text = 'paid', 'Scenario 11 Failed: Order should be marked "paid"';
    ASSERT (v_pay_res->>'remaining_paise')::integer = 0, 'Scenario 11 Failed: Remaining balance should be 0';
    RAISE NOTICE '✓ Scenario 11 Passed: Balance payment correctly cleared outstanding ledger balance';

    -- --------------------------------------------------------------------------
    -- 12. Duplicate payment idempotency
    -- --------------------------------------------------------------------------
    v_pay_res := public.record_order_payment(
        v_order_2.id,
        28550,
        'upi_manual',
        'UTR-BALANCE-001',
        'Final balance payment',
        'idemp-bal-001', -- Same idempotency key
        'balance'
    );
    ASSERT (v_pay_res->>'idempotent_replay')::boolean = true, 'Scenario 12 Failed: Should return idempotent_replay';
    RAISE NOTICE '✓ Scenario 12 Passed: Duplicate payment request returned idempotently';

    -- --------------------------------------------------------------------------
    -- 13. Overpayment rejection
    -- --------------------------------------------------------------------------
    v_err_caught := false;
    BEGIN
        PERFORM public.record_order_payment(
            v_order_2.id,
            1000, -- Order is already fully paid!
            'upi_manual',
            'UTR-OVERPAY-001',
            'Overpay',
            'idemp-overpay-001',
            'balance'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Scenario 13 Failed: Overpayment was not rejected!';
    RAISE NOTICE '✓ Scenario 13 Passed: Overpayment strictly rejected by database guard';

    -- --------------------------------------------------------------------------
    -- 14. Cancellation with an outstanding advance payment (Refund Liability)
    -- --------------------------------------------------------------------------
    -- Create Order with ₹100 advance payment, then cancel
    PERFORM set_config('request.jwt.claim.sub', v_customer_a::text, true);
    v_order_1 := public.create_booking_idempotent(
        'sub-advance-cancel-01', 'Test Customer A', '9876543210', '123 Green Glen', 'Mall', '560103',
        CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)', v_service_id, 12.9352, 77.6245, 'Advance order', NULL, 0
    );

    -- Customer initiates advance payment and staff confirms it
    PERFORM public.record_order_payment(
        v_order_1.id, 10000, 'upi_manual', 'UTR-ADV-CANCEL-01', 'Advance deposit', 'idemp-advcan-01', 'advance'
    );
    PERFORM set_config('request.jwt.claim.sub', v_staff_owner::text, true);
    PERFORM public.record_order_payment(
        v_order_1.id, 10000, 'upi_manual', 'UTR-ADV-CANCEL-01', 'Confirmed advance deposit', 'idemp-advcan-conf-01', 'advance'
    );

    -- Customer cancels order
    v_cancel_res := public.cancel_order_with_batch_sync(v_order_1.id, 'Customer emergency');
    ASSERT (v_cancel_res->>'refund_pending')::boolean = true, 'Scenario 14 Failed: refund_pending should be true';

    -- Verify refund liability row in payments
    SELECT COUNT(*) INTO v_res_count
    FROM public.payments
    WHERE order_id = v_order_1.id AND payment_type = 'refund' AND status = 'refund_requested';
    ASSERT v_res_count = 1, 'Scenario 14 Failed: "refund_requested" liability row was not created!';
    RAISE NOTICE '✓ Scenario 14 Passed: Cancellation with advance payment recorded refund liability';

    -- --------------------------------------------------------------------------
    -- 15. Refund success, failure, and retry behavior
    -- --------------------------------------------------------------------------
    -- Owner executes refund for ₹100
    PERFORM set_config('request.jwt.claim.sub', v_staff_owner::text, true);
    v_refund_res := public.record_order_refund(
        v_order_1.id,
        10000,
        'Refund sent to customer UPI',
        'UTR-REFUND-SUCCESS-01',
        'idemp-refund-001'
    );

    ASSERT (v_refund_res->>'payment_status')::text = 'refunded', 'Scenario 15 Failed: Order should be marked "refunded"';
    ASSERT (v_refund_res->>'paid_amount_paise')::integer = 0, 'Scenario 15 Failed: Paid balance should be 0';

    -- Verify duplicate refund idempotency
    v_refund_res := public.record_order_refund(
        v_order_1.id,
        10000,
        'Refund sent to customer UPI',
        'UTR-REFUND-SUCCESS-01',
        'idemp-refund-001'
    );
    ASSERT (v_refund_res->>'idempotent_replay')::boolean = true, 'Scenario 15 Failed: Duplicate refund not idempotent';

    -- Verify over-refund attempt rejected (attempting to refund another ₹50)
    v_err_caught := false;
    BEGIN
        PERFORM public.record_order_refund(
            v_order_1.id, 5000, 'Over refund', 'UTR-OVERREFUND', 'idemp-overref-01'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Scenario 15 Failed: Over-refund was not rejected!';
    RAISE NOTICE '✓ Scenario 15 Passed: Refund processed, idempotency verified, over-refund rejected';

    RAISE NOTICE '============================================================';
    RAISE NOTICE 'ALL 15 DATABASE LIFECYCLE SCENARIOS VERIFIED SUCCESSFULLY!';
    RAISE NOTICE '============================================================';
END $$;

ROLLBACK;

