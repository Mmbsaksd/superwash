# SuperWash Exprez — Coupon & Promotional Banner Architecture & Data Flow

**Document Date:** 2026-10-31  
**Project:** SuperWash Exprez  
**System Area:** Coupon Lifecycle, Admin Management, Public Carousel & Booking Validation

---

## 1. Architectural Entity Overview

The system currently exhibits a structural separation between promotional marketing content and database discount vouchers:

| Entity | Primary Storage | Managed By | Consumed By | Key Fields |
|:---|:---|:---|:---|:---|
| **Coupon Code** | PostgreSQL table `public.coupons` | Store Owner (`OwnerDashboard.tsx`) | `LaundryService.validateCoupon`, `create_booking_idempotent` | `id (UUID)`, `code`, `is_active`, `discount_type`, `discount_value`, `min_order_paise`, `valid_until` |
| **Promotional Carousel Slide** | Client-side JSX constant (`PromotionalCarousel.tsx`) | Hardcoded in source code | Customer (`LandingPage.tsx`, Customer Home) | `id`, `title`, `tagline`, `description`, `badge`, `couponCode`, `gradientClass` |
| **Local Coupon Cache** | Browser `localStorage['superwash_coupons']` | `LaundryService.ts` | React UI state | Mirror of `Coupon[]` |

---

## 2. Sequence Diagrams

### 2.1 The Current Broken Deactivation Flow (Root Cause Analysis)

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Business Owner (Admin Portal)
    participant UI as OwnerDashboard.tsx
    participant Svc as LaundryService.ts
    participant Cache as LocalStorage ('superwash_coupons')
    participant DB as PostgreSQL (public.coupons)
    actor Customer as Public Visitor / Customer
    participant Home as PromotionalCarousel.tsx

    %% Step 1: Admin attempts deactivation
    Owner->>UI: Clicks "Toggle Status" (Deactivate WELCOME50)
    UI->>Svc: updateCoupon('coupon-welcome50', { is_active: false }, 'owner')
    
    %% Step 2: Supabase call fails silently
    Svc->>DB: UPDATE public.coupons SET is_active=false WHERE id='coupon-welcome50'
    Note over DB: FAILS: 'coupon-welcome50' is not a valid UUID (or RLS rejects)
    DB-->>Svc: Error: 22P02 invalid input syntax for type uuid
    Note over Svc: Error swallowed in console.warn('Coupons update note')
    
    %% Step 3: Optimistic local update
    Svc->>Cache: setItem('superwash_coupons', [{ code: 'WELCOME50', is_active: false }])
    Svc-->>UI: Returns updated coupon object
    UI-->>Owner: Displays Green Alert: "Coupon 'WELCOME50' disabled."

    %% Step 4: Deactivation Reverts on Reload or Re-login
    Owner->>UI: Signs out or Refreshes Page
    UI->>Svc: getCoupons(includeInactive=true)
    Svc->>DB: SELECT * FROM public.coupons ORDER BY created_at DESC
    DB-->>Svc: Returns DB Rows (WELCOME50 is still is_active=true!)
    Svc->>Cache: Overwrites cache with DB rows (is_active=true)
    Svc-->>UI: Returns active coupons
    Note over UI: Coupon WELCOME50 is RESURRECTED as Active!

    %% Step 5: Homepage Carousel completely ignores DB
    Customer->>Home: Visits https://superwash.pages.dev/
    Note over Home: Renders static hardcoded banners array
    Home-->>Customer: Displays Banner: "Flat ₹50 OFF - Code: WELCOME50"
