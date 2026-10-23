-- ==============================================================================
-- SuperWash Express: Staff Management & Inactive Account Enforcement
-- Migration: 20261023120000_staff_management_enhancements.sql
-- ==============================================================================
-- Enables the authenticated business owner to:
-- 1. Safely update employee details (full name, phone, role) with duplicate checks.
-- 2. Activate or deactivate employees with owner self-protection.
-- 3. Enforce that inactive staff accounts immediately lose all database privileges
--    by updating public.current_user_role() to only return roles for active accounts.
-- 4. Protect the last active owner from accidental demotion or deactivation.
-- ==============================================================================

-- 1. Enforce that public.current_user_role() only returns role for active accounts
--    When an employee is deactivated (is_active = false), current_user_role() returns NULL,
--    instantly causing all RLS policies (orders, payments, notifications, services)
--    and database triggers to deny access, even if an unexpired JWT exists.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS VARCHAR AS $$
    SELECT role FROM public.profiles 
    WHERE id = auth.uid() 
      AND COALESCE(is_active, true) = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;

-- 2. Ensure business owners have an explicit RLS policy to update profiles
DROP POLICY IF EXISTS "Owner can update profiles" ON public.profiles;
CREATE POLICY "Owner can update profiles"
    ON public.profiles
    FOR UPDATE
    USING (public.current_user_role() = 'owner')
    WITH CHECK (public.current_user_role() = 'owner');

-- 3. Secure Atomic RPC: Update Staff Profile
CREATE OR REPLACE FUNCTION public.update_staff_profile(
    p_staff_id UUID,
    p_full_name TEXT,
    p_phone TEXT,
    p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_current_profile RECORD;
    v_active_owners_count INT;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    -- 1. Authorization: Only active business owners can update staff profiles
    v_caller_role := public.current_user_role();
    IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Access denied. Only the business owner is authorized to update employee details.';
    END IF;

    -- 2. Fetch existing profile
    SELECT * INTO v_current_profile FROM public.profiles WHERE id = p_staff_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Employee profile not found (ID: %).', p_staff_id;
    END IF;

    -- 3. Clean and validate inputs
    v_clean_name := TRIM(p_full_name);
    v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
    IF length(v_clean_phone) > 10 THEN
        v_clean_phone := RIGHT(v_clean_phone, 10);
    END IF;

    IF v_clean_name IS NULL OR length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'Full name must be at least 2 characters.';
    END IF;

    IF length(v_clean_phone) != 10 THEN
        RAISE EXCEPTION 'Please enter a valid 10-digit Indian phone number.';
    END IF;

    IF p_role IS NULL OR p_role NOT IN ('owner', 'manager', 'delivery') THEN
        RAISE EXCEPTION 'Role must be either manager or delivery.';
    END IF;

    -- 4. Owner Protection: Prevent demoting the last active owner
    IF v_current_profile.role = 'owner' AND p_role != 'owner' THEN
        SELECT count(*) INTO v_active_owners_count
        FROM public.profiles
        WHERE role = 'owner' AND is_active = true AND id != p_staff_id;

        IF v_active_owners_count = 0 THEN
            RAISE EXCEPTION 'Cannot demote the last active business owner. The system must have at least one active owner.';
        END IF;
    END IF;

    -- 5. Owner Protection: Prevent an owner from demoting themselves directly from staff accounts
    IF p_staff_id = auth.uid() AND p_role != 'owner' THEN
        RAISE EXCEPTION 'Business owners cannot demote their own account role.';
    END IF;

    -- 6. Duplicate phone collision check across all other profiles
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE phone = v_clean_phone AND id != p_staff_id
    ) THEN
        RAISE EXCEPTION 'Phone number % is already associated with another account.', v_clean_phone;
    END IF;

    -- 7. Update public.profiles
    UPDATE public.profiles
    SET full_name = v_clean_name,
        phone = v_clean_phone,
        role = p_role,
        updated_at = v_now
    WHERE id = p_staff_id;

    -- 8. Sync metadata in auth.users
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
            'full_name', v_clean_name,
            'phone', v_clean_phone,
            'role', p_role
        ),
        updated_at = v_now
    WHERE id = p_staff_id;

    RETURN jsonb_build_object(
        'success', true,
        'profile', jsonb_build_object(
            'id', p_staff_id,
            'email', v_current_profile.email,
            'full_name', v_clean_name,
            'phone', v_clean_phone,
            'role', p_role,
            'is_active', v_current_profile.is_active,
            'updated_at', v_now
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_staff_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_staff_profile(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 4. Secure Atomic RPC: Set Staff Active/Inactive Status
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
    v_caller_role TEXT;
    v_current_profile RECORD;
    v_active_owners_count INT;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    -- 1. Authorization: Only active business owners can activate or deactivate accounts
    v_caller_role := public.current_user_role();
    IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Access denied. Only the business owner is authorized to activate or deactivate staff accounts.';
    END IF;

    -- 2. Fetch target profile
    SELECT * INTO v_current_profile FROM public.profiles WHERE id = p_staff_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member profile not found (ID: %).', p_staff_id;
    END IF;

    -- 3. Owner Protection: Owners cannot deactivate themselves
    IF p_staff_id = auth.uid() AND p_is_active = false THEN
        RAISE EXCEPTION 'You cannot deactivate your own owner account.';
    END IF;

    -- 4. Owner Protection: Cannot deactivate the last active owner
    IF v_current_profile.role = 'owner' AND p_is_active = false THEN
        SELECT count(*) INTO v_active_owners_count
        FROM public.profiles
        WHERE role = 'owner' AND is_active = true AND id != p_staff_id;

        IF v_active_owners_count = 0 THEN
            RAISE EXCEPTION 'Cannot deactivate the last active business owner.';
        END IF;
    END IF;

    -- 5. Update status
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

REVOKE EXECUTE ON FUNCTION public.set_staff_active_status(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_staff_active_status(UUID, BOOLEAN) TO authenticated;
