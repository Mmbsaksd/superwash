-- ==============================================================================
-- SuperWash Exprez — Migration 20261101000000
-- Phase 5A: Database Payment, Pricing & Coupon Lifecycle Modernization
-- 
-- 1. Foundations: pricing_versions, pricing_version_items, coupon_reservations,
--                 coupon_redemptions, payment_events
-- 2. Alterations: orders.pricing_version_id, payments (payment_type, status),
--                 business_settings additive controls
-- 3. Stored Procedure: create_booking_idempotent (Option A coupon reservation, extended expiry)
-- 4. Stored Procedure: validate_coupon (supports p_is_booking_estimate for Option A)
-- 5. Stored Procedure: record_order_payment (advance payments, customer initiation vs staff confirmation)
-- 6. Stored Procedure: record_order_refund (financial refund ledger, liability settlement, authorization)
-- 7. Stored Procedure: record_courier_pickup_collection (doorstep weighing + Option A coupon redemption)
-- 8. Stored Procedure: record_store_intake_weight (store intake weighing + Option A coupon redemption)
-- 9. Stored Procedure: cancel_order_with_batch_sync (releases reservations, logs refund liability)
-- 10. Trigger: enforce_order_workflow_integrity (permits payment decreases matching authentic refunds)
-- 11. RPC: get_active_pricing (resolves active pricing items)
-- 12. Security, RLS Policies, Grants & PostgREST Cache Invalidation
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PRICING VERSIONS & ITEMS TABLES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pricing_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_number INTEGER NOT NULL UNIQUE,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    effective_to TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'scheduled')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.pricing_version_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pricing_version_id UUID NOT NULL REFERENCES public.pricing_versions(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    price_paise INTEGER NOT NULL CHECK (price_paise > 0),
    min_weight_grams INTEGER NOT NULL DEFAULT 1000 CHECK (min_weight_grams > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (pricing_version_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_versions_status ON public.pricing_versions(status);
CREATE INDEX IF NOT EXISTS idx_pricing_version_items_version_id ON public.pricing_version_items(pricing_version_id);

-- Attach pricing_version_id to orders table
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS pricing_version_id UUID REFERENCES public.pricing_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pricing_version_id ON public.orders(pricing_version_id);

-- ------------------------------------------------------------------------------
-- 2. BUSINESS SETTINGS ADDITIVE CONTROLS
-- ------------------------------------------------------------------------------

ALTER TABLE public.business_settings
    ADD COLUMN IF NOT EXISTS advance_payment_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS advance_payment_type VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK (advance_payment_type IN ('fixed', 'percentage')),
    ADD COLUMN IF NOT EXISTS advance_payment_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (advance_payment_amount_paise >= 0),
    ADD COLUMN IF NOT EXISTS advance_payment_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (advance_payment_percentage >= 0.00 AND advance_payment_percentage <= 100.00),
    ADD COLUMN IF NOT EXISTS min_order_spend_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS min_order_spend_paise INTEGER NOT NULL DEFAULT 0 CHECK (min_order_spend_paise >= 0),
    ADD COLUMN IF NOT EXISTS min_weight_restriction_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS min_weight_restriction_grams INTEGER NOT NULL DEFAULT 1000 CHECK (min_weight_restriction_grams >= 0),
    ADD COLUMN IF NOT EXISTS online_payment_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cod_payment_enabled BOOLEAN NOT NULL DEFAULT true;

-- ------------------------------------------------------------------------------
-- 3. OPTION A COUPON RESERVATIONS & REDEMPTIONS TABLES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupon_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'applied', 'unqualified', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (order_id, coupon_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    discount_paise INTEGER NOT NULL CHECK (discount_paise >= 0),
    subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
    final_paise INTEGER NOT NULL CHECK (final_paise >= 0),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_reservations_user ON public.coupon_reservations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_coupon_reservations_coupon ON public.coupon_reservations(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON public.coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id);

-- Decommission legacy cancellation trigger from 20261027140000 which prematurely
-- decremented total_redemptions before Option A verified redemptions occurred.
-- Option A cancellation is safely managed via cancel_order_with_batch_sync().
DROP TRIGGER IF EXISTS trg_order_coupon_cancellation ON public.orders;
DROP FUNCTION IF EXISTS public.trg_restore_coupon_on_cancellation();

-- ------------------------------------------------------------------------------
-- 4. PAYMENT LEDGER ENHANCEMENTS & PAYMENT EVENTS TABLE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    provider VARCHAR(30) NOT NULL DEFAULT 'razorpay',
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_payment_events_provider_event ON public.payment_events(provider, event_id);

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS payment_type VARCHAR(30) NOT NULL DEFAULT 'full',
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

DO $$
BEGIN
    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
    ALTER TABLE public.payments ADD CONSTRAINT payments_payment_type_check CHECK (payment_type IN ('advance', 'balance', 'full', 'refund', 'adjustment'));

    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
    ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status IN ('requested', 'initiated', 'confirmed', 'failed', 'refund_requested', 'refund_completed', 'refund_failed'));

    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
    ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check CHECK (payment_method IN ('cash', 'upi_manual', 'razorpay'));

    -- Expand orders.payment_status check constraint to support refund lifecycles
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
        CHECK (payment_status IN ('pending', 'partially_paid', 'paid', 'refund_pending', 'partially_refunded', 'refunded'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 5. SEED INITIAL PRICING VERSION (v1: ₹79/kg, 1000g min)
-- ------------------------------------------------------------------------------

DO $$
DECLARE
    v_version_id UUID;
    v_service_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pricing_versions WHERE version_number = 1) THEN
        INSERT INTO public.pricing_versions (
            version_number,
            effective_from,
            status,
            notes
        ) VALUES (
            1,
            timezone('utc', now()),
            'active',
            'Launch pricing version 1: Standard Wash & Fold ₹79.00/kg with 1.0 kg (1000g) minimum billable weight.'
        )
        RETURNING id INTO v_version_id;

        -- Associate with primary service
        SELECT id INTO v_service_id
        FROM public.services
        WHERE is_active = true
        ORDER BY display_order ASC, created_at ASC
        LIMIT 1;

        IF v_service_id IS NOT NULL THEN
            INSERT INTO public.pricing_version_items (
                pricing_version_id,
                service_id,
                price_paise,
                min_weight_grams
            ) VALUES (
                v_version_id,
                v_service_id,
                7900,
                1000
            )
            ON CONFLICT (pricing_version_id, service_id) DO NOTHING;
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. STORED PROCEDURE: validate_coupon (Option A Booking Estimate Support)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.validate_coupon(TEXT, TEXT, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.validate_coupon(TEXT, TEXT, INTEGER, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.validate_coupon(
    p_code TEXT,
    p_customer_phone TEXT,
    p_subtotal_paise INTEGER,
    p_service_id UUID DEFAULT NULL,
    p_is_booking_estimate BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_code TEXT;
    v_clean_phone TEXT;
    v_coupon public.coupons;
    v_calculated_discount INTEGER := 0;
    v_prior_redemptions INTEGER := 0;
    v_prior_delivered INTEGER := 0;
BEGIN
    v_clean_code := upper(trim(p_code));
    v_clean_phone := right(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g'), 10);

    IF v_clean_code IS NULL OR v_clean_code = '' THEN
        RETURN jsonb_build_object('valid', false, 'code', p_code, 'reason', 'Please enter a coupon code.', 'discount_paise', 0);
    END IF;

    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE upper(trim(code)) = v_clean_code
    LIMIT 1;

    IF v_coupon.id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'code', v_clean_code, 'reason', 'Coupon code ''' || v_clean_code || ''' is invalid or does not exist.', 'discount_paise', 0);
    END IF;

    IF NOT v_coupon.is_active THEN
        RETURN jsonb_build_object('valid', false, 'code', v_clean_code, 'reason', 'Coupon ''' || v_clean_code || ''' is currently disabled.', 'discount_paise', 0);
    END IF;

    IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < timezone('utc'::text, now()) THEN
        RETURN jsonb_build_object('valid', false, 'code', v_clean_code, 'reason', 'Coupon ''' || v_clean_code || ''' has expired.', 'discount_paise', 0);
    END IF;

    -- Option A: At preliminary booking time, min_order_paise shortfall reserves the coupon without failing
    IF v_coupon.min_order_paise > 0 AND p_subtotal_paise < v_coupon.min_order_paise THEN
        IF p_is_booking_estimate THEN
            RETURN jsonb_build_object(
                'valid', true,
                'reserved', true,
                'is_booking_estimate', true,
                'code', v_clean_code,
                'discount_type', v_coupon.discount_type,
                'discount_value', v_coupon.discount_value,
                'discount_paise', 0,
                'coupon_id', v_coupon.id,
                'min_order_paise', v_coupon.min_order_paise,
                'message', 'Coupon reserved! Discount applies if final measured bill reaches ₹' || (v_coupon.min_order_paise / 100)::text || '.'
            );
        ELSE
            RETURN jsonb_build_object(
                'valid', false,
                'code', v_clean_code,
                'reason', 'Minimum order subtotal of ₹' || (v_coupon.min_order_paise / 100)::text || ' required for coupon ''' || v_clean_code || '''.',
                'discount_paise', 0,
                'min_order_paise', v_coupon.min_order_paise
            );
        END IF;
    END IF;

    IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.total_redemptions >= v_coupon.max_redemptions THEN
        RETURN jsonb_build_object('valid', false, 'code', v_clean_code, 'reason', 'Coupon ''' || v_clean_code || ''' has reached its overall maximum redemption limit.', 'discount_paise', 0);
    END IF;

    -- Customer-specific usage limit evaluation
    IF auth.uid() IS NOT NULL THEN
        IF v_clean_phone <> '' AND v_coupon.per_customer_limit > 0 THEN
            SELECT count(*) INTO v_prior_redemptions
            FROM public.orders
            WHERE upper(trim(coupon_code)) = v_clean_code
              AND (customer_id = auth.uid() OR right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 10) = v_clean_phone)
              AND order_status <> 'cancelled';

            IF v_prior_redemptions >= v_coupon.per_customer_limit THEN
                RETURN jsonb_build_object('valid', false, 'code', v_clean_code, 'reason', 'You have reached the maximum usage limit (' || v_coupon.per_customer_limit::text || ' order) for coupon ''' || v_clean_code || '''.', 'discount_paise', 0);
            END IF;
        END IF;

        IF v_clean_phone <> '' AND v_coupon.first_time_only THEN
            SELECT count(*) INTO v_prior_delivered
            FROM public.orders
            WHERE (customer_id = auth.uid() OR right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 10) = v_clean_phone)
              AND order_status = 'delivered';

            IF v_prior_delivered > 0 THEN
                RETURN jsonb_build_object('valid', false, 'code', v_clean_code, 'reason', 'Coupon ''' || v_clean_code || ''' is valid only on your first completed order.', 'discount_paise', 0);
            END IF;
        END IF;
    END IF;

    IF v_coupon.applicable_service_ids IS NOT NULL AND array_length(v_coupon.applicable_service_ids, 1) > 0 AND p_service_id IS NOT NULL THEN
        IF NOT (p_service_id = ANY(v_coupon.applicable_service_ids)) THEN
            RETURN jsonb_build_object('valid', false, 'code', v_clean_code, 'reason', 'Coupon ''' || v_clean_code || ''' is not applicable to the selected service.', 'discount_paise', 0);
        END IF;
    END IF;

    -- Calculate Discount Value
    IF v_coupon.discount_type = 'percentage' THEN
        v_calculated_discount := round((p_subtotal_paise * v_coupon.discount_value)::numeric / 100.0);
        IF v_coupon.max_discount_paise IS NOT NULL AND v_calculated_discount > v_coupon.max_discount_paise THEN
            v_calculated_discount := v_coupon.max_discount_paise;
        END IF;
    ELSE
        v_calculated_discount := v_coupon.discount_value;
    END IF;

    IF v_calculated_discount > p_subtotal_paise THEN
        v_calculated_discount := p_subtotal_paise;
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'code', v_clean_code,
        'discount_type', v_coupon.discount_type,
        'discount_value', v_coupon.discount_value,
        'discount_paise', v_calculated_discount,
        'coupon_id', v_coupon.id,
        'min_order_paise', v_coupon.min_order_paise
    );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_coupon(TEXT, TEXT, INTEGER, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, TEXT, INTEGER, UUID, BOOLEAN) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. STORED PROCEDURE: create_booking_idempotent (Option A Reservation Tracking)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_booking_idempotent(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.create_booking_idempotent(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER);

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

    IF p_service_id IS NOT NULL THEN
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

    -- 5. Idempotency Pre-Check (Return existing order without duplicate reservation)
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

    -- 5b. Authoritative Dynamic Service Area Coverage Verification
    -- Checks active service coverage configured by owner in public.service_areas
    -- Falls back to public.business_settings.serviceable_pincodes if no service_areas exist
    IF EXISTS (SELECT 1 FROM public.service_areas) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.service_areas
            WHERE pincode = TRIM(p_pickup_pincode) AND is_active = true
        ) THEN
            RAISE EXCEPTION 'PIN code % is currently outside our service coverage.', TRIM(p_pickup_pincode);
        END IF;
    ELSIF v_settings.serviceable_pincodes IS NOT NULL AND array_length(v_settings.serviceable_pincodes, 1) > 0 THEN
        IF NOT (TRIM(p_pickup_pincode) = ANY(v_settings.serviceable_pincodes)) THEN
            RAISE EXCEPTION 'PIN code % is currently outside our service coverage.', TRIM(p_pickup_pincode);
        END IF;
    END IF;

    -- 6. Pickup Slot Validation & Capacity Locking
    SELECT * INTO v_slot FROM public.pickup_slots WHERE name = TRIM(p_pickup_slot);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pickup slot "%" does not exist in the store schedule.', p_pickup_slot;
    END IF;
    IF NOT v_slot.is_active THEN
        RAISE EXCEPTION 'Pickup slot "%" is currently deactivated and not accepting bookings.', p_pickup_slot;
    END IF;

    v_slot_capacity := COALESCE(v_slot.max_capacity, 15);
    PERFORM pg_advisory_xact_lock(hashtext('slot_capacity_' || p_pickup_date::text || '_' || v_slot.name));

    SELECT COUNT(*) INTO v_current_slot_bookings
    FROM public.orders
    WHERE pickup_date = p_pickup_date AND pickup_slot = v_slot.name AND order_status <> 'cancelled';

    IF v_current_slot_bookings >= v_slot_capacity THEN
        RAISE EXCEPTION 'The pickup slot "%" on % is fully booked (%/%). Please select another slot.',
            v_slot.name, p_pickup_date, v_current_slot_bookings, v_slot_capacity;
    END IF;

    -- 7. Option A Authoritative Coupon Evaluation & Reservation Locking
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

        -- Concurrency Limit Guard: Count confirmed redemptions + active unexpired reservations
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

        IF v_coupon.applicable_service_ids IS NOT NULL AND array_length(v_coupon.applicable_service_ids, 1) > 0 AND v_service_id IS NOT NULL THEN
            IF NOT (v_service_id = ANY(v_coupon.applicable_service_ids)) THEN
                RAISE EXCEPTION 'Coupon "%" is not valid for the selected service.', p_coupon_code;
            END IF;
        END IF;

        -- Option A: Preliminary estimated discount calculation.
        -- If estimated subtotal is below minimum order spend, we reserve the coupon with 0 preliminary discount
        -- rather than aborting the booking!
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

            IF v_authoritative_discount_paise > v_estimated_subtotal THEN
                v_authoritative_discount_paise := v_estimated_subtotal;
            END IF;
        END IF;
    END IF;

    -- 8. Atomic Order Insertion
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

    -- 9. Option A Coupon Reservation Tracking (NO premature increment of total_redemptions)
    IF v_coupon.id IS NOT NULL THEN
        -- Expiry accounts for scheduled pickup date (at least 3 days past pickup date or 7 days from now)
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

REVOKE ALL ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER
) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. STORED PROCEDURE: record_order_payment (Advance & Customer Authorization)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_order_payment(UUID, INTEGER, VARCHAR, VARCHAR, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.record_order_payment(UUID, INTEGER, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.record_order_payment(
    p_order_id UUID,
    p_amount_paise INTEGER,
    p_payment_method VARCHAR(30),
    p_transaction_reference VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key VARCHAR(100) DEFAULT NULL,
    p_payment_type VARCHAR(30) DEFAULT 'full'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_caller_id UUID;
    v_order RECORD;
    v_settings RECORD;
    v_total_paid INTEGER := 0;
    v_new_paid INTEGER := 0;
    v_remaining_due INTEGER := 0;
    v_new_status VARCHAR(30);
    v_payment_id UUID;
    v_existing_payment RECORD;
    v_pending_payment RECORD;
    v_clean_ref VARCHAR(100);
    v_clean_key VARCHAR(100);
    v_clean_type VARCHAR(30);
    v_existing_utr_order UUID;
    v_is_staff BOOLEAN;
    v_is_customer BOOLEAN;
    v_target_status VARCHAR(30);
    v_est_subtotal INTEGER;
    v_req_advance INTEGER;
BEGIN
    v_caller_id := auth.uid();
    v_role := public.current_user_role();

    -- 1. Validate Input Parameters
    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'Order ID is required.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be a positive integer in paise (received: %).', p_amount_paise;
    END IF;

    IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'upi_manual', 'razorpay') THEN
        RAISE EXCEPTION 'Invalid payment method: must be cash, upi_manual, or razorpay (received: %).', p_payment_method;
    END IF;

    v_clean_type := COALESCE(NULLIF(TRIM(p_payment_type), ''), 'full');
    IF v_clean_type NOT IN ('advance', 'balance', 'full') THEN
        RAISE EXCEPTION 'Invalid payment type: must be advance, balance, or full (received: %).', p_payment_type;
    END IF;

    v_clean_ref := NULLIF(TRIM(p_transaction_reference), '');
    v_clean_key := NULLIF(TRIM(p_idempotency_key), '');

    IF p_payment_method = 'upi_manual' AND (v_clean_ref IS NULL OR LENGTH(v_clean_ref) < 4) THEN
        RAISE EXCEPTION 'A valid UPI transaction reference (UTR) is required for manual UPI verification.';
    END IF;

    -- 2. Idempotency Key Evaluation
    IF v_clean_key IS NOT NULL THEN
        SELECT id, order_id, amount_paise, payment_method, transaction_reference, status, created_at
        INTO v_existing_payment
        FROM public.payments
        WHERE idempotency_key = v_clean_key;

        IF FOUND THEN
            IF v_existing_payment.order_id <> p_order_id OR
               v_existing_payment.amount_paise <> p_amount_paise OR
               v_existing_payment.payment_method <> p_payment_method OR
               COALESCE(v_existing_payment.transaction_reference, '') <> COALESCE(v_clean_ref, '') THEN
                RAISE EXCEPTION 'Idempotency conflict: Key % was previously used with different payment parameters.', v_clean_key;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'payment_id', v_existing_payment.id,
                'order_id', p_order_id,
                'amount_paise', v_existing_payment.amount_paise,
                'status', v_existing_payment.status,
                'message', 'Payment was previously recorded successfully.'
            );
        END IF;
    END IF;

    -- 3. Global Duplicate UTR Detection across orders
    IF p_payment_method = 'upi_manual' AND v_clean_ref IS NOT NULL THEN
        SELECT order_id INTO v_existing_utr_order
        FROM public.payments
        WHERE transaction_reference = v_clean_ref AND order_id <> p_order_id
        LIMIT 1;

        IF FOUND THEN
            RAISE EXCEPTION 'Duplicate payment: UPI transaction reference % has already been recorded for another order.', v_clean_ref;
        END IF;
    END IF;

    -- 4. Lock Order Row for Update
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF v_order.order_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot record payment for cancelled order #%.', v_order.order_number;
    END IF;

    -- 5. Role & Customer Ownership Authorization Check
    v_is_staff := (auth.role() = 'service_role' OR v_role IN ('owner', 'manager', 'delivery'));
    v_is_customer := (v_caller_id IS NOT NULL AND v_order.customer_id = v_caller_id);

    IF NOT v_is_staff AND NOT v_is_customer THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers, owners, assigned associates, or the ordering customer can record payments.';
    END IF;

    -- Role-specific guards
    IF v_role = 'delivery' AND auth.role() <> 'service_role' THEN
        IF v_order.assigned_delivery_id IS DISTINCT FROM v_caller_id AND v_order.assigned_pickup_id IS DISTINCT FROM v_caller_id THEN
            RAISE EXCEPTION 'Unauthorized: You are not an assigned associate for Order #%.', v_order.order_number;
        END IF;
        IF v_order.order_status NOT IN ('pickup_assigned', 'ready_for_delivery', 'delivery_assigned', 'out_for_delivery') THEN
            RAISE EXCEPTION 'Unauthorized: Payments can only be collected during active pickup or delivery stages (Current status: %).', v_order.order_status;
        END IF;
    END IF;

    -- Customer cash guard
    IF v_is_customer AND NOT (v_role IN ('owner', 'manager') OR auth.role() = 'service_role') THEN
        IF p_payment_method = 'cash' THEN
            RAISE EXCEPTION 'Unauthorized: Customers cannot record cash payments directly. Cash must be collected and confirmed by store staff.';
        END IF;
    END IF;

    -- 5b. Business Gateway Status Guards
    SELECT * INTO v_settings FROM public.business_settings LIMIT 1;

    IF FOUND AND p_payment_method = 'razorpay' AND NOT COALESCE(v_settings.online_payment_enabled, false) THEN
        IF NOT (v_role IN ('owner', 'manager') OR auth.role() = 'service_role') THEN
            RAISE EXCEPTION 'Online payment via Razorpay is currently disabled by store settings.';
        END IF;
    END IF;

    IF FOUND AND p_payment_method = 'cash' AND NOT COALESCE(v_settings.cod_payment_enabled, true) THEN
        IF NOT (v_role IN ('owner', 'manager') OR auth.role() = 'service_role') THEN
            RAISE EXCEPTION 'Cash on Delivery (COD) is currently disabled by store settings.';
        END IF;
    END IF;

    -- 6. Billing Prerequisite & Advance Payment Accounting
    IF v_clean_type = 'advance' THEN
        -- Advance payments apply before weighing
        IF v_order.total_amount_paise IS NOT NULL THEN
            RAISE EXCEPTION 'Order #% has already been weighed and billed. Record a balance or full payment instead.', v_order.order_number;
        END IF;

        IF FOUND AND NOT COALESCE(v_settings.advance_payment_enabled, false) THEN
            IF NOT (v_role IN ('owner', 'manager') OR auth.role() = 'service_role') THEN
                RAISE EXCEPTION 'Advance payments are currently disabled by store settings.';
            END IF;
        END IF;

        -- Minimum advance validation for non-manager callers
        IF FOUND AND COALESCE(v_settings.advance_payment_enabled, false) AND NOT (v_role IN ('owner', 'manager') OR auth.role() = 'service_role') THEN
            IF v_settings.advance_payment_type = 'fixed' AND COALESCE(v_settings.advance_payment_amount_paise, 0) > 0 THEN
                IF p_amount_paise < v_settings.advance_payment_amount_paise THEN
                    RAISE EXCEPTION 'Advance payment amount (% paise) is less than required store minimum of % paise (₹%).',
                        p_amount_paise, v_settings.advance_payment_amount_paise, (v_settings.advance_payment_amount_paise / 100);
                END IF;
            ELSIF v_settings.advance_payment_type = 'percentage' AND COALESCE(v_settings.advance_payment_percentage, 0) > 0 THEN
                v_est_subtotal := ROUND(COALESCE(v_order.price_per_kg_paise, 7900) * GREATEST(1.0, COALESCE(v_order.min_weight_kg, 1.0)))::integer;
                v_req_advance := ROUND(v_est_subtotal * (v_settings.advance_payment_percentage / 100.0))::integer;
                IF p_amount_paise < v_req_advance THEN
                    RAISE EXCEPTION 'Advance payment amount (% paise) is less than required minimum (% paise, % percentage of estimated bill).',
                        p_amount_paise, v_req_advance, v_settings.advance_payment_percentage;
                END IF;
            END IF;
        END IF;
    ELSE
        -- 'full' or 'balance' payment strictly requires established final bill
        IF v_order.total_amount_paise IS NULL THEN
            RAISE EXCEPTION 'Cannot record % payment: Order #% has not yet been weighed and billed. Record an advance payment instead.',
                v_clean_type, v_order.order_number;
        END IF;

        v_total_paid := COALESCE(v_order.paid_amount_paise, 0);
        v_remaining_due := v_order.total_amount_paise - v_total_paid;

        IF v_remaining_due <= 0 THEN
            RAISE EXCEPTION 'Order #% is already fully paid (Total: % paise, Paid: % paise).',
                v_order.order_number, v_order.total_amount_paise, v_total_paid;
        END IF;

        IF p_amount_paise > v_remaining_due THEN
            RAISE EXCEPTION 'Overpayment rejected: Attempted to pay % paise, but remaining balance on Order #% is % paise.',
                p_amount_paise, v_order.order_number, v_remaining_due;
        END IF;
    END IF;

    -- 7. Determine Target Payment Status based on caller privilege
    IF auth.role() = 'service_role' OR v_role IN ('owner', 'manager') THEN
        v_target_status := 'confirmed';
    ELSIF v_role = 'delivery' THEN
        -- Delivery associates confirm cash or verified UPI on delivery
        v_target_status := 'confirmed';
    ELSIF v_is_customer THEN
        -- Customer manual UPI submissions remain pending until verified by staff
        v_target_status := 'initiated';
    ELSE
        v_target_status := 'initiated';
    END IF;

    -- 8. Ledger Insertion or Pending Payment Confirmation
    IF v_is_staff AND p_payment_method = 'upi_manual' AND v_clean_ref IS NOT NULL THEN
        SELECT * INTO v_pending_payment
        FROM public.payments
        WHERE order_id = p_order_id
          AND transaction_reference = v_clean_ref
          AND status IN ('initiated', 'requested')
        LIMIT 1;

        IF FOUND THEN
            -- Upgrade existing initiated payment to confirmed
            UPDATE public.payments
            SET status = 'confirmed',
                recorded_by = v_caller_id,
                notes = COALESCE(p_notes, notes),
                updated_at = timezone('utc', now())
            WHERE id = v_pending_payment.id
            RETURNING id INTO v_payment_id;
        END IF;
    END IF;

    IF v_payment_id IS NULL THEN
        -- Insert Payment Ledger Entry
        INSERT INTO public.payments (
            order_id,
            amount_paise,
            payment_method,
            payment_type,
            status,
            transaction_reference,
            notes,
            recorded_by,
            idempotency_key,
            created_at,
            updated_at
        ) VALUES (
            p_order_id,
            p_amount_paise,
            p_payment_method,
            v_clean_type,
            v_target_status,
            v_clean_ref,
            NULLIF(TRIM(p_notes), ''),
            v_caller_id,
            v_clean_key,
            timezone('utc', now()),
            timezone('utc', now())
        ) RETURNING id INTO v_payment_id;
    END IF;

    -- 9. Update Order Financial State ONLY IF confirmed
    IF v_target_status = 'confirmed' THEN
        v_new_paid := COALESCE(v_order.paid_amount_paise, 0) + p_amount_paise;
        IF v_order.total_amount_paise IS NOT NULL THEN
            IF v_new_paid >= v_order.total_amount_paise THEN
                v_new_status := 'paid';
            ELSE
                v_new_status := 'partially_paid';
            END IF;
        ELSE
            v_new_status := 'partially_paid';
        END IF;

        UPDATE public.orders
        SET
            paid_amount_paise = v_new_paid,
            payment_status = v_new_status,
            payment_method = p_payment_method,
            updated_at = timezone('utc', now())
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', false,
            'payment_id', v_payment_id,
            'order_id', p_order_id,
            'amount_paise', p_amount_paise,
            'payment_type', v_clean_type,
            'status', 'confirmed',
            'paid_amount_paise', v_new_paid,
            'payment_status', v_new_status,
            'remaining_paise', CASE WHEN v_order.total_amount_paise IS NOT NULL THEN GREATEST(0, v_order.total_amount_paise - v_new_paid) ELSE NULL END
        );
    ELSE
        -- Unverified payment: recorded in payments ledger only; orders financial state remains unchanged
        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', false,
            'payment_id', v_payment_id,
            'order_id', p_order_id,
            'amount_paise', p_amount_paise,
            'payment_type', v_clean_type,
            'status', 'initiated',
            'paid_amount_paise', COALESCE(v_order.paid_amount_paise, 0),
            'payment_status', v_order.payment_status,
            'message', 'Payment submission received and pending verification by store staff.',
            'remaining_paise', CASE WHEN v_order.total_amount_paise IS NOT NULL THEN GREATEST(0, v_order.total_amount_paise - COALESCE(v_order.paid_amount_paise, 0)) ELSE NULL END
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_payment(UUID, INTEGER, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_order_payment(UUID, INTEGER, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. STORED PROCEDURE: record_order_refund (Financial Refund Ledger & Integrity)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_order_refund(UUID, INTEGER, TEXT, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.record_order_refund(
    p_order_id UUID,
    p_amount_paise INTEGER,
    p_reason TEXT,
    p_transaction_reference VARCHAR(100) DEFAULT NULL,
    p_idempotency_key VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_caller_id UUID;
    v_order RECORD;
    v_total_paid INTEGER := 0;
    v_total_refunded INTEGER := 0;
    v_max_refundable INTEGER := 0;
    v_new_paid INTEGER;
    v_new_status VARCHAR(30);
    v_payment_id UUID;
    v_existing_refund RECORD;
    v_clean_ref VARCHAR(100);
    v_clean_key VARCHAR(100);
BEGIN
    v_caller_id := auth.uid();
    v_role := public.current_user_role();

    -- Authorization: strictly store managers and owners
    IF auth.role() <> 'service_role' AND (v_role IS NULL OR v_role NOT IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers and owners can execute refunds.';
    END IF;

    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'Order ID is required.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be a positive integer in paise (received: %).', p_amount_paise;
    END IF;

    v_clean_ref := NULLIF(TRIM(p_transaction_reference), '');
    v_clean_key := NULLIF(TRIM(p_idempotency_key), '');

    -- Idempotency Evaluation
    IF v_clean_key IS NOT NULL THEN
        SELECT id, order_id, amount_paise, payment_type, status, created_at
        INTO v_existing_refund
        FROM public.payments
        WHERE idempotency_key = v_clean_key;

        IF FOUND THEN
            IF v_existing_refund.order_id <> p_order_id OR
               v_existing_refund.amount_paise <> p_amount_paise OR
               v_existing_refund.payment_type <> 'refund' THEN
                RAISE EXCEPTION 'Idempotency conflict: Key % was previously used with different refund parameters.', v_clean_key;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'payment_id', v_existing_refund.id,
                'order_id', p_order_id,
                'amount_paise', v_existing_refund.amount_paise,
                'message', 'Refund was previously recorded successfully.'
            );
        END IF;
    END IF;

    -- Lock Order Row
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- Financial Audit: Calculate total confirmed payments vs completed refunds
    SELECT COALESCE(SUM(amount_paise), 0) INTO v_total_paid
    FROM public.payments
    WHERE order_id = p_order_id
      AND payment_type IN ('advance', 'balance', 'full')
      AND status = 'confirmed';

    SELECT COALESCE(SUM(amount_paise), 0) INTO v_total_refunded
    FROM public.payments
    WHERE order_id = p_order_id
      AND payment_type = 'refund'
      AND status = 'refund_completed';

    v_max_refundable := v_total_paid - v_total_refunded;
    IF v_max_refundable <= 0 THEN
        RAISE EXCEPTION 'Refund rejected: Order #% has no remaining refundable balance (Paid: % paise, Already refunded: % paise).',
            v_order.order_number, v_total_paid, v_total_refunded;
    END IF;

    IF p_amount_paise > v_max_refundable THEN
        RAISE EXCEPTION 'Refund rejected: Attempted to refund % paise, but maximum refundable balance is % paise.',
            p_amount_paise, v_max_refundable;
    END IF;

    -- Insert Refund Transaction
    INSERT INTO public.payments (
        order_id,
        amount_paise,
        payment_method,
        payment_type,
        status,
        transaction_reference,
        notes,
        recorded_by,
        idempotency_key,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        p_amount_paise,
        COALESCE(v_order.payment_method, 'upi_manual'),
        'refund',
        'refund_completed',
        v_clean_ref,
        COALESCE(NULLIF(TRIM(p_reason), ''), 'Customer refund processed'),
        v_caller_id,
        v_clean_key,
        timezone('utc', now()),
        timezone('utc', now())
    ) RETURNING id INTO v_payment_id;

    -- Update Order Paid Balance and Payment Status
    v_new_paid := GREATEST(0, COALESCE(v_order.paid_amount_paise, 0) - p_amount_paise);
    IF v_new_paid = 0 THEN
        v_new_status := 'refunded';
    ELSE
        v_new_status := 'partially_refunded';
    END IF;

    UPDATE public.orders
    SET
        paid_amount_paise = v_new_paid,
        payment_status = v_new_status,
        updated_at = timezone('utc', now())
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'payment_id', v_payment_id,
        'order_id', p_order_id,
        'refunded_amount_paise', p_amount_paise,
        'paid_amount_paise', v_new_paid,
        'payment_status', v_new_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_refund(UUID, INTEGER, TEXT, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_order_refund(UUID, INTEGER, TEXT, VARCHAR, VARCHAR) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 10. STORED PROCEDURE: record_courier_pickup_collection (Doorstep Option A Weighing)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_courier_pickup_collection(UUID, NUMERIC, TEXT);

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
    v_billable_weight NUMERIC(5, 2);
    v_subtotal INTEGER;
    v_discount_paise INTEGER := 0;
    v_total_amount_paise INTEGER;
    v_res RECORD;
    v_clean_coupon TEXT;
BEGIN
    -- Authorization
    v_caller_role := public.current_user_role();
    IF auth.role() <> 'service_role' AND (v_caller_role IS NULL OR v_caller_role NOT IN ('delivery', 'manager', 'owner')) THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned delivery associates, managers, and owners can record pickup collection.';
    END IF;

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

    IF p_measured_weight IS NULL OR p_measured_weight < 0.10 OR p_measured_weight > 250.00 THEN
        RAISE EXCEPTION 'Measured weight % kg out of valid range (0.10 - 250.00 kg).', p_measured_weight;
    END IF;

    -- Billable weight calculation
    v_billable_weight := GREATEST(p_measured_weight, COALESCE(v_order.min_weight_kg, 1.0));

    -- Subtotal calculation based on pricing unit
    IF v_order.pricing_unit = 'per_piece' THEN
        v_subtotal := ROUND(v_billable_weight) * v_order.price_per_kg_paise;
    ELSIF v_order.pricing_unit = 'per_load' THEN
        v_subtotal := GREATEST(1, ROUND(v_billable_weight)) * v_order.price_per_kg_paise;
    ELSIF v_order.pricing_unit = 'per_order' THEN
        v_subtotal := v_order.price_per_kg_paise;
    ELSE
        v_subtotal := ROUND(v_billable_weight * v_order.price_per_kg_paise);
    END IF;

    -- Option A: Final Scale Coupon Evaluation
    v_clean_coupon := NULLIF(UPPER(TRIM(COALESCE(v_order.coupon_code, ''))), '');
    IF v_clean_coupon IS NOT NULL THEN
        SELECT cr.id AS res_id, cr.status AS res_status, c.*
        INTO v_res
        FROM public.coupons c
        LEFT JOIN public.coupon_reservations cr ON cr.coupon_id = c.id AND cr.order_id = v_order.id
        WHERE UPPER(TRIM(c.code)) = v_clean_coupon
        LIMIT 1;

        IF v_res.id IS NOT NULL THEN
            IF v_res.min_order_paise > 0 AND v_subtotal < v_res.min_order_paise THEN
                -- Does not qualify under Option A: retain booking without discount
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
                    v_discount_paise := ROUND((v_subtotal * v_res.discount_value)::NUMERIC / 100.0);
                    IF v_res.max_discount_paise IS NOT NULL AND v_discount_paise > v_res.max_discount_paise THEN
                        v_discount_paise := v_res.max_discount_paise;
                    END IF;
                ELSE
                    v_discount_paise := v_res.discount_value;
                END IF;

                IF v_discount_paise > v_subtotal THEN
                    v_discount_paise := v_subtotal;
                END IF;

                -- Record coupon redemption
                INSERT INTO public.coupon_redemptions (
                    coupon_id, order_id, user_id, discount_paise, subtotal_paise, final_paise, redeemed_at
                ) VALUES (
                    v_res.id, v_order.id, v_order.customer_id, v_discount_paise, v_subtotal,
                    GREATEST(0, v_subtotal - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0)),
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

                -- Increment total redemptions atomically
                UPDATE public.coupons
                SET total_redemptions = total_redemptions + 1, updated_at = timezone('utc', now())
                WHERE id = v_res.id;
            END IF;
        END IF;
    END IF;

    v_total_amount_paise := GREATEST(0, v_subtotal - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0));

    -- Downward Paid-Amount Guard
    IF v_order.paid_amount_paise > 0 AND v_total_amount_paise < v_order.paid_amount_paise THEN
        RAISE EXCEPTION 'Downward re-weighing rejected: Recalculated total (₹%) is less than already paid amount (₹%). Modifications below paid amount require formal refund processing.',
            (v_total_amount_paise / 100.0)::numeric(10, 2),
            (v_order.paid_amount_paise / 100.0)::numeric(10, 2);
    END IF;

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

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'measured_weight', p_measured_weight,
        'billable_weight', v_billable_weight,
        'discount_paise', v_discount_paise,
        'total_amount_paise', v_total_amount_paise,
        'order_status', 'collected'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_courier_pickup_collection(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_courier_pickup_collection(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 11. STORED PROCEDURE: record_store_intake_weight (Store Intake Option A Weighing)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_store_intake_weight(UUID, NUMERIC, TEXT);

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
    v_billable_weight NUMERIC(5, 2);
    v_subtotal INTEGER;
    v_discount_paise INTEGER := 0;
    v_total_amount_paise INTEGER;
    v_res RECORD;
    v_clean_coupon TEXT;
    v_new_status VARCHAR;
BEGIN
    v_caller_role := public.current_user_role();
    IF auth.role() <> 'service_role' AND (v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager')) THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers and owners can record store intake weighing.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF v_order.order_status IN ('delivered', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot record store intake weight for order #% in status "%".', v_order.order_number, v_order.order_status;
    END IF;

    IF p_measured_weight IS NULL OR p_measured_weight < 0.10 OR p_measured_weight > 250.00 THEN
        RAISE EXCEPTION 'Measured weight % kg out of valid range (0.10 - 250.00 kg).', p_measured_weight;
    END IF;

    -- Billable weight calculation (using service min_weight_kg)
    v_billable_weight := GREATEST(p_measured_weight, COALESCE(v_order.min_weight_kg, 1.0));

    -- Subtotal calculation based on pricing unit
    IF v_order.pricing_unit = 'per_piece' THEN
        v_subtotal := ROUND(v_billable_weight) * v_order.price_per_kg_paise;
    ELSIF v_order.pricing_unit = 'per_load' THEN
        v_subtotal := GREATEST(1, ROUND(v_billable_weight)) * v_order.price_per_kg_paise;
    ELSIF v_order.pricing_unit = 'per_order' THEN
        v_subtotal := v_order.price_per_kg_paise;
    ELSE
        v_subtotal := ROUND(v_billable_weight * v_order.price_per_kg_paise);
    END IF;

    -- Option A: Final Scale Coupon Evaluation
    v_clean_coupon := NULLIF(UPPER(TRIM(COALESCE(v_order.coupon_code, ''))), '');
    IF v_clean_coupon IS NOT NULL THEN
        SELECT cr.id AS res_id, cr.status AS res_status, c.*
        INTO v_res
        FROM public.coupons c
        LEFT JOIN public.coupon_reservations cr ON cr.coupon_id = c.id AND cr.order_id = v_order.id
        WHERE UPPER(TRIM(c.code)) = v_clean_coupon
        LIMIT 1;

        IF v_res.id IS NOT NULL THEN
            IF v_res.min_order_paise > 0 AND v_subtotal < v_res.min_order_paise THEN
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
                    v_discount_paise := ROUND((v_subtotal * v_res.discount_value)::NUMERIC / 100.0);
                    IF v_res.max_discount_paise IS NOT NULL AND v_discount_paise > v_res.max_discount_paise THEN
                        v_discount_paise := v_res.max_discount_paise;
                    END IF;
                ELSE
                    v_discount_paise := v_res.discount_value;
                END IF;

                IF v_discount_paise > v_subtotal THEN
                    v_discount_paise := v_subtotal;
                END IF;

                -- Record coupon redemption
                INSERT INTO public.coupon_redemptions (
                    coupon_id, order_id, user_id, discount_paise, subtotal_paise, final_paise, redeemed_at
                ) VALUES (
                    v_res.id, v_order.id, v_order.customer_id, v_discount_paise, v_subtotal,
                    GREATEST(0, v_subtotal - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0)),
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

                -- Increment total redemptions atomically
                UPDATE public.coupons
                SET total_redemptions = total_redemptions + 1, updated_at = timezone('utc', now())
                WHERE id = v_res.id;
            END IF;
        END IF;
    END IF;

    v_total_amount_paise := GREATEST(0, v_subtotal - v_discount_paise + COALESCE(v_order.delivery_charge_paise, 0));

    -- Downward Paid-Amount Guard
    IF v_order.paid_amount_paise > 0 AND v_total_amount_paise < v_order.paid_amount_paise THEN
        RAISE EXCEPTION 'Downward re-weighing rejected: Recalculated total (₹%) is less than already paid amount (₹%). Modifications below paid amount require formal refund processing.',
            (v_total_amount_paise / 100.0)::numeric(10, 2),
            (v_order.paid_amount_paise / 100.0)::numeric(10, 2);
    END IF;

    -- Determine new order status
    IF v_order.order_status IN ('collected', 'pickup_assigned', 'booked') THEN
        v_new_status := 'weighed';
    ELSE
        v_new_status := v_order.order_status;
    END IF;

    UPDATE public.orders SET
        order_status = v_new_status,
        measured_weight = p_measured_weight,
        billable_weight = v_billable_weight,
        discount_paise = v_discount_paise,
        total_amount_paise = v_total_amount_paise,
        weighed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'measured_weight', p_measured_weight,
        'billable_weight', v_billable_weight,
        'discount_paise', v_discount_paise,
        'total_amount_paise', v_total_amount_paise,
        'order_status', v_new_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_store_intake_weight(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_store_intake_weight(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 12. STORED PROCEDURE: cancel_order_with_batch_sync (Option A Release & Liability)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.cancel_order_with_batch_sync(UUID, TEXT);

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
    v_clean_reason TEXT;
    v_coupon_id UUID;
BEGIN
    v_clean_reason := NULLIF(TRIM(p_cancellation_reason), '');
    IF v_clean_reason IS NULL THEN
        RAISE EXCEPTION 'A cancellation reason is required.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- Authorization
    v_caller_role := public.current_user_role();
    IF auth.role() = 'service_role' OR v_caller_role IN ('manager', 'owner') THEN
        NULL;
    ELSIF v_order.customer_id = auth.uid() THEN
        IF v_order.order_status NOT IN ('booked', 'pickup_assigned') THEN
            RAISE EXCEPTION 'Order #% cannot be cancelled by customer after collection has commenced. Please contact store support.',
                v_order.order_number;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unauthorized: You do not have permission to cancel this order.';
    END IF;

    IF v_order.order_status = 'cancelled' THEN
        RAISE EXCEPTION 'Order #% is already cancelled.', v_order.order_number;
    ELSIF v_order.order_status = 'delivered' THEN
        RAISE EXCEPTION 'Delivered orders cannot be cancelled.';
    END IF;

    -- Release Coupon Reservation
    UPDATE public.coupon_reservations
    SET status = 'cancelled', updated_at = timezone('utc', now())
    WHERE order_id = p_order_id AND status = 'reserved';

    -- If coupon was already redeemed, revert redemptions
    SELECT coupon_id INTO v_coupon_id FROM public.coupon_redemptions WHERE order_id = p_order_id;
    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.coupons
        SET total_redemptions = GREATEST(0, total_redemptions - 1), updated_at = timezone('utc', now())
        WHERE id = v_coupon_id;

        DELETE FROM public.coupon_redemptions WHERE order_id = p_order_id;
    END IF;

    -- Financial Liability Tracking: If order had confirmed payments, record refund liability
    IF v_order.paid_amount_paise > 0 THEN
        INSERT INTO public.payments (
            order_id,
            amount_paise,
            payment_method,
            payment_type,
            status,
            notes,
            recorded_by,
            created_at,
            updated_at
        ) VALUES (
            p_order_id,
            v_order.paid_amount_paise,
            COALESCE(v_order.payment_method, 'upi_manual'),
            'refund',
            'refund_requested',
            'Refund liability recorded upon order cancellation: ' || v_clean_reason,
            auth.uid(),
            timezone('utc', now()),
            timezone('utc', now())
        );

        UPDATE public.orders SET
            order_status = 'cancelled',
            payment_status = 'refund_pending',
            cancellation_reason = v_clean_reason,
            updated_at = timezone('utc', now())
        WHERE id = p_order_id;
    ELSE
        UPDATE public.orders SET
            order_status = 'cancelled',
            cancellation_reason = v_clean_reason,
            updated_at = timezone('utc', now())
        WHERE id = p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_status', 'cancelled',
        'cancellation_reason', v_clean_reason,
        'refund_pending', v_order.paid_amount_paise > 0
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_with_batch_sync(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order_with_batch_sync(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 13. HARDENED TRIGGER FUNCTION: enforce_order_workflow_integrity
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_order_workflow_integrity()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
    effective_weight NUMERIC(5, 2);
    v_pricing_unit TEXT;
    v_unit_price INTEGER;
    v_delivery_fee INTEGER;
    v_subtotal INTEGER;
    v_effective_discount INTEGER;
    v_expected_total INTEGER;
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    user_role := public.current_user_role();

    -- Authorization
    IF NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' AND OLD.customer_id = auth.uid() THEN
        NULL;
    ELSIF user_role IS NULL OR user_role NOT IN ('owner', 'manager', 'delivery') THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers, owners, and assigned associates can update orders (Caller role: %).', COALESCE(user_role, 'unauthenticated');
    END IF;

    -- Terminal State Protection
    IF OLD.order_status = 'delivered' AND NEW.order_status IS DISTINCT FROM 'delivered' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Delivered orders are finalized and cannot change status.';
    END IF;
    IF OLD.order_status = 'cancelled' AND NEW.order_status IS DISTINCT FROM 'cancelled' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Cancelled orders cannot be reopened.';
    END IF;

    -- Universal Dispatch Requirement
    IF NEW.order_status = 'delivered' AND OLD.order_status != 'out_for_delivery' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Order must be dispatched to out_for_delivery before delivery completion (Current status: %).', OLD.order_status;
    END IF;

    -- Universal Payment Integrity Check
    IF NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
       NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
       NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN

        IF NEW.paid_amount_paise < OLD.paid_amount_paise THEN
            -- Downward decrease permitted ONLY when matching authentic completed refund exists
            IF NOT EXISTS (
                SELECT 1 FROM public.payments p
                WHERE p.order_id = NEW.id
                  AND p.payment_type = 'refund'
                  AND p.status = 'refund_completed'
                  AND p.amount_paise = (OLD.paid_amount_paise - NEW.paid_amount_paise)
            ) THEN
                RAISE EXCEPTION 'Security violation: Paid amount on orders cannot decrease without an authentic completed refund record (% -> %).',
                    OLD.paid_amount_paise, NEW.paid_amount_paise;
            END IF;
        ELSIF NEW.paid_amount_paise > OLD.paid_amount_paise THEN
            -- Upward increase must have a matching authentic confirmed payment record
            IF NOT EXISTS (
                SELECT 1 FROM public.payments p
                WHERE p.order_id = NEW.id
                  AND p.amount_paise = (NEW.paid_amount_paise - OLD.paid_amount_paise)
                  AND p.status = 'confirmed'
            ) THEN
                RAISE EXCEPTION 'Security violation: Direct payment field modification is prohibited. Payments must be processed through record_order_payment().';
            END IF;
        END IF;

        IF NEW.total_amount_paise IS NOT NULL AND NEW.paid_amount_paise > NEW.total_amount_paise THEN
            RAISE EXCEPTION 'Security violation: Paid amount (% paise) cannot exceed bill total (% paise).',
                NEW.paid_amount_paise, NEW.total_amount_paise;
        END IF;
    END IF;

    -- Delivery associate guards
    IF user_role = 'delivery' THEN
        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.order_number IS DISTINCT FROM OLD.order_number OR NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot change order identity.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_enforce_order_workflow ON public.orders;
CREATE TRIGGER trigger_enforce_order_workflow
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_order_workflow_integrity();

-- ------------------------------------------------------------------------------
-- 14. RPC: get_active_pricing
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_active_pricing();

CREATE OR REPLACE FUNCTION public.get_active_pricing()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pricing JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'pricing_version_id', pv.id,
            'version_number', pv.version_number,
            'service_id', s.id,
            'service_name', s.name,
            'pricing_unit', s.pricing_unit,
            'price_paise', pvi.price_paise,
            'min_weight_grams', pvi.min_weight_grams,
            'min_weight_kg', ROUND(pvi.min_weight_grams::numeric / 1000.0, 2)
        )
    ) INTO v_pricing
    FROM public.pricing_versions pv
    JOIN public.pricing_version_items pvi ON pvi.pricing_version_id = pv.id
    JOIN public.services s ON s.id = pvi.service_id
    WHERE pv.status = 'active' AND s.is_active = true;

    RETURN COALESCE(v_pricing, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_pricing() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 14b. RPC: activate_pricing_version
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.activate_pricing_version(UUID);

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
            updated_at = timezone('utc', now());
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Pricing version %s activated successfully.', v_target.version_number),
        'version_id', p_version_id,
        'version_number', v_target.version_number
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_pricing_version(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 15. ROW-LEVEL SECURITY & PERMISSIONS
-- ------------------------------------------------------------------------------

ALTER TABLE public.pricing_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_version_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active pricing versions" ON public.pricing_versions;
CREATE POLICY "Public can view active pricing versions" ON public.pricing_versions
    FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "Staff can manage pricing versions" ON public.pricing_versions;
CREATE POLICY "Staff can manage pricing versions" ON public.pricing_versions
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'manager'))
    );

DROP POLICY IF EXISTS "Public can view pricing version items" ON public.pricing_version_items;
CREATE POLICY "Public can view pricing version items" ON public.pricing_version_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.pricing_versions pv WHERE pv.id = pricing_version_id AND pv.status = 'active')
    );

DROP POLICY IF EXISTS "Users can view their own coupon reservations" ON public.coupon_reservations;
CREATE POLICY "Users can view their own coupon reservations" ON public.coupon_reservations
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff can view all coupon reservations" ON public.coupon_reservations;
CREATE POLICY "Staff can view all coupon reservations" ON public.coupon_reservations
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'manager'))
    );

GRANT SELECT ON public.pricing_versions TO anon, authenticated;
GRANT SELECT ON public.pricing_version_items TO anon, authenticated;
GRANT ALL ON public.pricing_versions TO authenticated;
GRANT ALL ON public.pricing_version_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coupon_reservations TO authenticated;
GRANT SELECT ON public.coupon_redemptions TO authenticated;

-- ------------------------------------------------------------------------------
-- 15. SECURE STAFF DEBOARDING & ROLE ISOLATION RPC (Defect 1 & Defect 2 Remediation)
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON public.profiles(role, is_active) WHERE deleted_at IS NULL;

-- Harden current_user_role to require deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS VARCHAR AS $$
    SELECT role FROM public.profiles 
    WHERE id = auth.uid() 
      AND COALESCE(is_active, true) = true
      AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon, service_role;

-- Enhanced delete_staff_profile supporting clean deboarding
CREATE OR REPLACE FUNCTION public.delete_staff_profile(
    p_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_staff RECORD;
    v_remaining_owners INT;
    v_has_audit_records BOOLEAN := false;
BEGIN
    -- A. Authentication Check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Authentication required: You must be signed in to perform this operation.';
    END IF;

    -- B. Authorization Check (Owner or service_role Only)
    IF auth.role() <> 'service_role' THEN
        v_caller_role := public.current_user_role();
        IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
            RAISE EXCEPTION 'Access denied. Only the business owner is authorized to delete employee accounts.';
        END IF;
    END IF;

    -- C. Concurrency Serialization
    PERFORM pg_advisory_xact_lock(hashtext('superwash_owner_lifecycle_lock'));

    -- D. Retrieve and Lock Target Staff Profile
    SELECT * INTO v_staff 
    FROM public.profiles 
    WHERE id = p_staff_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member profile not found.';
    END IF;

    -- E. Permanent Primary Owner Protection
    IF LOWER(TRIM(v_staff.email)) = 'superwashexprez@gmail.com' THEN
        RAISE EXCEPTION 'Access denied. The permanent primary owner account (superwashexprez@gmail.com) cannot be deleted.';
    END IF;

    -- F. Prevent Owner from Deleting Own Authenticated Profile
    IF v_caller_id = p_staff_id THEN
        RAISE EXCEPTION 'You cannot delete your own authenticated owner account.';
    END IF;

    -- G. Concurrency-Safe Last Active Owner Protection
    IF v_staff.role = 'owner' THEN
        SELECT COUNT(*) INTO v_remaining_owners
        FROM public.profiles
        WHERE role = 'owner' AND is_active = true AND deleted_at IS NULL AND id != p_staff_id;

        IF v_remaining_owners < 1 THEN
            RAISE EXCEPTION 'Access denied. Cannot delete the only remaining active business owner.';
        END IF;
    END IF;

    -- H. Comprehensive Historical Audit & Referential Integrity Check
    SELECT EXISTS (
        SELECT 1 FROM public.orders
        WHERE assigned_pickup_id = p_staff_id
           OR assigned_delivery_id = p_staff_id
           OR pickup_weighed_by = p_staff_id
           OR customer_id = p_staff_id
        UNION ALL
        SELECT 1 FROM public.payments WHERE recorded_by = p_staff_id
        UNION ALL
        SELECT 1 FROM public.order_status_history WHERE changed_by = p_staff_id
        UNION ALL
        SELECT 1 FROM public.weight_change_history WHERE changed_by = p_staff_id
        UNION ALL
        SELECT 1 FROM public.order_feedback WHERE reviewed_by = p_staff_id OR customer_id = p_staff_id
        UNION ALL
        SELECT 1 FROM public.staff_pre_registrations WHERE created_by = p_staff_id
        UNION ALL
        SELECT 1 FROM public.customer_addresses WHERE user_id = p_staff_id
    ) INTO v_has_audit_records;

    -- Clean up any pending staff pre-registrations matching this email
    IF v_staff.email IS NOT NULL AND TRIM(v_staff.email) <> '' THEN
        DELETE FROM public.staff_pre_registrations WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_staff.email));
    END IF;

    -- I. Safe Deboarding for Staff with Historical Records
    IF v_has_audit_records THEN
        UPDATE public.profiles
        SET is_active = false,
            deleted_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        WHERE id = p_staff_id;

        RETURN jsonb_build_object(
            'success', true,
            'deactivated_instead', true,
            'message', format('Staff member %s has past operational or order records. To preserve audit history and referential integrity, their account has been safely deboarded and removed from active staff.', v_staff.full_name)
        );
    END IF;

    -- J. Permanent Deletion for Unassigned Staff
    DELETE FROM public.profiles WHERE id = p_staff_id;

    RETURN jsonb_build_object(
        'success', true,
        'deactivated_instead', false,
        'message', format('Staff account for %s has been successfully removed.', v_staff.full_name)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_staff_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_staff_profile(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 15b. DYNAMIC SERVICE AREA COVERAGE VALIDATION TRIGGER (DIRECT API/INSERT PROTECTION)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_order_serviceability()
RETURNS TRIGGER AS $$
DECLARE
    v_clean_pin TEXT;
    v_settings public.business_settings;
BEGIN
    -- Only enforce serviceability checks for initial order bookings
    IF NEW.order_status = 'booked' AND NEW.pickup_pincode IS NOT NULL THEN
        v_clean_pin := TRIM(NEW.pickup_pincode);

        -- Format validation: 6-digit Indian PIN code (cannot start with 0)
        IF v_clean_pin !~ '^[1-9][0-9]{5}$' THEN
            RAISE EXCEPTION 'Please provide a valid 6-digit Indian PIN code.';
        END IF;

        -- Authoritative service coverage check:
        -- 1. Check if configured in active service_areas
        -- 2. If no service_areas records exist, fall back to business_settings.serviceable_pincodes
        IF EXISTS (SELECT 1 FROM public.service_areas) THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.service_areas
                WHERE pincode = v_clean_pin AND is_active = true
            ) THEN
                RAISE EXCEPTION 'PIN code % is currently outside our service coverage.', v_clean_pin;
            END IF;
        ELSE
            SELECT * INTO v_settings FROM public.business_settings LIMIT 1;
            IF v_settings.serviceable_pincodes IS NOT NULL AND array_length(v_settings.serviceable_pincodes, 1) > 0 THEN
                IF NOT (v_clean_pin = ANY(v_settings.serviceable_pincodes)) THEN
                    RAISE EXCEPTION 'PIN code % is currently outside our service coverage.', v_clean_pin;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_order_serviceability ON public.orders;
CREATE TRIGGER trg_check_order_serviceability
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.check_order_serviceability();

-- ------------------------------------------------------------------------------
-- 16. REFRESH POSTGREST SCHEMA CACHE
-- ------------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
