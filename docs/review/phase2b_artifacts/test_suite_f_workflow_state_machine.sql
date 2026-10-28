-- ==============================================================================
-- SuperWash Stage 5B Phase 2B: Suite F - Workflow & Cancellation State Machine
-- ==============================================================================

\set ON_ERROR_STOP off
CREATE TEMP TABLE suite_f_results (
    test_id TEXT PRIMARY KEY,
    test_name TEXT,
    expected TEXT,
    actual TEXT,
    status TEXT,
    details TEXT
);

-- Seed courier Ramesh (00000000-0000-4000-a000-000000000003), Suresh (00000000-0000-4000-a000-000000000004),
-- Manager (00000000-0000-4000-a000-000000000002), Customer A (11111111-1111-4111-a111-111111111111)
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
        'f0000000-0000-4000-a000-000000000001'::uuid,
        'ORD-F-001', v_cust_id, 'Cust F', '9876543210',
        'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
        v_svc_id, 'Standard Wash', 'per_kg', 7900, 1.00,
        'booked', 0, NULL, 'pending', 'Workflow verification order F1'
    ) ON CONFLICT (id) DO UPDATE SET order_status = 'booked', assigned_pickup_id = NULL, measured_weight = NULL;

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        order_status, paid_amount_paise, total_amount_paise, payment_status, notes
    ) VALUES (
        'f0000000-0000-4000-a000-000000000002'::uuid,
        'ORD-F-002', v_cust_id, 'Cust F', '9876543210',
        'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
        v_svc_id, 'Standard Wash', 'per_kg', 7900, 1.00,
        'booked', 0, NULL, 'pending', 'Customer cancellation order F2'
    ) ON CONFLICT (id) DO UPDATE SET order_status = 'booked', cancellation_reason = NULL;
END $$;

-- Test F1: Courier Pickup Assignment by Manager
DO $$
DECLARE
    v_res JSONB;
    v_order public.orders;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.assign_order_courier(
        'f0000000-0000-4000-a000-000000000001'::uuid,
        'pickup',
        '00000000-0000-4000-a000-000000000003'::uuid,
        'Ramesh Kumar', '9876500003'
    );
    RESET ROLE;

    SELECT * INTO v_order FROM public.orders WHERE id = 'f0000000-0000-4000-a000-000000000001'::uuid;

    IF v_order.order_status = 'pickup_assigned' AND v_order.assigned_pickup_id = '00000000-0000-4000-a000-000000000003'::uuid THEN
        INSERT INTO suite_f_results VALUES ('F1_ASSIGN_PICKUP', 'Pickup courier assignment', 'status=pickup_assigned, courier assigned', 'status=' || v_order.order_status || ', courier=' || v_order.assigned_pickup_name, 'PASS', 'Manager assigned courier Ramesh successfully');
    ELSE
        INSERT INTO suite_f_results VALUES ('F1_ASSIGN_PICKUP', 'Pickup courier assignment', 'status=pickup_assigned, courier assigned', 'Discrepancy', 'FAIL', 'Assignment failed');
    END IF;
END $$;

-- Test F2: Doorstep Collection Denied for Unassigned Courier
DO $$
DECLARE
    v_err_msg TEXT := '';
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000004', true); -- Suresh (unassigned)
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    BEGIN
        PERFORM public.record_courier_pickup_collection(
            'f0000000-0000-4000-a000-000000000001'::uuid,
            2.50,
            'Doorstep note by Suresh'
        );
        RESET ROLE;
        INSERT INTO suite_f_results VALUES ('F2_UNASSIGNED_COURIER_DENIED', 'Deny collection by unassigned courier', 'EXCEPTION: Unauthorized', 'SUCCESS', 'FAIL', 'Unassigned courier unexpectedly collected order');
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%not the assigned pickup associate%' THEN
            INSERT INTO suite_f_results VALUES ('F2_UNASSIGNED_COURIER_DENIED', 'Deny collection by unassigned courier', 'EXCEPTION: Unauthorized', v_err_msg, 'PASS', 'Unassigned courier rejected: ' || v_err_msg);
        ELSE
            INSERT INTO suite_f_results VALUES ('F2_UNASSIGNED_COURIER_DENIED', 'Deny collection by unassigned courier', 'EXCEPTION: Unauthorized', v_err_msg, 'FAIL', 'Unexpected exception: ' || v_err_msg);
        END IF;
    END;
END $$;

