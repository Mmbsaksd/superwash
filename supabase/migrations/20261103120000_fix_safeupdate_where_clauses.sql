-- ==============================================================================
-- SuperWash Exprez — Migration 20261103120000
-- Fix: Enforce Explicit WHERE Clauses on All UPDATEs for safeupdate Compliance
-- ==============================================================================
-- Under Supabase's authenticator session preload configuration, the PostgreSQL
-- extension 'safeupdate' is active. Any UPDATE statement without an explicit WHERE
-- clause triggers ERROR: 42P01 / 42601 "UPDATE requires a WHERE clause".
-- This migration updates:
-- 1. record_courier_pickup_collection (tmp_pickup_calc line_total calculation)
-- 2. record_store_intake_weight (tmp_intake_calc line_total calculation)
-- 3. activate_pricing_version (business_settings primary item sync)
-- ==============================================================================

-- 1. STORED PROCEDURE: record_courier_pickup_collection (Doorstep Weighing & Pickup)
CREATE OR REPLACE FUNCTION public.record_courier_pickup_collection(
    p_order_id UUID,
    p_service_measurements JSONB,
    p_delivery_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders;
    v_caller_role VARCHAR;
    v_item public.order_items;
    v_item_idx INTEGER := 0;
    v_elem JSONB;
    v_input_weight NUMERIC(6, 2);
    v_order_min_weight NUMERIC(6, 2);
    v_weight_sum NUMERIC(6, 2) := 0;
    v_weight_items_count INTEGER := 0;
    v_min_weight_applied BOOLEAN := false;
    v_target_billable_sum NUMERIC(6, 2) := 0;
    v_rem_cents INTEGER := 0;
    v_total_measured NUMERIC(6, 2) := 0;
    v_total_billable NUMERIC(6, 2) := 0;
    v_total_subtotal INTEGER := 0;
    v_discount_paise INTEGER := 0;
    v_total_amount_paise INTEGER;
    v_res RECORD;
    v_clean_coupon TEXT;
    v_items_count INTEGER := 0;
    v_matched BOOLEAN;
    v_cur_calc RECORD;
BEGIN
    -- 1. Authorization
    v_caller_role := public.current_user_role();
    IF auth.role() <> 'service_role' AND (v_caller_role IS NULL OR v_caller_role NOT IN ('delivery', 'manager', 'owner')) THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned delivery associates, managers, and owners can record pickup collection.';
    END IF;

    -- 2. Lock Order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF v_caller_role = 'delivery' AND auth.role() <> 'service_role' AND v_order.assigned_pickup_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You are not the assigned pickup associate for order #%.', v_order.order_number;
    END IF;

    IF v_order.order_status <> 'pickup_assigned' THEN
        RAISE EXCEPTION 'Invalid order state: Doorstep collection cannot be performed on order #% in status "%". Expected "pickup_assigned".',
            v_order.order_number, v_order.order_status;
    END IF;

    IF p_service_measurements IS NULL OR jsonb_typeof(p_service_measurements) <> 'array' OR jsonb_array_length(p_service_measurements) = 0 THEN
        RAISE EXCEPTION 'Missing service measurements: At least one measured scale reading is required.';
    END IF;

    -- 3. Ensure order items exist; seed if legacy single-service order has no items
    SELECT COUNT(*) INTO v_items_count FROM public.order_items WHERE order_id = v_order.id;
    IF v_items_count = 0 THEN
        INSERT INTO public.order_items (
            order_id,
            service_id,
            service_name,
            pricing_unit,
            unit_price_paise,
            min_weight_kg,
            created_at,
            updated_at
        ) VALUES (
            v_order.id,
            v_order.service_id,
            COALESCE(v_order.service_name, 'Wash & Fold Laundry'),
            COALESCE(v_order.pricing_unit, 'per_kg'),
            COALESCE(v_order.price_per_kg_paise, 7900),
            COALESCE(v_order.min_weight_kg, 1.00),
            timezone('utc', now()),
            timezone('utc', now())
        );
    END IF;

    v_order_min_weight := COALESCE(v_order.min_weight_kg, 1.00);

    -- 4. Temporary table for multi-service calculations
    CREATE TEMP TABLE tmp_pickup_calc (
        id UUID,
        service_id UUID,
        service_name TEXT,
        pricing_unit TEXT,
        unit_price_paise INTEGER,
        input_weight NUMERIC(6, 2),
        raw_billable NUMERIC(10, 6),
        allocated_cents INTEGER,
        fractional_part NUMERIC(10, 6),
        final_billable NUMERIC(6, 2),
        line_total INTEGER
    ) ON COMMIT DROP;

    -- Populate temp table and match measurements
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = v_order.id ORDER BY created_at ASC LOOP
        v_item_idx := v_item_idx + 1;
        v_matched := false;
        v_input_weight := NULL;

        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_service_measurements) LOOP
            IF (v_elem->>'order_item_id' IS NOT NULL AND (v_elem->>'order_item_id')::text = v_item.id::text)
               OR (v_elem->>'service_id' IS NOT NULL AND v_item.service_id IS NOT NULL AND (v_elem->>'service_id')::text = v_item.service_id::text) THEN
                v_input_weight := (v_elem->>'measured_weight')::numeric;
                v_matched := true;
                EXIT;
            END IF;
        END LOOP;

        IF NOT v_matched AND jsonb_array_length(p_service_measurements) >= v_item_idx THEN
            v_elem := p_service_measurements->(v_item_idx - 1);
            IF v_elem->>'measured_weight' IS NOT NULL THEN
                v_input_weight := (v_elem->>'measured_weight')::numeric;
                v_matched := true;
            END IF;
        END IF;

        IF NOT v_matched OR v_input_weight IS NULL THEN
            RAISE EXCEPTION 'Missing measurement for service "%" (Order #%). Every selected service must be weighed.',
                v_item.service_name, v_order.order_number;
        END IF;

        IF v_input_weight < 0.10 OR v_input_weight > 100.00 THEN
            RAISE EXCEPTION 'Measured weight % kg for service "%" is out of valid scale range (0.10 - 100.00 kg).',
                v_input_weight, v_item.service_name;
        END IF;

        INSERT INTO tmp_pickup_calc (
            id, service_id, service_name, pricing_unit, unit_price_paise, input_weight
        ) VALUES (
            v_item.id, v_item.service_id, v_item.service_name, v_item.pricing_unit, v_item.unit_price_paise, v_input_weight
        );
    END LOOP;

    -- Calculate total weight-based measurements
    SELECT COALESCE(SUM(input_weight), 0), COUNT(*)
    INTO v_weight_sum, v_weight_items_count
    FROM tmp_pickup_calc
    WHERE pricing_unit = 'per_kg';

    v_min_weight_applied := (v_weight_items_count > 0 AND v_weight_sum < v_order_min_weight AND v_order_min_weight > 0);
    v_target_billable_sum := CASE WHEN v_min_weight_applied THEN v_order_min_weight ELSE v_weight_sum END;

    -- Proportional allocation calculation for weight-based services
    IF v_min_weight_applied THEN
        IF v_weight_sum > 0 THEN
            UPDATE tmp_pickup_calc
            SET raw_billable = input_weight * (v_target_billable_sum / v_weight_sum),
                allocated_cents = FLOOR(input_weight * (v_target_billable_sum / v_weight_sum) * 100),
                fractional_part = (input_weight * (v_target_billable_sum / v_weight_sum) * 100) - FLOOR(input_weight * (v_target_billable_sum / v_weight_sum) * 100)
            WHERE pricing_unit = 'per_kg';

            -- Calculate remainder cents to guarantee exact sum = v_target_billable_sum
            SELECT (ROUND(v_target_billable_sum * 100) - COALESCE(SUM(allocated_cents), 0))::INT
            INTO v_rem_cents
            FROM tmp_pickup_calc
            WHERE pricing_unit = 'per_kg';

            IF v_rem_cents > 0 THEN
                UPDATE tmp_pickup_calc
                SET allocated_cents = allocated_cents + 1
                WHERE id IN (
                    SELECT id FROM tmp_pickup_calc
                    WHERE pricing_unit = 'per_kg'
                    ORDER BY fractional_part DESC, id ASC
                    LIMIT v_rem_cents
                );
            END IF;

            UPDATE tmp_pickup_calc
            SET final_billable = allocated_cents / 100.0
            WHERE pricing_unit = 'per_kg';
        ELSE
            -- Edge case: zero scale readings entered
            UPDATE tmp_pickup_calc
            SET final_billable = ROUND(v_target_billable_sum / v_weight_items_count, 2)
            WHERE pricing_unit = 'per_kg';
        END IF;
    ELSE
        -- No minimum uplift required: billable weight equals measured weight
        UPDATE tmp_pickup_calc
        SET final_billable = input_weight
        WHERE pricing_unit = 'per_kg';
    END IF;

    -- Non-weight-based services: billable weight equals measured units/quantity
    UPDATE tmp_pickup_calc
    SET final_billable = input_weight
    WHERE pricing_unit <> 'per_kg';

    -- Line total calculation based on pricing unit (safeupdate compliant with WHERE clause)
    UPDATE tmp_pickup_calc
    SET line_total = CASE
        WHEN pricing_unit = 'per_piece' THEN ROUND(final_billable) * unit_price_paise
        WHEN pricing_unit = 'per_load' THEN GREATEST(1, ROUND(final_billable)) * unit_price_paise
        WHEN pricing_unit = 'per_order' THEN unit_price_paise
        ELSE ROUND(final_billable * unit_price_paise)::INT
    END
    WHERE id IS NOT NULL;

    -- Update public.order_items table
    FOR v_cur_calc IN SELECT * FROM tmp_pickup_calc LOOP
        UPDATE public.order_items SET
            measured_weight = v_cur_calc.input_weight,
            billable_weight = v_cur_calc.final_billable,
            line_total_paise = v_cur_calc.line_total,
            weighed_at = timezone('utc', now()),
            weighed_by = auth.uid(),
            updated_at = timezone('utc', now())
        WHERE id = v_cur_calc.id;
    END LOOP;

    -- Compute order aggregate totals
    SELECT
        COALESCE(SUM(CASE WHEN pricing_unit = 'per_kg' THEN input_weight ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pricing_unit = 'per_kg' THEN final_billable ELSE 0 END), 0),
        COALESCE(SUM(line_total), 0)
    INTO v_total_measured, v_total_billable, v_total_subtotal
    FROM tmp_pickup_calc;

    -- 5. Option A Coupon Evaluation against cumulative subtotal
    v_clean_coupon := NULLIF(UPPER(TRIM(COALESCE(v_order.coupon_code, ''))), '');
    IF v_clean_coupon IS NOT NULL THEN
        SELECT cr.id AS res_id, cr.status AS res_status, c.*
        INTO v_res
        FROM public.coupons c
        LEFT JOIN public.coupon_reservations cr ON cr.coupon_id = c.id AND cr.order_id = v_order.id
        WHERE UPPER(TRIM(c.code)) = v_clean_coupon
        LIMIT 1;

        IF v_res.id IS NOT NULL THEN
            IF v_res.min_order_paise > 0 AND v_total_subtotal < v_res.min_order_paise THEN
                v_discount_paise := 0;
                IF v_res.res_id IS NOT NULL THEN
                    UPDATE public.coupon_reservations
                    SET status = 'unqualified', updated_at = timezone('utc', now())
                    WHERE id = v_res.res_id;
                ELSE
                    INSERT INTO public.coupon_reservations (
                        coupon_id, user_id, order_id, status, created_at, updated_at
                    ) VALUES (
                        v_res.id, v_order.customer_id, v_order.id, 'unqualified', timezone('utc', now()), timezone('utc', now())
                    ) ON CONFLICT (order_id, coupon_id) DO UPDATE SET status = 'unqualified', updated_at = timezone('utc', now());
                END IF;
            ELSE
                IF v_res.discount_type = 'percentage' THEN
                    v_discount_paise := ROUND((v_total_subtotal * v_res.discount_value)::NUMERIC / 100.0);
                    IF v_res.max_discount_paise IS NOT NULL AND v_discount_paise > v_res.max_discount_paise THEN
                        v_discount_paise := v_res.max_discount_paise;
                    END IF;
                ELSE
                    v_discount_paise := v_res.discount_value;
                END IF;

                IF v_discount_paise > v_total_subtotal THEN
                    v_discount_paise := v_total_subtotal;
                END IF;

                INSERT INTO public.coupon_redemptions (
                    coupon_id, order_id, user_id, discount_paise, subtotal_paise, final_paise, redeemed_at
                ) VALUES (
                    v_res.id, v_order.id, v_order.customer_id, v_discount_paise, v_total_subtotal,
                    GREATEST(0, v_total_subtotal - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0)),
                    timezone('utc', now())
                ) ON CONFLICT (order_id) DO UPDATE SET
                    discount_paise = EXCLUDED.discount_paise,
                    subtotal_paise = EXCLUDED.subtotal_paise,
                    final_paise = EXCLUDED.final_paise,
                    redeemed_at = timezone('utc', now());

                IF v_res.res_id IS NOT NULL THEN
                    UPDATE public.coupon_reservations
                    SET status = 'applied', updated_at = timezone('utc', now())
                    WHERE id = v_res.res_id;
                ELSE
                    INSERT INTO public.coupon_reservations (
                        coupon_id, user_id, order_id, status, created_at, updated_at
                    ) VALUES (
                        v_res.id, v_order.customer_id, v_order.id, 'applied', timezone('utc', now()), timezone('utc', now())
                    ) ON CONFLICT (order_id, coupon_id) DO UPDATE SET status = 'applied', updated_at = timezone('utc', now());
                END IF;

                UPDATE public.coupons
                SET total_redemptions = total_redemptions + 1, updated_at = timezone('utc', now())
                WHERE id = v_res.id;
            END IF;
        END IF;
    END IF;

    v_total_amount_paise := GREATEST(0, v_total_subtotal - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0));

    -- 6. Downward Paid-Amount Guard
    IF v_order.paid_amount_paise > 0 AND v_total_amount_paise < v_order.paid_amount_paise THEN
        RAISE EXCEPTION 'Downward re-weighing rejected: Recalculated total (₹%) is less than already paid amount (₹%). Modifications below paid amount require formal refund processing.',
            (v_total_amount_paise / 100.0)::numeric(10, 2),
            (v_order.paid_amount_paise / 100.0)::numeric(10, 2);
    END IF;

    -- 7. Update public.orders parent record
    UPDATE public.orders SET
        order_status = 'collected',
        pickup_measured_weight = v_total_measured,
        measured_weight = v_total_measured,
        billable_weight = v_total_billable,
        discount_paise = v_discount_paise,
        total_amount_paise = v_total_amount_paise,
        pickup_weighed_at = timezone('utc', now()),
        pickup_weighed_by = auth.uid(),
        collected_at = timezone('utc', now()),
        delivery_notes = COALESCE(p_delivery_notes, v_order.delivery_notes),
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'measured_weight', v_total_measured,
        'billable_weight', v_total_billable,
        'subtotal_paise', v_total_subtotal,
        'discount_paise', v_discount_paise,
        'total_amount_paise', v_total_amount_paise,
        'order_status', 'collected',
        'items', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', oi.id,
                    'service_id', oi.service_id,
                    'service_name', oi.service_name,
                    'pricing_unit', oi.pricing_unit,
                    'unit_price_paise', oi.unit_price_paise,
                    'min_weight_kg', oi.min_weight_kg,
                    'measured_weight', oi.measured_weight,
                    'billable_weight', oi.billable_weight,
                    'line_total_paise', oi.line_total_paise
                )
            )
            FROM public.order_items oi
            WHERE oi.order_id = v_order.id
        )
    );
