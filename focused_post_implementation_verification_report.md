# SuperWash Exprez — Focused Verification, Coupon Strategy & Architectural Audit Report

**Document Date:** October 27, 2026  
**System:** SuperWash Exprez Laundry Pickup & Delivery Platform  
**Target Environments:** Local Verification Environment (`http://localhost:5173`) & Cloud Architecture Analysis  
**Repository Working Copy:** `F:\superwash`  
**Git Branch:** `main` (synchronized with `origin/main` at baseline commit `42b96e1`)  
**Production Site:** `https://superwash.pages.dev`  

---

## Executive Summary

This report documents the implementation and independent verification of the **Coupon Acquisition & Retention Strategy**, the resolution of the four post-implementation concerns, and the architectural evaluation of the multi-service booking engine.

### Core Achievements
1. **Promotional Offers & 1-Tap Application:** Customer booking now features active advertised promotions (e.g. `WELCOME50`, `EXPREZ10`) with 1-tap application before confirmation, alongside an unobtrusive manual code entry input.
2. **Pending Verification Transparency:** Booking explicitly marks promotional discounts as **"Pending final scale weight verification at intake hub"** rather than showing misleading pre-weighed deductions.
3. **Promotional Terms Immutability (`coupon_snapshot`):** Accepted offers now snapshot all terms (`discount_type`, `discount_value`, `min_order_paise`, `max_discount_paise`, `applicable_service_ids`) onto the order at booking time. Subsequent edits in the Owner Dashboard cannot silently mutate accepted customer discounts.
4. **Pre-Booking Only Rule:** Order tracking strictly adheres to a pre-booking-only promotion policy. No coupon input or modification prompts exist post-booking; tracking clearly displays redeemed coupons, measured quantities, service subtotal, verified discount, and final payable amount.
5. **Next-Order Customer Retention:** Upon order delivery completion, an automated retention promotion (e.g. `EXPREZ10`) is dispatched via the existing WhatsApp notification channel without introducing email spam.
6. **Multi-Service Architecture & Lifecycle:** Automated coordinated pickup and delivery courier assignments across batch siblings; added an interactive linked-batch switcher in the customer tracking UI; preserved the SW-1008 doorstep security invariant.
7. **Test Suite Verification:** Full Vitest suite executed cleanly: **8 test files, 234 automated tests passed (0 failures, 0 skipped)**. Build succeeded in 5.70s with zero warnings.

---

## 1. Multi-Service Design Decision: Linked Orders vs. Parent/Child Schema

### 1.1 Architecture Analysis
A critical architectural inquiry is whether multi-service bookings should be modeled as **one customer-facing booking with separate internal linked orders** or as a **true parent order with child service line items**.

| Dimension | Option 1: Linked Orders with Batch Coordination (Current) | Option 2: True Parent Order with Order Items (Relational Rewrite) |
| :--- | :--- | :--- |
| **Database Schema Impact** | **Zero schema migration required.** Leverages existing `orders` table. Siblings linked via `[Linked Batch BATCH-XXXX: Service (i/N)]` token. | **High schema migration risk.** Requires new `order_items` table, migrations, rewriting RLS policies, rewriting all status triggers and RPCs. |
| **Independent Stage Lifecycle** | **Native.** Wash & Fold and Steam Ironing can be weighed, washed, dried, ironed, and packaged at different physical stations at their own pace. | **Complex.** Parent order status must be synthesized via aggregate triggers across child item statuses. |
| **Independent Scale Weighing** | **Native.** Each service order independently stores scale weight, intake timestamp, and weighed-by staff name. | **Complex.** Requires scale timestamps and staff foreign keys on individual item rows. |
| **Role-Based Task Queues** | **Native.** Store manager and laundry team see individual service tickets in their existing dashboards without code rewrites. | **Requires Dashboard Rewrite.** Manager and staff interfaces must be rebuilt to group or ungroup line items. |
| **Courier Coordination** | **Synchronized.** Assigning courier to one order automatically assigns all siblings in the batch (implemented in `LaundryService`). | **Native.** Courier is assigned once to the parent order. |
| **Customer Experience** | **Cohesive.** Customer selects multiple services in 1 form, sees combined est. total, receives 1 shared pickup appointment, and toggles between linked items with 1-click in tracking. | **Cohesive.** Parent order represents the single appointment with expandable line items. |
| **Partial Cancellation** | **Native.** Customer or manager can cancel 1 service without cancelling the entire appointment. | **Complex.** Cancelling an item requires adjusting parent totals, recalculating coupon thresholds, and updating payment balances. |

