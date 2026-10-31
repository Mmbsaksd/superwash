# SuperWash Exprez — CustomerHome.tsx Stage 3A Simplification Execution Report

**Project:** SuperWash Exprez  
**Repository:** `F:\superwash`  
**Target File:** `frontend/src/pages/customer/CustomerHome.tsx`  
**Execution Stage:** Stage 3A (CustomerHome.tsx Safe Simplification)  
**Date:** 2026-10-31  
**Status:** Completed & Certified  

---

## 1. Executive Summary

Stage 3A of the SuperWash code simplification program was executed exclusively inside `frontend/src/pages/customer/CustomerHome.tsx`. The refactor eliminated confirmed dead imports, dead variable declarations, consolidated eight duplicated submission ID generation expressions, unified three duplicate post-booking confirmation lifecycle state-commit blocks, and replaced three repeated customer ownership verification blocks with a robust, centralized helper function.

All modifications strictly adhered to the safety boundaries:
- Zero alterations to geolocation services or map coordinate logic.
- Zero changes to address book mutation flows or form fields.
- Zero impact on checkout and authoritative coupon validation.
- Zero breaking changes to session storage persistence or navigation history.
- 100% test pass rate preserved (291/291 Vitest tests passing across all 14 test suites).
- 100% clean TypeScript build (`tsc -b` and `vite build` completed with 0 errors).

---

## 2. Quantitative Metrics & SLOC Summary

| Metric | Pre-Stage 3A Baseline | Post-Stage 3A Refactor | Net Change |
| :--- | :---: | :---: | :---: |
| **`CustomerHome.tsx` Physical Lines** | 4,165 lines | 4,096 lines | **-69 lines (-1.66%)** |
| **`CustomerHome.tsx` Non-Blank SLOC** | 3,918 lines | 3,852 lines | **-66 lines (-1.68%)** |
| **Git Line Modifications (`git diff --stat`)** | — | 97 additions, 166 deletions | **-69 net lines** |
| **Dead/Unused Component Imports** | 7 imports | 0 imports | **-7 imports** |
| **Dead/Unused Variable Declarations** | 3 declarations | 0 declarations | **-3 declarations** |
| **Duplicated Submission ID Expressions** | 8 instances | 1 helper (`generateClientSubmissionId`) | **Consolidated to 1** |
| **Post-Booking Confirmation Blocks** | 3 blocks (66 lines total) | 1 helper (`commitConfirmedBookingState`) | **Consolidated to 1** |
| **Customer Ownership Verification Blocks** | 3 blocks (27 lines total) | 1 helper (`isCustomerOrderOwner`) | **Consolidated to 1** |
| **CustomerHome Production Chunk (`dist`)** | 131.02 kB (gzip: 28.51 kB) | 129.89 kB (gzip: 28.23 kB) | **-1.13 kB (-0.28 kB gzip)** |
| **Vitest Tests Passing** | 291 / 291 (100%) | 291 / 291 (100%) | **0 regressions (14/14 suites)** |
| **TypeScript Compilation (`tsc -b`)** | 0 errors | 0 errors | **0 errors** |

---

## 3. Detailed Actions Executed

### A. Removal of Confirmed Dead Code
1. **Unused Component & Icon Imports Removed:**
   - `CustomerOrderTracker` (unused tracker view replaced by tab-based timeline).
   - `CustomerTopNav` (superseded by standard header markup).
   - `PendingBookingPayload` (unused type import from `pendingBooking`).
   - `ShieldCheck` (unused Lucide icon).
   - `Truck` (unused Lucide icon).
   - `Package` (unused Lucide icon).
   - `FileText` (unused Lucide icon).
2. **Unused Declarations Removed:**
   - `needsPhonePrompt` (destructured from `useAuth()` but never evaluated in `CustomerHome`).
   - `pricePerKg` (calculated string never referenced in rendering).
   - `minWeight` (calculated string never referenced in rendering).

### B. Consolidation of Client Submission ID Generation
Extracted a standardized module-level helper:
```typescript
const generateClientSubmissionId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
```
Replaced all 8 duplicate generation expressions:
1. Initial state setup: `useState<string>(generateClientSubmissionId)`
2. Fingerprint difference in `pendingRecovery` effect
3. Standard form change reset in `submissionId` effect
4. Booking tab switch in `handleTabChange('book')`
5. New booking creation success in `handleCreateBooking`
6. Existing order recovery in `handleResolvePendingBooking`
7. Timeout retry completion in `handleCompleteUncommittedBooking`
8. Discard pending notice in `handleDiscardPendingBooking`

