# SuperWash Exprez — Final Gap Analysis & Remediation Matrix

**Document Purpose:** Detailed feature-by-feature classification identifying exact code files, functions, required changes, testing requirements, and deployment dependencies.

---

## 1. Feature Classification Matrix

| Feature / Subsystem | Status Classification | Primary Locations | Description & Impact |
| :--- | :---: | :--- | :--- |
| **1. Standard ₹79/kg Pricing & 1 kg Minimum** | **Verified Complete** | `business_settings`, `services`, `OwnerDashboard.tsx` | Base operational pricing and minimum billable weight active, database-configurable, and verified. |
| **2. Independent Minimum Spend & Weight Rules** | **Verified Complete** | `pricingEngine.ts`, `business_settings`, `OwnerDashboard.tsx` | Independent toggles and numerical thresholds configured and tested. |
| **3. Historical Order Price Snapshotting** | **Verified Complete** | `orders`, `create_booking_idempotent`, DB triggers | Orders freeze rates at booking; subsequent catalogue updates do not alter past orders. |
| **4. Frontend Pricing Engine Arithmetic Parity** | **Verified Complete** | `pricingEngine.ts`, `trg_validate_order_status_update` | Zero floating-point drift; exact integer-paise formula match with database triggers. |
| **5. Cash on Delivery (COD) Workflow** | **Verified Complete** | `DeliveryDashboard.tsx`, `record_order_payment`, `payments` | Full courier assignment, collection, identity verification, and ledger logging. |
| **6. Option A Coupon Lifecycle (Frontend Mock)** | **Verified Complete** | `pricingEngine.ts`, `CustomerHome.tsx`, `couponOptionALifecycle.test.ts` | Preliminary booking reservation attaches without rejection; evaluates against final bill. |
| **7. Option A Coupon Lifecycle (Live Database)** | **Partially Complete** | `supabase/migrations/20261027140000_coupons_and_address_dedup.sql` | Live RPCs (`validate_coupon`, `create_booking_idempotent`) still enforce preliminary subtotal check in Postgres. |
| **8. Dynamic Pricing Versioning Engine** | **Partially Complete** | `pricing_versions`, `get_active_pricing()` | Database schema and RPC created, but runtime invocation and Admin UI are missing. |
| **9. Advance Payment Accounting (Domain & Mock)** | **Verified Complete** | `pricingEngine.ts`, `advancePaymentLedger.test.ts` | Advance correctly recognized as invoice credit, not an extra fee; reduces balance due. |
| **10. Advance Payment (Live Database RPC)** | **Partially Complete** | `supabase/migrations/20261022180000_database_enforced_workflow_and_security.sql` | `record_order_payment` in Postgres rejects payments when `total_amount_paise IS NULL`. |
| **11. Admin Business Settings UI** | **Verified Complete** | `OwnerDashboard.tsx`, `laundryService.ts` | Real database inputs for rate, min weight, min spend, advance toggles, COD, Razorpay. |
| **12. Admin Pricing Version Management UI** | **Missing** | `OwnerDashboard.tsx` | No UI table to inspect version history, schedule upcoming versions, or draft price changes. |
| **13. Razorpay Gateway Integration** | **Blocked by Credentials** | `supabase/functions/`, `OwnerDashboard.tsx` | Blocked awaiting Razorpay Key ID and Key Secret; requires Supabase Edge Function. |
| **14. Automated Refund Ledger on Cancellation** | **Missing** | `laundryService.ts`, `cancel_order_with_batch_sync` | Cancelling order with paid advance does not record refund entry in ledger. |

---

## 2. Incomplete Features: Exact Remediation Specifications

### Gap 1: Option A Coupon Support in PostgreSQL Database RPCs
- **Classification:** Partially Complete
- **Exact Files Affected:**
  - `supabase/migrations/20261101000000_platform_foundations.sql`
  - `frontend/src/services/laundryService.ts`
- **Relevant Database Functions:**
  - `public.validate_coupon(p_code TEXT, p_customer_phone TEXT, p_subtotal_paise INTEGER, p_service_id UUID, p_phase TEXT DEFAULT 'booking')`
  - `public.create_booking_idempotent(...)`
- **Required Changes:**
  1. In `public.validate_coupon`: Add `p_phase TEXT DEFAULT 'booking'`. If `p_phase = 'booking'`, bypass `IF p_subtotal_paise < v_coupon.min_order_paise` failure and return `valid: true`, setting `is_provisional: true`.
  2. In `public.create_booking_idempotent`:
     - Remove the fatal exception on line 262: `IF v_coupon.min_order_paise > 0 AND v_estimated_subtotal < v_coupon.min_order_paise THEN RAISE EXCEPTION...`.
     - Remove premature increment on line 324: `UPDATE public.coupons SET total_redemptions = total_redemptions + 1...`.
     - Insert a record into `public.coupon_reservations (coupon_id, user_id, order_id, status)` with status `'reserved'`.
  3. In `laundryService.ts`: Pass `p_phase: isBookingEstimate ? 'booking' : 'final'` when calling `supabase.rpc('validate_coupon')`.
- **Testing Requirements:**
  - Execute a live-mode booking test with `min_order_paise = 25000` on a 1 kg (₹79) estimate; verify booking succeeds without exception and reservation row exists in `coupon_reservations`.
- **Deployment Dependencies:** Must be applied via Supabase SQL migration before Option A coupons are activated in production.

---

### Gap 2: Live Database Support for Advance Payments in `record_order_payment`
- **Classification:** Partially Complete
- **Exact Files Affected:**
  - `supabase/migrations/20261101000000_platform_foundations.sql`
  - `frontend/src/services/laundryService.ts`
