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
-- Securely links an authenticated Google user to a pre-registered staff record by email,
-- without mutating existing primary key IDs or risking foreign key constraint violations.
-- Cryptographic Check: Authoritative email is strictly extracted from the authenticated Google identity (auth.users / auth.jwt); frontend-supplied email spoofing is rejected.
CREATE OR REPLACE FUNCTION public.sync_google_staff_profile(
    p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_email TEXT;
    v_auth_email TEXT;
    v_auth_uid UUID;
    v_profile RECORD;
    v_pre_reg RECORD;
    v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
    v_auth_uid := auth.uid();
    IF v_auth_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authentication required');
    END IF;

    -- 1. Authoritative Identity Verification: Extract verified Google email from auth session
    SELECT LOWER(TRIM(email)) INTO v_auth_email 
    FROM auth.users 
    WHERE id = v_auth_uid;

    IF v_auth_email IS NULL THEN
        v_auth_email := LOWER(TRIM(auth.jwt()->>'email'));
    END IF;

    IF v_auth_email IS NULL OR v_auth_email = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Authenticated Google account has no verified email');
    END IF;

    -- 2. Anti-spoofing check: If frontend supplied an email, verify it strictly matches the authenticated Google account
    IF p_email IS NOT NULL AND TRIM(p_email) != '' THEN
        v_clean_email := LOWER(TRIM(p_email));
        IF v_clean_email != v_auth_email THEN
            RAISE EXCEPTION 'Security violation: Authenticated Google identity (%) does not match requested email (%).',
                v_auth_email, v_clean_email;
        END IF;
    ELSE
        v_clean_email := v_auth_email;
    END IF;

    -- 3. Check if user already has an authentic profile matching their auth.uid()
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_auth_uid;

    -- 4. Check if an active staff pre-registration exists for this verified email
    SELECT * INTO v_pre_reg 
    FROM public.staff_pre_registrations
    WHERE LOWER(TRIM(email)) = v_clean_email
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;

    -- If a pre-registration exists, link it to the user's authentic Google UUID
    IF FOUND THEN
        IF v_profile.id IS NOT NULL THEN
            -- Update profile details without changing primary key
            UPDATE public.profiles
            SET role = v_pre_reg.role,
                phone = COALESCE(v_profile.phone, v_pre_reg.phone),
                full_name = COALESCE(v_pre_reg.full_name, v_profile.full_name),
                is_active = true,
                updated_at = v_now
            WHERE id = v_auth_uid;
        ELSE
            -- Provision profile with pre-registered staff role
            INSERT INTO public.profiles (
                id,
                email,
                full_name,
                phone,
                role,
                is_active,
                created_at,
                updated_at
            ) VALUES (
                v_auth_uid,
                v_clean_email,
                v_pre_reg.full_name,
                v_pre_reg.phone,
                v_pre_reg.role,
                true,
                v_now,
                v_now
            );
        END IF;

        -- Mark pre-registration claimed
        UPDATE public.staff_pre_registrations
        SET claimed_at = v_now,
            claimed_by = v_auth_uid,
            updated_at = v_now
        WHERE id = v_pre_reg.id;

        -- Sync auth metadata
        UPDATE auth.users
        SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
                'full_name', v_pre_reg.full_name,
                'phone', v_pre_reg.phone,
                'role', v_pre_reg.role
            ),
            updated_at = v_now
        WHERE id = v_auth_uid;

        SELECT * INTO v_profile FROM public.profiles WHERE id = v_auth_uid;
        RETURN jsonb_build_object(
            'success', true,
            'is_staff', true,
            'role', v_profile.role,
            'is_active', v_profile.is_active,
            'profile', row_to_json(v_profile)
        );
    END IF;

    -- 3. If no pre-registration, but an authentic profile already exists
    IF v_profile.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_staff', v_profile.role IN ('owner', 'manager', 'delivery'),
            'role', v_profile.role,
            'is_active', v_profile.is_active,
            'profile', row_to_json(v_profile)
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'is_staff', false, 'message', 'No registered staff profile found');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_google_staff_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_google_staff_profile(TEXT) TO authenticated;
