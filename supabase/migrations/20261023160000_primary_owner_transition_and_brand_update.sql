-- ==============================================================================
-- SuperWash Exprez: Permanent Primary Owner Transition & Brand Consistency
-- Migration: 20261023160000_primary_owner_transition_and_brand_update.sql
-- ==============================================================================
-- Objectives:
-- 1. Promote existing Google account superwashexprez@gmail.com to permanent primary owner.
-- 2. Preserve existing profile ID (509b4498-6b6a-4c3f-a80a-9c7992ea998d) and personal identity.
-- 3. Update official business settings brand name to 'SuperWash Exprez' across all records.
-- 4. Enforce continuous database-level protections preventing deactivation, demotion,
--    or deletion of the permanent primary owner WITHOUT disabling triggers.
-- 5. Guarantee at least one active business owner exists at all times.
-- 6. Keep existing owners (bs.munavar@gmail.com, genaidream@gmail.com) active and intact.
-- 7. Add defense-in-depth RPC safeguards across all staff management procedures.
-- ==============================================================================

-- 1. Update Business Settings Brand Name to 'SuperWash Exprez'
UPDATE public.business_settings
SET business_name = 'SuperWash Exprez',
    updated_at = timezone('utc', now())
WHERE id IS NOT NULL;

-- Update column default for any future records
ALTER TABLE public.business_settings
    ALTER COLUMN business_name SET DEFAULT 'SuperWash Exprez';

-- 2. Install Hardened Role & Status Protection Trigger Function FIRST
-- By replacing the function before running the UPDATE, the trigger remains continuously
-- active and enforced with NO NEED to disable or drop the trigger.
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role VARCHAR;
BEGIN
    -- Allow direct superuser / service-role execution without an authenticated JWT (e.g. system migrations)
    IF auth.uid() IS NULL AND (CURRENT_USER IN ('postgres', 'service_role', 'supabase_admin')) THEN
        -- Still enforce that superwashexprez@gmail.com cannot be demoted or deactivated even in system context
        IF LOWER(TRIM(OLD.email)) = 'superwashexprez@gmail.com' THEN
            IF NEW.role != 'owner' THEN
                RAISE EXCEPTION 'Access denied. The permanent primary owner (superwashexprez@gmail.com) cannot be demoted.';
            END IF;
            IF NEW.is_active IS DISTINCT FROM true THEN
                RAISE EXCEPTION 'Access denied. The permanent primary owner (superwashexprez@gmail.com) cannot be deactivated.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Check if role or active status is being modified
    IF (NEW.role IS DISTINCT FROM OLD.role) OR (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
        v_caller_role := public.current_user_role();
        
        -- Only active business owners can change account roles or active status
        IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
            RAISE EXCEPTION 'Access denied. Account role and active status can only be modified by the business owner.';
        END IF;

        -- Permanent Primary Owner Invariant:
        -- superwashexprez@gmail.com cannot be deactivated or demoted by any caller, manager, or owner
        IF LOWER(TRIM(OLD.email)) = 'superwashexprez@gmail.com' THEN
            IF NEW.role != 'owner' THEN
                RAISE EXCEPTION 'Access denied. The permanent primary owner (superwashexprez@gmail.com) cannot be demoted.';
            END IF;
            IF NEW.is_active IS DISTINCT FROM true THEN
                RAISE EXCEPTION 'Access denied. The permanent primary owner (superwashexprez@gmail.com) cannot be deactivated.';
            END IF;
        END IF;

        -- Minimum Active Owners Invariant:
        -- Prevent demoting or deactivating the last remaining active owner
        IF OLD.role = 'owner' AND (NEW.role != 'owner' OR NEW.is_active != true) THEN
            IF (SELECT COUNT(*) FROM public.profiles WHERE role = 'owner' AND is_active = true AND id != OLD.id) < 1 THEN
                RAISE EXCEPTION 'Access denied. The system requires at least one active business owner.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Ensure trigger is attached and active
DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_self_role_escalation();

-- 3. Promote Existing superwashexprez@gmail.com Profile to Primary Owner
-- Preserves existing profile UUID and personal name; updates role to 'owner'
-- Triggers remain fully enabled throughout this execution.
UPDATE public.profiles
SET role = 'owner',
    is_active = true,
    updated_at = timezone('utc', now())
WHERE LOWER(TRIM(email)) = 'superwashexprez@gmail.com';

-- Synchronize auth metadata role for the authenticated identity
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'owner'),
    updated_at = timezone('utc', now())
