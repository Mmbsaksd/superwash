# SuperWash — Stage 4B Execution Report: RPC Error-Handling Simplification

## Executive Summary

Stage 4B has successfully consolidated repeated missing-RPC detection logic in `frontend/src/services/laundryService.ts`. Eight identical error-handling predicates across core workflow and payment operations have been unified into a single private, strongly typed helper (`isRpcMissing`). Four special-case locations with distinct error boundaries and fallback semantics have been intentionally preserved without modification to uphold strict security and error-matching precision.

- **Baseline LaundryService Size (Pre-Stage 4B)**: 4,210 physical lines | 3,768 nonblank SLOC
- **Post-Stage 4B Size**: 4,175 physical lines | 3,740 nonblank SLOC
- **Net Code Reduction in Stage 4B**: **-35 physical lines | -28 nonblank SLOC**
- **Combined Stage 4A + 4B Reduction**: **-107 physical lines | -88 nonblank SLOC**
- **RPC Integration Suite (`secureRpcIntegration.test.ts`)**: **11 / 11 tests passed (100%)**
- **Full Vitest Suite (`--fileParallelism=false`)**: **14 / 14 suites passed | 291 / 291 tests passed (100%)**
- **Production Build (`tsc -b && vite build`)**: **Success (0 errors, 6.79s)**

---

## 1. Classification of All 12 Missing-RPC Error Handlers

Every missing-RPC check in `laundryService.ts` was audited and classified across four behavioural categories:

### Category A: Fail-Closed Workflow & Payment Operations (Consolidated via `isRpcMissing`)
These operations require atomic execution in the database. When the RPC function is absent or not yet deployed, the operation **fails closed** and throws a user-friendly upgrade notice. Direct table mutations are strictly prohibited to prevent unauthorized status progression or financial tampering.

| Location | Method | Target RPC | Recognized Codes / Patterns | Handling Strategy | User-Facing Error Message | Security Implications |
|---|---|---|---|---|---|---|
| L1290 | `assignPickupStaff` | `assign_order_courier` | `42883`, `PGRST202`, RPC name, `could not find` | Fail-closed (throw Error) | *"The courier assignment service is temporarily unavailable while database upgrades are pending..."* | Prevents unauthorized staff assignment and protects linked batch integrity. |
| L1379 | `assignDeliveryStaff` | `assign_order_courier` | `42883`, `PGRST202`, RPC name, `could not find` | Fail-closed (throw Error) | *"The courier assignment service is temporarily unavailable while database upgrades are pending..."* | Ensures dispatch courier validation and sibling order alignment. |
| L1490 | `recordPickupCollectionAndWeight` | `record_courier_pickup_collection` | `42883`, `PGRST202`, RPC name, `could not find` | Fail-closed (throw Error) | *"The doorstep collection service is temporarily unavailable while database upgrades are pending..."* | Prevents unverified weight entry and ensures server-side bill/discount calculation. |
| L1623 | `enterMeasuredWeight` | `record_store_intake_weight` | `42883`, `PGRST202`, RPC name, `could not find` | Fail-closed (throw Error) | *"The store intake scale service is temporarily unavailable while database upgrades are pending..."* | Protects authoritative scale measurements from client tampering. |
| L1742 | `updateOrderStatus` (cancel) | `cancel_order_with_batch_sync` | `42883`, `PGRST202`, RPC name, `could not find` | Fail-closed (throw Error) | *"The order cancellation service is temporarily unavailable while database upgrades are pending..."* | Guarantees atomic coupon restoration across linked order batches. |
| L1787 | `updateOrderStatus` (advance) | `advance_order_workflow_status` | `42883`, `PGRST202`, RPC name, `could not find` | Fail-closed (throw Error) | *"The order workflow service is temporarily unavailable while database upgrades are pending..."* | Enforces strict status transition lifecycle (e.g. `out_for_delivery` before `delivered`). |
| L2043 | `recordPayment` | `record_order_payment` | `42883`, `PGRST202`, RPC name, `could not find` | Fail-closed (throw Error) | *"The payment processing service is temporarily unavailable while database upgrades are pending..."* | Enforces UTR idempotency and ledger immutability (`paid_amount_paise`). |

### Category B: Direct-Table Fallback Operations
Operations where a database RPC provides atomic convenience, but an explicit table fallback exists for schema compatibility.

| Location | Method | Target RPC | Recognized Codes / Patterns | Handling Strategy | User-Facing Error Message / Action | Security Implications |
|---|---|---|---|---|---|---|
| L2300 | `updateDeliveryNotes` | `update_order_delivery_notes` | `42883`, `PGRST202`, RPC name, `could not find` | **Consolidated via `isRpcMissing`**; falls back to `orders.update({ delivery_notes })` | `console.warn` logged; fallback update executed | Low risk. Delivery notes do not alter pricing, status, or financial fields. |
| L2684 | `updateStaffProfile` | `update_staff_profile` | `42883`, `does not exist` | **Retained dedicated check**; falls back to `profiles.update` | Direct table update under owner RLS | Low risk. RLS prevents non-owners from modifying employee profiles. |
| L2914 | `toggleStaffStatus` | `set_staff_active_status` | `42883`, `does not exist` | **Retained dedicated check**; falls back to `profiles.update` | Direct table update under owner RLS | Low risk. RLS restricts staff activation toggles to owner accounts. |

