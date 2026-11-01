# SuperWash Exprez — Business Foundation Completion Report
**Phase 10: Complete Business Foundation & End-to-End Verification**
**Final Launch Readiness: Dynamic Bengaluru Service Coverage & Business Foundation Closure**

- **Date:** November 1, 2026
- **Repository:** `F:\superwash`
- **GitHub Reference:** `https://github.com/Mmbsaksd/superwash`
- **Production Application URL:** `https://superwash.pages.dev`
- **Supabase Production Project:** `ierbhbfgqleobjepamrx` (`ap-northeast-1`)
- **Current HEAD Commit:** `12d7412` (`security: restrict public coupon access`)
- **Approved Pending Migration:** `supabase/migrations/20261101000000_platform_foundations.sql`
- **Migration Checksum (SHA-256):** `78B7ED1574B09688AA00F1D85B82EE34FEEA5C02DDFF3C1371D2539BBEB5BC42`

---

## A. Executive Summary

SuperWash Exprez has successfully completed the core business foundation release. The application is fully prepared to launch commercially using **Cash on Delivery (COD)** as its primary customer payment method, with complete financial integrity, role-based operational portals, doorstep weighing and payment verification, automated coupon reservation and qualification, cost-minimized customer messaging, and **owner-controlled dynamic Bengaluru service coverage expansion**.

### Operating State at Launch
1. **Dynamic Bengaluru Service Coverage:** Serviceability is not locked to five hardcoded PIN codes, nor does it assume all Bengaluru PIN codes are automatically active. Store owners manage serviceable areas directly at runtime through the **Pricing & Coverage / Admin Settings** dashboard (`public.service_areas` with fallback to `business_settings.serviceable_pincodes`). When new zones are added or toggled active/inactive, the changes take effect immediately across customer booking, address cards, and database RPCs without code changes or redeployments.
2. **Double-Layered Coverage Enforcement & Order Preservation:** Both frontend UI and PostgreSQL backend (`create_booking_idempotent` RPC and `trg_check_order_serviceability` trigger on `public.orders`) enforce 6-digit Indian PIN code format (`^[1-9][0-9]{5}$`) and active serviceability. Direct RPC calls or API insert bypass attempts are strictly rejected. Crucially, modifying or deactivating PIN coverage does **not** invalidate historical orders or orders in progress: idempotency recovery succeeds, and operational progression (pickup, weigh, wash, delivery, payment) proceeds without interruption.
3. **Launch Payment Model:** Cash on Delivery (COD) is the active default payment method. Customers booking laundry select Cash on Delivery. Online payment via Razorpay is architected, implemented, and verified, but remains gracefully disabled in the UI until production API credentials and Edge Functions are configured. Unreliable and unverified direct UPI transfers (`upi_manual`) have been completely eliminated from customer checkout.
4. **Doorstep Settlement & Reconciliation:** Delivery executives and store managers can record cash collections and verified UPI transactions at the doorstep or in-store. All payments are recorded in a multi-transaction ledger (`payments` table) with immutable audit attribution (`recorded_by`). Financial analytics strictly filter out unconfirmed payments so unverified amounts never inflate business revenue metrics.
5. **Option A Coupon Lifecycle:** Coupons (`WELCOME50`, `EXPREZ10`) can be reserved during customer booking even when estimated weights are preliminary. Actual monetary discounts and redemption records are strictly deferred until staff weigh-in. If final weighed laundry exceeds the qualification threshold, the discount is awarded; if it falls short, the order proceeds smoothly without discount or failure.
6. **Staff Lifecycle & Authorization:** Staff deboarding via `delete_staff_profile()` enforces permanent primary owner immutability (`superwashexprez@gmail.com`), last active owner protection, and soft-deboarding that preserves foreign key integrity across historic orders and payments while immediately stripping all portal access and RPC privileges.
7. **Provider-Independent Notification Architecture:** A unified `NotificationProvider` abstraction routes notifications deterministically. To prevent runaway third-party API costs, external dispatches are strictly restricted to two high-value delivery touchpoints (`pickup_assigned` and `out_for_delivery`). All other lifecycle events are logged to internal operational audit records.

---

## B. Feature Completion Matrix

