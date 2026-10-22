-- ==============================================================================
-- SuperWash Express: Workflow Audit, Lifecycle Integrity & Doorstep Weighing
-- Migration: 20261022170000_workflow_audit_lifecycle_and_weight.sql
-- ==============================================================================

-- 1. Ensure Orders Table Has Dedicated Pickup Weight Columns
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS pickup_measured_weight NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS pickup_weighed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pickup_weighed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Expand Order Status Check Constraint for Full Lifecycle States
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_status_check CHECK (order_status IN (
    'booked',
    'pickup_assigned',
    'collected',
    'weighed',
    'washing',
    'ready_for_delivery',
    'delivery_assigned',
    'out_for_delivery',
    'delivered',
    'cancelled'
));

-- 3. RLS Policy on Weight Change History for Delivery Staff
ALTER TABLE public.weight_change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can insert weight change history" ON public.weight_change_history;
CREATE POLICY "Staff can insert weight change history" ON public.weight_change_history
    FOR INSERT WITH CHECK (
        public.current_user_role() IN ('owner', 'manager')
        OR (
            public.current_user_role() = 'delivery' AND EXISTS (
                SELECT 1 FROM public.orders
                WHERE public.orders.id = weight_change_history.order_id
                  AND (public.orders.assigned_delivery_id = auth.uid() OR public.orders.assigned_pickup_id = auth.uid())
            )
        )
    );

DROP POLICY IF EXISTS "Staff can view weight change history" ON public.weight_change_history;
CREATE POLICY "Staff can view weight change history" ON public.weight_change_history
    FOR SELECT USING (
        public.current_user_role() IN ('owner', 'manager')
        OR (
            public.current_user_role() = 'delivery' AND EXISTS (
                SELECT 1 FROM public.orders
                WHERE public.orders.id = weight_change_history.order_id
                  AND (public.orders.assigned_delivery_id = auth.uid() OR public.orders.assigned_pickup_id = auth.uid())
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.orders
            WHERE public.orders.id = weight_change_history.order_id
              AND public.orders.customer_id = auth.uid()
        )
    );

-- 4. Enable Store Managers to Manage Staff Profiles
DROP POLICY IF EXISTS "Store managers can view and manage staff" ON public.profiles;
CREATE POLICY "Store managers can view and manage staff" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id
        OR public.current_user_role() IN ('owner', 'manager')
    );

-- 5. Seed / Promote Delivery Associate Suresh Kumar if registered
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'suresh.superwash.express@gmail.com') THEN
        UPDATE auth.users
        SET email_confirmed_at = COALESCE(email_confirmed_at, now())
        WHERE email = 'suresh.superwash.express@gmail.com';

        UPDATE public.profiles
        SET role = 'delivery',
            full_name = 'Suresh Kumar',
            phone = '9876543216',
            is_active = true,
            updated_at = timezone('utc', now())
        WHERE email = 'suresh.superwash.express@gmail.com';
    END IF;

    -- Ensure manager phone is populated
    UPDATE public.profiles
    SET phone = '9876543211', updated_at = timezone('utc', now())
    WHERE email = 'manager@superwash.in' AND (phone IS NULL OR phone = '');
END $$;
