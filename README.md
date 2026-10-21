# SuperWash — Laundry & Dry Cleaning Management Platform

A production-grade, full-stack laundry and dry cleaning management web application tailored for local garment-care businesses in India (Bengaluru).

SuperWash supports both **customer self-service** (multi-step booking, secure tracking with phone verification, transparent GST invoices) and **business operations** (omnichannel order management, walk-in counter POS, garment intake & inspection, append-only workflow transitions, payment ledger, driver dispatch, and financial analytics).

---

## 1. Core Channels & Capabilities

1. **Shop Drop-Off:** Customers hand over clothes directly at the physical counter. Instant receipt generated, intake count verified, and zero delivery fee.
2. **Doorstep Pickup:** Customers select a 3-hour pickup window. Capacity limits prevent overbooking. Verified delivery associate is dispatched with laundry bags.
3. **Doorstep Delivery:** Processed, steam-ironed, and QC-passed clothes packaged in protective bags and delivered to the customer address.
4. **Walk-In Counter POS:** Store staff can instantly create walk-in orders with immediate garment itemization and cash/UPI collection.
5. **Accurate Indian Financials:** All prices and balances stored in integer paise (e.g. ₹30 = `3000` paise). 18% GST (9% CGST + 9% SGST) itemized. Immutable order-time snapshot pricing prevents catalogue updates from altering historical orders.
6. **Payment Modes:** Online Razorpay India gateway (with test sandbox and backend cryptographic signature verification), counter Cash, and manual UPI reference (UTR number).

---

## 2. Technology Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Router v7, TanStack Query, Lucide Icons.
- **Backend:** Python 3.13, FastAPI, Pydantic v2 (Settings & Schemas), SQLAlchemy 2.0 (ORM), Alembic (Migrations).
- **Database:** SQLite for zero-setup local experimentation; PostgreSQL 16 ready for production via Docker Compose.
- **Security:** Password hashing with `bcrypt`, JWT authentication (`HS256`), role-based authorization (Owner, Manager, Processing Staff, Delivery Driver, Customer).
- **Payments:** Razorpay India gateway integration with test mode, HMAC-SHA256 signature verification, and idempotent webhook handlers.
- **Testing:** Pytest (10 tests) for backend workflows and Vitest (4 tests) with React Testing Library for frontend components.

---

## 3. Seed Demo Accounts

The database is automatically pre-seeded on startup with the following test credentials:

| Role | Email / Phone | Password | Access Rights |
| :--- | :--- | :--- | :--- |
| **Owner (Admin)** | `admin@superwash.in` / `9876543210` | `Admin@123` | Full business access, analytics, pricing, staff management |
| **Store Manager** | `staff@superwash.in` / `9876543211` | `Staff@123` | Orders, customer intake, QC, payments, refunds |
| **Delivery Driver**| `driver@superwash.in` / `9876543215` | `Driver@123` | Assigned pickup & delivery tasks |
| **Customer** | `customer@superwash.in` / `9876543212` | `Customer@123` | Personal orders, saved addresses, invoices |

*(Quick 1-click sign-in buttons are also provided on the Login page for rapid evaluation.)*

---

## 4. Editable Catalogue Demonstration Prices

Pre-seeded sample prices (configurable in Admin > Services & Pricing):
- **Shirt Washing:** ₹30 per piece
- **Trouser Washing:** ₹40 per piece
- **T-Shirt Washing:** ₹25 per piece
- **Shirt Dry Cleaning:** ₹100 per piece
- **Suit (2-Piece) Dry Cleaning:** ₹300 per piece
- **Saree (Silk / Heavy) Dry Cleaning:** ₹200 per piece
- **Steam Ironing:** ₹15 per piece
- **Blanket Cleaning (Single / Double):** ₹150 / ₹250 per item
- **Bedsheet Cleaning:** ₹50 per item

---

## 5. Local Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm

