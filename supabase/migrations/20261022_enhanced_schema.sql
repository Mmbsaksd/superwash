-- ==============================================================================
-- SuperWash Express: Enhanced Production Schema Migration
-- Migration: 20261022_enhanced_schema.sql
-- ==============================================================================

-- 1. Add Geographical Coordinates to Customer Addresses and Orders
ALTER TABLE public.customer_addresses 
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS pickup_latitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS pickup_longitude NUMERIC(10, 7);

-- 2. Dedicated Service Areas Table
CREATE TABLE IF NOT EXISTS public.service_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pincode VARCHAR(6) NOT NULL UNIQUE,
    area_name VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL DEFAULT 'Bengaluru',
    state VARCHAR(100) NOT NULL DEFAULT 'Karnataka',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_service_areas_pincode ON public.service_areas(pincode);
CREATE INDEX IF NOT EXISTS idx_service_areas_is_active ON public.service_areas(is_active);

-- Seed initial serviceable areas
INSERT INTO public.service_areas (pincode, area_name, city, state, is_active) VALUES
('560038', 'Indiranagar', 'Bengaluru', 'Karnataka', true),
('560008', 'Ulsoor / Halasuru', 'Bengaluru', 'Karnataka', true),
('560103', 'Bellandur', 'Bengaluru', 'Karnataka', true),
('560075', 'HAL / Airport Road', 'Bengaluru', 'Karnataka', true),
('560001', 'MG Road / Central Bengaluru', 'Bengaluru', 'Karnataka', true),
('560066', 'Whitefield', 'Bengaluru', 'Karnataka', true),
('560037', 'Marathahalli', 'Bengaluru', 'Karnataka', true)
ON CONFLICT (pincode) DO UPDATE SET
    area_name = EXCLUDED.area_name,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    is_active = EXCLUDED.is_active;

-- 3. Dedicated Services Table (Extensible Laundry Catalog)
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    pricing_unit VARCHAR(50) NOT NULL DEFAULT 'per_kg',
    unit_price_paise INTEGER NOT NULL DEFAULT 8000, -- ₹80.00
    min_weight_kg NUMERIC(4, 2) NOT NULL DEFAULT 3.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Seed primary per-kg wash & fold service
INSERT INTO public.services (name, description, pricing_unit, unit_price_paise, min_weight_kg, is_active, display_order)
VALUES (
    'Wash & Fold (Normal)',
    'Everyday clothes washed with premium gentle detergent, tumble-dried, and neatly steam-iron folded',
    'per_kg',
    8000,
    3.00,
    true,
    1
) ON CONFLICT DO NOTHING;

-- Add Service Snapshot columns to Orders table
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS service_name VARCHAR(150) DEFAULT 'Wash & Fold (Normal)',
    ADD COLUMN IF NOT EXISTS pricing_unit VARCHAR(50) DEFAULT 'per_kg';

-- 4. Order Number Generation Sequence
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1005;

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := 'SW-' || nextval('public.order_number_seq');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_order_number ON public.orders;
CREATE TRIGGER trigger_set_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_order_number();

-- 5. Prevent User Self-Promotion in Profiles
CREATE OR REPLACE FUNCTION public.check_profile_role_update()
RETURNS TRIGGER AS $$
BEGIN
    -- If role is being changed and user is not an owner, reject
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF public.current_user_role() != 'owner' THEN
            RAISE EXCEPTION 'Only business owners are authorized to change user roles.';
        END IF;
    END IF;
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_profile_role ON public.profiles;
CREATE TRIGGER trigger_check_profile_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_profile_role_update();

-- 6. Synchronize Payment Ledger with Order Summary Fields
CREATE OR REPLACE FUNCTION public.sync_order_payment_summary()
RETURNS TRIGGER AS $$
DECLARE
    v_total_paid INTEGER;
    v_order_total INTEGER;
    v_new_status VARCHAR(30);
BEGIN
    -- Calculate total paid from all payment entries for this order
    SELECT COALESCE(SUM(amount_paise), 0)
    INTO v_total_paid
    FROM public.payments
    WHERE order_id = NEW.order_id;

    -- Fetch total order bill
    SELECT total_amount_paise
    INTO v_order_total
    FROM public.orders
    WHERE id = NEW.order_id;

    -- Determine payment status
    IF v_total_paid = 0 THEN
        v_new_status := 'pending';
    ELSIF v_order_total IS NOT NULL AND v_total_paid >= v_order_total THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'partially_paid';
    END IF;

    -- Update order summary columns
    UPDATE public.orders
    SET 
        paid_amount_paise = v_total_paid,
        payment_status = v_new_status,
        payment_method = NEW.payment_method,
        updated_at = timezone('utc', now())
    WHERE id = NEW.order_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_payment_summary ON public.payments;
CREATE TRIGGER trigger_sync_payment_summary
    AFTER INSERT OR UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_order_payment_summary();

-- 7. Row Level Security Policies for New and Protected Tables
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Service Areas RLS
CREATE POLICY "Public can view active service areas" ON public.service_areas
    FOR SELECT USING (is_active = true OR public.current_user_role() = 'owner');

CREATE POLICY "Owner can manage service areas" ON public.service_areas
    FOR ALL USING (public.current_user_role() = 'owner');

-- Services Catalog RLS
CREATE POLICY "Public can view active services" ON public.services
    FOR SELECT USING (is_active = true OR public.current_user_role() = 'owner');

CREATE POLICY "Owner can manage services" ON public.services
    FOR ALL USING (public.current_user_role() = 'owner');

-- Payments RLS Policies
CREATE POLICY "Customers can view payments for own orders" ON public.payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE public.orders.id = payments.order_id
              AND public.orders.customer_id = auth.uid()
        )
        OR public.current_user_role() IN ('owner', 'manager', 'delivery')
    );

CREATE POLICY "Staff can record payments" ON public.payments
    FOR INSERT WITH CHECK (
        public.current_user_role() IN ('owner', 'manager', 'delivery')
    );

-- Order Status History RLS
CREATE POLICY "Users can view status history for their orders" ON public.order_status_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE public.orders.id = order_status_history.order_id
              AND (public.orders.customer_id = auth.uid() 
                   OR public.orders.assigned_delivery_id = auth.uid()
                   OR public.current_user_role() IN ('owner', 'manager'))
        )
    );

CREATE POLICY "Staff can add status history entries" ON public.order_status_history
    FOR INSERT WITH CHECK (
        public.current_user_role() IN ('owner', 'manager', 'delivery')
    );

-- Weight Change History RLS
CREATE POLICY "Staff can view weight changes" ON public.weight_change_history
    FOR SELECT USING (
        public.current_user_role() IN ('owner', 'manager')
    );

CREATE POLICY "Staff can record weight changes" ON public.weight_change_history
    FOR INSERT WITH CHECK (
        public.current_user_role() IN ('owner', 'manager')
    );
