-- ==============================================================================
-- SuperWash Exprez — Customer Address Management & Order Location Update RPC
-- Migration: 20261027100000_address_management_and_order_location_rpc.sql
-- ==============================================================================
-- Purpose:
-- 1. Grant UPDATE, DELETE on public.customer_addresses to authenticated role
--    (enabling customers to edit and delete their own saved addresses under existing RLS).
-- 2. Create hardened SECURITY DEFINER RPC public.update_order_pickup_location()
--    allowing customers to correct address, landmark, PIN, and GPS coordinates
--    on their own orders strictly while order_status = 'booked'.
-- ==============================================================================

BEGIN;

-- 1. Grant UPDATE and DELETE on customer_addresses to authenticated role
-- Existing RLS policy "Customers can manage own addresses" ON public.customer_addresses
-- already enforces (auth.uid() = user_id) for all operations.
GRANT UPDATE, DELETE ON TABLE public.customer_addresses TO authenticated;

-- 2. Create Hardened Atomic RPC for Customer Post-Booking Pickup Location Correction
CREATE OR REPLACE FUNCTION public.update_order_pickup_location(
    p_order_id UUID,
    p_pickup_address TEXT,
    p_pickup_landmark TEXT DEFAULT NULL,
    p_pickup_pincode TEXT DEFAULT '560038',
    p_pickup_latitude NUMERIC DEFAULT NULL,
    p_pickup_longitude NUMERIC DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
    v_caller_id UUID;
    v_order public.orders;
    v_user_role TEXT;
BEGIN
    -- 1. Authentication Check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: You must be signed in to modify order pickup details.';
    END IF;

    -- 2. Retrieve Existing Order with Row Locking
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    -- 3. Caller Role & Ownership Check
    v_user_role := public.current_user_role();
    IF v_order.customer_id IS DISTINCT FROM v_caller_id AND v_user_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Access denied: You do not have permission to modify this order.';
    END IF;

    -- 4. Status Guard: Only permit address corrections while in 'booked' stage
    -- Once assigned, collected, or processed, customer address changes must go through store support
    IF v_order.order_status <> 'booked' THEN
        RAISE EXCEPTION 'Pickup location can only be updated while the order is in "booked" status. Current status is "%".', v_order.order_status;
    END IF;

    -- 5. Input Validation
    IF p_pickup_address IS NULL OR TRIM(p_pickup_address) = '' THEN
        RAISE EXCEPTION 'Pickup address is required.';
    END IF;

    IF p_pickup_pincode IS NULL OR TRIM(p_pickup_pincode) = '' THEN
        RAISE EXCEPTION 'Pickup PIN code is required.';
    END IF;

    IF p_pickup_pincode !~ '^[1-9][0-9]{5}$' THEN
        RAISE EXCEPTION 'Invalid PIN code format. Must be a 6-digit Indian PIN code.';
    END IF;

    -- Geographic coordinate pair & range validation
    IF (p_pickup_latitude IS NULL AND p_pickup_longitude IS NOT NULL) OR
       (p_pickup_latitude IS NOT NULL AND p_pickup_longitude IS NULL) THEN
        RAISE EXCEPTION 'Latitude and longitude must be provided as a coordinate pair.';
    END IF;

    IF p_pickup_latitude IS NOT NULL AND (
        p_pickup_latitude < -90 OR p_pickup_latitude > 90 OR
        p_pickup_longitude < -180 OR p_pickup_longitude > 180
    ) THEN
        RAISE EXCEPTION 'Coordinates are outside the valid geographic range.';
    END IF;

    -- 6. Perform Authorized Update with Concurrency Guard
    UPDATE public.orders
    SET pickup_address = TRIM(p_pickup_address),
        pickup_landmark = NULLIF(TRIM(p_pickup_landmark), ''),
        pickup_pincode = TRIM(p_pickup_pincode),
        pickup_latitude = p_pickup_latitude,
        pickup_longitude = p_pickup_longitude,
        updated_at = NOW()
    WHERE id = p_order_id
      AND order_status = 'booked'
    RETURNING * INTO v_order;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pickup location update failed because the order is no longer in "booked" status.';
    END IF;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Least-Privilege Execution Grants
REVOKE ALL ON FUNCTION public.update_order_pickup_location(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_pickup_location(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated, service_role;

COMMIT;
