-- ==============================================================================
-- SuperWash Exprez — Migration 20261027140000
-- Forward-only Migration: Coupon Discount System & Address Deduplication Index
-- ==============================================================================
-- Verified Production Compatibility:
-- 1. Migration Execution Safety: Wrapped in an atomic transaction block (BEGIN ... COMMIT).
-- 2. Address Deduplication: Safely merges missing landmarks and valid coordinates into
--    the retained address before deleting duplicates; preserves default address and prevents
--    overwriting existing valid locations.
-- 3. Coupon Validation Security: SET search_path = public, pg_temp; fully qualified objects;
--    prevents unauthenticated callers from probing customer-specific redemption data.
-- 4. Coupon Activation: Initial promotional coupons (WELCOME50, EXPREZ10) are seeded as inactive
--    (is_active = false) requiring explicit business owner review and activation.
-- 5. Booking RPC Signature: Preserves both the 14-parameter core RPC and a 12-parameter
--    backward-compatible wrapper, preventing PostgREST ambiguous candidate errors.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- STEP 0: ATOMIC PRE-MIGRATION BACKUP & RECOVERY METADATA UNDER STRICT TABLE LOCK
-- ==============================================================================
-- 1. Create dedicated private backup schema inaccessible to PostgREST API
CREATE SCHEMA IF NOT EXISTS _backups;
REVOKE ALL ON SCHEMA _backups FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA _backups REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA _backups REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA _backups REVOKE ALL ON ROUTINES FROM PUBLIC, anon, authenticated;

-- 2. Lock critical tables in SHARE ROW EXCLUSIVE MODE.
-- These locks remain held continuously until the final COMMIT at the end of this script,
-- eliminating any concurrency gap between backup snapshot and deduplication.
LOCK TABLE public.customer_addresses, public.services, public.business_settings IN SHARE ROW EXCLUSIVE MODE;

-- 3. Collision-Safe Provenance Check:
-- If backup tables already exist from an earlier failed release attempt, ABORT immediately.
-- Never overwrite or silently reuse prior snapshot data whose provenance is unverified.
DO $$
BEGIN
    IF to_regclass('_backups.customer_addresses_rel_20261027_140000') IS NOT NULL THEN
        RAISE EXCEPTION 'Safety check failed: Backup table _backups.customer_addresses_rel_20261027_140000 already exists! Aborting migration to prevent reusing stale snapshots or overwriting existing backup data. Investigate table provenance before proceeding.';
    END IF;
    IF to_regclass('_backups.services_rel_20261027_140000') IS NOT NULL THEN
        RAISE EXCEPTION 'Safety check failed: Backup table _backups.services_rel_20261027_140000 already exists! Aborting migration.';
    END IF;
    IF to_regclass('_backups.address_mutations_rel_20261027_140000') IS NOT NULL THEN
        RAISE EXCEPTION 'Safety check failed: Mutation table _backups.address_mutations_rel_20261027_140000 already exists! Aborting migration.';
    END IF;
END $$;

-- 4. Capture fresh, uniquely identified pre-migration snapshots matching verified schema
CREATE TABLE _backups.customer_addresses_rel_20261027_140000 AS
SELECT id, user_id, label, address_line, landmark, pincode, is_default, created_at, latitude, longitude,
       clock_timestamp() AS backup_captured_at
FROM public.customer_addresses;

CREATE TABLE _backups.services_rel_20261027_140000 AS
SELECT id, name, description, pricing_unit, unit_price_paise, min_weight_kg, is_active, display_order, created_at, updated_at,
       clock_timestamp() AS backup_captured_at
FROM public.services;

-- Explicitly ensure all snapshot tables in _backups cannot be read by public API users
REVOKE ALL ON ALL TABLES IN SCHEMA _backups FROM PUBLIC, anon, authenticated;

-- 5. Create Step 3A Mutation Tracking Table for safe, non-destructive rollback
CREATE TABLE _backups.address_mutations_rel_20261027_140000 (
    id UUID PRIMARY KEY,
    orig_landmark TEXT,
    new_landmark TEXT,
    orig_lat NUMERIC(10, 7),
    new_lat NUMERIC(10, 7),
    orig_long NUMERIC(10, 7),
    new_long NUMERIC(10, 7),
    orig_is_default BOOLEAN,
    new_is_default BOOLEAN
);
REVOKE ALL ON TABLE _backups.address_mutations_rel_20261027_140000 FROM PUBLIC, anon, authenticated;

