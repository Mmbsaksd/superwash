# SUPERWASH EXPRESS — PRE-LAUNCH MANUAL TEST PLAN & REGRESSION SUITE

**Document ID:** `SW-TEST-PLAN-2026-10-28`  
**Application:** SuperWash Express (Laundry Pickup & Delivery Platform)  
**Target Release:** Pre-Launch Staging & Production Baseline  
**Verified Git Commit:** `3d70d58`  
**Primary Production URL:** `https://superwash.pages.dev`  
**Direct Immutable Deployment:** `https://4ed902c4.superwash.pages.dev`  
**Database Backend:** Supabase PostgreSQL 15 (`ierbhbfgqleobjepamrx`)  
**Target Public Launch Date:** November 1, 2026  
**Document Author:** Antigravity IDE Quality Assurance & Security Audit Team  

---

## 1. APPLICATION & ENVIRONMENT INVENTORY

### 1.1 Architecture Overview
SuperWash Express is a full-stack, real-time laundry logistics and management system tailored for the Indian urban retail market (specifically Bengaluru, Karnataka). The system enforces strict separation of concerns across four primary user personas, utilizes server-side PostgreSQL Row-Level Security (RLS) coupled with atomic `SECURITY DEFINER` Remote Procedure Calls (RPCs), and is deployed as a single-page application (SPA) on Cloudflare Pages.

```
+-----------------------------------------------------------------------------------+
|                           Cloudflare Pages Edge SPA                                |
|  https://superwash.pages.dev (Commit: 3d70d58, Bundle: assets/index-DpeifUpX.js)  |
+-----------------------------------------------------------------------------------+
           |                                                    |
           | Realtime WebSockets & REST API                     | Static Assets / CDN
           v                                                    v
+----------------------------------------------------+   +--------------------------+
|          Supabase Managed Backend (Postgres 15)     |   | Leaflet OpenStreetMap    |
|               ierbhbfgqleobjepamrx                 |   | QRServer UPI QR Code API |
|  - RLS Table Protection (Direct Writes Denied)     |   +--------------------------+
|  - Atomic Security Definer RPCs (Stage 5B Applied) |
|  - Supabase Auth (Google OAuth Provider)           |
+----------------------------------------------------+
```

### 1.2 Technology Stack
- **Frontend Framework:** React 19 / TypeScript 5.5 / Vite 5
- **Styling:** TailwindCSS 3.4 (with customized emerald/sky theme, print stylesheets, responsive grid)
- **Icons:** Lucide React
- **Maps:** Leaflet & React-Leaflet with OpenStreetMap tiles (Doorstep GPS geo-tagging)
- **Backend / Database:** Supabase PostgreSQL 15 with PostgREST
- **Authentication:** Supabase Auth (Google OAuth, OAuth PKCE redirect)
- **Deployment Platform:** Cloudflare Pages (Direct production alias `superwash.pages.dev`)
- **Real-time Engine:** Supabase Realtime Channels (PostgreSQL WAL change events)
- **Notifications:** Multi-stage dispatch (Supabase Edge Function / `public.notification_logs` audit trail)

### 1.3 Service Catalog & Pricing Rules (Authoritative)
- **Wash & Fold:** ₹79.00 / kg (7,900 paise / kg), Minimum billable weight: 1.00 kg.
- **Wash and Iron:** ₹79.00 / kg (7,900 paise / kg), Minimum billable weight: 1.00 kg.
- **Pickup & Delivery Fee:** Configurable via `public.business_settings` (Default: ₹0.00 / Free doorstep delivery).
- **Service Currency:** Indian Rupee (INR / ₹), represented internally in integer **paise** (1 INR = 100 paise) to prevent floating-point rounding drifts.

### 1.4 Active Promotional Coupons
1. **`WELCOME50`**:
   - Discount Type: Fixed amount (`₹50.00` / `5000 paise`)
   - Minimum Order Threshold: `₹150.00` (`15000 paise`)
   - Maximum Discount: `₹50.00`
   - Scope: Applicable across all services; first-time or repeat eligible.
2. **`EXPREZ10`**:
   - Discount Type: Percentage (`10%`)
   - Minimum Order Threshold: `₹200.00` (`20000 paise`)
   - Maximum Discount Cap: `₹100.00` (`10000 paise`)
   - Scope: Applicable across all services.

---

## 2. USER ROLES, ACCESS CONTROL & PRIVILEGE MATRIX

The application implements four distinct user roles stored in `public.profiles.role`:

