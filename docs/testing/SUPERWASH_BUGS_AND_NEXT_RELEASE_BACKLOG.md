# SUPERWASH EXPRESS — BUGS, DEFECTS & PRE-LAUNCH RELEASE BACKLOG

**Audit Date:** October 28, 2026  
**Target Launch Date:** November 1, 2026  
**Document ID:** `SW-BACKLOG-2026-10-28`  
**Status:** Actionable Pre-Launch Engineering & Product Backlog  

---

## 1. BACKLOG EXECUTIVE SUMMARY

During the comprehensive end-to-end manual and security audit of SuperWash Express (`https://superwash.pages.dev`, commit `3d70d58`), the application was evaluated across functional workflows, database RPC invariants, user role isolation, and edge cases.

- **Total Items Logged:** 7
- **P0 (Critical Launch Blockers):** 0
- **P1 (Major Pre-Launch Prerequisites):** 2
- **P2 (Usability & Defense-in-Depth Improvements):** 4
- **P3 (Minor Polish & Future Enhancements):** 1

No critical data-integrity, financial-calculation, or RLS-bypass defects exist in the deployed Stage 5B build. The two P1 items pertain to external cloud configuration (Google OAuth live consent domain verification) and WhatsApp transactional token configuration, which are standard operational requirements prior to public customer onboarding.

---

## 2. PRIORITIZED DEFECT & RELEASE GAP BACKLOG

### Item 1: `GAP-AUTH-01` — Google OAuth Authorized Redirect URI in Google Cloud Console
- **Category:** Infrastructure / Authentication
- **Severity:** **P1** (Pre-Launch Operational Prerequisite)
- **Affected Role / Feature:** Public, Customer, Staff (`/login`, `/admin/login`)
- **Blocks Launch:** **YES** (Must be configured in Google Cloud Console before real customers sign in)
- **Description:**
  Supabase Auth is configured to use Google OAuth provider. In production, Google Cloud Console requires the production domain `https://superwash.pages.dev` and the Supabase callback URI `https://ierbhbfgqleobjepamrx.supabase.co/auth/v1/callback` to be explicitly registered under "Authorized JavaScript origins" and "Authorized redirect URIs" in the GCP OAuth Client Credentials.
- **Reproduction Steps:**
  1. Open `https://superwash.pages.dev/login`.
  2. Click "Continue with Google".
  3. If the GCP project OAuth screen is in "Testing" mode or missing the Cloudflare domain, Google returns error: `redirect_uri_mismatch` or restricts sign-ins to test email addresses.
- **Expected Behavior:** Any public customer with a valid Google account can sign in smoothly without encountering OAuth consent warnings or domain mismatch errors.
- **Business Impact:** High — customers cannot sign in or complete bookings without Google account authentication.
- **Recommended Action:**
  1. Access Google Cloud Console -> APIs & Services -> Credentials.
  2. In the OAuth 2.0 Client ID for SuperWash:
     - Add Authorized JavaScript Origin: `https://superwash.pages.dev`
     - Add Authorized Redirect URI: `https://ierbhbfgqleobjepamrx.supabase.co/auth/v1/callback`
  3. In OAuth Consent Screen, verify the app status is set to "Production" (or publish app) so non-test users are not blocked.
- **Acceptance Criteria:** A clean, unlisted Google account can click "Continue with Google" on `https://superwash.pages.dev` and complete authentication into `/customer`.

---

