-- ==============================================================================
-- SuperWash Exprez — STAGE 5B PRE-DEPLOYMENT WRITE-FREEZE (REVIEW ONLY)
-- Path: docs/review/stage5b_release_candidate/00_stage5b_pre_migration_freeze.sql
-- Purpose: Closes the in-flight SECURITY DEFINER RPC race and direct-write window
--          PRIOR to executing 00_stage5b_atomic_release.sql.
-- Execution Boundary: Execute against confirmed Staging project in Supabase SQL Editor
--                     immediately after enabling Cloudflare maintenance mode splash.
-- ==============================================================================

BEGIN;

-- 1. DYNAMIC REVOCATION OF ALL LEGACY WRITE RPC OVERLOADS
-- Iterates over every existing overload of order/payment mutation functions
-- and revokes EXECUTE from PUBLIC, anon, and authenticated.
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
              'update_order_pickup_location',
              'advance_order_workflow_status',
              'assign_order_courier',
              'record_courier_pickup_collection',
              'record_store_intake_weight',
              'cancel_order_with_batch_sync',
              'update_order_delivery_notes'
          )
    LOOP
        stmt := format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;', 
                       fn_record.proname, fn_record.args);
        EXECUTE stmt;
        RAISE NOTICE 'Froze write RPC: public.%(%)', fn_record.proname, fn_record.args;
    END LOOP;
END $$;

-- 2. DYNAMIC TABLE-LEVEL AND COLUMN-LEVEL WRITE PRIVILEGE REVOCATION
-- Safely audits and revokes write privileges across all 4 target tables
-- (orders, coupons, delivery_batches, payments) without failing if a table
-- has not yet been introduced in earlier migrations.
DO $$
DECLARE
    tbl TEXT;
    col RECORD;
    role_name TEXT;
    priv_name TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY['orders', 'coupons', 'delivery_batches', 'payments'])
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            -- A. Table-level write revocation
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM PUBLIC, anon, authenticated;', tbl);
            RAISE NOTICE 'Froze table-level writes on public.%', tbl;

            -- B. Column-level write revocation across all existing columns
            FOR col IN
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = tbl
            LOOP
                FOR priv_name IN SELECT unnest(ARRAY['INSERT', 'UPDATE', 'REFERENCES'])
                LOOP
                    -- Pseudo-role PUBLIC: unquoted keyword syntax
                    EXECUTE format('REVOKE %s (%I) ON TABLE public.%I FROM PUBLIC;', priv_name, col.column_name, tbl);

                    -- Ordinary roles: safely quoted identifiers (%I)
                    FOR role_name IN SELECT unnest(ARRAY['authenticated', 'anon'])
                    LOOP
                        EXECUTE format('REVOKE %s (%I) ON TABLE public.%I FROM %I;', priv_name, col.column_name, tbl, role_name);
                    END LOOP;
                END LOOP;
            END LOOP;
            RAISE NOTICE 'Froze column-level writes on public.%', tbl;

            -- C. Preserve read-only SELECT
            EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated;', tbl);
            IF tbl IN ('orders', 'coupons') THEN
                EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon;', tbl);
            END IF;
        ELSE
            RAISE NOTICE 'Skipping non-existent table: public.%', tbl;
        END IF;
    END LOOP;
END $$;

-- 3. SIGNAL POSTGREST TO FLUSH SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------------------------
-- VERIFICATION QUERY 1: Audit Table-Level and Column-Level Effective Privileges
-- Expected output: ALL rows must return false (f) for write permissions
-- ------------------------------------------------------------------------------
SELECT 
    t.table_name,
    has_table_privilege('authenticated', 'public.' || quote_ident(t.table_name), 'INSERT') AS auth_table_ins,
    has_table_privilege('authenticated', 'public.' || quote_ident(t.table_name), 'UPDATE') AS auth_table_upd,
    has_table_privilege('authenticated', 'public.' || quote_ident(t.table_name), 'DELETE') AS auth_table_del,
    has_table_privilege('anon', 'public.' || quote_ident(t.table_name), 'UPDATE') AS anon_table_upd
FROM (
    SELECT unnest(ARRAY['orders', 'coupons', 'delivery_batches', 'payments']) AS table_name
) t
WHERE EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t.table_name
);

-- ------------------------------------------------------------------------------
-- VERIFICATION QUERY 2: Drain Verification Query
-- Expected output: active_client_writes MUST BE 0 before proceeding to release!
-- ------------------------------------------------------------------------------
SELECT count(*) AS active_client_writes
FROM pg_stat_activity
WHERE state != 'idle'
  AND pid != pg_backend_pid()
  AND usename NOT IN ('postgres', 'supabase_admin');
