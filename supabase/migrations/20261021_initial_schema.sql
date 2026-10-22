-- Supabase PostgreSQL Schema for Mobile-First Laundry Pickup & Delivery App
-- SuperWash per-kilogram laundry model

-- 1. Profiles Table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'delivery', 'manager', 'owner')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Customer Saved Addresses
CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL DEFAULT 'Home', -- Home, Work, Other
    address_line TEXT NOT NULL,
    landmark TEXT,
    pincode VARCHAR(10) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Business Settings Table (Singleton)
CREATE TABLE IF NOT EXISTS public.business_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255) NOT NULL DEFAULT 'SuperWash Express',
    business_phone VARCHAR(20) NOT NULL DEFAULT '+91 98765 43210',
    business_address TEXT NOT NULL DEFAULT 'Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038',
    price_per_kg_paise INTEGER NOT NULL DEFAULT 8000, -- ₹80.00
    min_weight_kg NUMERIC(4, 2) NOT NULL DEFAULT 3.00, -- 3.00 kg minimum
    delivery_charge_paise INTEGER NOT NULL DEFAULT 0, -- Free or configured
    min_order_free_delivery_paise INTEGER NOT NULL DEFAULT 0,
    upi_id VARCHAR(100) NOT NULL DEFAULT 'superwash@upi',
    upi_qr_url TEXT,
    payment_collection_stage VARCHAR(30) NOT NULL DEFAULT 'delivery' CHECK (payment_collection_stage IN ('pickup', 'delivery', 'both')),
    allow_delivery_payment_recording BOOLEAN NOT NULL DEFAULT true,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. Pickup Slots Table
CREATE TABLE IF NOT EXISTS public.pickup_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL, -- e.g. "08:00 AM - 11:00 AM"
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 15,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- 5. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(30) NOT NULL UNIQUE, -- e.g. "SW-1001"
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    
    pickup_address TEXT NOT NULL,
    pickup_landmark TEXT,
    pickup_pincode VARCHAR(10) NOT NULL,
    pickup_date DATE NOT NULL,
    pickup_slot VARCHAR(100) NOT NULL,
    
    assigned_delivery_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- Weight & Billing
    measured_weight NUMERIC(5, 2), -- Actual kg weighed by manager
    billable_weight NUMERIC(5, 2), -- MAX(measured_weight, min_weight_kg)
    price_per_kg_paise INTEGER NOT NULL, -- Snapshot at weighing/creation
    min_weight_kg NUMERIC(4, 2) NOT NULL, -- Snapshot
    delivery_charge_paise INTEGER NOT NULL DEFAULT 0,
    total_amount_paise INTEGER, -- NULL until weighed, then billable_weight * price_per_kg + delivery
    paid_amount_paise INTEGER NOT NULL DEFAULT 0,
    
    payment_status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partially_paid', 'paid')),
    payment_method VARCHAR(30) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi_manual')),
    
    order_status VARCHAR(30) NOT NULL DEFAULT 'booked' CHECK (order_status IN (
        'booked',
        'pickup_assigned',
        'collected',
        'washing',
        'ready_for_delivery',
        'out_for_delivery',
        'delivered',
        'cancelled'
    )),
    
    delivery_notes TEXT,
    cancellation_reason TEXT,
    notes TEXT,
    
    collected_at TIMESTAMPTZ,
    weighed_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 6. Order Status History (Append-only audit trail)
CREATE TABLE IF NOT EXISTS public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    previous_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    notes TEXT,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 7. Weight Change History (Audit trail for manager corrections before delivery)
CREATE TABLE IF NOT EXISTS public.weight_change_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    old_weight NUMERIC(5, 2),
    new_weight NUMERIC(5, 2) NOT NULL,
    old_amount_paise INTEGER,
    new_amount_paise INTEGER NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 8. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('cash', 'upi_manual')),
    transaction_reference VARCHAR(100), -- UTR reference number for UPI
    notes TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 9. Notification Logs
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
    recipient_phone VARCHAR(20) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- sent, failed, logged
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_delivery ON public.orders(assigned_delivery_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_date ON public.orders(pickup_date);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);

-- ----------------------------------------------------
-- Row Level Security (RLS) Policies
-- ----------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_change_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_slots ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS VARCHAR AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;

-- Enable RLS on notification_logs and protect recipient contact data
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner and manager can view notification logs" ON public.notification_logs
    FOR SELECT USING (public.current_user_role() IN ('owner', 'manager'));

CREATE POLICY "Staff can insert notification logs" ON public.notification_logs
    FOR INSERT WITH CHECK (public.current_user_role() IN ('owner', 'manager', 'delivery'));

-- Profiles: Users can read their own profile; Owner and Manager can read all
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.current_user_role() IN ('owner', 'manager'));

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Owner can manage profiles" ON public.profiles
    FOR ALL USING (public.current_user_role() = 'owner');

-- Customer Addresses
CREATE POLICY "Customers can manage own addresses" ON public.customer_addresses
    FOR ALL USING (auth.uid() = user_id);

-- Orders:
-- Customer sees only their own orders
-- Delivery person sees only orders assigned to them
-- Manager and Owner see all orders
CREATE POLICY "Customer can read own orders" ON public.orders
    FOR SELECT USING (
        auth.uid() = customer_id 
        OR (public.current_user_role() = 'delivery' AND assigned_delivery_id = auth.uid())
        OR public.current_user_role() IN ('manager', 'owner')
    );

CREATE POLICY "Customer can create booking" ON public.orders
    FOR INSERT WITH CHECK (
        auth.uid() = customer_id OR public.current_user_role() IN ('manager', 'owner')
    );

CREATE POLICY "Authorized roles can update orders" ON public.orders
    FOR UPDATE USING (
        (public.current_user_role() = 'delivery' AND assigned_delivery_id = auth.uid())
        OR public.current_user_role() IN ('manager', 'owner')
    );

-- Business Settings & Slots: Everyone can read; Only Owner can update
CREATE POLICY "Public can view business settings" ON public.business_settings
    FOR SELECT USING (true);

CREATE POLICY "Owner can update business settings" ON public.business_settings
    FOR ALL USING (public.current_user_role() = 'owner');

CREATE POLICY "Public can view active slots" ON public.pickup_slots
    FOR SELECT USING (is_active = true);

CREATE POLICY "Owner can manage pickup slots" ON public.pickup_slots
    FOR ALL USING (public.current_user_role() = 'owner');

-- Default Seed Data
INSERT INTO public.business_settings (
    business_name,
    business_phone,
    business_address,
    price_per_kg_paise,
    min_weight_kg,
    delivery_charge_paise,
    upi_id
) VALUES (
    'SuperWash Express',
    '+91 98765 43210',
    'Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038',
    8000, -- ₹80 per kg
    3.00, -- 3 kg minimum billable weight
    0,    -- Free pickup & delivery
    'superwash@upi'
) ON CONFLICT DO NOTHING;

INSERT INTO public.pickup_slots (name, start_time, end_time, max_capacity, is_active) VALUES
('Morning (08:00 AM - 11:00 AM)', '08:00:00', '11:00:00', 20, true),
('Noon (11:00 AM - 02:00 PM)', '11:00:00', '14:00:00', 20, true),
('Afternoon (02:00 PM - 05:00 PM)', '14:00:00', '17:00:00', 20, true),
('Evening (05:00 PM - 08:00 PM)', '17:00:00', '20:00:00', 20, true)
ON CONFLICT DO NOTHING;
