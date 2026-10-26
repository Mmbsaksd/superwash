-- ==============================================================================
-- SuperWash Exprez — Atomic Idempotent Booking Creation RPC & Partial Index
-- Migration: 20261026200000_booking_idempotency_rpc.sql
-- ==============================================================================
-- STATUS: DRAFT ONLY — NOT APPLIED TO LOCAL, STAGING, OR PRODUCTION SUPABASE
-- ==============================================================================
-- Architectural Purpose:
-- 1. Schema Enhancement:
--    Adds nullable `client_submission_id` and `client_submission_fingerprint` columns
--    to `public.orders`.
-- 2. Partial Unique Index:
--    Enforces unique constraint on non-null `client_submission_id`.
--    Existing historical orders with NULL `client_submission_id` remain valid and unaffected.
-- 3. Atomic Idempotency RPC (`public.create_booking_idempotent`):
--    - Runs with SECURITY DEFINER and search_path = public, pg_temp.
--    - Authenticates the caller via auth.uid() and strictly binds customer_id to auth.uid().
--    - Strict Ownership: Existing orders are returned ONLY if customer_id matches auth.uid().
--      No staff exception is permitted; collisions across different users raise a security exception.
--    - Server-Side Payload Integrity: Computes a deterministic MD5 fingerprint on the server
--      and verifies that retries match the original booking parameters. Conflicting parameter
--      reuse is strictly rejected.
--    - Pickup Slot Validation: Verifies that the slot exists, is active, and has valid capacity (> 0).
--    - Concurrent Capacity Enforcement: Uses transaction-level advisory lock
--      pg_advisory_xact_lock(hashtext('slot_capacity:' || date || ':' || slot)) to serialize
--      capacity evaluation and order insertion for the same slot on the same date. This guarantees
--      no race condition can exceed max_capacity.
--    - Preserves existing public.set_order_number() trigger and order_number_seq progression.
-- 4. Least-Privilege Role Permissions:
--    Revokes execution from PUBLIC and anon. Grants execution strictly to authenticated and service_role.
-- ==============================================================================

BEGIN;

-- 1. Add nullable client_submission_id and client_submission_fingerprint to public.orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS client_submission_id TEXT,
ADD COLUMN IF NOT EXISTS client_submission_fingerprint TEXT;

-- 2. Create partial unique index on non-null client_submission_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_submission_id
ON public.orders (client_submission_id)
WHERE client_submission_id IS NOT NULL;

COMMENT ON COLUMN public.orders.client_submission_id IS
'Client-generated UUID idempotency key ensuring deduplication across network timeouts, refreshes, and retries.';

COMMENT ON COLUMN public.orders.client_submission_fingerprint IS
'Server-computed MD5 fingerprint of core booking parameters to prevent idempotency key reuse with modified details.';

