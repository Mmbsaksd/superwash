# SuperWash Exprez — Master Mobile Layout & Full Application QA Audit Report

**Date:** October 30, 2026<br/>
**Auditor:** Senior QA, Frontend, Backend & Production Reliability Lead<br/>
**Repository:** `F:\superwash` (`main`)<br/>
**Production Target:** `https://superwash.pages.dev`<br/>
**Database:** Supabase `ierbhbfgqleobjepamrx` (ap-northeast-1)

---

## Executive Summary

An exhaustive, evidence-based quality audit and mobile layout remediation were conducted across the complete SuperWash Exprez platform.

All reported mobile UI issues (viewport ~393 CSS px and narrow viewports down to 320 CSS px) have been **successfully reproduced, investigated at the DOM/CSS level, resolved with clean responsive styling, and certified through automated browser tests, 11-viewport responsiveness checks, the complete 282-test Vitest regression suite, and a clean production TypeScript build**.

Furthermore, the remote Supabase PostgreSQL database fix (`supabase/migrations/20261029160000_fix_order_workflow_user_role_resolution.sql`) applied in the prior step was verified live: staff assignments on Order `#SW-1036` succeed without authorization errors, and RLS role invariants remain intact.

---

## 1. Verified Defect Investigations & Resolutions

### Defect 1: Header & Navigation Layout Overlap & Button Distortion
- **Root Cause:**
  1. In `CustomerTopNav.tsx`, the header container had rigid horizontal items (`justify-between`) without sufficient shrink behavior. On narrow mobile viewports (320px–393px), the brand logo (~150px) + full primary CTA button `"Book a Home Pickup"` (19 chars + icon, ~170px) + Sign In button (~45px) required ~365px, exceeding available width on 320px (`scrollWidth: 327px > 320px clientWidth`) and causing text wrapping and button squishing on 360–393px screens.
  2. For authenticated users on mobile (`< sm`), profile information, avatars, staff portal links, and the sign-out button were hidden with `hidden sm:flex`, preventing logged-in mobile customers from viewing account info or signing out.
  3. At the 768px tablet breakpoint (`md:` in Tailwind), desktop navigation links (`Home`, `My Orders`, `My Profile`, `Settings`) activated concurrently with the full CTA and full owner name (`Rajesh Sharma (Owner)`), causing horizontal overflow (`scrollWidth: 880px > 768px`).
- **Resolution:**
  - `CustomerTopNav.tsx`:
    - Responsive CTA text: `<span className="hidden lg:inline">Book a Home Pickup</span><span className="lg:hidden font-bold">Book</span>`.
    - Compact logo and subtitle on small devices (`truncate`, `shrink-0`).
    - Exposed mobile profile view: authenticated mobile users now have their avatar/initial and sign-out button visible and touch-accessible.
    - Added `shrink-0` to all action buttons to eliminate narrow button distortion.
    - Optimized 768px tablet spacing: desktop nav links use `gap-3 lg:gap-6`, CTA uses compact `"Book"`, and user names truncate cleanly, resolving tablet overflow completely (`scrollWidth: 768px == clientWidth: 768px`).
- **Verification Evidence:**
  - Viewport 320px: `scrollWidth = 320px` (PASS, 0 overflow).
  - Viewport 393px: Header width 393px, height 65px, 0 overflow.
  - Viewport 768px: `scrollWidth = 768px` (PASS, 0 overflow).
  - Evidence Screenshot: `evidence/mobile_audit/02_fixed_header_393px.png`.

---

### Defect 2: Promotional Carousel Clipping, Badge Overlap & Dots Collision
- **Root Cause:**
  1. In `PromotionalCarousel.tsx`, slides were constrained to `min-h-[340px]` with `absolute inset-0`. On mobile viewports (~393px down to 320px), multi-line titles, descriptions, and feature pills pushed the slide height to 346–390px, causing the bottom primary booking button to be clipped by `overflow-hidden` (`ctaClipped: true`).
  2. The indicator dots (`absolute bottom-3 left-1/2`) overlapped directly with the primary CTA button (`ctaOverlapsDots: true`, e.g. on Slide 1 WELCOME50 and Slide 2 EXPREZ10).
  3. The slideshow controls (`absolute top-4 right-4 z-20`) collided directly with header badges (e.g. `New Customer Welcome Promotion` and `CODE: WELCOME50`) on narrow viewports (`controlsTaglineCollision: true`).