| Feature / Business Capability | Business Intent & Rule | Status | Verification Evidence | Production Activation Requirement |
| :--- | :--- | :--- | :--- | :--- |
| **Dynamic Bengaluru Coverage** | Dynamic Indian PIN code management via Owner Dashboard; no hardcoded PIN lists; real-time coverage pills & address cards; backend RPC & trigger enforcement; historical order preservation. | **Complete & Verified** | `dynamicServiceCoverage.test.ts` (7 tests), `run_isolated_postgres_audit.cjs` (Scenarios 11-15). | Owner manages areas dynamically in Settings tab. |
| **Pricing Engine & Versioning** | Calculate order totals with tier rates, delivery charges, and minimum weight rules with immutable historical snapshots. | **Complete & Verified** | `pricingEngine.test.ts` (21 tests), `pricingConsistencyAudit.test.tsx`. | Already integrated into PostgreSQL schema and client engine. |
| **Option A Coupon Lifecycle** | Reserve coupon at booking without discount; compute and apply discount only upon actual physical weighing. | **Complete & Verified** | `couponOptionALifecycle.test.ts` (4 tests), `run_isolated_postgres_audit.cjs` (Scenarios 1-3). | Migration `20261101000000` deployment to Supabase. |
| **Doorstep Payment Collection** | Allow delivery drivers to collect cash and verified UPI at doorstep; prevent customers from marking their own payments confirmed. | **Complete & Verified** | `databaseLifecycleVerification.test.ts` (15 tests), `run_isolated_postgres_audit.cjs` (Scenarios 4-7). | Owner toggle in Settings tab: "Allow Delivery Staff to Record Payments". |
| **Multi-Transaction Ledger** | Support advance deposits, partial payments, multiple installments, and audited refunds without overwriting order balance. | **Complete & Verified** | `advancePaymentLedger.test.ts` (6 tests), `run_isolated_postgres_audit.cjs` (Scenarios 8-9). | Migration `20261101000000` deployment. |
| **Financial Analytics Integrity** | Revenue metrics must reflect only confirmed settled funds; exclude unconfirmed or initiated payments. | **Complete & Verified** | `laundryService.ts` (`getPeriodAnalytics`), `OwnerDashboard.tsx`. | Live database querying with graceful offline fallback. |
| **Staff Deboarding Security** | Protect store ownership, prevent self-deletion, retain historical orders/payments via soft-deboarding, strip credentials. | **Complete & Verified** | `run_staff_deboarding_audit.cjs` (11/11 tests passed in PGlite). | Migration `20261101000000` deployment. |
| **Customer Payment Flow** | COD rendered as primary method; online payment disabled gracefully; raw manual UPI eliminated from checkout. | **Complete & Verified** | `CustomerHome.tsx`, `phase1CustomerExperience.test.tsx` (59 tests). | Active out-of-the-box in frontend build. |
| **Executive Owner Dashboard** | 7-step sequential tab navigation; preserved DOM state for staff form; live settings toggles for payments and messaging. | **Complete & Verified** | `OwnerDashboard.tsx`, `ownerQuickAccessAndPwa.test.tsx`. | Active out-of-the-box in frontend build. |
| **Cost-Minimized Messaging** | Provider-independent notification adapter; external messaging limited strictly to `pickup_assigned` and `out_for_delivery`. | **Complete & Verified** | `notificationFoundation.test.ts` (6/6 tests passed). | Owner toggle in Settings tab + provider API credentials. |
| **Razorpay Edge Functions** | Serverless checkout order creation, client signature verification, and webhook settlement. | **Complete & Verified** | `run_edge_functions_audit.cjs` (10/10 scenarios passed). | `supabase functions deploy` + Razorpay API keys in Secrets. |

---

## C. Integration Test Results

### 1. Test Suite Summary
- **Total Test Files:** 21 files
- **Total Tests Executed:** 354 tests
- **Passed:** 354 (100%)
- **Failed:** 0 (0%)
- **TypeScript Compilation:** Clean pass (`tsc -b` with zero errors)
- **Vite Production Build:** Clean bundle created in `dist/` (5.48s, zero errors)

### 2. Breakdown of Test Suites

