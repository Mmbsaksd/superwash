# BUSINESS RULES SPECIFICATION
## SuperWash Exprez – Configurable Laundry Management Platform

- **Status:** Authoritative Confirmed Business Requirements
- **Effective Baseline Date:** Launch Baseline 2026-11-01
- **Domain:** Pricing, Weight Measurement, Advance Payments, Payment Gateways & Coupon Mechanics

---

## 1. Initial Pricing Model & Weight Invariants

### 1.1 Confirmed Initial Rates
- **Standard Laundry Price:** **₹79.00 per kilogram** (`7900` paise).
- **Minimum Billable Weight:** **1.00 kilogram** (`min_weight_kg = 1.00`).
- **Additional Weight Calculation:** Charged linearly at ₹79.00 per kg using exact integer-paise arithmetic (`ROUND(billable_weight * price_per_kg)`).
- **Initial Minimum Order Restriction:** **Disabled** (No artificial financial floor beyond the 1 kg billable minimum).

### 1.2 Illustrative Billing Matrix
| Actual Measured Weight | Minimum Billable Weight | Billable Weight Applied | Final Laundry Subtotal | Notes |
|:---|:---:|:---:|:---:|:---|
| 0.25 kg | 1.00 kg | 1.00 kg | **₹79.00** | Under minimum threshold; 1 kg minimum enforced |
| 0.50 kg | 1.00 kg | 1.00 kg | **₹79.00** | Under minimum threshold; 1 kg minimum enforced |
| 1.00 kg | 1.00 kg | 1.00 kg | **₹79.00** | Exact minimum weight |
| 1.50 kg | 1.00 kg | 1.50 kg | **₹118.50** | `1.5 * 79 = 118.50` (11850 paise) |
| 2.00 kg | 1.00 kg | 2.00 kg | **₹158.00** | Standard per-kg calculation |
| 3.00 kg | 1.00 kg | 3.00 kg | **₹237.00** | Standard per-kg calculation |
| 4.25 kg | 1.00 kg | 4.25 kg | **₹335.75** | `4.25 * 79 = 335.75` (33575 paise) |
| 5.00 kg | 1.00 kg | 5.00 kg | **₹395.00** | Standard per-kg calculation |

> [!IMPORTANT]
> **No Hardcoded Rates Rule:**
> The value `₹79` or `7900` must never be hardcoded into UI components, calculations, or triggers. All calculations must resolve the rate from the active database pricing configuration.

---

## 2. Future Minimum Weight & Order Restriction Rules

1. **Independent Dimensions:**
   - **Minimum Billable Weight (kg):** E.g. Future increase to `3.50 kg`.
   - **Minimum Order Amount (₹):** E.g. Future introduction of `₹300.00` minimum spend.
   - The business owner must be able to enable, disable, or adjust either restriction independently through the Admin Dashboard without developer intervention.
2. **Launch Baseline Defaults:**
   - `min_billable_weight = 1.00 kg` (Active).
   - `min_order_restriction_enabled = false` (Disabled).

---

## 3. Advance Payment Accounting Rules

### 3.1 Initial Launch Policy
- **Advance Payment Required:** **No** (`advance_payment_enabled = false`).
- Customers can complete bookings with **zero upfront deposit**.

### 3.2 Future Advance Payment Architecture
When enabled in the Admin Dashboard, the system supports:
1. **Calculation Modes:**
   - **Fixed Advance:** E.g. Flat ₹30 or ₹50 upfront.
   - **Percentage Advance:** E.g. 20% or 50% of the preliminary estimated bill.
   - **Full Advance:** 100% upfront payment.

### 3.3 Strict Accounting Invariant
> [!CAUTION]
> **Advances are NEVER an Additional Surcharge:**
> An advance payment is an advance deposit credited directly against the final order invoice. It must never be treated as additional revenue, a booking fee, or an extra service charge.

**Example Ledger Progression:**
1. Customer pays Advance at booking: **₹30.00**.
2. Clothes collected & weighed at facility; Final Invoice: **₹300.00**.
3. **Remaining Balance Due:** `₹300.00 - ₹30.00 = ₹270.00`.
4. Total Revenue Recognized: **₹300.00** (Not ₹330.00).

---

## 4. Payment Methods & Gateway Strategy

### 4.1 Initial Launch Model
1. **Cash on Delivery (COD):** **Enabled by default.** Handled by delivery associates at customer doorstep upon return delivery.
2. **Manual UPI (QR Code):** Handled via dynamic UPI QR code display and 12-digit UTR verification.
3. **Razorpay Online Gateway:** Prepared with secure architecture; **kept disabled** until production gateway credentials (`KEY_ID` and `KEY_SECRET`) are configured and verified.

### 4.2 Security Rules:
- Personal UPI payment verification must not be presented as an unmonitored automated gateway.
- Successful payment requires cryptographic HMAC-SHA256 signature verification or verified associate collection. Never simulate payment success.

---

## 5. Coupon Engine Specification (Option A)

### 5.1 Confirmed Decision: Actual Final Bill Evaluation
The preliminary booking estimate cannot determine final clothes weight. Therefore:
1. **At Booking Submission:**
   - The coupon code is validated for existence, active status, expiry, per-customer limits, and service eligibility.
   - **It is NOT rejected if the preliminary estimate is below the minimum order threshold.**
   - The coupon is **provisionally reserved** against the booking.
2. **At Final Store Intake Weighing:**
   - **Scenario A (Threshold Satisfied):** Actual weighed bill is ₹300 (>= ₹250 threshold). The ₹50 discount is applied; final invoice is ₹250; reservation transitions to **Redeemed**.
   - **Scenario B (Threshold Not Met):** Actual weighed bill is ₹180 (< ₹250 threshold). The discount is **not applied**; final invoice is ₹180; customer receives a clear explanation: *"Coupon WELCOME50 requires a minimum order of ₹250 (actual order subtotal: ₹180)."* The reservation is released without penalty.

---

## 6. Pricing Version Management & Historical Order Protection

1. **Immutable Historical Orders:**
   - Changing the laundry price (e.g. from ₹79/kg to ₹89/kg) in the Admin Dashboard creates a new pricing version.
   - **Historical orders created under previous versions remain 100% untouched.** Their invoice amounts, weight calculations, and receipts are never recalculated.
2. **Pricing Version Lifecycle:**
   - `draft` -> `scheduled` -> `active` -> `retired`.
   - Activating a new version automatically retires the previous version with an auditable timestamp and creator identity.

