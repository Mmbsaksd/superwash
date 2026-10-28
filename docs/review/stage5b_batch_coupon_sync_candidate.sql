-- ==============================================================================
-- SuperWash Exprez — CANDIDATE REVIEW SQL (NON-EXECUTABLE IN CURRENT PHASE)
-- Path: docs/review/stage5b_batch_coupon_sync_candidate.sql
-- Purpose: Complete, executable SQL candidate for Stage 5B Phase 2A.2
--          (Batch-Level Coupon Synchronization, Secure Weighing, and Cancellation)
-- Status: Review artifact only. DO NOT apply directly to Supabase production.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SCHEMA EXTENSION: PERSISTED BOOKING-TIME COUPON SNAPSHOT
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS coupon_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN public.orders.coupon_snapshot IS 
'Authoritative promotional terms snapshot locked at booking time. Immutable once created. NULL for legacy orders or bookings without coupons.';

-- ------------------------------------------------------------------------------
-- 2. ENFORCE DATABASE-LEVEL SNAPSHOT IMMUTABILITY
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_order_coupon_snapshot_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.coupon_snapshot IS DISTINCT FROM OLD.coupon_snapshot THEN
        RAISE EXCEPTION 'Security violation: coupon_snapshot is immutable and cannot be modified on UPDATE (order #%).',
            OLD.order_number;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

ALTER FUNCTION public.enforce_order_coupon_snapshot_immutability() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_order_coupon_snapshot_immutability() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trigger_enforce_coupon_snapshot_immutability ON public.orders;
CREATE TRIGGER trigger_enforce_coupon_snapshot_immutability
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_order_coupon_snapshot_immutability();

-- ------------------------------------------------------------------------------
-- 3. UPDATE CREATE_BOOKING_IDEMPOTENT (CORE 14-PARAMETER FUNCTION)
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
    p_discount_paise INTEGER
)
RETURNS public.orders AS $$
DECLARE
    v_caller_id UUID;
    v_existing_order public.orders;
    v_new_order public.orders;
    v_service public.services;
    v_service_id UUID;
    v_service_name TEXT;
    v_pricing_unit TEXT;
    v_unit_price_paise INTEGER;
    v_min_weight_kg NUMERIC(4, 2);
    v_delivery_charge_paise INTEGER := 0;
    v_settings public.business_settings;
    v_clean_phone TEXT;
    v_slot public.pickup_slots;
    v_slot_capacity INTEGER;
    v_current_slot_bookings INTEGER := 0;
    v_constraint_name TEXT;
    v_payload_fingerprint TEXT;
    v_coupon public.coupons;
    v_clean_coupon_code TEXT := NULL;
    v_authoritative_discount_paise INTEGER := 0;
    v_estimated_subtotal INTEGER := 0;
    v_prior_coupon_redemptions INTEGER := 0;
    v_prior_delivered_orders INTEGER := 0;
    v_coupon_snapshot JSONB := NULL;
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

    IF p_pickup_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Pickup date cannot be in the past.';
    END IF;

    IF p_pickup_slot IS NULL OR TRIM(p_pickup_slot) = '' THEN
        RAISE EXCEPTION 'Pickup time slot is required.';
    END IF;

    -- 4. Business Settings & Service Resolution (Server-Authoritative Pricing)
    SELECT * INTO v_settings
    FROM public.business_settings
    LIMIT 1;

    IF FOUND THEN
        v_delivery_charge_paise := COALESCE(v_settings.delivery_charge_paise, 0);
    END IF;

    IF p_service_id IS NOT NULL THEN
        SELECT * INTO v_service
        FROM public.services
        WHERE id = p_service_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected service was not found in the active catalog.';
        END IF;

        IF NOT v_service.is_active THEN
            RAISE EXCEPTION 'The selected service is currently deactivated and not accepting new bookings.';
        END IF;

        v_service_id := v_service.id;
        v_service_name := v_service.name;
        v_pricing_unit := v_service.pricing_unit;
        v_unit_price_paise := v_service.unit_price_paise;
        v_min_weight_kg := v_service.min_weight_kg;
    ELSE
        -- Fallback to default service catalogue entry
        SELECT * INTO v_service
        FROM public.services
        WHERE is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF FOUND THEN
            v_service_id := v_service.id;
            v_service_name := v_service.name;
            v_pricing_unit := v_service.pricing_unit;
            v_unit_price_paise := v_service.unit_price_paise;
            v_min_weight_kg := v_service.min_weight_kg;
        ELSE
            -- Store-level settings fallback
            v_service_id := NULL;
            v_service_name := 'Wash & Fold';
            v_pricing_unit := 'per_kg';
            v_unit_price_paise := COALESCE(v_settings.price_per_kg_paise, 7900);
            v_min_weight_kg := COALESCE(v_settings.min_weight_kg, 1.00);
        END IF;
    END IF;

    -- 5. Slot Capacity & Availability Verification
    SELECT * INTO v_slot
    FROM public.pickup_slots
    WHERE name = TRIM(p_pickup_slot)
      AND is_active = true;

    IF FOUND THEN
        v_slot_capacity := v_slot.max_capacity;
    ELSE
        v_slot_capacity := 10;
    END IF;

    SELECT COUNT(*) INTO v_current_slot_bookings
    FROM public.orders
    WHERE pickup_date = p_pickup_date
      AND pickup_slot = p_pickup_slot
      AND order_status <> 'cancelled';

    IF v_current_slot_bookings >= v_slot_capacity THEN
        RAISE EXCEPTION 'The selected pickup slot (%) is fully booked for %. Please select another slot.',
            p_pickup_slot, p_pickup_date;
    END IF;

    -- 6. Server-Authoritative Coupon Validation & Immutable Snapshot Generation
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        v_clean_coupon_code := UPPER(TRIM(p_coupon_code));

        SELECT * INTO v_coupon
        FROM public.coupons
        WHERE UPPER(code) = v_clean_coupon_code
          AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Coupon "%" is invalid or expired.', v_clean_coupon_code;
        END IF;

        IF v_coupon.valid_until IS NOT NULL AND CURRENT_TIMESTAMP > v_coupon.valid_until THEN
            RAISE EXCEPTION 'Coupon "%" has expired.', v_clean_coupon_code;
        END IF;

        IF v_coupon.applicable_service_ids IS NOT NULL 
           AND array_length(v_coupon.applicable_service_ids, 1) > 0 THEN
            IF v_service_id IS NULL OR NOT (v_service_id = ANY(v_coupon.applicable_service_ids)) THEN
                RAISE EXCEPTION 'Coupon "%" is not valid for service "%".', v_clean_coupon_code, v_service_name;
            END IF;
        END IF;

        IF v_coupon.first_time_only THEN
            SELECT COUNT(*) INTO v_prior_delivered_orders
            FROM public.orders
            WHERE (customer_id = v_caller_id OR customer_phone = v_clean_phone)
              AND order_status = 'delivered';

            IF v_prior_delivered_orders > 0 THEN
                RAISE EXCEPTION 'Coupon "%" is valid only for first-time customers.', v_clean_coupon_code;
            END IF;
        END IF;

        IF v_coupon.per_customer_limit IS NOT NULL AND v_coupon.per_customer_limit > 0 THEN
            SELECT COUNT(*) INTO v_prior_coupon_redemptions
            FROM public.orders
            WHERE (customer_id = v_caller_id OR customer_phone = v_clean_phone)
              AND UPPER(coupon_code) = v_clean_coupon_code
              AND order_status <> 'cancelled';

            IF v_prior_coupon_redemptions >= v_coupon.per_customer_limit THEN
                RAISE EXCEPTION 'You have reached the redemption limit for coupon "%".', v_clean_coupon_code;
            END IF;
        END IF;

        -- Booking estimate subtotal
        IF v_pricing_unit = 'per_kg' OR v_pricing_unit IS NULL THEN
            v_estimated_subtotal := ROUND(v_unit_price_paise * COALESCE(v_min_weight_kg, 1.00));
        ELSIF v_pricing_unit IN ('per_piece', 'per_item') THEN
            v_estimated_subtotal := v_unit_price_paise;
        ELSIF v_pricing_unit = 'per_load' THEN
            v_estimated_subtotal := v_unit_price_paise;
        ELSIF v_pricing_unit = 'per_order' THEN
            v_estimated_subtotal := v_unit_price_paise;
        ELSE
            v_estimated_subtotal := ROUND(v_unit_price_paise * COALESCE(v_min_weight_kg, 1.00));
        END IF;

        IF v_coupon.min_order_paise > 0 AND v_estimated_subtotal < v_coupon.min_order_paise THEN
            RAISE EXCEPTION 'Minimum order subtotal of ₹% required for coupon "%".', (v_coupon.min_order_paise / 100)::text, v_clean_coupon_code;
        END IF;

        IF v_coupon.discount_type = 'percentage' THEN
            v_authoritative_discount_paise := ROUND(v_estimated_subtotal * (v_coupon.discount_value / 100.0));
            IF v_coupon.max_discount_paise IS NOT NULL AND v_coupon.max_discount_paise > 0 THEN
                v_authoritative_discount_paise := LEAST(v_authoritative_discount_paise, v_coupon.max_discount_paise);
            END IF;
            v_authoritative_discount_paise := LEAST(v_authoritative_discount_paise, v_estimated_subtotal);
        ELSIF v_coupon.discount_type = 'fixed' THEN
            v_authoritative_discount_paise := LEAST(v_coupon.discount_value, v_estimated_subtotal);
        ELSE
            v_authoritative_discount_paise := 0;
        END IF;

        v_coupon_snapshot := jsonb_build_object(
            'code', v_coupon.code,
            'discount_type', v_coupon.discount_type,
            'discount_value', v_coupon.discount_value,
            'min_order_paise', COALESCE(v_coupon.min_order_paise, 0),
            'max_discount_paise', v_coupon.max_discount_paise,
            'applicable_service_ids', v_coupon.applicable_service_ids
        );
    ELSE
        v_clean_coupon_code := NULL;
        v_authoritative_discount_paise := 0;
        v_coupon_snapshot := NULL;
    END IF;

    -- 7. Payload Fingerprinting for Idempotent Replays
    v_payload_fingerprint := MD5(
        COALESCE(v_caller_id::text, '') || '|' ||
        COALESCE(v_clean_phone, '') || '|' ||
        COALESCE(p_pickup_date::text, '') || '|' ||
        COALESCE(p_pickup_slot, '') || '|' ||
        COALESCE(v_service_id::text, '') || '|' ||
        COALESCE(v_clean_coupon_code, '')
    );

    -- 8. Atomic Order Insertion
    BEGIN
        INSERT INTO public.orders (
            customer_id,
            customer_name,
            customer_phone,
            pickup_address,
            pickup_landmark,
            pickup_pincode,
            pickup_date,
            pickup_slot,
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
            pickup_latitude,
            pickup_longitude,
            notes,
            client_submission_id,
            coupon_code,
            discount_paise,
            coupon_snapshot
        ) VALUES (
            v_caller_id,
            TRIM(p_customer_name),
            v_clean_phone,
            TRIM(p_pickup_address),
            NULLIF(TRIM(p_pickup_landmark), ''),
            TRIM(p_pickup_pincode),
            p_pickup_date,
            p_pickup_slot,
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
            p_pickup_latitude,
            p_pickup_longitude,
            NULLIF(TRIM(p_notes), ''),
            p_client_submission_id,
            v_clean_coupon_code,
            v_authoritative_discount_paise,
            v_coupon_snapshot
        )
        RETURNING * INTO v_new_order;

        RETURN v_new_order;

    EXCEPTION
        WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

            IF v_constraint_name = 'idx_orders_client_submission_id'
               OR v_constraint_name LIKE '%client_submission_id%' THEN
                SELECT * INTO v_existing_order
                FROM public.orders
                WHERE client_submission_id = p_client_submission_id;

                IF FOUND THEN
                    RETURN v_existing_order;
                END IF;
            END IF;
            RAISE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

