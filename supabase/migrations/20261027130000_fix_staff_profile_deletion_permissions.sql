-- ==============================================================================
-- SuperWash Exprez — Hardened Staff Profile Deletion & Concurrency-Safe Owner Protection
-- Migration: 20261027130000_fix_staff_profile_deletion_permissions.sql
-- ==============================================================================
-- Security Architecture:
-- 1. Table-level direct DELETE is strictly REVOKED from anon and authenticated roles.
--    This completely eliminates direct client deletion via PostgREST, preventing
--    unintended ON DELETE SET NULL cascades that would erase operational audit trails.
-- 2. Deletions and deactivations must strictly pass through the atomic
--    SECURITY DEFINER function public.delete_staff_profile(UUID).
-- 3. Concurrency-Safe Transaction Serialization:
--    Acquires pg_advisory_xact_lock(hashtext('superwash_owner_lifecycle_lock'))
--    to serialize concurrent owner deletions and deactivations.
-- 4. Target Row Locking:
--    Acquires row-level exclusive lock (FOR UPDATE) on the target staff profile.
-- 5. Comprehensive Historical Audit Scan:
--    Scans all 7 verified schema tables referencing public.profiles(id):
--    orders, order_status_history, weight_change_history, payments,
--    order_feedback, staff_pre_registrations, and customer_addresses.
--    If any historical reference exists, the account is safely deactivated (is_active = false).
-- 6. Also hardens public.set_staff_active_status(UUID, BOOLEAN) with the same
--    transaction advisory lock to prevent race conditions between deactivation and deletion.
-- ==============================================================================

BEGIN;

-- 1. Ensure Table-Level Direct DELETE Remains Denied
-- Direct table-level DELETE is intentionally NOT granted to authenticated or anon.
REVOKE DELETE, TRUNCATE ON TABLE public.profiles FROM anon, authenticated;

-- Ensure any obsolete DELETE policy does not exist
DROP POLICY IF EXISTS "Owner can delete profiles" ON public.profiles;

-- 2. Hardened Atomic Secure Deletion & Deactivation RPC
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
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: You must be signed in to perform this operation.';
    END IF;

    -- B. Authorization Check (Owner Only)
    v_caller_role := public.current_user_role();
    IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Access denied. Only the business owner is authorized to delete employee accounts.';
    END IF;

    -- C. Concurrency Serialization: Acquire transaction-level advisory lock
    -- Guarantees that concurrent requests cannot race to remove or deactivate all active owners.
    PERFORM pg_advisory_xact_lock(hashtext('superwash_owner_lifecycle_lock'));

    -- D. Retrieve and Lock Target Staff Profile (Row-level exclusive lock)
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
    -- Under the advisory lock, this count is serialized and authoritative across concurrent transactions.
    IF v_staff.role = 'owner' THEN
        SELECT COUNT(*) INTO v_remaining_owners
        FROM public.profiles
        WHERE role = 'owner' AND is_active = true AND id != p_staff_id;

        IF v_remaining_owners < 1 THEN
            RAISE EXCEPTION 'Access denied. Cannot delete the only remaining active business owner.';
        END IF;
    END IF;

    -- H. Comprehensive Historical Audit & Referential Integrity Check
    -- Scans all verified schema relations referencing public.profiles(id)
    SELECT EXISTS (
        -- Order workflow assignments and customer bookings
        SELECT 1 FROM public.orders
        WHERE assigned_pickup_id = p_staff_id
           OR assigned_delivery_id = p_staff_id
           OR pickup_weighed_by = p_staff_id
           OR customer_id = p_staff_id
        UNION ALL
        -- Financial payment intake records
        SELECT 1 FROM public.payments WHERE recorded_by = p_staff_id
        UNION ALL
        -- Order lifecycle status audit trail
        SELECT 1 FROM public.order_status_history WHERE changed_by = p_staff_id
        UNION ALL
        -- Store intake weight corrections
        SELECT 1 FROM public.weight_change_history WHERE changed_by = p_staff_id
        UNION ALL
        -- Customer feedback reviews & reviewer audit
        SELECT 1 FROM public.order_feedback WHERE reviewed_by = p_staff_id OR customer_id = p_staff_id
        UNION ALL
        -- Staff invitations issued
        SELECT 1 FROM public.staff_pre_registrations WHERE created_by = p_staff_id
        UNION ALL
        -- Customer saved pickup addresses
        SELECT 1 FROM public.customer_addresses WHERE user_id = p_staff_id
    ) INTO v_has_audit_records;

    -- I. Safe Deactivation for Staff with Historical Records
    IF v_has_audit_records THEN
        UPDATE public.profiles
        SET is_active = false,
            updated_at = timezone('utc', now())
        WHERE id = p_staff_id;

        RETURN jsonb_build_object(
            'success', true,
            'deactivated_instead', true,
            'message', format('Staff member %s has past operational or order records. To preserve audit history and referential integrity, their account has been safely deactivated instead of deleted.', v_staff.full_name)
        );
    END IF;

    -- J. Permanent Deletion for Unassigned Staff
    DELETE FROM public.profiles WHERE id = p_staff_id;

    RETURN jsonb_build_object(
        'success', true,
        'deactivated_instead', false,
        'message', format('Staff account for %s has been successfully deleted.', v_staff.full_name)
    );
