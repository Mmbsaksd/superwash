# SuperWash Exprez — Master Data Cleanup Proposal

**Proposal Date:** October 29, 2026  
**Author:** Senior Database Reliability Specialist & Security Reviewer  
**Target Repository:** `F:\superwash`  
**Status:** **AWAITING USER APPROVAL — ZERO RECORDS DELETED**  

---

## 1. Objective & Safety Boundaries

The purpose of this cleanup proposal is to safely remove development and testing artifacts from client storage, archive obsolete legacy prototype files, and reconcile fallback code constants without mutating or risking any genuine business configuration, customer data, or store settings.

### Absolute Safety Guarantees:
- **No Production Database Deletions Needed:** Live Supabase `public.orders` contains **0 rows**. No test orders exist in production PostgreSQL.
- **Strict Role Protection:** Primary Owner account (`owner@superwash.in`, ID `00000000-0000-4000-a000-000000000001`) and operational store settings are safeguarded by defensive SQL constraints.
- **Non-Destructive Execution:** Cleanup is phased and isolated. All legacy files are archived rather than permanently deleted.

---

## 2. Itemized Data Cleanup Actions

### Action Category 1: Safe to Retain Unconditionally (DO NOT TOUCH)
These records represent legitimate business configurations and operational infrastructure:
1. **Supabase `business_settings` (ID: `a19714b5-ddb9-4018-9688-f44a81a7f059`):** Authoritative Kadarenahalli Park, Banashankari 2nd Stage store hub, phone `+91 8217541193`, ₹79/kg rate baseline.
2. **Supabase `pickup_slots` (4 slots):** Morning (08:00–11:00), Noon (11:00–14:00), Afternoon (14:00–17:00), Evening (17:00–20:00).
3. **Supabase `service_areas` (2 areas):** Pincodes `560111` (Kumaraswamy Layout) and `560070` (Banashankari).
4. **Supabase `services` (2 services):** `Wash & Fold (Normal)` and `Wash and Iron` at ₹79/kg (1.0 kg min).
5. **Supabase `profiles` (Owner):** Rajesh Sharma (`owner@superwash.in`).
6. **Supabase `coupons` (2 coupons):** `WELCOME50` and `EXPREZ10` (default `is_active: false`).

---

### Action Category 2: Confirmed Test Data Proposed for Removal

#### Item 2.1: Test Order `#SW-1003` in Browser `localStorage`
- **Source & Key:** Client `localStorage.getItem('superwash_orders')`
- **Record Identifier:** Order ID `00000000-0000-4000-b000-000000000103` / `#SW-1003`
- **Supporting Evidence:** Created during test scenario `BOOK-CONFIRM-01` on October 29, 2026. Customer: `Priya Sharma (Customer)`, Phone: `9876543212`, Total: ₹237.00.
- **Reason for Removal:** Test artifact generated during booking confirmation validation.
- **Expected Impact:** Removes simulated order from customer tracker; returns tracker to clean 0-order state.
- **Dependencies:** None. Isolated to client storage.
- **Recovery:** Re-running the booking wizard regenerates an order in 10 seconds.

#### Item 2.2: Test Delivery Address Caches in Browser `localStorage`
- **Source & Key:** `superwash_addresses` and `superwash_addresses_<userId>`
- **Record Identifier:** Address records containing `Flat 402, Green Glen Layout` or `13th Main Rd`
- **Supporting Evidence:** Generated during booking wizard test inputs.
- **Reason for Removal:** Dummy address records populated during QA testing.
- **Expected Impact:** Reverts "My Saved Addresses" tab to a clean state for real users.
- **Dependencies:** None.

#### Item 2.3: Injected Promotional Coupon State Override
- **Source & Key:** Client `localStorage.getItem('superwash_coupons')`
- **Record Identifier:** Array element `WELCOME50` with runtime modification `is_active: true`
- **Supporting Evidence:** Injected during automated test scenario `COUPON-01` to test active coupon application.
- **Reason for Removal:** Prevents unauthorized ₹50 discount from appearing active by default.
- **Expected Impact:** Restores coupons to authoritative inactive state (`is_active: false`). Business owner must explicitly activate coupons via Owner Dashboard.

#### Item 2.4: Test Notification & Payment Logs in Browser `localStorage`
- **Source & Key:** `superwash_notifications` and `superwash_payments`
- **Record Identifier:** Mock notification and transaction records generated for `#SW-1003`
- **Supporting Evidence:** Generated during booking dispatch tests.
- **Reason for Removal:** Unnecessary test logs in browser storage.
- **Expected Impact:** Cleans client storage. Zero application impact.

