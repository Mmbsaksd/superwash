# SuperWash Stage 5B — Phase 2A.1: Isolated PostgreSQL Test Plan & Environment Blueprint

## Executive Metadata & Review Status
* **Document Path:** `docs/review/stage5b_phase2a_postgres_test_plan.md`
* **Status:** REVIEW-ONLY TEST PLAN (Non-executable in current phase)
* **Target Architecture:** Stage 5B Phase 1J Reconciled Batch-Level Coupon Synchronization
* **Database Engine:** Isolated Ephemeral PostgreSQL 15 (`postgres:15-alpine` container)
* **Safeguards Status:** Live Supabase database untouched. Unsafe candidate migration `20261028100000_grant_order_discount_paise_update.sql` excluded and unapplied.

---

## 1. Plan Corrections & Audit of Previous Defects

In this revision (Phase 2A.1), the previous Phase 2A test plan has been corrected to resolve three major defects:

1. **Defective Docker & Shell Commands Fixed:**
   * *Previous defect:* The proposed command attempted `docker exec -i superwash_pg_test psql ... -f "/work/$($_.Name)"` without mounting `/work`, and used an uncontrolled wildcard `Get-ChildItem -Path "supabase/migrations/*.sql"`.
   * *Correction:* Replaced with an explicit read-only workspace volume mount (`-v "${PWD}:/workspace:ro"`), an explicit numbered migration array in verified chronological order, and preflight checks for Docker daemon liveness and port conflicts.
2. **Supabase Compatibility Shims Specified:**
   * *Previous defect:* Failed to define the standard Supabase roles (`anon`, `authenticated`, `service_role`) and extensions, which would cause baseline migrations 4, 8, 14, and 20 to fail immediately.
   * *Correction:* Created a formal `00_supabase_compatibility_shim.sql` specifying all four core roles, the `auth` schema, mock `auth.uid()` / `auth.role()` reading from PostgreSQL session settings (`SET LOCAL request.jwt.claim.sub = ...`), and RLS bypass policies for `service_role`.
3. **Design Draft vs Executable Candidate Disambiguated:**
   * *Previous defect:* Instructed running the test suite directly against `docs/review/20261028100000_secure_weighing_coupon_snapshot.sql.draft`.
   * *Correction:* Inspection of the draft reveals that while its header contains the Phase 1J specification, its SQL function bodies currently retain the Phase 1F single-order update logic and lack `cancel_order_with_batch_sync`. The test plan now explicitly marks the draft as a **Specification Draft** and defines the prerequisite implementation step before batch-concurrency integration tests can pass.

---

## 2. Recommended Isolated Test Environment & Compatibility Shims

### 2.1 Plain PostgreSQL 15 Container vs Local Supabase CLI Stack
* **Environment Evaluation:**
  * Local Supabase CLI (`supabase start`) is not installed on the system PATH (verified via PowerShell probe). Installing and configuring the full Supabase CLI stack introduces heavy external Docker dependencies (Kong, GoTrue, PostgREST, Realtime, Inbucket, Studio).
  * The business logic, RLS policies, trigger state machines, and advisory locks live 100% within PostgreSQL.
* **Recommendation:**
  * Use a lightweight, plain `postgres:15-alpine` container running on isolated port `54322`, pre-seeded with explicit Supabase compatibility shims.
* **Limitations of the Plain Container:**
  * Cannot test PostgREST HTTP layer serialization, GoTrue JWT generation, or Realtime websockets.
  * *Faithful Coverage:* 100% faithful execution of PostgreSQL SQL, PL/pgSQL triggers, column grants, RLS policies, `pg_advisory_xact_lock`, row locks (`FOR UPDATE`), and `SECURITY DEFINER` privileges.

### 2.2 The Supabase Compatibility Shim (`00_supabase_compatibility_shim.sql`)
Before applying any SuperWash migrations, the container must execute:

```sql
-- ==============================================================================
-- SuperWash: Ephemeral Test Compatibility Shim (Plain PostgreSQL -> Supabase Emulation)
-- ==============================================================================

-- 1. Create Core Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Core Supabase Roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
    END IF;
END $$;

GRANT anon, authenticated, service_role TO postgres;

-- 3. Create Emulated auth Schema & Tables
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, postgres;

CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
GRANT SELECT ON TABLE auth.users TO authenticated, service_role, postgres;

-- 4. Session Context Simulation Functions
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.email', true), '');
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.email() TO PUBLIC;
```

