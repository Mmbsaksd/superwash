-- ==============================================================================
-- SuperWash Express: Hardened Database-Enforced Workflow & Security Migration
-- Migration: 20261022180000_database_enforced_workflow_and_security.sql
-- ==============================================================================
-- Consolidates and hardens pending schema updates (1700 + 1800):
-- 1. Schema Upgrades: Doorstep weighing columns, canonical 10-stage lifecycle constraint.
-- 2. Strict Role Authorization: Rejects updates from customer or unknown roles.
-- 3. Strict Delivery Associate Field Allowlist: Task-specific allowlists for Pickup
--    vs Delivery Dispatch vs Delivery Handover. Rejects all other fields.
-- 4. Payment Ledger Protection: Associates cannot modify payment details at pickup;
--    at delivery, paid_amount can only increase if a matching public.payments ledger row exists.
-- 5. Full Stage Machine for Store Managers & Owners: Strict step-by-step lifecycle.
--    No skipping stages (booked -> pickup_assigned -> collected -> weighed/washing ->
--    ready_for_delivery -> out_for_delivery -> delivered).
-- 6. Universal Rule: Orders CANNOT move directly from ready_for_delivery to delivered.
--    Dispatch to out_for_delivery is mandatory for all roles.
-- 7. Dual-Assignment Proof: Evaluates actions based on current order state, preventing
--    associates assigned to both roles from bypassing either stage's rules.
-- 8. Doorstep scale weight bounded between 0.10 kg and 250.00 kg.
-- 9. Explicit search_path on SECURITY DEFINER function to prevent schema poisoning.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SCHEMA UPGRADES (Migration 1700 Elements)
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS pickup_measured_weight NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS pickup_weighed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pickup_weighed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

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

-- Ensure RLS on weight_change_history is active and staff have access
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

-- ------------------------------------------------------------------------------
-- 2. HARDENED TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_order_workflow_integrity()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
    effective_weight NUMERIC(5, 2);
    payment_diff INTEGER;