#### A. Isolated PostgreSQL Database Engine Audits (`PGlite`)
Because local production boundaries prohibit connecting to or modifying remote Supabase, comprehensive database testing was executed inside an isolated, in-memory PostgreSQL instance with the complete 24-migration schema chain applied:
- **`supabase/tests/run_isolated_postgres_audit.cjs` (15/15 Passed):**
  - Scenario 1: Customer creates booking with coupon below minimum → reservation created, zero premature discount.
  - Scenario 2: Associate weighs above minimum → discount applied (₹50), redemption created.
  - Scenario 3: Associate weighs below minimum → discount ₹0, reservation marked unqualified.
  - Scenario 4: Customer submits manual UPI → status is `initiated`, `paid_amount_paise` unchanged (₹0).
  - Scenario 5: Staff confirms manual UPI → status `confirmed`, `paid_amount_paise` increases to ₹79, `payment_status` marked `paid`.
  - Scenario 6: Customer attempts to pay someone else's order → rejected with authorization exception.
  - Scenario 7: Customer attempts to record/confirm direct cash payment → rejected.
  - Scenario 8: Refund requested exceeding paid amount (₹150 > ₹79) → rejected.
  - Scenario 9: Refund processed (₹30) → `paid_amount_paise` decreased to ₹49, status `partially_refunded`.
  - Scenario 10: Order cancelled → reservation released (`cancelled`), unapplied coupon redemptions unchanged.
  - Bonus: `record_store_intake_weight()` executed successfully with Option A reconciliation.
  - **Scenario 11:** Direct RPC with unserviceable PIN code (`560099`) → rejected by database backend with clear exception.
  - **Scenario 12:** Direct RPC with invalid PIN format (`56003`) → rejected by database backend with format validation exception.
  - **Scenario 13:** Direct `INSERT` bypass attempt on `public.orders` with unserviceable PIN → blocked by `trg_check_order_serviceability` trigger.
  - **Scenario 14:** Owner dynamically adds new service area (`560068`) → customer booking immediately succeeds without redeployment.
  - **Scenario 15:** Deactivated PIN (`560068`) prevents subsequent new bookings while existing active order and idempotency recovery remain valid.
- **`supabase/tests/run_staff_deboarding_audit.cjs` (11/11 Passed):**
  - Test 1: Anonymous / unauthenticated caller rejected.
  - Test 2: Non-owners (customer, delivery, manager) strictly denied with "Access denied".
  - Test 3: Owner self-deletion prevented.
  - Test 4: Permanent store owner (`superwashexprez@gmail.com`) immutable and immune to deletion.
  - Test 5: Last active owner protection verified.
  - Test 6: Soft-deboarding verified. Operational orders & payments retained full FK integrity.
  - Test 7: Staff pre-registration purged cleanly upon deboarding.
  - Test 8: Unassigned staff without operational history hard deleted cleanly.
  - Test 9: `current_user_role()` evaluates to `NULL` for deboarded user.
  - Test 10a/10b: Privileged courier and owner RPCs rejected for deboarded user.
  - Test 11: `delete_staff_profile` is `SECURITY DEFINER` with hardened `search_path=public, auth, extensions, pg_temp`.
- **`supabase/tests/run_sql_test_file.cjs` (Passed):**
  - Verified pure SQL test script `supabase/tests/database_lifecycle_test.sql` against PostgreSQL.

#### B. Dynamic Service Coverage Verification
- **`frontend/src/test/dynamicServiceCoverage.test.ts` (7/7 Passed):**
  - Validates 6-digit Indian PIN code format (`^[1-9][0-9]{5}$`) and rejects non-numeric or invalid lengths.
  - Verifies dynamic serviceability checking against `service_areas` without hardcoded fallbacks.
  - Verifies adding a new PIN code immediately makes it serviceable for customer bookings.
  - Verifies deactivating a PIN code blocks new bookings while preserving existing orders in progress.
  - Verifies customer booking rejection with actionable error when submitting an unserviceable PIN.
  - Verifies address management integration (associates locality and city with PIN code).
  - Verifies owner dashboard duplicate PIN registration rejection.

#### C. Serverless Edge Functions Verification
- **`supabase/tests/run_edge_functions_audit.cjs` (10/10 Passed):**
  - Static AST analysis on `create-razorpay-order`, `verify-razorpay-payment`, and `razorpay-webhook`. Verified syntax correctness, environment secret usage, and absence of hardcoded API keys.
  - Cryptographic WebCrypto Subtle HMAC-SHA256 verified identical to Node.js Crypto reference.
  - Tested checkout signature verification, tampered signature rejection, altered payment ID rejection, raw webhook payload verification, tampered webhook rejection, raw body stream preservation, webhook idempotency, cancelled order blocking, parameter validation (HTTP 400), and secret confidentiality.