### Category C: Edge Function Fallback Operations
| Location | Method | Target RPC | Recognized Codes / Patterns | Handling Strategy | User-Facing Error Message / Action | Security Implications |
|---|---|---|---|---|---|---|
| L2459 | `createStaffProfile` | `create_staff_account` | `42883`, `function` && `does not exist` | **Retained dedicated check**; falls back to Edge Function `create-staff-account` | Invokes server-side Edge Function | Secure. Both RPC and Edge Function execute with service-role privileges. |

### Category D: Special-Case Booking Error Handling
| Location | Method | Target RPC | Recognized Codes / Patterns | Handling Strategy | User-Facing Error Message / Action | Security Implications |
|---|---|---|---|---|---|---|
| L1196 | `internalCreateBooking` | `create_booking_idempotent` | `PGRST202`, `'could not find the function'`, `'function'` && `'does not exist'`, `'function public.create_booking_idempotent'` | **Retained dedicated check**; throws typed `BOOKING_SERVICE_UNAVAILABLE` error | *"The booking service is temporarily unavailable while database upgrades are pending..."* | Critical. Booking payload is preserved without creating duplicates or writing dirty rows. |
| L1167 | `internalCreateBooking` (retry) | `create_booking_idempotent` | `err && data.coupon_code && (err.code === 'PGRST202' \|\| err.message?.includes('could not find the function'))` | **Retained dedicated check**; retries without coupon params | Transparent signature compatibility retry | High. Ensures orders can still be booked if remote RPC signature lacks coupon columns. |
| L2863 | `deleteStaffProfile` | `delete_staff_profile` | `42883`, `does not exist` | **Retained dedicated check**; throws explicit migration error | *"Database RPC 'delete_staff_profile' is not configured or migration 20261027130000 has not been applied..."* | Critical. Direct profile deletion is intentionally blocked to protect foreign key integrity. |

---

## 2. Helper Implementation & Consolidated Predicates

### Helper Design
A single private static method was introduced in `LaundryService`:
```typescript
  private static isRpcMissing(
    error: { code?: string; message?: string } | null | undefined,
    rpcName: string
  ): boolean {
    if (!error) return false;
    return (
      error.code === '42883' ||
      error.code === 'PGRST202' ||
      (error.message?.includes(rpcName) ?? false) ||
      (error.message?.includes('could not find') ?? false)
    );
  }
```

### Properties of the Implementation
1. **Strongly Typed**: The `error` parameter takes `{ code?: string; message?: string } | null | undefined`, avoiding `any` while accepting Supabase `PostgrestError` and standard catch exceptions seamlessly.
2. **Strict Semantic Equivalence**: Exactly mirrors the 4 conditions originally evaluated in all 8 consolidated call sites:
   - PostgreSQL undefined function code (`42883`)
   - PostgREST missing function code (`PGRST202`)
   - Function-name substring match (`error.message.includes(rpcName)`)
   - Generic schema cache miss (`error.message.includes('could not find')`)
3. **Pure Predicate Classifier**: The helper classifies error codes/messages only; it does not dictate fallback actions, logging, or error messages.
4. **Zero Broadening**: Not forced onto call sites with different error criteria (e.g., `updateStaffProfile`, `toggleStaffStatus`, `createStaffProfile`, `deleteStaffProfile`, or `internalCreateBooking`).

---

## 3. Code Reduction Measurements

| Metric | Pre-Stage 4B | Post-Stage 4B | Delta |
|---|---|---|---|
| `laundryService.ts` Physical Lines | 4,210 | 4,175 | **-35 lines** |
| `laundryService.ts` Nonblank SLOC | 3,768 | 3,740 | **-28 SLOC** |
| Consolidated Call Sites | 8 call sites | Unified into `isRpcMissing` | -48 boilerplate lines |
| Helper Lines Added | 0 | 13 lines | +13 lines |
| Net Line Reduction | — | — | **-35 lines** |
| Retained Special-Case Checks | 5 checks | Verified & retained intact | 0 unintended modifications |

---

## 4. Verification Results

### A. Dedicated RPC Integration Suite
Command: `npm test --prefix frontend -- src/test/secureRpcIntegration.test.ts --run`
- **Tests**: 11 / 11 passed (100%)
- **Duration**: 3.39s
- **Verified**:
  - `record_store_intake_weight` missing RPC fail-closed exception.
  - `record_courier_pickup_collection` missing RPC fail-closed exception.
  - `cancel_order_with_batch_sync` missing RPC fail-closed exception.
  - `advance_order_workflow_status` missing RPC fail-closed exception.
  - `assign_order_courier` missing RPC fail-closed exception.
  - `record_order_payment` missing RPC fail-closed exception.
  - `update_order_delivery_notes` missing RPC fallback to direct column-level update.

### B. Full Vitest Test Suite
Command: `npm test --prefix frontend -- --run --fileParallelism=false`
- **Result**: **14 test files passed (100%) | 291 / 291 tests passed (0 failures)**
- **Duration**: 49.41s

### C. TypeScript Typecheck & Production Build
Command: `npm run build --prefix frontend` (`tsc -b && vite build`)
- **Result**: **Clean compilation (0 errors)**
- **Build Duration**: 6.79s
- **Modules Transformed**: 1,672 modules

### D. Git Diff Inspection
- Only `frontend/src/services/laundryService.ts` was modified in Stage 4B.
- No test files, configuration files, or database migrations were modified.
- All accumulated uncommitted work from Stages 1–4A remains preserved intact.

