-- ==============================================================================
-- SuperWash Exprez — Permanent Staff Profile & Auth Deletion
-- Migration: 20261103080000_permanent_staff_deletion.sql
-- ==============================================================================
-- When an authorized owner deletes a staff account:
-- 1. Checks caller authorization (owner only).
-- 2. Concurrency advisory lock.
-- 3. Protects permanent primary owner (superwashexprez@gmail.com).
-- 4. Prevents owner from deleting self.
-- 5. Prevents deleting the last remaining active owner.
-- 6. Deletes associated staff pre-registrations / invitations for that email.
-- 7. Permanently deletes the user from auth.users (cascades to identities, sessions, and profiles).
-- 8. If auth user is already gone, ensures public.profiles row is removed.
-- 9. Does NOT fall back to deactivation.
-- ==============================================================================

BEGIN;

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
    v_staff_email TEXT;
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

    v_staff_email := LOWER(TRIM(v_staff.email));

    -- E. Permanent Primary Owner Protection
    IF v_staff_email = 'superwashexprez@gmail.com' THEN
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

    -- H. Remove associated staff invitations & pre-registrations
    IF v_staff_email IS NOT NULL AND v_staff_email <> '' THEN
        DELETE FROM public.staff_pre_registrations WHERE LOWER(TRIM(email)) = v_staff_email;
    END IF;
    DELETE FROM public.staff_pre_registrations WHERE created_by = p_staff_id;

    -- I. Permanently remove from auth.users (cascades to profiles, identities, and sessions)
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_staff_id) THEN
        DELETE FROM auth.users WHERE id = p_staff_id;
    END IF;

    -- J. Ensure profile is deleted even if auth user was not present
    DELETE FROM public.profiles WHERE id = p_staff_id;

    RETURN jsonb_build_object(
        'success', true,
        'deactivated_instead', false,
        'message', format('Staff account for %s (%s) has been permanently removed.', v_staff.full_name, COALESCE(v_staff_email, 'no email'))
    );
END;
$$;

-- Grant execution permission
GRANT EXECUTE ON FUNCTION public.delete_staff_profile(UUID) TO authenticated, service_role;

COMMIT;