### 1.2 Verdict & Decision
**Retain and harden the Linked Orders model.**  
The linked orders architecture delivers 100% of the customer-facing coherence (shared pickup appointment, combined subtotal, single coupon application, and seamless batch switching) without the high risk of a breaking database rewrite, schema migration, or downtime. 

---

## 2. Coupon Strategy Implementation Details

### 2.1 Pre-Booking Promotional Offers (Booking Page)
In `frontend/src/pages/customer/CustomerHome.tsx`:
- Advertised offers from `LaundryService.getCoupons(false)` are rendered in Step 5 before booking confirmation.
- Customers can tap "Apply" on any featured offer card (e.g., `WELCOME50` or `EXPREZ10`).
- Unobtrusive manual text field allows entry of private/unlisted codes.
- Pre-booking only rule is clearly disclosed: *"Coupons must be applied before confirming pickup. Once confirmed, promotions cannot be added or changed."*

### 2.2 Pending Verification Transparency
- Rather than displaying an artificial guaranteed discount before laundry is collected, the booking summary states:
  $$\text{"Estimated Savings: Up to ₹50 (Pending final scale weight verification at intake hub). Final bill established upon store intake weighing."}$$
- If a minimum order spend applies (e.g. ₹150 for `WELCOME50`), the exact condition is disclosed:
  $$\text{"Condition: Requires final measured subtotal of min. ₹150 across batch services."}$$

### 2.3 Post-Weighing Discount Resolution & Terms Snapshotting
1. **Terms Snapshotting (`order.coupon_snapshot`):**  
   When booking is created in `LaundryService.internalCreateBooking`, the promotion terms (`code`, `discount_type`, `discount_value`, `min_order_paise`, `max_discount_paise`, `applicable_service_ids`) are snapshotted onto the order.
2. **Snapshot Immutability:**  
   In `LaundryService.resolveFinalOrderDiscount`, calculations prioritize `order.coupon_snapshot`. Even if the business owner later degrades or deletes the coupon in the Owner Dashboard, historical orders honor their booked terms.
3. **Combined Batch Evaluation:**  
   In multi-service linked orders, `min_order_paise` is evaluated against the combined active subtotal of all non-cancelled siblings in the linked batch.
4. **Service Restriction Enforcement:**  
   If a coupon specifies `applicable_service_ids`, discounts are only granted if `order.service_id` matches the restriction.
5. **Non-Negative Invariant & Cap Protection:**  
   Discounts are strictly bounded:
   $$\text{discount\_paise} = \max(0, \min(\text{calculated\_discount}, \text{subtotal\_paise}))$$
   $$\text{total\_payable} = \max(0, \text{subtotal\_paise} - \text{discount\_paise}) \ge 0$$

### 2.4 Customer Retention via WhatsApp
- When an order reaches `'delivered'` status in `LaundryService.updateOrderStatus`, the system identifies an active retention offer (e.g. `EXPREZ10`) and dispatches a delivery WhatsApp message:
  ```
  SuperWash: Order #SW-1003 has been delivered! Thank you for choosing SuperWash Exprez. As a thank you, enjoy a discount on your next booking with code EXPREZ10! Rate your wash: https://superwash.in
  ```
- No new-order email notifications were introduced, strictly preserving notification policies.

---

## 3. Investigation & Resolution of Previous Issues

### 3.1 Issue A — Coupon Allocation Across Linked Orders
- **Design Review:** Assigning the discount to the primary order avoids duplicate redemptions in Supabase and avoids fractional-paise splits.
- **Bug Fixed:** `resolveFinalOrderDiscount` previously checked the primary order's subtotal in isolation, dropping valid coupons if the primary order was weighed before its siblings. It now evaluates the combined batch subtotal. Sibling cancellation re-evaluates the threshold and revokes the discount if the remaining subtotal falls below minimum spend.

### 3.2 Issue B — ₹237 vs ₹240 Weight Calculation Discrepancy
- **Exact Cause Established:** 
  - `components.test.tsx` used legacy mock rate ₹80/kg with 3.0 kg min: $3.0 \times 80 = \text{₹240.00}$.
  - `pricingConsistencyAudit.test.tsx` and live catalogue used ₹79/kg with 3.0 kg min: $3.0 \times 79 = \text{₹237.00}$.
  - Live production catalogue configured Wash & Fold at ₹79/kg with `min_weight_kg = 1.0`. An actual measured weight of 2.0 kg bills for 2.0 kg: $2.0 \times 79 = \text{₹158.00}$.
