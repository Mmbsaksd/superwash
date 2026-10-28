-- ==============================================================================
-- SuperWash Stage 5B Phase 2B: Suite E - Payment Ledger & Financial Invariants
-- ==============================================================================

\set ON_ERROR_STOP off
CREATE TEMP TABLE suite_e_results (
    test_id TEXT PRIMARY KEY,
    test_name TEXT,
    expected TEXT,
    actual TEXT,
    status TEXT,
    details TEXT
);

-- Seed test order for payment tests
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_svc_id UUID;
BEGIN
    SELECT id INTO v_svc_id FROM public.services WHERE is_active = true ORDER BY created_at ASC LIMIT 1;

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, paid_amount_paise, total_amount_paise, payment_status, notes
    ) VALUES (
        'e0000000-0000-4000-a000-000000000001'::uuid,
        'SW-PAY-001', v_cust_id, 'Payment Cust', '9876543210',
        'Koramangala', '560034', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
        v_svc_id, 'Standard Wash', 'per_kg', 10000, 1.00,
        'washing', 0, 20000, 'pending', 'Payment verification order'
    ) ON CONFLICT (id) DO UPDATE 
    SET order_status = 'washing', paid_amount_paise = 0, total_amount_paise = 20000, payment_status = 'pending';
END $$;

-- Test E1: Initial Unpaid State
DO $$
DECLARE
    v_order public.orders;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = 'e0000000-0000-4000-a000-000000000001'::uuid;
    IF v_order.paid_amount_paise = 0 AND v_order.payment_status = 'pending' THEN
        INSERT INTO suite_e_results VALUES ('E1_INITIAL_UNPAID', 'Initial unpaid order state', 'paid=0, status=pending', 'paid=' || v_order.paid_amount_paise || ', status=' || v_order.payment_status, 'PASS', 'Clean initial payment state verified');
    ELSE
        INSERT INTO suite_e_results VALUES ('E1_INITIAL_UNPAID', 'Initial unpaid order state', 'paid=0, status=pending', 'Discrepancy', 'FAIL', 'Initial unpaid state mismatch');
    END IF;
END $$;

-- Test E2: Partial Payment via record_order_payment
DO $$
DECLARE
    v_res JSONB;
    v_order public.orders;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.record_order_payment(
        p_order_id => 'e0000000-0000-4000-a000-000000000001'::uuid,
        p_amount_paise => 8000,
        p_payment_method => 'cash',
        p_notes => 'Partial cash advance',
        p_idempotency_key => 'pay-key-part-1'
    );
    RESET ROLE;

    SELECT * INTO v_order FROM public.orders WHERE id = 'e0000000-0000-4000-a000-000000000001'::uuid;

    IF v_order.paid_amount_paise = 8000 AND v_order.payment_status = 'partially_paid' THEN
        INSERT INTO suite_e_results VALUES ('E2_PARTIAL_PAYMENT', 'Partial payment execution', 'paid=8000, status=partially_paid', 'paid=' || v_order.paid_amount_paise || ', status=' || v_order.payment_status, 'PASS', 'Partial payment recorded and status set to partially_paid');
    ELSE
        INSERT INTO suite_e_results VALUES ('E2_PARTIAL_PAYMENT', 'Partial payment execution', 'paid=8000, status=partially_paid', 'Discrepancy', 'FAIL', 'Partial payment failed to update order');
    END IF;
END $$;

-- Test E3: Second Partial / Multiple Payments Aggregation to Full Payment
DO $$
DECLARE
    v_res JSONB;
    v_order public.orders;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.record_order_payment(
        p_order_id => 'e0000000-0000-4000-a000-000000000001'::uuid,
        p_amount_paise => 12000,
        p_payment_method => 'upi_manual',
        p_transaction_reference => 'UTR123456789012',
        p_notes => 'Remaining balance payment via UPI',
        p_idempotency_key => 'pay-key-full-2'
    );
    RESET ROLE;

    SELECT * INTO v_order FROM public.orders WHERE id = 'e0000000-0000-4000-a000-000000000001'::uuid;

    IF v_order.paid_amount_paise = 20000 AND v_order.payment_status = 'paid' THEN
        INSERT INTO suite_e_results VALUES ('E3_MULTIPLE_PAYMENTS_TO_FULL', 'Multiple payments aggregate to paid status', 'paid=20000, status=paid', 'paid=' || v_order.paid_amount_paise || ', status=' || v_order.payment_status, 'PASS', 'Multiple ledger entries cleanly aggregated to full paid status');
    ELSE
        INSERT INTO suite_e_results VALUES ('E3_MULTIPLE_PAYMENTS_TO_FULL', 'Multiple payments aggregate to paid status', 'paid=20000, status=paid', 'Discrepancy', 'FAIL', 'Aggregated payment failed to set paid status');
    END IF;
END $$;