---

## 3. Verified Migration History & Volume Strategy

### 3.1 Verified Migration Sequence (Exact Order)
The baseline schema must be constructed by applying exactly these 20 migrations in sequential order. `20261028100000_grant_order_discount_paise_update.sql` is strictly excluded.

1. `supabase/migrations/20261021_initial_schema.sql`
2. `supabase/migrations/20261022120000_feedback_schema.sql`
3. `supabase/migrations/20261022130000_google_oauth_schema.sql`
4. `supabase/migrations/20261022140000_grant_orders_and_table_permissions.sql`
5. `supabase/migrations/20261022150000_workflow_pickup_assignment.sql`
6. `supabase/migrations/20261022160000_fix_admin_role_and_staff_seeding.sql`
7. `supabase/migrations/20261022170000_workflow_audit_lifecycle_and_weight.sql`
8. `supabase/migrations/20261022180000_database_enforced_workflow_and_security.sql`
9. `supabase/migrations/20261022_enhanced_schema.sql`
10. `supabase/migrations/20261023100000_service_catalogue_enhancements.sql`
11. `supabase/migrations/20261023110000_secure_staff_account_creation.sql`
12. `supabase/migrations/20261023120000_staff_management_enhancements.sql`
13. `supabase/migrations/20261023140000_portal_separation_and_role_protection.sql`
14. `supabase/migrations/20261023160000_primary_owner_transition_and_brand_update.sql`
15. `supabase/migrations/20261024100000_concurrency_safe_order_numbers.sql`
16. `supabase/migrations/20261026200000_booking_idempotency_rpc.sql`
17. `supabase/migrations/20261027100000_address_management_and_order_location_rpc.sql`
18. `supabase/migrations/20261027120000_fix_services_catalogue_permissions.sql`
19. `supabase/migrations/20261027130000_fix_staff_profile_deletion_permissions.sql`
20. `supabase/migrations/20261027140000_coupons_and_address_dedup.sql`

*(Explicitly excluded: `supabase/migrations/20261028100000_grant_order_discount_paise_update.sql`)*

---

## 4. Proposed Preflight Commands (Review Only — Do Not Execute Now)

```powershell
# ==============================================================================
# PHASE 2B PREFLIGHT & BOOTSTRAP SCRIPT (REVIEW ONLY)
# ==============================================================================

# 1. Preflight Check: Verify Docker Daemon Liveness
$dockerVersion = docker --version 2>$null
if (-not $dockerVersion) {
    Write-Error "Preflight Failure: Docker is not running or accessible."
    exit 1
}

# 2. Preflight Check: Verify Port 54322 is Available
$portInUse = Get-NetTCPConnection -LocalPort 54322 -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Error "Preflight Failure: Port 54322 is already in use by another process."
    exit 1
}

# 3. Preflight Check: Verify File Existence
$migrationFiles = @(
    "supabase/migrations/20261021_initial_schema.sql",
    "supabase/migrations/20261022120000_feedback_schema.sql",
    "supabase/migrations/20261022130000_google_oauth_schema.sql",
    "supabase/migrations/20261022140000_grant_orders_and_table_permissions.sql",
    "supabase/migrations/20261022150000_workflow_pickup_assignment.sql",
    "supabase/migrations/20261022160000_fix_admin_role_and_staff_seeding.sql",
    "supabase/migrations/20261022170000_workflow_audit_lifecycle_and_weight.sql",
    "supabase/migrations/20261022180000_database_enforced_workflow_and_security.sql",
    "supabase/migrations/20261022_enhanced_schema.sql",
    "supabase/migrations/20261023100000_service_catalogue_enhancements.sql",
    "supabase/migrations/20261023110000_secure_staff_account_creation.sql",
    "supabase/migrations/20261023120000_staff_management_enhancements.sql",
    "supabase/migrations/20261023140000_portal_separation_and_role_protection.sql",
    "supabase/migrations/20261023160000_primary_owner_transition_and_brand_update.sql",
    "supabase/migrations/20261024100000_concurrency_safe_order_numbers.sql",
    "supabase/migrations/20261026200000_booking_idempotency_rpc.sql",
    "supabase/migrations/20261027100000_address_management_and_order_location_rpc.sql",
    "supabase/migrations/20261027120000_fix_services_catalogue_permissions.sql",
    "supabase/migrations/20261027130000_fix_staff_profile_deletion_permissions.sql",
    "supabase/migrations/20261027140000_coupons_and_address_dedup.sql"
)
foreach ($file in $migrationFiles) {
    if (-not (Test-Path $file)) {
        Write-Error "Preflight Failure: Missing required migration file: $file"
        exit 1
    }
}

# 4. Launch Ephemeral PostgreSQL Container with Read-Only Volume Mount
docker run -d `
    --name superwash_test_pg `
    -e POSTGRES_PASSWORD=test_postgres_secret `
    -e POSTGRES_DB=superwash_isolated_test `
    -p 54322:5432 `
    -v "${PWD}:/workspace:ro" `
    postgres:15-alpine

# Wait for database readiness
Start-Sleep -Seconds 3
docker exec superwash_test_pg pg_isready -U postgres -d superwash_isolated_test

# 5. Apply Compatibility Shim
docker exec -i superwash_test_pg psql -U postgres -d superwash_isolated_test -c "
-- Inline execution of 00_supabase_compatibility_shim.sql ...
"

# 6. Apply Baseline Migration History in Strict Sequential Order
foreach ($relPath in $migrationFiles) {
    $containerPath = "/workspace/" + $relPath.Replace("\", "/")
    Write-Host "Applying: $relPath"
    docker exec superwash_test_pg psql -U postgres -d superwash_isolated_test -v ON_ERROR_STOP=1 -f $containerPath
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Migration Failure on $relPath"
        exit 1
    }
}

# 7. Teardown Hook (Runs after tests complete)
# docker stop superwash_test_pg; docker rm superwash_test_pg
```

