-- ==============================================================================
-- SuperWash Express: Service Catalogue Enhancements & Referential Integrity
-- Migration: 20261023100000_service_catalogue_enhancements.sql
-- ==============================================================================
-- 1. Ensure case-insensitive unique constraint on service names to prevent duplicates
-- 2. Validate supported pricing units (per_kg, per_piece, per_item, per_load, per_order)
-- 3. Extend read permissions so store managers and delivery staff can view inactive services
-- 4. Database-enforced trigger preventing deletion of services referenced by existing orders
-- ==============================================================================

-- 1. Case-insensitive Unique Index on Service Name
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_name_unique
    ON public.services (LOWER(TRIM(name)));

-- 2. Pricing Unit Constraint
ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_pricing_unit_check;
ALTER TABLE public.services ADD CONSTRAINT services_pricing_unit_check
    CHECK (pricing_unit IN ('per_kg', 'per_piece', 'per_item', 'per_load', 'per_order'));

-- 3. Enhanced RLS Policy for Services
DROP POLICY IF EXISTS "Public can view active services" ON public.services;
CREATE POLICY "Public can view active services" ON public.services
    FOR SELECT USING (
        is_active = true
        OR public.current_user_role() IN ('owner', 'manager', 'delivery')
    );

-- Ensure owner full management policy is active
DROP POLICY IF EXISTS "Owner can manage services" ON public.services;
CREATE POLICY "Owner can manage services" ON public.services
    FOR ALL USING (public.current_user_role() = 'owner');

-- 4. Database-level Protection Against Deleting Referenced Services
CREATE OR REPLACE FUNCTION public.check_service_delete_protection()
RETURNS TRIGGER AS $$
DECLARE
    order_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO order_count
    FROM public.orders
    WHERE service_id = OLD.id
       OR LOWER(TRIM(service_name)) = LOWER(TRIM(OLD.name));
    
    IF order_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete service "%" because it is referenced by % existing order(s). Deactivate the service instead to preserve historical billing records.', OLD.name, order_count;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_referenced_service_delete ON public.services;
CREATE TRIGGER trg_prevent_referenced_service_delete
BEFORE DELETE ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.check_service_delete_protection();