| User Role | Route Scope | Navigation Capabilities | Permitted State Mutations | Prohibited Actions |
| :--- | :--- | :--- | :--- | :--- |
| **Public / Unauth** | `/`, `/how-it-works`, `/contact`, `/privacy`, `/terms`, `/login`, `/admin/login` | Browse marketing landing pages, view services, calculate estimates, view service area. | None (Read-only public metadata). | Accessing customer dashboard, manager dashboard, delivery dashboard, owner admin, viewing customer orders or invoices. |
| **Customer** | `/customer` (`tab=book`, `current`, `history`, `addresses`, `contact`) | Book pickups, select services, apply coupons, pin doorstep GPS location, track active orders, view invoices, submit star feedback, manage address book. | `create_booking_idempotent`, `update_order_location` (pending pickup), `save_customer_address`, `delete_customer_address`, `submit_feedback`. | Weighing orders, altering order status, editing staff assignments, modifying coupon rules, recording payments, viewing other customers' data. |
| **Delivery Executive** | `/delivery` | View assigned pickup and delivery tasks, inspect customer address/phone/landmark, capture doorstep weight. | `record_courier_pickup_collection` (doorstep weight & collection), `advance_order_workflow_status` (out_for_delivery -> delivered), `record_order_payment` (cash/UPI collection at doorstep), `update_delivery_notes_secure`. | Store scale intake weighing, reassigning staff, changing service pricing, cancelling orders, modifying coupon terms, viewing unassigned deliveries. |
| **Store Manager** | `/manager` | Full operational order queue, assign pickup/delivery couriers, operate authoritative store intake weighing scale, advance processing stages (washing, ready for delivery), process order cancellations. | `record_store_intake_weight`, `assign_order_courier`, `advance_order_workflow_status` (`washing`, `ready_for_delivery`), `cancel_order_with_batch_sync`, `record_order_payment`. | Modifying store settings, altering master pricing catalog, promoting/demoting staff roles, accessing owner P&L financial aggregations. |
| **Owner / Administrator** | `/admin` | Complete store oversight, manager functions, courier functions, business settings configuration, catalog pricing, coupon management, staff account role provisioning, revenue analytics. | All manager and delivery RPCs, `update_business_settings`, `manage_service_catalog`, `manage_coupons`, `manage_staff_roles`, `delete_test_records`. | None (Superuser operational role). |

---

## 3. FEATURE COVERAGE MATRIX

| Area | Feature | Route / Component | Supported Roles | Key User Actions | Test Case IDs |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Public Access** | Landing Page & Marketing | `/` (`LandingPage.tsx`) | Public | View hero, rate banner, 4-step workflow, Bangalore service area | `UI-001`, `UI-002` |
| **Public Access** | Informational Pages | `/how-it-works`, `/contact`, `/privacy`, `/terms` | Public | Inspect company policies, contact cards, FAQ items | `UI-003`, `UI-004` |
| **Auth** | Customer Sign In | `/login` (`LoginPage.tsx`) | Public -> Customer | Google OAuth single sign-on, post-login redirect | `AUTH-001`, `AUTH-002` |
| **Auth** | Staff Portal Sign In | `/admin/login` (`LoginPage.tsx`) | Public -> Staff | Dedicated staff portal login, role validation | `AUTH-003`, `AUTH-004` |
| **Auth** | Route Guard Protection | `ProtectedRoute.tsx` | All | Unauthenticated bounce to `/login?redirect=...`, role-mismatch blocking | `AUTH-005`, `AUTH-006` |
| **Booking** | Service Selection | `/customer?tab=book` | Customer | Toggle single or multiple services (Wash & Fold, Wash & Iron) | `BOOK-001`, `BOOK-002` |
| **Booking** | Slot & Date Selection | `/customer?tab=book` | Customer | Pick pickup calendar date (today/tomorrow) and operational slot | `BOOK-003`, `BOOK-004` |
| **Booking** | Address & Geotagging | `/customer?tab=book` | Customer | Select saved address, enter new address, browser GPS, Leaflet map pin | `BOOK-005`, `BOOK-006` |
| **Booking** | Promotional Coupons | `/customer?tab=book` | Customer | Apply `WELCOME50` / `EXPREZ10`, validate thresholds, live discount preview | `COUPON-001` - `COUPON-005` |
| **Booking** | Idempotent Submission | `/customer?tab=book` | Customer | Submit booking, debounce double-clicks, recover uncertain timeouts | `BOOK-007` - `BOOK-010` |
| **Customer Tracking** | Live Order Status | `/customer?tab=current` | Customer | Realtime status bar, driver info, doorstep/store weights, cancel order | `CUST-001` - `CUST-004` |
| **Customer Tracking** | Address Adjustment | `/customer?tab=current` | Customer | Update doorstep address or landmark while order is in `booked` status | `CUST-005` |
| **Customer History** | Historical Orders | `/customer?tab=history` | Customer | Search past orders, view completed receipts, submit star feedback | `CUST-006`, `CUST-007` |
| **Customer Invoice** | Digital Bill & Receipt | `InvoiceModal.tsx` | Customer, Staff | Inspect pre-weigh estimate vs final bill, line items, coupon, print | `INV-001` - `INV-008` |
| **Customer Feedback** | 5-Star Service Review | `FeedbackModal.tsx` | Customer | Submit ratings for pickup, washing, delivery with comment text | `CUST-008` |
| **Store Operations** | Intake Weighing Scale | `WeightEntryModal.tsx` | Manager, Courier | Enter measured kg, check billable kg (>= min), sync batch coupon | `WEIGH-001` - `WEIGH-010` |
| **Store Operations** | Order Management Queue | `/manager` (`ManagerDashboard.tsx`)| Manager | Filter orders, assign pickup/delivery drivers, advance washing stages | `MGR-001` - `MGR-008` |
| **Store Operations** | Order Cancellation | `/manager`, `/customer` | Manager, Customer | Cancel single or batch sibling orders, recalculate remaining coupon | `MGR-006`, `E2E-004` |
| **Delivery Mobile** | Driver Worklist | `/delivery` (`DeliveryDashboard.tsx`)| Delivery | Filter "My Pickups" and "My Deliveries", call customer, open maps | `COURIER-001` - `COURIER-004` |
| **Delivery Mobile** | Doorstep Collection | `/delivery` | Delivery | Record doorstep collection, enter portable scale weight, save notes | `COURIER-005`, `COURIER-006` |
| **Delivery Mobile** | Doorstep Delivery | `/delivery` | Delivery | Collect payment, record cash/UPI UTR, complete order delivery | `COURIER-007`, `COURIER-008` |
| **Financials** | Payment Recording | `PaymentModal.tsx` | Staff (Delivery/Mgr) | Record cash or manual UPI with 12-digit UTR, prevent overpayments | `PAY-001` - `PAY-008` |
| **Owner Admin** | Business Analytics | `/admin` (`OwnerDashboard.tsx`) | Owner | Revenue totals, cash vs UPI breakdown, order volume charts | `OWNER-001` - `OWNER-004` |
| **Owner Admin** | Catalog & System Config | `/admin` | Owner | Adjust price per kg, min weight, manage coupon codes, staff roster | `OWNER-005` - `OWNER-008` |
| **Security & RLS** | Privilege Enforcement | PostgreSQL Layer | System | Prevent direct table mutations, enforce RPC authorization checks | `SEC-001` - `SEC-010` |