WHERE LOWER(TRIM(email)) = 'superwashexprez@gmail.com';

-- 4. Primary Owner Deletion Safeguard Trigger
CREATE OR REPLACE FUNCTION public.prevent_primary_owner_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Permanent Primary Owner cannot be deleted through any application path
    IF LOWER(TRIM(OLD.email)) = 'superwashexprez@gmail.com' THEN
        RAISE EXCEPTION 'Access denied. The permanent primary owner account (superwashexprez@gmail.com) cannot be deleted.';
    END IF;

    -- Also reject deleting the last remaining active owner
    IF OLD.role = 'owner' THEN
        IF (SELECT COUNT(*) FROM public.profiles WHERE role = 'owner' AND is_active = true AND id != OLD.id) < 1 THEN
            RAISE EXCEPTION 'Access denied. Cannot delete the only remaining active business owner.';
        END IF;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_primary_owner_deletion ON public.profiles;
CREATE TRIGGER trg_prevent_primary_owner_deletion
    BEFORE DELETE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_primary_owner_deletion();

-- 5. Defense-in-Depth: Harden Staff Management RPCs Against Primary Owner Modification

-- 5A. Update Staff Profile RPC: Prohibit Demoting the Permanent Primary Owner
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

    -- 3. Permanent Primary Owner Invariant: Cannot be demoted through RPC
    IF LOWER(TRIM(v_current_profile.email)) = 'superwashexprez@gmail.com' AND p_role != 'owner' THEN
        RAISE EXCEPTION 'Access denied. The permanent primary owner (superwashexprez@gmail.com) cannot be demoted.';
    END IF;

    -- 4. Clean and validate inputs
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
        RAISE EXCEPTION 'Role must be either owner, manager, or delivery.';
    END IF;

    -- 5. Owner Protection: Prevent demoting the last active owner
    IF v_current_profile.role = 'owner' AND p_role != 'owner' THEN
        SELECT count(*) INTO v_active_owners_count
        FROM public.profiles
        WHERE role = 'owner' AND is_active = true AND id != p_staff_id;

        IF v_active_owners_count = 0 THEN
            RAISE EXCEPTION 'Cannot demote the last active business owner. The system must have at least one active owner.';
        END IF;
    END IF;

    -- 6. Owner Protection: Prevent an owner from demoting themselves directly from staff accounts
    IF p_staff_id = auth.uid() AND p_role != 'owner' THEN
        RAISE EXCEPTION 'Business owners cannot demote their own account role.';
    END IF;

    -- 7. Duplicate phone collision check across all other profiles
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE phone = v_clean_phone AND id != p_staff_id
    ) THEN
        RAISE EXCEPTION 'Phone number % is already associated with another account.', v_clean_phone;
    END IF;

    -- 8. Update public.profiles
    UPDATE public.profiles
    SET full_name = v_clean_name,
        phone = v_clean_phone,
        role = p_role,
        updated_at = v_now
    WHERE id = p_staff_id;

    -- 9. Sync metadata in auth.users
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

-- 5B. Set Staff Active Status RPC: Prohibit Deactivating the Permanent Primary Owner
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

    -- 3. Permanent Primary Owner Invariant: Cannot be deactivated through RPC
    IF LOWER(TRIM(v_current_profile.email)) = 'superwashexprez@gmail.com' AND p_is_active = false THEN
        RAISE EXCEPTION 'Access denied. The permanent primary owner (superwashexprez@gmail.com) cannot be deactivated.';
    END IF;

    -- 4. Owner Protection: Owners cannot deactivate themselves
    IF p_staff_id = auth.uid() AND p_is_active = false THEN
        RAISE EXCEPTION 'You cannot deactivate your own owner account.';
    END IF;

    -- 5. Owner Protection: Cannot deactivate the last active owner
    IF v_current_profile.role = 'owner' AND p_is_active = false THEN
        SELECT count(*) INTO v_active_owners_count
        FROM public.profiles
        WHERE role = 'owner' AND is_active = true AND id != p_staff_id;

        IF v_active_owners_count = 0 THEN
            RAISE EXCEPTION 'Cannot deactivate the last active business owner.';
        END IF;
    END IF;

    -- 6. Update status
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

