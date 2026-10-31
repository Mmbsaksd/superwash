# SuperWash — Stage 4A Execution Report: LaundryService Simplification

## Executive Summary

Stage 4A has successfully simplified `frontend/src/services/laundryService.ts` and its dashboard callers. All genuinely redundant RPC workflows and state mutations were consolidated into the canonical `updateOrderStatus` method, and dashboard callers were modernized to consume primary service APIs directly. Backward compatibility was maintained for all unit and integration test suites without modifying any test files.

- **Baseline LaundryService Size**: 4,282 physical lines | 3,828 nonblank SLOC
- **Post-Stage 4A Size**: 4,210 physical lines | 3,768 nonblank SLOC
- **Net Reductions in LaundryService**: **-72 physical lines | -60 nonblank SLOC**
- **Vitest Suite**: **14 test files passed | 291 / 291 tests passed (100%)**
- **Production TypeScript Build (`tsc -b && vite build`)**: **Success (0 errors, 7.24s)**

---

## 1. Method-by-Method Audit Findings & Implementations

### A. `checkSlotAvailability`
- **Initial Audit Hypothesis**: Reported 0 callers in repository.
- **Deep Investigation**:
  - Zero external production dashboard callers.
  - Zero direct test callers.
  - **Critical Discovery**: Called internally at line 1027 of `internalCreateBooking()`:
    ```typescript
    const slotCheck = await this.checkSlotAvailability(data.pickup_date, data.pickup_slot);
    if (!slotCheck.available) {
      throw new Error(`The pickup slot '${data.pickup_slot}' on ${data.pickup_date} is fully booked...`);
    }
    ```
  - `checkSlotAvailability` queries slot configuration and order counts to enforce capacity limits during offline/mock mode booking.
- **Action Taken**: **RETAINED IN FULL**. Deleting this method would break mock booking capacity enforcement and test assertions on slot limits.

### B. `markAsCollected` and `markAsDelivered`
- **Initial Audit Hypothesis**: Redundant against `updateOrderStatus(orderId, status, notes)`.
- **Deep Comparative Analysis**:
  1. **RPC Invocation**: Both methods invoked `advance_order_workflow_status` with `collected` and `delivered` respectively. `updateOrderStatus` invokes the exact same RPC.
  2. **Error Handling & Database Invariants**: Both duplicated the identical 14-line `isRpcMissing` check and message throwing.
  3. **Local State & Timestamps**:
     - `markAsCollected` set `collected_at = new Date().toISOString()`, `order_status = 'collected'`, `delivery_notes = notes`.
     - `markAsDelivered` validated `order.order_status === 'out_for_delivery'`, set `delivered_at = new Date().toISOString()`, `order_status = 'delivered'`, `delivery_notes = notes`.
     - `updateOrderStatus` already handled status transition validations and timestamps, but did not previously emit the `clothes_collected` WhatsApp notification or map `delivery_notes`.
  4. **Notifications**:
     - `markAsCollected` sent `clothes_collected` WhatsApp notification.
     - `updateOrderStatus` did not have a branch for `collected`.
- **Implementation**:
  - Enhanced `updateOrderStatus()`:
    - Added `if (newStatus === 'collected') { order.collected_at = order.collected_at || new Date().toISOString(); }` in mock mode.
    - Added `if (notes && (newStatus === 'collected' || newStatus === 'delivered')) { order.delivery_notes = notes; }` across both live and mock branches.
    - Added WhatsApp notification for `newStatus === 'collected'` (`clothes_collected`).
  - Streamlined `markAsCollected`:
    - Reduced from 47 lines to a 3-line delegating forwarder: `return this.updateOrderStatus(orderId, 'collected', notes);`.
  - Streamlined `markAsDelivered`:
    - Preserved explicit status invariant check to satisfy regex expectations in `components.test.tsx` (`/must be in 'out_for_delivery' status/i`).
    - Delegated execution to `return this.updateOrderStatus(orderId, 'delivered', notes);`.
    - Reduced from 55 lines to 10 lines.
  - Modernized Production Callers:
    - `frontend/src/pages/manager/ManagerDashboard.tsx:184`: Updated `LaundryService.markAsCollected` to `LaundryService.updateOrderStatus(order.id, 'collected', 'Clothes received at store intake')`.
    - `frontend/src/pages/delivery/DeliveryDashboard.tsx:206`: Updated `LaundryService.markAsDelivered` to `LaundryService.updateOrderStatus(order.id, 'delivered')`.
