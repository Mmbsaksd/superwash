# SuperWash Exprez — Stage 5B Proposed Release Candidate Package

## 1. Release Architecture: Atomic Release vs. Split Proposals

This directory houses the candidate release artifacts for SuperWash Stage 5B.

### The Authoritative Recommendation: Atomic Single-Transaction Release

The primary, verified, and authoritative release candidate is:
- **`00_stage5b_atomic_release.sql`** (SHA256: `37C8018B7A254870CEF4AA9B1B35FF0C378F71DF36EF0E9373F6B812483CD40D`)

#### Rationale for Atomic Release
Earlier drafts investigated a phased split (`01_additive` -> Frontend Deploy -> `02_hardening`). However, comprehensive security analysis revealed that any intermediate window where additive RPCs are present while table write privileges remain unhardened creates an unsafe window:
- If legacy clients remain active, they can perform direct `UPDATE orders SET order_status = 'cancelled'` or status advances that bypass `synchronize_batch_coupon_internal()`.
- The frontend has been hardened to **fail closed** on all live operational paths (`laundryService.ts`), completely removing direct-write fallbacks.
- Therefore, the safest and cleanest deployment sequence is to apply the schema extensions, RPC functions, trigger protections, and privilege revocations in **one atomic, single-transaction migration**, executed within a controlled off-peak maintenance window.
- Right before commit, the atomic release fires `NOTIFY pgrst, 'reload schema';` so that PostgREST discovers the new functions and revoked write privileges simultaneously.

### Status of Split Drafts: Superseded for Audit Only
The split drafts:
- `01_stage5b_additive_schema_and_rpcs.sql`
- `02_stage5b_privilege_hardening.sql`
are **SUPERSEDED** by `00_stage5b_atomic_release.sql`. They are preserved strictly for audit and comparative review.

---

## 2. Artifact Registry & Cryptographic Checksums

| Artifact Path | SHA256 Checksum | Status | Description |
| :--- | :--- | :--- | :--- |
| `00_stage5b_atomic_release.sql` | `37C8018B7A254870CEF4AA9B1B35FF0C378F71DF36EF0E9373F6B812483CD40D` | **PRIMARY & VERIFIED** | Complete atomic release SQL. Tested & passed all 93 assertions across Suites A–I in PostgreSQL 15 container. |
| `00_stage5b_pre_migration_freeze.sql` | `B21A825CB01D4176E99665A9CDE59373FE5D737AE0987DF07FB9CAD3220D7074` | **FREEZE STAGE SCRIPT** | Pre-deployment database-level write freeze. Dynamically revokes `EXECUTE` on legacy write RPCs and table/column writes across all target tables. Tested in PG15. |
| `00_stage5b_rollback_pre_migration_freeze.sql` | `E7D60300F7733519CB6EB6F3FCF1BA63AB2B2CD347D3E8D771DB397C89B46C96` | **FREEZE ROLLBACK SCRIPT** | Safely restores exact pre-freeze baseline permissions without broad grants (delete/truncate remain denied) if deployment is aborted before Stage 3. Tested in PG15. |
| `01_stage5b_additive_schema_and_rpcs.sql` | `FE2C4200FB02B3FF9775B240FB035A2E0674790EBC68156AD9AF4472F121F80D` | **SUPERSEDED** | Split Draft 01 (Additive schema & RPCs). Preserved for audit. |
| `02_stage5b_privilege_hardening.sql` | `7E5F46682330919F5687CEE4E694CFA47D2187BCEFEC33D6B44514EB5A125BB5` | **SUPERSEDED** | Split Draft 02 (Privilege hardening). Preserved for audit. |
| Reference: `stage5b_batch_coupon_sync_candidate.sql` | `6E848F20B3A4400F8D5C2CE35F064D12FF5D71075612748E7519D9AAA89A66D6` | **SOURCE BASELINE** | Baseline candidate tested in Phase 2B container runs. |

---

## 3. Coherent 3-Stage Deployment Sequence (Freeze -> Drain -> Release)

```mermaid
graph TD
    subgraph Controlled 20-Minute Maintenance Window (02:00 AM IST)
        A[Step 1: Maintenance Splash & Edge Traffic Cutoff] --> B[Step 2: Apply 00_stage5b_pre_migration_freeze.sql]
        B -->|Revoke RPC Execute & Table Writes| C[Step 3: Drain Phase & Active Session Verification]
        C -->|pg_stat_activity active writes == 0| D[Step 4: Apply 00_stage5b_atomic_release.sql]
        D -->|Single Transaction Commit & Schema Reload| E[Step 5: Deploy Frontend Production Bundle]
        E -->|Purge CDN Edge Cache| F[Step 6: Execute Staging Smoke Tests]
        F -->|Booking, Scale, Coupon, Invoice Verified| G[Step 7: Lift Maintenance & Reopen Application]
    end
```

### Step-by-Step Procedure
1. **Enable Maintenance Mode / Edge Cutoff (T-0m):** Enable maintenance splash on Cloudflare Pages to prevent new client visits.
2. **Apply Database-Level Freeze (T+2m):** In Supabase SQL Editor, execute `00_stage5b_pre_migration_freeze.sql`. This dynamically revokes `EXECUTE` on all legacy mutation RPCs from `PUBLIC`, `anon`, and `authenticated`, and revokes direct table writes on `orders`, `coupons`, `delivery_batches`, and `payments`.
3. **Verify Drain Condition (T+4m):** Execute drain verification query (`SELECT count(*) FROM pg_stat_activity WHERE state != 'idle' ...`). Confirm active application transactions are `0`. If any transaction is hung, cancel or terminate it.
4. **Apply Atomic SQL Migration (T+5m):** In Supabase SQL Editor, execute `00_stage5b_atomic_release.sql`. It applies the immutable coupon snapshot, immutability trigger, hardened RPCs, workflow integrity trigger, catalog privilege assertions, fires `NOTIFY pgrst, 'reload schema'`, and commits cleanly.
5. **Deploy Hardened Frontend (T+8m):** Deploy `frontend/dist/` to Cloudflare Pages and purge edge cache for `index.html`.
6. **Execute Authorized Smoke Tests (T+10m):** Verify test booking with coupon, scale weighing, courier assignment, sibling coupon recalculation, and delivery note updates (SMK-01 to SMK-08).
7. **Reopen Service (T+20m):** Remove maintenance splash and restore normal operations.

---

## 4. Rollback Strategy & Invariant Preservation

If a defect is detected during the maintenance window:
- **During Step 2/3 (Before Release SQL is applied):** Execute `00_stage5b_rollback_pre_migration_freeze.sql` to restore pre-freeze permissions. Disable maintenance splash.
- **During Step 4 (Database Migration):** If any statement fails or catalog assertions fail, the single transaction rolls back completely (`ROLLBACK`). The database remains 100% in its previous state with zero side effects.
- **During Step 5/6 (Frontend Deployment / Smoke Tests):** If an unexpected client defect is found:
  1. Roll back the Cloudflare Pages deployment to the previous immutable release hash.
  2. Restore the database from the pre-maintenance snapshot taken prior to maintenance.
- **Safe Failure Procedure:** If database restoration cannot be completed, **KEEP MAINTENANCE MODE ENABLED**. DO NOT roll back only the frontend against the hardened database, and DO NOT execute an ad-hoc `GRANT ALL` on `orders`. Always keep frontend and database synchronized.