ALTER FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER
) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. BACKWARD-COMPATIBLE 12-PARAMETER BOOKING WRAPPER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_idempotent(
    p_client_submission_id TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_pickup_address TEXT,
    p_pickup_landmark TEXT DEFAULT NULL,
    p_pickup_pincode TEXT DEFAULT '560038',
    p_pickup_date DATE DEFAULT CURRENT_DATE,
    p_pickup_slot TEXT DEFAULT 'Morning (08:00 AM - 11:00 AM)',
    p_service_id UUID DEFAULT NULL,
    p_pickup_latitude NUMERIC DEFAULT NULL,
    p_pickup_longitude NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.orders AS $$
BEGIN
    RETURN public.create_booking_idempotent(
        p_client_submission_id := p_client_submission_id,
        p_customer_name        := p_customer_name,
        p_customer_phone       := p_customer_phone,
        p_pickup_address       := p_pickup_address,
        p_pickup_landmark      := p_pickup_landmark,
        p_pickup_pincode       := p_pickup_pincode,
        p_pickup_date          := p_pickup_date,
        p_pickup_slot          := p_pickup_slot,
        p_service_id           := p_service_id,
        p_pickup_latitude      := p_pickup_latitude,
        p_pickup_longitude     := p_pickup_longitude,
        p_notes                := p_notes,
        p_coupon_code          := NULL,
        p_discount_paise       := 0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

ALTER FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT
) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. SHARED SERVER-SIDE PRICING HELPER
-- ------------------------------------------------------------------------------
-- Calculates authoritative billable measure and base laundry charge for an order
-- across all five pricing units: per_kg, per_piece, per_item, per_load, per_order.
CREATE OR REPLACE FUNCTION public.calculate_order_laundry_charge_internal(
    p_measured_weight NUMERIC(5, 2),
    p_price_per_kg_paise INTEGER,
    p_min_weight_kg NUMERIC(4, 2),
    p_pricing_unit TEXT
)
RETURNS TABLE (
    billable_weight NUMERIC(5, 2),
    laundry_charge_paise INTEGER
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_billable NUMERIC(5, 2);
    v_charge INTEGER;
BEGIN
    IF p_price_per_kg_paise IS NULL OR p_price_per_kg_paise <= 0 THEN
        RAISE EXCEPTION 'Invalid stored service unit price (% paise).', p_price_per_kg_paise;
    END IF;

    IF p_pricing_unit = 'per_kg' OR p_pricing_unit IS NULL THEN
        v_billable := GREATEST(p_measured_weight, COALESCE(p_min_weight_kg, 0.00));
        v_charge := ROUND(v_billable * p_price_per_kg_paise);
    ELSIF p_pricing_unit IN ('per_piece', 'per_item') THEN
        v_billable := ROUND(p_measured_weight);
        v_charge := ROUND(v_billable * p_price_per_kg_paise);
    ELSIF p_pricing_unit = 'per_load' THEN
        v_billable := GREATEST(1.00, ROUND(COALESCE(p_measured_weight, 1.00)));
        v_charge := ROUND(v_billable * p_price_per_kg_paise);
    ELSIF p_pricing_unit = 'per_order' THEN
        v_billable := 1.00;
        v_charge := p_price_per_kg_paise;
    ELSE
        -- Fallback to per_kg formula if unknown pricing unit encountered
        v_billable := GREATEST(p_measured_weight, COALESCE(p_min_weight_kg, 0.00));
        v_charge := ROUND(v_billable * p_price_per_kg_paise);
    END IF;

    RETURN QUERY SELECT v_billable, v_charge;
END;
$$;

ALTER FUNCTION public.calculate_order_laundry_charge_internal(NUMERIC, INTEGER, NUMERIC, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calculate_order_laundry_charge_internal(NUMERIC, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon;

-- ------------------------------------------------------------------------------
-- 6. SHARED BATCH COUPON SYNCHRONIZATION HELPER
-- ------------------------------------------------------------------------------
-- Authoritative batch coupon evaluation and recalculation across linked orders.
-- Updates the coupon-bearing order when any sibling in the batch changes weight
-- or is cancelled. Enforces snapshot immutability, minimum thresholds, fixed caps,
-- excess forfeiture, and downward paid-amount invariants.
CREATE OR REPLACE FUNCTION public.synchronize_batch_coupon_internal(
    p_batch_id TEXT,
    p_trigger_order_id UUID,
    p_actor_id UUID,
    p_reason_prefix TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_coupon_order public.orders;
    v_rec RECORD;
    v_combined_subtotal INTEGER := 0;
    v_item_charge INTEGER;
    v_snap_type TEXT;
    v_snap_val NUMERIC;
    v_snap_min INTEGER := 0;
    v_snap_max INTEGER := NULL;
    v_snap_svcs JSONB;
    v_raw_num NUMERIC;
    v_raw_discount INTEGER := 0;
    v_new_discount INTEGER := 0;
    v_new_total INTEGER;
    v_coupon_laundry_charge INTEGER;
BEGIN
    IF p_batch_id IS NULL THEN
        RETURN;
    END IF;

    -- 1. Identify the coupon-bearing order in this batch (if any)
    SELECT * INTO v_coupon_order
    FROM public.orders
    WHERE notes LIKE '%[Linked Batch ' || p_batch_id || '%'
      AND order_status <> 'cancelled'
      AND (coupon_snapshot IS NOT NULL OR (coupon_code IS NOT NULL AND discount_paise > 0))
    LIMIT 1;

    -- If no coupon-bearing order exists in the batch, or coupon order has not been weighed yet, exit
    IF NOT FOUND OR v_coupon_order.measured_weight IS NULL THEN
        RETURN;
    END IF;

    -- 2. Aggregate authoritatively across all active (non-cancelled) orders in the batch
    FOR v_rec IN 
        SELECT *
        FROM public.orders
        WHERE notes LIKE '%[Linked Batch ' || p_batch_id || '%'
          AND order_status <> 'cancelled'
        ORDER BY id ASC
    LOOP
        IF v_rec.total_amount_paise IS NOT NULL THEN
            -- Stored actual laundry charge excluding delivery fees and discounts
            v_item_charge := GREATEST(0, v_rec.total_amount_paise + COALESCE(v_rec.discount_paise, 0) - COALESCE(v_rec.delivery_charge_paise, 0));
        ELSE
            -- Agreed booking estimate for unweighed sibling
            v_item_charge := GREATEST(0, ROUND(COALESCE(NULLIF(v_rec.price_per_kg_paise, 0), 7900) * COALESCE(NULLIF(v_rec.min_weight_kg, 0.0), 1.0)));
        END IF;

        v_combined_subtotal := v_combined_subtotal + v_item_charge;

        IF v_rec.id = v_coupon_order.id THEN
            v_coupon_laundry_charge := v_item_charge;
        END IF;
    END LOOP;

    -- 3. Calculate authoritative discount against coupon terms
    IF v_coupon_order.coupon_snapshot IS NOT NULL THEN
        -- Validation
        IF jsonb_typeof(v_coupon_order.coupon_snapshot) <> 'object' THEN
            RAISE EXCEPTION 'Malformed coupon snapshot on order #%: root must be JSON object.', v_coupon_order.order_number;
        END IF;

        IF NOT (v_coupon_order.coupon_snapshot ? 'code') 
           OR jsonb_typeof(v_coupon_order.coupon_snapshot->'code') <> 'string' 
           OR TRIM(v_coupon_order.coupon_snapshot->>'code') = '' THEN
            RAISE EXCEPTION 'Malformed coupon snapshot on order #%: missing or empty code.', v_coupon_order.order_number;
        END IF;

        v_snap_type := v_coupon_order.coupon_snapshot->>'discount_type';
        v_snap_val  := (v_coupon_order.coupon_snapshot->>'discount_value')::numeric;

        IF v_snap_type NOT IN ('percentage', 'fixed') OR trunc(v_snap_val) <> v_snap_val OR v_snap_val <= 0 THEN
            RAISE EXCEPTION 'Malformed coupon snapshot on order #%: invalid discount type or value.', v_coupon_order.order_number;
        END IF;

        -- Minimum order threshold
        IF v_coupon_order.coupon_snapshot ? 'min_order_paise' 
           AND v_coupon_order.coupon_snapshot->'min_order_paise' IS NOT NULL 
           AND jsonb_typeof(v_coupon_order.coupon_snapshot->'min_order_paise') <> 'null' THEN
            v_snap_min := (v_coupon_order.coupon_snapshot->>'min_order_paise')::integer;
        END IF;

        -- Maximum discount cap
        IF v_coupon_order.coupon_snapshot ? 'max_discount_paise' 
           AND v_coupon_order.coupon_snapshot->'max_discount_paise' IS NOT NULL 
           AND jsonb_typeof(v_coupon_order.coupon_snapshot->'max_discount_paise') <> 'null' THEN
            v_snap_max := (v_coupon_order.coupon_snapshot->>'max_discount_paise')::integer;
        END IF;

        -- Service restrictions
        v_snap_svcs := v_coupon_order.coupon_snapshot->'applicable_service_ids';

        IF v_snap_svcs IS NOT NULL 
           AND jsonb_typeof(v_snap_svcs) = 'array' 
           AND jsonb_array_length(v_snap_svcs) > 0 
           AND (v_coupon_order.service_id IS NULL OR NOT (v_coupon_order.service_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(v_snap_svcs))))) THEN
            v_new_discount := 0;
        ELSIF v_snap_min > 0 AND v_combined_subtotal < v_snap_min THEN
            v_new_discount := 0;
        ELSIF v_snap_type = 'percentage' THEN
            v_raw_discount := ROUND(v_combined_subtotal * (v_snap_val / 100.0));
            IF v_snap_max IS NOT NULL AND v_snap_max > 0 AND v_raw_discount > v_snap_max THEN
                v_raw_discount := v_snap_max;
            END IF;
            v_new_discount := LEAST(v_raw_discount, v_coupon_laundry_charge);
        ELSIF v_snap_type = 'fixed' THEN
            -- Excess beyond primary order is forfeited; does not spill over
            v_new_discount := LEAST(v_snap_val::integer, v_coupon_laundry_charge);
        ELSE
            v_new_discount := 0;
        END IF;

    ELSIF v_coupon_order.coupon_code IS NOT NULL THEN
        -- Legacy order without snapshot: grandfather existing discount clamped to laundry charge
        v_new_discount := LEAST(COALESCE(v_coupon_order.discount_paise, 0), v_coupon_laundry_charge);
    ELSE
        v_new_discount := 0;
    END IF;

    v_new_discount := GREATEST(0, LEAST(v_new_discount, v_coupon_laundry_charge));
    v_new_total := GREATEST(0, v_coupon_laundry_charge - v_new_discount + COALESCE(v_coupon_order.delivery_charge_paise, 0));

    -- 4. Check Paid-Amount Invariant on Coupon-Bearing Order
    IF v_coupon_order.paid_amount_paise > 0 AND v_new_total < v_coupon_order.paid_amount_paise THEN
        RAISE EXCEPTION 'Downward recalculation rejected: Batch coupon adjustment reduces Order #% total (₹%) below paid amount (₹%). Modifications below paid amount require formal refund processing.',
            v_coupon_order.order_number,
            (v_new_total / 100.0)::numeric(10, 2),
            (v_coupon_order.paid_amount_paise / 100.0)::numeric(10, 2);
    END IF;

    -- 5. If values changed, update coupon order and record audit history
    IF v_new_discount IS DISTINCT FROM v_coupon_order.discount_paise 
       OR v_new_total IS DISTINCT FROM v_coupon_order.total_amount_paise THEN
        
        UPDATE public.orders SET
            discount_paise = v_new_discount,
            total_amount_paise = v_new_total,
            updated_at = timezone('utc', now())
        WHERE id = v_coupon_order.id;

        INSERT INTO public.weight_change_history (
            order_id, old_weight, new_weight, old_amount_paise, new_amount_paise, reason, changed_by
        ) VALUES (
            v_coupon_order.id, v_coupon_order.measured_weight, v_coupon_order.measured_weight,
            v_coupon_order.total_amount_paise, v_new_total,
            p_reason_prefix || ': Batch coupon recalculated against combined subtotal ₹' || (v_combined_subtotal / 100.0)::numeric(10, 2),
            p_actor_id
        );
    END IF;
END;
$$;

ALTER FUNCTION public.synchronize_batch_coupon_internal(TEXT, UUID, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.synchronize_batch_coupon_internal(TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon;

-- ------------------------------------------------------------------------------
-- 7. STORE MANAGER & OWNER INTAKE WEIGHING RPC
-- ------------------------------------------------------------------------------
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
DECLARE
    v_order public.orders;
    v_caller_role VARCHAR;
    v_batch_id TEXT;
    v_billable_weight NUMERIC(5, 2);
    v_laundry_charge_paise INTEGER;
    v_discount_paise INTEGER := 0;
    v_total_amount_paise INTEGER;
    v_new_status VARCHAR(30);
BEGIN
    -- 1. Role Authorization
    v_caller_role := public.current_user_role();
    IF auth.role() <> 'service_role' AND (v_caller_role IS NULL OR v_caller_role NOT IN ('manager', 'owner')) THEN
        RAISE EXCEPTION 'Unauthorized: Only Store Managers and Owners can record store intake weight.';
    END IF;

    -- 2. Concurrency Control: Advisory lock on linked batch if multi-service booking
    SELECT notes INTO v_order.notes FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    v_batch_id := substring(v_order.notes FROM '\[Linked Batch ([^:\]]+)');
    IF v_batch_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('batch_weigh'), hashtext(v_batch_id));
        -- Deterministic row locking across batch to mitigate lock-inversion deadlock risks
        PERFORM 1 FROM public.orders 
        WHERE notes LIKE '%[Linked Batch ' || v_batch_id || '%' 
          AND order_status <> 'cancelled'
        ORDER BY id ASC 
        FOR UPDATE;
    ELSE
        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    -- 3. Lifecycle Status Validation
    IF v_order.order_status NOT IN ('collected', 'weighed', 'washing') THEN
        RAISE EXCEPTION 'Invalid order state: Store intake weighing cannot be performed on order #% in status "%". Allowed statuses: collected, weighed, washing.',
            v_order.order_number, v_order.order_status;
    END IF;

    -- 4. Scale Weight Validation
    IF p_measured_weight IS NULL OR p_measured_weight < 0.10 OR p_measured_weight > 250.00 THEN
        RAISE EXCEPTION 'Measured weight % kg out of valid range (0.10 - 250.00 kg).', p_measured_weight;
    END IF;

    -- 5. Calculate Server-Side Pricing across all 5 units
    SELECT billable_weight, laundry_charge_paise 
    INTO v_billable_weight, v_laundry_charge_paise
    FROM public.calculate_order_laundry_charge_internal(
        p_measured_weight, v_order.price_per_kg_paise, v_order.min_weight_kg, v_order.pricing_unit
    );

    -- 6. Target Order Initial Discount Calculation
    IF v_order.coupon_snapshot IS NOT NULL OR v_order.coupon_code IS NOT NULL THEN
        -- If target order is the coupon-bearing order, preserve existing discount clamped to new subtotal
        v_discount_paise := LEAST(COALESCE(v_order.discount_paise, 0), v_laundry_charge_paise);
    ELSE
        v_discount_paise := 0;
    END IF;

    v_total_amount_paise := GREATEST(0, v_laundry_charge_paise - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0));

    -- 7. Downward Paid-Amount Guard on Target Order
    IF v_order.paid_amount_paise > 0 AND v_total_amount_paise < v_order.paid_amount_paise THEN
        RAISE EXCEPTION 'Downward re-weighing rejected: Recalculated total (₹%) is less than already paid amount (₹%). Modifications below paid amount require formal refund processing.',
            (v_total_amount_paise / 100.0)::numeric(10, 2),
            (v_order.paid_amount_paise / 100.0)::numeric(10, 2);
    END IF;

    -- 8. State Machine Progression
    IF v_order.order_status = 'collected' THEN
        v_new_status := 'washing';
    ELSE
        v_new_status := v_order.order_status;
    END IF;

    -- 9. Atomic Order Update
    UPDATE public.orders SET
        measured_weight = p_measured_weight,
        billable_weight = v_billable_weight,
        discount_paise = v_discount_paise,
        total_amount_paise = v_total_amount_paise,
        weighed_at = COALESCE(v_order.weighed_at, timezone('utc', now())),
        order_status = v_new_status,
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    -- 10. Audit History Logging
    INSERT INTO public.weight_change_history (
        order_id, old_weight, new_weight, old_amount_paise, new_amount_paise, reason, changed_by
    ) VALUES (
        v_order.id, v_order.measured_weight, p_measured_weight,
        v_order.total_amount_paise, v_total_amount_paise,
        COALESCE(p_correction_reason, CASE WHEN v_order.measured_weight IS NULL THEN 'Initial intake weight' ELSE 'Weight correction by manager' END),
        auth.uid()
    );

    IF v_new_status IS DISTINCT FROM v_order.order_status THEN
        INSERT INTO public.order_status_history (
            order_id, previous_status, new_status, notes, changed_by
        ) VALUES (
            v_order.id, v_order.order_status, v_new_status,
            'Weighed at store intake: ' || p_measured_weight || ' kg',
            auth.uid()
        );
    END IF;

    -- 11. Synchronize Batch Coupon Recalculation Across Siblings
    IF v_batch_id IS NOT NULL THEN
        PERFORM public.synchronize_batch_coupon_internal(
            v_batch_id, v_order.id, auth.uid(), 'Store intake weighing'
        );
        -- Re-read target order to return synchronized final values
        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'measured_weight', v_order.measured_weight,
        'billable_weight', v_order.billable_weight,
        'discount_paise', v_order.discount_paise,
        'total_amount_paise', v_order.total_amount_paise,
        'order_status', v_order.order_status
    );
END;
$$;

ALTER FUNCTION public.record_store_intake_weight(UUID, NUMERIC, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_store_intake_weight(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_store_intake_weight(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. COURIER DOORSTEP PICKUP COLLECTION & WEIGHING RPC
-- ------------------------------------------------------------------------------
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
DECLARE
    v_order public.orders;
    v_caller_role VARCHAR;
    v_batch_id TEXT;
    v_billable_weight NUMERIC(5, 2);
    v_laundry_charge_paise INTEGER;
    v_discount_paise INTEGER := 0;
    v_total_amount_paise INTEGER;
BEGIN
    -- 1. Role & Assignment Authorization
    v_caller_role := public.current_user_role();
    IF auth.role() <> 'service_role' AND (v_caller_role IS NULL OR v_caller_role NOT IN ('delivery', 'manager', 'owner')) THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned delivery associates, managers, and owners can record pickup collection.';
    END IF;

    SELECT notes INTO v_order.notes FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- 2. Concurrency Control: Advisory lock on linked batch if multi-service booking
    v_batch_id := substring(v_order.notes FROM '\[Linked Batch ([^:\]]+)');
    IF v_batch_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('batch_weigh'), hashtext(v_batch_id));
        PERFORM 1 FROM public.orders 
        WHERE notes LIKE '%[Linked Batch ' || v_batch_id || '%' 
          AND order_status <> 'cancelled'
        ORDER BY id ASC 
        FOR UPDATE;
    ELSE
        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    -- Strict courier assignment check (unless manager, owner, or backend service_role)
    IF v_caller_role = 'delivery' AND auth.role() <> 'service_role' AND v_order.assigned_pickup_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You are not the assigned pickup associate for order #%.', v_order.order_number;
    END IF;

    -- 3. Lifecycle Status Validation
    IF v_order.order_status <> 'pickup_assigned' THEN
        RAISE EXCEPTION 'Invalid order state: Doorstep collection cannot be performed on order #% in status "%". Expected "pickup_assigned".',
            v_order.order_number, v_order.order_status;
    END IF;

    -- 4. Scale Weight Validation
    IF p_measured_weight IS NULL OR p_measured_weight < 0.10 OR p_measured_weight > 250.00 THEN
        RAISE EXCEPTION 'Measured weight % kg out of valid range (0.10 - 250.00 kg).', p_measured_weight;
    END IF;

    -- 5. Calculate Server-Side Pricing across all 5 units
    SELECT billable_weight, laundry_charge_paise 
    INTO v_billable_weight, v_laundry_charge_paise
    FROM public.calculate_order_laundry_charge_internal(
        p_measured_weight, v_order.price_per_kg_paise, v_order.min_weight_kg, v_order.pricing_unit
    );

    IF v_order.coupon_snapshot IS NOT NULL OR v_order.coupon_code IS NOT NULL THEN
        v_discount_paise := LEAST(COALESCE(v_order.discount_paise, 0), v_laundry_charge_paise);
    ELSE
        v_discount_paise := 0;
    END IF;

    v_total_amount_paise := GREATEST(0, v_laundry_charge_paise - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0));

    -- 6. Downward Paid-Amount Guard
    IF v_order.paid_amount_paise > 0 AND v_total_amount_paise < v_order.paid_amount_paise THEN
        RAISE EXCEPTION 'Downward re-weighing rejected: Recalculated total (₹%) is less than already paid amount (₹%). Modifications below paid amount require formal refund processing.',
            (v_total_amount_paise / 100.0)::numeric(10, 2),
            (v_order.paid_amount_paise / 100.0)::numeric(10, 2);
    END IF;

    -- 7. Atomic Order Update
    UPDATE public.orders SET
        order_status = 'collected',
        pickup_measured_weight = p_measured_weight,
        measured_weight = p_measured_weight,
        billable_weight = v_billable_weight,
        discount_paise = v_discount_paise,
        total_amount_paise = v_total_amount_paise,
        pickup_weighed_at = timezone('utc', now()),
        pickup_weighed_by = auth.uid(),
        collected_at = timezone('utc', now()),
        delivery_notes = COALESCE(p_delivery_notes, v_order.delivery_notes),
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    -- 8. Audit History Logging
    INSERT INTO public.order_status_history (
        order_id, previous_status, new_status, notes, changed_by
    ) VALUES (
        v_order.id, 'pickup_assigned', 'collected',
        'Doorstep collected & weighed: ' || p_measured_weight || ' kg',
        auth.uid()
    );

    -- 9. Synchronize Batch Coupon Recalculation Across Siblings
    IF v_batch_id IS NOT NULL THEN
        PERFORM public.synchronize_batch_coupon_internal(
            v_batch_id, v_order.id, auth.uid(), 'Doorstep collection weighing'
        );
        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'measured_weight', v_order.measured_weight,
        'billable_weight', v_order.billable_weight,
        'discount_paise', v_order.discount_paise,
        'total_amount_paise', v_order.total_amount_paise,
        'order_status', 'collected'
    );
END;
$$;

ALTER FUNCTION public.record_courier_pickup_collection(UUID, NUMERIC, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_courier_pickup_collection(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_courier_pickup_collection(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. SYNCHRONIZED BATCH CANCELLATION RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_order_with_batch_sync(
    p_order_id UUID,
    p_cancellation_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders;
    v_caller_role VARCHAR;
    v_batch_id TEXT;
    v_clean_reason TEXT;
BEGIN
    v_clean_reason := NULLIF(TRIM(p_cancellation_reason), '');
    IF v_clean_reason IS NULL THEN
        RAISE EXCEPTION 'A cancellation reason is required.';
    END IF;

    SELECT notes INTO v_order.notes FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- Concurrency Control: Advisory lock on linked batch
    v_batch_id := substring(v_order.notes FROM '\[Linked Batch ([^:\]]+)');
    IF v_batch_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('batch_weigh'), hashtext(v_batch_id));
        PERFORM 1 FROM public.orders 
        WHERE notes LIKE '%[Linked Batch ' || v_batch_id || '%' 
          AND order_status <> 'cancelled'
        ORDER BY id ASC 
        FOR UPDATE;
    ELSE
        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    -- Role Authorization & Customer Ownership Check
    v_caller_role := public.current_user_role();
    IF auth.role() = 'service_role' OR v_caller_role IN ('manager', 'owner') THEN
        -- Managers, owners, and backend service_role can cancel orders in cancellable states
        NULL;
    ELSIF v_order.customer_id = auth.uid() THEN
        -- Customers can only cancel early-stage bookings
        IF v_order.order_status NOT IN ('booked', 'pickup_assigned') THEN
            RAISE EXCEPTION 'Order #% cannot be cancelled by customer after collection has commenced. Please contact store support.',
                v_order.order_number;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unauthorized: You do not have permission to cancel this order.';
    END IF;

    -- Terminal State Check
    IF v_order.order_status = 'cancelled' THEN
        RAISE EXCEPTION 'Order #% is already cancelled.', v_order.order_number;
    ELSIF v_order.order_status = 'delivered' THEN
        RAISE EXCEPTION 'Delivered orders cannot be cancelled.';
    END IF;

    -- Update order to cancelled
    UPDATE public.orders SET
        order_status = 'cancelled',
        cancellation_reason = v_clean_reason,
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    -- Audit history
    INSERT INTO public.order_status_history (
        order_id, previous_status, new_status, notes, changed_by
    ) VALUES (
        v_order.id, v_order.order_status, 'cancelled',
        'Order cancelled: ' || v_clean_reason,
        auth.uid()
    );

    -- Synchronize batch coupon across remaining active siblings
    IF v_batch_id IS NOT NULL THEN
        PERFORM public.synchronize_batch_coupon_internal(
            v_batch_id, v_order.id, auth.uid(), 'Sibling cancelled'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_status', 'cancelled',
        'cancellation_reason', v_clean_reason
    );
END;
$$;

ALTER FUNCTION public.cancel_order_with_batch_sync(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_order_with_batch_sync(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_with_batch_sync(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 10. ADVANCE ORDER WORKFLOW STATUS RPC
-- ------------------------------------------------------------------------------
-- Authoritative, state-validated RPC for non-weighing operational transitions.
-- Explicitly rejects cancellation (which requires cancel_order_with_batch_sync)
-- and weighing (which requires record_store_intake_weight).
CREATE OR REPLACE FUNCTION public.advance_order_workflow_status(
    p_order_id UUID,
    p_target_status TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders;
    v_caller_role VARCHAR;
    v_clean_notes TEXT;
BEGIN
    v_clean_notes := NULLIF(TRIM(p_notes), '');

    -- 1. Explicitly reject bypass targets
    IF p_target_status = 'cancelled' THEN
        RAISE EXCEPTION 'Invalid operation: Cancellations must be processed through cancel_order_with_batch_sync().';
    ELSIF p_target_status = 'booked' THEN
        RAISE EXCEPTION 'Invalid operation: Orders cannot be reverted to booked status.';
    ELSIF p_target_status = 'weighed' THEN
        RAISE EXCEPTION 'Invalid operation: Weighing must be processed through record_store_intake_weight().';
    END IF;

    -- 2. Lock and retrieve order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- 3. Caller Role Authorization & Transition Permissibility
    v_caller_role := public.current_user_role();

    IF auth.role() = 'service_role' OR v_caller_role IN ('manager', 'owner') THEN
        -- Managers, owners, and service_role can perform all standard workflow transitions
        NULL;
    ELSIF v_caller_role = 'delivery' THEN
        -- Delivery couriers can only dispatch to out_for_delivery and complete delivery on assigned orders
        IF p_target_status NOT IN ('out_for_delivery', 'delivered') THEN
            RAISE EXCEPTION 'Unauthorized: Delivery associates cannot advance orders to "%".', p_target_status;
        END IF;

        IF v_order.assigned_delivery_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'Unauthorized: You are not the assigned delivery courier for order #%.', v_order.order_number;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unauthorized: Current user role is not permitted to advance order status.';
    END IF;

    -- 4. Current State Machine & Invariant Validations
    IF p_target_status = 'collected' THEN
        IF v_order.order_status NOT IN ('booked', 'pickup_assigned') THEN
            RAISE EXCEPTION 'Invalid transition: Cannot mark collected from status "%". Expected "booked" or "pickup_assigned".',
                v_order.order_status;
        END IF;

    ELSIF p_target_status = 'washing' THEN
        IF v_order.order_status NOT IN ('collected', 'weighed') THEN
            RAISE EXCEPTION 'Invalid transition: Cannot move to washing from status "%". Expected "collected".',
                v_order.order_status;
        END IF;
        IF v_order.measured_weight IS NULL THEN
            RAISE EXCEPTION 'Invalid operation: Order #% must be weighed before starting washing. Use record_store_intake_weight().',
                v_order.order_number;
        END IF;

    ELSIF p_target_status = 'ready_for_delivery' THEN
        IF v_order.order_status <> 'washing' THEN
            RAISE EXCEPTION 'Invalid transition: Order #% must be in "washing" before marking ready for delivery (Current status: "%").',
                v_order.order_number, v_order.order_status;
        END IF;

    ELSIF p_target_status = 'out_for_delivery' THEN
        IF v_order.assigned_delivery_id IS NULL THEN
            RAISE EXCEPTION 'Cannot dispatch order: A delivery courier must be assigned before dispatching out for delivery.';
        END IF;
        IF v_order.order_status NOT IN ('ready_for_delivery', 'delivery_assigned') THEN
            RAISE EXCEPTION 'Invalid transition: Order #% must be ready for delivery before dispatch (Current status: "%").',
                v_order.order_number, v_order.order_status;
        END IF;

    ELSIF p_target_status = 'delivered' THEN
        IF v_order.order_status <> 'out_for_delivery' THEN
            RAISE EXCEPTION 'Invalid transition: Order #% must be out for delivery before being marked delivered (Current status: "%").',
                v_order.order_number, v_order.order_status;
        END IF;

    ELSE
        RAISE EXCEPTION 'Invalid or unsupported target workflow status: "%".', p_target_status;
    END IF;

    -- 5. Perform Atomic Order Update
    UPDATE public.orders SET
        order_status = p_target_status,
        collected_at = CASE WHEN p_target_status = 'collected' THEN COALESCE(v_order.collected_at, timezone('utc', now())) ELSE v_order.collected_at END,
        delivered_at = CASE WHEN p_target_status = 'delivered' THEN COALESCE(v_order.delivered_at, timezone('utc', now())) ELSE v_order.delivered_at END,
        delivery_notes = COALESCE(v_clean_notes, v_order.delivery_notes),
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    -- 6. Audit History Logging
    INSERT INTO public.order_status_history (
        order_id, previous_status, new_status, notes, changed_by
    ) VALUES (
        v_order.id, v_order.order_status, p_target_status,
        COALESCE(v_clean_notes, 'Status transitioned from ' || v_order.order_status || ' to ' || p_target_status),
        auth.uid()
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'previous_status', v_order.order_status,
        'order_status', p_target_status,
        'notes', v_clean_notes
    );
END;
$$;

ALTER FUNCTION public.advance_order_workflow_status(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.advance_order_workflow_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_order_workflow_status(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 11. SECURE COURIER ASSIGNMENT RPC
-- ------------------------------------------------------------------------------
-- Dedicated, state-validated RPC for pickup and delivery associate assignment.
-- Coordinates staff assignment across active sibling orders in a linked batch.
CREATE OR REPLACE FUNCTION public.assign_order_courier(
    p_order_id UUID,
    p_assignment_type TEXT,
    p_courier_id UUID,
    p_courier_name TEXT DEFAULT NULL,
    p_courier_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders;
    v_caller_role VARCHAR;
    v_batch_id TEXT;
    v_staff_name TEXT;
    v_staff_phone TEXT;
    v_staff_profile RECORD;
    v_new_status VARCHAR(30);
    v_action_desc TEXT;
    v_rec RECORD;
BEGIN
    -- 1. Role Authorization
    v_caller_role := public.current_user_role();
    IF auth.role() <> 'service_role' AND (v_caller_role IS NULL OR v_caller_role NOT IN ('manager', 'owner')) THEN
        RAISE EXCEPTION 'Unauthorized: Only Store Managers and Owners can assign couriers.';
    END IF;

    -- 2. Validate Inputs
    IF p_assignment_type NOT IN ('pickup', 'delivery') THEN
        RAISE EXCEPTION 'Invalid assignment type: "%". Allowed types are "pickup" and "delivery".', p_assignment_type;
    END IF;

    IF p_courier_id IS NULL THEN
        RAISE EXCEPTION 'Courier staff ID is required.';
    END IF;

    -- 3. Authoritative Staff Profile & Eligibility Validation
    -- Queries the real public.profiles schema (id, full_name, phone, role, is_active).
    -- Staff must exist, be actively employed (is_active IS TRUE), and hold the specific field delivery role ('delivery').
    -- In SuperWash application conventions (AssignStaffModal.tsx), store managers and owners supervise operations
    -- and are never assignable as field couriers. Customers are strictly non-staff.
    SELECT full_name, phone, role, is_active
    INTO v_staff_profile
    FROM public.profiles
    WHERE id = p_courier_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid courier assignment: Staff profile % does not exist.', p_courier_id;
    END IF;

    -- If is_active is false or NULL, assignment is rejected immediately
    IF v_staff_profile.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Invalid courier assignment: Staff member "%" (ID %) is not active and cannot be assigned to orders.',
            COALESCE(v_staff_profile.full_name, 'Unknown'), p_courier_id;
    END IF;

    -- Strict role validation: Only staff with role 'delivery' can be assigned to pickup or delivery tasks
    IF v_staff_profile.role <> 'delivery' THEN
        RAISE EXCEPTION 'Invalid courier assignment: Profile % has role "%". Only staff with role "delivery" can be assigned to pickup or delivery tasks.',
            p_courier_id, v_staff_profile.role;
    END IF;

    -- Authoritative profile identity is strictly derived from public.profiles;
    -- caller-supplied names or phone numbers are never treated as authoritative.
    v_staff_name := TRIM(v_staff_profile.full_name);
    IF v_staff_name IS NULL OR v_staff_name = '' THEN
        RAISE EXCEPTION 'Invalid courier assignment: Staff profile % does not have a registered full name.', p_courier_id;
    END IF;

    v_staff_phone := TRIM(v_staff_profile.phone);
    IF v_staff_phone IS NULL OR v_staff_phone = '' THEN
        RAISE EXCEPTION 'Invalid courier assignment: Staff profile % does not have a registered contact phone number.', p_courier_id;
    END IF;

    -- 4. Lock Order and Linked Batch
    SELECT notes INTO v_order.notes FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    v_batch_id := substring(v_order.notes FROM '\[Linked Batch ([^:\]]+)');
    IF v_batch_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('batch_weigh'), hashtext(v_batch_id));
        PERFORM 1 FROM public.orders
        WHERE notes LIKE '%[Linked Batch ' || v_batch_id || '%'
          AND order_status <> 'cancelled'
        ORDER BY id ASC
        FOR UPDATE;
    ELSE
        SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    -- 5. Lifecycle Status Validation & Execution
    IF p_assignment_type = 'pickup' THEN
        IF v_order.order_status NOT IN ('booked', 'pickup_assigned') THEN
            RAISE EXCEPTION 'Order #% has already progressed past pickup stage (%). Pickup staff cannot be reassigned.',
                v_order.order_number, v_order.order_status;
        END IF;

        v_new_status := 'pickup_assigned';
        v_action_desc := 'Pickup assigned to ' || v_staff_name || ' (' || v_staff_phone || ')';

        -- Update target order
        UPDATE public.orders SET
            assigned_pickup_id = p_courier_id,
            assigned_pickup_name = v_staff_name,
            assigned_pickup_phone = v_staff_phone,
            order_status = v_new_status,
            updated_at = timezone('utc', now())
        WHERE id = v_order.id;

        -- Audit target order
        INSERT INTO public.order_status_history (
            order_id, previous_status, new_status, notes, changed_by
        ) VALUES (
            v_order.id, v_order.order_status, v_new_status, v_action_desc, auth.uid()
        );

        -- Coordinate across active linked batch siblings in booked or pickup_assigned
        IF v_batch_id IS NOT NULL THEN
            FOR v_rec IN
                SELECT id, order_status, order_number FROM public.orders
                WHERE notes LIKE '%[Linked Batch ' || v_batch_id || '%'
                  AND id <> v_order.id
                  AND order_status IN ('booked', 'pickup_assigned')
                ORDER BY id ASC
            LOOP
                UPDATE public.orders SET
                    assigned_pickup_id = p_courier_id,
                    assigned_pickup_name = v_staff_name,
                    assigned_pickup_phone = v_staff_phone,
                    order_status = v_new_status,
                    updated_at = timezone('utc', now())
                WHERE id = v_rec.id;

                INSERT INTO public.order_status_history (
                    order_id, previous_status, new_status, notes, changed_by
                ) VALUES (
                    v_rec.id, v_rec.order_status, v_new_status,
                    'Batch ' || v_action_desc, auth.uid()
                );
            END LOOP;
        END IF;

    ELSIF p_assignment_type = 'delivery' THEN
        IF v_order.order_status IN ('booked', 'pickup_assigned') THEN
            RAISE EXCEPTION 'Order #% has not yet been collected from customer. Assign a pickup associate instead of delivery courier.',
                v_order.order_number;
        END IF;

        IF v_order.order_status NOT IN ('ready_for_delivery', 'delivery_assigned') THEN
            RAISE EXCEPTION 'Order #% is currently in status "%". Delivery courier can only be assigned when order is ready for delivery.',
                v_order.order_number, v_order.order_status;
        END IF;

        v_new_status := 'delivery_assigned';
        v_action_desc := 'Delivery courier assigned: ' || v_staff_name || ' (' || v_staff_phone || ')';

        -- Update target order
        UPDATE public.orders SET
            assigned_delivery_id = p_courier_id,
            assigned_delivery_name = v_staff_name,
            assigned_delivery_phone = v_staff_phone,
            order_status = v_new_status,
            updated_at = timezone('utc', now())
        WHERE id = v_order.id;

        -- Audit target order
        INSERT INTO public.order_status_history (
            order_id, previous_status, new_status, notes, changed_by
        ) VALUES (
            v_order.id, v_order.order_status, v_new_status, v_action_desc, auth.uid()
        );

        -- Coordinate across active linked batch siblings in ready_for_delivery or delivery_assigned
        IF v_batch_id IS NOT NULL THEN
            FOR v_rec IN
                SELECT id, order_status, order_number FROM public.orders
                WHERE notes LIKE '%[Linked Batch ' || v_batch_id || '%'
                  AND id <> v_order.id
                  AND order_status IN ('ready_for_delivery', 'delivery_assigned')
                ORDER BY id ASC
            LOOP
                UPDATE public.orders SET
                    assigned_delivery_id = p_courier_id,
                    assigned_delivery_name = v_staff_name,
                    assigned_delivery_phone = v_staff_phone,
                    order_status = v_new_status,
                    updated_at = timezone('utc', now())
                WHERE id = v_rec.id;

                INSERT INTO public.order_status_history (
                    order_id, previous_status, new_status, notes, changed_by
                ) VALUES (
                    v_rec.id, v_rec.order_status, v_new_status,
                    'Batch ' || v_action_desc, auth.uid()
                );
            END LOOP;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'assignment_type', p_assignment_type,
        'order_status', v_new_status,
        'courier_id', p_courier_id,
        'courier_name', v_staff_name,
        'courier_phone', v_staff_phone
    );
END;
$$;

ALTER FUNCTION public.assign_order_courier(UUID, TEXT, UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_order_courier(UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_order_courier(UUID, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 12. SECURE DELIVERY NOTES UPDATE RPC
-- ------------------------------------------------------------------------------
-- Dedicated, auditable, type-safe RPC allowing assigned couriers, store managers,
-- and owners to update operational delivery notes on an order without direct table access.
CREATE OR REPLACE FUNCTION public.update_order_delivery_notes(
    p_order_id UUID,
    p_delivery_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders;
    v_caller_role VARCHAR;
BEGIN
    v_caller_role := public.current_user_role();

    -- Row lock order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- Authorization check: service_role, manager/owner, or assigned delivery associate
    IF auth.role() <> 'service_role' THEN
        IF v_caller_role IN ('manager', 'owner') THEN
            NULL; -- authorized management
        ELSIF v_caller_role = 'delivery' AND (v_order.assigned_delivery_id = auth.uid() OR v_order.assigned_pickup_id = auth.uid()) THEN
            NULL; -- authorized assigned field associate
        ELSE
            RAISE EXCEPTION 'Unauthorized: Only assigned couriers, store managers, or owners can update delivery notes.';
        END IF;
    END IF;

    -- Update delivery notes and record timestamp
    UPDATE public.orders
    SET delivery_notes = p_delivery_notes,
        updated_at = timezone('utc', now())
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'delivery_notes', p_delivery_notes
    );
END;
$$;

ALTER FUNCTION public.update_order_delivery_notes(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_order_delivery_notes(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_delivery_notes(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 13. ORDER WORKFLOW INTEGRITY TRIGGER
-- ------------------------------------------------------------------------------
-- Enforces data invariants, sequential progression, terminal-state protection,
-- and payment integrity on orders.
CREATE OR REPLACE FUNCTION public.enforce_order_workflow_integrity()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := public.current_user_role();

    -- 1. Authorization: Unauthenticated or unknown roles cannot update orders directly
    IF auth.role() = 'service_role' THEN
        -- service_role is authorized, but continues down to invariant checks below
        NULL;
    ELSIF NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' AND OLD.customer_id = auth.uid() THEN
        -- Customer cancelling own order (authorized via cancel_order_with_batch_sync)
        NULL;
    ELSIF user_role IS NULL OR user_role NOT IN ('owner', 'manager', 'delivery') THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers, owners, and assigned associates can update orders.';
    END IF;

    -- 2. Terminal State Protection
    IF OLD.order_status = 'delivered' AND NEW.order_status IS DISTINCT FROM 'delivered' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Delivered orders are finalized and cannot change status.';
    END IF;
    IF OLD.order_status = 'cancelled' AND NEW.order_status IS DISTINCT FROM 'cancelled' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Cancelled orders cannot be reopened.';
    END IF;

    -- 3. Sequential Stage Progression & Out for delivery dispatch rules
    IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
        IF NEW.order_status = 'delivered' AND OLD.order_status != 'out_for_delivery' THEN
            RAISE EXCEPTION 'Invalid workflow transition: Order must be dispatched to out_for_delivery before delivery completion (Current status: %).', OLD.order_status;
        END IF;

        IF NEW.order_status = 'out_for_delivery' AND NEW.assigned_delivery_id IS NULL THEN
            RAISE EXCEPTION 'Invalid workflow transition: Cannot dispatch order without an assigned delivery courier.';
        END IF;
    END IF;

    -- 4. Payment Integrity Check
    IF NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
       NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
       NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN

        IF NEW.paid_amount_paise < OLD.paid_amount_paise THEN
            RAISE EXCEPTION 'Security violation: Paid amount on orders cannot decrease (% -> %).',
                OLD.paid_amount_paise, NEW.paid_amount_paise;
        END IF;

        IF NEW.total_amount_paise IS NOT NULL AND NEW.paid_amount_paise > NEW.total_amount_paise THEN
            RAISE EXCEPTION 'Security violation: Paid amount (% paise) cannot exceed bill total (% paise).',
                NEW.paid_amount_paise, NEW.total_amount_paise;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.payments p
            WHERE p.order_id = NEW.id
              AND p.amount_paise = (NEW.paid_amount_paise - OLD.paid_amount_paise)
        ) THEN
            RAISE EXCEPTION 'Security violation: Direct payment field modification is prohibited. Payments must be processed through record_order_payment().';
        END IF;
    END IF;

    -- 5. Delivery Associate Strict Column Allowlists
    IF user_role = 'delivery' THEN
        IF NEW.id IS DISTINCT FROM OLD.id OR
           NEW.order_number IS DISTINCT FROM OLD.order_number OR
           NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
           NEW.customer_name IS DISTINCT FROM OLD.customer_name OR
           NEW.customer_phone IS DISTINCT FROM OLD.customer_phone OR
           NEW.pickup_address IS DISTINCT FROM OLD.pickup_address OR
           NEW.service_id IS DISTINCT FROM OLD.service_id OR
           NEW.price_per_kg_paise IS DISTINCT FROM OLD.price_per_kg_paise OR
           NEW.created_at IS DISTINCT FROM OLD.created_at OR
           NEW.weighed_at IS DISTINCT FROM OLD.weighed_at THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot modify customer booking details or pricing snapshots.';
        END IF;
    END IF;

    -- 6. Manager & Owner Invariants
    IF user_role IN ('manager', 'owner') THEN
        IF NEW.id IS DISTINCT FROM OLD.id OR
           NEW.order_number IS DISTINCT FROM OLD.order_number OR
           NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
           NEW.customer_name IS DISTINCT FROM OLD.customer_name OR
           NEW.customer_phone IS DISTINCT FROM OLD.customer_phone OR
           NEW.service_id IS DISTINCT FROM OLD.service_id OR
           NEW.price_per_kg_paise IS DISTINCT FROM OLD.price_per_kg_paise OR
           NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Security violation: Booking details and pricing snapshots are immutable once placed.';
        END IF;
    END IF;

    -- 7. Linked-Batch Metadata Protection
    -- Strictly protects batch grouping integrity:
    -- (a) If order was placed with a linked-batch marker, it cannot be stripped or changed to a different batch ID.
    -- (b) If order was placed without a linked-batch marker, no update can inject a marker later.
    -- (Legitimate creation occurs strictly during initial booking INSERT, which does not trigger BEFORE UPDATE).
    IF OLD.notes LIKE '%[Linked Batch %' THEN
        IF NEW.notes IS NULL OR
           NEW.notes NOT LIKE '%[Linked Batch %' OR
           substring(NEW.notes FROM '\[Linked Batch ([^:\]]+)') IS DISTINCT FROM substring(OLD.notes FROM '\[Linked Batch ([^:\]]+)') THEN
            RAISE EXCEPTION 'Security violation: Linked batch metadata in order notes is immutable once assigned.';
        END IF;
    ELSE
        IF NEW.notes LIKE '%[Linked Batch %' THEN
            RAISE EXCEPTION 'Security violation: Cannot inject linked batch metadata into an order that was not created as part of a linked batch.';
        END IF;
    END IF;

    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

ALTER FUNCTION public.enforce_order_workflow_integrity() OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 14. DATABASE PRIVILEGE HARDENING: COMPREHENSIVE WRITE BOUNDARY
-- ------------------------------------------------------------------------------
-- 1. Revoke ALL table-level write privileges on public.orders from all client and
--    backend roles. Eliminates table-level INSERT, UPDATE, DELETE, TRUNCATE, and REFERENCES.
REVOKE ALL PRIVILEGES ON TABLE public.orders FROM authenticated, anon, service_role, PUBLIC;

-- 2. Maintainable, migration-compatible dynamic column-level revocation:
--    Iterates across every single column existing in public.orders in information_schema
--    and executes separate REVOKE statements for INSERT, UPDATE, and REFERENCES.
--    Special PostgreSQL syntax rule: The pseudo-role PUBLIC is a keyword, NOT an ordinary
--    identifier, and must NOT be quoted with %I. Ordinary roles ('authenticated', 'anon',
--    'service_role') are safely quoted with %I.
DO $$
DECLARE
    col RECORD;
    role_name TEXT;
    priv_name TEXT;
BEGIN
    FOR col IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
    LOOP
        FOR priv_name IN SELECT unnest(ARRAY['INSERT', 'UPDATE', 'REFERENCES'])
        LOOP
            -- Pseudo-role PUBLIC: unquoted keyword syntax
            EXECUTE format('REVOKE %s (%I) ON TABLE public.orders FROM PUBLIC;', priv_name, col.column_name);

            -- Ordinary roles: safely quoted identifiers (%I)
            FOR role_name IN SELECT unnest(ARRAY['authenticated', 'anon', 'service_role'])
            LOOP
                EXECUTE format('REVOKE %s (%I) ON TABLE public.orders FROM %I;', priv_name, col.column_name, role_name);
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- 3. Static belt-and-suspenders revocation across all 47 real schema columns:
--    Provides static-review clarity and guarantees catalog cleanliness even in environments
--    where procedural blocks are inspected statically. Separate statements for INSERT, UPDATE,
--    and REFERENCES ensure strictly compliant PostgreSQL column-level privilege syntax.
REVOKE INSERT (
    id,
    order_number,
    created_at,
    updated_at,
    client_submission_id,
    client_submission_fingerprint,
    customer_id,
    customer_name,
    customer_phone,
    pickup_address,
    pickup_landmark,
    pickup_pincode,
    pickup_latitude,
    pickup_longitude,
    pickup_date,
    pickup_slot,
    service_id,
    service_name,
    pricing_unit,
    price_per_kg_paise,
    min_weight_kg,
    delivery_charge_paise,
    coupon_code,
    coupon_snapshot,
    measured_weight,
    pickup_measured_weight,
    billable_weight,
    total_amount_paise,
    discount_paise,
    paid_amount_paise,
    payment_status,
    payment_method,
    order_status,
    collected_at,
    weighed_at,
    delivered_at,
    pickup_weighed_at,
    pickup_weighed_by,
    assigned_pickup_id,
    assigned_pickup_name,
    assigned_pickup_phone,
    assigned_delivery_id,
    assigned_delivery_name,
    assigned_delivery_phone,
    delivery_notes,
    notes,
    cancellation_reason
) ON TABLE public.orders FROM authenticated, anon, service_role, PUBLIC;

REVOKE UPDATE (
    id,
    order_number,
    created_at,
    updated_at,
    client_submission_id,
    client_submission_fingerprint,
    customer_id,
    customer_name,
    customer_phone,
    pickup_address,
    pickup_landmark,
    pickup_pincode,
    pickup_latitude,
    pickup_longitude,
    pickup_date,
    pickup_slot,
    service_id,
    service_name,
    pricing_unit,
    price_per_kg_paise,
    min_weight_kg,
    delivery_charge_paise,
    coupon_code,
    coupon_snapshot,
    measured_weight,
    pickup_measured_weight,
    billable_weight,
    total_amount_paise,
    discount_paise,
    paid_amount_paise,
    payment_status,
    payment_method,
    order_status,
    collected_at,
    weighed_at,
    delivered_at,
    pickup_weighed_at,
    pickup_weighed_by,
    assigned_pickup_id,
    assigned_pickup_name,
    assigned_pickup_phone,
    assigned_delivery_id,
    assigned_delivery_name,
    assigned_delivery_phone,
    delivery_notes,
    notes,
    cancellation_reason
) ON TABLE public.orders FROM authenticated, anon, service_role, PUBLIC;

REVOKE REFERENCES (
    id,
    order_number,
    created_at,
    updated_at,
    client_submission_id,
    client_submission_fingerprint,
    customer_id,
    customer_name,
    customer_phone,
    pickup_address,
    pickup_landmark,
    pickup_pincode,
    pickup_latitude,
    pickup_longitude,
    pickup_date,
    pickup_slot,
    service_id,
    service_name,
    pricing_unit,
    price_per_kg_paise,
    min_weight_kg,
    delivery_charge_paise,
    coupon_code,
    coupon_snapshot,
    measured_weight,
    pickup_measured_weight,
    billable_weight,
    total_amount_paise,
    discount_paise,
    paid_amount_paise,
    payment_status,
    payment_method,
    order_status,
    collected_at,
    weighed_at,
    delivered_at,
    pickup_weighed_at,
    pickup_weighed_by,
    assigned_pickup_id,
    assigned_pickup_name,
    assigned_pickup_phone,
    assigned_delivery_id,
    assigned_delivery_name,
    assigned_delivery_phone,
    delivery_notes,
    notes,
    cancellation_reason
) ON TABLE public.orders FROM authenticated, anon, service_role, PUBLIC;

-- 4. Restore SELECT to standard roles so RLS policies and read queries operate.
GRANT SELECT ON TABLE public.orders TO authenticated, anon, service_role;

-- 5. Retained direct-write privilege: ONLY delivery_notes is granted to authenticated.
--    delivery_notes contains non-financial operational instructions for delivery agents.
--    Direct update is strictly constrained by Row-Level Security:
--    Policy "Authorized roles can update orders" requires:
--      (public.current_user_role() = 'delivery' AND (assigned_delivery_id = auth.uid() OR assigned_pickup_id = auth.uid()))
--      OR public.current_user_role() IN ('manager', 'owner')
--    Customers and unassigned users are denied by RLS.
--    service_role is granted ZERO direct UPDATE privileges (100% RPC-only write path).
GRANT UPDATE (delivery_notes) ON TABLE public.orders TO authenticated;

-- 6. Authorize all lifecycle, weighing, delivery notes, and cancellation RPCs for authenticated and service_role:
GRANT EXECUTE ON FUNCTION public.record_store_intake_weight(UUID, NUMERIC, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_courier_pickup_collection(UUID, NUMERIC, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_order_with_batch_sync(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_order_workflow_status(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_order_courier(UUID, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_order_delivery_notes(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 15. CATALOG-DRIVEN & EFFECTIVE-PRIVILEGE VERIFICATION ASSERTIONS
-- ------------------------------------------------------------------------------
-- Comprehensive assertions combining direct catalog inspections with PostgreSQL's
-- built-in effective-privilege functions (has_table_privilege, has_column_privilege)
-- to detect direct grants, pseudo-role PUBLIC grants, and inherited role grants.
DO $$
DECLARE
    v_unintended RECORD;
    v_col RECORD;
    v_role TEXT;
    v_priv TEXT;
    v_count INTEGER := 0;
BEGIN
    -- =========================================================================
    -- PART 1: DIRECT CATALOG & ACL ASSERTIONS FOR 'PUBLIC' AND NAMED ROLES
    -- Direct catalog inspections verify literal grants and the PUBLIC pseudo-role.
    -- In PostgreSQL catalogs, PUBLIC is a pseudo-role represented as grantee = 0
    -- (or grantee = 'PUBLIC' in information_schema), NOT an ordinary database role.
    -- =========================================================================

    -- 1. Assert NO table-level write privileges on public.orders in information_schema
    FOR v_unintended IN
        SELECT grantee, privilege_type
        FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND grantee IN ('authenticated', 'anon', 'PUBLIC', 'service_role')
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES')
    LOOP
        RAISE EXCEPTION 'Privilege Audit Assertion Failure: Unintended table-level % privilege found for grantee "%".',
            v_unintended.privilege_type, v_unintended.grantee;
    END LOOP;

    -- 2. Assert NO column-level write privileges on public.orders for anon, PUBLIC, or service_role
    FOR v_unintended IN
        SELECT grantee, column_name, privilege_type
        FROM information_schema.column_privileges
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND grantee IN ('anon', 'PUBLIC', 'service_role')
          AND privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES')
    LOOP
        RAISE EXCEPTION 'Privilege Audit Assertion Failure: Unintended column-level % privilege on column "orders.%" for grantee "%".',
            v_unintended.privilege_type, v_unintended.column_name, v_unintended.grantee;
    END LOOP;

    -- 3. Assert authenticated has column-level UPDATE ONLY on delivery_notes, and NO INSERT or REFERENCES
    FOR v_unintended IN
        SELECT grantee, column_name, privilege_type
        FROM information_schema.column_privileges
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND grantee = 'authenticated'
          AND (
              privilege_type IN ('INSERT', 'REFERENCES')
              OR (privilege_type = 'UPDATE' AND column_name <> 'delivery_notes')
          )
    LOOP
        RAISE EXCEPTION 'Privilege Audit Assertion Failure: Unintended column-level % privilege on column "orders.%" for grantee "%".',
            v_unintended.privilege_type, v_unintended.column_name, v_unintended.grantee;
    END LOOP;

    -- 4. Verify authenticated DOES have UPDATE on delivery_notes in catalog
    SELECT COUNT(*) INTO v_count
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND grantee = 'authenticated'
      AND privilege_type = 'UPDATE'
      AND column_name = 'delivery_notes';

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Privilege Audit Assertion Failure: Required column-level UPDATE privilege on orders.delivery_notes is missing for role "authenticated".';
    END IF;

    -- 5. Native ACL Inspection: Assert zero table-level or column-level write grants to PUBLIC (grantee = 0)
    FOR v_unintended IN
        SELECT privs.privilege_type
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) privs
        WHERE n.nspname = 'public'
          AND c.relname = 'orders'
          AND privs.grantee = 0
          AND privs.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES')
    LOOP
        RAISE EXCEPTION 'Privilege Audit Assertion Failure: Native table-level ACL grant found for pseudo-role PUBLIC on public.orders: %',
            v_unintended.privilege_type;
    END LOOP;

    FOR v_unintended IN
        SELECT a.attname AS column_name, privs.privilege_type
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(a.attacl) privs
        WHERE n.nspname = 'public'
          AND c.relname = 'orders'
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND privs.grantee = 0
          AND privs.privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES')
    LOOP
        RAISE EXCEPTION 'Privilege Audit Assertion Failure: Native column-level ACL grant found for pseudo-role PUBLIC on orders.%: %',
            v_unintended.column_name, v_unintended.privilege_type;
    END LOOP;

    -- =========================================================================
    -- PART 2: EFFECTIVE PRIVILEGE ASSERTIONS (has_table_privilege, has_column_privilege)
    -- Evaluates effective privileges for actual database roles ('anon', 'service_role',
    -- 'authenticated'), taking into account direct grants, inherited role memberships,
    -- and pseudo-role PUBLIC. 'public' is strictly omitted from the ordinary roles list.
    -- =========================================================================

    -- 1. Effective table-level write checks for actual roles:
    FOR v_role IN SELECT unnest(ARRAY['anon', 'service_role', 'authenticated'])
    LOOP
        FOR v_priv IN SELECT unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'])
        LOOP
            IF has_table_privilege(v_role, 'public.orders', v_priv) THEN
                RAISE EXCEPTION 'Effective Privilege Assertion Failure: Role "%" has unauthorized effective table-level % on public.orders.',
                    v_role, v_priv;
            END IF;
        END LOOP;
    END LOOP;

    -- 2. Effective column-level write checks across EVERY column in public.orders:
    FOR v_col IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
    LOOP
        -- 'anon' and 'service_role' must have ZERO column-level write privileges on any column
        FOR v_role IN SELECT unnest(ARRAY['anon', 'service_role'])
        LOOP
            FOR v_priv IN SELECT unnest(ARRAY['INSERT', 'UPDATE', 'REFERENCES'])
            LOOP
                IF has_column_privilege(v_role, 'public.orders', v_col.column_name, v_priv) THEN
                    RAISE EXCEPTION 'Effective Privilege Assertion Failure: Role "%" has unauthorized effective column-level % on "orders.%".',
                        v_role, v_priv, v_col.column_name;
                END IF;
            END LOOP;
        END LOOP;

        -- 'authenticated': Must NOT have effective INSERT or REFERENCES on ANY column
        IF has_column_privilege('authenticated', 'public.orders', v_col.column_name, 'INSERT') THEN
            RAISE EXCEPTION 'Effective Privilege Assertion Failure: Role "authenticated" has unauthorized effective column-level INSERT on "orders.%".',
                v_col.column_name;
        END IF;
        IF has_column_privilege('authenticated', 'public.orders', v_col.column_name, 'REFERENCES') THEN
            RAISE EXCEPTION 'Effective Privilege Assertion Failure: Role "authenticated" has unauthorized effective column-level REFERENCES on "orders.%".',
                v_col.column_name;
        END IF;

        -- 'authenticated': Must NOT have effective UPDATE on any column EXCEPT delivery_notes
        IF v_col.column_name <> 'delivery_notes' THEN
            IF has_column_privilege('authenticated', 'public.orders', v_col.column_name, 'UPDATE') THEN
                RAISE EXCEPTION 'Effective Privilege Assertion Failure: Role "authenticated" has unauthorized effective column-level UPDATE on "orders.%".',
                    v_col.column_name;
            END IF;
        ELSE
            -- 'delivery_notes' MUST have effective UPDATE for authenticated
            IF NOT has_column_privilege('authenticated', 'public.orders', 'delivery_notes', 'UPDATE') THEN
                RAISE EXCEPTION 'Effective Privilege Assertion Failure: Role "authenticated" is missing required effective column-level UPDATE on "orders.delivery_notes".';
            END IF;
        END IF;
    END LOOP;
END $$;

COMMIT;