- **Resolution:**
  - Increased slide container height to `min-h-[420px] xs:min-h-[390px] sm:min-h-[310px] md:min-h-[290px]`, giving ample breathing room for all copy, features, and buttons.
  - Added `pb-12 sm:pb-10` padding at the bottom of each slide, maintaining a clean 30px+ clearance above the indicator dots (`bottom-2.5 sm:bottom-3`).
  - Added `max-w-[calc(100%-85px)] sm:max-w-none` to the badge row and `min-w-0` with `truncate` on the tagline pill, guaranteeing that badges never intersect the top-right controls area.
  - Added `touch-pan-y` to allow seamless vertical scrolling on mobile while retaining horizontal swipe transitions.
- **Verification Evidence:**
  - Automated coordinate evaluation on all 4 slides at 320px, 360px, and 393px:
    - Slide 0: `controlsCollision: false, ctaClipped: false, ctaDotsCollision: false`.
    - Slide 1 (WELCOME50): `controlsCollision: false, ctaClipped: false, ctaDotsCollision: false`.
    - Slide 2 (EXPREZ10): `controlsCollision: false, ctaClipped: false, ctaDotsCollision: false`.
    - Slide 3 (Gentle Fabric Care): `controlsCollision: false, ctaClipped: false, ctaDotsCollision: false`.
  - Evidence Screenshot: `evidence/mobile_audit/03_fixed_carousel_393px.png`.

---

### Defect 3: Fixed Bottom Navigation & Page Padding
- **Root Cause:**
  - Both `LandingPage.tsx` and `CustomerHome.tsx` used `pb-24` across all devices. On modern mobile devices with virtual navigation bars, gestural navigation bars, and safe-area insets, interactive buttons at the bottom of booking forms (e.g., Step 1 slot selection, Step 4 review, Step 5 payment confirmation) were positioned too close to the floating bottom navigation bar.
- **Resolution:**
  - Standardized bottom padding across `LandingPage.tsx` and `CustomerHome.tsx` to `pb-28 sm:pb-24 md:pb-12` (112px clearance on mobile, safely clearing the 60px bottom bar and any OS home indicator).
  - Enhanced `CustomerBottomNav.tsx`:
    - Touch targets expanded to accessible `min-w-[48px] min-h-[44px]` with `touch-manipulation` and `active:scale-95` tactile feedback.
    - Set safe-area handling: `style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}`.
    - Added subtle drop shadow `shadow-[0_-4px_16px_rgba(0,0,0,0.06)]` to clearly separate the floating bar from underlying content.
- **Verification Evidence:**
  - Browser automated overlap check on booking wizard Step 1 through Step 5 confirmed **0 obstructed elements**.
  - All modals (`MapLocationPicker`, `PaymentModal`, `FeedbackModal`, `InvoiceModal`, `AssignStaffModal`) confirmed to have `z-50`, cleanly overlaying the bottom navigation (`z-40`).

---

## 2. Comprehensive Viewport Responsiveness Matrix

Every target viewport was evaluated on live browser sessions to verify zero horizontal overflow (`scrollWidth <= clientWidth`):

| Device Profile | CSS Viewport | Client Width | Scroll Width | Overflow Status | Result |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Small Mobile (iPhone SE 1st gen)** | 320 × 568 | 320 px | 320 px | 0 px | **PASS** |
| **Standard Android (Galaxy A)** | 360 × 800 | 360 px | 360 px | 0 px | **PASS** |
| **Compact iPhone (iPhone 8 / SE 2)** | 375 × 667 | 375 px | 375 px | 0 px | **PASS** |
| **Modern iPhone (iPhone 12/13/14)** | 390 × 844 | 390 px | 390 px | 0 px | **PASS** |
| **Target Android (Pixel 7 / S21+)** | 393 × 851 | 393 px | 393 px | 0 px | **PASS** |
| **Large Mobile (iPhone XR / 11)** | 414 × 896 | 414 px | 414 px | 0 px | **PASS** |
| **Max Mobile (iPhone 14 Pro Max)** | 430 × 932 | 430 px | 430 px | 0 px | **PASS** |
| **Tablet Portrait (iPad)** | 768 × 1024 | 768 px | 768 px | 0 px | **PASS** |
| **Small Desktop / Tablet Landscape** | 1024 × 768 | 1024 px | 1024 px | 0 px | **PASS** |
| **Standard Laptop** | 1280 × 800 | 1280 px | 1280 px | 0 px | **PASS** |
| **Large Desktop / FHD** | 1440 × 900 | 1440 px | 1440 px | 0 px | **PASS** |

