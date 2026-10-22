-- ==============================================================================
-- SuperWash Express: Separate Pickup & Delivery Assignment Schema Migration
-- Migration: 20261022150000_workflow_pickup_assignment.sql
-- ==============================================================================
-- Enables independent tracking of pickup associates and final delivery couriers.
-- Updates RLS policies so delivery staff can access orders assigned to them
-- for either pickup or delivery.
-- ==============================================================================

-- 1. Add Pickup Staff & Delivery Name/Phone Fields to Orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS assigned_pickup_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_pickup_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS assigned_pickup_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS assigned_delivery_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS assigned_delivery_phone VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_pickup ON public.orders(assigned_pickup_id);

GRANT SELECT, UPDATE ON TABLE public.orders TO authenticated;

-- 2. Update Order RLS Policies to Support Both Pickup and Delivery Staff
DROP POLICY IF EXISTS "Customer can read own orders" ON public.orders;
CREATE POLICY "Customer can read own orders" ON public.orders
    FOR SELECT USING (
        auth.uid() = customer_id 
        OR (public.current_user_role() = 'delivery' AND (assigned_delivery_id = auth.uid() OR assigned_pickup_id = auth.uid()))
        OR public.current_user_role() IN ('manager', 'owner')
    );

DROP POLICY IF EXISTS "Authorized roles can update orders" ON public.orders;
CREATE POLICY "Authorized roles can update orders" ON public.orders
    FOR UPDATE USING (
        (public.current_user_role() = 'delivery' AND (assigned_delivery_id = auth.uid() OR assigned_pickup_id = auth.uid()))
        OR public.current_user_role() IN ('manager', 'owner')
    );

-- 3. Update Profiles RLS Policy for Delivery Staff
DROP POLICY IF EXISTS "Authorized users can view profiles" ON public.profiles;
CREATE POLICY "Authorized users can view profiles" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id
        OR public.current_user_role() = 'owner'
        OR (
            public.current_user_role() = 'manager' AND (
                role = 'customer'
                OR role = 'delivery'
                OR role = 'manager'
            )
        )
        OR (
            public.current_user_role() = 'delivery' AND EXISTS (
                SELECT 1 FROM public.orders
                WHERE orders.customer_id = profiles.id
                  AND (orders.assigned_delivery_id = auth.uid() OR orders.assigned_pickup_id = auth.uid())
            )
        )
    );

-- 4. Update Payments RLS Policies for Delivery Staff
DROP POLICY IF EXISTS "Customers and staff can view relevant payments" ON public.payments;
CREATE POLICY "Customers and staff can view relevant payments" ON public.payments
    FOR SELECT USING (
        public.current_user_role() IN ('owner', 'manager')
        OR (
            public.current_user_role() = 'delivery' AND EXISTS (
                SELECT 1 FROM public.orders
                WHERE public.orders.id = payments.order_id
                  AND (public.orders.assigned_delivery_id = auth.uid() OR public.orders.assigned_pickup_id = auth.uid())
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.orders
            WHERE public.orders.id = payments.order_id
              AND public.orders.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Staff can record payments" ON public.payments;
CREATE POLICY "Staff can record payments" ON public.payments
    FOR INSERT WITH CHECK (
        public.current_user_role() IN ('owner', 'manager')
        OR (
            public.current_user_role() = 'delivery' AND EXISTS (
                SELECT 1 FROM public.orders
                WHERE public.orders.id = payments.order_id
                  AND (public.orders.assigned_delivery_id = auth.uid() OR public.orders.assigned_pickup_id = auth.uid())
            )
        )
    );

-- 5. Update Status History Policy for Delivery Staff
DROP POLICY IF EXISTS "Users can view status history for their orders" ON public.order_status_history;
CREATE POLICY "Users can view status history for their orders" ON public.order_status_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE public.orders.id = order_status_history.order_id
              AND (
                  public.orders.customer_id = auth.uid()
                  OR (public.current_user_role() = 'delivery' AND (public.orders.assigned_delivery_id = auth.uid() OR public.orders.assigned_pickup_id = auth.uid()))
                  OR public.current_user_role() IN ('owner', 'manager')
              )
        )
    );