END;
$$;
-- 2. STORED PROCEDURE: record_store_intake_weight (Store Intake & Correction)
CREATE OR REPLACE FUNCTION public.record_store_intake_weight(
    p_order_id UUID,
    p_service_measurements JSONB,
    p_correction_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders;
    v_caller_role VARCHAR;
    v_item public.order_items;
    v_item_idx INTEGER := 0;
    v_elem JSONB;
    v_input_weight NUMERIC(6, 2);
    v_order_min_weight NUMERIC(6, 2);
    v_weight_sum NUMERIC(6, 2) := 0;
    v_weight_items_count INTEGER := 0;
    v_min_weight_applied BOOLEAN := false;
    v_target_billable_sum NUMERIC(6, 2) := 0;
    v_rem_cents INTEGER := 0;
    v_total_measured NUMERIC(6, 2) := 0;
    v_total_billable NUMERIC(6, 2) := 0;
    v_total_subtotal INTEGER := 0;
    v_discount_paise INTEGER := 0;
    v_total_amount_paise INTEGER;
    v_res RECORD;
    v_clean_coupon TEXT;
    v_items_count INTEGER := 0;
    v_matched BOOLEAN;
    v_cur_calc RECORD;
    v_new_status VARCHAR;
BEGIN
    -- 1. Authorization: Managers and Owners only
    v_caller_role := public.current_user_role();
    IF auth.role() <> 'service_role' AND (v_caller_role IS NULL OR v_caller_role NOT IN ('manager', 'owner')) THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers and owners can record store intake or adjust service weights.';
    END IF;

    -- 2. Lock Order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF v_order.order_status IN ('delivered', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot adjust weights for order #% in finalized status "%".', v_order.order_number, v_order.order_status;
    END IF;

    IF p_service_measurements IS NULL OR jsonb_typeof(p_service_measurements) <> 'array' OR jsonb_array_length(p_service_measurements) = 0 THEN
        RAISE EXCEPTION 'Missing service measurements: At least one measured scale reading is required.';
    END IF;

    -- 3. Ensure order items exist
    SELECT COUNT(*) INTO v_items_count FROM public.order_items WHERE order_id = v_order.id;
    IF v_items_count = 0 THEN
        INSERT INTO public.order_items (
            order_id,
            service_id,
            service_name,
            pricing_unit,
            unit_price_paise,
            min_weight_kg,
            created_at,
            updated_at
        ) VALUES (
            v_order.id,
            v_order.service_id,
            COALESCE(v_order.service_name, 'Wash & Fold Laundry'),
            COALESCE(v_order.pricing_unit, 'per_kg'),
            COALESCE(v_order.price_per_kg_paise, 7900),
            COALESCE(v_order.min_weight_kg, 1.00),
            timezone('utc', now()),
            timezone('utc', now())
        );
    END IF;

    v_order_min_weight := COALESCE(v_order.min_weight_kg, 1.00);

    -- 4. Temporary table for calculations
    CREATE TEMP TABLE tmp_intake_calc (
        id UUID,
        service_id UUID,
        service_name TEXT,
        pricing_unit TEXT,
        unit_price_paise INTEGER,
        input_weight NUMERIC(6, 2),
        raw_billable NUMERIC(10, 6),
        allocated_cents INTEGER,
        fractional_part NUMERIC(10, 6),
        final_billable NUMERIC(6, 2),
        line_total INTEGER
    ) ON COMMIT DROP;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = v_order.id ORDER BY created_at ASC LOOP
        v_item_idx := v_item_idx + 1;
        v_matched := false;
        v_input_weight := NULL;

        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_service_measurements) LOOP
            IF (v_elem->>'order_item_id' IS NOT NULL AND (v_elem->>'order_item_id')::text = v_item.id::text)
               OR (v_elem->>'service_id' IS NOT NULL AND v_item.service_id IS NOT NULL AND (v_elem->>'service_id')::text = v_item.service_id::text) THEN
                v_input_weight := (v_elem->>'measured_weight')::numeric;
                v_matched := true;
                EXIT;
            END IF;
        END LOOP;

        IF NOT v_matched AND jsonb_array_length(p_service_measurements) >= v_item_idx THEN
            v_elem := p_service_measurements->(v_item_idx - 1);
            IF v_elem->>'measured_weight' IS NOT NULL THEN
                v_input_weight := (v_elem->>'measured_weight')::numeric;
                v_matched := true;
            END IF;
        END IF;

        IF NOT v_matched OR v_input_weight IS NULL THEN
            RAISE EXCEPTION 'Missing measurement for service "%" (Order #%).', v_item.service_name, v_order.order_number;
        END IF;

        IF v_input_weight < 0.10 OR v_input_weight > 100.00 THEN
            RAISE EXCEPTION 'Measured weight % kg for service "%" is out of valid scale range (0.10 - 100.00 kg).',
                v_input_weight, v_item.service_name;
        END IF;

        INSERT INTO tmp_intake_calc (
            id, service_id, service_name, pricing_unit, unit_price_paise, input_weight
        ) VALUES (
            v_item.id, v_item.service_id, v_item.service_name, v_item.pricing_unit, v_item.unit_price_paise, v_input_weight
        );
    END LOOP;

    SELECT COALESCE(SUM(input_weight), 0), COUNT(*)
    INTO v_weight_sum, v_weight_items_count
    FROM tmp_intake_calc
    WHERE pricing_unit = 'per_kg';

    v_min_weight_applied := (v_weight_items_count > 0 AND v_weight_sum < v_order_min_weight AND v_order_min_weight > 0);
    v_target_billable_sum := CASE WHEN v_min_weight_applied THEN v_order_min_weight ELSE v_weight_sum END;

    IF v_min_weight_applied THEN
        IF v_weight_sum > 0 THEN
            UPDATE tmp_intake_calc
            SET raw_billable = input_weight * (v_target_billable_sum / v_weight_sum),
                allocated_cents = FLOOR(input_weight * (v_target_billable_sum / v_weight_sum) * 100),
                fractional_part = (input_weight * (v_target_billable_sum / v_weight_sum) * 100) - FLOOR(input_weight * (v_target_billable_sum / v_weight_sum) * 100)
            WHERE pricing_unit = 'per_kg';

            SELECT (ROUND(v_target_billable_sum * 100) - COALESCE(SUM(allocated_cents), 0))::INT
            INTO v_rem_cents
            FROM tmp_intake_calc
            WHERE pricing_unit = 'per_kg';

            IF v_rem_cents > 0 THEN
                UPDATE tmp_intake_calc
                SET allocated_cents = allocated_cents + 1
                WHERE id IN (
                    SELECT id FROM tmp_intake_calc
                    WHERE pricing_unit = 'per_kg'
                    ORDER BY fractional_part DESC, id ASC
                    LIMIT v_rem_cents
                );
            END IF;

            UPDATE tmp_intake_calc
            SET final_billable = allocated_cents / 100.0
            WHERE pricing_unit = 'per_kg';
        ELSE
            UPDATE tmp_intake_calc
            SET final_billable = ROUND(v_target_billable_sum / v_weight_items_count, 2)
            WHERE pricing_unit = 'per_kg';
        END IF;
    ELSE
        UPDATE tmp_intake_calc
        SET final_billable = input_weight
        WHERE pricing_unit = 'per_kg';
    END IF;

    UPDATE tmp_intake_calc
    SET final_billable = input_weight
    WHERE pricing_unit <> 'per_kg';

    -- Line total calculation (safeupdate compliant with WHERE clause)
    UPDATE tmp_intake_calc
    SET line_total = CASE
        WHEN pricing_unit = 'per_piece' THEN ROUND(final_billable) * unit_price_paise
        WHEN pricing_unit = 'per_load' THEN GREATEST(1, ROUND(final_billable)) * unit_price_paise
        WHEN pricing_unit = 'per_order' THEN unit_price_paise
        ELSE ROUND(final_billable * unit_price_paise)::INT
    END
    WHERE id IS NOT NULL;

    -- Record audit history for any modified item weights
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = v_order.id LOOP
        SELECT * INTO v_cur_calc FROM tmp_intake_calc WHERE id = v_item.id;
        IF v_cur_calc.id IS NOT NULL AND v_item.measured_weight IS NOT NULL AND v_item.measured_weight IS DISTINCT FROM v_cur_calc.input_weight THEN
            INSERT INTO public.weight_change_history (
                order_id,
                order_item_id,
                service_name,
                old_weight,
                new_weight,
                old_amount_paise,
                new_amount_paise,
                reason,
                changed_by,
                created_at
            ) VALUES (
                v_order.id,
                v_item.id,
                v_item.service_name,
                v_item.measured_weight,
                v_cur_calc.input_weight,
                v_item.line_total_paise,
                v_cur_calc.line_total,
                COALESCE(p_correction_reason, 'Store intake scale weigh-in correction'),
                auth.uid(),
                timezone('utc', now())
            );
        END IF;

        UPDATE public.order_items SET
            measured_weight = v_cur_calc.input_weight,
            billable_weight = v_cur_calc.final_billable,
            line_total_paise = v_cur_calc.line_total,
            weighed_at = timezone('utc', now()),
            weighed_by = auth.uid(),
            updated_at = timezone('utc', now())
        WHERE id = v_cur_calc.id;
    END LOOP;

    -- Compute order aggregates
    SELECT
        COALESCE(SUM(CASE WHEN pricing_unit = 'per_kg' THEN input_weight ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pricing_unit = 'per_kg' THEN final_billable ELSE 0 END), 0),
        COALESCE(SUM(line_total), 0)
    INTO v_total_measured, v_total_billable, v_total_subtotal
    FROM tmp_intake_calc;

    -- 5. Option A Coupon Evaluation
    v_clean_coupon := NULLIF(UPPER(TRIM(COALESCE(v_order.coupon_code, ''))), '');
    IF v_clean_coupon IS NOT NULL THEN
        SELECT cr.id AS res_id, cr.status AS res_status, c.*
        INTO v_res
        FROM public.coupons c
        LEFT JOIN public.coupon_reservations cr ON cr.coupon_id = c.id AND cr.order_id = v_order.id
        WHERE UPPER(TRIM(c.code)) = v_clean_coupon
        LIMIT 1;

        IF v_res.id IS NOT NULL THEN
            IF v_res.min_order_paise > 0 AND v_total_subtotal < v_res.min_order_paise THEN
                v_discount_paise := 0;
                IF v_res.res_id IS NOT NULL THEN
                    UPDATE public.coupon_reservations
                    SET status = 'unqualified', updated_at = timezone('utc', now())
                    WHERE id = v_res.res_id;
                ELSE
                    INSERT INTO public.coupon_reservations (
                        coupon_id, user_id, order_id, status, created_at, updated_at
                    ) VALUES (
                        v_res.id, v_order.customer_id, v_order.id, 'unqualified', timezone('utc', now()), timezone('utc', now())
                    ) ON CONFLICT (order_id, coupon_id) DO UPDATE SET status = 'unqualified', updated_at = timezone('utc', now());
                END IF;
            ELSE
                IF v_res.discount_type = 'percentage' THEN
                    v_discount_paise := ROUND((v_total_subtotal * v_res.discount_value)::NUMERIC / 100.0);
                    IF v_res.max_discount_paise IS NOT NULL AND v_discount_paise > v_res.max_discount_paise THEN
                        v_discount_paise := v_res.max_discount_paise;
                    END IF;
                ELSE
                    v_discount_paise := v_res.discount_value;
                END IF;

                IF v_discount_paise > v_total_subtotal THEN
                    v_discount_paise := v_total_subtotal;
                END IF;

                INSERT INTO public.coupon_redemptions (
                    coupon_id, order_id, user_id, discount_paise, subtotal_paise, final_paise, redeemed_at
                ) VALUES (
                    v_res.id, v_order.id, v_order.customer_id, v_discount_paise, v_total_subtotal,
                    GREATEST(0, v_total_subtotal - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0)),
                    timezone('utc', now())
                ) ON CONFLICT (order_id) DO UPDATE SET
                    discount_paise = EXCLUDED.discount_paise,
                    subtotal_paise = EXCLUDED.subtotal_paise,
                    final_paise = EXCLUDED.final_paise,
                    redeemed_at = timezone('utc', now());

                IF v_res.res_id IS NOT NULL THEN
                    UPDATE public.coupon_reservations
                    SET status = 'applied', updated_at = timezone('utc', now())
                    WHERE id = v_res.res_id;
                ELSE
                    INSERT INTO public.coupon_reservations (
                        coupon_id, user_id, order_id, status, created_at, updated_at
                    ) VALUES (
                        v_res.id, v_order.customer_id, v_order.id, 'applied', timezone('utc', now()), timezone('utc', now())
                    ) ON CONFLICT (order_id, coupon_id) DO UPDATE SET status = 'applied', updated_at = timezone('utc', now());
                END IF;

                UPDATE public.coupons
                SET total_redemptions = total_redemptions + 1, updated_at = timezone('utc', now())
                WHERE id = v_res.id;
            END IF;
        END IF;
    END IF;

    v_total_amount_paise := GREATEST(0, v_total_subtotal - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0));

    -- 6. Downward Paid-Amount Guard
    IF v_order.paid_amount_paise > 0 AND v_total_amount_paise < v_order.paid_amount_paise THEN
        RAISE EXCEPTION 'Downward re-weighing rejected: Recalculated total (₹%) is less than already paid amount (₹%). Modifications below paid amount require formal refund processing.',
            (v_total_amount_paise / 100.0)::numeric(10, 2),
            (v_order.paid_amount_paise / 100.0)::numeric(10, 2);
    END IF;

    -- Determine new status: advance to 'weighed' if in earlier states
    IF v_order.order_status IN ('collected', 'pickup_assigned', 'booked') THEN
        v_new_status := 'weighed';
    ELSE
        v_new_status := v_order.order_status;
    END IF;

    -- 7. Update parent order
    UPDATE public.orders SET
        order_status = v_new_status,
        measured_weight = v_total_measured,
        billable_weight = v_total_billable,
        discount_paise = v_discount_paise,
        total_amount_paise = v_total_amount_paise,
        weighed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'measured_weight', v_total_measured,
        'billable_weight', v_total_billable,
        'subtotal_paise', v_total_subtotal,
        'discount_paise', v_discount_paise,
        'total_amount_paise', v_total_amount_paise,
        'order_status', v_new_status,
        'items', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', oi.id,
                    'service_id', oi.service_id,
                    'service_name', oi.service_name,
                    'pricing_unit', oi.pricing_unit,
                    'unit_price_paise', oi.unit_price_paise,
                    'min_weight_kg', oi.min_weight_kg,
                    'measured_weight', oi.measured_weight,
                    'billable_weight', oi.billable_weight,
                    'line_total_paise', oi.line_total_paise
                )
            )
            FROM public.order_items oi
            WHERE oi.order_id = v_order.id
        )
    );
