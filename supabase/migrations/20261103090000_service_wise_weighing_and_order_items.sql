-- ==============================================================================
-- Migration: 20261103090000_service_wise_weighing_and_order_items.sql
-- Description: Service-wise Doorstep & Store Intake Weighing, Order Items & Multi-Service Billing
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE: public.order_items
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
    service_name VARCHAR(120) NOT NULL,
    pricing_unit VARCHAR(50) NOT NULL DEFAULT 'per_kg',
    unit_price_paise INTEGER NOT NULL,
    min_weight_kg NUMERIC(5, 2) NOT NULL DEFAULT 1.00,
    measured_weight NUMERIC(5, 2),
    billable_weight NUMERIC(5, 2),
    line_total_paise INTEGER,
    weighed_at TIMESTAMPTZ,
    weighed_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT check_order_items_measured_weight CHECK (
        measured_weight IS NULL OR (measured_weight >= 0.10 AND measured_weight <= 250.00)
    ),
    CONSTRAINT check_order_items_billable_weight CHECK (
        billable_weight IS NULL OR billable_weight >= 0.10
    ),
    CONSTRAINT check_order_items_unit_price CHECK (unit_price_paise >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_service_id ON public.order_items(service_id);

-- ------------------------------------------------------------------------------
-- 2. AUDIT ENHANCEMENT: weight_change_history
-- ------------------------------------------------------------------------------

ALTER TABLE public.weight_change_history
    ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS service_name TEXT;

-- ------------------------------------------------------------------------------
-- 3. RLS SECURITY POLICIES: order_items
-- ------------------------------------------------------------------------------

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_customer_select" ON public.order_items;
CREATE POLICY "order_items_customer_select" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (o.customer_id = auth.uid() OR public.current_user_role() IN ('owner', 'manager', 'delivery'))
        )
    );

DROP POLICY IF EXISTS "order_items_anon_select" ON public.order_items;
CREATE POLICY "order_items_anon_select" ON public.order_items
    FOR SELECT TO anon
    USING (false);

