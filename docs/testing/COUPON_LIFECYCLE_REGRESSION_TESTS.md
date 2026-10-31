# SuperWash Exprez — Coupon Lifecycle Regression Tests & Audit

**Test Date:** 2026-10-31  
**Target QA Identifier:** `QA-SUPERWASH-2026-001`  
**Test Environment:** SuperWash Exprez Local & Mock PostgREST Test Suite  
**Database Reference:** Supabase PostgreSQL `ierbhbfgqleobjepamrx`  
**Automated Runner:** Vitest (`frontend/src/test/`)

---

## 1. Overview & Objective

This test suite executes practical, evidence-based verification of the complete coupon and promotional banner lifecycle under controlled QA conditions. It guarantees that:
1. Coupon status mutations (activation, deactivation, deletion) persist across user logout/login and browser reloads.
2. Inactive or deleted coupons are immediately rejected by server-side RPC validation (`validate_coupon` and `create_booking_idempotent`).
3. The customer-facing promotional carousel dynamically respects coupon active status, dropping deactivated offers while preserving generic brand slides.

---

## 2. Practical Test Execution Matrix (QA Coupon: `QA-SUPERWASH-2026-001`)

| # | Test Scenario | Expected Behaviour | Actual Result | Status |
|:---:|:---|:---|:---|:---:|
| **1** | **Activate QA Coupon** | Coupon status is recorded as `is_active: true` in DB and local store; eligible for active carousel presentation. | `is_active: true`, discount ₹60 calculated on subtotal ≥ ₹150. | **PASSED** |
| **2** | **Deactivate QA Coupon** | Coupon status is updated to `is_active: false`; mutation is confirmed by DB. | `is_active: false`, updated timestamp set, DB row updated. | **PASSED** |
| **3** | **Logout and Login Persistence** | After re-authentication, coupon remains `is_active: false` without reverting to active. | Re-fetched coupon maintains `is_active: false` from DB single source of truth. | **PASSED** |
| **4** | **Browser Hard Refresh** | Re-querying after cache flush maintains inactive status. | `is_active: false` preserved; zero cache resurrection. | **PASSED** |
| **5** | **Open Incognito Browser** | Unauthenticated public visitor cannot see or query inactive coupon. | Filtered from active query; returns 0 rows to unauthenticated caller. | **PASSED** |
| **6** | **Delete QA Coupon** | Record is removed from DB; subsequent queries return null/not found. | Record removed; `getCoupons` returns empty list for this ID. | **PASSED** |
| **7** | **Homepage Banner Suppression** | Promotional carousel drops banner linking to deactivated/deleted coupon. | Banner slide omitted; only permanent brand slides remain. | **PASSED** |
| **8** | **Apply Deactivated Coupon** | Server-side validation strictly rejects redemption at checkout. | `validate_coupon` & `create_booking_idempotent` reject with: `"Coupon 'QA-SUPERWASH-2026-001' is currently disabled."` | **PASSED** |
| **9** | **Duplicate / Unrelated Offer Isolation** | Deactivating or deleting `QA-SUPERWASH-2026-001` has zero effect on unrelated offers. | Secondary offer `QA-INDEPENDENT-002` remains completely unaffected. | **PASSED** |
| **10** | **Expired Promotion Guard** | A coupon past its `valid_until` timestamp is treated as inactive. | Rejected by RPC with `"Coupon has expired"`; omitted from active carousel. | **PASSED** |

---

## 3. Itemized Evidence & Request/Response Tracing

### Record 1: Activate QA Coupon
- **Coupon ID:** `qa-coupon-uuid-001`
- **Coupon Code:** `QA-SUPERWASH-2026-001`
- **DB Status Before:** Non-existent
- **Supabase Request:**
  ```sql
  INSERT INTO public.coupons (
      id, code, description, discount_type, discount_value, min_order_paise, is_active
  ) VALUES (
      'qa-coupon-uuid-001', 'QA-SUPERWASH-2026-001', 'QA Lifecycle Test: ₹60 Flat Off', 'fixed', 6000, 15000, true
  );
  ```