---

## 4. DETAILED MANUAL TEST CASES

### 4.1 Authentication & Session Management (AUTH)

#### `AUTH-001`: Unauthenticated Route Guard Redirection
- **Role / Preconditions:** Unauthenticated visitor (guest / incognito browser).
- **Test Steps:**
  1. Directly navigate to `https://superwash.pages.dev/customer`.
  2. Directly navigate to `https://superwash.pages.dev/manager`.
  3. Directly navigate to `https://superwash.pages.dev/delivery`.
  4. Directly navigate to `https://superwash.pages.dev/admin`.
- **Expected Outcome:** User is immediately intercepted by `ProtectedRoute.tsx` and redirected to `/login?redirect=<target_route>` with clean state. No operational or customer records are leaked.
- **Severity / Impact:** P0 (Confidentiality & Access Control).

#### `AUTH-002`: Customer Login via Google OAuth
- **Role / Preconditions:** Public visitor with an active Google account.
- **Test Steps:**
  1. Navigate to `/login`.
  2. Verify the card displays "Customer Sign In" with Google button.
  3. Click "Continue with Google".
  4. Complete Google account consent.
- **Expected Outcome:** Supabase Auth issues JWT tokens; user profile is loaded from `public.profiles`. User is redirected to `/customer?tab=book`. If phone number is missing, the Onboarding Modal appears prompting for a 10-digit mobile number.
- **Severity / Impact:** P0 (Core Customer Entry).

#### `AUTH-003`: Staff Portal Login Screen
- **Role / Preconditions:** Public visitor navigating to staff administrative portal.
- **Test Steps:**
  1. Navigate to `/admin/login`.
  2. Verify dedicated Staff branding ("SuperWash Express Staff Portal").
  3. Verify role badges: "Store Manager", "Delivery Executive", "Store Owner".
  4. Click "Continue with Google".
- **Expected Outcome:** Google OAuth redirects back to Supabase callback. The application verifies `profile.role IN ('delivery', 'manager', 'owner')`. Upon successful match, user is directed to `/delivery`, `/manager`, or `/admin`. If an ordinary customer attempts to sign in via `/admin/login`, an access restricted warning is displayed.
- **Severity / Impact:** P1 (Role Segregation).

#### `AUTH-004`: Invalid / Non-Existent Route Fallback
- **Role / Preconditions:** Any user.
- **Test Steps:**
  1. Enter URL `https://superwash.pages.dev/invalid-route-xyz-404`.
  2. Press Enter.
- **Expected Outcome:** Application catches unknown path via React Router `path="*"` wildcard and redirects gracefully to `/` (Home) without white-screen or unhandled runtime exceptions.
- **Severity / Impact:** P3 (User Experience).

#### `AUTH-005`: Session Persistence Across Page Refreshes
- **Role / Preconditions:** Authenticated user (Customer or Staff).
- **Test Steps:**
  1. Log in to customer dashboard.
  2. Perform a hard browser refresh (`Ctrl + F5`).
- **Expected Outcome:** Supabase session restores from `localStorage`. Loading spinner shows briefly; user remains logged in on the active tab without being ejected to `/login`.
- **Severity / Impact:** P1 (Session Resilience).

#### `AUTH-006`: Logout & Clean Teardown
- **Role / Preconditions:** Authenticated user on dashboard.
- **Test Steps:**
  1. Click "Sign Out" button in the Navbar.
  2. Try navigating Back using browser history button.
- **Expected Outcome:** Local storage auth tokens are cleared, `currentUser` state set to null, user redirected to `/`. Clicking browser back does not reveal stale protected order data.
- **Severity / Impact:** P1 (Session Teardown).

---