DROP POLICY IF EXISTS "order_items_staff_all" ON public.order_items;
CREATE POLICY "order_items_staff_all" ON public.order_items
    FOR ALL TO authenticated
    USING (public.current_user_role() IN ('owner', 'manager'))
    WITH CHECK (public.current_user_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "order_items_service_role" ON public.order_items;
CREATE POLICY "order_items_service_role" ON public.order_items
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO authenticated, service_role;
GRANT SELECT ON TABLE public.order_items TO anon;

-- ------------------------------------------------------------------------------
-- 4. STORED PROCEDURE: record_courier_pickup_collection (Service-Wise Weighing)
-- ------------------------------------------------------------------------------

-- Enhanced service-wise function accepting JSONB array of measurements
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
    v_input_weight NUMERIC(5, 2);
    v_item_billable NUMERIC(5, 2);
    v_item_total INTEGER;
    v_total_measured NUMERIC(5, 2) := 0;
    v_total_billable NUMERIC(5, 2) := 0;
    v_total_subtotal INTEGER := 0;
    v_discount_paise INTEGER := 0;
    v_total_amount_paise INTEGER;
    v_res RECORD;
    v_clean_coupon TEXT;
    v_items_count INTEGER := 0;
    v_matched BOOLEAN;
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

    -- 3. Ensure order has items; if legacy single-service order has no rows in order_items, seed from order
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

    -- 4. Process each item in order_items atomically
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = v_order.id ORDER BY created_at ASC LOOP
        v_item_idx := v_item_idx + 1;
        v_matched := false;
        v_input_weight := NULL;

        -- Search matching entry in p_service_measurements: by item_id, service_id, or positional index
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_service_measurements) LOOP
            IF (v_elem->>'order_item_id' IS NOT NULL AND (v_elem->>'order_item_id')::text = v_item.id::text)
               OR (v_elem->>'service_id' IS NOT NULL AND v_item.service_id IS NOT NULL AND (v_elem->>'service_id')::text = v_item.service_id::text) THEN
                v_input_weight := (v_elem->>'measured_weight')::numeric;
                v_matched := true;
                EXIT;
            END IF;
        END LOOP;

        -- Positional fallback if single item or unkeyed array
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

        IF v_input_weight < 0.10 OR v_input_weight > 250.00 THEN
            RAISE EXCEPTION 'Measured weight % kg for service "%" is out of valid scale range (0.10 - 250.00 kg).',
                v_input_weight, v_item.service_name;
        END IF;

        -- Billable weight calculation (using service min_weight_kg)
        v_item_billable := GREATEST(v_input_weight, COALESCE(v_item.min_weight_kg, 1.00));

        -- Subtotal calculation based on pricing unit
        IF v_item.pricing_unit = 'per_piece' THEN
            v_item_total := ROUND(v_item_billable) * v_item.unit_price_paise;
        ELSIF v_item.pricing_unit = 'per_load' THEN
            v_item_total := GREATEST(1, ROUND(v_item_billable)) * v_item.unit_price_paise;
        ELSIF v_item.pricing_unit = 'per_order' THEN
            v_item_total := v_item.unit_price_paise;
        ELSE
            v_item_total := ROUND(v_item_billable * v_item.unit_price_paise);
        END IF;

        -- Update order_items row atomically
        UPDATE public.order_items SET
            measured_weight = v_input_weight,
            billable_weight = v_item_billable,
            line_total_paise = v_item_total,
            weighed_at = timezone('utc', now()),
            weighed_by = auth.uid(),
            updated_at = timezone('utc', now())
        WHERE id = v_item.id;

        v_total_measured := v_total_measured + v_input_weight;
        v_total_billable := v_total_billable + v_item_billable;
        v_total_subtotal := v_total_subtotal + v_item_total;
    END LOOP;

    -- 5. Option A Coupon Evaluation against actual cumulative subtotal
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
                -- Does not qualify under Option A
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
                -- Qualifies!
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

                -- Record coupon redemption
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