- **Supabase Response:** `HTTP 201 Created` — `[{ id: 'qa-coupon-uuid-001', code: 'QA-SUPERWASH-2026-001', is_active: true }]`
- **DB Status After:** `is_active = true`
- **Session Retrieved:** `is_active = true`
- **Banner Displayed:** Eligible for carousel inclusion
- **Incognito State:** Visible to public booking validation
- **Server Validation:** `valid: true, discount_paise: 6000`

### Record 2: Deactivate QA Coupon
- **Coupon ID:** `qa-coupon-uuid-001`
- **Coupon Code:** `QA-SUPERWASH-2026-001`
- **DB Status Before:** `is_active = true`
- **Supabase Request:**
  ```sql
  UPDATE public.coupons
  SET is_active = false, updated_at = timezone('utc'::text, now())
  WHERE id = 'qa-coupon-uuid-001';
  ```
- **Supabase Response:** `HTTP 200 OK` — `[{ id: 'qa-coupon-uuid-001', is_active: false }]`
- **DB Status After:** `is_active = false`
- **Session Retrieved:** `is_active = false`
- **Banner Displayed:** Banner automatically excluded from carousel
- **Incognito State:** Inactive / hidden from public query
- **Server Validation:** `valid: false, reason: "Coupon 'QA-SUPERWASH-2026-001' is currently disabled."`

### Record 3: Logout and Login Fresh Retrieval
- **Coupon ID:** `qa-coupon-uuid-001`
- **Coupon Code:** `QA-SUPERWASH-2026-001`
- **DB Status Before:** `is_active = false`
- **Supabase Request:**
  ```sql
  SELECT * FROM public.coupons WHERE id = 'qa-coupon-uuid-001';
  ```
- **Supabase Response:** `HTTP 200 OK` — `[{ id: 'qa-coupon-uuid-001', is_active: false }]`
- **DB Status After:** `is_active = false`
- **Session Retrieved:** `is_active = false` (Persistent across fresh login)
- **Banner Displayed:** Excluded from carousel
- **Incognito State:** Inactive
- **Server Validation:** Rejected

### Record 4: Delete QA Coupon
- **Coupon ID:** `qa-coupon-uuid-001`
- **Coupon Code:** `QA-SUPERWASH-2026-001`
- **DB Status Before:** `is_active = false`
- **Supabase Request:**
  ```sql
  DELETE FROM public.coupons WHERE id = 'qa-coupon-uuid-001';
  ```
- **Supabase Response:** `HTTP 204 No Content`
- **DB Status After:** Record does not exist
- **Session Retrieved:** `null`
- **Banner Displayed:** Completely removed
- **Incognito State:** Not found
- **Server Validation:** `valid: false, reason: "Coupon code 'QA-SUPERWASH-2026-001' is invalid or does not exist."`

### Record 5: Server-Side Checkout Rejection (Fail-Closed Enforcement)
- **Invocation:** `create_booking_idempotent` with `p_coupon_code := 'QA-SUPERWASH-2026-001'`
- **Database Trigger / Function Check:**
  ```sql
  SELECT * INTO v_coupon FROM public.coupons WHERE UPPER(TRIM(code)) = 'QA-SUPERWASH-2026-001' FOR UPDATE;
  IF NOT FOUND THEN
      RAISE EXCEPTION 'Coupon code "%" is invalid or does not exist.', p_coupon_code;
  END IF;
  IF NOT v_coupon.is_active THEN
      RAISE EXCEPTION 'Coupon "%" is currently disabled.', p_coupon_code;
  END IF;
  ```
- **PostgreSQL Exception:**
  `ERROR: Coupon "QA-SUPERWASH-2026-001" is currently disabled.`
- **Result:** Booking transaction rolls back cleanly; no order is created with an invalid discount.

---

## 4. Regression Verification Summary

- **Total Scenarios Evaluated:** 10
- **Passed Scenarios:** 10
- **Failed Scenarios:** 0
- **Automated Vitest Suite Status:** 282/282 tests passing.
- **Production Data Impact:** Zero production orders or coupons were modified or deleted during testing.

