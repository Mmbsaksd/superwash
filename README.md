# SuperWash Express — Production Operations & Laundry Management Platform

A fast, mobile-first laundry pickup and delivery web application designed for laundry businesses in India charging on a transparent **price-per-kilogram** basis.

Built with a high-integrity architecture prioritizing **strict data persistence**, **Google OAuth 2.0 authentication**, **role-based security (RLS)**, **accurate Google Maps navigation**, **dynamic service-area coverage**, **extensible service catalogue**, and **period-based business analytics**.

---

## 1. Authoritative Architecture & Data Path

SuperWash Express operates with **Supabase PostgreSQL** as its single, authoritative shared source of truth.

- **Primary Data Path:** The React frontend interacts directly with Supabase PostgreSQL using Row Level Security (RLS) policies, database triggers, and database sequences.
- **Authentication:** Standardized on official **Google OAuth 2.0** through Supabase Auth (`signInWithOAuth({ provider: 'google' })`). Eliminates SMS OTP delays and third-party SMS gateway failures.
- **Customer Onboarding:** Customers sign in instantly with Google. On first login, a seamless modal collects their Indian mobile number (for delivery driver communication) and initial delivery address.
- **Data Integrity:** In production mode (`VITE_DEMO_MODE=false`), business records are stored exclusively in the shared database. Failed database writes throw visible errors and never silently fall back to mock data.
- **Legacy FastAPI Backend:** The repository includes an optional FastAPI backend in `backend/` for auxiliary microservice workflows, but the authoritative data path for the live web application is Supabase PostgreSQL.

---

## 2. Five Role-Based Operational Portals

| Role / View | Route | Primary Capabilities |
| :--- | :--- | :--- |
| **Public Landing Page** | `/` | Transparent ₹80/kg Pricing, Live Service-Area PIN Code Coverage Checker, 4-Step Process Walkthrough, Customer Reviews, Direct Booking CTA |
| **Customer Portal** | `/customer` | Google Sign-In, Seamless Phone & Address Onboarding, Book Home Pickup with GPS Location Capture (`navigator.geolocation`), Live Order Status Tracking, Order History, Bill Breakdown, Delivered Order Feedback (1-5★) |
| **Delivery Executive** | `/delivery` | Assigned Pickups & Deliveries, One-tap Call Customer, Enhanced **Navigate via Google Maps** (Directions API with GPS Coordinates or structured address fallback), Mark Collected, Mark Delivered, Record Doorstep Cash/UPI Payment, Sign Out |
| **Store Manager** | `/manager` | Collected Laundry Queue, Digital Scale Weight Entry (in kg) with automatic minimum-weight bill calculation, Status Workflow (Washing, Ready for Dispatch), Sign Out |
| **Business Owner** | `/admin` | Executive Analytics Dashboard with period filtering (Today, Yesterday, This Week, Last Week, This Month, Last Month in `Asia/Kolkata` timezone), Period Growth Metrics, CSV Report Export, Payment Ledger & Receipts, Staff Role Accounts, Pricing & Minimum Weight Settings, Service Areas & PIN Coverage Manager, Extensible Service Catalogue, Customer Feedback Review, Sign Out |

---

## 3. Database Schema & Migration Order

To set up a fresh database or upgrade an existing instance, execute the SQL migrations in `supabase/migrations/` in exact sequential order:

### 1. Initial Core Schema
```sql
supabase/migrations/20261021_initial_schema.sql
```
- Sets up core tables: `profiles`, `customer_addresses`, `orders`, `order_status_history`, `weight_change_history`, `payments`, `business_settings`, `pickup_slots`, `notification_logs`.
- Establishes base Row Level Security (RLS) policies and performance indexes.

### 2. Private Customer Feedback Migration
```sql
supabase/migrations/20261022_feedback_schema.sql
```
- Creates `order_feedback` table with rating constraints (1-5★) and resolution status.
- Implements strict customer isolation RLS (customers can only submit feedback for their own delivered orders; only owners/managers can review).

### 3. Enhanced Persistence, Maps, Coverage & Security Migration
```sql
supabase/migrations/20261022_enhanced_schema.sql
```
- **Maps Coordinates:** Adds `latitude` and `longitude` (`DECIMAL(10, 7)`) to `customer_addresses` and snapshot fields `pickup_latitude`, `pickup_longitude` to `orders`.
- **Service Areas:** Creates `service_areas` table with unique 6-digit PIN code constraint and active/inactive status. Seeds core Bengaluru service zones.
- **Extensible Services:** Creates `services` catalogue table seeded with "Wash & Fold (Normal)" at ₹80/kg.
- **Transaction-Safe Order Sequence:** Creates `order_number_seq` and allocation trigger.
- **Role Elevation Prevention Trigger:** Enforces database-level block preventing users from elevating their own profile role to `owner` or `manager`.
- **Payment Reconciliation Trigger:** Automatically keeps `orders.paid_amount_paise` and `orders.payment_status` in sync with the authoritative `payments` ledger.

