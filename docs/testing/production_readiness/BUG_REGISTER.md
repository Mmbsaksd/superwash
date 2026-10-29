# SuperWash Exprez — Master Bug & Defect Register

**Audit Date:** October 29, 2026  
**Auditor:** Senior Quality Assurance & Application Reliability Engineer  
**Target Repository:** `F:\superwash`  

---

## 1. Summary of Defect Classifications

| Bug ID | Severity | Module / Feature | Issue Summary | Status | Verified Evidence | Release Impact |
| :--- | :---: | :--- | :--- | :---: | :--- | :---: |
| **SW-1001** | Medium | Public Coverage Checker | Empty PIN submission produced no user validation feedback (silent no-op). | **RESOLVED** | `03_coverage_empty_pin.png` | None (Fixed) |
| **SW-1002** | Medium | Landing Page Pricing | Fallback pricing card displayed obsolete rate ₹80/kg instead of ₹79/kg baseline. | **RESOLVED** | `06_authoritative_price_79.png` | None (Fixed) |
| **SW-1003** | High | Customer Home Portal | Direct URL navigation with `?tab=...` failed to update `activeTab` state on mounted component. | **RESOLVED** | `14_customer_logged_in.png` | None (Fixed) |
| **SW-1004** | Low | WhatsApp Service | Calling remote Supabase Edge Function in offline/demo mode triggered console CORS preflight errors. | **RESOLVED** | `DIAG-CONSOLE-01` (0 console errors) | None (Fixed) |
| **SW-1005** | Low | Automated Test Suite | Vitest concurrent runner timeout (5331ms vs 5000ms default) in `customerUxRedesign.test.tsx` under heavy JSDOM CPU load. | **DOCUMENTED** | Test passes cleanly in 2.08s with `--testTimeout=15000`. | Non-blocking (Test-only) |
| **SW-1006** | Medium | Demo Seed Constants | Fallback mock orders `#SW-1001` & `#SW-1002` in `INITIAL_SAMPLE_ORDERS` carry obsolete ₹80/kg rate (`8000` paise). | **ACTION REQUIRED** | Source Code Inspection (`laundryService.ts:230`) | Pending approval to reconcile or clear |
| **SW-1007** | Medium | Fallback Store Settings | Hardcoded `DEFAULT_SETTINGS` references Indiranagar store and phone `+91 98765 43210` vs authoritative Banashankari in Supabase. | **ACTION REQUIRED** | Source Code Inspection (`laundryService.ts:37`) | Pending approval to synchronize with Supabase |

---

## 2. Detailed Bug Reports & Reproduction Verification

### Bug SW-1001: Coverage Checker Empty PIN Silent Failure
- **Component:** `frontend/src/pages/public/LandingPage.tsx`
- **Severity:** Medium (Customer UX)
- **Description:** When a visitor clicked "Check" without entering a postal code, the form performed no action and displayed no validation message, confusing prospective customers.
- **Resolution:** Added input length validation (`pin.trim().length !== 6`) displaying courteous feedback: `"Please enter a valid 6-digit Indian PIN code to check coverage."`
- **Verification:** Test scenario `PUB-COVERAGE-01` submitted an empty field; verified courteous error rendered on screen. Evidence: `03_coverage_empty_pin.png`.

---

### Bug SW-1002: Fallback Landing Rate Display Mismatch
- **Component:** `frontend/src/pages/public/LandingPage.tsx`
- **Severity:** Medium (Pricing Invariant)
- **Description:** Landing page rate card defaulted to `₹80/kg` if settings were pending load, conflicting with the authoritative business owner baseline of `₹79/kg` (7900 paise).
- **Resolution:** Corrected fallback rate constant in `LandingPage.tsx` from `80` to `79`.
- **Verification:** Test scenario `PUB-PRICE-01` verified prominent ₹79/kg rate baseline displayed across pricing cards. Evidence: `06_authoritative_price_79.png`.