-- 3. Define Atomic Idempotent Booking Creation RPC
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
        v_unit_price_paise := COALESCE(v_service.unit_price_paise, 8000);
        v_min_weight_kg := COALESCE(v_service.min_weight_kg, 3.00);
    ELSE
        -- Fallback to default active service
        SELECT * INTO v_service
        FROM public.services
        WHERE is_active = true
        ORDER BY display_order ASC, created_at ASC
        LIMIT 1;

        IF FOUND THEN
            v_service_id := v_service.id;
            v_service_name := v_service.name;
            v_pricing_unit := v_service.pricing_unit;
            v_unit_price_paise := COALESCE(v_service.unit_price_paise, 8000);
            v_min_weight_kg := COALESCE(v_service.min_weight_kg, 3.00);
        ELSE
            v_service_id := NULL;
            v_service_name := 'Wash & Fold (Normal)';
            v_pricing_unit := 'per_kg';
            v_unit_price_paise := COALESCE(v_settings.price_per_kg_paise, 8000);
            v_min_weight_kg := COALESCE(v_settings.min_weight_kg, 3.00);
        END IF;
    END IF;

    -- Compute deterministic server-side payload fingerprint across all relevant booking fields:
    -- customer_phone, customer_name, pickup_address, pickup_landmark, pickup_pincode,
    -- pickup_date, pickup_slot, service_id, pickup_latitude, pickup_longitude, notes
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
        LOWER(TRIM(COALESCE(p_notes, '')))
    );

    -- 5. Check for existing order by submission ID (Idempotency Pre-Check)
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE client_submission_id = p_client_submission_id;

    IF FOUND THEN
        -- Strict ownership check: Must belong strictly to the authenticated caller
        IF v_existing_order.customer_id IS DISTINCT FROM v_caller_id THEN
            RAISE EXCEPTION 'Security violation: Submission ID conflict detected.';
        END IF;

        -- Payload consistency check: Reject reuse of submission ID with different booking details
        IF (v_existing_order.client_submission_fingerprint IS NOT NULL
            AND v_existing_order.client_submission_fingerprint <> v_payload_fingerprint)
           OR v_existing_order.customer_phone <> v_clean_phone
           OR LOWER(TRIM(COALESCE(v_existing_order.customer_name, ''))) <> LOWER(TRIM(COALESCE(p_customer_name, '')))
           OR v_existing_order.pickup_date <> p_pickup_date
           OR LOWER(TRIM(COALESCE(v_existing_order.pickup_slot, ''))) <> LOWER(TRIM(COALESCE(p_pickup_slot, '')))
           OR TRIM(COALESCE(v_existing_order.pickup_pincode, '')) <> TRIM(COALESCE(p_pickup_pincode, ''))
           OR LOWER(TRIM(COALESCE(v_existing_order.pickup_address, ''))) <> LOWER(TRIM(COALESCE(p_pickup_address, '')))
           OR LOWER(TRIM(COALESCE(v_existing_order.pickup_landmark, ''))) <> LOWER(TRIM(COALESCE(p_pickup_landmark, '')))
           OR LOWER(TRIM(COALESCE(v_existing_order.notes, ''))) <> LOWER(TRIM(COALESCE(p_notes, '')))
           OR (v_service_id IS NOT NULL AND v_existing_order.service_id IS DISTINCT FROM v_service_id)
           OR (p_pickup_latitude IS NOT NULL AND (v_existing_order.pickup_latitude IS NULL OR ROUND(v_existing_order.pickup_latitude, 6) <> ROUND(p_pickup_latitude, 6)))
           OR (p_pickup_longitude IS NOT NULL AND (v_existing_order.pickup_longitude IS NULL OR ROUND(v_existing_order.pickup_longitude, 6) <> ROUND(p_pickup_longitude, 6))) THEN
            RAISE EXCEPTION 'Idempotency conflict: client_submission_id "%" was already used for a booking with different details.', p_client_submission_id;
        END IF;

        -- Return committed order without performing duplicate insertion
        RETURN v_existing_order;
    END IF;

    -- 6. Pickup Slot Validation (Must exist, be active, and have valid capacity)
    SELECT * INTO v_slot
    FROM public.pickup_slots
    WHERE name = TRIM(p_pickup_slot);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pickup slot "%" does not exist in the store schedule.', p_pickup_slot;
    END IF;

    IF NOT v_slot.is_active THEN
        RAISE EXCEPTION 'Pickup slot "%" is currently deactivated and not accepting bookings.', p_pickup_slot;
    END IF;

    IF v_slot.max_capacity IS NULL OR v_slot.max_capacity <= 0 THEN
        RAISE EXCEPTION 'Configuration error: Pickup slot "%" has invalid or unconfigured capacity.', p_pickup_slot;
    END IF;

    v_slot_capacity := v_slot.max_capacity;

    -- 7. Transaction-Level Advisory Lock for Concurrency-Safe Slot Capacity Enforcement
    -- Serializes bookings attempting to reserve the same slot on the same date.
    -- Automatically released when this transaction commits or rolls back.
    PERFORM pg_advisory_xact_lock(hashtext('slot_capacity:' || p_pickup_date::text || ':' || LOWER(TRIM(p_pickup_slot))));

    -- Post-lock recheck: If a concurrent request with the same submission ID committed while
    -- this transaction was queued for the advisory lock, resolve to that committed order
    -- BEFORE checking capacity so that retries on fully-booked slots succeed idempotently.
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE client_submission_id = p_client_submission_id;

    IF FOUND THEN
        -- Strict ownership check: Must belong strictly to the authenticated caller
        IF v_existing_order.customer_id IS DISTINCT FROM v_caller_id THEN
            RAISE EXCEPTION 'Security violation: Submission ID conflict detected.';
        END IF;

        -- Payload consistency check
        IF (v_existing_order.client_submission_fingerprint IS NOT NULL
            AND v_existing_order.client_submission_fingerprint <> v_payload_fingerprint)
           OR v_existing_order.customer_phone <> v_clean_phone
           OR LOWER(TRIM(COALESCE(v_existing_order.customer_name, ''))) <> LOWER(TRIM(COALESCE(p_customer_name, '')))
           OR v_existing_order.pickup_date <> p_pickup_date
           OR LOWER(TRIM(COALESCE(v_existing_order.pickup_slot, ''))) <> LOWER(TRIM(COALESCE(p_pickup_slot, '')))
           OR TRIM(COALESCE(v_existing_order.pickup_pincode, '')) <> TRIM(COALESCE(p_pickup_pincode, ''))
           OR LOWER(TRIM(COALESCE(v_existing_order.pickup_address, ''))) <> LOWER(TRIM(COALESCE(p_pickup_address, '')))
           OR LOWER(TRIM(COALESCE(v_existing_order.pickup_landmark, ''))) <> LOWER(TRIM(COALESCE(p_pickup_landmark, '')))
           OR LOWER(TRIM(COALESCE(v_existing_order.notes, ''))) <> LOWER(TRIM(COALESCE(p_notes, '')))
           OR (v_service_id IS NOT NULL AND v_existing_order.service_id IS DISTINCT FROM v_service_id)
           OR (p_pickup_latitude IS NOT NULL AND (v_existing_order.pickup_latitude IS NULL OR ROUND(v_existing_order.pickup_latitude, 6) <> ROUND(p_pickup_latitude, 6)))
           OR (p_pickup_longitude IS NOT NULL AND (v_existing_order.pickup_longitude IS NULL OR ROUND(v_existing_order.pickup_longitude, 6) <> ROUND(p_pickup_longitude, 6))) THEN
            RAISE EXCEPTION 'Idempotency conflict: client_submission_id "%" was already used for a booking with different details.', p_client_submission_id;
        END IF;

        RETURN v_existing_order;
    END IF;

    -- Inside the lock: authoritatively count non-cancelled bookings
    SELECT COUNT(*) INTO v_current_slot_bookings
    FROM public.orders
    WHERE pickup_date = p_pickup_date
      AND pickup_slot = v_slot.name
      AND order_status <> 'cancelled';

    IF v_current_slot_bookings >= v_slot_capacity THEN
        RAISE EXCEPTION 'The pickup slot "%" on % is fully booked (%/%). Please select another slot.',
            v_slot.name, p_pickup_date, v_current_slot_bookings, v_slot_capacity;
    END IF;

    -- 8. Atomic Insert with Concurrency Collision Safety
    -- Note: order_number is omitted; trigger trigger_set_order_number assigns authoritative SW-XXXX
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
            client_submission_id,
            client_submission_fingerprint
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
            NULL, -- Pending store weigh-in
            NULL,
            NULL,
            0,
            'pending',
            'cash',
            'booked',
            NULLIF(TRIM(p_notes), ''),
            p_client_submission_id,
            v_payload_fingerprint
        )
        RETURNING * INTO v_new_order;

        RETURN v_new_order;

    EXCEPTION
        WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

            -- In case of concurrent in-flight race with same client_submission_id,
            -- verify the unique constraint violation is specifically on client_submission_id
            IF v_constraint_name = 'idx_orders_client_submission_id'
               OR v_constraint_name LIKE '%client_submission_id%' THEN

                SELECT * INTO v_existing_order
                FROM public.orders
                WHERE client_submission_id = p_client_submission_id;

                IF FOUND THEN
                    -- Strict ownership check: Must belong strictly to the authenticated caller
                    IF v_existing_order.customer_id IS DISTINCT FROM v_caller_id THEN
                        RAISE EXCEPTION 'Security violation: Submission ID conflict detected.';
                    END IF;

                    -- Payload consistency check on concurrent conflict
                    IF (v_existing_order.client_submission_fingerprint IS NOT NULL
                        AND v_existing_order.client_submission_fingerprint <> v_payload_fingerprint)
                       OR v_existing_order.customer_phone <> v_clean_phone
                       OR LOWER(TRIM(COALESCE(v_existing_order.customer_name, ''))) <> LOWER(TRIM(COALESCE(p_customer_name, '')))
                       OR v_existing_order.pickup_date <> p_pickup_date
                       OR LOWER(TRIM(COALESCE(v_existing_order.pickup_slot, ''))) <> LOWER(TRIM(COALESCE(p_pickup_slot, '')))
                       OR TRIM(COALESCE(v_existing_order.pickup_pincode, '')) <> TRIM(COALESCE(p_pickup_pincode, ''))
                       OR LOWER(TRIM(COALESCE(v_existing_order.pickup_address, ''))) <> LOWER(TRIM(COALESCE(p_pickup_address, '')))
                       OR LOWER(TRIM(COALESCE(v_existing_order.pickup_landmark, ''))) <> LOWER(TRIM(COALESCE(p_pickup_landmark, '')))
                       OR LOWER(TRIM(COALESCE(v_existing_order.notes, ''))) <> LOWER(TRIM(COALESCE(p_notes, '')))
                       OR (v_service_id IS NOT NULL AND v_existing_order.service_id IS DISTINCT FROM v_service_id)
                       OR (p_pickup_latitude IS NOT NULL AND (v_existing_order.pickup_latitude IS NULL OR ROUND(v_existing_order.pickup_latitude, 6) <> ROUND(p_pickup_latitude, 6)))
                       OR (p_pickup_longitude IS NOT NULL AND (v_existing_order.pickup_longitude IS NULL OR ROUND(v_existing_order.pickup_longitude, 6) <> ROUND(p_pickup_longitude, 6))) THEN
                        RAISE EXCEPTION 'Idempotency conflict: client_submission_id "%" was already used for a booking with different details.', p_client_submission_id;
                    END IF;

                    RETURN v_existing_order;
                END IF;
            END IF;

            -- Re-raise any unrelated unique violation (e.g. order_number or others)
            RAISE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 9. Least-Privilege Security Access Grants
REVOKE ALL ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT
) TO authenticated, service_role;

-- 10. Close Direct Table Insert Bypass on public.orders for the 'authenticated' role
-- All legitimate bookings (customer self-service and owner walk-in) must flow through
-- the atomic, advisory-locked create_booking_idempotent() RPC.
-- Because create_booking_idempotent is SECURITY DEFINER, revoking direct INSERT from
-- authenticated prevents client-side bypass of the slot capacity lock without breaking
-- any application workflow (SELECT and UPDATE remain granted).
REVOKE INSERT ON TABLE public.orders FROM authenticated;

COMMIT;
