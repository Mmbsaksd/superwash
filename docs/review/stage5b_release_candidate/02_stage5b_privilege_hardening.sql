-- ==============================================================================
-- SuperWash Exprez — SUPERSEDED SPLIT DRAFT 02 (FOR AUDIT ONLY)
-- Path: docs/review/stage5b_release_candidate/02_stage5b_privilege_hardening.sql
-- Status: SUPERSEDED by docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql
-- Note: Preserved strictly for audit. DO NOT apply independently.
-- ==============================================================================

BEGIN;

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
