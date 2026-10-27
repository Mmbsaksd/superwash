/**
 * SuperWash Exprez — Refresh-Safe Pending Booking Lifecycle Manager
 * Key: 'superwash_pending_booking' in sessionStorage
 */

export const PENDING_BOOKING_KEY = 'superwash_pending_booking';
export const PENDING_BOOKING_TTL_MS = 15 * 60 * 1000; // 15 minutes default expiry

export interface PendingBookingPayload {
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  pickup_landmark?: string;
  pickup_pincode: string;
  pickup_date: string;
  pickup_slot: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  service_id?: string;
  notes?: string;
  coupon_code?: string;
  discount_paise?: number;
}

export interface PendingBookingRecord {
  userId: string;
  clientSubmissionId: string;
  payload: PendingBookingPayload;
  fingerprint: string;
  status: 'in_flight' | 'uncertain_timeout';
  createdAt: number;
  updatedAt: number;
}

/**
 * Computes a deterministic normalized fingerprint of the core booking parameters.
 * Used to detect whether the customer modified any booking details.
 */
export function calculateBookingFingerprint(payload: Partial<PendingBookingPayload>): string {
  const phone = (payload.customer_phone || '').replace(/[^0-9]/g, '').slice(-10);
  const address = (payload.pickup_address || '').trim().toLowerCase();
  const pincode = (payload.pickup_pincode || '').trim();
  const date = (payload.pickup_date || '').trim();
  const slot = (payload.pickup_slot || '').trim().toLowerCase();
  const service = (payload.service_id || '').trim();
  const coupon = (payload.coupon_code || '').trim().toUpperCase();
  return `${phone}|${pincode}|${date}|${slot}|${service}|${address}|${coupon}`;
}

/**
 * Safely saves a pending booking record into sessionStorage.
 * Never throws if sessionStorage is restricted, full, or unavailable.
 */
export function savePendingBooking(
  userId: string,
  clientSubmissionId: string,
  payload: PendingBookingPayload,
  status: 'in_flight' | 'uncertain_timeout'
): PendingBookingRecord | null {
  if (typeof sessionStorage === 'undefined' || !userId || !clientSubmissionId) {
    return null;
  }

  try {
    const now = Date.now();
    const fingerprint = calculateBookingFingerprint(payload);
    const record: PendingBookingRecord = {
      userId,
      clientSubmissionId,
      payload,
      fingerprint,
      status,
      createdAt: now,
      updatedAt: now
    };

    sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(record));
    return record;
  } catch (err) {
    console.warn('Notice saving pending booking to sessionStorage:', err);
    return null;
  }
}

/**
 * Retrieves the pending booking record from sessionStorage.
 * Verifies that:
 * 1. The record is valid JSON.
 * 2. The record belongs strictly to the requested authenticated user.
 * 3. Its fingerprint matches the stored payload.
 *
 * NOTE: If the record has expired but has status 'uncertain_timeout', it is NOT silently discarded;
 * it is returned so the application can resolve whether the original order was committed.
 */
export function getPendingBooking(userId?: string | null): PendingBookingRecord | null {
  if (typeof sessionStorage === 'undefined' || !userId) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
    if (!raw) return null;

    const record: PendingBookingRecord = JSON.parse(raw);
    if (!record || typeof record !== 'object') {
      sessionStorage.removeItem(PENDING_BOOKING_KEY);
      return null;
    }

    // Security invariant: Never restore one customer's pending booking into another customer's session
    if (record.userId !== userId) {
      sessionStorage.removeItem(PENDING_BOOKING_KEY);
      return null;
    }

    // Integrity check: verify fingerprint
    const expectedFingerprint = calculateBookingFingerprint(record.payload);
    if (record.fingerprint !== expectedFingerprint) {
      sessionStorage.removeItem(PENDING_BOOKING_KEY);
      return null;
    }

    // Expiry check:
    // If an in_flight submission exceeded the 15-minute TTL without updating to uncertain_timeout,
    // it is considered abandoned.
    // However, if status is 'uncertain_timeout', do NOT silently discard it; allow resolution.
    const isExpired = Date.now() - record.createdAt > PENDING_BOOKING_TTL_MS;
    if (isExpired && record.status === 'in_flight') {
      sessionStorage.removeItem(PENDING_BOOKING_KEY);
      return null;
    }

    return record;
  } catch (err) {
    try {
      sessionStorage.removeItem(PENDING_BOOKING_KEY);
    } catch {}
    return null;
  }
}

/**
 * Updates the status of an existing pending booking record in sessionStorage.
 */
export function updatePendingBookingStatus(
  status: 'in_flight' | 'uncertain_timeout'
): PendingBookingRecord | null {
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
    if (!raw) return null;

    const record: PendingBookingRecord = JSON.parse(raw);
    record.status = status;
    record.updatedAt = Date.now();
    sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

/**
 * Clears the pending booking from sessionStorage.
 * If userId is provided, only removes if the stored record belongs to that user.
 */
export function clearPendingBooking(userId?: string | null): void {
  if (typeof sessionStorage === 'undefined') return;

  try {
    if (userId) {
      const raw = sessionStorage.getItem(PENDING_BOOKING_KEY);
      if (raw) {
        const record = JSON.parse(raw);
        if (record?.userId && record.userId !== userId) {
          return; // Do not clear if for a different user
        }
      }
    }
    sessionStorage.removeItem(PENDING_BOOKING_KEY);
  } catch (err) {
    console.warn('Notice clearing pending booking from sessionStorage:', err);
  }
}

/**
 * Distinguishes ambiguous connection/timeout failures from definitive validation/authorization rejections.
 * Returns true if the failure is ambiguous (where database may have committed the transaction before
 * the response could reach the client), and false for definitive business rejections.
 */
export function isAmbiguousNetworkError(error: any): boolean {
  if (!error) return false;

  const msg = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  const status = error?.status || error?.statusCode;

  // Service unavailable errors (e.g. pending DB migration) must preserve the pending booking
  if (
    error?.code === 'BOOKING_SERVICE_UNAVAILABLE' ||
    msg.includes('booking service is temporarily unavailable') ||
    msg.includes('temporarily unavailable while database upgrades')
  ) {
    return true;
  }

  // Definitive client/business validation errors — NOT ambiguous
  if (
    msg.includes('outside our service coverage') ||
    msg.includes('fully booked') ||
    msg.includes('10-digit') ||
    msg.includes('deactivated') ||
    msg.includes('not found in catalogue') ||
    msg.includes('row-level security') ||
    msg.includes('violates check constraint') ||
    msg.includes('security violation') ||
    msg.includes('authentication required') ||
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 422
  ) {
    return false;
  }

  // Ambiguous network transport or server timeout conditions
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('abort') ||
    msg.includes('connection refused') ||
    msg.includes('gateway') ||
    name === 'aborterror' ||
    name === 'typeerror' ||
    status === 504 ||
    status === 502 ||
    status === 503 ||
    status === 524
  ) {
    return true;
  }

  // Default to treating generic unexpected errors during network request as ambiguous to prevent double-booking
  return true;
}
