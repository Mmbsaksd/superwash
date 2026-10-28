-- ==============================================================================
-- SuperWash Stage 5B Phase 2B: Suite G - Invoice and Billing Reconciliation
-- ==============================================================================

\set ON_ERROR_STOP off
CREATE TEMP TABLE suite_g_results (
    test_id TEXT PRIMARY KEY,
    test_name TEXT,
    expected TEXT,
    actual TEXT,
    status TEXT,
    details TEXT
);

-- Seed services with different pricing units: per_kg, per_piece, per_load
DO $$
BEGIN
    INSERT INTO public.services (id, name, unit_price_paise, pricing_unit, min_weight_kg, is_active)
    VALUES 
        ('00000007-1111-4111-a111-111111111111'::uuid, 'Premium Wash', 8500, 'per_kg', 2.00, true),
        ('00000007-2222-4222-a222-222222222222'::uuid, 'Ironing per piece', 2500, 'per_piece', 1.00, true),
        ('00000007-3333-4333-a333-333333333333'::uuid, 'Bedding per load', 35000, 'per_load', 1.00, true)
    ON CONFLICT (id) DO UPDATE SET unit_price_paise = EXCLUDED.unit_price_paise, pricing_unit = EXCLUDED.pricing_unit, is_active = true;
END $$;

-- Test G1: Pricing across units (per_kg, per_piece, per_load) via internal calculator
DO $$
DECLARE
    v_kg_calc RECORD;
    v_pc_calc RECORD;
    v_ld_calc RECORD;
BEGIN
    -- 1. per_kg: 3.50 kg @ 8500 paise, min 2.0 kg -> 3.50 * 8500 = 29750 paise
    SELECT * INTO v_kg_calc FROM public.calculate_order_laundry_charge_internal(3.50, 8500, 2.00, 'per_kg');

    -- 2. per_piece: measured_weight treated as item count: 10 items @ 2500 paise = 25000 paise
    SELECT * INTO v_pc_calc FROM public.calculate_order_laundry_charge_internal(10.00, 2500, 1.00, 'per_piece');

    -- 3. per_load: 1 load @ 35000 paise
    SELECT * INTO v_ld_calc FROM public.calculate_order_laundry_charge_internal(1.00, 35000, 1.00, 'per_load');

    IF v_kg_calc.laundry_charge_paise = 29750 AND v_pc_calc.laundry_charge_paise = 25000 AND v_ld_calc.laundry_charge_paise = 35000 THEN
        INSERT INTO suite_g_results VALUES ('G1_PRICING_UNITS_RECONCILIATION', 'Pricing calculation across units', 'kg=29750, piece=25000, load=35000', 'kg=' || v_kg_calc.laundry_charge_paise || ', piece=' || v_pc_calc.laundry_charge_paise || ', load=' || v_ld_calc.laundry_charge_paise, 'PASS', 'Accurate pricing evaluated across all units without distortion');
    ELSE
        INSERT INTO suite_g_results VALUES ('G1_PRICING_UNITS_RECONCILIATION', 'Pricing calculation across units', 'kg=29750, piece=25000, load=35000', 'Discrepancy', 'FAIL', 'Pricing unit calculation failed');
    END IF;
END $$;

-- Test G2: Billable Weight Minimum Invariant
DO $$
DECLARE
    v_calc RECORD;
BEGIN
    -- Measured 0.80 kg, min_weight = 2.00 kg -> billable weight must be 2.00 kg -> charge = 2.00 * 8500 = 17000 paise
    SELECT * INTO v_calc FROM public.calculate_order_laundry_charge_internal(0.80, 8500, 2.00, 'per_kg');

    IF v_calc.billable_weight = 2.00 AND v_calc.laundry_charge_paise = 17000 THEN
        INSERT INTO suite_g_results VALUES ('G2_MIN_WEIGHT_INVARIANT', 'Billable weight floor at min_weight', 'billable=2.00, charge=17000', 'billable=' || v_calc.billable_weight || ', charge=' || v_calc.laundry_charge_paise, 'PASS', 'Billable weight correctly clamped to min_weight');
    ELSE
        INSERT INTO suite_g_results VALUES ('G2_MIN_WEIGHT_INVARIANT', 'Billable weight floor at min_weight', 'billable=2.00, charge=17000', 'Discrepancy', 'FAIL', 'Minimum weight calculation failed');
    END IF;
END $$;

-- Test G3: Invoice Component Reconciliation (Subtotal, Discount, Delivery Fee, Net Total)
DO $$
DECLARE
    v_cust_id UUID := '11111111-1111-4111-a111-111111111111'::uuid;
    v_snap JSONB;
    v_order public.orders;
    v_calc_subtotal INTEGER;
    v_calc_net INTEGER;
