# SuperWash Stage 5B — Secure RPC Staging Rollout Plan & Execution Runbook

**Document Path:** `docs/review/stage5b_secure_rpc_rollout_plan.md`  
**Status:** **AUTHORITATIVE STAGING ROLLOUT BLUEPRINT (REVIEW ONLY — DO NOT APPLY WITHOUT SEPARATE AUTHORIZATION)**  
**Target Systems:** Supabase Staging PostgreSQL, PostgREST API Engine, Cloudflare Pages Frontend (`https://superwash.pages.dev`)  
**Verified Primary Release Candidate:**
- **File:** `docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql`  
- **SHA256 Checksum:** `37C8018B7A254870CEF4AA9B1B35FF0C378F71DF36EF0E9373F6B812483CD40D`  
- **Local Verification Evidence:** Executed and passed all 9 test suites (93 assertions, 0 failed, 0 deadlocks) in clean PostgreSQL 15 disposable container (`docs/review/phase2b_artifacts/phase2b_execution.log`).
- **Frontend Verification:** `frontend/src/services/laundryService.ts` — 261/261 Vitest tests passing, production build exit code 0 (`tsc -b && vite build` in 5.72s).
- **Quarantined Draft:** `supabase/migrations/20261028100000_grant_order_discount_paise_update.sql` remains **UNTOUCHED AND UNAPPLIED**.

---

## 1. Executive Summary & Why Atomic Release is Mandatory

The SuperWash Stage 5B upgrade secures financial calculations, weighing scales, and workflow transitions by transferring all order mutations from direct table writes to authenticated PostgreSQL RPCs, locking coupon terms at booking time, and recalculating linked-service batches atomically under advisory locks.

### The Problem With Split Migrations
Earlier drafts explored a split migration model (`01_additive` -> deploy frontend -> `02_hardening`). However:
1. An intermediate window where additive RPCs are present while table write privileges remain unhardened is unsafe. Any user with an older cached frontend who cancels an order will perform a direct `UPDATE public.orders SET order_status = 'cancelled'`, which bypasses `synchronize_batch_coupon_internal()`.
2. The frontend has already been hardened to **fail closed** on all live operational paths (`laundryService.ts`), completely removing direct-write fallbacks.
3. Therefore, the release candidate is deployed as **one atomic, single-transaction migration** (`00_stage5b_atomic_release.sql`) within a scheduled off-peak maintenance window.

---

## 2. Verification of Database Execution Methods

### 2.1 CLI Inspection Findings (Supabase CLI v2.121.0)
A rigorous inspection of local Supabase CLI help and flag validation (`npx supabase db query --help` and flag coupling checks) confirmed:
1. **`supabase db execute` Does Not Exist:** There is no `execute` command under `supabase db`.
2. **`supabase db query --project-ref` Fails Without `--linked`:**
   Running `npx supabase db query --project-ref <REF>` throws:
   `DbQueryMutuallyExclusiveFlagsError: --project-ref only applies when targeting the linked project; use it with --linked (not --local or --db-url)`
   The CLI strictly couples `--project-ref` with `--linked`, which in turn relies on `supabase/.temp/project-ref` and cloud Management API authentication (`supabase login`).
3. **`--linked` Execution Is Fragile & Risky:** Executing with `--linked` against a 1,987-line multi-statement transaction can encounter Management API HTTP timeouts and risks targeting an unverified cached project ref.
4. **`supabase db push` Is Prohibited:** It scans `supabase/migrations/` and would execute the quarantined, insecure draft `20261028100000_grant_order_discount_paise_update.sql`.

### 2.2 Approved Staging Execution Methods

#### Method A: Supabase Dashboard SQL Editor (Primary Recommended Method)
The Supabase Dashboard SQL Editor is the official, verified administrative interface for executing single-transaction migrations with immediate assertion visibility.

