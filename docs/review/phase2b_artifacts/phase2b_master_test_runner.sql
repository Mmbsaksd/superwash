-- ==============================================================================
-- SuperWash Stage 5B Phase 2B: Master SQL Runner Index
-- ==============================================================================
-- This SQL file provides a unified sequential index of all Phase 2B test scripts.
-- Execution is orchestrated via phase2b_master_test_runner.ps1 against the isolated
-- Docker container: superwash-stage5b-pg15-test on loopback port 127.0.0.1:54322.

\echo '=== 1. Supabase Compatibility Shim ==='
\i 00_supabase_compatibility_shim.sql

\echo '=== 2. Suite B: Exhaustive Privileges and Security ==='
\i test_suite_b_privileges.sql

\echo '=== 3. Suite C: Booking, Idempotency & Coupon Snapshots ==='
\i test_suite_c_booking_snapshots.sql

\echo '=== 4. Suite D: Linked Services & Batch Coupon Synchronization ==='
\i test_suite_d_linked_pricing_sync.sql

\echo '=== 5. Suite E: Payment Ledger & Financial Invariants ==='
\i test_suite_e_payment_invariants.sql

\echo '=== 6. Suite F: Workflow & Cancellation State Machine ==='
\i test_suite_f_workflow_state_machine.sql

\echo '=== 7. Suite G: Invoice and Billing Reconciliation ==='
\i test_suite_g_invoice_reconciliation.sql