-- 6. Snapshot Parity & Key Coverage Assertion
DO $$
DECLARE
    v_src_addr INT;
    v_bak_addr INT;
    v_src_serv INT;
    v_bak_serv INT;
    v_missing_keys INT;
BEGIN
    SELECT COUNT(*) INTO v_src_addr FROM public.customer_addresses;
    SELECT COUNT(*) INTO v_bak_addr FROM _backups.customer_addresses_rel_20261027_140000;
    SELECT COUNT(*) INTO v_src_serv FROM public.services;
    SELECT COUNT(*) INTO v_bak_serv FROM _backups.services_rel_20261027_140000;

    IF v_src_addr <> v_bak_addr OR v_src_serv <> v_bak_serv THEN
        RAISE EXCEPTION 'Pre-migration backup parity mismatch! Addresses: % vs %, Services: % vs %',
            v_src_addr, v_bak_addr, v_src_serv, v_bak_serv;
    END IF;

    -- Verify source-to-backup primary key coverage
    SELECT COUNT(*) INTO v_missing_keys
    FROM public.customer_addresses ca
    WHERE NOT EXISTS (
        SELECT 1 FROM _backups.customer_addresses_rel_20261027_140000 b WHERE b.id = ca.id
    );

    IF v_missing_keys > 0 THEN
        RAISE EXCEPTION 'Snapshot integrity failure: % address primary keys missing from backup table!', v_missing_keys;
    END IF;
END $$;

-- 1. Create public.coupons table with full redemption limit controls
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value INTEGER NOT NULL CHECK (discount_value > 0),
    min_order_paise INTEGER NOT NULL DEFAULT 0 CHECK (min_order_paise >= 0),
    max_discount_paise INTEGER CHECK (max_discount_paise IS NULL OR max_discount_paise > 0),
    max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
    total_redemptions INTEGER NOT NULL DEFAULT 0 CHECK (total_redemptions >= 0),
    per_customer_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
    applicable_service_ids UUID[],
    first_time_only BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT false,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_coupons_code_active ON public.coupons (upper(trim(code)), is_active);

-- Enable RLS on coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Explicit Table Grants for PostgREST API
REVOKE ALL ON TABLE public.coupons FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.coupons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.coupons TO authenticated;

-- Coupons RLS Policies:
-- A. Anyone (customers & public booking) can view active coupons for validation
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
CREATE POLICY "Anyone can view active coupons"
    ON public.coupons
    FOR SELECT
    USING (is_active = true AND (valid_until IS NULL OR valid_until > timezone('utc'::text, now())));

-- B. Owners have full management access (all operations)
DROP POLICY IF EXISTS "Owners can manage coupons" ON public.coupons;
CREATE POLICY "Owners can manage coupons"
    ON public.coupons
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'owner'
        )
    );

-- 2. Extend public.orders with coupon fields if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'coupon_code'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN coupon_code TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'discount_paise'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN discount_paise INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 2B. Cancellation Trigger: Restore coupon total_redemptions when an order is cancelled
CREATE OR REPLACE FUNCTION public.trg_restore_coupon_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' AND OLD.coupon_code IS NOT NULL THEN
        UPDATE public.coupons
        SET total_redemptions = GREATEST(0, total_redemptions - 1),
            updated_at = timezone('utc'::text, now())
        WHERE UPPER(TRIM(code)) = UPPER(TRIM(OLD.coupon_code));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_coupon_cancellation ON public.orders;