BEGIN
    SELECT jsonb_build_object(
        'code', code, 'discount_type', discount_type, 'discount_value', discount_value,
        'min_order_paise', min_order_paise, 'max_discount_paise', max_discount_paise
    ) INTO v_snap FROM public.coupons WHERE code = 'SNAPPERC20';

    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone,
        pickup_address, pickup_pincode, pickup_date, pickup_slot,
        service_id, service_name, pricing_unit, price_per_kg_paise, min_weight_kg,
        delivery_charge_paise, order_status, notes, coupon_code, discount_paise, coupon_snapshot
    ) VALUES (
        '00000007-0000-4000-a000-000000000001'::uuid, 'ORD-INV-001', v_cust_id, 'Invoice Cust', '9876543210',
        'Indiranagar', '560038', CURRENT_DATE, 'Morning (08:00 AM - 11:00 AM)',
        '00000007-1111-4111-a111-111111111111'::uuid, 'Premium Wash', 'per_kg', 8500, 2.00,
        4000, 'collected', 'Multi-service booking [Linked Batch G-B1: S1]', 'SNAPPERC20', 0, v_snap
    ) ON CONFLICT (id) DO UPDATE SET order_status = 'collected', discount_paise = 0, measured_weight = NULL, total_amount_paise = NULL, notes = 'Multi-service booking [Linked Batch G-B1: S1]';

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- Weigh at 3.0 kg:
    -- Subtotal: 3.0 * 8500 = 25500 paise
    -- 20% discount: 20% of 25500 = 5100 paise (<= 8000 max cap)
    -- Delivery fee: 4000 paise
    -- Expected total: 25500 - 5100 + 4000 = 24400 paise
    PERFORM public.record_store_intake_weight('00000007-0000-4000-a000-000000000001'::uuid, 3.00);
    RESET ROLE;

    SELECT * INTO v_order FROM public.orders WHERE id = '00000007-0000-4000-a000-000000000001'::uuid;

    v_calc_subtotal := ROUND(v_order.measured_weight * v_order.price_per_kg_paise);
    v_calc_net := v_calc_subtotal - v_order.discount_paise + v_order.delivery_charge_paise;

    IF v_calc_subtotal = 25500 AND v_order.discount_paise = 5100 AND v_order.delivery_charge_paise = 4000 AND v_order.total_amount_paise = 24400 AND v_calc_net = v_order.total_amount_paise THEN
        INSERT INTO suite_g_results VALUES ('G3_INVOICE_ARITHMETIC_RECONCILIATION', 'Invoice components: subtotal, discount, fee, total', 'subtotal=25500, disc=5100, fee=4000, total=24400', 'subtotal=' || v_calc_subtotal || ', disc=' || v_order.discount_paise || ', fee=' || v_order.delivery_charge_paise || ', total=' || v_order.total_amount_paise, 'PASS', 'All invoice components independently reconciled and mathematically consistent');
    ELSE
        INSERT INTO suite_g_results VALUES ('G3_INVOICE_ARITHMETIC_RECONCILIATION', 'Invoice components: subtotal, discount, fee, total', 'total=24400', 'total=' || v_order.total_amount_paise, 'FAIL', 'Invoice component discrepancy');
    END IF;
END $$;

-- Test G4: Outstanding Balance Reconciliation (Total vs Paid Amount)
DO $$
DECLARE
    v_order public.orders;
    v_outstanding INTEGER;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = '00000007-0000-4000-a000-000000000001'::uuid;

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true); -- manager
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- Make partial payment of 10000 paise (₹100)
    PERFORM public.record_order_payment(
        '00000007-0000-4000-a000-000000000001'::uuid,
        10000,
        'cash',
        p_idempotency_key => 'inv-pay-1'
    );
    RESET ROLE;

    SELECT * INTO v_order FROM public.orders WHERE id = '00000007-0000-4000-a000-000000000001'::uuid;
    v_outstanding := v_order.total_amount_paise - v_order.paid_amount_paise;

    -- Total = 24400 paise, Paid = 10000 paise -> Outstanding = 14400 paise (₹144.00)
    IF v_order.paid_amount_paise = 10000 AND v_outstanding = 14400 THEN
        INSERT INTO suite_g_results VALUES ('G4_OUTSTANDING_BALANCE_RECONCILIATION', 'Outstanding balance calculation', 'paid=10000, balance=14400', 'paid=' || v_order.paid_amount_paise || ', balance=' || v_outstanding, 'PASS', 'Outstanding invoice balance matches total minus payments');
    ELSE
        INSERT INTO suite_g_results VALUES ('G4_OUTSTANDING_BALANCE_RECONCILIATION', 'Outstanding balance calculation', 'paid=10000, balance=14400', 'Discrepancy', 'FAIL', 'Outstanding balance calculation failed');
    END IF;
END $$;

SELECT test_id, test_name, status, details FROM suite_g_results ORDER BY test_id;