### 4.2 Customer Booking & Coupon Workflows (BOOK & COUPON)

#### `BOOK-001`: Single-Service Standard Booking
- **Role / Preconditions:** Authenticated customer with valid phone number.
- **Test Steps:**
  1. Navigate to `/customer?tab=book`.
  2. Select "Wash & Fold" (₹79/kg).
  3. Select pickup date (Tomorrow) and pickup slot (Morning).
  4. Enter pickup address: "Flat 402, Green Glen Layout, Bellandur, Bangalore" with pincode "560103".
  5. Click "Confirm Booking".
- **Expected Outcome:**
  - `LaundryService.createBooking` invokes `create_booking_idempotent`.
  - Order is created with status `booked`.
  - Preliminary rate locked at 7,900 paise/kg, min weight 1.0 kg.
  - User redirected to `/customer?tab=current&confirmed=SW-...` displaying green confirmation card and order timeline.
- **Severity / Impact:** P0 (Core Revenue Path).

#### `BOOK-002`: Multi-Service Linked Batch Booking
- **Role / Preconditions:** Authenticated customer.
- **Test Steps:**
  1. On booking form, select **both** "Wash & Fold" and "Wash and Iron".
  2. Set pickup date and slot.
  3. Enter valid address and submit.
- **Expected Outcome:**
  - Two discrete order records are generated in `public.orders`, sharing a common batch identifier formatted as `[Linked Batch <UUID>: 2 services]`.
  - Customer tracking tab renders the orders linked together.
- **Severity / Impact:** P1 (Linked Service Architecture).

#### `BOOK-003`: Missing Mandatory Fields Validation
- **Role / Preconditions:** Authenticated customer.
- **Test Steps:**
  1. Leave address line blank.
  2. Attempt to submit booking.
- **Expected Outcome:** Client-side validation blocks submission; inline error alert appears: "Please enter your complete pickup address". No network request is dispatched.
- **Severity / Impact:** P2 (Form Usability).

#### `BOOK-004`: Invalid Pincode Rejection
- **Role / Preconditions:** Authenticated customer.
- **Test Steps:**
  1. Enter pincode `12345` (5 digits) or `999999` (non-serviceable area).
  2. Attempt to submit.
- **Expected Outcome:** System flags invalid Indian PIN format (must be 6 numeric digits) or alerts that location is currently outside active service clusters.
- **Severity / Impact:** P2 (Logistics Validation).

#### `BOOK-005`: Leaflet Interactive Map Pin Adjustment
- **Role / Preconditions:** Authenticated customer on booking tab.
- **Test Steps:**
  1. Click "Adjust Pin on Map" button.
  2. Map modal opens centering on Bangalore (12.9716, 77.5946).
  3. Drag pin to specific apartment entrance and click "Confirm Pin".
- **Expected Outcome:** Modal closes; latitude and longitude are updated in state; green feedback badge shows confirmed coordinates.
- **Severity / Impact:** P2 (Driver Geo-Location).

#### `BOOK-006`: Idempotency Replay & Network Retry Guard
- **Role / Preconditions:** Authenticated customer submitting booking.
- **Test Steps:**
  1. Simulate double-click on "Confirm Booking" button (rapid succession < 200ms).
  2. Check created orders in database.
- **Expected Outcome:** Frontend button enters loading state immediately on first click; `client_submission_id` is passed to `create_booking_idempotent`. Second call detects matching submission key and returns existing order without creating a duplicate order.
- **Severity / Impact:** P0 (Financial & Order Integrity).

#### `COUPON-001`: Percentage Discount (`EXPREZ10`) Qualification
- **Role / Preconditions:** Authenticated customer booking 2 linked services (preliminary estimate ₹79 * 2 = ₹158, or estimated weight >= 3 kg = ₹237).
- **Test Steps:**
  1. On booking form, enter coupon code `EXPREZ10`.
  2. Click "Apply Coupon".
- **Expected Outcome:**
  - If preliminary order value >= ₹200 (20,000 paise): Coupon is accepted; green badge indicates "10% discount applied (Up to ₹100)".
  - If preliminary order value < ₹200: Warning banner indicates "Minimum order value of ₹200 required for EXPREZ10".
- **Severity / Impact:** P1 (Promotion Logic).

#### `COUPON-002`: Fixed Discount (`WELCOME50`) Threshold
- **Role / Preconditions:** Customer booking service with subtotal < ₹150 vs >= ₹150.
- **Test Steps:**
  1. Single service with 1.0 kg preliminary estimate = ₹79.00.
  2. Enter `WELCOME50` and apply.
- **Expected Outcome:** Application informs customer: "Coupon WELCOME50 requires min order of ₹150. Your preliminary estimate is ₹79.00. Note: Coupon will be re-evaluated when final scale weight is measured."
- **Severity / Impact:** P1 (Promotional Invariant).

#### `COUPON-003`: Batch Sibling Discount Synchronization
- **Role / Preconditions:** Multi-service batch with `WELCOME50` applied. Store manager weighs Service 1 at 2.0 kg (₹158) and Service 2 at 1.0 kg (₹79). Total laundry charge = ₹237.
- **Test Steps:**
  1. Store manager saves weight for Service 1.
  2. Store manager saves weight for Service 2.