CREATE TRIGGER trg_order_coupon_cancellation
    AFTER UPDATE OF order_status ON public.orders
    FOR EACH ROW
    WHEN (NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' AND OLD.coupon_code IS NOT NULL)
    EXECUTE FUNCTION public.trg_restore_coupon_on_cancellation();

-- 3. Safe Address Deduplication & Unique Index
-- Step 3A: Merge missing landmarks and valid coordinates into the retained address before deleting duplicates.
-- Preserves the record with is_default=true, non-null GPS coordinates, non-empty landmark, or earliest creation.
WITH ranked_addresses AS (
    SELECT id,
           user_id,
           lower(trim(address_line)) AS norm_address,
           trim(pincode) AS norm_pincode,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, lower(trim(address_line)), trim(pincode)
               ORDER BY is_default DESC,
                        (latitude IS NOT NULL AND longitude IS NOT NULL) DESC,
                        (landmark IS NOT NULL AND trim(landmark) <> '') DESC,
                        created_at ASC,
                        id ASC
           ) AS rank_order
    FROM public.customer_addresses
),
retained_addresses AS (
    SELECT id, user_id, norm_address, norm_pincode
    FROM ranked_addresses
    WHERE rank_order = 1
),
duplicate_candidates AS (
    SELECT ra.id AS retained_id,
           ca.id AS duplicate_id,
           ca.landmark AS dup_landmark,
           ca.latitude AS dup_lat,
           ca.longitude AS dup_long,
           ca.is_default AS dup_is_default,
           ca.created_at AS dup_created_at
    FROM ranked_addresses ra
    JOIN public.customer_addresses ca
      ON ca.user_id = ra.user_id
     AND lower(trim(ca.address_line)) = ra.norm_address
     AND trim(ca.pincode) = ra.norm_pincode
    WHERE ra.rank_order = 1
      AND ca.id <> ra.id
),
merge_source AS (
    SELECT retained_id,
           (ARRAY_REMOVE(ARRAY_AGG(dup_landmark ORDER BY dup_created_at DESC), NULL))[1] AS best_dup_landmark,
           (ARRAY_REMOVE(ARRAY_AGG(dup_lat ORDER BY dup_created_at DESC) FILTER (WHERE dup_lat IS NOT NULL AND dup_long IS NOT NULL), NULL))[1] AS best_dup_lat,
           (ARRAY_REMOVE(ARRAY_AGG(dup_long ORDER BY dup_created_at DESC) FILTER (WHERE dup_lat IS NOT NULL AND dup_long IS NOT NULL), NULL))[1] AS best_dup_long,
           BOOL_OR(dup_is_default) AS any_dup_is_default
    FROM duplicate_candidates
    GROUP BY retained_id
),
executed_updates AS (
    UPDATE public.customer_addresses target
    SET landmark = CASE
            WHEN (target.landmark IS NULL OR TRIM(target.landmark) = '') AND ms.best_dup_landmark IS NOT NULL
            THEN TRIM(ms.best_dup_landmark)
            ELSE target.landmark
        END,
        latitude = CASE
            WHEN target.latitude IS NULL AND ms.best_dup_lat IS NOT NULL AND ms.best_dup_long IS NOT NULL
            THEN ms.best_dup_lat
            ELSE target.latitude
        END,
        longitude = CASE
            WHEN target.longitude IS NULL AND ms.best_dup_lat IS NOT NULL AND ms.best_dup_long IS NOT NULL
            THEN ms.best_dup_long
            ELSE target.longitude
        END,
        is_default = CASE
            WHEN ms.any_dup_is_default = true THEN true
            ELSE target.is_default
        END
    FROM merge_source ms
    WHERE target.id = ms.retained_id
    RETURNING target.id, target.landmark, target.latitude, target.longitude, target.is_default
)
INSERT INTO _backups.address_mutations_rel_20261027_140000 (
    id, orig_landmark, new_landmark, orig_lat, new_lat, orig_long, new_long, orig_is_default, new_is_default
)
SELECT u.id, b.landmark, u.landmark, b.latitude, u.latitude, b.longitude, u.longitude, b.is_default, u.is_default
FROM executed_updates u
JOIN _backups.customer_addresses_rel_20261027_140000 b ON b.id = u.id;

-- Step 3B: Delete duplicate records where rank_order > 1
WITH duplicate_ranking AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, lower(trim(address_line)), trim(pincode)
               ORDER BY is_default DESC,
                        (latitude IS NOT NULL AND longitude IS NOT NULL) DESC,
                        (landmark IS NOT NULL AND trim(landmark) <> '') DESC,
                        created_at ASC,
                        id ASC
           ) AS rank_order
    FROM public.customer_addresses
)
DELETE FROM public.customer_addresses
WHERE id IN (
    SELECT id FROM duplicate_ranking WHERE rank_order > 1
);