-- Test F3: Doorstep Collection & Scale Weighing by Assigned Courier
DO $$
DECLARE
    v_res JSONB;
    v_order public.orders;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000003', true); -- Ramesh (assigned)
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.record_courier_pickup_collection(
        'f0000000-0000-4000-a000-000000000001'::uuid,
        2.50,
        'Collected 2 bags at doorstep'
    );
    RESET ROLE;

    SELECT * INTO v_order FROM public.orders WHERE id = 'f0000000-0000-4000-a000-000000000001'::uuid;

    IF v_order.order_status = 'collected' AND v_order.pickup_measured_weight = 2.50 AND v_order.measured_weight = 2.50 THEN
        INSERT INTO suite_f_results VALUES ('F3_DOORSTEP_COLLECTION', 'Doorstep collection by assigned courier', 'status=collected, weight=2.50', 'status=' || v_order.order_status || ', weight=' || v_order.measured_weight, 'PASS', 'Doorstep collection successfully recorded');
    ELSE
        INSERT INTO suite_f_results VALUES ('F3_DOORSTEP_COLLECTION', 'Doorstep collection by assigned courier', 'status=collected, weight=2.50', 'Discrepancy', 'FAIL', 'Collection failed');
    END IF;
END $$;

-- Test F4: Early Customer Cancellation in 'booked' state permitted
DO $$
DECLARE
    v_res JSONB;
    v_order public.orders;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true); -- Customer
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.cancel_order_with_batch_sync(
        'f0000000-0000-4000-a000-000000000002'::uuid,
        'Plans changed, need to cancel booking'
    );
    RESET ROLE;

    SELECT * INTO v_order FROM public.orders WHERE id = 'f0000000-0000-4000-a000-000000000002'::uuid;

    IF v_order.order_status = 'cancelled' AND v_order.cancellation_reason LIKE '%Plans changed%' THEN
        INSERT INTO suite_f_results VALUES ('F4_EARLY_CUSTOMER_CANCEL', 'Early customer cancellation permitted', 'status=cancelled', 'status=' || v_order.order_status, 'PASS', 'Customer cleanly cancelled early booked order');
    ELSE
        INSERT INTO suite_f_results VALUES ('F4_EARLY_CUSTOMER_CANCEL', 'Early customer cancellation permitted', 'status=cancelled', 'Discrepancy', 'FAIL', 'Early cancellation failed');
    END IF;
END $$;

-- Test F5: Prohibited Late Customer Cancellation on 'collected' Order
DO $$
DECLARE
    v_err_msg TEXT := '';
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', true); -- Customer
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    BEGIN
        -- Order F1 is already in 'collected' state
        PERFORM public.cancel_order_with_batch_sync(
            'f0000000-0000-4000-a000-000000000001'::uuid,
            'Late customer cancellation attempt'
        );
        RESET ROLE;
        INSERT INTO suite_f_results VALUES ('F5_LATE_CUSTOMER_CANCEL_DENIED', 'Deny customer cancellation on collected order', 'EXCEPTION: cannot be cancelled after collection', 'SUCCESS', 'FAIL', 'Late customer cancellation unexpectedly succeeded');
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%cannot be cancelled by customer after collection has commenced%' THEN
            INSERT INTO suite_f_results VALUES ('F5_LATE_CUSTOMER_CANCEL_DENIED', 'Deny customer cancellation on collected order', 'EXCEPTION: cannot be cancelled after collection', v_err_msg, 'PASS', 'Late customer cancellation rejected: ' || v_err_msg);
        ELSE
            INSERT INTO suite_f_results VALUES ('F5_LATE_CUSTOMER_CANCEL_DENIED', 'Deny customer cancellation on collected order', 'EXCEPTION: cannot be cancelled after collection', v_err_msg, 'FAIL', 'Unexpected exception: ' || v_err_msg);
        END IF;
    END;
END $$;

-- Test F6: Store Intake Final Weighing by Manager
DO $$
DECLARE
    v_res JSONB;
    v_order public.orders;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.record_store_intake_weight(
        'f0000000-0000-4000-a000-000000000001'::uuid,
        2.60,
        'Intake verified at 2.60kg'
    );
    RESET ROLE;

    SELECT * INTO v_order FROM public.orders WHERE id = 'f0000000-0000-4000-a000-000000000001'::uuid;

    IF v_order.order_status = 'washing' AND v_order.measured_weight = 2.60 AND v_order.total_amount_paise > 0 THEN
        INSERT INTO suite_f_results VALUES ('F6_STORE_INTAKE_WEIGH', 'Store intake weighing transitions to washing', 'status=washing, weight=2.60', 'status=' || v_order.order_status || ', weight=' || v_order.measured_weight || ', total=' || v_order.total_amount_paise, 'PASS', 'Store intake weighing completed and order moved to washing');
    ELSE
        INSERT INTO suite_f_results VALUES ('F6_STORE_INTAKE_WEIGH', 'Store intake weighing transitions to washing', 'status=washing, weight=2.60', 'Discrepancy', 'FAIL', 'Intake weighing failed');
    END IF;