---

## 5. Security Test Suite (Disambiguated Security Layers)

To prevent claiming that trigger logic was tested when a statement was actually blocked earlier by column grants, each test explicitly isolates its target security layer:

| Test ID | Target Security Layer | Client Connection Role | Operation Executed | Expected Security Failure Mode |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **SQL Column Privilege** | `authenticated` (Manager session) | Direct `UPDATE orders SET discount_paise = 5000 WHERE id = ...;` | **SQL ERROR 42501**: `permission denied for column discount_paise`. (Fails at SQL parser/grant layer before trigger). |
| **SEC-02** | **SQL Column Privilege** | `authenticated` (Manager session) | Direct `UPDATE orders SET coupon_snapshot = '{}' WHERE id = ...;` | **SQL ERROR 42501**: `permission denied for column coupon_snapshot`. |
| **SEC-03** | **Trigger Immutability** | `postgres` (Superuser connection) | Direct `UPDATE orders SET coupon_snapshot = '{"code":"TAMPER"}' WHERE id = ...;` | **TRIGGER EXCEPTION P0001**: `Security violation: coupon_snapshot is immutable and cannot be modified on UPDATE`. |
| **SEC-04** | **Trigger Immutability (NULL)**| `postgres` (Superuser connection) | Direct `UPDATE orders SET coupon_snapshot = '{"code":"NEW"}' WHERE id = <legacy_order_with_null>;` | **TRIGGER EXCEPTION P0001**: Trigger rejects NULL-to-value update on legacy row. |
| **SEC-05** | **Trigger Workflow Integrity** | `authenticated` (Manager session) | Direct `UPDATE orders SET paid_amount_paise = 0 WHERE id = ...;` | **TRIGGER EXCEPTION P0001**: `Security violation: Paid amount on orders cannot decrease`. |
| **SEC-06** | **Trigger Workflow Integrity** | `authenticated` (Manager session) | Direct `UPDATE orders SET paid_amount_paise = 5000 WHERE id = ...;` (Without payment ledger row) | **TRIGGER EXCEPTION P0001**: `Security violation: Direct payment field modification is prohibited`. |
| **SEC-07** | **RLS Row-Access Policy** | `authenticated` (Customer session) | Direct `UPDATE orders SET order_status = 'cancelled' WHERE id = ...;` | **RLS REJECTION**: 0 rows updated (or trigger exception `Unauthorized: Only store managers... can update orders`). |
| **SEC-08** | **RPC Role Authorization** | `authenticated` (Customer session) | Call `record_store_intake_weight(p_order_id, 2.5)` | **RPC EXCEPTION P0001**: `Unauthorized: Only Store Managers and Owners can record store intake weight`. |
| **SEC-09** | **RPC Courier Assignment** | `authenticated` (Courier B session) | Call `record_courier_pickup_collection` on order assigned to Courier A | **RPC EXCEPTION P0001**: `Unauthorized: You are not the assigned pickup associate for this order`. |
| **SEC-10** | **RPC Search Path Audit** | `postgres` (System inspection) | Inspect `proconfig` for `record_store_intake_weight` and `cancel_order_with_batch_sync` | Assert: `search_path=public, pg_temp` is pinned to prevent search-path injection. |

