# SuperWash Express — Production Operations & Laundry Management Platform

A fast, mobile-first laundry pickup and delivery web application designed for laundry businesses in India charging on a transparent **price-per-kilogram** basis.

Built with a high-integrity architecture prioritizing **strict data persistence**, **role-based security (RLS)**, **accurate Google Maps navigation**, **dynamic service-area coverage**, **extensible service catalogue**, and **period-based business analytics**.

---

## 1. Authoritative Architecture & Data Path

SuperWash Express operates with **Supabase PostgreSQL** as its single, authoritative shared source of truth.

- **Primary Data Path:** The React frontend interacts directly with Supabase PostgreSQL using Row Level Security (RLS) policies, database triggers, and database sequences.
- **Data Integrity:** In production mode (`VITE_DEMO_MODE=false`), business records (orders, payments, addresses, service areas, and feedback) are stored exclusively in the shared database. Failed database writes throw visible errors and never silently succeed or fall back to mock data.
- **Legacy FastAPI Backend:** The repository includes an optional FastAPI backend in `backend/`. This component is preserved for legacy or auxiliary microservice workflows, but the authoritative data path for the live web application is Supabase PostgreSQL.

---

## 2. Five Role-Based Operational Portals

| Role / View | Route | Primary Capabilities |
| :--- | :--- | :--- |
| **Public Landing Page** | `/` | Transparent ₹80/kg Pricing, Live Service-Area PIN Code Coverage Checker, 4-Step Process Walkthrough, Customer Reviews, Direct Booking CTA |
| **Customer Portal** | `/customer` | Book Home Pickup with GPS Location Capture (`navigator.geolocation`), Live Order Status Tracking, Order History, Bill Breakdown, Delivered Order Feedback (1-5★) |
| **Delivery Executive** | `/delivery` | Assigned Pickups & Deliveries, One-tap Call Customer, Enhanced **Navigate via Google Maps** (Directions API with GPS Coordinates or structured address fallback), Mark Collected, Mark Delivered, Record Doorstep Cash/UPI Payment |
| **Store Manager** | `/manager` | Collected Laundry Queue, Digital Scale Weight Entry (in kg) with automatic minimum-weight bill calculation, Status Workflow (Washing, Ready for Dispatch) |
| **Business Owner** | `/admin` | Executive Analytics Dashboard with period filtering (Today, Yesterday, This Week, Last Week, This Month, Last Month in `Asia/Kolkata` timezone), Period Growth Metrics, CSV Report Export, Payment Ledger & Receipts, Staff Role Accounts, Pricing & Minimum Weight Settings, Service Areas & PIN Coverage Manager, Extensible Service Catalogue, Customer Feedback Review |

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
- **Service Areas:** Creates `service_areas` table with unique 6-digit PIN code constraint and active/inactive status. Seeds core Bengaluru service zones (560038, 560008, 560103, 560075, 560001, 560066, 560037).
- **Extensible Services:** Creates `services` catalogue table seeded with "Wash & Fold (Normal)" at ₹80/kg.
- **Transaction-Safe Order Sequence:** Creates `order_number_seq` and allocation trigger.
- **Role Elevation Prevention Trigger:** Enforces database-level block preventing users from elevating their own profile role to `owner` or `manager`.
- **Payment Reconciliation Trigger:** Automatically keeps `orders.paid_amount_paise` and `orders.payment_status` in sync with the authoritative `payments` ledger.

---

## 4. Environment Configuration & Security Modes

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### Live Production Mode (`VITE_DEMO_MODE=false`)
- **Authentication:** Strict phone OTP verification via configured provider. Unauthenticated users start with `currentUser = null`. Failed or expired OTPs are strictly rejected. New profiles default to `customer` role.
- **Role Switcher:** Completely hidden and disabled in production builds.
- **Database:** Authoritative Supabase PostgreSQL.

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-live-anon-key-here
VITE_DEMO_MODE=false
```

### Development & Demo Mode (`VITE_DEMO_MODE=true` or Local Dev)
- **Simulated OTP:** Fixed development code `123456` for rapid local testing without SMS gateway credits.
- **Role Switcher Bar:** Visible at the top of the viewport to instantly toggle between Customer, Delivery, Manager, and Owner personas.

```env
VITE_DEMO_MODE=true
```

### Server-Side Secrets (Never Expose with `VITE_` Prefix)
Store these securely in Supabase Dashboard -> Project Settings -> Vault / Secrets:
- `SUPABASE_SERVICE_ROLE_KEY`: Administrative database migrations only.
- `WHATSAPP_API_TOKEN`: Meta WhatsApp Cloud API bearer token for server-side dispatch.
- `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp registered business phone number ID.

---

## 5. Running Locally & Testing

### Frontend
```bash
cd frontend
npm ci
npm test          # Run Vitest test suite
npm run build     # Verify TypeScript types and production bundle compilation
npm run dev       # Start local Vite development server at http://127.0.0.1:5173
```

### Backend (Optional Legacy Service)
```bash
cd backend
python -m pip install -r requirements.txt
python -m pytest tests -q
```

---

## 6. Key Business & Technical Features

1. **Precision Currency & Localization:**
   - All financial figures stored in exact integer paise (`amount_paise`).
   - Displayed in Indian Rupees (`₹`) formatted with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.
   - Local dates and reporting boundaries calculated in `Asia/Kolkata` (IST) timezone.
2. **Doorstep Navigation:**
   - Driver navigates using Google Maps Directions (`https://www.google.com/maps/dir/?api=1&destination=...`).
   - Prioritizes high-precision GPS coordinates (`pickup_latitude`, `pickup_longitude`) when captured with fallback to structured address, landmark, PIN, and city.
3. **Double-Click & Concurrency Protection:**
   - In-flight booking requests debounced with 15-second duplicate submission guard.
   - Slot capacity checks prevent overbooking time windows.
4. **Payment Integrity:**
   - Positive amount validation.
   - Prevents overpayments exceeding remaining balance.
   - Requires valid 12-digit UTR reference for manual UPI recordings.