---

### Bug SW-1003: Tab Query Parameter Desynchronization
- **Component:** `frontend/src/pages/customer/CustomerHome.tsx`
- **Severity:** High (Core Navigation)
- **Description:** Navigating between customer tabs via URL parameters (e.g., from `/customer?tab=current` to `/customer?tab=addresses`) did not update the active view because `useState(tabParam)` only initialized on initial component mount.
- **Resolution:** Added a synchronization `useEffect` listening to `tabParam` (`searchParams.get('tab')`), updating `activeTab` whenever the URL query parameter changes.
- **Verification:** Tested in scenario `AUTH-CUST-02` and `CUST-ADDR-01`. Direct navigation to `?tab=addresses` renders the Saved Addresses tab immediately. Evidence: `27_customer_addresses.png`.

---

### Bug SW-1004: WhatsApp Edge Function CORS Error in Demo Mode
- **Component:** `frontend/src/services/whatsappService.ts`
- **Severity:** Low (Console Cleanliness & Reliability)
- **Description:** In local development and demo mode (`VITE_DEMO_MODE=true`), booking dispatches attempted to invoke `supabase.functions.invoke('send-whatsapp')`, which caused CORS preflight failures (`net::ERR_FAILED`) and 401 unauthenticated errors in the browser console.
- **Resolution:** Wrapped Edge Function invocation with `isLive` environment check (`isSupabaseConfigured && VITE_DEMO_MODE !== 'true'`). In demo mode, dispatches log to local storage without making remote network calls.
- **Verification:** Evaluated console diagnostics across all 37 test scenarios (`DIAG-CONSOLE-01`). Confirmed **0 unhandled runtime errors**.

---

### Bug SW-1005: Vitest Concurrency Test Runner Timeout
- **Component:** `frontend/src/test/customerUxRedesign.test.tsx`
- **Severity:** Low (Automated Test Tooling Only)
- **Description:** The test `guides customer sequentially through 5 steps with back/continue validation` contains 6 sequential `waitFor` blocks. When 12 test files run concurrently, JSDOM CPU contention on Windows causes the test to complete in 5331ms, exceeding Vitest's default 5000ms per-test timeout.
- **Resolution / Status:** Test logic is fully valid. Executed in isolation (`npx vitest run src/test/customerUxRedesign.test.tsx --testTimeout=15000`), all 14 tests in the file pass in 2.08s. Recommend increasing per-test timeout to 15000ms.

---

### Bug SW-1006: Obsolete Price in Sample Orders
- **Component:** `frontend/src/services/laundryService.ts` (Lines 210–271)
- **Severity:** Medium (Data Invariant)
- **Description:** The fallback constant `INITIAL_SAMPLE_ORDERS` pre-seeds mock orders `#SW-1001` and `#SW-1002` with `price_per_kg_paise: 8000` (₹80.00/kg) instead of ₹79.00/kg.
- **Proposed Fix:** Reconcile `price_per_kg_paise` from `8000` to `7900` or clear `INITIAL_SAMPLE_ORDERS = []` for a clean demo slate. Awaiting user approval.

---

### Bug SW-1007: Fallback Settings Conflict with Authoritative Supabase Store
- **Component:** `frontend/src/services/laundryService.ts` (Lines 34–45)
- **Severity:** Medium (Business Reference Data)
- **Description:** `DEFAULT_SETTINGS` in code references `Shop #14, Indiranagar, Bengaluru 560038` and phone `+91 98765 43210`. The live Supabase PostgreSQL database contains `Kadarenahalli Park, Banashankari 2nd Stage, Bengaluru 560070` with phone `+91 8217541193`.
- **Proposed Fix:** Synchronize `DEFAULT_SETTINGS` in `laundryService.ts` to match Supabase. Awaiting user approval.

---

*Zero critical release-blocking functional defects remain unresolved in production code.*