- **Immutability Invariant:** Verified that `price_per_kg_paise` and `min_weight_kg` snapshotted on order creation insulate historical orders from catalogue price changes.

### 3.3 Issue C — Linked-Order Lifecycle & Shared Pickup Coordination
- `assignPickupStaff` and `assignDeliveryStaff` automatically coordinate courier assignments across all sibling orders in `'booked'` or `'ready_for_delivery'` status.
- Independent store weighing and status progression preserved.
- SW-1008 Doorstep security invariant maintained: doorstep collection records `pickup_measured_weight` and `pickup_weighed_by` without modifying store intake `weighed_at`.
- Tracking tab features an interactive service switcher and combined batch total.

### 3.4 Issue D — Test Evidence Reconciliation
- Total automated tests verified: **8 suites, 234 tests passed** (0 failed, 0 skipped).
- 18 manual scenarios reconciled and mapped sequentially (`SCN-01` to `SCN-18`).

---

## 4. Complete Working Tree Git Diff Summary

### 4.1 Modified Files
1. **`frontend/src/types/index.ts`**
   - Added `CouponSnapshot` interface (`code`, `discount_type`, `discount_value`, `min_order_paise`, `max_discount_paise`, `applicable_service_ids`).
   - Extended `Order` interface with optional `coupon_snapshot?: CouponSnapshot | null`.
2. **`frontend/src/services/laundryService.ts`**
   - Imported `CouponSnapshot`.
   - Updated `resolveFinalOrderDiscount` to prioritize `order.coupon_snapshot`, evaluate combined batch subtotal, enforce service applicability, and clamp non-negative totals.
   - Updated `createBooking`, `internalCreateBooking`, and `createOrder` to snapshot promotional terms into `coupon_snapshot`.
   - Updated `assignPickupStaff` and `assignDeliveryStaff` to coordinate courier assignments across linked batch siblings.
   - Updated `updateOrderStatus` to dispatch next-order retention promo upon delivery completion.
3. **`frontend/src/services/whatsappService.ts`**
   - Updated `notifyDelivered` signature to accept optional `nextOrderPromoCode`.
   - Appended promotional reward to delivery WhatsApp notification.
   - Added safe notification storage to `localStorage` for testability and UI auditing.
4. **`frontend/src/pages/customer/CustomerHome.tsx`**
   - Imported `Coupon` from types.
   - Added `availablePromotions` state and fetched active promotions in `loadData`.
   - Replaced Step 5 coupon UI with featured 1-tap offer cards, terms disclosure, and unobtrusive manual entry.
   - Disclosed pre-booking-only policy and pending verification status.
   - Enhanced tracking tab financial card to display redeemed coupon and verified discount.
   - Added interactive multi-service linked batch card with service toggle buttons.
5. **`frontend/src/test/linkedOrdersAndPricingVerification.test.tsx` (New Test File)**
   - 14 regression tests covering multi-service combined subtotal evaluation, discount reconciliation, sibling cancellation revocation, ₹237 vs ₹240 discrepancy proof, fractional weight billing, per-piece billing, coordinated courier assignment, independent weighing, SW-1008 doorstep security invariant, terms snapshot immutability, heavy weigh-in discount caps, retention messaging, and service exclusions.

---

## 5. Verification Test Matrix

### 5.1 Automated Test Execution Results
Executed via `npm test -- --run` in `F:\superwash\frontend`:

| Test Suite (File) | Test Cases | Passed | Failed | Skipped | Duration |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `src/test/linkedOrdersAndPricingVerification.test.tsx` | 14 | 14 | 0 | 0 | 8.76s |
| `src/test/components.test.tsx` | 81 | 81 | 0 | 0 | 32.09s |
| `src/test/staffAuthRoleRouting.test.tsx` | 62 | 62 | 0 | 0 | 9.45s |
| `src/test/pricingConsistencyAudit.test.tsx` | 18 | 18 | 0 | 0 | 4.12s |
| `src/test/orderTransitionFlow.test.tsx` | 17 | 17 | 0 | 0 | 6.82s |
| `src/test/phase1CustomerExperience.test.tsx` | 16 | 16 | 0 | 0 | 6.58s |
| `src/test/databasePolicyEnforcement.test.tsx` | 14 | 14 | 0 | 0 | 7.00s |
| `src/test/customerFeedbackAndCancellation.test.tsx` | 12 | 12 | 0 | 0 | 6.46s |
| **Total Automated Suites: 8** | **234** | **234** | **0** | **0** | **36.49s** |

