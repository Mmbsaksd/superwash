-- ==============================================================================
-- SuperWash Exprez — Fix Service Catalogue Management Privileges & RLS
-- Migration: 20261027120000_fix_services_catalogue_permissions.sql
-- ==============================================================================
-- Purpose:
-- 1. Grant INSERT and DELETE privileges on public.services to authenticated role.
--    (Previously only SELECT and UPDATE were granted in 20261022140000, which blocked
--     the business owner/admin from adding new services or deleting unreferenced services).
-- 2. Explicitly re-affirm and harden RLS policies on public.services so that only
--    active 'owner' accounts can insert, update, or delete services, with explicit
--    USING and WITH CHECK clauses.
-- 3. Preserve public and customer read access to active services for catalog browsing and booking.
-- 4. Strictly restrict untrusted 'anon' role to SELECT only.
-- ==============================================================================

BEGIN;

-- 1. Grant Table DML Privileges to authenticated role
-- RLS policies below restrict actual write execution exclusively to role = 'owner'.
GRANT INSERT, UPDATE, DELETE ON TABLE public.services TO authenticated;

-- Ensure anon role has strictly SELECT privileges for active service discovery
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.services FROM anon;
GRANT SELECT ON TABLE public.services TO anon;

-- 2. Explicitly Re-affirm and Harden Services RLS Policies
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Preserve public and customer read access to active services (and staff to all services)
DROP POLICY IF EXISTS "Public can view active services" ON public.services;
CREATE POLICY "Public can view active services" ON public.services
    FOR SELECT USING (
        is_active = true
        OR public.current_user_role() IN ('owner', 'manager', 'delivery')
    );

-- Strict Owner Full Management Policy with explicit USING and WITH CHECK guards
DROP POLICY IF EXISTS "Owner can manage services" ON public.services;
CREATE POLICY "Owner can manage services" ON public.services
    FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'owner')
    WITH CHECK (public.current_user_role() = 'owner');

COMMIT;