- **Expected Outcome:**
  - Combined batch subtotal = ₹237 >= ₹150 threshold.
  - `synchronize_batch_coupon_internal` distributes the ₹50.00 discount across active siblings without exceeding subtotal.
  - Batch total payable = ₹237 - ₹50 = ₹187.00.
- **Severity / Impact:** P0 (Financial Consistency).

---

### 4.3 Store Manager & Operational Intake Workflows (MGR & WEIGH)

#### `MGR-001`: Manager Operational Queue & Filtering
- **Role / Preconditions:** Authenticated Store Manager on `/manager`.
- **Test Steps:**
  1. Inspect order counts across tabs: "All", "Awaiting Pickup", "At Center / In Process", "Ready for Delivery", "Delivered", "Cancelled".
  2. Search for order by customer name or order number.
- **Expected Outcome:** Orders filter dynamically in real-time. Action buttons reflect permitted transitions for each order's specific status.
- **Severity / Impact:** P1 (Operational Usability).

#### `MGR-002`: Courier Assignment (Pickup & Delivery)
- **Role / Preconditions:** Order in `booked` status.
- **Test Steps:**
  1. Click "Assign Pickup" button.
  2. Modal opens listing active delivery staff.
  3. Select "Suresh Courier" and confirm.
- **Expected Outcome:**
  - RPC `assign_order_courier` executes.
  - Order status advances to `pickup_assigned`.
  - Assigned driver's name and ID appear on the order card and in customer tracking view.
- **Severity / Impact:** P1 (Logistics Pipeline).

#### `WEIGH-001`: Store Authoritative Intake Scale Weight Entry
- **Role / Preconditions:** Order collected and arrived at wash center (`collected` status).
- **Test Steps:**
  1. Click "Record Weight" button.
  2. Enter authoritative scale weight: `4.25` kg.
  3. Submit modal.
- **Expected Outcome:**
  - RPC `record_store_intake_weight` executes with `p_measured_weight = 4.25`.
  - Rate = 7,900 paise. Billable weight = 4.25 kg.
  - Calculated charge = `ROUND(4.25 * 7900)` = `33,575 paise` (`₹335.75`).
  - Order status transitions to `weighed` (or `washing`).
  - Invoice balance updates immediately.
- **Severity / Impact:** P0 (Core Financial Calculation).

#### `WEIGH-002`: Minimum Order Weight Boundary Condition
- **Role / Preconditions:** Order arrived at wash center.
- **Test Steps:**
  1. Enter measured scale weight: `0.40` kg (below 1.0 kg min threshold).
  2. Submit modal.
- **Expected Outcome:**
  - System records measured weight = `0.40` kg.
  - System applies minimum billable weight floor: `billable_weight = 1.00` kg.
  - Laundry charge calculated as `1.00 * 7900 = 7,900 paise` (`₹79.00`).
  - Explanation tag shown: "Min billable weight of 1.0 kg applied".
- **Severity / Impact:** P0 (Pricing Floor Invariant).

#### `WEIGH-003`: Invalid / Negative / Text Weight Rejection
- **Role / Preconditions:** Store manager entering weight.
- **Test Steps:**
  1. Enter `-2.5`, `0`, or `abc`.
  2. Attempt submission.
- **Expected Outcome:** Form validation blocks non-positive numbers with message: "Measured weight must be a positive number greater than 0 kg". Server RPC asserts `p_measured_weight > 0`.
- **Severity / Impact:** P1 (Data Validation).

#### `WEIGH-004`: Downward Reweigh Payment-Floor Protection
- **Role / Preconditions:** Order weighed at 5.0 kg (Total: ₹395.00). Customer pays ₹300.00 partial payment. Store manager attempts to reweigh order downward to 2.0 kg (Total: ₹158.00).
- **Test Steps:**
  1. Open weight entry modal for the partially paid order.
  2. Enter `2.0` kg and submit.
- **Expected Outcome:** RPC `record_store_intake_weight` rejects the mutation with an error: "Cannot reduce billable amount (₹158.00) below recorded payments (₹300.00). Issue a customer refund before adjusting weight downward."
- **Severity / Impact:** P0 (Financial Anti-Tampering).

#### `MGR-006`: Safe Order Cancellation
- **Role / Preconditions:** Order in `booked` or `pickup_assigned` status.
- **Test Steps:**
  1. Click "Cancel Order".
  2. Enter cancellation reason: "Customer requested cancellation via phone".
  3. Confirm cancellation.
- **Expected Outcome:**
  - Status transitions to `cancelled`.
  - If part of a linked batch, sibling orders re-evaluate coupon qualification.
  - Cancelled order cannot be weighed or advanced further.
- **Severity / Impact:** P1 (Order Lifecycle).

---

### 4.4 Courier & Doorstep Delivery Workflows (COURIER)

#### `COURIER-001`: Courier Workload Isolation
- **Role / Preconditions:** Authenticated as Courier A (`dream7736952543@gmail.com`).
- **Test Steps:**
  1. Navigate to `/delivery`.
  2. Inspect assigned tasks.