-- Step 3C: Creates unique index safely to prevent future duplicate address submissions
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_user_dedup
    ON public.customer_addresses (user_id, lower(trim(address_line)), trim(pincode));

-- 4. Authoritative Backend Coupon Validation RPC
CREATE OR REPLACE FUNCTION public.validate_coupon(
    p_code TEXT,
    p_customer_phone TEXT,
    p_subtotal_paise INTEGER,
    p_service_id UUID DEFAULT NULL
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

    IF v_coupon.min_order_paise > 0 AND p_subtotal_paise < v_coupon.min_order_paise THEN
        RETURN jsonb_build_object(
            'valid', false,
            'code', v_clean_code,
            'reason', 'Minimum order subtotal of ₹' || (v_coupon.min_order_paise / 100)::text || ' required for coupon ''' || v_clean_code || '''.',
            'discount_paise', 0,
            'min_order_paise', v_coupon.min_order_paise
        );
    END IF;

    IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.total_redemptions >= v_coupon.max_redemptions THEN
        RETURN jsonb_build_object('valid', false, 'code', v_clean_code, 'reason', 'Coupon ''' || v_clean_code || ''' has reached its overall maximum redemption limit.', 'discount_paise', 0);
    END IF;

    -- Security Guard: Customer-specific usage limits are verified only when authenticated
    -- to prevent unauthenticated callers from probing order history or redemption counts.
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

REVOKE ALL ON FUNCTION public.validate_coupon(TEXT, TEXT, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, TEXT, INTEGER, UUID) TO anon, authenticated, service_role;

-- 5. Seed Initial Welcome & Loyalty Coupons as Inactive
-- Business owner must explicitly review and activate each promotional coupon via Owner Dashboard.
INSERT INTO public.coupons (code, description, discount_type, discount_value, min_order_paise, max_discount_paise, per_customer_limit, is_active)
VALUES
    ('WELCOME50', 'New Customer Welcome: ₹50 Flat Off on orders over ₹150', 'fixed', 5000, 15000, NULL, 1, false),
    ('EXPREZ10', 'SuperWash Exprez: 10% Off up to ₹100 on orders over ₹200', 'percentage', 10, 20000, 10000, 3, false)
ON CONFLICT (code) DO NOTHING;

-- 6. Service Catalogue & Settings Pricing Reconciliation
-- Strictly target the primary 'Wash & Fold (Normal)' service in catalogue with business_settings (₹79/kg, 1.0 kg min)
-- Preserves all other services ('Steam Press & Ironing', 'Heavy Comforter', 'Dry Cleaning', etc.) intact.
DO $$
DECLARE
    v_target_id UUID := 'f520c538-65e3-4b64-825e-5fdd3c282e8d';
    v_id_matches INT;
    v_name_matches INT;
    v_resolved_service_id UUID;
BEGIN
    SELECT COUNT(*) INTO v_id_matches FROM public.services WHERE id = v_target_id;
    SELECT COUNT(*) INTO v_name_matches FROM public.services WHERE pricing_unit = 'per_kg' AND lower(trim(name)) = 'wash & fold (normal)';

    -- Precondition 1: If both ID and Name match, verify they resolve to the exact same record
    IF v_id_matches > 0 AND v_name_matches > 0 THEN
        SELECT id INTO v_resolved_service_id
        FROM public.services
        WHERE pricing_unit = 'per_kg' AND lower(trim(name)) = 'wash & fold (normal)';

        IF v_resolved_service_id <> v_target_id THEN
            RAISE EXCEPTION 'Ambiguous pricing target: Service ID % and Service Name "Wash & Fold (Normal)" point to distinct service records! Aborting to prevent updating multiple services.', v_target_id;
        END IF;
    ELSIF v_name_matches = 1 THEN
        SELECT id INTO v_resolved_service_id
        FROM public.services
        WHERE pricing_unit = 'per_kg' AND lower(trim(name)) = 'wash & fold (normal)';
    ELSIF v_id_matches = 1 THEN
        v_resolved_service_id := v_target_id;
    ELSE
        RAISE EXCEPTION 'Target service for pricing update not found (neither ID % nor Name "Wash & Fold (Normal)" exists)! Aborting.', v_target_id;
    END IF;

    -- Update strictly the resolved single primary catalogue row
    UPDATE public.services
    SET unit_price_paise = 7900,
        min_weight_kg = 1.0,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_resolved_service_id;

    -- Synchronize business_settings fallback so RPC and default calculations stay aligned
    UPDATE public.business_settings
    SET price_per_kg_paise = 7900,
        min_weight_kg = 1.0,
        updated_at = timezone('utc'::text, now())
    WHERE id = (SELECT id FROM public.business_settings LIMIT 1);
END $$;

-- 7. Authoritative 14-Parameter Booking Creation RPC with Exclusive Coupon Locking
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

    -- 5. Idempotency Pre-Check (Return existing order without double-redemption)
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE client_submission_id = p_client_submission_id;

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

    -- 6. Pickup Slot Validation
    SELECT * INTO v_slot
    FROM public.pickup_slots
    WHERE name = TRIM(p_pickup_slot);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pickup slot "%" does not exist in the store schedule.', p_pickup_slot;
    END IF;

    IF NOT v_slot.is_active THEN
        RAISE EXCEPTION 'Pickup slot "%" is currently deactivated and not accepting bookings.', p_pickup_slot;
    END IF;

    v_slot_capacity := COALESCE(v_slot.max_capacity, 15);

    -- 7. Transaction-Level Advisory Lock for Capacity
    PERFORM pg_advisory_xact_lock(
        hashtext('slot_capacity_' || p_pickup_date::text || '_' || v_slot.name)
    );

    SELECT COUNT(*) INTO v_current_slot_bookings
    FROM public.orders
    WHERE pickup_date = p_pickup_date
      AND pickup_slot = v_slot.name
      AND order_status <> 'cancelled';

    IF v_current_slot_bookings >= v_slot_capacity THEN
        RAISE EXCEPTION 'The pickup slot "%" on % is fully booked (%/%). Please select another slot.',
            v_slot.name, p_pickup_date, v_current_slot_bookings, v_slot_capacity;
    END IF;

    -- 8. Authoritative Coupon Validation & Row-Locking
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

        IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.total_redemptions >= v_coupon.max_redemptions THEN
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

        -- Authoritative server-side discount calculation for initial booking estimate
        v_estimated_subtotal := ROUND(v_unit_price_paise * GREATEST(1.0, COALESCE(v_min_weight_kg, 1.0)))::integer;

        IF v_coupon.min_order_paise > 0 AND v_estimated_subtotal < v_coupon.min_order_paise THEN
            RAISE EXCEPTION 'Minimum order subtotal of ₹% required for coupon "%".', (v_coupon.min_order_paise / 100)::text, p_coupon_code;
        END IF;

        IF v_coupon.discount_type = 'percentage' THEN
            v_authoritative_discount_paise := ROUND((v_estimated_subtotal * v_coupon.discount_value)::NUMERIC / 100.0);
            IF v_coupon.max_discount_paise IS NOT NULL AND v_authoritative_discount_paise > v_coupon.max_discount_paise THEN
                v_authoritative_discount_paise := v_coupon.max_discount_paise;
            END IF;
        ELSE
            v_authoritative_discount_paise := v_coupon.discount_value;
        END IF;

        -- Ensure discount never exceeds eligible subtotal
        IF v_authoritative_discount_paise > v_estimated_subtotal THEN
            v_authoritative_discount_paise := v_estimated_subtotal;
        END IF;
    END IF;

    -- 9. Atomic Order Insert & Conditional Redemption Increment
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
            coupon_code,
            discount_paise,
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
            v_payload_fingerprint
        )
        RETURNING * INTO v_new_order;

        -- Increment total redemptions atomically upon successful order insertion
        IF v_coupon.id IS NOT NULL THEN
            UPDATE public.coupons
            SET total_redemptions = total_redemptions + 1,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_coupon.id;
        END IF;

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

-- 8. Backward-Compatible 12-Parameter Wrapper
-- Forwards existing callers and legacy clients to the core function with NULL coupon and 0 discount.
-- Guarantees unambiguous PostgREST function resolution because the 14-parameter function does not default coupon parameters.
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

-- Least-Privilege Execution Grants for both function overloads
REVOKE ALL ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_booking_idempotent(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER
) TO authenticated, service_role;

COMMIT;
