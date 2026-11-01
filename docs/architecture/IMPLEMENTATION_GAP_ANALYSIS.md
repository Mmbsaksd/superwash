# IMPLEMENTATION GAP ANALYSIS
## SuperWash Exprez – Configurable Laundry Management Platform

- **Evaluation Date:** 2026-10-31
- **Target Specification:** Master Architecture & Production Roadmap
- **Scope:** Feature-by-feature comparative evaluation across Database, Backend RPCs, Frontend Services, and Admin UI.

---

## 1. Feature-by-Feature Gap Analysis Matrix

| Feature Domain | Existing Status | Required Architectural Change | Priority | Complexity |
|:---|:---|:---|:---:|:---:|
| **Standard Rate Configuration** | Implemented (₹79/kg in `business_settings.price_per_kg_paise`) | Decouple from singleton table; source from active `pricing_versions` record | High | Medium |
| **Minimum Billable Weight** | Implemented (`min_weight_kg = 1.0` enforced in `calculateBill` and triggers) | Preserve integer-paise arithmetic; source minimum weight dynamically from active pricing version | High | Low |
| **Independent Minimum Order Amount** | Missing (No separate `min_order_amount_paise` exists) | Add `min_order_amount_paise` and `min_order_restriction_enabled` to pricing versions and `business_settings` | High | Medium |
| **Pricing Version Management** | Missing (Edits overwrite rows in place) | Create `public.pricing_versions` table with `draft`, `scheduled`, `active`, `retired` statuses; snapshot version ID into orders | High | High |
| **Historical Order Price Protection** | Partially Implemented (Order columns snapshot price at creation) | Formalize `order_price_snapshots` relation and ensure activating future pricing versions never alters historic orders | High | Low |
| **Coupon Option A Booking Validation** | **Incorrect** (Rejects coupon at booking if estimate < threshold) | Update `validate_coupon` to allow provisional reservation at booking even when preliminary estimate is below threshold | **Critical** | Medium |
| **Coupon Reservation vs. Redemption** | Missing (Increments `total_redemptions` immediately at booking) | Introduce `public.coupon_reservations` and `public.coupon_redemptions`; finalize redemption only upon scale weigh-in | **Critical** | High |
| **Post-Weighing Coupon Eligibility** | Partially Implemented (Intake weigh-in calculates discount) | When actual measured bill qualifies (>= threshold), apply discount and finalize redemption; if unqualified, release reservation with clear explanation | High | Medium |
| **Cash on Delivery (COD)** | Implemented (Supported via `record_order_payment` RPC) | Add `cod_enabled` boolean in admin payment settings; record collector identity, timestamp, and receipt generation | Medium | Low |
| **Razorpay Integration** | Missing from live app (Exists only in disconnected FastAPI backend) | Implement client-side Razorpay checkout in `PaymentModal.tsx` and Supabase Edge Function for signature verification and webhooks | High | High |
| **Advance Payment Support** | Missing (Only static copy in booking wizard) | Add `advance_payment_enabled`, `advance_payment_type`, `advance_amount_paise`, and `advance_percentage` settings; credit advance against final invoice | High | Medium |
| **Auditable Payment Ledger** | Implemented (Precise integer-paise tracking in `public.payments`) | Formally expose ledger calculations: Total Invoiced, Verified Payments, Refunds, and Outstanding Balance | Medium | Low |
| **Refunds & Event Logging** | Missing (No dedicated table) | Create `public.refunds` and `public.payment_events` tables to record refund transactions and ensure webhook idempotency | Medium | Medium |
| **Admin Pricing Management** | Partially Implemented (Simple form edits price in place) | Add Pricing Version tab: view version history, create scheduled versions, view active rate and minimum restrictions | High | Medium |
| **Admin Payment Gateway Settings** | Missing (No toggles for Razorpay/COD/Advance) | Add Payment Methods tab in Admin Dashboard: enable/disable Razorpay, COD, and Advance payments | High | Medium |
| **Business Analytics & Reporting** | Implemented (KPIs, revenue, period filtering) | Extend period analytics to distinguish invoiced revenue from collected cash/online payments and advance receipts | Medium | Low |

---

## 2. Key Deficiencies & Root Causes

### 2.1 The Coupon Option A Conflict
- **Root Cause:** In migration `20261027140000_coupons_and_address_dedup.sql`, lines 349–357 explicitly check `IF p_subtotal_paise < v_coupon.min_order_paise THEN RETURN valid: false`.
- **Business Impact:** A customer booking 1 kg of laundry (estimated at ₹79) cannot apply coupon `WELCOME50` (which has a ₹250 minimum order threshold), even though their actual laundry basket upon pickup will weigh 4 kg (totaling ₹316) and qualify for the offer.
- **Remediation:** Refactor `validate_coupon` to distinguish between `is_booking_time` and `is_final_weighing`. At booking time, if the code is active and valid, mark it as `provisionally_eligible`. Evaluate the ₹250 threshold strictly when actual scale weight is recorded.

### 2.2 Lack of Pricing Versioning Entity
- **Root Cause:** The database relied on a single row in `business_settings` and `services`.
- **Business Impact:** If an owner changes the rate from ₹79 to ₹89 on November 15, there is no audit log of who made the change, when it became active, or the ability to schedule future rate revisions in advance.
- **Remediation:** Introduce `public.pricing_versions` with explicit lifecycle statuses (`draft`, `scheduled`, `active`, `retired`).

### 2.3 Payment Method Expansion (Razorpay & Advance)
- **Root Cause:** Table constraints `CHECK (payment_method IN ('cash', 'upi_manual'))` hardcode two legacy payment methods.
- **Business Impact:** Online payments via Razorpay or advance payment splits cannot be recorded in `public.payments` without violating database check constraints.
- **Remediation:** Widen check constraints to permit `'razorpay'`, add advance payment columns, and implement server-side verification.