END;
$$;

-- 3. Harden set_staff_active_status with Shared Advisory Lock
CREATE OR REPLACE FUNCTION public.set_staff_active_status(
    p_staff_id UUID,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_current_profile RECORD;
    v_active_owners_count INT;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    -- 1. Authentication Check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: You must be signed in to perform this operation.';
    END IF;

    -- 2. Authorization Check (Owner Only)
    v_caller_role := public.current_user_role();
    IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Access denied. Only the business owner is authorized to activate or deactivate staff accounts.';
    END IF;

    -- 3. Concurrency Serialization: Acquire same transaction-level advisory lock
    PERFORM pg_advisory_xact_lock(hashtext('superwash_owner_lifecycle_lock'));

    -- 4. Fetch and lock target profile
    SELECT * INTO v_current_profile 
    FROM public.profiles 
    WHERE id = p_staff_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member profile not found (ID: %).', p_staff_id;
    END IF;

    -- 5. Primary Owner Protection
    IF LOWER(TRIM(v_current_profile.email)) = 'superwashexprez@gmail.com' AND p_is_active = false THEN
        RAISE EXCEPTION 'The permanent primary owner account (superwashexprez@gmail.com) cannot be deactivated.';
    END IF;

    -- 6. Self-Deactivation Prevention
    IF p_staff_id = v_caller_id AND p_is_active = false THEN
        RAISE EXCEPTION 'You cannot deactivate your own owner account.';
    END IF;

    -- 7. Last Active Owner Protection
    IF v_current_profile.role = 'owner' AND p_is_active = false THEN
        SELECT count(*) INTO v_active_owners_count
        FROM public.profiles
        WHERE role = 'owner' AND is_active = true AND id != p_staff_id;

        IF v_active_owners_count < 1 THEN
            RAISE EXCEPTION 'Cannot deactivate the last active business owner.';
        END IF;
    END IF;

    -- 8. Update status
    UPDATE public.profiles
    SET is_active = p_is_active,
        updated_at = v_now
    WHERE id = p_staff_id;

    RETURN jsonb_build_object(
        'success', true,
        'profile', jsonb_build_object(
            'id', p_staff_id,
            'email', v_current_profile.email,
            'full_name', v_current_profile.full_name,
            'phone', v_current_profile.phone,
            'role', v_current_profile.role,
            'is_active', p_is_active,
            'updated_at', v_now
        )
    );
END;
$$;

-- 4. Restrict Execution Privileges
REVOKE ALL ON FUNCTION public.delete_staff_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_staff_profile(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.set_staff_active_status(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_staff_active_status(UUID, BOOLEAN) TO authenticated;

COMMIT;
