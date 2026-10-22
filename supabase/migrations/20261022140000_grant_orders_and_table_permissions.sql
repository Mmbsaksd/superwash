-- ==============================================================================
-- SuperWash Express: Table Grants for Authenticated & Public Operations
-- Migration: 20261022140000_grant_orders_and_table_permissions.sql
-- ==============================================================================
-- Grants explicit, least-privilege table permissions to the 'authenticated'
-- and 'anon' roles based strictly on verified frontend application queries.
--
-- Row Level Security (RLS) remains active on all tables to enforce role-based
-- isolation (customer, delivery, manager, owner) on every row.
-- ==============================================================================

-- 1. Core Orders & Customer Registration Flow
-- Authenticated users (customers, delivery, staff):
-- - Customers can view their own orders and insert bookings (governed by RLS)
-- - Delivery staff can view and update assigned orders (governed by RLS)
-- - Managers and owners can view and update all orders (governed by RLS)
-- Note: 'anon' is explicitly NOT granted access to orders or profiles.
GRANT SELECT, INSERT, UPDATE ON TABLE public.orders TO authenticated;

-- 2. Profiles Table
-- Authenticated users:
-- - View permitted profiles (self, assigned customers for delivery, staff/customers for managers/owner)
-- - Insert new profile fallback with default 'customer' role
-- - Update own contact details (phone, full_name, avatar_url) during delivery profile completion
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- 3. Customer Saved Addresses
-- Authenticated customers:
-- - Select their saved addresses
-- - Insert new pickup address during profile completion or booking
GRANT SELECT, INSERT ON TABLE public.customer_addresses TO authenticated;

-- 4. Order Supporting Tables (Payments, Status History, Feedback, Notifications)
-- Authenticated users:
-- - Record payments for assigned orders (delivery) or any order (manager/owner)
-- - View relevant payments (customer for own order, delivery for assigned, manager/owner)
GRANT SELECT, INSERT ON TABLE public.payments TO authenticated;
GRANT SELECT, INSERT ON TABLE public.order_status_history TO authenticated;
GRANT SELECT, INSERT ON TABLE public.weight_change_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.order_feedback TO authenticated;
GRANT SELECT, INSERT ON TABLE public.notification_logs TO authenticated;

-- 5. Public & Store Configuration Tables
-- Unauthenticated ('anon') and logged-in ('authenticated') users need SELECT
-- to view pricing, slots, serviceable areas, and catalog services.
GRANT SELECT ON TABLE public.business_settings TO anon, authenticated;
GRANT UPDATE ON TABLE public.business_settings TO authenticated;

GRANT SELECT ON TABLE public.pickup_slots TO anon, authenticated;

GRANT SELECT ON TABLE public.service_areas TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.service_areas TO authenticated;

GRANT SELECT ON TABLE public.services TO anon, authenticated;
GRANT UPDATE ON TABLE public.services TO authenticated;

-- 6. Sequence Grants
-- Required for order number generation (SW-xxxx) during customer booking
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO authenticated;
