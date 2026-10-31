-- ==============================================================================
-- SuperWash Exprez: Fix Order Workflow Trigger Role Resolution
-- Migration: 20261029160000_fix_order_workflow_user_role_resolution.sql
-- ==============================================================================
-- Bug Description:
-- In migration 20261028100000_grant_order_discount_paise_update.sql, the trigger
-- function public.enforce_order_workflow_integrity() declared variable:
--   user_role TEXT;
-- but omitted the assignment:
--   user_role := public.current_user_role();
--
-- Consequently, user_role remained NULL for all non-service_role callers, causing
-- the authorization guard in Section 1:
--   ELSIF user_role IS NULL OR user_role NOT IN ('owner', 'manager', 'delivery') THEN
--       RAISE EXCEPTION 'Unauthorized: Only store managers, owners, and assigned associates can update orders (Caller role: %).', COALESCE(user_role, 'unauthenticated');
--   END IF;
-- to fail with "(Caller role: unauthenticated)" for authenticated store managers,
-- owners, and delivery associates whenever an order was updated (including during
-- courier pickup or delivery assignment via assign_order_courier RPC or direct UPDATE).
--
-- This migration restores the authoritative server-side role resolution:
--   user_role := public.current_user_role();
-- while preserving 100% of the existing discount validation, atomic total
-- recalculation, payment protections, workflow state transitions, customer
-- self-cancellation, and linked-batch grouping integrity invariants.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.enforce_order_workflow_integrity()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
    effective_weight NUMERIC(5, 2);
    v_pricing_unit VARCHAR(50);
    v_unit_price BIGINT;
    v_delivery_fee BIGINT;
    v_subtotal BIGINT;
    v_effective_discount BIGINT;
    v_expected_total BIGINT;
