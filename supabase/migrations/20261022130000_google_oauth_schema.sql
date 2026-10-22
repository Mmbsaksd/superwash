-- ==============================================================================
-- SuperWash Express: Google OAuth Authentication & Profile Migration
-- Migration: 20261022_google_oauth_schema.sql
-- ==============================================================================

-- 1. Update profiles table to support Google OAuth fields
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Phone is now collected after first Google sign-in; drop NOT NULL constraint
ALTER TABLE public.profiles ALTER COLUMN phone DROP NOT NULL;

-- Unique index on email when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone) WHERE phone IS NOT NULL;

-- 2. Trigger on auth.users for automatic profile provisioning on Google OAuth sign-in
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_email TEXT;
    v_full_name TEXT;
    v_avatar TEXT;
    v_role TEXT := 'customer'; -- Strict security: default role is always 'customer'
BEGIN
    v_email := LOWER(TRIM(NEW.email));
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1),
        'Customer'
    );
    v_avatar := NEW.raw_user_meta_data->>'avatar_url';

    -- Insert new customer profile or safely update OAuth metadata without altering existing privileged role
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
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
        v_avatar,
        v_role,
        true,
        timezone('utc', now()),
        timezone('utc', now())
    )
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, profiles.email),
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
        updated_at = timezone('utc', now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- Bind trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Procedure for Safe Staff & Owner Google Account Linking
-- Allows verified staff Google emails to be associated with staff accounts without loose guessing
CREATE OR REPLACE FUNCTION public.link_staff_google_account(
    p_staff_phone VARCHAR(20),
    p_verified_email VARCHAR(255)
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Authorization check: only owners can link staff accounts
    IF public.current_user_role() != 'owner' THEN
        RAISE EXCEPTION 'Only business owners are authorized to link staff accounts.';
    END IF;

    UPDATE public.profiles
    SET email = LOWER(TRIM(p_verified_email)),
        updated_at = timezone('utc', now())
    WHERE phone = p_staff_phone
      AND role IN ('owner', 'manager', 'delivery');

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.link_staff_google_account(VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_staff_google_account(VARCHAR, VARCHAR) TO authenticated;

-- 4. Row Level Security Policies for Profiles
-- Drop legacy and duplicate SELECT policies to ensure a single, least-privilege policy
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Authorized users can view profiles"
    ON public.profiles
    FOR SELECT
    USING (
        -- 1. Users can always view their own profile
        auth.uid() = id
        -- 2. Business owners can view profiles for administrative management
        OR public.current_user_role() = 'owner'
        -- 3. Managers can view staff (for dispatch) and customers with orders
        OR (
            public.current_user_role() = 'manager' AND (
                public.profiles.role IN ('delivery', 'manager')
                OR EXISTS (
                    SELECT 1 FROM public.orders
                    WHERE public.orders.customer_id = public.profiles.id
                )
            )
        )
        -- 4. Delivery personnel can only view customer contact details for orders assigned to them
        OR (
            public.current_user_role() = 'delivery' AND EXISTS (
                SELECT 1 FROM public.orders
                WHERE public.orders.customer_id = public.profiles.id
                  AND public.orders.assigned_delivery_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id AND role = 'customer');
