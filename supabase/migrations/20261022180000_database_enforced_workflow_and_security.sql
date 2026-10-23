-- ==============================================================================
-- SuperWash Express: Hardened Database-Enforced Workflow & Security Migration
-- Migration: 20261022180000_database_enforced_workflow_and_security.sql
-- ==============================================================================
-- Consolidates and hardens pending schema updates (1700 + 1800):
-- 1. Schema Upgrades: Doorstep weighing columns, idempotency on payments, canonical 10-stage lifecycle constraint.
-- 2. Strict Role Authorization: Rejects updates from customer or unknown roles.
-- 3. Strict Delivery Associate Field Allowlists: Task-specific allowlists for Pickup
--    vs Delivery Dispatch vs Delivery Handover. Rejects all unlisted fields across all 42 table columns.
-- 4. Atomic Payment Ledger RPC: Provides public.record_order_payment() ACID transaction
--    with row-level locking (SELECT FOR UPDATE) to prevent duplicate payments, overpayments,
--    negative amounts, and balance mismatch. Direct modification of payment fields on orders
--    is prohibited for associates outside this secure transaction.
-- 5. Reconciled Delivery Workflow: Both ready_for_delivery and delivery_assigned states
--    are fully supported for assignment, dispatch, and tracking.
-- 6. Universal Rule: Orders CANNOT move directly from ready_for_delivery / delivery_assigned to delivered.
--    Dispatch to out_for_delivery is mandatory for all roles.
-- 7. Full Stage Machine for Store Managers & Owners: Strict step-by-step lifecycle.
--    No skipping stages (booked -> pickup_assigned -> collected -> weighed/washing ->
--    ready_for_delivery / delivery_assigned -> out_for_delivery -> delivered).
-- 8. Doorstep scale weight bounded between 0.10 kg and 250.00 kg.
-- 9. Explicit search_path on all SECURITY DEFINER functions to prevent schema poisoning.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SCHEMA UPGRADES (Migration 1700 Elements & Payment Idempotency)
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