BEGIN
    -- Superuser and service-role maintenance tasks bypass trigger
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Authoritative role resolution from active profile
    user_role := public.current_user_role();

    -- 1. Authorization: Unauthenticated, customer, or unknown roles cannot update orders directly
    IF NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' AND OLD.customer_id = auth.uid() THEN
        -- Customer cancelling own order (authorized via cancel_order_with_batch_sync)
        NULL;
    ELSIF user_role IS NULL OR user_role NOT IN ('owner', 'manager', 'delivery') THEN
        RAISE EXCEPTION 'Unauthorized: Only store managers, owners, and assigned associates can update orders (Caller role: %).', COALESCE(user_role, 'unauthenticated');
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

    -- 5. Universal Payment Integrity Check (Applies to ALL roles: Manager, Owner, Delivery)
    -- Payment balance on orders cannot be modified directly without an authentic matching payment ledger row
    IF NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
       NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
       NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN

        IF NEW.paid_amount_paise < OLD.paid_amount_paise THEN
            RAISE EXCEPTION 'Security violation: Paid amount on orders cannot decrease (% -> %).',
                OLD.paid_amount_paise, NEW.paid_amount_paise;
        END IF;

        IF NEW.total_amount_paise IS NOT NULL AND NEW.paid_amount_paise > NEW.total_amount_paise THEN
            RAISE EXCEPTION 'Security violation: Paid amount (% paise) cannot exceed bill total (% paise).',
                NEW.paid_amount_paise, NEW.total_amount_paise;
        END IF;

        -- Must have a matching authentic row in public.payments
        IF NOT EXISTS (
            SELECT 1 FROM public.payments p
            WHERE p.order_id = NEW.id
              AND p.amount_paise = (NEW.paid_amount_paise - OLD.paid_amount_paise)
        ) THEN
            RAISE EXCEPTION 'Security violation: Direct payment field modification is prohibited. Payments must be processed through record_order_payment().';
        END IF;
    END IF;

    -- 6. Universal Financial & Discount Integrity & Boundary Validation
    -- A. Only verified store managers and owners can modify order discount_paise
    -- Explicitly denies NULL, missing, unauthenticated, or unrecognized roles (defending against PostgreSQL 3-valued logic where NULL NOT IN (...) evaluates to NULL)
    IF user_role IS NULL AND NEW.discount_paise IS DISTINCT FROM OLD.discount_paise THEN
        RAISE EXCEPTION 'Security violation: Delivery associates cannot modify order discounts (Caller role: unauthenticated). Only store managers and owners are permitted.';
    END IF;

    IF user_role NOT IN ('owner', 'manager') AND NEW.discount_paise IS DISTINCT FROM OLD.discount_paise THEN
        RAISE EXCEPTION 'Security violation: Delivery associates cannot modify order discounts (Caller role: %). Only store managers and owners are permitted.', COALESCE(user_role, 'unauthenticated');
    END IF;

    -- B. Order discount cannot be negative
    IF NEW.discount_paise IS NOT NULL AND NEW.discount_paise < 0 THEN
        RAISE EXCEPTION 'Validation error: Order discount cannot be negative (% paise).', NEW.discount_paise;
    END IF;

    -- C. Order total amount cannot be negative
    IF NEW.total_amount_paise IS NOT NULL AND NEW.total_amount_paise < 0 THEN
        RAISE EXCEPTION 'Validation error: Order total amount cannot be negative (% paise).', NEW.total_amount_paise;
    END IF;

    -- D. Formula Consistency & Atomic Recalculation for Weighed Orders
    -- If the order has an established billable weight, verify or recalculate total_amount_paise against pricing formula
    IF COALESCE(NEW.billable_weight, OLD.billable_weight) IS NOT NULL THEN
        v_pricing_unit := COALESCE(NEW.pricing_unit, OLD.pricing_unit, 'per_kg');
        v_unit_price := COALESCE(NEW.price_per_kg_paise, OLD.price_per_kg_paise, 7900);
        v_delivery_fee := COALESCE(NEW.delivery_charge_paise, OLD.delivery_charge_paise, 0);

        IF v_pricing_unit = 'per_piece' THEN
            v_subtotal := ROUND(COALESCE(NEW.billable_weight, OLD.billable_weight, 0)) * v_unit_price;
        ELSIF v_pricing_unit = 'per_load' THEN
            v_subtotal := GREATEST(1, ROUND(COALESCE(NEW.billable_weight, OLD.billable_weight, 1))) * v_unit_price;
        ELSIF v_pricing_unit = 'per_order' THEN
            v_subtotal := v_unit_price;
        ELSE
            -- Default 'per_kg'
            v_subtotal := ROUND(COALESCE(NEW.billable_weight, OLD.billable_weight, 0) * v_unit_price);
        END IF;

        v_effective_discount := LEAST(COALESCE(NEW.discount_paise, 0), v_subtotal);
        v_expected_total := GREATEST(0, v_subtotal - v_effective_discount + v_delivery_fee);

        -- If discount changed but caller did not supply a new total_amount_paise (discount-only update),
        -- atomically synchronize NEW.total_amount_paise to the exact formula amount
        IF NEW.discount_paise IS DISTINCT FROM OLD.discount_paise AND NEW.total_amount_paise IS NOT DISTINCT FROM OLD.total_amount_paise THEN
            NEW.total_amount_paise := v_expected_total;
        -- If total_amount_paise was explicitly changed or provided, it MUST strictly match the formula
        ELSIF NEW.total_amount_paise IS DISTINCT FROM OLD.total_amount_paise THEN
            IF NEW.total_amount_paise <> v_expected_total THEN
                RAISE EXCEPTION 'Validation error: Total amount (% paise) does not match the pricing formula (% paise - discount % paise + delivery % paise = % paise).',
                    NEW.total_amount_paise, v_subtotal, v_effective_discount, v_delivery_fee, v_expected_total;
            END IF;
        END IF;
    END IF;

    -- E. Financial Invariant: Bill total cannot be reduced below already paid amount
    IF NEW.total_amount_paise IS NOT NULL AND NEW.paid_amount_paise > NEW.total_amount_paise THEN
        RAISE EXCEPTION 'Security violation: Bill total (% paise) cannot be reduced below already paid amount (% paise).',
            NEW.total_amount_paise, NEW.paid_amount_paise;
    END IF;

    -- 7. Delivery Associate Strict Column Allowlists & State Transitions
    IF user_role = 'delivery' THEN
        -- A. Universal Invariants: Columns delivery associates can NEVER modify
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
        IF NEW.discount_paise IS DISTINCT FROM OLD.discount_paise THEN
            RAISE EXCEPTION 'Security violation: Delivery associates cannot modify order discounts.';
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
               NEW.discount_paise IS DISTINCT FROM OLD.discount_paise OR
               NEW.collected_at IS DISTINCT FROM OLD.collected_at OR
               NEW.pickup_weighed_at IS DISTINCT FROM OLD.pickup_weighed_at OR
               NEW.pickup_weighed_by IS DISTINCT FROM OLD.pickup_weighed_by THEN
                RAISE EXCEPTION 'Security violation: Weights, discounts, and collection details cannot be modified during delivery dispatch.';
            END IF;
            IF NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
                RAISE EXCEPTION 'Security violation: Delivered timestamp cannot be set during delivery dispatch.';
            END IF;
            IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
                IF (NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
                    NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
                    NEW.payment_method IS DISTINCT FROM OLD.payment_method) THEN
                    RAISE EXCEPTION 'Security violation: Delivery dispatch cannot directly modify payment fields. Payments must be recorded separately via record_order_payment().';
                END IF;
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
               NEW.discount_paise IS DISTINCT FROM OLD.discount_paise OR
               NEW.collected_at IS DISTINCT FROM OLD.collected_at OR
               NEW.pickup_weighed_at IS DISTINCT FROM OLD.pickup_weighed_at OR
               NEW.pickup_weighed_by IS DISTINCT FROM OLD.pickup_weighed_by THEN
                RAISE EXCEPTION 'Security violation: Weights, discounts, and collection details cannot be modified during delivery handover.';
            END IF;

            IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
                IF (NEW.paid_amount_paise IS DISTINCT FROM OLD.paid_amount_paise OR
                    NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
                    NEW.payment_method IS DISTINCT FROM OLD.payment_method) THEN
                    RAISE EXCEPTION 'Security violation: Delivery handover cannot directly modify payment fields. Payments must be recorded separately via record_order_payment().';
                END IF;
            END IF;

            IF NEW.order_status = 'delivered' AND NEW.delivered_at IS NULL THEN
                NEW.delivered_at := timezone('utc', now());
            END IF;

        -- F. Orders in any other state (booked, collected, weighed, washing, delivered, cancelled)
        ELSE
            RAISE EXCEPTION 'Unauthorized: Delivery associates cannot update orders in status %.', OLD.order_status;
        END IF;
    END IF;

    -- 8. Store Manager & Owner Restrictions & Lifecycle State Machine
    IF user_role IN ('manager', 'owner') THEN
        -- Immutable Booking & Pricing Snapshots: Managers/owners cannot retroactively alter booked customer details
        IF NEW.id IS DISTINCT FROM OLD.id OR
           NEW.order_number IS DISTINCT FROM OLD.order_number OR
           NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
           NEW.customer_name IS DISTINCT FROM OLD.customer_name OR
           NEW.customer_phone IS DISTINCT FROM OLD.customer_phone OR
           NEW.pickup_address IS DISTINCT FROM OLD.pickup_address OR
           NEW.pickup_pincode IS DISTINCT FROM OLD.pickup_pincode OR
           NEW.pickup_date IS DISTINCT FROM OLD.pickup_date OR
           NEW.pickup_slot IS DISTINCT FROM OLD.pickup_slot OR
           NEW.service_id IS DISTINCT FROM OLD.service_id OR
           NEW.service_name IS DISTINCT FROM OLD.service_name OR
           NEW.pricing_unit IS DISTINCT FROM OLD.pricing_unit OR
           NEW.price_per_kg_paise IS DISTINCT FROM OLD.price_per_kg_paise OR
           NEW.min_weight_kg IS DISTINCT FROM OLD.min_weight_kg OR
           NEW.delivery_charge_paise IS DISTINCT FROM OLD.delivery_charge_paise OR
           NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Security violation: Booking details and pricing snapshots are immutable once placed.';
        END IF;

        -- Cancellation reason mandatory when cancelling
        IF NEW.order_status = 'cancelled' AND OLD.order_status != 'cancelled' THEN
            IF NEW.cancellation_reason IS NULL OR TRIM(NEW.cancellation_reason) = '' THEN
                RAISE EXCEPTION 'Validation error: A cancellation reason is mandatory when cancelling an order.';
            END IF;
        END IF;

        -- Sequential Lifecycle State Machine
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

        -- Scale weight requirement: Clothes cannot enter washing without a recorded scale weight
        IF NEW.order_status = 'washing' AND OLD.order_status != 'washing' THEN
            IF COALESCE(NEW.measured_weight, OLD.measured_weight) IS NULL OR COALESCE(NEW.measured_weight, OLD.measured_weight) <= 0 THEN
                RAISE EXCEPTION 'Intake weight required: Scale weight must be recorded before clothes can enter washing.';
            END IF;
        END IF;
    END IF;

    -- 9. Linked-Batch Metadata Protection
    -- Strictly protects batch grouping integrity:
    -- (a) If order was placed with a linked-batch marker, it cannot be stripped or changed to a different batch ID.
    -- (b) If order was placed without a linked-batch marker, no update can inject a marker later.
    IF OLD.notes LIKE '%[Linked Batch %' THEN
        IF NEW.notes IS NULL OR
           NEW.notes NOT LIKE '%[Linked Batch %' OR
           substring(NEW.notes FROM '\[Linked Batch ([^:\]]+)') IS DISTINCT FROM substring(OLD.notes FROM '\[Linked Batch ([^:\]]+)') THEN
            RAISE EXCEPTION 'Security violation: Linked batch metadata in order notes is immutable once assigned.';
        END IF;
    ELSE
        IF NEW.notes LIKE '%[Linked Batch %' THEN
            RAISE EXCEPTION 'Security violation: Cannot inject linked batch metadata into an order that was not created as part of a linked batch.';
        END IF;
    END IF;

    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- TRIGGER RE-ATTACHMENT (IDEMPOTENT)
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_enforce_order_workflow ON public.orders;
CREATE TRIGGER trigger_enforce_order_workflow
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_order_workflow_integrity();
