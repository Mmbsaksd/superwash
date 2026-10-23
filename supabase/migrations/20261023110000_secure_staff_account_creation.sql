-- ==============================================================================
-- SuperWash Express: Secure Server-Side Staff Account Creation RPC
-- Migration: 20261023110000_secure_staff_account_creation.sql
-- ==============================================================================
-- Enables the authenticated business owner to securely create staff accounts
-- directly in Supabase Auth (auth.users) and link them to public.profiles
-- with the authoritative operational role (manager / delivery).
--
-- Security Properties:
-- 1. SECURITY DEFINER with explicit search_path = public, auth, extensions, pg_temp.
-- 2. Authorization check: public.current_user_role() MUST be 'owner'.
-- 3. Validation: strict email regex, 10-digit Indian phone, role check ('manager', 'delivery').
-- 4. Duplicate protection: checks both auth.users and public.profiles.
-- 5. Passwords encrypted using PostgreSQL pgcrypto bcrypt (extensions.crypt).
-- 6. Direct execution granted strictly to authenticated owner; revoked from public.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_staff_account(
    p_email TEXT,
    p_phone TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_password TEXT DEFAULT NULL
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
    v_user_id UUID;
    v_encrypted_pw TEXT;
    v_now TIMESTAMPTZ := timezone('utc', now());
    v_caller_role TEXT;
BEGIN
    -- 1. Authorization: Only business owners can create staff accounts
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

    -- 3. Check for duplicates in public.profiles
    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(TRIM(email)) = v_clean_email) THEN
        RAISE EXCEPTION 'An account with email % already exists.', v_clean_email;
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE phone = v_clean_phone) THEN
        RAISE EXCEPTION 'A staff member with phone number % already exists.', v_clean_phone;
    END IF;

    -- 4. Check for duplicates in auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(TRIM(email)) = v_clean_email) THEN
        RAISE EXCEPTION 'An Auth user with email % already exists.', v_clean_email;
    END IF;

    -- 5. Generate secure UUID and hash password using pgcrypto bcrypt
    v_user_id := gen_random_uuid();
    IF p_password IS NOT NULL AND length(TRIM(p_password)) >= 8 THEN
        v_encrypted_pw := extensions.crypt(TRIM(p_password), extensions.gen_salt('bf'));
    ELSE
        -- Temporary random secret
        v_encrypted_pw := extensions.crypt(gen_random_uuid()::text || 'SuperWash@2026', extensions.gen_salt('bf'));
    END IF;

    -- 6. Insert user into auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        v_clean_email,
        v_encrypted_pw,
        v_now,
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
            'full_name', v_clean_name,
            'phone', v_clean_phone,
            'role', p_role
        ),
        v_now,
        v_now
    );

    -- 7. Insert into public.profiles
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
        v_user_id,
        v_clean_email,
        v_clean_name,
        v_clean_phone,
        p_role,
        true,
        v_now,
        v_now
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        is_active = true,
        updated_at = v_now;

    RETURN jsonb_build_object(
        'success', true,
        'profile', jsonb_build_object(
            'id', v_user_id,
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

-- Revoke public access; only authenticated users can invoke the RPC (which checks role = 'owner')
REVOKE EXECUTE ON FUNCTION public.create_staff_account(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_account(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
