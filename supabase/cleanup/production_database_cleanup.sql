-- =============================================================================
-- SUPERWASH EXPREZ — COMPLETE PRODUCTION DATABASE CLEANUP
-- Project: ierbhbfgqleobjepamrx (ap-northeast-1)
-- Scope: Removes operational and test business data; preserves configuration,
--        schema definitions, and the 4 approved operational accounts.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PRECONDITION 1: Target Project Identity Verification
-- Abort immediately if not running in the target production database.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_business_id UUID;
    v_owner_count INT;
BEGIN
    SELECT id INTO v_business_id
    FROM public.business_settings
    WHERE business_name = 'SuperWash Exprez';

    IF v_business_id IS NULL OR v_business_id != 'a19714b5-ddb9-4018-9688-f44a81a7f059'::UUID THEN
        RAISE EXCEPTION 'Safety check failed: target project business_settings mismatch (found %)', v_business_id;
    END IF;

    SELECT count(*) INTO v_owner_count
    FROM public.profiles
    WHERE LOWER(TRIM(email)) = 'superwashexprez@gmail.com' AND role = 'owner';

    IF v_owner_count < 1 THEN
        RAISE EXCEPTION 'Safety check failed: permanent primary owner account missing from target database.';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 1: Delete dependent child records in strict foreign-key order
-- -----------------------------------------------------------------------------
DELETE FROM public.coupon_redemptions;
DELETE FROM public.coupon_reservations;
DELETE FROM public.order_feedback;
DELETE FROM public.payments;
DELETE FROM public.notification_logs;
DELETE FROM public.weight_change_history;
DELETE FROM public.order_status_history;
DELETE FROM public.payment_events;

-- -----------------------------------------------------------------------------
-- STEP 2: Delete master operational orders
-- -----------------------------------------------------------------------------
DELETE FROM public.orders;

-- -----------------------------------------------------------------------------
-- STEP 3: Delete customer saved addresses
-- -----------------------------------------------------------------------------
DELETE FROM public.customer_addresses;

-- -----------------------------------------------------------------------------
-- STEP 4: Clear any stale staff pre-registrations
-- -----------------------------------------------------------------------------
DELETE FROM public.staff_pre_registrations;

-- -----------------------------------------------------------------------------
-- STEP 5: Reset coupon redemption counters
-- -----------------------------------------------------------------------------
UPDATE public.coupons
SET total_redemptions = 0,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- STEP 6: Purge the 11 test users from auth.users
-- Deleting from auth.users automatically cascades to public.profiles,
-- auth.identities, auth.sessions, and auth.refresh_tokens.
-- -----------------------------------------------------------------------------
DELETE FROM auth.users
WHERE LOWER(TRIM(email)) NOT IN (
    'superwashexprez@gmail.com',
    'bs.munavar@gmail.com',
    'mmbsaksd@gmail.com',
    'dream7736952543@gmail.com'
);

-- Ensure public.profiles has no orphaned test profiles
DELETE FROM public.profiles
WHERE LOWER(TRIM(email)) NOT IN (
    'superwashexprez@gmail.com',
    'bs.munavar@gmail.com',
    'mmbsaksd@gmail.com',
    'dream7736952543@gmail.com'
);

-- -----------------------------------------------------------------------------
-- STEP 7: POST-EXECUTION COMPREHENSIVE ASSERTIONS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_orders_cnt INT;
    v_payments_cnt INT;
    v_feedback_cnt INT;
    v_status_cnt INT;
    v_notif_cnt INT;
    v_weight_cnt INT;
    v_reserv_cnt INT;
    v_redempt_cnt INT;
    v_addr_cnt INT;
    v_staff_prereg_cnt INT;
    v_payment_events_cnt INT;
    v_profiles_cnt INT;
    v_auth_cnt INT;
    v_settings_cnt INT;
    v_pricing_cnt INT;
    v_services_cnt INT;
    v_areas_cnt INT;
    v_slots_cnt INT;
    v_coupons_cnt INT;
    v_backup1_cnt INT;
    v_backup2_cnt INT;