---

## 6. Financial Correctness & Batch Recalculation Test Suite

| Test ID | Financial Test Scenario | Operational Execution | Concrete Arithmetic & Assertions |
| :--- | :--- | :--- | :--- |
| **FIN-01** | **Weighing Sequence Invariance** | Service 1: Wash & Fold (2.0 kg @ ₹80 = ₹160). Coupon: 20% off, min ₹300, max ₹100.<br/>Service 2: Dry Clean (4.0 kg @ ₹100 = ₹400). Combined subtotal: ₹560.<br/>**Run A:** Weigh S1 then S2.<br/>**Run B:** Weigh S2 then S1. | **Run A & B Identical down to the paise:**<br/>* S1 Base: ₹160.00; S1 Discount: ₹100.00 (capped); S1 Payable: ₹60.00.<br/>* S2 Base: ₹400.00; S2 Discount: ₹0.00; S2 Payable: ₹400.00.<br/>* Batch Total Payable: **₹460.00**. |
| **FIN-02** | **Sibling Weight Expansion** | S1 weighed at 2.0 kg (₹160). S2 unweighed (est. 2.0 kg @ ₹100 = ₹200). Initial batch ₹360 $\to$ ₹72 disc.<br/>S2 subsequently weighed at 6.0 kg (₹600). Batch expands to ₹760. | * Raw discount: 20% of ₹760 = ₹152 $\to$ capped at max ₹100.<br/>* S1 discount automatically expands from ₹72 to ₹100.<br/>* S1 total automatically updates from ₹88 to ₹60. |
| **FIN-03** | **Threshold Breach Revocation** | S1 weighed at 2.0 kg (₹160). S2 unweighed (est. ₹200). Batch ₹360 $\ge$ ₹300 min $\to$ ₹72 disc.<br/>S2 subsequently weighed at 0.5 kg (subtotal ₹50). Actual batch = ₹210 ($<$ ₹300). | * Actual batch fails minimum threshold rule ($₹210 < ₹300$).<br/>* S1 discount is **revoked to 0 paise**.<br/>* S1 total restores to ₹160.00. |
| **FIN-04** | **Belated Threshold Crossing** | S1 weighed at 1.0 kg (₹80). S2 unweighed (est. ₹150). Batch ₹230 $<$ ₹300 $\to$ disc = 0.<br/>S2 subsequently weighed at 3.0 kg (subtotal ₹300). Actual batch = ₹380 ($\ge$ ₹300). | * Batch meets threshold on final scale measurement.<br/>* S1 discount is **retroactively awarded**: 20% of ₹380 = ₹76.<br/>* S1 total updates to $₹80 - ₹76 = ₹4.00$ (400 paise). |
| **FIN-05** | **Fixed-Coupon Excess Forfeiture** | S1 subtotal: ₹60. S2 subtotal: ₹300. Combined: ₹360. Coupon: Flat ₹100 off (min ₹200). | * S1 discount: $\min(₹100, ₹60) = ₹60.00$. S1 total = ₹0.00.<br/>* S2 discount: ₹0.00. S2 total = ₹300.00.<br/>* Excess ₹40 discount is **forfeited**; never transferred to S2. |
| **FIN-06** | **Delivery Fee Excluded** | S1: ₹160 + ₹40 delivery fee. S2: ₹200 + ₹0 delivery fee. Coupon: 20% off (min ₹300). | * Combined eligible subtotal = $₹160 + ₹200 = ₹360$ (delivery fee excluded).<br/>* Discount = 20% of ₹360 = ₹72.<br/>* S1 total = ₹160 - ₹72 + ₹40 = ₹128.00. |
| **FIN-07** | **Sibling Cancelled After Weighing** | S1 weighed with ₹72 discount. S2 is cancelled via `cancel_order_with_batch_sync`. Remaining batch is only S1 (₹160 $<$ ₹300). | * S2 status updates to `'cancelled'`.<br/>* S1 discount is **atomically revoked to 0**.<br/>* S1 total restores to ₹160.00. |
| **FIN-08** | **Paid-Amount Guard Invariant** | S1 weighed; customer pays ₹160 in full (`paid_amount_paise = 16000`). S2 weighing recalculates S1 total to ₹110. | * **TRANSACTION ABORTS & ROLLS BACK**.<br/>* Exception: `Downward re-weighing rejected: ... less than already paid amount`.<br/>* S1 total remains ₹160; S2 remains unweighed. |
| **FIN-09** | **Pricing Units: per_piece & per_load** | S1: 10 pieces @ ₹25/pc = ₹250. S2: 1 load @ ₹200 = ₹200. Combined batch: ₹450. | * Charges evaluate without weight distortion.<br/>* Combined batch = ₹450. Discount evaluates accurately. |