-- Test E4: Payment Overpayment Rejection
DO $$
DECLARE
    v_err_msg TEXT := '';
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    BEGIN
        -- Order total is 20000, already paid 20000. Any further payment exceeds total
        PERFORM public.record_order_payment(
            p_order_id => 'e0000000-0000-4000-a000-000000000001'::uuid,
            p_amount_paise => 5000,
            p_payment_method => 'cash',
            p_idempotency_key => 'pay-key-over-3'
        );
        RESET ROLE;
        INSERT INTO suite_e_results VALUES ('E4_OVERPAYMENT_REJECTION', 'Prevent payment exceeding order total', 'EXCEPTION: exceeds remaining balance', 'SUCCESS', 'FAIL', 'Overpayment unexpectedly succeeded');
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%already fully paid%' OR v_err_msg LIKE '%exceeds remaining balance%' OR v_err_msg LIKE '%exceeds order total%' THEN
            INSERT INTO suite_e_results VALUES ('E4_OVERPAYMENT_REJECTION', 'Prevent payment exceeding order total', 'EXCEPTION: exceeds remaining/fully paid', v_err_msg, 'PASS', 'Overpayment rejected: ' || v_err_msg);
        ELSE
            INSERT INTO suite_e_results VALUES ('E4_OVERPAYMENT_REJECTION', 'Prevent payment exceeding order total', 'EXCEPTION: exceeds remaining/fully paid', v_err_msg, 'FAIL', 'Unexpected exception: ' || v_err_msg);
        END IF;
    END;
END $$;

-- Test E5: Trigger Violation on Direct paid_amount_paise Manipulation
DO $$
DECLARE
    v_err_msg TEXT := '';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    UPDATE public.orders
    SET paid_amount_paise = 25000
    WHERE id = 'e0000000-0000-4000-a000-000000000001'::uuid;

    INSERT INTO suite_e_results VALUES ('E5_DIRECT_PAYMENT_UPDATE_DENIED', 'Trigger blocks direct paid_amount modification', 'EXCEPTION: Direct payment field modification is prohibited', 'SUCCESS', 'FAIL', 'Direct update to paid_amount_paise unexpectedly succeeded');
EXCEPTION WHEN OTHERS THEN
    v_err_msg := SQLERRM;
    IF v_err_msg LIKE '%Direct payment field modification is prohibited%' OR v_err_msg LIKE '%cannot exceed bill total%' THEN
        INSERT INTO suite_e_results VALUES ('E5_DIRECT_PAYMENT_UPDATE_DENIED', 'Trigger blocks direct paid_amount modification', 'EXCEPTION: Direct payment field modification is prohibited', v_err_msg, 'PASS', 'Trigger blocked direct payment manipulation: ' || v_err_msg);
    ELSE
        INSERT INTO suite_e_results VALUES ('E5_DIRECT_PAYMENT_UPDATE_DENIED', 'Trigger blocks direct paid_amount modification', 'EXCEPTION: Direct payment field modification is prohibited', v_err_msg, 'FAIL', 'Unexpected exception: ' || v_err_msg);
    END IF;
END $$;

-- Test E6: Trigger Violation on Decreasing paid_amount_paise
DO $$
DECLARE
    v_err_msg TEXT := '';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    UPDATE public.orders
    SET paid_amount_paise = 10000
    WHERE id = 'e0000000-0000-4000-a000-000000000001'::uuid;

    INSERT INTO suite_e_results VALUES ('E6_DECREASE_PAID_AMOUNT_DENIED', 'Trigger blocks decreasing paid_amount', 'EXCEPTION: Paid amount on orders cannot decrease', 'SUCCESS', 'FAIL', 'Decreasing paid_amount_paise unexpectedly succeeded');
EXCEPTION WHEN OTHERS THEN
    v_err_msg := SQLERRM;
    IF v_err_msg LIKE '%Paid amount on orders cannot decrease%' OR v_err_msg LIKE '%Direct payment field modification is prohibited%' THEN
        INSERT INTO suite_e_results VALUES ('E6_DECREASE_PAID_AMOUNT_DENIED', 'Trigger blocks decreasing paid_amount', 'EXCEPTION: Paid amount on orders cannot decrease', v_err_msg, 'PASS', 'Trigger protected paid amount floor: ' || v_err_msg);
    ELSE
        INSERT INTO suite_e_results VALUES ('E6_DECREASE_PAID_AMOUNT_DENIED', 'Trigger blocks decreasing paid_amount', 'EXCEPTION: Paid amount on orders cannot decrease', v_err_msg, 'FAIL', 'Unexpected exception: ' || v_err_msg);
    END IF;
END $$;

-- Test E7: Payment Idempotency Key Replay
DO $$
DECLARE
    v_res JSONB;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.record_order_payment(
        p_order_id => 'e0000000-0000-4000-a000-000000000001'::uuid,
        p_amount_paise => 8000,
        p_payment_method => 'cash',
        p_idempotency_key => 'pay-key-part-1' -- Exact duplicate replay of E2
    );
    RESET ROLE;

    IF (v_res->>'idempotent_replay')::boolean = true AND (v_res->>'amount_paise')::int = 8000 THEN
        INSERT INTO suite_e_results VALUES ('E7_PAYMENT_IDEMPOTENT_REPLAY', 'Payment idempotency key replay', 'idempotent_replay=true', v_res::text, 'PASS', 'Idempotent replay safely returned original payment without creating duplicate ledger row');
    ELSE
        INSERT INTO suite_e_results VALUES ('E7_PAYMENT_IDEMPOTENT_REPLAY', 'Payment idempotency key replay', 'idempotent_replay=true', v_res::text, 'FAIL', 'Idempotent replay failed');
    END IF;
END $$;

SELECT test_id, test_name, status, details FROM suite_e_results ORDER BY test_id;