**Mandatory Staging Project Identity Verification Steps:**
1. Log in to `https://app.supabase.com`.
2. Confirm the active project matches the **Staging Project Identity**:
   - **Project Name:** Explicitly verify staging label (e.g., `SuperWash-Staging`).
   - **Project Ref:** Verify the 20-character project reference ID matches the confirmed staging environment.
   - **Database Host & Region:** Verify staging database connection host.
   - **DO NOT PROCEED** if the dashboard displays a Production project ref or live customer data.
3. In the left navigation, click **SQL Editor** -> **+ New Query**.
4. Paste the complete, unmodified [`docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql`](file:///f:/superwash/docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql) (1,987 lines).
5. Click **Run**.
6. Verify output displays:
   - Success status on transaction commit (`COMMIT`).
   - PostgREST reload notification (`NOTIFY pgrst, 'reload schema'`).
   - Section 15 catalog assertion query result showing `authenticated` has **ONLY `SELECT`** privilege on `public.orders` (with column privilege only on `delivery_notes`).

#### Method B: Direct PostgreSQL Client (`psql`) via Explicit Connection String (Alternative)
If automated or shell execution is required and direct database connectivity to the staging PostgreSQL instance is provisioned:
```bash
psql "postgresql://postgres:[CONFIRMED_STAGING_PASSWORD]@[CONFIRMED_STAGING_HOST]:5432/postgres" \
  -v ON_ERROR_STOP=1 \
  -f docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql
```
*(CLI alternatives using `npx supabase db query` are removed due to flag coupling and Management API limitations).*

---

## 3. PostgreSQL Locking Analysis, Write-Freeze & In-Flight Transactions

### 3.1 PostgreSQL Locking Mechanics in `00_stage5b_atomic_release.sql`
A common misconception in PostgreSQL database migrations is that `REVOKE` blocks concurrent table writes. In PostgreSQL source code (`aclchk.c`), table privilege grants and revocations resolve target relations using `AccessShareLock`. Therefore:
- **`REVOKE` statements do NOT acquire `AccessExclusiveLock`.**
- **Privilege revocation alone does NOT block concurrent `INSERT`, `UPDATE`, or `DELETE` operations.**

However, inspection of [`docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql`](file:///f:/superwash/docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql) reveals the actual locking behavior during execution:
1. **Line 18 (`ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_snapshot JSONB DEFAULT NULL;`):**
   - In PostgreSQL, `ALTER TABLE ... ADD COLUMN` requests an **`AccessExclusiveLock`** on `public.orders`, *even when the column already exists*.
   - Once acquired, this `AccessExclusiveLock` is held until the transaction finishes (`COMMIT` or `ROLLBACK`).
2. **Line 42–46 (`DROP TRIGGER IF EXISTS` / `CREATE TRIGGER`):**
   - Acquires `ShareRowExclusiveLock` / `AccessExclusiveLock` on `public.orders`.
3. **Section 14 (`REVOKE` on `coupons`, `delivery_batches`, `payments`):**
   - Acquires only `AccessShareLock` on these subsidiary tables.

### 3.2 Analysis of Concurrent Race Conditions

| Race Condition Scenario | Database Behavior Under `00_stage5b_atomic_release.sql` | Resolution & Defense |
| :--- | :--- | :--- |
| **1. Legacy direct write already in progress when release starts** | The legacy write holds `RowExclusiveLock` on `orders`. When the release transaction reaches line 18 (`ALTER TABLE`), it requests `AccessExclusiveLock`, which conflicts. The release transaction **blocks waiting** for the legacy write to commit or abort. The legacy write completes under old permissions. | **Operational Drain Period:** The release transaction must not be started while operations are active. A 60–90 second drain window ensures in-flight writes finish before the migration begins. |
| **2. Legacy write begins while release transaction is running** | Because the release transaction holds `AccessExclusiveLock` on `orders` (from line 18), the new write requests `RowExclusiveLock` and is placed into PostgreSQL's **lock wait queue**. | **Defended by PostgreSQL Lock Queue & Relcache Invalidation:** When the release commits, `REVOKE ALL PRIVILEGES` commits, and catalog invalidation forces the waiting write to re-check permissions. The write is immediately rejected with `42501 permission denied`. |
| **3. Old SECURITY DEFINER RPC already executing before release** | PL/pgSQL compiles and caches function execution plans in backend-private memory (`PLpgSQL_function`). If an old RPC is already mid-execution on an active backend, updating `pg_proc` via `CREATE OR REPLACE FUNCTION` **does NOT interrupt or reload the running call frame**. The in-flight RPC runs its old compiled statements to completion. | **Defended by Operational Drain Period:** No database table lock can retroactively cancel an active function execution frame. Pre-migration traffic cutoff and checking `pg_stat_activity` ensures zero active application RPCs are running. |
| **4. Request waiting on a database lock when release commits** | When the release commits, all waiting queries wake up. PostgreSQL's executor (`ExecCheckRTPerms`) evaluates the latest committed `relacl`. | **Defended:** The request fails closed with HTTP 403 / `42501 permission denied`. |

### 3.3 The Defensible 3-Stage Write-Freeze & Drain Sequence

```mermaid
sequenceDiagram
    autonumber
    actor StaffCust as Active Browser Tabs
    participant Edge as Cloudflare Pages Edge
    participant DB as Supabase PostgreSQL

    Note over Edge,DB: Stage 1: Pre-Migration Database Write-Freeze (T+0m to T+2m)
    Edge->>StaffCust: Maintenance Mode Splash Enabled (Blocks new page loads)
    DB->>DB: Execute 00_stage5b_pre_migration_freeze.sql
    DB->>DB: Revoke EXECUTE on all legacy mutation RPCs (PUBLIC, anon, authenticated)
    DB->>DB: Revoke INSERT, UPDATE, DELETE on orders, coupons, payments
    DB->>DB: NOTIFY pgrst, 'reload schema' & COMMIT
    Note over StaffCust,DB: Incoming RPC calls & direct writes now fail with 42501 Permission Denied

    Note over DB: Stage 2: Session Drain & Active Write Verification (T+2m to T+4m)
    DB->>DB: Admin monitors pg_stat_activity for active client writes
    DB->>DB: Wait until active_client_writes == 0 (Terminate any hung backends)
    Note over DB: Condition verified: 0 in-flight RPCs, 0 new incoming requests

    Note over DB: Stage 3: Atomic Release SQL Execution (T+4m to T+7m)
    DB->>DB: Execute 00_stage5b_atomic_release.sql (Single Transaction)
    DB->>DB: ALTER TABLE orders ADD coupon_snapshot (AccessExclusiveLock)
    DB->>DB: Functions Replaced & Security Boundary Established
    DB->>DB: Grants on NEW hardened RPCs applied; Table write revocation confirmed
    DB->>DB: Section 15 Catalog Assertions verified
    DB->>DB: NOTIFY pgrst, 'reload schema' & COMMIT

    Note over Edge,DB: Phase 4: Frontend Deployment & Purge (T+7m to T+10m)
    Edge->>Edge: Deploy hardened RPC frontend bundle; Purge index.html cache

    Note over Edge,DB: Phase 5: Staging Smoke Verification (T+10m to T+20m)
    Note over Edge,DB: Phase 6: Service Reopened (T+20m)
```

#### Step-by-Step Execution Rules:
1. **Stage 1 (Database Freeze):**
   In Supabase Dashboard SQL Editor, execute [`docs/review/stage5b_release_candidate/00_stage5b_pre_migration_freeze.sql`](file:///f:/superwash/docs/review/stage5b_release_candidate/00_stage5b_pre_migration_freeze.sql) (SHA256: `B21A825CB01D4176E99665A9CDE59373FE5D737AE0987DF07FB9CAD3220D7074`).
   - Dynamically revokes `EXECUTE` on all legacy order mutation RPC overloads from `PUBLIC`, `anon`, and `authenticated`.
   - Revokes table-level `INSERT, UPDATE, DELETE, TRUNCATE` on `orders`, `coupons`, `delivery_batches`, and `payments`.
   - Iterates across every single column in `orders`, `coupons`, `delivery_batches`, and `payments` and revokes column-level `INSERT, UPDATE, REFERENCES` privileges, eliminating any column-level bypass.
   - Any new write or RPC attempt from open browser tabs immediately fails with `42501 permission denied`.
2. **Stage 2 (Session Drain Verification):**
   Execute Verification Query 2 from the freeze script:
   ```sql
   SELECT count(*) AS active_client_writes
   FROM pg_stat_activity
   WHERE state != 'idle'
     AND pid != pg_backend_pid()
     AND usename NOT IN ('postgres', 'supabase_admin');
   ```
   - **Gate:** Proceed to Stage 3 **ONLY** when `active_client_writes = 0`. (Empirically verified with simulated PostgREST `authenticator` session: returned `1` during in-flight RPC write, blocking release, and `0` upon completion, clearing the gate).
   - If a background transaction remains active after 30 seconds, terminate it: `SELECT pg_terminate_backend(pid);`.
3. **Stage 3 (Atomic Release Candidate Execution):**
   In Supabase Dashboard SQL Editor, execute [`docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql`](file:///f:/superwash/docs/review/stage5b_release_candidate/00_stage5b_atomic_release.sql) (SHA256: `37C8018B7A254870CEF4AA9B1B35FF0C378F71DF36EF0E9373F6B812483CD40D`).
   - Because all in-flight legacy RPCs were drained and new RPCs were pre-emptively blocked, the `SECURITY DEFINER` race condition is eliminated.
   - Confirm single-transaction `COMMIT` and Section 15 catalog assertion success.
4. **Planned Maintenance Window (Not Guaranteed):**
   The rollout plan targets an estimated **20-minute maintenance window**. Completion time depends on smoke verification and cannot be guaranteed to 15 minutes flat.



---

## 4. Pre-Deployment Prerequisites & Backup Strategy

Before initiating the staging deployment:

1. **Staging Database Backup Prerequisite:**
   - Verify that automated backups are enabled and a manual physical backup snapshot is taken in Supabase Dashboard (**Database** -> **Backups**).
   - If snapshot recovery is not provisioned on the target tier, perform a logical schema and data dump before applying SQL.
2. **Current Frontend Deployment Tagging:**
   - Record the active Cloudflare Pages deployment ID and Git commit hash.
3. **Artifact Integrity Verification:**
   - Verify the release artifact SHA256 checksum matches:
     `37C8018B7A254870CEF4AA9B1B35FF0C378F71DF36EF0E9373F6B812483CD40D`.

---

## 5. Mandatory Staging Smoke Verification Checklist

After applying `00_stage5b_atomic_release.sql` and deploying the frontend to Staging, execute the following smoke tests before reopening:

| Test ID | Operational Scenario | Action / Method | Expected Result | Pass/Fail Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **SMK-01** | **Customer Booking with Coupon** | Book laundry with coupon code `SUPERWASH20` on Staging URL. | Order created via `create_booking_idempotent`; `coupon_snapshot` JSON contains frozen discount terms. | Order row exists; coupon logged in audit. |
| **SMK-02** | **Courier Pickup Assignment** | Manager assigns driver to test order. | Calls `assign_order_courier(..., 'pickup')`; status advances to `pickup_assigned`. | Status is `pickup_assigned`; courier ID recorded. |
| **SMK-03** | **Doorstep Weighing & Bill Calculation** | Driver enters scale weight (e.g. 3.5 kg) in Driver App. | Calls `record_courier_pickup_collection`; bill calculated in paise; status advances to `collected`. | Order status `collected`; weight and subtotal populated. |
| **SMK-04** | **Store Intake Weighing** | Store manager verifies weight at facility. | Calls `record_store_intake_weight`; status advances to `washing`. | Weight recorded; order status advances to `washing`. |
| **SMK-05** | **Sibling Batch Recalculation** | In a multi-service order (e.g., Wash & Iron + Dry Clean), cancel one sibling. | Calls `cancel_order_with_batch_sync`; sibling order discount is recalculated under advisory lock. | Remaining sibling discount adjusted; batch invariants preserved. |
| **SMK-06** | **Payment Ledger Recording** | Record partial cash/UPI payment via Manager Dashboard. | Calls `record_order_payment`; entry inserted in `payments` ledger; `paid_amount_paise` incremented. | Correct balance remaining; ledger entry created. |
| **SMK-07** | **Direct Write Denial (Security Audit)** | From browser devtools or test script, attempt: `supabase.from('orders').update({discount_paise: 99999}).eq('id', orderId)`. | PostgREST rejects request with `42501 permission denied`. | Direct write fails closed with HTTP 403. |
| **SMK-08** | **Authorized Delivery Notes Update** | Assigned driver updates delivery note: `Customer requested gate drop`. | Calls `update_order_delivery_notes` (or authorized column update); update succeeds. | Note saved; other columns cannot be altered. |

---

## 6. Service Reopening Criteria

The maintenance window may be closed and service reopened ONLY when:
- [ ] Database migration transaction committed with 0 errors.
- [ ] Catalog assertions confirm `authenticated` has no direct table write privileges on `orders`, `coupons`, `delivery_batches`, or `payments`.
- [ ] PostgREST schema cache is refreshed.
- [ ] Cloudflare Pages frontend deployment is active and serving the latest build.
- [ ] All 8 Staging Smoke Tests (SMK-01 through SMK-08) have passed.

---

## 7. Rollback Strategy & Safe Failure Procedure

If an unrecoverable defect is discovered during smoke verification:

### 7.1 What NOT to Do (Severe Anti-Patterns):
1. **NEVER roll back the frontend alone while leaving the hardened database active.**  
   The older frontend relies on direct table writes (`orders.update(...)`). If executed against the hardened database where write privileges are revoked, every single operational action will crash with `42501 permission denied`.
2. **NEVER execute `GRANT ALL ON TABLE public.orders TO authenticated;` as a quick fix.**  
   Granting direct table writes re-opens the arbitrary discount tampering, weight spoofing, and coupon fraud vulnerabilities that Stage 5B was commissioned to permanently resolve.

### 7.2 Coordinated Rollback Procedure:
If a critical blocker necessitates rollback:
1. **Maintain Maintenance Mode:** Keep the Cloudflare Pages maintenance splash active. Do NOT expose users to a mismatched state.
2. **Database Rollback:** Restore the staging database to the pre-deployment snapshot created in Section 4.
3. **Frontend Rollback:** Roll back the Cloudflare Pages deployment to the previous stable deployment ID.
4. **Verification Before Reopening:** Verify that the restored database and rolled-back frontend communicate normally. Reopen traffic only after both tiers are confirmed consistent.

### 7.3 Safe Failure Procedure (If Database Restore Fails):
If database restoration cannot be completed:
- **KEEP MAINTENANCE MODE ENABLED.**
- Do not attempt partial rollbacks that leave frontend and database out of sync.
- Engage database administrator to resolve the restore blocker in isolation before reopening.

---

## 8. Summary: Local Verification vs. Pending Staging Work

| Scope | Local Verification (Completed) | Staging Deployment (Pending Authorization) |
| :--- | :--- | :--- |
| **Database Schema & RPCs** | Verified in Docker PG15 (93/93 tests passing) | Pending application via Supabase SQL Editor |
| **Privilege Hardening** | Verified direct-write denial on PG15 | Pending post-apply catalog check on Supabase |
| **Frontend Code** | 261/261 Vitest tests passed; prod build OK | Pending deployment to Cloudflare Pages |
| **Supabase Realtime & PostgREST** | Simulated locally | Pending validation in live Staging environment |
| **End-to-End User Experience** | Validated via mock suites | Pending SMK-01 through SMK-08 smoke verification |