#### Item 2.5: Wizard Draft State in Browser `sessionStorage`
- **Source & Key:** `sessionStorage.getItem('superwash_pending_booking')`
- **Record Identifier:** Draft form object containing partially submitted wizard state
- **Supporting Evidence:** Saved during multi-step booking testing.
- **Reason for Removal:** Clears stale test form entries.
- **Expected Impact:** Booking wizard opens cleanly on Step 1.

---

### Action Category 3: Confirmed Duplicate / Obsolete Data Proposed for Removal

#### Item 3.1: Legacy SQLite Database File (`backend/superwash.db`)
- **Source & File:** `F:\superwash\backend\superwash.db` (328 KB)
- **Record Identifiers:** 4 prototype orders (`SW-2026-1001`–`1004`), 5 prototype accounts (`admin@superwash.in`, etc.), 30 notification logs.
- **Supporting Evidence:** Created on October 21, 2026 during early backend prototyping. Primary architecture is Supabase PostgreSQL.
- **Reason for Removal:** Obsolete prototype file. Not utilized by Vite frontend or Cloudflare Pages deployment.
- **Expected Impact:** Zero impact on production application. Eliminates ambiguity.
- **Safety Action:** Move to `backend/archive/superwash_legacy_prototype_20261021.db` (non-destructive backup).

---

### Action Category 4: Uncertain Records Requiring Explicit User Decision

#### Decision Item 4.1: Fallback Mock Orders in Code (`INITIAL_SAMPLE_ORDERS`)
- **Source & Location:** `frontend/src/services/laundryService.ts` (Lines 210–271)
- **Current State:** Contains mock orders `#SW-1001` and `#SW-1002` with obsolete price `price_per_kg_paise: 8000` (₹80.00/kg).
- **User Options:**
  - **Option A (Recommended for Clean Production):** Set `INITIAL_SAMPLE_ORDERS = []` so the app starts with 0 orders when client storage is empty.
  - **Option B (Reconcile for Demo):** Update `price_per_kg_paise` from `8000` to `7900` so mock orders match official business pricing.

#### Decision Item 4.2: Fallback Store Settings in Code (`DEFAULT_SETTINGS`)
- **Source & Location:** `frontend/src/services/laundryService.ts` (Lines 34–45)
- **Current State:** References `Shop #14, Indiranagar, Bengaluru 560038` and phone `+91 98765 43210`. The live Supabase database contains `Kadarenahalli Park, Banashankari 2nd Stage, Bengaluru 560070` with phone `+91 8217541193`.
- **User Options:**
  - **Option A (Recommended):** Synchronize `DEFAULT_SETTINGS` to match the verified Banashankari store address and phone.
  - **Option B:** Keep Indiranagar as hardcoded fallback.

---

## 3. Ready-to-Execute Cleanup Procedures (Awaiting Approval)

### Procedure 1: Client Browser Storage Purge
Execute this snippet in the browser console on `http://localhost:5173/` or via a cleanup runner:
```javascript
// Built-in operational cache purge
LaundryService.clearUserOperationalCache();

// Remove test coupon overrides and notifications
localStorage.removeItem('superwash_coupons');
localStorage.removeItem('superwash_notifications');

console.log('✅ Client test data cleared. Orders in storage:', localStorage.getItem('superwash_orders'));
```

### Procedure 2: Archive Legacy SQLite Database
Execute in PowerShell:
```powershell
New-Item -ItemType Directory -Force -Path "F:\superwash\backend\archive"
Move-Item -Path "F:\superwash\backend\superwash.db" -Destination "F:\superwash\backend\archive\superwash_legacy_prototype_20261021.db"
```

### Procedure 3: Supabase Verification SQL Guard
Execute in Supabase SQL Editor to verify zero test contamination:
```sql
SELECT 'business_settings' AS table_name, count(*) FROM public.business_settings
UNION ALL
SELECT 'pickup_slots', count(*) FROM public.pickup_slots
UNION ALL
SELECT 'service_areas', count(*) FROM public.service_areas
UNION ALL
SELECT 'services', count(*) FROM public.services
UNION ALL
SELECT 'orders', count(*) FROM public.orders;
```

---

*Prepared by Antigravity Database Reliability Specialist. Awaiting user approval to execute.*

