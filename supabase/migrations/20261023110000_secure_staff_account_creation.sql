-- ==============================================================================
-- SuperWash Express: Google-First Staff Pre-Registration & Secure Linking
-- Migration: 20261023110000_secure_staff_account_creation.sql
-- ==============================================================================
-- Architecture Properties:
-- 1. Strictly Google OAuth aligned: Zero direct SQL insertions into auth.users,
--    zero passwords, zero fake/temporary identities created.
-- 2. Business owner pre-registers staff by Google email, full name, phone, and role.
-- 3. Dedicated public.staff_pre_registrations ledger holds pending invitations.
-- 4. When staff sign in via Google OAuth for the first time, public.handle_new_user()
--    automatically links their real Google auth UUID to the pre-registered profile
--    with the authoritative operational role (manager / delivery).
-- 5. If the user already has an existing profile, their authentic profile is updated
--    in place without altering their primary key ID, preserving all foreign keys.
-- 6. SECURITY DEFINER with search_path = public, auth, extensions, pg_temp.
-- ==============================================================================

-- 1. Create Staff Pre-Registration Ledger
CREATE TABLE IF NOT EXISTS public.staff_pre_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('manager', 'delivery')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    claimed_at TIMESTAMPTZ DEFAULT NULL,
    claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT staff_pre_reg_email_unique UNIQUE (email)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_pre_reg_email_lower
    ON public.staff_pre_registrations (LOWER(TRIM(email)));

-- Enable RLS on staff_pre_registrations
ALTER TABLE public.staff_pre_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can manage staff pre-registrations" ON public.staff_pre_registrations;
CREATE POLICY "Owner can manage staff pre-registrations"
    ON public.staff_pre_registrations
    FOR ALL
    USING (public.current_user_role() = 'owner')
    WITH CHECK (public.current_user_role() = 'owner');

DROP POLICY IF EXISTS "Users can read own pre-registration" ON public.staff_pre_registrations;
CREATE POLICY "Users can read own pre-registration"
    ON public.staff_pre_registrations
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt()->>'email')));

REVOKE ALL ON TABLE public.staff_pre_registrations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_pre_registrations TO authenticated;

-- 2. Secure RPC: Pre-Register or Assign Staff Account (Owner Only)
CREATE OR REPLACE FUNCTION public.create_staff_account(
    p_email TEXT,
    p_phone TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_password TEXT DEFAULT NULL -- Kept for signature compatibility; ignored in Google-only auth
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
    )
    ON CONFLICT (email) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        is_active = true,
        claimed_at = NULL,
        claimed_by = NULL,
        updated_at = v_now
    RETURNING id INTO v_pre_reg_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_pre_registered', true,
        'profile', jsonb_build_object(
            'id', v_pre_reg_id,
            'email', v_clean_email,
            'full_name', v_clean_name,
            'phone', v_clean_phone,
            'role', p_role,
            'is_active', true,
            'created_at', v_now
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_staff_account(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_account(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 3. Update public.handle_new_user() trigger on auth.users
-- Automatically claims matching pre-registrations when staff sign in via Google for the first time
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_email TEXT;
    v_full_name TEXT;
    v_avatar TEXT;
    v_role TEXT := 'customer';
    v_phone TEXT := NULL;
    v_pre_reg RECORD;
BEGIN
    v_email := LOWER(TRIM(NEW.email));
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1),
        'Customer'
    );
    v_avatar := NEW.raw_user_meta_data->>'avatar_url';

    -- Check if this email was pre-registered as staff by the business owner
    IF v_email IS NOT NULL AND v_email != '' THEN
        SELECT * INTO v_pre_reg
        FROM public.staff_pre_registrations
        WHERE LOWER(TRIM(email)) = v_email
          AND is_active = true
          AND claimed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
            v_role := v_pre_reg.role;
            v_full_name := COALESCE(v_pre_reg.full_name, v_full_name);
            v_phone := v_pre_reg.phone;

            -- Mark pre-registration as claimed by this authentic Google user
            UPDATE public.staff_pre_registrations
            SET claimed_at = timezone('utc', now()),
                claimed_by = NEW.id,
                updated_at = timezone('utc', now())
            WHERE id = v_pre_reg.id;
        END IF;
    END IF;

    -- Insert new profile with authentic Google UUID as primary key
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        phone,
        avatar_url,
        role,
        is_active,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        v_email,
        v_full_name,
        v_phone,
        v_avatar,
        v_role,
        true,
        timezone('utc', now()),
        timezone('utc', now())
    )
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, profiles.email),
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
        phone = COALESCE(profiles.phone, EXCLUDED.phone),
        role = CASE 
            WHEN profiles.role = 'customer' AND EXCLUDED.role IN ('owner', 'manager', 'delivery') THEN EXCLUDED.role 
            ELSE profiles.role 
        END,
        updated_at = timezone('utc', now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- 4. Secure RPC: Cancel Staff Invitation (Owner Only)
CREATE OR REPLACE FUNCTION public.cancel_staff_invitation(
    p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_email TEXT;
    v_caller_role TEXT;
    v_pre_reg RECORD;
BEGIN
    -- 1. Authorization: Only active business owners can cancel staff invitations
    v_caller_role := public.current_user_role();
    IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Access denied. Only the business owner is authorized to cancel staff invitations.';
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RAISE EXCEPTION 'A valid email address is required.';
    END IF;

    SELECT * INTO v_pre_reg
    FROM public.staff_pre_registrations
    WHERE LOWER(TRIM(email)) = v_clean_email;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'No invitation found for email ' || v_clean_email);
    END IF;

    IF v_pre_reg.claimed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot cancel invitation: This staff account has already been claimed and activated. Use deactivation instead.';
    END IF;

    DELETE FROM public.staff_pre_registrations WHERE id = v_pre_reg.id;

    RETURN jsonb_build_object('success', true, 'message', 'Staff invitation for ' || v_clean_email || ' has been cancelled.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_staff_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_staff_invitation(TEXT) TO authenticated;
