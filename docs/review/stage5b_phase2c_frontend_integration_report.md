# SuperWash Stage 5B — Phase 2C: Frontend Secure RPC Integration Report

**Document Date:** October 28, 2026  
**System:** SuperWash Exprez Laundry Pickup & Delivery Platform  
**Target Repository:** `F:\superwash`  
**Frontend Source:** `frontend/src/services/laundryService.ts`  
**Integration Status:** **COMPLETE & VERIFIED**  
**Vitest Regression Status:** **11 test files, 256/256 tests PASSED (100%)**  
**Production Build Status:** **PASSED (`tsc -b && vite build` in 6.71s)**

---

## 1. Executive Summary

In SuperWash Stage 5B Phase 2C, the frontend application layer (`frontend/src/services/laundryService.ts`) has been integrated with the secure PostgreSQL stored procedures (RPCs) established and verified in Stage 5B Phase 2B (`docs/review/stage5b_batch_coupon_sync_candidate.sql`).

Direct client-side `UPDATE` and `INSERT` calls on `public.orders` have been replaced with dedicated, state-validated `SECURITY DEFINER` RPCs for all operational, lifecycle, and financial state modifications. To safeguard continuous availability during migration rollouts, a zero-downtime compatibility layer was implemented: all operations prioritize the verified RPC paths and gracefully fall back to direct updates only when remote database schema caches indicate pending migrations (`PGRST202` / `42883`).

All 11 frontend test suites (256 automated tests) pass with zero errors, and the production build completes cleanly.

---

## 2. Integrated Secure RPC Operations

| Operation | Previous Client Path | Verified Secure Database RPC | Frontend Service Method | Handled Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **Pickup Courier Assignment** | Direct `orders.update` | `public.assign_order_courier(p_order_id, 'pickup', p_courier_id, ...)` | `LaundryService.assignPickupStaff` | Validates role `'delivery'`, active status, and automatically synchronizes ready siblings in linked batches. |
| **Delivery Courier Assignment** | Direct `orders.update` | `public.assign_order_courier(p_order_id, 'delivery', p_courier_id, ...)` | `LaundryService.assignDeliveryStaff` | Prohibits uncollected orders; assigns field associates; coordinates ready batch siblings. |
| **Doorstep Scale Weighing** | Direct `orders.update` | `public.record_courier_pickup_collection(p_order_id, p_measured_weight, p_delivery_notes)` | `LaundryService.recordPickupCollectionAndWeight` | Preserves store intake `weighed_at` immutability; updates doorstep measurements; triggers batch coupon recalculation. |
| **Store Intake Weighing** | Direct `orders.update` | `public.record_store_intake_weight(p_order_id, p_measured_weight, p_correction_reason)` | `LaundryService.enterMeasuredWeight` | Enforces manager/owner role; applies `pg_advisory_xact_lock`; prevents downward re-weighing below paid amount; batch recalculates coupons. |
| **Workflow Status Advancement** | Direct `orders.update` | `public.advance_order_workflow_status(p_order_id, p_target_status, p_notes)` | `LaundryService.updateOrderStatus`, `markAsCollected`, `markAsDelivered` | Validates strict 10-stage state machine; blocks skipping stages; denies delivery associates advancing non-assigned tasks. |
| **Order Cancellation** | Direct `orders.update` | `public.cancel_order_with_batch_sync(p_order_id, p_cancellation_reason)` | `LaundryService.cancelOrder`, `LaundryService.updateOrderStatus` | Restricts customer cancellation to early stages; synchronizes remaining active siblings; revokes sub-threshold coupons. |
| **Delivery Notes Update** | Direct `orders.update` | `public.update_order_delivery_notes(p_order_id, p_delivery_notes)` | `LaundryService.updateDeliveryNotes` | Uses approved `delivery_notes` column exception under RLS; records update timestamp. |
| **Idempotent Booking** | Client direct insert | `public.create_booking_idempotent(..., p_coupon_code, p_discount_paise)` | `LaundryService.createBooking` | Captures immutable `coupon_snapshot` in database; validates subtotal qualification; eliminates duplicate submissions. |

---

## 3. Detailed Operation Specifications

### 3.1 Store Intake Scale Weighing (`enterMeasuredWeight`)
- **RPC:** `public.record_store_intake_weight(UUID, NUMERIC, TEXT)`
- **Behavior:**
  1. Calls `record_store_intake_weight` passing `p_order_id`, `p_measured_weight`, and `p_correction_reason`.
  2. Receives reconciled JSON response: `measured_weight`, `billable_weight`, `discount_paise`, `total_amount_paise`, `order_status`.
  3. Automatically queries and synchronizes all active sibling orders in the same linked batch (`[Linked Batch BATCH-XXXX]`) to immediately reflect batch coupon recalculation without requiring a page reload.
  4. Preserves WhatsApp customer billing notifications and audit logging in `weight_change_history`.

### 3.2 Doorstep Collection & Weighing (`recordPickupCollectionAndWeight`)
- **RPC:** `public.record_courier_pickup_collection(UUID, NUMERIC, TEXT)`
- **Behavior:**
  1. Validates courier assignment and transitions order from `pickup_assigned` to `collected`.
  2. Captures doorstep scale weight (`pickup_measured_weight`) and notes (`delivery_notes`) while keeping store intake `weighed_at` untouched.
  3. Synchronizes linked batch siblings if batch discount conditions change.