BEGIN
    SELECT count(*) INTO v_orders_cnt FROM public.orders;
    SELECT count(*) INTO v_payments_cnt FROM public.payments;
    SELECT count(*) INTO v_feedback_cnt FROM public.order_feedback;
    SELECT count(*) INTO v_status_cnt FROM public.order_status_history;
    SELECT count(*) INTO v_notif_cnt FROM public.notification_logs;
    SELECT count(*) INTO v_weight_cnt FROM public.weight_change_history;
    SELECT count(*) INTO v_reserv_cnt FROM public.coupon_reservations;
    SELECT count(*) INTO v_redempt_cnt FROM public.coupon_redemptions;
    SELECT count(*) INTO v_addr_cnt FROM public.customer_addresses;
    SELECT count(*) INTO v_staff_prereg_cnt FROM public.staff_pre_registrations;
    SELECT count(*) INTO v_payment_events_cnt FROM public.payment_events;
    SELECT count(*) INTO v_profiles_cnt FROM public.profiles;
    SELECT count(*) INTO v_auth_cnt FROM auth.users;

    SELECT count(*) INTO v_settings_cnt FROM public.business_settings WHERE price_per_kg_paise = 7900;
    SELECT count(*) INTO v_pricing_cnt FROM public.pricing_versions WHERE status = 'active';
    SELECT count(*) INTO v_services_cnt FROM public.services WHERE is_active = true;
    SELECT count(*) INTO v_areas_cnt FROM public.service_areas WHERE is_active = true;
    SELECT count(*) INTO v_slots_cnt FROM public.pickup_slots WHERE is_active = true;
    SELECT count(*) INTO v_coupons_cnt FROM public.coupons WHERE is_active = true;
    SELECT count(*) INTO v_backup1_cnt FROM _backups.customer_addresses_rel_20261027_140000;
    SELECT count(*) INTO v_backup2_cnt FROM _backups.services_rel_20261027_140000;

    -- Operational tables must be exactly 0
    IF v_orders_cnt != 0 OR v_payments_cnt != 0 OR v_feedback_cnt != 0 OR v_status_cnt != 0 OR
       v_notif_cnt != 0 OR v_weight_cnt != 0 OR v_reserv_cnt != 0 OR v_redempt_cnt != 0 OR
       v_addr_cnt != 0 OR v_staff_prereg_cnt != 0 OR v_payment_events_cnt != 0 THEN
        RAISE EXCEPTION 'Cleanup assertion failed: one or more operational tables still contain data.';
    END IF;

    -- Profiles and Auth Users must be exactly 4
    IF v_profiles_cnt != 4 THEN
        RAISE EXCEPTION 'Cleanup assertion failed: expected 4 profiles, found %', v_profiles_cnt;
    END IF;
    IF v_auth_cnt != 4 THEN
        RAISE EXCEPTION 'Cleanup assertion failed: expected 4 auth users, found %', v_auth_cnt;
    END IF;

    -- Configuration must remain intact
    IF v_settings_cnt < 1 THEN RAISE EXCEPTION 'Assertion failed: business_settings missing'; END IF;
    IF v_pricing_cnt < 1 THEN RAISE EXCEPTION 'Assertion failed: pricing_versions missing'; END IF;
    IF v_services_cnt < 2 THEN RAISE EXCEPTION 'Assertion failed: services catalogue corrupted'; END IF;
    IF v_areas_cnt < 2 THEN RAISE EXCEPTION 'Assertion failed: active service areas missing'; END IF;
    IF v_slots_cnt < 4 THEN RAISE EXCEPTION 'Assertion failed: pickup slots missing'; END IF;
    IF v_coupons_cnt < 2 THEN RAISE EXCEPTION 'Assertion failed: coupons missing'; END IF;
    IF v_backup1_cnt < 15 THEN RAISE EXCEPTION 'Assertion failed: backup addresses altered'; END IF;
    IF v_backup2_cnt < 2 THEN RAISE EXCEPTION 'Assertion failed: backup services altered'; END IF;
END $$;

COMMIT;