### 4. Google OAuth & Profile Provisioning Migration
```sql
supabase/migrations/20261022_google_oauth_schema.sql
```
- **OAuth Columns:** Adds `email` (`VARCHAR(255) UNIQUE`) and `avatar_url` (`TEXT`) to `public.profiles`. Makes `phone` nullable for initial OAuth registration.
- **Automatic Provisioning Trigger:** Adds `on_auth_user_created` trigger on `auth.users` to automatically create a customer profile upon Google OAuth sign-in. New sign-ins strictly receive the default role `customer`.
- **Secure Staff Linking:** Adds `public.link_staff_google_account(staff_phone, verified_email)` function for business owners to securely link staff Google accounts without loose email guessing.

---

## 4. Google OAuth 2.0 Setup Guide

Google OAuth credentials are configured securely in Supabase and Google Cloud Console. **Client secrets are never stored in frontend code.**

### Step 1: Create OAuth Credentials in Google Cloud Console
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `superwash-express-auth`) or select an existing project.
3. In the left navigation, go to **APIs & Services > OAuth consent screen**:
   - Choose **External** and click **Create**.
   - App Name: `SuperWash Express`
   - User Support Email: your business email (e.g. `care@superwash.in`)
   - Developer Contact Email: your technical admin email.
   - Scopes: Add `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
4. In the left navigation, go to **APIs & Services > Credentials**:
   - Click **+ Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Name: `SuperWash Web Client`.
   - **Authorized JavaScript origins**:
     - `http://localhost:5173`
     - `http://127.0.0.1:5173`
     - `https://your-production-domain.com`
   - **Authorized redirect URIs**:
     - `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
   - Click **Create**.
   - Copy the **Client ID** and **Client Secret**.

### Step 2: Configure Google Provider in Supabase Dashboard
1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and navigate to your project.
2. Go to **Authentication > Providers**.
3. Locate **Google** in the provider list and toggle it **Enabled**:
   - Paste the **Client ID** from Google Cloud Console.
   - Paste the **Client Secret** from Google Cloud Console.
   - Click **Save**.
4. Go to **Authentication > URL Configuration**:
   - **Site URL**: `http://localhost:5173` (or your production URL `https://superwash.in`)
   - **Redirect URLs**: Add:
     - `http://localhost:5173/**`
     - `http://127.0.0.1:5173/**`
     - `https://your-production-domain.com/**`
   - Click **Save**.

---

## 5. Environment Configuration & Security Modes

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### Live Production Mode (`VITE_DEMO_MODE=false`)
- **Authentication:** Official Google OAuth through Supabase Auth (`signInWithOAuth({ provider: 'google' })`).
- **Profile Completion:** First-time sign-in prompts customer for contact mobile number and default pickup address.
- **Role Protection:** New OAuth users automatically receive `customer` role. Privileged role changes must be performed by the owner.
- **Role Switcher:** Completely hidden and disabled in production builds.

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-live-anon-key-here
VITE_DEMO_MODE=false
```

### Development & Demo Mode (`VITE_DEMO_MODE=true` or Local Dev)
- **1-Click Google Sign-In:** Instant simulation of Google OAuth with test profile.
- **Quick Persona Selectors:** Test Customer, Delivery, Manager, and Owner portals with single-click persona buttons.

```env
VITE_DEMO_MODE=true
```

---

## 6. Running Locally & Testing

### Frontend
```bash
cd frontend
npm ci
npm test          # Run Vitest unit tests (Google OAuth, Payments, Maps, Analytics)
npm run build     # Verify TypeScript types and production bundle compilation
npm run dev       # Start local Vite development server at http://127.0.0.1:5173
```

---

## 7. Key Business & Technical Features

1. **Passwordless Google Authentication:**
   - Fast, trusted login via Google OAuth 2.0.
   - Eliminates SMS delivery delays and OTP cost overhead.
2. **Post-Login Customer Onboarding:**
   - Securely collects customer mobile number (for delivery driver communication) and pickup address on first order.
   - Explicitly clarifies that Google login authenticates identity without claiming phone verification.
3. **Historical Order Preservation:**
   - Order history queries match both `customer_id` and verified `customer_phone`, ensuring existing customer orders remain visible after OAuth migration.
4. **Doorstep Navigation:**
   - Driver navigates using Google Maps Directions (`https://www.google.com/maps/dir/?api=1&destination=...`).
   - Prioritizes high-precision GPS coordinates (`pickup_latitude`, `pickup_longitude`) when captured with fallback to structured address, landmark, PIN, and city.
5. **Double-Click & Concurrency Protection:**
   - In-flight booking requests debounced with 15-second duplicate submission guard.
   - Slot capacity checks prevent overbooking time windows.
6. **Payment Integrity:**
   - Positive amount validation; prevents overpayments exceeding remaining balance.
   - Requires valid 12-digit UTR reference for manual UPI recordings.
