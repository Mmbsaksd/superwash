-- ==============================================================================
-- SuperWash Express: Admin Role Resolution, Staff Seeding & Realtime Setup
-- Migration: 20261022160000_fix_admin_role_and_staff_seeding.sql
-- ==============================================================================

-- 1. Fix trigger on public.profiles to allow database admin/migrations
--    to update roles when auth.uid() is null (superuser/migration context),
--    while maintaining strict security against customer self-promotion.
CREATE OR REPLACE FUNCTION public.check_profile_role_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow direct administrative/migration operations (auth.uid() is NULL)
    IF auth.uid() IS NULL THEN
        NEW.updated_at := timezone('utc', now());
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Prevent non-owners from creating accounts with privileged roles
        IF NEW.role IS NOT NULL AND NEW.role != 'customer' THEN
            IF COALESCE(public.current_user_role(), '') != 'owner' THEN
                RAISE EXCEPTION 'New profiles must have the customer role. Only business owners can assign staff roles.';
            END IF;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If role is being changed and user is not an owner, reject
        IF OLD.role IS DISTINCT FROM NEW.role THEN
            IF COALESCE(public.current_user_role(), '') != 'owner' THEN
                RAISE EXCEPTION 'Only business owners are authorized to change user roles.';
            END IF;
        END IF;
    END IF;
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 2. Promote application administrator profile(s) to 'owner'
UPDATE public.profiles
SET role = 'owner', updated_at = timezone('utc', now())
WHERE email = 'genaidream@gmail.com';

-- 3. Seed authoritative staff auth users and profiles with standard UUIDs
--    Ensures foreign keys on orders (assigned_pickup_id, assigned_delivery_id) succeed
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
) VALUES
    ('00000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@superwash.in', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Rajesh Sharma"}', now(), now()),
    ('00000000-0000-4000-a000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@superwash.in', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ananya Verma"}', now(), now()),
    ('00000000-0000-4000-a000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ramesh@superwash.in', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ramesh Kumar"}', now(), now()),
    ('00000000-0000-4000-a000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'suresh@superwash.in', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Suresh Kumar"}', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Seed profiles explicitly (in case trigger was bypassed or for idempotency)
INSERT INTO public.profiles (id, email, full_name, phone, role, is_active, created_at, updated_at)
VALUES
    ('00000000-0000-4000-a000-000000000001', 'owner@superwash.in', 'Rajesh Sharma', '9876543210', 'owner', true, timezone('utc', now()), timezone('utc', now())),
    ('00000000-0000-4000-a000-000000000002', 'manager@superwash.in', 'Ananya Verma', '9876543211', 'manager', true, timezone('utc', now()), timezone('utc', now())),
    ('00000000-0000-4000-a000-000000000003', 'ramesh@superwash.in', 'Ramesh Kumar', '9876543215', 'delivery', true, timezone('utc', now()), timezone('utc', now())),
    ('00000000-0000-4000-a000-000000000004', 'suresh@superwash.in', 'Suresh Kumar', '9876543216', 'delivery', true, timezone('utc', now()), timezone('utc', now()))
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active,
    updated_at = timezone('utc', now());

-- 4. Enable Supabase Realtime publication for orders table
--    Enables instant broadcast of booking creations, assignments, and status updates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
END $$;
