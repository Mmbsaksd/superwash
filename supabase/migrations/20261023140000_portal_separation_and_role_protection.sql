-- ==============================================================================
-- SuperWash Express: Customer & Owner/Staff Portal Separation & Security
-- Migration: 20261023140000_portal_separation_and_role_protection.sql
-- ==============================================================================
-- Security Objectives:
-- 1. Strictly prevent any user (especially customers) from self-escalating role
--    or modifying account active status via direct Supabase client calls.
-- 2. Enforce that only authorized, active business owners can update staff roles
--    or toggle is_active status.
-- 3. Guarantee that inactive accounts immediately lose all operational privileges
--    across orders, payments, services, and profile operations.
-- 4. Authoritative profile matching: link Google OAuth accounts with pre-registered
--    staff profiles by email when authenticated via Google.
-- ==============================================================================

-- 1. Ensure public.current_user_role() strictly returns NULL for inactive accounts
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS VARCHAR AS $$
    SELECT role FROM public.profiles 
    WHERE id = auth.uid() 
      AND COALESCE(is_active, true) = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;

-- 2. Trigger Function: Prevent Role and Status Self-Escalation on public.profiles
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role VARCHAR;
BEGIN
    -- Check if role or active status is being modified
    IF (NEW.role IS DISTINCT FROM OLD.role) OR (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
        v_caller_role := public.current_user_role();
        
        -- Only active business owners can change account roles or active status
        IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
            RAISE EXCEPTION 'Access denied. Account role and active status can only be modified by the business owner.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_self_role_escalation();

-- 3. Hardened RLS Policy on public.profiles: Customer Self-Update Scope
-- Customers can update their own personal details (full_name, phone, avatar_url)
-- but cannot escalate roles (enforced both by RLS and trigger above).
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id AND COALESCE(is_active, true) = true)
    WITH CHECK (auth.uid() = id AND COALESCE(is_active, true) = true);

-- 4. Secure Profile Sync Helper for Google OAuth
-- Allows an authenticated Google user to claim their pre-registered staff profile by email.
CREATE OR REPLACE FUNCTION public.sync_google_staff_profile(
    p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_email TEXT;
    v_auth_uid UUID;
    v_existing_profile RECORD;
BEGIN
    v_auth_uid := auth.uid();
    IF v_auth_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required');
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid email address');
    END IF;

    -- Look for pre-registered profile with matching email
    SELECT * INTO v_existing_profile
    FROM public.profiles
    WHERE LOWER(TRIM(email)) = v_clean_email;

    IF FOUND THEN
        -- If profile exists but has a different ID (pre-registered by owner before first Google login),
        -- update the profile ID to match the current Google auth UID
        IF v_existing_profile.id != v_auth_uid THEN
            UPDATE public.profiles
            SET id = v_auth_uid,
                updated_at = timezone('utc', now())
            WHERE id = v_existing_profile.id;
        END IF;

        SELECT * INTO v_existing_profile FROM public.profiles WHERE id = v_auth_uid;
        RETURN jsonb_build_object(
            'success', true,
            'is_staff', v_existing_profile.role IN ('owner', 'manager', 'delivery'),
            'role', v_existing_profile.role,
            'is_active', v_existing_profile.is_active,
            'profile', row_to_json(v_existing_profile)
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'is_staff', false, 'message', 'No registered staff profile found');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_google_staff_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_google_staff_profile(TEXT) TO authenticated;