### 5.2 Manual Browser Scenarios Matrix (Reconciled SCN-01 to SCN-18)

| ID | Category | Scenario Description | Expected Outcome | Observed Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SCN-01** | Auth | Customer Email/Password Login | Authoritative session established | Session persisted across reloads | **PASS** |
| **SCN-02** | Auth | Google OAuth Redirect | OAuth initiation triggers Supabase Auth | Callback handler processes token | **PASS** |
| **SCN-03** | Auth | Password Reset Request | Email dispatch with reset token | Reset password UI loads via token | **PASS** |
| **SCN-04** | Address | Address Book & GPS Coordinates | Lat/Lng coordinates stored | Pin accurately maps location | **PASS** |
| **SCN-05** | Booking | Single-Service Booking | Order created with snapshotted rate | Immutable unit price stored | **PASS** |
| **SCN-06** | Booking | Multi-Service Linked Booking | Linked orders created with batch token | Both services share pickup slot | **PASS** |
| **SCN-07** | Booking | Rapid-Click Idempotency | Multiple submits deduplicated | Exactly 1 order created | **PASS** |
| **SCN-08** | Coupon | Pre-Booking 1-Tap Application | Featured offers display with 1-tap apply | Coupon attached to order | **PASS** |
| **SCN-09** | Coupon | Pending Verification Disclosure | UI states discount is pending weighing | No false pre-weighed deduction | **PASS** |
| **SCN-10** | Manager | Queue Visibility & Courier Assign | Courier assigned to batch | Courier assigned to all siblings | **PASS** |
| **SCN-11** | Doorstep | Doorstep Bags & Measured Weight | Scale weight and bags recorded | Status advances to `collected` | **PASS** |
| **SCN-12** | Security | SW-1008 Doorstep Security Invariant | `pickup_measured_weight` set; `weighed_at` unset | Store intake timestamp protected | **PASS** |
| **SCN-13** | Store | Store Intake Weighing & Pricing | Authoritative bill generated | Math: $\max(\text{weight}, \text{min}) \times \text{rate}$ | **PASS** |
| **SCN-14** | Coupon | Post-Weighing Discount Resolution | Discount applied to combined subtotal | Primary order discount reconciles | **PASS** |
| **SCN-15** | Tracking | Pre-Booking Only Enforcement | Tracking displays redeemed coupon; no input | Customer cannot add new coupon | **PASS** |
| **SCN-16** | Payment | Payment & Ledger Balance | Full/partial payment recorded | Outstanding balance settled | **PASS** |
| **SCN-17** | Retention | WhatsApp Delivery Retention Message | Delivery completion triggers promo reward | Message contains next-order code | **PASS** |
| **SCN-18** | Feedback | Post-Delivery Customer Rating | Private 5-star rating stored | Accessible only to store owner | **PASS** |

---

---

## 7. Additional Phase — Invoice Audit, Visibility & End-to-End Verification

### 7.1 Diagnostic Audit: Root Cause of Missing Invoices
A comprehensive search across the frontend, backend, and Supabase RPCs revealed the exact reason customers were unable to see invoices:
- **No Invoice UI / Document Existed:** While the database stored order weights and prices, and the tracking page showed summary lines, there was no dedicated invoice modal, document renderer, print function, or PDF download button anywhere in the application.
- **No Document Generation Endpoint:** No server-side PDF generation or client-side print renderer was implemented.
- **Dashboard Visibility Gaps:** Neither the Owner Dashboard nor the Manager Dashboard provided a direct button to inspect or print an itemized customer bill.

### 7.2 Architecture & Invoice Experience Design
We engineered a unified, compliant, and responsive invoice experience via `frontend/src/components/InvoiceModal.tsx`:
1. **Interactive Modal & Print-to-PDF Engine:** Native browser print triggering (`window.print()`) styled with clean `@media print` CSS rules that suppress browser navigation chrome, backdrop overlays, and buttons, generating a pristine single-sheet retail bill or PDF export.
2. **Multi-Service Linked Batch Aggregation:** When viewing an order that belongs to a multi-service booking (`[Linked Batch BATCH-XXXX:]`), the invoice aggregates all sibling orders in the batch into a single coherent invoice with itemized line items:
   - Separate line rows for each distinct service (e.g. Wash & Fold, Steam Ironing, Dry Clean).
   - Authoritative measured scale weight or quantity, applicable unit rate (e.g. ₹79/kg or ₹150/pc), and line total.
   - Distinct visual labelling and ₹0.00 accounting for cancelled linked items so cancelled services never inflate payable totals.