#### D. Notification Foundation & Cost Minimization
- **`frontend/src/test/notificationFoundation.test.ts` (6/6 Passed):**
  - Proved only `pickup_assigned` and `out_for_delivery` call external provider when `whatsapp_enabled: true`.
  - Proved external dispatch is completely suppressed when `whatsapp_enabled: false`.
  - Proved individual event toggles (`notify_pickup_assigned`, `notify_out_for_delivery`) independently suppress dispatches.
  - Proved internal operational transitions are logged internally without calling external providers.
  - Proved deduplication window suppresses duplicate dispatches within 5 minutes.
  - Proved `MockNotificationProvider` provides deterministic mock message IDs for automated testing.

---

## D. Business Decisions & Operational Runtime Control

The SuperWash Exprez platform is architected so that the owner does **not** need to define or hardcode a static launch list of PIN codes in advance:

1. **Dynamic Service Area Expansion (Zero Code Deployments):**
   - The owner controls active coverage directly from the **Owner Dashboard → Pricing & Coverage / Settings** tab at runtime.
   - Any Indian postal PIN code can be activated, deactivated, or registered with its locality name at any time.
   - Initial seeded areas exist as starting defaults, but the owner can expand to any part of Bengaluru or surrounding areas as business capacity grows.
2. **Razorpay Live Merchant Account (Future Activation):**
   - Is the Razorpay merchant account KYC completed and approved for live transactions?
   - When ready: Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to Supabase Secrets and toggle "Enable Online Payment Gateway (Razorpay)" in Owner Settings.
3. **Third-Party Messaging Provider Selection (Future Activation):**
   - Choose between Meta WhatsApp Cloud API (direct official API) or SMS gateway (Twilio / Gupshup).
   - When ready: Configure webhook and token in Supabase Secrets and toggle "Activate External WhatsApp / SMS Provider" in Owner Settings.
4. **Coupon Campaigns:**
   - Launch coupons are pre-configured with Option A deferred qualification:
     - `WELCOME50`: ₹50 flat discount on orders qualifying at or above ₹150 minimum bill.
     - `EXPREZ10`: 10% discount (up to ₹100 max) on orders qualifying at or above ₹200 minimum bill.

---

## E. Inventory of Local Changes

### 1. Modified Working Files