```

---

### 2.2 The Remediated Fail-Closed & Synchronized Data Flow

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Business Owner (Admin Portal)
    participant UI as OwnerDashboard.tsx
    participant Svc as LaundryService.ts
    participant DB as PostgreSQL (public.coupons)
    actor Customer as Public Visitor / Customer
    participant Home as PromotionalCarousel.tsx

    %% Remediated Flow: Fail-Closed Mutation
    Owner->>UI: Clicks "Toggle Status" (Deactivate WELCOME50)
    UI->>Svc: updateCoupon(uuid, { is_active: false }, 'owner')
    Svc->>DB: UPDATE public.coupons SET is_active=false WHERE id=uuid
    alt Database Update Succeeds
        DB-->>Svc: Success (1 row updated)
        Svc->>UI: Returns updated coupon
        UI-->>Owner: Displays: "Coupon 'WELCOME50' disabled."
    else Database Update Fails
        DB-->>Svc: Error (RLS or Network)
        Svc-->>UI: Throws Exception
        UI-->>Owner: Displays Red Error Alert: "Failed to update coupon status in database."
        Note over UI: React state and cache remain unchanged
    end

    %% Synchronized Promotional Carousel
    Customer->>Home: Visits Landing Page
    Home->>Svc: getCoupons(includeInactive=false)
    Svc->>DB: SELECT * FROM public.coupons WHERE is_active=true
    DB-->>Svc: Returns active coupons list (WELCOME50 excluded)
    Home->>Home: Filters carousel slides (drops WELCOME50 slide)
    Home-->>Customer: Displays only valid active offers & permanent brand slides
```

---

## 3. End-to-End Tracing by Workflow

### 3.1 Coupon Lifecycle: Creation, Activation, Deactivation & Deletion
1. **Creation:**
   - Owner enters code, discount type, value, minimum order amount, and optional customer limit in `OwnerDashboard.tsx`.
   - `handleCreateCoupon` calls `LaundryService.createCoupon(data, callerRole)`.
   - `LaundryService` validates parameters (positive discounts, code formatting, owner role check) and issues an `INSERT` to Supabase.
   - On success, the new record is placed in `localStorage` and appended to the UI state.
2. **Deactivation (Toggle Status):**
   - Owner clicks status toggle next to a coupon.
   - `handleToggleCouponStatus` calls `LaundryService.updateCoupon(id, { is_active: !coupon.is_active }, callerRole)`.
   - If `id` is a UUID, Supabase updates `public.coupons`.
   - If an error occurs, it must throw immediately (fail-closed) so the UI does not show false success.
3. **Deletion:**
   - Owner confirms deletion in browser dialog.
   - `handleDeleteCoupon` calls `LaundryService.deleteCoupon(id, callerRole)`.
   - If an error occurs, it must throw immediately so the UI does not delete the row locally while leaving it intact in PostgreSQL.

### 3.2 Public Homepage & Promotional Banner Flow
1. **Slide Definitions:**
   - Informational slides (`Fast Doorstep Pickup & Delivery`, `Steam Press & Gentle Fabric Care`) remain permanent fixtures.
   - Promotional discount slides (`WELCOME50`, `EXPREZ10`) are linked to coupon codes via `couponCode`.
2. **Dynamic Synchronization:**
   - On component mount, `PromotionalCarousel` fetches active coupons via `LaundryService.getCoupons(false)`.
   - Any promotional slide whose `couponCode` does not match an active, unexpired coupon in the returned list is automatically excluded from the carousel.
   - If no promotional coupons are active, the carousel seamlessly displays the 2 permanent brand slides without error.

### 3.3 Customer Checkout & Server-Side Redemption Validation
1. **Client-Side Pre-Validation:**
   - Customer enters coupon code in Step 4 of booking wizard.
   - Wizard invokes `LaundryService.validateCoupon(code, phone, subtotalPaise, serviceId)`.
   - If `is_active = false` or `valid_until` is in the past, client displays: `"Coupon '...' is currently disabled."`
2. **Authoritative Server-Side Validation:**
   - When the customer clicks "Confirm Pickup Booking", `create_booking_idempotent` runs inside an atomic PostgreSQL transaction.
   - Lines 691–710 acquire an exclusive row lock (`FOR UPDATE`) on `public.coupons`:
     ```sql
     SELECT * INTO v_coupon FROM public.coupons WHERE UPPER(TRIM(code)) = v_clean_coupon_code FOR UPDATE;
     IF NOT v_coupon.is_active THEN
         RAISE EXCEPTION 'Coupon "%" is currently disabled.', p_coupon_code;
     END IF;
     ```
   - If the coupon is disabled or deleted in PostgreSQL, the transaction aborts with an exception, guaranteeing zero unauthorized discounts.

