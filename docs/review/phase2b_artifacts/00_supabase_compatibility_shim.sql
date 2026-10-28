-- ==============================================================================
-- SuperWash Stage 5B Phase 2B: Supabase Test Compatibility Shim
-- ==============================================================================

-- 1. Create Core Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Core Supabase Roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        CREATE ROLE supabase_admin NOLOGIN SUPERUSER;
    END IF;
END $$;

GRANT anon, authenticated, service_role, supabase_admin TO postgres;

-- 3. Create Supabase Realtime Publication
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 4. Create Emulated auth Schema & Tables
CREATE SCHEMA IF NOT EXISTS auth;
GRANT ALL ON SCHEMA auth TO postgres, service_role, supabase_admin;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    aud VARCHAR(255) DEFAULT 'authenticated',
    role VARCHAR(255) DEFAULT 'authenticated',
    email TEXT UNIQUE,
    encrypted_password TEXT DEFAULT '',
    email_confirmed_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    invited_at TIMESTAMPTZ,
    confirmation_token VARCHAR(255) DEFAULT '',
    confirmation_sent_at TIMESTAMPTZ,
    recovery_token VARCHAR(255) DEFAULT '',
    recovery_sent_at TIMESTAMPTZ,
    email_change_token_new VARCHAR(255) DEFAULT '',
    email_change VARCHAR(255) DEFAULT '',
    email_change_sent_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    raw_app_meta_data JSONB DEFAULT '{"provider":"email","providers":["email"]}'::jsonb,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
    is_super_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    phone TEXT UNIQUE DEFAULT NULL,
    phone_confirmed_at TIMESTAMPTZ,
    phone_change TEXT DEFAULT '',
    phone_change_token VARCHAR(255) DEFAULT '',
    phone_change_sent_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    email_change_token_current VARCHAR(255) DEFAULT '',
    email_change_confirm_status SMALLINT DEFAULT 0,
    banned_until TIMESTAMPTZ,
    reauthentication_token VARCHAR(255) DEFAULT '',
    reauthentication_sent_at TIMESTAMPTZ,
    is_sso_user BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ
);
GRANT ALL ON TABLE auth.users TO postgres, service_role, supabase_admin;
GRANT SELECT ON TABLE auth.users TO authenticated;

-- 5. Session Context Simulation Functions
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.email', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.email() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC;