END $$;

-- Test F7: Lifecycle Transitions: washing -> ready_for_delivery -> delivery_assigned -> out_for_delivery -> delivered
DO $$
DECLARE
    v_order public.orders;
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- 1. Move to ready_for_delivery
    PERFORM public.advance_order_workflow_status(
        'f0000000-0000-4000-a000-000000000001'::uuid,
        'ready_for_delivery',
        'Clothes washed and packed'
    );

    -- 2. Assign delivery courier
    PERFORM public.assign_order_courier(
        'f0000000-0000-4000-a000-000000000001'::uuid,
        'delivery',
        '00000000-0000-4000-a000-000000000004'::uuid,
        'Suresh Kumar', '9876500004'
    );

    -- 3. Dispatch to out_for_delivery
    PERFORM public.advance_order_workflow_status(
        'f0000000-0000-4000-a000-000000000001'::uuid,
        'out_for_delivery',
        'Dispatched with Suresh'
    );

    -- 4. Complete delivery to delivered
    PERFORM public.advance_order_workflow_status(
        'f0000000-0000-4000-a000-000000000001'::uuid,
        'delivered',
        'Handover completed'
    );

    RESET ROLE;

    SELECT * INTO v_order FROM public.orders WHERE id = 'f0000000-0000-4000-a000-000000000001'::uuid;

    IF v_order.order_status = 'delivered' AND v_order.delivered_at IS NOT NULL THEN
        INSERT INTO suite_f_results VALUES ('F7_LIFECYCLE_TO_DELIVERED', 'Full lifecycle progression to delivered', 'status=delivered', 'status=' || v_order.order_status, 'PASS', 'Lifecycle transitions cleanly executed to delivered state');
    ELSE
        INSERT INTO suite_f_results VALUES ('F7_LIFECYCLE_TO_DELIVERED', 'Full lifecycle progression to delivered', 'status=delivered', 'status=' || v_order.order_status, 'FAIL', 'Lifecycle progression failed');
    END IF;
END $$;

-- Test F8: Terminal State Protection on 'delivered' Order
DO $$
DECLARE
    v_err_msg TEXT := '';
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    BEGIN
        -- Attempt to reopen delivered order to washing
        PERFORM public.advance_order_workflow_status(
            'f0000000-0000-4000-a000-000000000001'::uuid,
            'washing',
            'Attempt to reopen delivered order'
        );
        RESET ROLE;
        INSERT INTO suite_f_results VALUES ('F8_DELIVERED_TERMINAL_PROTECTION', 'Prevent reopening delivered order', 'EXCEPTION: Cannot move to washing from status delivered', 'SUCCESS', 'FAIL', 'Reopening delivered order unexpectedly succeeded');
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        v_err_msg := SQLERRM;
        IF v_err_msg LIKE '%Cannot move to washing from status "delivered"%' OR v_err_msg LIKE '%Terminal state%' OR v_err_msg LIKE '%Invalid transition%' THEN
            INSERT INTO suite_f_results VALUES ('F8_DELIVERED_TERMINAL_PROTECTION', 'Prevent reopening delivered order', 'EXCEPTION: Terminal state', v_err_msg, 'PASS', 'Terminal state protected on delivered order: ' || v_err_msg);
        ELSE
            INSERT INTO suite_f_results VALUES ('F8_DELIVERED_TERMINAL_PROTECTION', 'Prevent reopening delivered order', 'EXCEPTION: Terminal state', v_err_msg, 'FAIL', 'Unexpected exception: ' || v_err_msg);
        END IF;
    END;
END $$;

-- Test F9: Audit History Trail Verification
DO $$
DECLARE
    v_history_count INT;
BEGIN
    SELECT count(*) INTO v_history_count
    FROM public.order_status_history
    WHERE order_id = 'f0000000-0000-4000-a000-000000000001'::uuid;

    IF v_history_count >= 5 THEN
        INSERT INTO suite_f_results VALUES ('F9_AUDIT_LOG_VERIFICATION', 'Immutable audit log verification', '>= 5 audit history entries', v_history_count || ' audit entries recorded', 'PASS', 'Complete sequential audit history verified in order_status_history');
    ELSE
        INSERT INTO suite_f_results VALUES ('F9_AUDIT_LOG_VERIFICATION', 'Immutable audit log verification', '>= 5 audit history entries', v_history_count || ' audit entries recorded', 'FAIL', 'Audit trail incomplete');
    END IF;
END $$;

SELECT test_id, test_name, status, details FROM suite_f_results ORDER BY test_id;