### 3.3 Status Progression (`updateOrderStatus`, `markAsCollected`, `markAsDelivered`)
- **RPC:** `public.advance_order_workflow_status(UUID, TEXT, TEXT)`
- **Behavior:**
  1. Validates permitted state transitions:
     - `booked` / `pickup_assigned` $\to$ `collected`
     - `collected` $\to$ `washing` (requires `measured_weight IS NOT NULL`)
     - `washing` $\to$ `ready_for_delivery`
     - `ready_for_delivery` $\to$ `out_for_delivery` (requires `assigned_delivery_id IS NOT NULL`)
     - `out_for_delivery` $\to$ `delivered`
  2. Rejects bypass attempts: explicitly forbids transitioning to `cancelled` (must use cancellation RPC) or `weighed` (must use store intake RPC).
  3. Records status transition audit trail in `order_status_history`.

### 3.4 Order Cancellation (`cancelOrder`)
- **RPC:** `public.cancel_order_with_batch_sync(UUID, TEXT)`
- **Behavior:**
  1. Validates caller permissions: customers can only cancel prior to collection (`booked`, `pickup_assigned`); managers/owners can cancel anytime prior to `delivered`.
  2. Locks batch via `pg_advisory_xact_lock` and updates status to `cancelled` with `cancellation_reason`.
  3. Invokes `synchronize_batch_coupon_internal` to re-evaluate remaining active batch subtotal. If the remaining spend falls below `min_order_paise`, the coupon is safely revoked.
  4. Refreshes local sibling records to guarantee customer and manager tracking reflect updated financial totals immediately.

### 3.5 Delivery Notes Updates (`updateDeliveryNotes`)
- **RPC:** `public.update_order_delivery_notes(UUID, TEXT)`
- **Behavior:**
  1. Authorizes assigned couriers, store managers, and owners to update delivery instructions and gate notes.
  2. Updates `delivery_notes` and `updated_at`.
  3. Operates cleanly with the database privilege model where `delivery_notes` is the approved direct column exception.

---

## 4. Zero-Downtime Rollout & Compatibility Mechanism

Because the review candidate SQL has not yet been applied to live production Supabase, the frontend must support both the current production database and the upcoming hardened schema:

```typescript
// Pattern applied across all secure RPC integrations
if (isLiveMode) {
  let rpcHandled = false;
  const { data: rpcData, error: rpcError } = await supabase.rpc('record_store_intake_weight', {
    p_order_id: order.id,
    p_measured_weight: measuredWeightKg,
    p_correction_reason: correctionReason || null
  });

  if (!rpcError && rpcData?.success) {
    // 1. PRIMARY SECURE PATH: Database RPC executed successfully
    rpcHandled = true;
    order.measured_weight = Number(rpcData.measured_weight);
    order.billable_weight = Number(rpcData.billable_weight);
    order.discount_paise = Number(rpcData.discount_paise);
    order.total_amount_paise = Number(rpcData.total_amount_paise);
    order.order_status = rpcData.order_status;
    // Synchronize batch siblings...
  } else {
    const isRpcMissing =
      rpcError?.code === '42883' || // undefined_function
      rpcError?.code === 'PGRST202' || // PostgREST function not found in schema cache
      rpcError?.message?.includes('could not find');

    if (isRpcMissing) {
      // 2. COMPATIBILITY ROLLOUT PATH: RPC pending remote migration
      console.warn('Database RPC record_store_intake_weight is pending remote migration; executing fallback update.');
      // Execute compatibility update...
    } else {
      // 3. SECURITY & INVARIANT VIOLATION: Propagate error immediately
      throw new Error(rpcError?.message || 'Failed to record store intake weight');
    }
  }
}
```

This guarantees that:
1. When deployed prior to database migration, the application continues to operate without breaking.
2. The instant the database migration is applied, the frontend automatically executes the hardened RPC path.
3. Actual security violations (unauthorized roles, invalid status transitions, overpayments) are never suppressed or bypassed.

---

## 5. Verification & Test Evidence

### 5.1 Automated Vitest Suite Execution
```
Test Files  11 passed (11)
     Tests  256 passed (256)
  Duration  37.32s
```

Test coverage includes:
- `src/test/secureRpcIntegration.test.ts` (6/6 PASS): Dedicated tests for intake weighing, doorstep weighing, cancellation with batch sync, workflow transitions, delivery notes, and fallback handling.
- `src/test/linkedOrdersAndPricingVerification.test.tsx` (17/17 PASS): Batch discount allocation, coupon snapshotting, multi-service ordering, and cancellation thresholds.
- `src/test/invoiceAuditAndVerification.test.tsx` (20/20 PASS): Pre-weighed vs final invoice calculations, multi-service batch totals, per-kg/per-piece pricing, and access controls.
- `src/test/components.test.tsx` (81/81 PASS): Lifecycle transitions, payment invariants, staff permissions, and location handling.
- `src/test/portalSeparation.test.tsx`, `pricingConsistencyAudit.test.tsx`, `staffManagement.test.tsx`, `ownerQuickAccessAndPwa.test.tsx`, `phase1CustomerExperience.test.tsx`, `whatsappService.test.ts`, `weighingPermissionRegression.test.ts` (132/132 PASS).

### 5.2 Production Build Verification
```
> tsc -b && vite build
vite v6.4.5 building for production...
✓ 1713 modules transformed.
dist/index.html                           1.95 kB │ gzip:   0.87 kB
dist/assets/index-BgHgSQ7R.js           371.46 kB │ gzip: 107.25 kB
✓ built in 6.71s
```
Zero TypeScript compilation errors; zero Vite bundling warnings.

---

## 6. Conclusion
The frontend RPC integration is complete, verified, and ready for staged deployment.