-- 5C. Pre-register Staff RPC: Prohibit Pre-registering Primary Owner as Operational Staff
CREATE OR REPLACE FUNCTION public.pre_register_staff(
    p_email TEXT,
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
    v_clean_email TEXT;
    v_clean_phone TEXT;
    v_clean_name TEXT;
    v_now TIMESTAMPTZ := timezone('utc', now());
    v_caller_role TEXT;
    v_existing_profile RECORD;
    v_pre_reg_id UUID;
BEGIN
    -- 1. Authorization: Only active business owners can create or pre-register staff
    v_caller_role := public.current_user_role();
    IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Access denied. Only the business owner is authorized to create staff accounts.';
    END IF;

    -- 2. Clean and validate inputs
    v_clean_email := LOWER(TRIM(p_email));
    v_clean_name := TRIM(p_full_name);
    v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
    IF length(v_clean_phone) > 10 THEN
        v_clean_phone := RIGHT(v_clean_phone, 10);
    END IF;

    -- Permanent Primary Owner Protection
    IF v_clean_email = 'superwashexprez@gmail.com' THEN
        RAISE EXCEPTION 'Access denied. The permanent primary owner account (superwashexprez@gmail.com) cannot be invited as operational staff.';
    END IF;

    IF v_clean_email IS NULL OR v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'A valid email address is required.';
    END IF;

    IF v_clean_name IS NULL OR length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'Full name must be at least 2 characters.';
    END IF;

    IF length(v_clean_phone) != 10 THEN
        RAISE EXCEPTION 'Please enter a valid 10-digit Indian phone number.';
    END IF;

    IF p_role IS NULL OR p_role NOT IN ('manager', 'delivery') THEN
        RAISE EXCEPTION 'Operational role must be either manager or delivery.';
    END IF;

    -- 3. Duplicate phone collision check across all existing profiles
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE phone = v_clean_phone AND LOWER(TRIM(email)) != v_clean_email
    ) THEN
        RAISE EXCEPTION 'A staff member with phone number % already exists.', v_clean_phone;
    END IF;

    -- 4. Fast path: If an authentic profile already exists (user already logged into Google before)
    SELECT * INTO v_existing_profile 
    FROM public.profiles 
    WHERE LOWER(TRIM(email)) = v_clean_email;

    IF FOUND THEN
        -- If user is already active staff with identical role, prevent redundant action
        IF v_existing_profile.role = p_role AND v_existing_profile.is_active = true THEN
            RAISE EXCEPTION 'An active staff member with email % already exists.', v_clean_email;
        END IF;

        -- Promote / update existing profile in place: ID is preserved, foreign keys remain intact
        UPDATE public.profiles
        SET full_name = v_clean_name,
            phone = v_clean_phone,
            role = p_role,
            is_active = true,
            updated_at = v_now
        WHERE id = v_existing_profile.id;

        -- Sync metadata on auth.users if available
        UPDATE auth.users
        SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
                'full_name', v_clean_name,
                'phone', v_clean_phone,
                'role', p_role
            ),
            updated_at = v_now
        WHERE id = v_existing_profile.id;

        RETURN jsonb_build_object(
            'success', true,
            'is_pre_registered', false,
            'profile', jsonb_build_object(
                'id', v_existing_profile.id,
                'email', v_clean_email,
                'full_name', v_clean_name,
                'phone', v_clean_phone,
                'role', p_role,
                'is_active', true,
                'created_at', v_existing_profile.created_at
            )
        );
    END IF;

    -- 5. Standard path: User has not signed in via Google yet.
    -- Store in pre-registrations ledger without touching auth.users.
    INSERT INTO public.staff_pre_registrations (
        email,
        full_name,
        phone,
        role,
        is_active,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_clean_email,
        v_clean_name,
        v_clean_phone,
        p_role,
        true,
        auth.uid(),
        v_now,
        v_now
    ) RETURNING id INTO v_pre_reg_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_pre_registered', true,
        'invitation_id', v_pre_reg_id,
        'message', 'Staff invitation recorded for ' || v_clean_email
    );
END;
$$;