### C. Consolidation of Post-Booking Confirmation State Updates
Extracted a dedicated component-level helper:
```typescript
const commitConfirmedBookingState = (primaryOrder: Order, batchOrders?: Order[]) => {
  const ordersToCommit = batchOrders && batchOrders.length > 0 ? batchOrders : [primaryOrder];
  setBookingSuccessOrder(primaryOrder);
  try {
    sessionStorage.setItem(
      CONFIRMED_ORDER_KEY,
      JSON.stringify({
        ...primaryOrder,
        timestamp: Date.now()
      })
    );
  } catch {}

  setOrders((prev) => {
    const newIds = new Set(ordersToCommit.map((o) => o.id));
    const filtered = prev.filter((o) => !newIds.has(o.id));
    return [...ordersToCommit, ...filtered];
  });
  setBookingError(null);
  handleTabChange('current');
  setSearchParams(
    (prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', 'current');
      p.set('confirmed', primaryOrder.order_number);
      return p;
    },
    { replace: true }
  );
};
```
Replaced 3 duplicate 22-line boilerplate blocks in:
1. `handleCreateBooking`: replaces lines updating `bookingSuccessOrder`, `sessionStorage`, `orders`, and query parameters.
2. `handleResolvePendingBooking`: replaces duplicate confirmation state commits after verifying existing order by submission ID.
3. `handleCompleteUncommittedBooking`: replaces duplicate confirmation state commits after completing an uncommitted pending booking.

### D. Consolidation of Customer Ownership Verification
Extracted an authoritative module-level helper:
```typescript
const isCustomerOrderOwner = (
  order: { customer_id?: string | null; customer_phone?: string | null } | null | undefined,
  user: Profile | null | undefined
): boolean => {
  if (!order || !user) return false;
  if (order.customer_id && order.customer_id === user.id) return true;
  if (user.phone && order.customer_phone) {
    const cleanUserPhone = user.phone.replace(/[^0-9]/g, '');
    const cleanOrderPhone = order.customer_phone.replace(/[^0-9]/g, '');
    return cleanUserPhone.length > 0 && cleanOrderPhone === cleanUserPhone;
  }
  return false;
};
```
Replaced 3 duplicate ownership checks:
1. Restoring confirmed booking from `sessionStorage` on `?confirmed=...` visit.
2. Keeping `bookingSuccessOrder` synced with authoritative database orders list.
3. Clearing stored confirmation and active banner on user logout or account switch.

---

## 4. Verification and Test Suite Results

### Full Vitest Test Suite (14 files, 291 tests)
```
 ✓ src/test/invoiceAuditAndVerification.test.tsx (11 tests)
 ✓ src/test/pricingConsistencyAudit.test.tsx (11 tests)
 ✓ src/test/linkedOrdersAndPricingVerification.test.tsx (14 tests)
 ✓ src/test/staffManagement.test.tsx (26 tests)
 ✓ src/test/portalSeparation.test.tsx (21 tests)
 ✓ src/test/components.test.tsx (81 tests)
 ✓ src/test/secureRpcIntegration.test.ts (11 tests)
 ✓ src/test/ownerQuickAccessAndPwa.test.tsx (12 tests)
 ✓ src/test/customerUxRedesign.test.tsx (14 tests)
 ✓ src/test/passwordReset.test.tsx (10 tests)
 ✓ src/test/settingsAndFallbackIntegrity.test.ts (5 tests)
 ✓ src/test/couponLifecycleSecurity.test.ts (9 tests)
 ✓ src/test/weighingPermissionRegression.test.ts (7 tests)
 ✓ src/test/phase1CustomerExperience.test.tsx (59 tests)

Test Files: 14 passed (14)
Tests:      291 passed (291)
Time:       27.72s
```

### Production Build & Typecheck
```
> tsc -b && vite build
✓ 1672 modules transformed.
dist/assets/CustomerHome-CgI-Bawi.js       129.89 kB │ gzip: 28.23 kB
dist/assets/index-BNMQz9Hk.js              303.60 kB │ gzip: 90.83 kB
✓ built in 5.81s with 0 errors
```

---

## 5. Remaining Scope & Next Steps

1. **State Partitioning (Stage 3B)**:
   - `CustomerHome.tsx` remains substantial (~4,096 lines) with ~87 `useState` hooks.
   - Candidate subcomponents identified during audit: `CustomerAddressManager` (~280 lines), `CustomerOnboardingModal` (~160 lines), `CustomerOrderHistory` (~300 lines).
   - Moving these to dedicated feature components will significantly reduce cognitive load and simplify local testing without altering runtime behaviour.
2. **Production Deployment Gate**:
   - Repository remains in a clean, certified state.
   - All migrations, tests, and documentation are ready for production commit when instructed.