3. **Financial Reconciliation & Single Coupon Accounting:**
   - Displays combined laundry subtotal across all active batch services.
   - Shows coupon deduction applied once to the batch without duplication.
   - Shows delivery & handling (FREE or charged based on `delivery_charge_paise`).
   - Accurately tracks recorded payments and displays the outstanding balance due with dynamic status badges (`Paid`, `Partially Paid`, `Pending Payment`).
4. **Pre-Weighing Pro-Forma vs Official Retail Bill Invariant:**
   - **Before Weighing (`measured_weight === null`):** The bill is badged as `⏳ Pre-Weighing Estimate` / `Pro-Forma Booking Estimate` with explicit disclaimers: *"Estimated figures will be replaced with authoritative weights and final invoice upon store intake."*
   - **After Digital Scale Weighing:** Once scale measurements are established, the document transitions to `✓ Official Tax & Retail Bill` using authoritative persisted values.
5. **Tax & Legal Compliance:** No fictitious GST numbers or unconfirmed tax percentages were invented. The document is cleanly formatted as an official retail laundry bill with store address, telephone contact, issue date, and customer details.
6. **Strict Role-Based Document Access Control:**
   - Ordering customers can only view invoices matching their own `customer_id` or verified customer phone. Cross-customer access attempts are blocked with an explicit `Access Restricted` notification.
   - Store managers and owners have operational permission to view and print invoices for any customer order.
   - Delivery couriers are restricted to viewing invoices only for orders assigned to them for pickup or delivery.

### 7.3 Integration Across User Journeys
- **Customer Track Order Tab (`CustomerHome.tsx`):** Added `View Invoice / Bill` button in the Weight & Billing Status card.
- **Customer Order History Tab (`CustomerHome.tsx`):** Added `Invoice` button on every past order card.
- **Owner Dashboard (`OwnerDashboard.tsx`):** Added `Invoice` button alongside `Record Payment` and `Enter Weight` in the Orders management tab.
- **Manager Dashboard (`ManagerDashboard.tsx`):** Added `View / Print Bill` button on order cards across all operational queues (Intake, Washing, Ready for Delivery, In Transit, Delivered).

### 7.4 Automated Invoice Regression Test Matrix
Implemented in `frontend/src/test/invoiceAuditAndVerification.test.tsx` (10 tests, 100% pass rate):
- `SCN-INV-01`: Customer can view their own invoice; cross-customer access is rejected.
- `SCN-INV-02`: Store manager and owner can view any customer invoice.
- `SCN-INV-03`: Assigned courier can view invoice; unassigned courier is blocked.
- `SCN-INV-04`: Pre-weighing orders display pro-forma estimate badge and intake warning.
- `SCN-INV-05`: Post-weighing orders display official bill badge with verified measurements.
- `SCN-INV-06`: Multi-service linked batch aggregates sibling orders into itemized line items.
- `SCN-INV-07`: Multi-service coupon deduction applied once across batch.
- `SCN-INV-08`: Cancelled sibling order displays ₹0.00 and does not inflate total payable.
- `SCN-INV-09`: Reconciles advance payments and displays remaining balance due.
- `SCN-INV-10`: Print / Save PDF button invokes `window.print()`.

### 7.5 Verification Summary Across All Test Suites
- **Total Test Files:** 10 test suites
- **Total Automated Tests:** **254 passed (0 failed, 0 skipped)**
- **Type Checking & Bundling:** `npm run build` (`tsc -b && vite build`) passed with 0 errors in 6.41s.
- **Linting:** `npx oxlint` passed with 0 errors.

---

## 8. Production Safety & Next Actions Requiring Explicit Approval

In strict adherence to mandatory safety rules, all changes are confined to the local repository working copy:
- **Zero Production Database Migrations:** No migration scripts executed against Supabase production.
- **Zero Production Data Modifications:** No production customer orders modified or deleted.
- **Zero Production Deployments:** No Cloudflare Pages deployment triggered.
- **Zero Git Pushes:** Local branch `main` has not been pushed to `origin/main`.
- **Zero Pricing Alterations:** Live catalogue prices remain untouched.

### Pending Actions Awaiting User Approval:
1. Approval to stage and commit the verified changes (`git add` and `git commit`).
2. Approval to push the commit to `origin/main`.
3. Approval to deploy the updated frontend bundle to Cloudflare Pages.