-- Legacy Overload (Single weight backwards compatibility)
CREATE OR REPLACE FUNCTION public.record_courier_pickup_collection(
    p_order_id UUID,
    p_measured_weight NUMERIC(5, 2),
    p_delivery_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.record_courier_pickup_collection(
        p_order_id,
        jsonb_build_array(jsonb_build_object('measured_weight', p_measured_weight)),
        p_delivery_notes
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_courier_pickup_collection(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_courier_pickup_collection(UUID, JSONB, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_courier_pickup_collection(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_courier_pickup_collection(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. STORED PROCEDURE: record_store_intake_weight (Store Intake & Correction)
-- ------------------------------------------------------------------------------

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
    v_input_weight NUMERIC(5, 2);
    v_item_billable NUMERIC(5, 2);
    v_item_total INTEGER;
    v_total_measured NUMERIC(5, 2) := 0;
    v_total_billable NUMERIC(5, 2) := 0;
    v_total_subtotal INTEGER := 0;
    v_discount_paise INTEGER := 0;
    v_total_amount_paise INTEGER;
    v_res RECORD;
    v_clean_coupon TEXT;
    v_items_count INTEGER := 0;
    v_matched BOOLEAN;
    v_new_status VARCHAR;
BEGIN
    -- 1. Authorization
    v_caller_role := public.current_user_role();
    IF auth.role() <> 'service_role' AND (v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers and owners can record store intake weighing or corrections.';
    END IF;

    -- 2. Lock Order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF v_order.order_status IN ('delivered', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot record store intake weight for order #% in status "%".', v_order.order_number, v_order.order_status;
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

    -- 4. Process each item
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

        IF v_input_weight < 0.10 OR v_input_weight > 250.00 THEN
            RAISE EXCEPTION 'Measured weight % kg for service "%" is out of valid scale range (0.10 - 250.00 kg).',
                v_input_weight, v_item.service_name;
        END IF;

        v_item_billable := GREATEST(v_input_weight, COALESCE(v_item.min_weight_kg, 1.00));

        IF v_item.pricing_unit = 'per_piece' THEN
            v_item_total := ROUND(v_item_billable) * v_item.unit_price_paise;
        ELSIF v_item.pricing_unit = 'per_load' THEN
            v_item_total := GREATEST(1, ROUND(v_item_billable)) * v_item.unit_price_paise;
        ELSIF v_item.pricing_unit = 'per_order' THEN
            v_item_total := v_item.unit_price_paise;
        ELSE
            v_item_total := ROUND(v_item_billable * v_item.unit_price_paise);
        END IF;

        -- Record audit if measurement modified after prior entry
        IF v_item.measured_weight IS NOT NULL AND v_item.measured_weight IS DISTINCT FROM v_input_weight THEN
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
                v_input_weight,
                v_item.line_total_paise,
                v_item_total,
                COALESCE(p_correction_reason, 'Store intake scale weigh-in correction'),
                auth.uid(),
                timezone('utc', now())
            );
        END IF;

        UPDATE public.order_items SET
            measured_weight = v_input_weight,
            billable_weight = v_item_billable,
            line_total_paise = v_item_total,
            weighed_at = timezone('utc', now()),
            weighed_by = auth.uid(),
            updated_at = timezone('utc', now())
        WHERE id = v_item.id;

        v_total_measured := v_total_measured + v_input_weight;
        v_total_billable := v_total_billable + v_item_billable;
        v_total_subtotal := v_total_subtotal + v_item_total;
    END LOOP;

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

-- Legacy Overload (Single weight backwards compatibility)
CREATE OR REPLACE FUNCTION public.record_store_intake_weight(
    p_order_id UUID,
    p_measured_weight NUMERIC(5, 2),
    p_correction_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.record_store_intake_weight(
        p_order_id,
        jsonb_build_array(jsonb_build_object('measured_weight', p_measured_weight)),
        p_correction_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_store_intake_weight(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_store_intake_weight(UUID, JSONB, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_store_intake_weight(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_store_intake_weight(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. STORED PROCEDURE: create_booking_idempotent (Multi-Service Support)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_booking_idempotent(
    p_client_submission_id TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_pickup_address TEXT,
    p_pickup_landmark TEXT,
    p_pickup_pincode TEXT,
    p_pickup_date DATE,
    p_pickup_slot TEXT,
    p_service_id UUID,
    p_pickup_latitude NUMERIC,
    p_pickup_longitude NUMERIC,
    p_notes TEXT,
    p_coupon_code TEXT,
    p_discount_paise INTEGER,
    p_service_ids UUID[] DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
    v_caller_id UUID;
    v_existing_order public.orders;
    v_new_order public.orders;
    v_service public.services;
    v_curr_service public.services;
    v_service_id UUID;
    v_service_name TEXT := '';
    v_pricing_unit TEXT;
    v_unit_price_paise INTEGER;
    v_min_weight_kg NUMERIC(4, 2);
    v_delivery_charge_paise INTEGER := 0;
    v_settings public.business_settings;
    v_clean_phone TEXT;
    v_slot public.pickup_slots;
    v_slot_capacity INTEGER;
    v_current_slot_bookings INTEGER := 0;
    v_payload_fingerprint TEXT;
    v_coupon public.coupons;
    v_clean_coupon_code TEXT := NULL;
    v_authoritative_discount_paise INTEGER := 0;
    v_estimated_subtotal INTEGER := 0;
    v_prior_coupon_redemptions INTEGER := 0;
    v_prior_delivered_orders INTEGER := 0;
    v_active_reservations INTEGER := 0;
    v_active_pricing_version_id UUID := NULL;
    v_reservation_expiry TIMESTAMPTZ;
    v_sid UUID;
    v_sid_idx INTEGER := 0;
BEGIN
    -- 1. Caller Authentication Validation
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: You must be signed in to create a pickup booking.';
    END IF;

    -- 2. Submission Identity Validation
    IF p_client_submission_id IS NULL OR TRIM(p_client_submission_id) = '' THEN
        RAISE EXCEPTION 'Invalid request: client_submission_id is required for idempotent booking submission.';
    END IF;

    IF LENGTH(p_client_submission_id) > 128 THEN
        RAISE EXCEPTION 'Invalid request: client_submission_id exceeds maximum permitted length.';
    END IF;

    -- 3. Sanitize and Validate Inputs
    v_clean_phone := REGEXP_REPLACE(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
    IF LENGTH(v_clean_phone) < 10 THEN
        RAISE EXCEPTION 'Please provide a valid 10-digit Indian mobile number.';
    END IF;

    IF p_pickup_address IS NULL OR TRIM(p_pickup_address) = '' THEN
        RAISE EXCEPTION 'Pickup address is required.';
    END IF;

    IF p_pickup_pincode IS NULL OR TRIM(p_pickup_pincode) = '' THEN
        RAISE EXCEPTION 'Pickup PIN code is required.';
    END IF;

    IF TRIM(p_pickup_pincode) !~ '^[1-9][0-9]{5}$' THEN
        RAISE EXCEPTION 'Please provide a valid 6-digit Indian PIN code.';
    END IF;

    IF p_pickup_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Pickup date cannot be in the past.';
    END IF;

    IF p_pickup_slot IS NULL OR TRIM(p_pickup_slot) = '' THEN
        RAISE EXCEPTION 'Pickup time slot is required.';
    END IF;

    -- 4. Business Settings & Service Resolution (Server-Authoritative Pricing)
    SELECT * INTO v_settings FROM public.business_settings LIMIT 1;
    IF FOUND THEN
        v_delivery_charge_paise := COALESCE(v_settings.delivery_charge_paise, 0);
    END IF;

    -- Resolve primary service and composite name
    IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
        v_service_id := p_service_ids[1];
        SELECT * INTO v_service FROM public.services WHERE id = v_service_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected service was not found in the active catalog.';
        END IF;
        IF NOT v_service.is_active THEN
            RAISE EXCEPTION 'The selected service is currently deactivated and not accepting new bookings.';
        END IF;

        v_pricing_unit := v_service.pricing_unit;
        v_unit_price_paise := COALESCE(v_service.unit_price_paise, 7900);
        v_min_weight_kg := COALESCE(v_service.min_weight_kg, 1.00);

        -- Build composite service name from all selected services
        FOREACH v_sid IN ARRAY p_service_ids LOOP
            SELECT * INTO v_curr_service FROM public.services WHERE id = v_sid;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Service % not found in catalog.', v_sid;
            END IF;
            IF NOT v_curr_service.is_active THEN
                RAISE EXCEPTION 'Service % is deactivated.', v_curr_service.name;
            END IF;
            IF v_service_name = '' THEN
                v_service_name := v_curr_service.name;
            ELSE
                v_service_name := v_service_name || ' + ' || v_curr_service.name;
            END IF;
        END LOOP;
    ELSIF p_service_id IS NOT NULL THEN
        SELECT * INTO v_service FROM public.services WHERE id = p_service_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected service was not found in the active catalog.';
        END IF;
        IF NOT v_service.is_active THEN
            RAISE EXCEPTION 'The selected service is currently deactivated and not accepting new bookings.';
        END IF;

        v_service_id := v_service.id;
        v_service_name := v_service.name;
        v_pricing_unit := v_service.pricing_unit;
        v_unit_price_paise := COALESCE(v_service.unit_price_paise, 7900);
        v_min_weight_kg := COALESCE(v_service.min_weight_kg, 1.00);
    ELSE
        SELECT * INTO v_service FROM public.services WHERE is_active = true ORDER BY display_order ASC, created_at ASC LIMIT 1;
        IF FOUND THEN
            v_service_id := v_service.id;
            v_service_name := v_service.name;
            v_pricing_unit := v_service.pricing_unit;
            v_unit_price_paise := COALESCE(v_service.unit_price_paise, 7900);
            v_min_weight_kg := COALESCE(v_service.min_weight_kg, 1.00);
        ELSE
            v_service_id := NULL;
            v_service_name := 'Wash & Fold (Normal)';
            v_pricing_unit := 'per_kg';
            v_unit_price_paise := COALESCE(v_settings.price_per_kg_paise, 7900);
            v_min_weight_kg := COALESCE(v_settings.min_weight_kg, 1.00);
        END IF;
    END IF;

    -- Resolve active pricing version snapshot
    SELECT id INTO v_active_pricing_version_id
    FROM public.pricing_versions
    WHERE status = 'active'
    ORDER BY version_number DESC
    LIMIT 1;

    -- Compute deterministic server-side payload fingerprint
    v_clean_coupon_code := NULLIF(UPPER(TRIM(COALESCE(p_coupon_code, ''))), '');
    v_payload_fingerprint := md5(
        v_clean_phone || '|' ||
        LOWER(TRIM(COALESCE(p_customer_name, ''))) || '|' ||
        LOWER(TRIM(COALESCE(p_pickup_address, ''))) || '|' ||
        LOWER(TRIM(COALESCE(p_pickup_landmark, ''))) || '|' ||
        TRIM(COALESCE(p_pickup_pincode, '')) || '|' ||
        p_pickup_date::text || '|' ||
        LOWER(TRIM(COALESCE(p_pickup_slot, ''))) || '|' ||
        COALESCE(v_service_id::text, '') || '|' ||
        COALESCE(ROUND(p_pickup_latitude, 6)::text, '') || '|' ||
        COALESCE(ROUND(p_pickup_longitude, 6)::text, '') || '|' ||
        LOWER(TRIM(COALESCE(p_notes, ''))) || '|' ||
        COALESCE(v_clean_coupon_code, '')
    );

    -- 5. Idempotency Pre-Check
    SELECT * INTO v_existing_order FROM public.orders WHERE client_submission_id = p_client_submission_id;
    IF FOUND THEN
        IF v_existing_order.customer_id IS DISTINCT FROM v_caller_id THEN
            RAISE EXCEPTION 'Security violation: Submission ID conflict detected.';
        END IF;

        IF (v_existing_order.client_submission_fingerprint IS NOT NULL
            AND v_existing_order.client_submission_fingerprint <> v_payload_fingerprint)
           OR v_existing_order.customer_phone <> v_clean_phone
           OR LOWER(TRIM(COALESCE(v_existing_order.customer_name, ''))) <> LOWER(TRIM(COALESCE(p_customer_name, '')))
           OR v_existing_order.pickup_date <> p_pickup_date
           OR LOWER(TRIM(COALESCE(v_existing_order.pickup_slot, ''))) <> LOWER(TRIM(COALESCE(p_pickup_slot, '')))
           OR TRIM(COALESCE(v_existing_order.pickup_pincode, '')) <> TRIM(COALESCE(p_pickup_pincode, ''))
           OR LOWER(TRIM(COALESCE(v_existing_order.pickup_address, ''))) <> LOWER(TRIM(COALESCE(p_pickup_address, '')))
           OR (v_service_id IS NOT NULL AND v_existing_order.service_id IS DISTINCT FROM v_service_id) THEN
            RAISE EXCEPTION 'Idempotency conflict: client_submission_id "%" was already used for a booking with different details.', p_client_submission_id;
        END IF;

        RETURN v_existing_order;
    END IF;

    -- 5b. Service Area Coverage Verification
    IF EXISTS (SELECT 1 FROM public.service_areas) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.service_areas
            WHERE pincode = TRIM(p_pickup_pincode) AND is_active = true
        ) THEN
            RAISE EXCEPTION 'Pickup PIN code % is not within our serviced coverage area.', TRIM(p_pickup_pincode);
        END IF;
    ELSIF v_settings.serviceable_pincodes IS NOT NULL AND array_length(v_settings.serviceable_pincodes, 1) > 0 THEN
        IF NOT (TRIM(p_pickup_pincode) = ANY(v_settings.serviceable_pincodes)) THEN
            RAISE EXCEPTION 'Pickup PIN code % is not within our serviced coverage area.', TRIM(p_pickup_pincode);
        END IF;
    END IF;

    -- 6. Slot Capacity Validation
    SELECT * INTO v_slot FROM public.pickup_slots WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_pickup_slot)) AND is_active = true;
    IF NOT FOUND THEN
        SELECT * INTO v_slot FROM public.pickup_slots WHERE is_active = true ORDER BY display_order ASC LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected pickup time slot is currently unavailable or inactive.';
        END IF;
    END IF;

    v_slot_capacity := COALESCE(v_slot.max_capacity, 10);
    SELECT COUNT(*) INTO v_current_slot_bookings
    FROM public.orders
    WHERE pickup_date = p_pickup_date
      AND LOWER(TRIM(pickup_slot)) = LOWER(TRIM(v_slot.name))
      AND order_status NOT IN ('cancelled');

    IF v_current_slot_bookings >= v_slot_capacity THEN
        RAISE EXCEPTION 'Pickup time slot "%" is fully booked for %. Please select another slot.', v_slot.name, p_pickup_date;
    END IF;

    -- 7. Option A Coupon Validation
    IF v_clean_coupon_code IS NOT NULL THEN
        SELECT * INTO v_coupon
        FROM public.coupons
        WHERE UPPER(TRIM(code)) = v_clean_coupon_code
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Coupon code "%" is invalid or does not exist.', p_coupon_code;
        END IF;

        IF NOT v_coupon.is_active THEN
            RAISE EXCEPTION 'Coupon "%" is currently disabled.', p_coupon_code;
        END IF;

        IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < timezone('utc'::text, now()) THEN
            RAISE EXCEPTION 'Coupon "%" has expired.', p_coupon_code;
        END IF;

        SELECT COUNT(*) INTO v_active_reservations
        FROM public.coupon_reservations
        WHERE coupon_id = v_coupon.id AND status = 'reserved' AND expires_at > timezone('utc', now());

        IF v_coupon.max_redemptions IS NOT NULL AND (v_coupon.total_redemptions + v_active_reservations) >= v_coupon.max_redemptions THEN
            RAISE EXCEPTION 'Coupon "%" has reached its overall maximum redemption limit.', p_coupon_code;
        END IF;

        IF v_clean_phone <> '' AND v_coupon.per_customer_limit > 0 THEN
            SELECT COUNT(*) INTO v_prior_coupon_redemptions
            FROM public.orders
            WHERE UPPER(TRIM(coupon_code)) = v_clean_coupon_code
              AND RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '[^0-9]', '', 'g'), 10) = RIGHT(v_clean_phone, 10)
              AND order_status <> 'cancelled';

            IF v_prior_coupon_redemptions >= v_coupon.per_customer_limit THEN
                RAISE EXCEPTION 'You have reached the maximum usage limit (% order) for coupon "%".', v_coupon.per_customer_limit, p_coupon_code;
            END IF;
        END IF;

        IF v_clean_phone <> '' AND v_coupon.first_time_only THEN
            SELECT COUNT(*) INTO v_prior_delivered_orders
            FROM public.orders
            WHERE RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '[^0-9]', '', 'g'), 10) = RIGHT(v_clean_phone, 10)
              AND order_status = 'delivered';

            IF v_prior_delivered_orders > 0 THEN
                RAISE EXCEPTION 'Coupon "%" is valid only for first-time customers.', p_coupon_code;
            END IF;
        END IF;

        v_estimated_subtotal := ROUND(v_unit_price_paise * GREATEST(1.0, COALESCE(v_min_weight_kg, 1.0)))::integer;
        IF v_coupon.min_order_paise > 0 AND v_estimated_subtotal < v_coupon.min_order_paise THEN
            v_authoritative_discount_paise := 0;
        ELSE
            IF v_coupon.discount_type = 'percentage' THEN
                v_authoritative_discount_paise := ROUND((v_estimated_subtotal * v_coupon.discount_value)::NUMERIC / 100.0);
                IF v_coupon.max_discount_paise IS NOT NULL AND v_authoritative_discount_paise > v_coupon.max_discount_paise THEN
                    v_authoritative_discount_paise := v_coupon.max_discount_paise;
                END IF;
            ELSE
                v_authoritative_discount_paise := v_coupon.discount_value;
            END IF;
        END IF;
    END IF;

    -- 8. Atomic Insert into public.orders
    INSERT INTO public.orders (
        customer_id,
        customer_name,
        customer_phone,
        pickup_address,
        pickup_landmark,
        pickup_pincode,
        pickup_date,
        pickup_slot,
        pickup_latitude,
        pickup_longitude,
        service_id,
        service_name,
        pricing_unit,
        price_per_kg_paise,
        min_weight_kg,
        delivery_charge_paise,
        measured_weight,
        billable_weight,
        total_amount_paise,
        paid_amount_paise,
        payment_status,
        payment_method,
        order_status,
        notes,
        coupon_code,
        discount_paise,
        client_submission_id,
        client_submission_fingerprint,
        pricing_version_id
    ) VALUES (
        v_caller_id,
        COALESCE(TRIM(p_customer_name), 'Customer'),
        v_clean_phone,
        TRIM(p_pickup_address),
        NULLIF(TRIM(p_pickup_landmark), ''),
        TRIM(p_pickup_pincode),
        p_pickup_date,
        v_slot.name,
        p_pickup_latitude,
        p_pickup_longitude,
        v_service_id,
        v_service_name,
        v_pricing_unit,
        v_unit_price_paise,
        v_min_weight_kg,
        v_delivery_charge_paise,
        NULL,
        NULL,
        NULL,
        0,
        'pending',
        'cash',
        'booked',
        NULLIF(TRIM(p_notes), ''),
        v_clean_coupon_code,
        v_authoritative_discount_paise,
        p_client_submission_id,
        v_payload_fingerprint,
        v_active_pricing_version_id
    )
    RETURNING * INTO v_new_order;

    -- 9. Insert service entries into public.order_items
    IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
        FOREACH v_sid IN ARRAY p_service_ids LOOP
            SELECT * INTO v_curr_service FROM public.services WHERE id = v_sid;
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
                v_new_order.id,
                v_curr_service.id,
                v_curr_service.name,
                v_curr_service.pricing_unit,
                COALESCE(v_curr_service.unit_price_paise, 7900),
                COALESCE(v_curr_service.min_weight_kg, 1.00),
                timezone('utc', now()),
                timezone('utc', now())
            );
        END LOOP;
    ELSE
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
            v_new_order.id,
            v_service_id,
            v_service_name,
            v_pricing_unit,
            v_unit_price_paise,
            v_min_weight_kg,
            timezone('utc', now()),
            timezone('utc', now())
        );
    END IF;

    -- 10. Option A Coupon Reservation Tracking
    IF v_coupon.id IS NOT NULL THEN
        v_reservation_expiry := GREATEST(timezone('utc', now()) + interval '7 days', (p_pickup_date::timestamptz + interval '3 days'));

        INSERT INTO public.coupon_reservations (
            coupon_id,
            user_id,
            order_id,
            status,
            expires_at,
            created_at,
            updated_at
        ) VALUES (
            v_coupon.id,
            v_caller_id,
            v_new_order.id,
            'reserved',
            v_reservation_expiry,
            timezone('utc', now()),
            timezone('utc', now())
        ) ON CONFLICT (order_id, coupon_id) DO UPDATE SET
            status = 'reserved',
            expires_at = v_reservation_expiry,
            updated_at = timezone('utc', now());
    END IF;

    RETURN v_new_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.create_booking_idempotent(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_idempotent(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER, UUID[]) TO authenticated, service_role;
