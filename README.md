# SuperWash Express — Mobile-First Laundry Pickup & Delivery App

A fast, mobile-first laundry pickup and delivery web application built for local laundry businesses in India charging solely on a **price-per-kilogram** basis.

The application is purpose-built to be minimal, intuitive, and frictionless for **Customers**, **Delivery Staff**, **Store Managers**, and the **Business Owner**.

---

## 1. Business Workflow & Architecture

The workflow consists of an 8-stage operational progression:

1. **Customer Books Pickup:** Customer enters mobile number, receives OTP, selects address, date, and 3-hour pickup window.
2. **Delivery Staff Collects:** Delivery person receives assigned job on mobile, uses 1-click **Call Customer** or **Open Maps** link, and marks clothes as **Collected** with an optional bag count/note.
3. **Store Manager Weighs:** Clothes arrive at the shop. The manager enters the measured weight on digital scale (in kg). The system automatically calculates the bill using safe integer arithmetic:
   $$\text{Billable Weight} = \max(\text{Measured Weight}, \text{Min Weight})$$
   $$\text{Total Bill} = (\text{Billable Weight} \times \text{Price per kg}) + \text{Delivery Fee}$$
4. **Washing & Finishing:** Manager marks order as **Washing**, followed by **Ready for Delivery**.
5. **Delivery & Doorstep Payment:** Delivery staff delivers clean clothes. Payment is collected via **Cash** or **UPI (with dynamic QR code & 12-digit UTR reference)**.
6. **Order Tracking:** The customer tracks progress, measured weight, and receipt status in real time.

---

## 2. Five Dedicated Views & Roles

| Role / View | Route | Primary Functions |
| :--- | :--- | :--- |
| **Public Landing Page** | `/` | Transparent ₹80/kg Pricing, PIN Code Coverage Checker, 4-Step Process, FAQ, Terms, Direct Booking CTA |
| **Customer Portal** | `/customer` | Book Home Pickup, Live Order Tracking, Order History, Delivered Order Feedback (1-5★), Saved Addresses |
| **Delivery Staff** | `/delivery` | Today's Pickups & Today's Deliveries, Call Customer, Open Maps, Mark Collected, Mark Delivered, Collect Cash/UPI |
| **Store Manager** | `/manager` | Collected/New Orders, Enter Measured Weight in kg, Live Bill Preview, Start Washing, Ready for Delivery |
| **Owner / Admin** | `/admin` | Real-time KPIs, Revenue & Dues, Pricing Settings, Serviceable PINs, Private Customer Feedback & Quality Tracker |

---

## 3. Technology Stack

- **Frontend & PWA:** React 19, TypeScript, Vite, Tailwind CSS, React Router v7, Lucide Icons.
- **Database & Backend:** Supabase PostgreSQL with complete Row Level Security (RLS) policies.
- **Local Resilience:** Automatic offline-first fallback with local storage persistence, enabling full functionality even without active internet or third-party SMS credits.
- **Notifications:** Safe WhatsApp Business message dispatcher that falls back to logging without blocking order flows.
- **Testing:** Vitest with React Testing Library.

---

## 4. Setup & Running Locally

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### 1. Clone & Install Dependencies
```bash
cd f:\superwash\frontend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Default settings are pre-configured:
```env
VITE_BUSINESS_NAME=SuperWash Express
VITE_BUSINESS_PHONE=+91 98765 43210
VITE_PRICE_PER_KG=80
VITE_MIN_WEIGHT_KG=3
VITE_DELIVERY_CHARGE=0
VITE_BUSINESS_UPI_ID=superwash@upi
VITE_AUTH_TEST_MODE=true
```

### 3. Run Development Server
```bash
npm run dev
```
Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)** on your phone or browser in a mobile viewport (e.g. 390x844).

### 4. Run Unit Tests & Build
```bash
npm test          # Runs 9 comprehensive Vitest unit tests
npm run build     # Runs TypeScript type check and production bundle compilation
```

---

## 5. Supabase PostgreSQL Setup & Migrations

A production PostgreSQL schema with Row Level Security (RLS) is provided in `supabase/migrations/20261021_initial_schema.sql`.

### Applying Migrations to Supabase:
1. Log in to your [Supabase Dashboard](https://supabase.com).
2. Create a new project (e.g., `superwash-db`).
3. Navigate to **SQL Editor** in the left sidebar.
4. Copy and paste the contents of `supabase/migrations/20261021_initial_schema.sql` and click **Run**.
5. Copy your **Project URL** and **Anon Key** from `Project Settings > API` into your `.env` file:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

### Row Level Security (RLS) Guarantees:
- Customers can only select and view their own orders (`customer_id = auth.uid()`).
- Delivery staff can only view orders assigned to them or unassigned pending pickups.
- Store managers and owners have access to operational orders.
- Only owners can modify prices or alter business settings.

---

## 6. Authentication & Role Testing

### Phone OTP Authentication
- The app uses standard Indian phone numbers (`+91`).
- When live Supabase is configured with an SMS provider (Twilio, MessageBird), an SMS OTP is delivered to the user.
- For local development and demonstration, **Test OTP `123456`** is pre-configured.

### Quick 1-Click Role Switcher
A top navigation bar is provided in the development interface for testing:
- **Priya Patel (Customer)** — `9876543212`
- **Ramesh Kumar (Delivery Staff)** — `9876543215`
- **Ananya Verma (Store Manager)** — `9876543211`
- **Rajesh Sharma (Business Owner)** — `9876543210`

---

## 7. Pricing by Kilogram & Snapshot Integrity

- **Configurable in Admin:** The business owner can change the price per kg (e.g., ₹80/kg), minimum billable weight (e.g., 3 kg), and delivery charges at any time from `/admin > Pricing & Settings`.
- **Snapshot Rule:** When an order is booked and weighed, the active rates are immutably copied into the order row (`price_per_kg_paise`, `min_weight_kg`, `delivery_charge_paise`). Subsequent changes to the business pricing do not alter historical orders.
- **Safe Integer Arithmetic:** All calculations are performed in integer paise (1 Rupee = 100 paise) to prevent floating-point rounding errors.

---

## 8. WhatsApp Business Notifications

The optional WhatsApp integration uses the official Meta Cloud API.
To enable:
```env
VITE_WHATSAPP_ENABLED=true
VITE_WHATSAPP_API_URL=https://graph.facebook.com/v19.0/<PHONE_NUMBER_ID>/messages
VITE_WHATSAPP_BEARER_TOKEN=<SYSTEM_USER_ACCESS_TOKEN>
```
If WhatsApp credentials are missing or the API returns an error, notifications gracefully fall back to internal logging without blocking order creation, weight entry, or payment recording.

---

## 9. Verification & Automated Test Results

The application includes automated Vitest unit tests covering:
- Standard weight calculation ($5.0\text{ kg} \times ₹80 = ₹400$).
- Minimum billable weight rule ($2.0\text{ kg}$ measured with $3.0\text{ kg}$ minimum $= ₹240$).
- Snapshot immutability when global prices are updated.
- Cash and UPI partial payment balance calculations.
- Complete 8-stage order lifecycle transitions.
- All 9 tests pass with 100% success rate.