END;
$$;
-- 3. STORED PROCEDURE: activate_pricing_version (safeupdate compliance)
CREATE OR REPLACE FUNCTION public.activate_pricing_version(
    p_version_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_caller_id UUID;
    v_target RECORD;
    v_primary_item RECORD;
BEGIN
    v_caller_id := auth.uid();
    v_role := public.current_user_role();

    -- Authorization: Only owner or manager or service_role
    IF auth.role() <> 'service_role' AND (v_role IS NULL OR v_role NOT IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Unauthorized: Only owners or managers can activate pricing versions.';
    END IF;

    -- Validate target version
    SELECT * INTO v_target
    FROM public.pricing_versions
    WHERE id = p_version_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pricing version % not found.', p_version_id;
    END IF;

    IF v_target.status = 'active' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Pricing version is already active.',
            'version_id', p_version_id,
            'version_number', v_target.version_number
        );
    END IF;

    -- Archive currently active versions
    UPDATE public.pricing_versions
    SET status = 'archived',
        effective_to = timezone('utc', now())
    WHERE status = 'active' AND id <> p_version_id;

    -- Activate target version
    UPDATE public.pricing_versions
    SET status = 'active',
        effective_from = timezone('utc', now()),
        effective_to = NULL
    WHERE id = p_version_id;

    -- Sync business_settings with primary item from newly activated version if available
    SELECT pvi.price_paise, pvi.min_weight_grams
    INTO v_primary_item
    FROM public.pricing_version_items pvi
    WHERE pvi.pricing_version_id = p_version_id
    ORDER BY pvi.created_at ASC
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.business_settings
        SET price_per_kg_paise = v_primary_item.price_paise,
            min_weight_restriction_grams = v_primary_item.min_weight_grams,
            min_weight_kg = ROUND(v_primary_item.min_weight_grams::numeric / 1000.0, 2),
            updated_at = timezone('utc', now())
        WHERE id IS NOT NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Pricing version %s activated successfully.', v_target.version_number),
        'version_id', p_version_id,
        'version_number', v_target.version_number
    );
END;
$$;