- **Impact**: Eliminated ~89 lines of duplicate RPC logic, error handling, state sync, and timestamp logic. Zero test changes required.

### C. `generateSafeOrderNumber`
- **Initial Audit Hypothesis**: Potential dead code in production.
- **Deep Investigation**:
  - Found callers in:
    1. `laundryService.ts:1062` (`internalCreateBooking` mock fallback generation).
    2. `frontend/src/test/components.test.tsx:2196` and `2201` (direct test assertions verifying sequence progression: `SW-1005` and `SW-1006`).
- **Action Taken**: **RETAINED IN FULL**. The method is essential for mock-mode sequential order generation and is directly asserted by the test suite.

### D. `getAllOrders` and `toggleServiceStatus`
- **`getAllOrders()`**:
  - Replaced production callers in:
    - `OwnerDashboard.tsx:186` -> `LaundryService.getOrders()`
    - `DeliveryDashboard.tsx:67` -> `LaundryService.getOrders()`
    - `ManagerDashboard.tsx:68` -> `LaundryService.getOrders()`
  - Retained 1-line delegating wrapper in `laundryService.ts` for test callers (`components.test.tsx:27`, `894`).
- **`toggleServiceStatus()`**:
  - Replaced production callers in:
    - `OwnerDashboard.tsx:846` -> `LaundryService.updateService(srv.id, { is_active: !srv.is_active }, currentUser?.role)`
    - `OwnerDashboard.tsx:876` -> `LaundryService.updateService(deletingService.id, { is_active: false }, currentUser?.role)`
  - Retained 1-line delegating wrapper in `laundryService.ts` for test callers (`components.test.tsx:1942`, `portalSeparation.test.tsx:624`).

---

## 2. Analysis of Deferred Methods for Stage 4B

### A. `attemptDirectOrderUpdate`
- **Current Role**: Enforces and tests security invariants on direct table mutations (allowlist check on columns: immutable fields like prices, payment fields, customer information, status tampering).
- **Test Coverage**: Asserted by 12 comprehensive security test cases in `frontend/src/test/components.test.tsx` (lines 1158–1225).
- **Recommendation for Stage 4B**:
  - This method serves as an application-layer defense-in-depth simulator for database RLS policies.
  - Since it has zero production callers (only called by security regression tests), investigate moving or isolating it into a dedicated test security harness or formalizing it as a validated internal security guard.

### B. `updateDeliveryNotes`
- **Current Role**: Updates order delivery notes via RPC `update_order_delivery_notes`, with an explicit fallback to a direct table update (`supabase.from('orders').update({ delivery_notes }).eq('id', orderId)`) when the RPC is missing.
- **Test Coverage**: Tested in `frontend/src/test/secureRpcIntegration.test.ts` (lines 405 & 426) to verify both RPC execution and missing-RPC table fallback.
- **Recommendation for Stage 4B**:
  - Evaluate consolidating note updates directly into `updateOrderStatus(orderId, currentStatus, notes)` or standardizing note updates across pickup and delivery workflows.

---

## 3. Comprehensive Inspection of 14 `isRpcMissing` Locations

The codebase features 14 locations checking for missing RPC database functions (`42883`, `PGRST202`, or error message substrings).

