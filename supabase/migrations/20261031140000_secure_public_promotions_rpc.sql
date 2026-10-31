-- ==============================================================================
-- SuperWash Exprez — Migration 20261031140000
-- Forward-only Migration: Secure Public Promotions RPC & Coupons RLS Hardening
-- ==============================================================================
-- 1. Introduces secure public promotional data access via get_public_promotions() RPC.
--    - Returns ONLY minimum fields required for customer-facing promotional banners.
--    - Filters inactive, expired, and redemption-exhausted coupons.
--    - Runs as SECURITY DEFINER with safe search_path = public, pg_temp.
--    - Prevents exposing internal metrics (total_redemptions, max_redemptions, limits).
-- 2. Hardens public.coupons RLS and grants:
--    - Revokes unrestricted SELECT privileges from the anon role.
--    - Fixes the 42501 permission error by ensuring the owner policy uses
--      public.current_user_role() = 'owner' and scopes strictly TO authenticated.
--    - Unauthenticated visitors access promotions exclusively via get_public_promotions().
--    - Server-side coupon redemption remains authoritatively verified in validate_coupon()
--      and create_booking_idempotent() RPCs.
-- ==============================================================================

BEGIN;

-- 1. Create secure restricted RPC for public promotional banner display
CREATE OR REPLACE FUNCTION public.get_public_promotions()
RETURNS TABLE (
    code TEXT,
    description TEXT,
    discount_type TEXT,
    discount_value INTEGER,
    min_order_paise INTEGER,
    max_discount_paise INTEGER,
    valid_until TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.code,
        c.description,
        c.discount_type,
        c.discount_value,
        c.min_order_paise,
        c.max_discount_paise,
        c.valid_until
    FROM public.coupons c
    WHERE c.is_active = true
      AND (c.valid_until IS NULL OR c.valid_until > timezone('utc'::text, now()))
      AND (c.max_redemptions IS NULL OR c.total_redemptions < c.max_redemptions)
    ORDER BY c.created_at DESC;
END;
$$;

-- Function Execution Permissions
REVOKE ALL ON FUNCTION public.get_public_promotions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_promotions() TO anon, authenticated, service_role;

-- 2. Hardened RLS Policies on public.coupons Table
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Revoke direct table access from anon and PUBLIC
REVOKE ALL ON TABLE public.coupons FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coupons TO authenticated;
GRANT ALL ON TABLE public.coupons TO service_role;

-- Drop legacy un-scoped and overly permissive policies
DROP POLICY IF EXISTS "Owners can manage coupons" ON public.coupons;
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Authenticated users can view active coupons" ON public.coupons;

-- Policy: Business Owners have full management privileges
-- All non-owners (anonymous visitors, customers, staff) access approved active promotions
-- exclusively through the get_public_promotions() RPC, preventing exposure of internal metrics.
CREATE POLICY "Owners can manage coupons"
    ON public.coupons
    FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'owner')
    WITH CHECK (public.current_user_role() = 'owner');

COMMIT;