- **Expected Outcome:** Courier sees only tasks where `assigned_pickup_id = auth.uid()` or `assigned_delivery_id = auth.uid()`. Tasks assigned to Courier B are not visible or editable.
- **Severity / Impact:** P1 (Role Privilege Separation).

#### `COURIER-002`: Doorstep Collection & Portable Scale Weight
- **Role / Preconditions:** Assigned order in `pickup_assigned` status.
- **Test Steps:**
  1. Courier arrives at customer premises.
  2. Weighs clothes with portable luggage scale: `3.50` kg.
  3. Enters `3.50` kg and clicks "Mark Collected".
- **Expected Outcome:**
  - RPC `record_courier_pickup_collection` executes.
  - `pickup_measured_weight` set to `3.50` kg.
  - Status updates to `collected`.
  - Customer receives notification / timeline reflects driver collection.
- **Severity / Impact:** P1 (Doorstep Auditability).

#### `COURIER-003`: Delivery Completion & Delivery Notes
- **Role / Preconditions:** Order in `out_for_delivery` status.
- **Test Steps:**
  1. Courier delivers clean laundry package.
  2. Enters delivery notes: "Handed over to security guard at Block B gate".
  3. Clicks "Complete Delivery".
- **Expected Outcome:**
  - Status transitions to `delivered`.
  - Delivery notes are saved via `update_delivery_notes_secure`.
  - Order timeline marks completion timestamp.
- **Severity / Impact:** P1 (Delivery Proof).

---

### 4.5 Financials, Billing & Payment Invariants (INV & PAY)

#### `INV-001`: Pre-Weigh Estimate vs Final Bill Header
- **Role / Preconditions:** Order viewed in `InvoiceModal.tsx`.
- **Test Steps:**
  1. Open invoice for order in `booked` status (unweighed).
  2. Open invoice for order in `weighed` status (authoritative weight recorded).
- **Expected Outcome:**
  - Unweighed order displays amber badge: **"PRELIMINARY ESTIMATE"** with disclaimer: "Final bill will be calculated after precision weighing at the wash center".
  - Weighed order displays emerald badge: **"TAX INVOICE / FINAL BILL"** with formal invoice number, weight itemization, and balance due.
- **Severity / Impact:** P1 (Customer Billing Clarity).

#### `PAY-001`: Cash Payment Recording
- **Role / Preconditions:** Order weighed with balance of ₹395.00. Staff opens `PaymentModal.tsx`.
- **Test Steps:**
  1. Select payment method: "Cash".
  2. Enter amount: `395.00`.
  3. Click "Record Payment".
- **Expected Outcome:**
  - RPC `record_order_payment` executes with `39500 paise`.
  - `paid_amount_paise` becomes `39500`.
  - `payment_status` updates to `paid`.
  - Outstanding balance becomes `₹0.00`.
- **Severity / Impact:** P0 (Cash Accounting).

#### `PAY-002`: Manual UPI Payment with 12-Digit UTR
- **Role / Preconditions:** Order with balance of ₹250.00.
- **Test Steps:**
  1. Select payment method: "Manual UPI".
  2. Leave UTR reference blank and click submit.
  3. Enter 12-digit UTR `123456789012` and submit.
- **Expected Outcome:**
  - Step 2 is rejected: "Please enter the UPI 12-digit UTR or Transaction reference number".
  - Step 3 succeeds: Payment record stored with `transaction_reference = '123456789012'`.
- **Severity / Impact:** P1 (UPI Reconciliation).

#### `PAY-003`: Duplicate UTR Reuse Prevention Across Orders
- **Role / Preconditions:** Order 1 paid with UTR `432109876543`.
- **Test Steps:**
  1. Staff opens payment modal for Order 2.
  2. Enters identical UTR `432109876543`.
  3. Attempts to record payment.
- **Expected Outcome:** System detects duplicate transaction reference and rejects: "Duplicate payment: UPI transaction reference 432109876543 has already been recorded for Order #SW-...".
- **Severity / Impact:** P0 (Fraud Prevention).

#### `PAY-004`: Overpayment Prevention Guard
- **Role / Preconditions:** Order with balance of ₹158.00.
- **Test Steps:**
  1. Attempt to record payment of `₹200.00`.
- **Expected Outcome:** Client and server reject: "Payment amount (₹200.00) exceeds the remaining balance of ₹158.00".
- **Severity / Impact:** P0 (Financial Invariant).

---

### 4.6 Authorization, RLS & Negative Security Tests (SEC)

#### `SEC-001`: Direct Table Mutation Privilege Revocation
- **Role / Preconditions:** Authenticated customer or courier session connecting to PostgREST.
- **Test Steps:**
  1. Attempt direct REST query: `PATCH /rest/v1/orders?id=eq.<id>` with body `{"discount_paise": 99999}`.
  2. Attempt direct REST query: `UPDATE public.orders SET measured_weight = 100`.
- **Expected Outcome:** PostgREST returns HTTP 403 Forbidden or PostgreSQL error `42501 permission denied for table orders`. Direct table updates are revoked from `authenticated` in Stage 5B.
- **Severity / Impact:** P0 (Database Security Barrier).