### Backend Setup
```bash
# 1. Navigate to backend
cd backend

# 2. Activate virtual environment (Windows PowerShell)
..\venv\Scripts\Activate.ps1

# 3. Apply database migrations
alembic upgrade head

# 4. Start FastAPI server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
API Documentation will be available at:
- Swagger UI: `http://127.0.0.1:8000/api/v1/docs`
- ReDoc: `http://127.0.0.1:8000/api/v1/redoc`

### Frontend Setup
```bash
# 1. Open a new terminal in frontend directory
cd frontend

# 2. Install dependencies (if not already done)
npm install

# 3. Start Vite dev server
npm run dev
```
Website will be available at: `http://localhost:5173`

---

## 6. Running Automated Tests

### Backend Tests (Pytest)
```bash
cd backend
..\venv\Scripts\pytest -v
```
*Executes 10 automated test suites verifying customer authentication, role authorization, shop drop-off bookings, delivery fees, slot capacity validation, partial payments, Razorpay signature verification, and customer order isolation.*

### Frontend Tests (Vitest)
```bash
cd frontend
npm test
```
*Executes unit and component tests verifying status badges, payment badges, navigation, and order progression timelines.*

---

## 7. Production Deployment via Docker Compose

To deploy the entire production stack (PostgreSQL + FastAPI + Nginx React Frontend):

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Build and launch containers
docker-compose up -d --build

# 3. Check container logs
docker-compose logs -f
```

- **Frontend Website:** `http://localhost:3000`
- **Backend API:** `http://localhost:8000/api/v1/docs`
- **PostgreSQL Database:** `localhost:5432`

---

## 8. Razorpay Gateway Setup Guide

1. Sign up for a [Razorpay Merchant Account](https://dashboard.razorpay.com/).
2. Navigate to **Settings > API Keys** and generate **Key ID** and **Key Secret**.
3. In your `.env` or production environment variables, configure:
   ```env
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=your_razorpay_secret_key
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
   RAZORPAY_SANDBOX_MODE=false
   ```
4. Set the Webhook URL in Razorpay Dashboard to: `https://your-domain.com/api/v1/payments/webhook` with event `payment.captured`.
5. In development mode (`RAZORPAY_SANDBOX_MODE=true`), the system includes a test simulator that generates sandbox orders and validates backend signatures without requiring live credentials.

---

## 9. Implemented Features Checklist

- [x] **Customer Web Experience:** Clean landing page, live service menu, how it works comparison, multi-step booking wizard, and business contact.
- [x] **Omnichannel Booking:** Shop drop-off counter booking or doorstep pickup & delivery with address and time-slot selection.
- [x] **Secure Order Tracking:** Order timeline with timestamps; requires registered phone number to prevent unauthorized enumeration.
- [x] **Admin Dashboard:** Real-time KPI counters (orders today, in intake, in wash, awaiting QC, ready, pickups/deliveries scheduled, revenue, cash collected vs outstanding balance).
- [x] **Walk-In Counter POS:** Fast in-person order booking with immediate garment tally, price calculation, and cash/UPI receipt recording.
- [x] **Garment Processing State Machine:** Validated status progression: Placed -> Intake -> Inspection & Tagging -> Wash/Dry Clean -> Steam Iron -> QC -> Ready -> Out for Delivery -> Delivered.
- [x] **Intake & QC Logs:** Records actual garment count received, existing tears/stains, customer care instructions, and QC pass/fail.
- [x] **Service Catalogue Management:** Live pricing updates per item/kg without code alteration, preserving historical snapshot integrity.
- [x] **Payments & Ledger:** Razorpay online checkout, manual Cash recording, UPI UTR reference recording, partial payments, and refund processing.
- [x] **Printable Tax Invoices:** Official GST invoices with CGST/SGST itemization, company details, customer details, and receipt summaries.
- [x] **Logistics & Capacity:** Serviceable Bengaluru PIN codes, 3-hour pickup windows, and capacity limit validation.
- [x] **Business Analytics:** Revenue, cash flow, channel breakdown, popular garments, and CSV export.