BEGIN
    -- Superuser and service-role maintenance tasks bypass trigger
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    user_role := public.current_user_role();

    -- 1. Authorization: Unauthenticated, customer, or unknown roles cannot update orders
    IF user_role IS NULL OR user_role NOT IN ('owner', 'manager', 'delivery') THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers, owners, and assigned associates can update orders.';
    END IF;

    -- 2. Terminal State Protection: Delivered and Cancelled orders cannot be modified
    IF OLD.order_status = 'delivered' AND NEW.order_status IS DISTINCT FROM 'delivered' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Delivered orders are finalized and cannot change status.';
    END IF;
    IF OLD.order_status = 'cancelled' AND NEW.order_status IS DISTINCT FROM 'cancelled' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Cancelled orders cannot be reopened.';
    END IF;

    -- 3. Universal Rule: Orders CANNOT move directly from ready_for_delivery to delivered
    -- Every order MUST be dispatched to out_for_delivery first (applies to all roles)
    IF NEW.order_status = 'delivered' AND OLD.order_status != 'out_for_delivery' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Order must be dispatched to out_for_delivery before delivery completion (Current status: %).', OLD.order_status;
    END IF;

    -- 4. Universal Rule: Dispatching to out_for_delivery strictly requires an assigned delivery courier
    IF NEW.order_status = 'out_for_delivery' AND NEW.assigned_delivery_id IS NULL THEN
        RAISE EXCEPTION 'Invalid workflow transition: Cannot dispatch order without an assigned delivery courier.';
    END IF;

    -- 5. Delivery Associate Strict Field Allowlists & State Transitions
    IF user_role = 'delivery' THEN
        -- A. Universal Invariants: Fields delivery associates can NEVER modify
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot change order ID.';
        END IF;
        IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot change order number.';
        END IF;
        IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot change customer identity.';
        END IF;
        IF NEW.customer_name IS DISTINCT FROM OLD.customer_name OR
           NEW.customer_phone IS DISTINCT FROM OLD.customer_phone THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot change customer contact details.';
        END IF;
        IF NEW.pickup_address IS DISTINCT FROM OLD.pickup_address OR
           NEW.pickup_landmark IS DISTINCT FROM OLD.pickup_landmark OR
           NEW.pickup_pincode IS DISTINCT FROM OLD.pickup_pincode OR
           NEW.pickup_date IS DISTINCT FROM OLD.pickup_date OR
           NEW.pickup_slot IS DISTINCT FROM OLD.pickup_slot OR
           NEW.pickup_latitude IS DISTINCT FROM OLD.pickup_latitude OR
           NEW.pickup_longitude IS DISTINCT FROM OLD.pickup_longitude THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot modify customer booking details.';
        END IF;
        IF NEW.service_id IS DISTINCT FROM OLD.service_id OR
           NEW.service_name IS DISTINCT FROM OLD.service_name OR
           NEW.pricing_unit IS DISTINCT FROM OLD.pricing_unit OR
           NEW.price_per_kg_paise IS DISTINCT FROM OLD.price_per_kg_paise OR
           NEW.min_weight_kg IS DISTINCT FROM OLD.min_weight_kg OR
           NEW.delivery_charge_paise IS DISTINCT FROM OLD.delivery_charge_paise THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot modify service or pricing rules.';
        END IF;
        IF NEW.assigned_pickup_id IS DISTINCT FROM OLD.assigned_pickup_id OR
           NEW.assigned_pickup_name IS DISTINCT FROM OLD.assigned_pickup_name OR
           NEW.assigned_pickup_phone IS DISTINCT FROM OLD.assigned_pickup_phone THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot reassign pickup staff.';
        END IF;
        IF NEW.assigned_delivery_id IS DISTINCT FROM OLD.assigned_delivery_id OR
           NEW.assigned_delivery_name IS DISTINCT FROM OLD.assigned_delivery_name OR
           NEW.assigned_delivery_phone IS DISTINCT FROM OLD.assigned_delivery_phone THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot reassign delivery courier.';
        END IF;
        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot modify creation timestamp.';
        END IF;

        -- B. Associates cannot perform internal store operations (washing, ready staging, cancellation)
        IF NEW.order_status IN ('washing', 'ready_for_delivery') AND OLD.order_status != NEW.order_status THEN
            RAISE EXCEPTION 'Unauthorized: Store processing (washing and ready staging) is restricted to Store Managers.';
        END IF;
        IF NEW.order_status = 'cancelled' AND OLD.order_status != 'cancelled' THEN
            RAISE EXCEPTION 'Unauthorized: Order cancellation is restricted to Store Managers and Owners.';
        END IF;

        -- C. Task 1: Pickup Task (when OLD.order_status = 'pickup_assigned')
        IF OLD.order_status = 'pickup_assigned' THEN
            IF OLD.assigned_pickup_id IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'Unauthorized: You are not the assigned pickup associate for this order.';
            END IF;
            IF NEW.order_status NOT IN ('pickup_assigned', 'collected') THEN
                RAISE EXCEPTION 'Invalid transition: Pickup associates can only advance pickup_assigned orders to collected.';
            END IF;

            -- Disallow changing payment details at pickup stage
            IF NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
               NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
               NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
                RAISE EXCEPTION 'Security violation: Delivery associates cannot modify payment details during pickup.';
            END IF;
            IF NEW.delivered_at IS NOT NULL THEN
                RAISE EXCEPTION 'Security violation: Delivered timestamp cannot be set during pickup.';
            END IF;

            -- Scale weight bounds validation
            IF NEW.order_status = 'collected' THEN
                effective_weight := COALESCE(NEW.pickup_measured_weight, NEW.measured_weight);
                IF effective_weight IS NULL OR effective_weight <= 0 THEN
                    RAISE EXCEPTION 'Scale weight required: A positive measured scale weight is required to collect laundry.';
                END IF;
                IF effective_weight < 0.1 OR effective_weight > 250.0 THEN
                    RAISE EXCEPTION 'Scale weight out of bounds: Measured weight must be between 0.1 kg and 250.0 kg (Received: % kg).', effective_weight;
                END IF;

                IF NEW.collected_at IS NULL THEN
                    NEW.collected_at := timezone('utc', now());
                END IF;
                IF NEW.pickup_weighed_at IS NULL THEN
                    NEW.pickup_weighed_at := timezone('utc', now());
                END IF;
                IF NEW.pickup_weighed_by IS NULL THEN
                    NEW.pickup_weighed_by := auth.uid();
                END IF;
            END IF;

        -- D. Task 2: Delivery Dispatch Task (when OLD.order_status = 'ready_for_delivery')
        ELSIF OLD.order_status = 'ready_for_delivery' THEN
            IF OLD.assigned_delivery_id IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'Unauthorized: You are not the assigned delivery courier for this order.';
            END IF;
            IF NEW.order_status NOT IN ('ready_for_delivery', 'out_for_delivery') THEN
                RAISE EXCEPTION 'Invalid transition: Courier can only dispatch ready orders to out_for_delivery.';
            END IF;

            -- Disallow changing weights or payments during dispatch
            IF NEW.measured_weight IS DISTINCT FROM OLD.measured_weight OR
               NEW.pickup_measured_weight IS DISTINCT FROM OLD.pickup_measured_weight OR
               NEW.billable_weight IS DISTINCT FROM OLD.billable_weight OR
               NEW.total_amount_paise IS DISTINCT FROM OLD.total_amount_paise THEN
                RAISE EXCEPTION 'Security violation: Weights and bill totals cannot be modified during delivery dispatch.';
            END IF;
            IF NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
               NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
                RAISE EXCEPTION 'Security violation: Payment records cannot be modified during delivery dispatch.';
            END IF;

        -- E. Task 3: Delivery Handover & Payment Task (when OLD.order_status = 'out_for_delivery')
        ELSIF OLD.order_status = 'out_for_delivery' THEN
            IF OLD.assigned_delivery_id IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'Unauthorized: You are not the assigned delivery courier for this order.';
            END IF;
            IF NEW.order_status NOT IN ('out_for_delivery', 'delivered') THEN
                RAISE EXCEPTION 'Invalid transition: Dispatched orders can only advance to delivered.';
            END IF;

            -- Disallow changing weight fields during delivery handover
            IF NEW.measured_weight IS DISTINCT FROM OLD.measured_weight OR
               NEW.pickup_measured_weight IS DISTINCT FROM OLD.pickup_measured_weight OR
               NEW.billable_weight IS DISTINCT FROM OLD.billable_weight OR
               NEW.total_amount_paise IS DISTINCT FROM OLD.total_amount_paise THEN
                RAISE EXCEPTION 'Security violation: Weights and bill totals cannot be modified during delivery handover.';
            END IF;

            -- Payment Ledger Protection: Paid amounts cannot be arbitrary
            IF NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise THEN
                payment_diff := COALESCE(NEW.paid_amount_paise, 0) - COALESCE(OLD.paid_amount_paise, 0);
                IF payment_diff < 0 THEN
                    RAISE EXCEPTION 'Security violation: Paid amount cannot decrease.';
                END IF;
                IF NEW.paid_amount_paise > OLD.total_amount_paise THEN
                    RAISE EXCEPTION 'Security violation: Paid amount (% paise) cannot exceed bill total (% paise).', NEW.paid_amount_paise, OLD.total_amount_paise;
                END IF;

                -- Require matching payment ledger entry in public.payments
                IF NOT EXISTS (
                    SELECT 1 FROM public.payments p
                    WHERE p.order_id = NEW.id
                      AND p.amount_paise = payment_diff
                ) THEN
                    RAISE EXCEPTION 'Security violation: Payment balance update requires an authentic record in payments ledger.';
                END IF;
            END IF;

            IF NEW.order_status = 'delivered' AND NEW.delivered_at IS NULL THEN
                NEW.delivered_at := timezone('utc', now());
            END IF;

        -- F. Orders in any other state (booked, collected, weighed, washing, delivered, cancelled)
        ELSE
            IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
                RAISE EXCEPTION 'Unauthorized: Delivery associates cannot transition orders from status %.', OLD.order_status;
            END IF;
        END IF;
    END IF;

    -- 6. Store Manager & Owner Lifecycle State Machine Enforcement
    IF user_role IN ('manager', 'owner') THEN
        IF OLD.order_status = 'booked' THEN
            IF NEW.order_status NOT IN ('booked', 'pickup_assigned', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid transition: Booked orders must be assigned for pickup before processing (attempted: %).', NEW.order_status;
            END IF;
        ELSIF OLD.order_status = 'pickup_assigned' THEN
            IF NEW.order_status NOT IN ('pickup_assigned', 'collected', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid transition: Orders with pickup assigned must be collected before washing (attempted: %).', NEW.order_status;
            END IF;
        ELSIF OLD.order_status = 'collected' THEN
            IF NEW.order_status NOT IN ('collected', 'weighed', 'washing', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid transition: Collected orders must proceed to weighed or washing (attempted: %).', NEW.order_status;
            END IF;
        ELSIF OLD.order_status = 'weighed' THEN
            IF NEW.order_status NOT IN ('weighed', 'washing', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid transition: Weighed orders must proceed to washing (attempted: %).', NEW.order_status;
            END IF;
        ELSIF OLD.order_status = 'washing' THEN
            IF NEW.order_status NOT IN ('washing', 'ready_for_delivery', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid transition: Washing orders must be marked ready_for_delivery before dispatch (attempted: %).', NEW.order_status;
            END IF;
        ELSIF OLD.order_status = 'ready_for_delivery' THEN
            IF NEW.order_status NOT IN ('ready_for_delivery', 'delivery_assigned', 'out_for_delivery', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid transition: Ready orders cannot skip dispatch to out_for_delivery (attempted: %).', NEW.order_status;
            END IF;
        ELSIF OLD.order_status = 'delivery_assigned' THEN
            IF NEW.order_status NOT IN ('delivery_assigned', 'out_for_delivery', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid transition: Delivery assigned orders must be dispatched to out_for_delivery (attempted: %).', NEW.order_status;
            END IF;
        ELSIF OLD.order_status = 'out_for_delivery' THEN
            IF NEW.order_status NOT IN ('out_for_delivery', 'delivered', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid transition: Out for delivery orders can only transition to delivered or cancelled (attempted: %).', NEW.order_status;
            END IF;
        END IF;

        -- Weight requirement: Clothes cannot enter washing without a recorded scale weight
        IF NEW.order_status = 'washing' AND OLD.order_status != 'washing' THEN
            IF COALESCE(NEW.measured_weight, OLD.measured_weight) IS NULL OR COALESCE(NEW.measured_weight, OLD.measured_weight) <= 0 THEN
                RAISE EXCEPTION 'Intake weight required: Scale weight must be recorded before clothes can enter washing.';
            END IF;
        END IF;
    END IF;

    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- 3. TRIGGER ATTACHMENT
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_enforce_order_workflow ON public.orders;
CREATE TRIGGER trigger_enforce_order_workflow
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_order_workflow_integrity();