#### `SEC-002`: Cross-Customer Order Isolation (IDOR)
- **Role / Preconditions:** Customer A authenticated. Order belongs to Customer B.
- **Test Steps:**
  1. Customer A attempts to fetch `GET /rest/v1/orders?id=eq.<CustomerB_Order_ID>`.
  2. Customer A opens `/customer?confirmed=<CustomerB_Order_Number>`.
- **Expected Outcome:**
  - Query 1 returns empty array `[]` (RLS denies row visibility).
  - Test 2 checks ownership in `CustomerHome.tsx`: session storage and query params are purged, displaying "Order not found or belongs to another account".
- **Severity / Impact:** P0 (Privacy & Data Segregation).

#### `SEC-003`: Customer Attempting Manager State Transition RPC
- **Role / Preconditions:** Authenticated customer executing RPC.
- **Test Steps:**
  1. Dispatch RPC `advance_order_workflow_status` or `record_store_intake_weight`.
- **Expected Outcome:** RPC executes security check `public.current_user_role() IN ('manager', 'owner')` and raises exception: `Unauthorized: Only store managers or owners can advance this stage`.
- **Severity / Impact:** P0 (Privilege Escalation Guard).

---

## 5. COMPLETE CROSS-ROLE BUSINESS JOURNEYS (E2E)

### Journey 1: Standard Retail Order (Single Service)
```
[Customer] Books 1 service (Wash & Fold) at ₹79/kg -> Status: 'booked'
     |
[Manager] Inspects queue, assigns Courier A -> Status: 'pickup_assigned'
     |
[Courier A] Visits doorstep, logs 3.2 kg portable weight, marks collected -> Status: 'collected'
     |
[Manager] Receives laundry at store, logs 3.2 kg precision weight -> Status: 'weighed' (Total: ₹252.80)
     |
[Manager] Sends order to wash -> Status: 'washing' -> Completes wash -> Status: 'ready_for_delivery'
     |
[Manager] Assigns Courier A for delivery -> Status: 'delivery_assigned'
     |
[Courier A] Picks up package -> Status: 'out_for_delivery'
     |
[Courier A] Collects ₹253.00 via UPI QR (UTR: 987654321098), marks delivered -> Status: 'delivered'
     |
[Customer] Views updated dashboard, checks Tax Invoice, submits 5-star review.
```

### Journey 2: Multi-Service Booking with Fixed Coupon (`WELCOME50`)
1. Customer selects Wash & Fold (preliminary 1.0 kg) and Wash & Iron (preliminary 1.0 kg).
2. Customer applies `WELCOME50`. System creates batch with 2 sibling orders.
3. At wash center, Manager weighs Service 1 at 2.0 kg (₹158) and Service 2 at 1.5 kg (₹118.50).
4. Combined batch subtotal = ₹276.50 >= ₹150 threshold.
5. System allocates ₹50 discount proportionally or sequentially across siblings.
6. Final batch total payable = ₹226.50.
7. Verification: Sum of sibling discounts exactly equals ₹50.00; total bill balances perfectly.

### Journey 3: Partial Payment & Downward Reweigh Guard
1. Order weighed at 4.0 kg (₹316.00).
2. Customer pays ₹200.00 advance via UPI. Outstanding balance = ₹116.00.
3. Manager discovers one item belongs to another batch and attempts to adjust weight to 1.5 kg (₹118.50).
4. System blocks weight update because calculated total (₹118.50) is less than already recorded payment (₹200.00).
5. Manager is forced to process accounting refund before downward reweighing.

### Journey 4: Multi-Service Cancellation & Coupon Rebalance
1. Customer books 2 services with `WELCOME50` (requires ₹150).
2. Sibling A weighed at 1.5 kg (₹118.50).
3. Sibling B is cancelled before processing.
4. Remaining active batch value (₹118.50) falls below ₹150 threshold.
5. Sibling A re-evaluates coupon: `WELCOME50` becomes ineligible; discount reset to ₹0.
6. Sibling A total payable becomes ₹118.50.

---

## 6. FINANCIAL CALCULATION TEST VECTORS (15 SCENARIOS)

All calculations follow the Stage 5B PostgreSQL arithmetic standard in integer paise:

| # | Service Name | Measured Weight | Price / kg | Raw Subtotal | Min Wt Floor | Coupon Code | Coupon Rule | Calc Discount | Delivery Fee | Total Payable (Paise) | Total Payable (INR) | Payment Recorded | Remaining Balance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **V01** | Wash & Fold | 1.00 kg | 7,900 p | 7,900 p | 1.00 kg | None | None | 0 p | 0 p | **7,900 p** | **₹79.00** | 0 p | ₹79.00 |
| **V02** | Wash & Fold | 0.50 kg | 7,900 p | 3,950 p | 1.00 kg | None | Floor applied | 0 p | 0 p | **7,900 p** | **₹79.00** | 0 p | ₹79.00 |
| **V03** | Wash & Iron | 2.50 kg | 7,900 p | 19,750 p | 1.00 kg | None | None | 0 p | 0 p | **19,750 p** | **₹197.50** | 0 p | ₹197.50 |
| **V04** | Wash & Fold | 2.00 kg | 7,900 p | 15,800 p | 1.00 kg | `WELCOME50` | Fixed ₹50 (Min ₹150) | 5,000 p | 0 p | **10,800 p** | **₹108.00** | 0 p | ₹108.00 |
| **V05** | Wash & Fold | 1.80 kg | 7,900 p | 14,220 p | 1.00 kg | `WELCOME50` | Min ₹150 unmet | 0 p | 0 p | **14,220 p** | **₹142.20** | 0 p | ₹142.20 |
| **V06** | Wash & Iron | 3.00 kg | 7,900 p | 23,700 p | 1.00 kg | `EXPREZ10` | 10% (Min ₹200) | 2,370 p | 0 p | **21,330 p** | **₹213.30** | 0 p | ₹213.30 |
| **V07** | Wash & Fold | 15.00 kg | 7,900 p | 1,18,500 p | 1.00 kg | `EXPREZ10` | 10% capped at ₹100 | 10,000 p | 0 p | **1,08,500 p** | **₹1,085.00** | 0 p | ₹1,085.00 |
| **V08** | Batch Sibling 1 | 2.00 kg | 7,900 p | 15,800 p | 1.00 kg | `WELCOME50` | Sibling 1 part | 2,500 p | 0 p | **13,300 p** | **₹133.00** | 0 p | ₹133.00 |
| **V09** | Batch Sibling 2 | 2.00 kg | 7,900 p | 15,800 p | 1.00 kg | `WELCOME50` | Sibling 2 part | 2,500 p | 0 p | **13,300 p** | **₹133.00** | 0 p | ₹133.00 |
| **V10** | Wash & Fold | 4.00 kg | 7,900 p | 31,600 p | 1.00 kg | None | None | 0 p | 0 p | **31,600 p** | **₹316.00** | 10,000 p | **₹216.00** |
| **V11** | Wash & Iron | 4.00 kg | 7,900 p | 31,600 p | 1.00 kg | None | None | 0 p | 0 p | **31,600 p** | **₹316.00** | 31,600 p | **₹0.00** |
| **V12** | Batch Re-sync | 1.00 kg | 7,900 p | 7,900 p | 1.00 kg | `WELCOME50` | Sibling cancelled | 0 p | 0 p | **7,900 p** | **₹79.00** | 0 p | ₹79.00 |
| **V13** | Custom Delivery | 2.00 kg | 7,900 p | 15,800 p | 1.00 kg | None | Delivery ₹30 | 0 p | 3,000 p | **18,800 p** | **₹188.00** | 0 p | ₹188.00 |
| **V14** | Exact Threshold | 1.8987 kg | 7,900 p | 15,000 p | 1.00 kg | `WELCOME50` | Exactly ₹150 min | 5,000 p | 0 p | **10,000 p** | **₹100.00** | 0 p | ₹100.00 |
| **V15** | Precision Round | 1.33 kg | 7,900 p | 10,507 p | 1.00 kg | None | Rounded to paise | 0 p | 0 p | **10,507 p** | **₹105.07** | 0 p | ₹105.07 |

---

## 7. EXTERNAL INTEGRATIONS AUDIT & PREREQUISITES

| Integration | Intended Production Behavior | Fallback / Safe Test Mode | Launch Readiness Status |
| :--- | :--- | :--- | :--- |
| **Supabase Google OAuth** | Single sign-on for customers and staff using Google identities. Redirects to `/customer` or staff dashboard. | Works via Supabase Auth client. In live deployment, external Google Cloud Console OAuth Consent screen must authorize the domain `https://superwash.pages.dev`. | **READY / LIVE CONFIG REQUIRED** |
| **WhatsApp Notifications** | Transactional business updates dispatched via WhatsApp Business API upon booking, collection, weighing, delivery. | Graceful fallback implemented in `WhatsAppService.ts`: when Edge function is unconfigured, logs notification safely to `public.notification_logs` without failing UI. | **READY (GRACEFUL LOGGING)** |
| **UPI QR Codes** | Dynamic BharatQR generated via `api.qrserver.com` containing UPI intent string (`upi://pay?pa=...&am=...`). | Fully functional test-safe display; delivery agent scans QR on customer's phone or customer scans driver screen. | **READY & OPERATIONAL** |
| **Leaflet Maps / OSM** | Interactive doorstep pin positioning and coordinate capture using OpenStreetMap tiles. | Fallback to manual address input and browser HTML5 Geolocation API. | **READY & OPERATIONAL** |
| **PWA Service Worker** | Offline caching, home-screen installation prompt, and mobile app-like standalone display. | Fully implemented via `PwaInstallPrompt.tsx` with web app manifest. | **READY & OPERATIONAL** |

---

## 8. TEST DATA SAFETY & CLEANUP PROTOCOL

1. **Prefix Standard:** All synthetic test bookings, customers, addresses, and transactions must be prefixed with `E2E-TEST-` or `TEST-`.
2. **Contact Isolation:** Never use real customer phone numbers or email addresses for test records. Use sandbox phone range `9999900000` to `9999999999` and `@example.com` domains.
3. **Financial Protection:** Never execute real monetary transactions. All payments tested must use simulated cash or test UTR references.
4. **Targeted Cleanup:** At the conclusion of test cycles, remove only records matching the synthetic test prefix via authorized cleanup queries or API calls. Never execute `TRUNCATE` or drop operational tables.
