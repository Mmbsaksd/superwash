-- ==============================================================================
-- SuperWash Exprez — Concurrency-Safe Order Number Generation & Collision Protection
-- Migration: 20261024100000_concurrency_safe_order_numbers.sql
-- ==============================================================================
-- Verification Summary:
-- 1. Sequence Synchronization:
--    Safely extracts numeric suffixes from all existing order numbers and syncs
--    public.order_number_seq using setval(..., is_called = true) so the next
--    nextval() produces strictly greater numbers than any existing record.
-- 2. Trigger & Column Default:
--    Ensures public.orders.order_number has no competing column default calling nextval.
--    The SECURITY DEFINER trigger public.set_order_number() is the single authoritative
--    assigner, preventing double sequence consumption and default conflicts.
-- 3. Concurrency Protection:
--    PostgreSQL nextval() is atomic across all concurrent transactions.
--    The collision-protection loop guarantees that any existing legacy or manual
--    order numbers are automatically skipped without throwing duplicate key errors.
-- 4. Constraint & Historical Order Preservation:
--    The existing orders_order_number_key UNIQUE constraint remains intact.
--    Zero existing orders are updated, renumbered, or deleted.
-- 5. Least Privilege Permissions:
--    Direct USAGE/SELECT on public.order_number_seq is revoked from PUBLIC, anon,
--    and authenticated, preventing direct sequence tampering. Only the internal
--    SECURITY DEFINER trigger function and service_role can access the sequence.
--    Unused RPC helpers are removed to minimize the attack surface.
-- 6. Transactional & Retry-Safe:
--    Wrapped in a standard transaction block (BEGIN ... COMMIT) with idempotent
--    DDL (CREATE IF NOT EXISTS, CREATE OR REPLACE, DROP IF EXISTS).
-- ==============================================================================

BEGIN;

-- 1. Ensure order_number sequence exists
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1001;

-- 2. Synchronize sequence with highest existing order number without touching existing records
DO $$
DECLARE
    v_max_val BIGINT := 1000;
    v_order_max BIGINT;
BEGIN
    SELECT COALESCE(MAX(
        CASE
            WHEN TRIM(order_number) ~* '^SW-[0-9]+$'
                THEN (SUBSTRING(TRIM(order_number) FROM '[0-9]+'))::BIGINT
            WHEN TRIM(order_number) ~ '[0-9]+$'
                THEN (SUBSTRING(TRIM(order_number) FROM '([0-9]+)$'))::BIGINT
            ELSE 1000
        END
    ), 1000)
    INTO v_order_max
    FROM public.orders;

    IF v_order_max > v_max_val THEN
        v_max_val := v_order_max;
    END IF;

    -- Advance sequence to the maximum existing order number so the next nextval() is strictly greater
    PERFORM setval('public.order_number_seq', v_max_val, true);
END $$;

-- 3. Ensure no competing column default calls nextval (trigger is the single source of truth)
ALTER TABLE public.orders
    ALTER COLUMN order_number DROP DEFAULT;

-- 4. Create / replace hardened trigger function with collision-safe loop
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_candidate_num TEXT;
    v_seq_val BIGINT;
    v_collision BOOLEAN;
BEGIN
    -- If order_number is not provided, is blank, or collides with an existing order in the table:
    IF NEW.order_number IS NULL OR TRIM(NEW.order_number) = '' OR EXISTS (
        SELECT 1 FROM public.orders WHERE order_number = NEW.order_number
    ) THEN
        LOOP
            v_seq_val := nextval('public.order_number_seq');
            v_candidate_num := 'SW-' || v_seq_val;

            -- Authoritatively verify candidate does not collide with any manual or legacy order
            SELECT EXISTS(
                SELECT 1 FROM public.orders WHERE order_number = v_candidate_num
            ) INTO v_collision;

            IF NOT v_collision THEN
                NEW.order_number := v_candidate_num;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 5. Re-bind trigger to public.orders
DROP TRIGGER IF EXISTS trigger_set_order_number ON public.orders;
CREATE TRIGGER trigger_set_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_order_number();

-- 6. Clean up any unused RPC helper function to eliminate unneeded surface area
DROP FUNCTION IF EXISTS public.get_next_order_number();

-- 7. Enforce least-privilege security model
-- Prevent direct sequence manipulation from client roles (anon/authenticated)
REVOKE ALL ON SEQUENCE public.order_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

-- Allow client roles to execute the trigger function during legitimate INSERT operations
GRANT EXECUTE ON FUNCTION public.set_order_number() TO authenticated, anon, service_role;

COMMIT;
