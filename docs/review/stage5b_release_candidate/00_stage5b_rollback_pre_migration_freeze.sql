-- ==============================================================================
-- SuperWash Exprez — STAGE 5B ROLLBACK PRE-MIGRATION FREEZE (REVIEW ONLY)
-- Path: docs/review/stage5b_release_candidate/00_stage5b_rollback_pre_migration_freeze.sql
-- Purpose: Safely restores pre-freeze baseline database permissions ONLY if the
--          deployment is aborted BEFORE 00_stage5b_atomic_release.sql is applied.
-- WARNING: DO NOT run this if 00_stage5b_atomic_release.sql has already committed!
-- ==============================================================================

BEGIN;

-- 1. RESTORE EXECUTE ON BASELINE WRITE RPCS
DO $$
DECLARE
    fn_record RECORD;
    stmt TEXT;
BEGIN
    FOR fn_record IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'create_booking_idempotent',
              'record_order_payment',
              'update_order_pickup_location'
          )
    LOOP
        stmt := format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated;', 
                       fn_record.proname, fn_record.args);
        EXECUTE stmt;
        RAISE NOTICE 'Restored execution on: public.%(%)', fn_record.proname, fn_record.args;
    END LOOP;
END $$;

-- 2. RESTORE EXACT BASELINE TABLE PRIVILEGES
-- Strictly restores ONLY the pre-freeze baseline privileges established by migrations 1-20.
-- Avoids unsafe broad grants: DOES NOT grant DELETE or TRUNCATE on orders or payments.
DO $$
BEGIN
    -- Orders table baseline: SELECT, INSERT, UPDATE
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
        GRANT SELECT, INSERT, UPDATE ON TABLE public.orders TO authenticated;
        GRANT SELECT ON TABLE public.orders TO anon;
        RAISE NOTICE 'Restored baseline privileges on public.orders';
    END IF;

    -- Coupons table baseline: SELECT, INSERT, UPDATE, DELETE
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coupons') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coupons TO authenticated;
        GRANT SELECT ON TABLE public.coupons TO anon;
        RAISE NOTICE 'Restored baseline privileges on public.coupons';
    END IF;

    -- Payments table baseline: SELECT, INSERT
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
        GRANT SELECT, INSERT ON TABLE public.payments TO authenticated;
        RAISE NOTICE 'Restored baseline privileges on public.payments';
    END IF;

    -- Delivery batches table baseline (if exists): SELECT, INSERT, UPDATE
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'delivery_batches') THEN
        GRANT SELECT, INSERT, UPDATE ON TABLE public.delivery_batches TO authenticated;
        RAISE NOTICE 'Restored baseline privileges on public.delivery_batches';
    END IF;
END $$;

-- 3. SIGNAL POSTGREST
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------------------------
-- VERIFICATION QUERY: Confirm baseline permissions restored without broad grants
-- ------------------------------------------------------------------------------
SELECT 
    'orders' AS table_name,
    has_table_privilege('authenticated', 'public.orders', 'INSERT') AS auth_insert,
    has_table_privilege('authenticated', 'public.orders', 'UPDATE') AS auth_update,
    has_table_privilege('authenticated', 'public.orders', 'DELETE') AS auth_delete,
    has_table_privilege('authenticated', 'public.orders', 'TRUNCATE') AS auth_truncate
UNION ALL
SELECT 
    'payments',
    has_table_privilege('authenticated', 'public.payments', 'INSERT'),
    has_table_privilege('authenticated', 'public.payments', 'UPDATE'),
    has_table_privilege('authenticated', 'public.payments', 'DELETE'),
    has_table_privilege('authenticated', 'public.payments', 'TRUNCATE');
-- Expected:
-- orders: auth_insert = t, auth_update = t, auth_delete = f, auth_truncate = f
-- payments: auth_insert = t, auth_update = f, auth_delete = f, auth_truncate = f