---

## 7. Multi-Client Concurrency Test Protocol

### 7.1 Objective & Test Harness
To prove that shared batch advisory locking (`pg_advisory_xact_lock`) and deterministic row ordering (`ORDER BY id ASC FOR UPDATE`) serialize operations and prevent deadlocks, a Node.js/TypeScript test harness using a multi-connection `pg.Pool` will run concurrent requests against the container.

### 7.2 Multi-Connection Test Cases
1. **Concurrent Sibling Weighing Race:**
   * Connection 1 calls `record_store_intake_weight` for S1.
   * Connection 2 calls `record_store_intake_weight` for S2 in the exact same linked batch simultaneously.
   * *Assertion:* One connection acquires the advisory lock; the other waits. Both commit successfully. Final S1 discount matches combined weight. Zero deadlocks (error code `40P01` count = 0).
2. **Concurrent Weighing vs Synchronized Cancellation Race:**
   * Connection 1 calls `record_store_intake_weight` for S1.
   * Connection 2 calls `cancel_order_with_batch_sync` for S2 simultaneously.
   * *Assertion:* Operations serialize cleanly. If weighing commits first, cancellation immediately revokes S1's discount. If cancellation commits first, weighing calculates S1 in isolation. Zero race conditions.
3. **Deadlock Inversion Stress Test:**
   * Two connections attempt to update multiple orders in reverse order without the advisory lock (simulating an edge case).
   * *Assertion:* Row locking ordered via `ORDER BY id ASC FOR UPDATE` prevents cyclical wait conditions.
4. **Advisory Lock Release on Rollback:**
   * Connection 1 starts a transaction, acquires the batch advisory lock, and raises a downward paid-amount violation.
   * *Assertion:* Transaction-level advisory lock (`pg_advisory_xact_lock`) is automatically released on rollback. Connection 2 immediately acquires the lock without hanging.

---

## 8. Prerequisites & Explicit GO/NO-GO Criteria for Phase 2B

### 8.1 Status of Implementation Draft
> [!IMPORTANT]
> **Prerequisite Implementation Required Before Concurrency Testing:**
> The current review draft `docs/review/20261028100000_secure_weighing_coupon_snapshot.sql.draft` contains the Phase 1J design specification in its comments, but its executable function bodies do not yet include batch-level cascading recalculations or `cancel_order_with_batch_sync`.
> 
> Therefore, before executing Phase 2B integration tests:
> 1. The draft SQL function bodies must be upgraded to implement the Phase 1J specification.
> 2. The user must provide explicit approval to launch the local Docker test container.

### 8.2 Phase 2B GO/NO-GO Criteria

| Checkpoint | Gate Condition | Status |
| :--- | :--- | :---: |
| **File Safety** | Zero changes to frontend source code, active migrations, or candidate migration. | **PASS** |
| **Environment Isolation** | Plain Docker container on port 54322; zero interaction with remote Supabase. | **PASS** |
| **Compatibility Shims** | Complete `00_supabase_compatibility_shim.sql` specified with roles, schemas, and session auth mocks. | **PASS** |
| **SQL Draft Readiness** | Executable function bodies upgraded to match Phase 1J design specifications. | **PENDING IMPLEMENTATION** |
| **User Sign-Off** | Explicit approval to spin up local Docker container and run test suite. | **PENDING APPROVAL** |

### Confirmation of Safeguards:
* No containers, databases, or migrations were started or applied.
* No frontend or backend application code was modified.
* `supabase/migrations/20261028100000_grant_order_discount_paise_update.sql` remains unapplied and excluded.
* Only the review plan document `docs/review/stage5b_phase2a_postgres_test_plan.md` was created.
* Execution is stopped awaiting user approval.