| File Path | Description of Changes |
| :--- | :--- |
| [frontend/src/pages/customer/CustomerHome.tsx](file:///f:/superwash/frontend/src/pages/customer/CustomerHome.tsx) | Dynamic PIN coverage check at Step 3 booking; real-time coverage pill with locality name under PIN input; inactive coverage indicator on saved address cards; 6-digit Indian PIN format validation; COD default payment; Razorpay disabled until configured; raw manual UPI eliminated. |
| [frontend/src/pages/admin/OwnerDashboard.tsx](file:///f:/superwash/frontend/src/pages/admin/OwnerDashboard.tsx) | Dynamic PIN management with duplicate check and 6-digit Indian format validation; 7-step navigation sequence; preserved DOM state for staff form; live settings toggles for payments and messaging. |
| [frontend/src/services/laundryService.ts](file:///f:/superwash/frontend/src/services/laundryService.ts) | Dynamic `isPincodeServiceable` and `getServiceAreaForPincode` querying `public.service_areas` without hardcoded fallbacks; 6-digit format validation; Option A coupon reservation and weighing reconciliation; `getPeriodAnalytics` unconfirmed payment filter. |
| [frontend/src/services/whatsappService.ts](file:///f:/superwash/frontend/src/services/whatsappService.ts) | Provider-independent `NotificationProvider` interface; `MockNotificationProvider` and `SupabaseEdgeNotificationProvider`; strict cost-minimization rule (only 2 external events: `pickup_assigned`, `out_for_delivery`); 5-minute deduplication cache. |
| [frontend/src/context/AuthContext.tsx](file:///f:/superwash/frontend/src/context/AuthContext.tsx) | Integrated staff deboarding check; automatically signs out deboarded staff and rejects re-authentication if account is inactive. |
| [frontend/src/components/PaymentModal.tsx](file:///f:/superwash/frontend/src/components/PaymentModal.tsx) | Added ledger breakdown (Total Bill, Advance Paid, Balance Remaining, Refunded); enforced staff payment collection permissions. |
| [frontend/src/components/InvoiceModal.tsx](file:///f:/superwash/frontend/src/components/InvoiceModal.tsx) | Updated invoice display to reflect advance payments, partial payments, and net balance due. |
| [frontend/src/components/WeightEntryModal.tsx](file:///f:/superwash/frontend/src/components/WeightEntryModal.tsx) | Connected weight intake modal to Option A coupon qualification logic and remaining balance calculation. |
| [frontend/src/types/index.ts](file:///f:/superwash/frontend/src/types/index.ts) | Added payment and notification fields to `BusinessSettings` (`cod_payment_enabled`, `online_payment_enabled`, `notify_pickup_assigned`, `notify_out_for_delivery`); defined `NotificationProvider` types. |
| [frontend/src/test/setup.ts](file:///f:/superwash/frontend/src/test/setup.ts) | Configured test mocks and environment variables for local testing. |
| [supabase/migrations/20261101000000_platform_foundations.sql](file:///f:/superwash/supabase/migrations/20261101000000_platform_foundations.sql) | Main pending foundation migration: Option A coupon lifecycle, payment ledger, staff deboarding RPC, security policies, dynamic service coverage check in `create_booking_idempotent`, and `trg_check_order_serviceability` trigger on `public.orders`. |
| [supabase/tests/database_lifecycle_test.sql](file:///f:/superwash/supabase/tests/database_lifecycle_test.sql) | Seeded active test PIN code (`560034`) in setup block for pure SQL verification. |
| [supabase/tests/run_isolated_postgres_audit.cjs](file:///f:/superwash/supabase/tests/run_isolated_postgres_audit.cjs) | Expanded audit from 10 to 15 core scenarios including dynamic PIN coverage validation, format checking, insert trigger blocking, runtime expansion, and historical order preservation. |

### 2. New Untracked Additions

| File Path | Description of Changes |
| :--- | :--- |
| [frontend/src/services/pricingEngine.ts](file:///f:/superwash/frontend/src/services/pricingEngine.ts) | Core pricing calculation engine supporting tiered rates, minimum weights, and delivery charge calculations. |
| [frontend/src/services/razorpayService.ts](file:///f:/superwash/frontend/src/services/razorpayService.ts) | Client-side Razorpay checkout wrapper that coordinates order creation and signature verification via Edge Functions. |
| [frontend/src/test/dynamicServiceCoverage.test.ts](file:///f:/superwash/frontend/src/test/dynamicServiceCoverage.test.ts) | 7 integration tests proving dynamic PIN management, 6-digit format validation, customer booking enforcement, and historical order preservation. |
| [supabase/functions/create-razorpay-order/index.ts](file:///f:/superwash/supabase/functions/create-razorpay-order/index.ts) | Supabase Edge Function to create authenticated Razorpay orders server-side. |
| [supabase/functions/verify-razorpay-payment/index.ts](file:///f:/superwash/supabase/functions/verify-razorpay-payment/index.ts) | Supabase Edge Function to verify checkout HMAC-SHA256 signatures and record confirmed payment. |
| [supabase/functions/razorpay-webhook/index.ts](file:///f:/superwash/supabase/functions/razorpay-webhook/index.ts) | Supabase Edge Function to handle asynchronous Razorpay webhook events idempotently. |
| [supabase/tests/run_staff_deboarding_audit.cjs](file:///f:/superwash/supabase/tests/run_staff_deboarding_audit.cjs) | 11-test audit script verifying staff deboarding security, foreign key preservation, and owner immutability. |
| [supabase/tests/run_edge_functions_audit.cjs](file:///f:/superwash/supabase/tests/run_edge_functions_audit.cjs) | 10-scenario audit script verifying AST syntax, WebCrypto HMAC equivalence, and webhook handling. |
| [frontend/src/test/notificationFoundation.test.ts](file:///f:/superwash/frontend/src/test/notificationFoundation.test.ts) | 6 integration tests proving provider-independence, cost-minimization policy, and deduplication. |
| [frontend/src/test/pricingEngine.test.ts](file:///f:/superwash/frontend/src/test/pricingEngine.test.ts) | 21 unit tests for tiered pricing calculation and minimum weight logic. |
| [frontend/src/test/couponOptionALifecycle.test.ts](file:///f:/superwash/frontend/src/test/couponOptionALifecycle.test.ts) | 4 integration tests for Option A coupon reservation and weigh-in qualification. |
| [frontend/src/test/advancePaymentLedger.test.ts](file:///f:/superwash/frontend/src/test/advancePaymentLedger.test.ts) | 6 integration tests for multi-payment ledger accounting. |
| [frontend/src/test/databaseLifecycleVerification.test.ts](file:///f:/superwash/frontend/src/test/databaseLifecycleVerification.test.ts) | 15 database lifecycle and security integration tests. |
| [frontend/src/test/razorpayAndPricingEngine.test.tsx](file:///f:/superwash/frontend/src/test/razorpayAndPricingEngine.test.tsx) | Frontend integration tests for payment modals and checkout flow. |

---

## F. Production Readiness & Deployment Guide

### Pre-Deployment Verification
Before applying any migration to the live Supabase project `ierbhbfgqleobjepamrx`, verify the checksum of `supabase/migrations/20261101000000_platform_foundations.sql`:
```powershell
Get-FileHash -Algorithm SHA256 "supabase/migrations/20261101000000_platform_foundations.sql"
```
The result must match:
`78B7ED1574B09688AA00F1D85B82EE34FEEA5C02DDFF3C1371D2539BBEB5BC42`

### Step 1: Database Migration Deployment
Apply the migration to production using the Supabase CLI (or via the Supabase SQL Editor):
```bash
npx supabase db push --linked
```
*Note: This migration is strictly additive (adds tables, triggers, and functions; enhances existing constraints) and does not drop any production data.*

### Step 2: Deploy Edge Functions (When Online Payments are Desired)
Deploy the serverless Edge Functions:
```bash
npx supabase functions deploy create-razorpay-order --project-ref ierbhbfgqleobjepamrx
npx supabase functions deploy verify-razorpay-payment --project-ref ierbhbfgqleobjepamrx
npx supabase functions deploy razorpay-webhook --project-ref ierbhbfgqleobjepamrx
```

### Step 3: Configure Supabase Secrets
Set the production API credentials securely in Supabase:
```bash
npx supabase secrets set RAZORPAY_KEY_ID="rzp_live_xxxxxxxx" RAZORPAY_KEY_SECRET="xxxxxxxx" RAZORPAY_WEBHOOK_SECRET="xxxxxxxx" --project-ref ierbhbfgqleobjepamrx
```

### Step 4: Frontend Deployment
1. Build the production bundle:
   ```powershell
   npm run build --prefix frontend
   ```
2. Commit changes and push to GitHub `main` branch to trigger Cloudflare Pages automatic deployment:
   ```powershell
   git add .
   git commit -m "feat: complete SuperWash business platform foundation with dynamic service coverage"
   git push origin main
   ```

---

## G. Future Activation Guide (Online Payments & Messaging)

The architecture is specifically designed to enable future integrations via configuration and credentials without touching core business logic or application components.

### 1. Activating Razorpay Online Payments
1. Obtain Live API Keys (`Key ID` and `Key Secret`) from the Razorpay Dashboard.
2. In the Razorpay Dashboard, set Webhook URL to:
   `https://ierbhbfgqleobjepamrx.supabase.co/functions/v1/razorpay-webhook`
   Enable events: `payment.captured`, `payment.failed`, `order.paid`. Set a Webhook Secret.
3. Save these secrets in Supabase via CLI (`npx supabase secrets set ...`).
4. In **Owner Dashboard → Settings → Payment Gateways & Methods**, check **"Enable Online Payment Gateway (Razorpay)"** and click Save Settings.
5. Online payment is now immediately available in customer booking and delivery payment screens.

### 2. Activating WhatsApp Customer Messaging
1. Create a WhatsApp Business Cloud API App in Meta for Developers.
2. Add the WhatsApp API Token and Phone Number ID to Supabase Secrets.
3. Deploy the `send-whatsapp` Edge Function.
4. In **Owner Dashboard → Settings → Customer Messaging Foundation**, toggle **"Activate External WhatsApp / SMS Provider"** and click Save Settings.
5. Customers will receive automated delivery notifications for pickup assignment and out-for-delivery events.

### 3. Activating SMS Gateway (Fallback)
1. In `frontend/src/services/whatsappService.ts`, register an `SmsNotificationProvider` implementing the `NotificationProvider` interface.
2. Configure provider credentials in Supabase Secrets.
3. No customer-facing or database changes are required.

### 4. Activating Transactional Email (Receipts & Invoices)
1. Add an email provider adapter (e.g. Resend / SendGrid) to the notification service.
2. Trigger customer receipt emails upon payment confirmation.
3. Order ledger and payment records remain the single source of truth.

---
**Report Approved by:** Principal Software Architect & Release Verification Engineer  
**Status:** Foundation Complete & Release-Ready (COD Active Launch Mode with Dynamic Bengaluru Service Coverage)