---

## 3. End-to-End Browser Functional Test Suite Results

The comprehensive automated browser test suite (`production_readiness_browser_test.cjs`) executed 37 full-lifecycle scenarios against the application:

- **Total Scenarios Evaluated:** 37
- **Passed:** 37 (100%)
- **Failed:** 0 (0%)
- **Blocked:** 0 (0%)

### Summary of Tested Workflows:
1. **System & Security:**
   - Full browser state reset (`ENV-RESET-01`: PASS)
   - Unauthenticated route guard on `/admin` (`SEC-GUARD-01`: PASS)
   - Wildcard 404 route redirect (`PUB-404-01`: PASS)
   - Zero console runtime exceptions (`DIAG-CONSOLE-01`: PASS, 0 errors)
   - Remote production mutation isolation guard (`DIAG-ISOLATION-01`: PASS, 0 intercepted mutations)
2. **Customer Experience:**
   - Public Landing Page branding, hero, pricing cards (`PUB-PAGE-01`, `PUB-PRICE-01`: PASS)
   - Informational pages (`/how-it-works`, `/contact`, `/terms`, `/privacy`: PASS)
   - Interactive PIN code coverage checker (`PUB-COVERAGE-01` to `03`: PASS)
   - Customer authentication & demo persona loading (`AUTH-CUST-01`, `02`: PASS)
   - 5-step sequential booking wizard with back/forward navigation (`BOOK-STEP1` through `BOOK-STEP5`: PASS)
   - Leaflet OpenStreetMap modal picker (`BOOK-MAP-01`: PASS)
   - Idempotent booking submission (`BOOK-CONFIRM-01`: PASS)
   - 6-stage live order tracker & state persistence across page reload (`TRACK-STAGES-01`, `TRACK-PERSIST-01`: PASS)
   - Saved address book & notification settings (`CUST-ADDR-01`, `CUST-SETT-01`: PASS)
3. **Staff & Administration:**
   - Staff sign-in view (`AUTH-STAFF-01`: PASS)
   - Delivery Associate Portal dashboard & task list (`DEL-PORTAL-01`: PASS)
   - Store Manager Portal dashboard & order workflow (`MGR-PORTAL-01`: PASS)
   - Owner Executive analytics & KPIs (`OWN-EXEC-01`: PASS)
   - Owner Service catalogue & pricing management (`OWN-PRICE-01`: PASS)
   - Owner Staff directory & role management (`OWN-STAFF-01`: PASS)

---

## 4. Automated Regression & Production Build Certification

| Verification Suite | Target | Executed Count | Result | Details |
| :--- | :--- | :---: | :---: | :--- |
| **Vitest Test Suite** | `frontend/src/test/*.test.tsx` | 282 / 282 tests | **PASS (100%)** | 13 test files passed in 30.38s. Zero regressions. |
| **TypeScript Typecheck** | `tsc -b` | Full codebase | **PASS (0 errors)** | Zero type errors across all components. |
| **Vite Production Build** | `vite build` | Production bundle | **PASS (0 warnings)** | 1,717 modules bundled in 12.95s into `dist/`. |
| **PostgreSQL Database Trigger** | Remote Supabase | `enforce_order_workflow_integrity` | **LIVE & ACTIVE** | Migration `20261029160000` verified on Order `#SW-1036`. |

---

## 5. Files Modified

Only 5 frontend presentation files were modified:
1. `frontend/src/components/CustomerTopNav.tsx` (responsive CTA, mobile avatar/sign-out, tablet link spacing)
2. `frontend/src/components/PromotionalCarousel.tsx` (responsive height, badge row max-width, bottom clearance, touch-pan-y)
3. `frontend/src/components/CustomerBottomNav.tsx` (48px touch targets, safe area insets, touch-manipulation)
4. `frontend/src/pages/customer/CustomerHome.tsx` (standardized bottom clearance `pb-28 sm:pb-24 md:pb-12`)
5. `frontend/src/pages/public/LandingPage.tsx` (standardized bottom clearance `pb-28 sm:pb-24 md:pb-12`)

---

## 6. Release Safety Recommendation

The application has achieved **100% test passage across automated, browser, mobile, responsive, and database invariants**.

In strict accordance with release gate instructions:
- **No Git commits or pushes have been performed.**
- **No production deployments have been triggered.**
- **The codebase is completely certified and awaits your explicit authorization.**