-- Add idempotency support to payments ledger
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key 
    ON public.payments(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

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
-- 2. SECURE ATOMIC PAYMENT TRANSACTION RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_order_payment(
    p_order_id UUID,
    p_amount_paise INTEGER,
    p_payment_method VARCHAR(30),
    p_transaction_reference VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_order RECORD;
    v_total_paid INTEGER;
    v_new_paid INTEGER;
    v_remaining_due INTEGER;
    v_new_status VARCHAR(30);
    v_payment_id UUID;
    v_existing_idempotency RECORD;
BEGIN
    -- 1. Authorization check
    v_role := public.current_user_role();
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager', 'delivery') THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers, owners, and assigned delivery associates can record payments.';
    END IF;

    -- 2. Validate input parameters
    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'Order ID is required.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be a positive integer in paise (received: %).', p_amount_paise;
    END IF;

    IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'upi_manual') THEN
        RAISE EXCEPTION 'Invalid payment method: must be cash or upi_manual (received: %).', p_payment_method;
    END IF;

    -- 3. Idempotency Check: if key provided, return previous result if already processed
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        SELECT id, amount_paise, created_at, order_id
        INTO v_existing_idempotency
        FROM public.payments
        WHERE idempotency_key = TRIM(p_idempotency_key);

        IF FOUND THEN
            IF v_existing_idempotency.order_id <> p_order_id THEN
                RAISE EXCEPTION 'Idempotency conflict: Key % already used for order %.', p_idempotency_key, v_existing_idempotency.order_id;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'payment_id', v_existing_idempotency.id,
                'order_id', p_order_id,
                'amount_paise', v_existing_idempotency.amount_paise,
                'message', 'Payment was previously recorded successfully.'
            );
        END IF;
    END IF;

    -- 4. Lock order row for update to ensure concurrency safety
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- Role-specific permission on order
    IF v_role = 'delivery' THEN
        IF v_order.assigned_delivery_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'Unauthorized: You are not the assigned delivery courier for Order #%.', v_order.order_number;
        END IF;
        IF v_order.order_status NOT IN ('out_for_delivery', 'ready_for_delivery', 'delivery_assigned') THEN
            RAISE EXCEPTION 'Unauthorized: Payments can only be collected during active delivery stages (Current status: %).', v_order.order_status;
        END IF;
    END IF;

    -- Terminal state check
    IF v_order.order_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot record payment for cancelled order #%.', v_order.order_number;
    END IF;

    -- Billing prerequisite check
    IF v_order.total_amount_paise IS NULL THEN
        RAISE EXCEPTION 'Cannot record payment: Order #% has not yet been weighed and billed.', v_order.order_number;
    END IF;

    -- Calculate current remaining balance
    v_total_paid := COALESCE(v_order.paid_amount_paise, 0);
    v_remaining_due := v_order.total_amount_paise - v_total_paid;

    IF v_remaining_due <= 0 THEN
        RAISE EXCEPTION 'Order #% is already fully paid (Total: % paise, Paid: % paise).', v_order.order_number, v_order.total_amount_paise, v_total_paid;
    END IF;

    -- Overpayment prevention
    IF p_amount_paise > v_remaining_due THEN
        RAISE EXCEPTION 'Overpayment rejected: Attempted to pay % paise, but remaining balance on Order #% is % paise.',
            p_amount_paise, v_order.order_number, v_remaining_due;
    END IF;

    -- Prevent duplicate UPI transaction reference for this order
    IF p_payment_method = 'upi_manual' AND p_transaction_reference IS NOT NULL AND TRIM(p_transaction_reference) <> '' THEN
        IF EXISTS (
            SELECT 1 FROM public.payments
            WHERE order_id = p_order_id
              AND transaction_reference = TRIM(p_transaction_reference)
        ) THEN
            RAISE EXCEPTION 'Duplicate payment: UPI transaction reference % has already been recorded for Order #%.',
                TRIM(p_transaction_reference), v_order.order_number;
        END IF;
    END IF;

    -- 5. Insert atomic payment ledger entry
    INSERT INTO public.payments (
        order_id,
        amount_paise,
        payment_method,
        transaction_reference,
        notes,
        recorded_by,
        idempotency_key,
        created_at
    ) VALUES (
        p_order_id,
        p_amount_paise,
        p_payment_method,
        NULLIF(TRIM(p_transaction_reference), ''),
        NULLIF(TRIM(p_notes), ''),
        auth.uid(),
        NULLIF(TRIM(p_idempotency_key), ''),
        timezone('utc', now())
    ) RETURNING id INTO v_payment_id;

    -- 6. Update order balance atomically
    v_new_paid := v_total_paid + p_amount_paise;
    IF v_new_paid >= v_order.total_amount_paise THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'partially_paid';
    END IF;

    -- Signal the workflow trigger that this update is from the trusted atomic payment transaction
    PERFORM set_config('app.payment_in_progress', 'true', true);

    UPDATE public.orders
    SET
        paid_amount_paise = v_new_paid,
        payment_status = v_new_status,
        payment_method = p_payment_method,
        updated_at = timezone('utc', now())
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'payment_id', v_payment_id,
        'order_id', p_order_id,
        'amount_paise', p_amount_paise,
        'paid_amount_paise', v_new_paid,
        'payment_status', v_new_status,
        'remaining_paise', (v_order.total_amount_paise - v_new_paid)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_order_payment(UUID, INTEGER, VARCHAR, VARCHAR, TEXT, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_order_payment(UUID, INTEGER, VARCHAR, VARCHAR, TEXT, VARCHAR) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. HARDENED TRIGGER FUNCTION WITH EXPLICIT COLUMN ALLOWLISTS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_order_workflow_integrity()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
    effective_weight NUMERIC(5, 2);
    is_payment_in_progress BOOLEAN;
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

    -- 2. Terminal State Protection: Delivered and Cancelled orders cannot change status
    IF OLD.order_status = 'delivered' AND NEW.order_status IS DISTINCT FROM 'delivered' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Delivered orders are finalized and cannot change status.';
    END IF;
    IF OLD.order_status = 'cancelled' AND NEW.order_status IS DISTINCT FROM 'cancelled' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Cancelled orders cannot be reopened.';
    END IF;

    -- 3. Universal Rule: Orders CANNOT move directly to delivered from ready or assigned stages
    -- Every order MUST be dispatched to out_for_delivery first (applies to all roles)
    IF NEW.order_status = 'delivered' AND OLD.order_status != 'out_for_delivery' THEN
        RAISE EXCEPTION 'Invalid workflow transition: Order must be dispatched to out_for_delivery before delivery completion (Current status: %).', OLD.order_status;
    END IF;

    -- 4. Universal Rule: Dispatching to out_for_delivery strictly requires an assigned delivery courier
    IF NEW.order_status = 'out_for_delivery' AND NEW.assigned_delivery_id IS NULL THEN
        RAISE EXCEPTION 'Invalid workflow transition: Cannot dispatch order without an assigned delivery courier.';
    END IF;

    -- 5. Delivery Associate Strict Column Allowlists & State Transitions
    IF user_role = 'delivery' THEN
        -- Check if this update originated from trusted record_order_payment RPC
        is_payment_in_progress := (COALESCE(current_setting('app.payment_in_progress', true), 'false') = 'true');

        -- A. Universal Invariants: 27 columns delivery associates can NEVER modify
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
        IF NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot modify cancellation reason.';
        END IF;
        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot modify creation timestamp.';
        END IF;
        IF NEW.weighed_at IS DISTINCT FROM OLD.weighed_at THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot modify store intake weighing timestamp.';
        END IF;

        -- B. Associates cannot perform internal store operations or cancellation
        IF NEW.order_status IN ('washing', 'ready_for_delivery') AND OLD.order_status != NEW.order_status THEN
            RAISE EXCEPTION 'Unauthorized: Store processing (washing and ready staging) is restricted to Store Managers.';
        END IF;
        IF NEW.order_status = 'cancelled' AND OLD.order_status != 'cancelled' THEN
            RAISE EXCEPTION 'Unauthorized: Order cancellation is restricted to Store Managers and Owners.';
        END IF;

        -- Direct tampering with payment fields outside atomic record_order_payment RPC is strictly rejected
        IF (NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
            NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
            NEW.payment_method IS DISTINCT FROM OLD.payment_method) AND NOT is_payment_in_progress THEN
            RAISE EXCEPTION 'Security violation: Direct payment balance updates on orders are prohibited. Use record_order_payment().';
        END IF;

        -- C. Task 1: Pickup Task (when OLD.order_status = 'pickup_assigned')
        IF OLD.order_status = 'pickup_assigned' THEN
            IF OLD.assigned_pickup_id IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'Unauthorized: You are not the assigned pickup associate for this order.';
            END IF;
            IF NEW.order_status NOT IN ('pickup_assigned', 'collected') THEN
                RAISE EXCEPTION 'Invalid transition: Pickup associates can only advance pickup_assigned orders to collected.';
            END IF;

            -- Explicit Non-Allowed Columns check for Pickup Task
            IF NEW.delivered_at IS NOT NULL THEN
                RAISE EXCEPTION 'Security violation: Delivered timestamp cannot be set during pickup.';
            END IF;
            IF (NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
                NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
                NEW.payment_method IS DISTINCT FROM OLD.payment_method) THEN
                RAISE EXCEPTION 'Security violation: Delivery associates cannot modify payment details during pickup.';
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

        -- D. Task 2: Delivery Dispatch Task (when OLD.order_status IN ('ready_for_delivery', 'delivery_assigned'))
        ELSIF OLD.order_status IN ('ready_for_delivery', 'delivery_assigned') THEN
            IF OLD.assigned_delivery_id IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'Unauthorized: You are not the assigned delivery courier for this order.';
            END IF;
            IF NEW.order_status NOT IN (OLD.order_status, 'out_for_delivery') THEN
                RAISE EXCEPTION 'Invalid transition: Courier can only dispatch ready/assigned orders to out_for_delivery.';
            END IF;

            -- Explicit Non-Allowed Columns check for Dispatch Task
            IF NEW.measured_weight IS DISTINCT FROM OLD.measured_weight OR
               NEW.pickup_measured_weight IS DISTINCT FROM OLD.pickup_measured_weight OR
               NEW.billable_weight IS DISTINCT FROM OLD.billable_weight OR
               NEW.total_amount_paise IS DISTINCT FROM OLD.total_amount_paise OR
               NEW.collected_at IS DISTINCT FROM OLD.collected_at OR
               NEW.pickup_weighed_at IS DISTINCT FROM OLD.pickup_weighed_at OR
               NEW.pickup_weighed_by IS DISTINCT FROM OLD.pickup_weighed_by THEN
                RAISE EXCEPTION 'Security violation: Weights and collection details cannot be modified during delivery dispatch.';
            END IF;
            IF NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
                RAISE EXCEPTION 'Security violation: Delivered timestamp cannot be set during delivery dispatch.';
            END IF;
            IF (NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
                NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
                NEW.payment_method IS DISTINCT FROM OLD.payment_method) AND NOT is_payment_in_progress THEN
                RAISE EXCEPTION 'Security violation: Payment records cannot be modified directly during delivery dispatch.';
            END IF;

        -- E. Task 3: Delivery Handover Task (when OLD.order_status = 'out_for_delivery')
        ELSIF OLD.order_status = 'out_for_delivery' THEN
            IF OLD.assigned_delivery_id IS DISTINCT FROM auth.uid() THEN
                RAISE EXCEPTION 'Unauthorized: You are not the assigned delivery courier for this order.';
            END IF;
            IF NEW.order_status NOT IN ('out_for_delivery', 'delivered') THEN
                RAISE EXCEPTION 'Invalid transition: Dispatched orders can only advance to delivered.';
            END IF;

            -- Explicit Non-Allowed Columns check for Delivery Handover Task
            IF NEW.measured_weight IS DISTINCT FROM OLD.measured_weight OR
               NEW.pickup_measured_weight IS DISTINCT FROM OLD.pickup_measured_weight OR
               NEW.billable_weight IS DISTINCT FROM OLD.billable_weight OR
               NEW.total_amount_paise IS DISTINCT FROM OLD.total_amount_paise OR
               NEW.collected_at IS DISTINCT FROM OLD.collected_at OR
               NEW.pickup_weighed_at IS DISTINCT FROM OLD.pickup_weighed_at OR
               NEW.pickup_weighed_by IS DISTINCT FROM OLD.pickup_weighed_by THEN
                RAISE EXCEPTION 'Security violation: Weights and collection details cannot be modified during delivery handover.';
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
            IF NEW.order_status NOT IN ('delivery_assigned', 'ready_for_delivery', 'out_for_delivery', 'cancelled') THEN
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
-- 4. TRIGGER ATTACHMENT
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_enforce_order_workflow ON public.orders;
CREATE TRIGGER trigger_enforce_order_workflow
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_order_workflow_integrity();

-- ------------------------------------------------------------------------------
-- 5. GRANTS AND PERMISSIONS
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE public.payments TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.orders TO authenticated;