| # | Method | Target RPC | Error Codes Checked | Message Matchers | Fallback Strategy | Logging |
|---|---|---|---|---|---|---|
| 1 | `internalCreateBooking` | `create_booking_idempotent` | `PGRST202` | `could not find the function`, `function ... does not exist`, `function public.create_booking_idempotent` | Throws `BOOKING_SERVICE_UNAVAILABLE` error | None |
| 2 | `assignPickupStaff` | `assign_order_courier` | `42883`, `PGRST202` | `assign_order_courier`, `could not find` | Throws user-friendly service unavailable error | None |
| 3 | `assignDeliveryStaff` | `assign_order_courier` | `42883`, `PGRST202` | `assign_order_courier`, `could not find` | Throws user-friendly service unavailable error | None |
| 4 | `recordPickupCollectionAndWeight` | `record_courier_pickup_collection` | `42883`, `PGRST202` | `record_courier_pickup_collection`, `could not find` | Throws user-friendly service unavailable error | None |
| 5 | `markAsCollected` *(now consolidated)* | `advance_order_workflow_status` | `42883`, `PGRST202` | `advance_order_workflow_status`, `could not find` | Throws user-friendly service unavailable error | None |
| 6 | `markAsDelivered` *(now consolidated)* | `advance_order_workflow_status` | `42883`, `PGRST202` | `advance_order_workflow_status`, `could not find` | Throws user-friendly service unavailable error | None |
| 7 | `enterMeasuredWeight` | `record_store_intake_weight` | `42883`, `PGRST202` | `record_store_intake_weight`, `could not find` | Throws user-friendly service unavailable error | None |
| 8 | `updateOrderStatus` (cancel) | `cancel_order_with_batch_sync` | `42883`, `PGRST202` | `cancel_order_with_batch_sync`, `could not find` | Throws user-friendly service unavailable error | None |
| 9 | `updateOrderStatus` (advance) | `advance_order_workflow_status` | `42883`, `PGRST202` | `advance_order_workflow_status`, `could not find` | Throws user-friendly service unavailable error | None |
| 10 | `recordPayment` | `record_order_payment` | `42883`, `PGRST202` | `record_order_payment`, `could not find` | Throws user-friendly service unavailable error | None |
| 11 | `updateDeliveryNotes` | `update_order_delivery_notes` | `42883`, `PGRST202` | `update_order_delivery_notes`, `could not find` | Falls back to direct `orders` table update | `console.warn` |
| 12 | `createStaffProfile` | `create_staff_account` | `42883` | `function ... does not exist` | Falls back to Supabase Edge Function `create-staff-account` | Captures error |
| 13 | `updateStaffProfile` | `update_staff_profile` | `42883` | `does not exist` | Falls back to direct `profiles` table update | None |
| 14 | `toggleStaffStatus` | `toggle_staff_status` | `42883` | `does not exist` | Falls back to direct `profiles` table update | None |

### Key Differences & Feasibility of Shared Helper in Stage 4B
1. **Two Core Behaviors**:
   - **Fail-Closed with User Message (Locations 1–10)**: Strict workflow and payment actions refuse to perform unsafe direct table updates and throw a graceful database-upgrade notification.
   - **Fallback to Direct Table Update or Edge Function (Locations 11–14)**: Profile and notes operations have direct fallback logic if the remote RPC hasn't been migrated.
2. **Error Pattern Inconsistency**:
   - Locations 1–11 check both PostgreSQL code `'42883'` and PostgREST code `'PGRST202'`.
   - Locations 12–14 only check `'42883'`.
3. **Stage 4B Proposal**:
   A single private static helper:
   ```typescript
   private static isRpcMissing(error: any, rpcName?: string): boolean {
     if (!error) return false;
     if (error.code === '42883' || error.code === 'PGRST202') return true;
     const msg = error.message || '';
     if (msg.includes('could not find') || (msg.includes('function') && msg.includes('does not exist'))) return true;
     if (rpcName && msg.includes(rpcName)) return true;
     return false;
   }
   ```
   This helper can safely unify all 12 remaining checks in Stage 4B, eliminating approximately 80 lines of duplicate boilerplate.

---

## 4. Verification Results

| Check | Target | Result | Status |
|---|---|---|---|
| Vitest Test Suite | 14 test files | 14 passed (100%) | **PASS** |
| Total Tests | 291 unit & integration tests | 291 passed (0 failures) | **PASS** |
| Total Vitest Duration | Standard execution | 25.26s | **PASS** |
| TypeScript Compiler (`tsc -b`) | Zero type errors | 0 errors | **PASS** |
| Vite Production Build | Bundle generation | Built cleanly in 7.24s | **PASS** |
| Git Working Tree Protection | No test files edited | Verified (`git status`) | **PASS** |

---

## 5. Summary of Stage 4A File Metrics

| File | Before Lines | After Lines | Before SLOC | After SLOC | Net Line Change | Net SLOC Change |
|---|---|---|---|---|---|---|
| `frontend/src/services/laundryService.ts` | 4,282 | 4,210 | 3,828 | 3,768 | **-72** | **-60** |
| `frontend/src/pages/manager/ManagerDashboard.tsx` | 904 | 905 | 845 | 846 | +1 | +1 |
| `frontend/src/pages/delivery/DeliveryDashboard.tsx` | 901 | 902 | 834 | 835 | +1 | +1 |
| `frontend/src/pages/admin/OwnerDashboard.tsx` | 3,653 | 3,653 | 3,411 | 3,411 | 0 | 0 |
| **Stage 4A Total** | **9,740** | **9,670** | **8,918** | **8,860** | **-70** | **-58** |