- **Relevant Database Functions:**
  - `public.record_order_payment(p_order_id UUID, p_amount_paise INTEGER, p_payment_method VARCHAR, p_transaction_reference VARCHAR, p_notes TEXT, p_idempotency_key VARCHAR, p_payment_type VARCHAR DEFAULT 'full')`
- **Required Changes:**
  1. Add `p_payment_type VARCHAR(30) DEFAULT 'full'` parameter to `public.record_order_payment`.
  2. Allow customer callers (`v_role = 'customer'`) to record payments on their own order if `p_payment_type = 'advance' AND v_order.customer_id = auth.uid()`.
  3. Modify billing prerequisite check:
     ```sql
     -- Allow unweighed orders only for advance payments
     IF p_payment_type <> 'advance' AND v_order.total_amount_paise IS NULL THEN
         RAISE EXCEPTION 'Cannot record payment: Order #% has not yet been weighed and billed.', v_order.order_number;
     END IF;
     ```
  4. Allow `p_payment_method IN ('cash', 'upi_manual', 'razorpay')`.
  5. In `laundryService.ts`: Pass `p_payment_type: paymentType` in `supabase.rpc('record_order_payment')`.
- **Testing Requirements:**
  - Test recording ₹50 advance on an unweighed order in live mode; verify payment persists with `payment_type = 'advance'` and order status updates to `partially_paid`.
- **Deployment Dependencies:** Database migration update in `supabase/migrations/`.

---

### Gap 3: Runtime Invocation of `get_active_pricing()`
- **Classification:** Partially Complete
- **Exact Files Affected:**
  - `frontend/src/services/laundryService.ts`
  - `frontend/src/pages/customer/CustomerHome.tsx`
  - `supabase/migrations/20261101000000_platform_foundations.sql`
- **Relevant Functions:**
  - `LaundryService.getActivePricing()`
  - `create_booking_idempotent()`
- **Required Changes:**
  1. In `laundryService.ts`: Implement `getActivePricing()` calling `supabase.rpc('get_active_pricing')` and cache in localStorage.
  2. In `CustomerHome.tsx`: Call `LaundryService.getActivePricing()` on mount to display versioned service rates.
  3. In `create_booking_idempotent`: Query active pricing item from `pricing_versions` if one exists, falling back to `services` / `business_settings`.
- **Testing Requirements:**
  - Unit test verifying `getActivePricing()` returns active version items and correctly falls back if RPC is unavailable.
- **Deployment Dependencies:** PostgREST schema cache reload (`NOTIFY pgrst, 'reload schema'`).

---

### Gap 4: Admin Pricing Version Management UI
- **Classification:** Missing
- **Exact Files Affected:**
  - `frontend/src/pages/admin/OwnerDashboard.tsx`
  - `frontend/src/services/laundryService.ts`
- **Relevant Components / Functions:**
  - `PricingVersionTab` or modal in `OwnerDashboard.tsx`
  - `LaundryService.getPricingVersions()`, `LaundryService.createPricingVersion()`, `LaundryService.activatePricingVersion()`
- **Required Changes:**
  1. Add service methods in `laundryService.ts` to query and mutate `pricing_versions` and `pricing_version_items`.
  2. Add a **"Pricing Versions"** sub-tab in `OwnerDashboard.tsx` displaying:
     - Active version number, effective date, and rates.
     - Past archived versions with timestamps.
     - "Create New Version" button opening a modal with price per kg and min weight inputs.
     - Immediate activation toggle vs scheduled activation date picker.
- **Testing Requirements:**
  - Vitest component tests verifying modal submission, validation of positive integers, and list re-rendering.
- **Deployment Dependencies:** None (pure client + Supabase REST table access).

---

### Gap 5: Automated Refund Ledger on Order Cancellation
- **Classification:** Missing
- **Exact Files Affected:**
  - `supabase/migrations/20261101000000_platform_foundations.sql`
  - `frontend/src/services/laundryService.ts`
- **Relevant Functions:**
  - `cancel_order_with_batch_sync()`
  - `LaundryService.updateOrderStatus('cancelled')`
- **Required Changes:**
  1. In `cancel_order_with_batch_sync`: If `v_order.paid_amount_paise > 0`, insert a ledger entry into `public.payments` with `payment_type = 'refund'`, `amount_paise = -v_order.paid_amount_paise`, and note reason.
  2. Update `orders.payment_status = 'refund_pending'` or `'refunded'`.
- **Testing Requirements:**
  - Test cancelling an order with ₹50 advance paid; verify net paid becomes ₹0 and payment history records the refund.
- **Deployment Dependencies:** Database migration.

---

### Gap 6: Razorpay Edge Function & Webhook Listener
- **Classification:** Blocked by Credentials / External Configuration
- **Exact Files Affected:**
  - `supabase/functions/create-razorpay-order/index.ts`
  - `supabase/functions/razorpay-webhook/index.ts`
  - `frontend/src/services/razorpayService.ts`
- **Required Changes:**
  1. Obtain Razorpay Key ID and Key Secret from the merchant.
  2. Implement Supabase Edge Function `create-razorpay-order` to generate signed Razorpay orders.
  3. Implement Supabase Edge Function `razorpay-webhook` with HMAC-SHA256 signature verification against `x-razorpay-signature` and write idempotently to `payment_events`.
  4. Connect checkout button in `PaymentModal.tsx` to Razorpay Checkout JS SDK.
- **Testing Requirements:**
  - Razorpay Test Mode end-to-end sandbox run.
- **Deployment Dependencies:** Supabase CLI `supabase functions deploy`.