### Item 2: `GAP-INT-01` — Production WhatsApp API Token Configuration
- **Category:** External Integration / Notifications
- **Severity:** **P1** (Customer Communication Prerequisite)
- **Affected Role / Feature:** Customer, Delivery, Manager (`WhatsAppService.ts`)
- **Blocks Launch:** Conditional (Application currently falls back gracefully to `public.notification_logs`, but live customer SMS/WhatsApp messages require provider keys)
- **Description:**
  `WhatsAppService.ts` implements a resilient architecture: it first attempts to call Supabase Edge Function `send-whatsapp`. If unconfigured, it logs the message to `public.notification_logs` and continues without failing the UI. To deliver live messages to customer smartphones in production, the WhatsApp Cloud API secrets (`WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) must be provisioned in the Supabase project vault.
- **Expected Behavior:** When an order is confirmed, weighed, or dispatched for delivery, the customer receives an automated WhatsApp transactional message on their mobile phone.
- **Actual Behavior:** Message is recorded in PostgreSQL `public.notification_logs` with status `logged`, but no external message reaches the phone.
- **Business Impact:** Medium — orders progress smoothly, but customers must view tracking online rather than via WhatsApp push notifications.
- **Recommended Action:**
  1. Register a Meta WhatsApp Business account for SuperWash Express.
  2. Deploy Supabase Edge Function `send-whatsapp`.
  3. Add `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` to Supabase Project Secrets.
- **Acceptance Criteria:** Live customer receives transactional booking confirmation message on WhatsApp within 30 seconds of booking.

---

### Item 3: `SEC-UI-01` — Defense-in-Depth Prop Guard in `InvoiceModal.tsx`
- **Category:** Security / Usability
- **Severity:** **P2** (Important Non-Critical Improvement)
- **Affected Role / Feature:** Customer, Public (`InvoiceModal.tsx`)
- **Blocks Launch:** NO (Protected by parent component and database RLS)
- **Description:**
  In `frontend/src/components/InvoiceModal.tsx` (line 35):
  ```typescript
  if (!isOwnerOrManager && !isDeliveryStaff && !isAuthorizedCustomer && currentUser) {
    return <AccessRestrictedModal />;
  }
  ```
  The guard condition ends with `&& currentUser`. If the component is rendered while `currentUser` is `null` (e.g., if an unauthenticated user somehow triggers the invoice modal in an unexpected state), the condition evaluates to `false` and falls through rather than triggering the access restricted view. Note that PostgreSQL RLS and `CustomerHome` already prevent unauthenticated order loading, so this is purely an internal defense-in-depth UI enhancement.
- **Expected Behavior:** Unauthenticated sessions should unconditionally be denied invoice presentation.
- **Recommended Fix:** Change condition to:
  ```typescript
  if (!isOwnerOrManager && !isDeliveryStaff && !isAuthorizedCustomer) {
    return <AccessRestrictedModal />;
  }
  ```
- **Acceptance Criteria:** Passing `currentUser = null` to `InvoiceModal` with any order immediately displays "Access Restricted".

---

### Item 4: `BUG-NAV-01` — `/register` Route Redirection Target
- **Category:** Usability / Routing
- **Severity:** **P2** (Minor Usability Issue)
- **Affected Role / Feature:** Public Visitor (`App.tsx`)
- **Blocks Launch:** NO
- **Description:**
  Navigating to `https://superwash.pages.dev/register` redirects to `/admin` (which then bounces to `/login?redirect=/admin`). For a customer-focused laundry application, a visitor entering `/register` is likely looking to create a customer account rather than access the store administration portal.
- **Expected Behavior:** Visiting `/register` should redirect to `/login` or display the customer registration / Google sign-in modal.
- **Recommended Fix:** In `frontend/src/App.tsx`, update route `<Route path="/register" element={<Navigate to="/login" replace />} />`.
- **Acceptance Criteria:** Navigating to `/register` leads directly to `/login`.

---

### Item 5: `GAP-PAY-01` — Automated Payment Gateway Integration (Razorpay / Cashfree)
- **Category:** Missing Feature / Product Decision
- **Severity:** **P2** (Product Enhancement)
- **Affected Role / Feature:** Customer, Delivery, Owner (`PaymentModal.tsx`)
- **Blocks Launch:** NO (Manual UPI and Cash on Delivery are 100% functional and standard for local laundry retail)
- **Description:**
  Currently, digital payments operate via dynamic UPI QR code display (`upi://pay?pa=...`) and manual 12-digit UTR entry. While this avoids gateway transaction fees (1.5% - 2%) and matches typical Indian local laundry workflows, an automated online gateway (e.g. Razorpay or Cashfree) would allow direct UPI app intent invocation and instant webhook settlement.
- **Product Decision:** Maintain manual UPI + Cash for November 1 launch; schedule Razorpay webhook integration for Stage 6 (Q1 2027).

---

### Item 6: `GAP-NOTIF-01` — Mobile Device Background Realtime Reconnect
- **Category:** Reliability
- **Severity:** **P2** (Mobile Usability)
- **Affected Role / Feature:** Customer Tracking Tab (`CustomerHome.tsx`)
- **Blocks Launch:** NO
- **Description:**
  When a mobile customer switches apps or locks their screen for more than 5 minutes, the underlying WebSocket connection to Supabase Realtime may be paused by mobile OS power management. `CustomerHome.tsx` includes a `window.addEventListener('focus', loadData)` listener which refreshes state upon foregrounding, but adding an explicit `onClose` WebSocket reconnect handler will further enhance resilience in unstable mobile 4G networks.
- **Recommended Action:** Add reconnect backoff timer to `supabase.channel('customer-orders-realtime')`.

---

### Item 7: `ENH-PRNT-01` — Thermal Receipt Printer Format for Wash Center
- **Category:** Enhancement
- **Severity:** **P3** (Operational Convenience)
- **Affected Role / Feature:** Store Manager (`InvoiceModal.tsx`)
- **Blocks Launch:** NO
- **Description:**
  The current print stylesheet is optimized for standard A4 desktop printers and PDF generation. Store intake staff typically utilize 80mm or 58mm thermal receipt printers for attaching paper tags to customer laundry bags.
- **Recommended Action:** Add an optional "Thermal Slip (80mm)" print toggle to `InvoiceModal.tsx` in a future update.

---

## 3. NEXT-RELEASE ACTION PLAN SUMMARY

```
===================================================================================
PRIORITY 1: PRE-LAUNCH PREREQUISITES (OCTOBER 29 - OCTOBER 31)
===================================================================================
1. [GAP-AUTH-01] Add https://superwash.pages.dev to GCP OAuth Authorized Origins.
2. [GAP-INT-01] Configure WhatsApp Business Cloud API tokens in Supabase Secrets.

===================================================================================
PRIORITY 2: POST-LAUNCH QUALITY ENHANCEMENTS (RELEASE v1.1 - NOVEMBER 2026)
===================================================================================
3. [SEC-UI-01] Tighten InvoiceModal.tsx unauthenticated prop guard.
4. [BUG-NAV-01] Point /register redirect to /login instead of /admin.
5. [GAP-NOTIF-01] Add Realtime WebSocket reconnection backoff helper.

===================================================================================
PRIORITY 3: FUTURE EXPANSIONS (STAGE 6 - Q1 2027)
===================================================================================
6. [GAP-PAY-01] Razorpay / Cashfree automated UPI intent & webhook settlement.
7. [ENH-PRNT-01] 80mm thermal laundry bag tag printing support.
===================================================================================
```
