/**
 * SuperWash Exprez — Guest Booking Draft Lifecycle Manager
 * Key: 'superwash_guest_booking_draft' in sessionStorage
 *
 * Persists guest booking parameters across authentication redirects (especially Google OAuth),
 * component remounts, and browser reloads without data loss or credential leakage.
 */

export const GUEST_BOOKING_DRAFT_KEY = 'superwash_guest_booking_draft';
export const GUEST_BOOKING_DRAFT_TTL_MS = 60 * 60 * 1000; // 60 minutes default expiry
export const GUEST_BOOKING_DRAFT_VERSION = 1 as const;

export interface GuestCouponReference {
  code: string;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  discount_paise?: number;
  min_order_paise?: number;
  max_discount_paise?: number | null;
  description?: string;
}

export interface GuestBookingDraftPayload {
  service_ids: string[];
  service_id?: string;
  pickup_date: string;
  pickup_slot: string;
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  pickup_landmark?: string;
  pickup_pincode: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  coupon_code?: string;
  coupon_snapshot?: GuestCouponReference | null;
  booking_step: number;
  client_submission_id?: string;
  notes?: string;
}

export interface GuestBookingDraftRecord {
  version: typeof GUEST_BOOKING_DRAFT_VERSION;
  draftId: string;
  createdAt: number;
  updatedAt: number;
  payload: GuestBookingDraftPayload;
  boundUserId?: string | null;
  boundUserEmail?: string | null;
}

// In-memory fallback if sessionStorage is completely disabled or blocked in the browser
let memoryStorageFallback: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(key);
    }
  } catch {
    // SessionStorage restricted or inaccessible
  }
  return memoryStorageFallback[key] || null;
}

function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, value);
      return true;
    }
  } catch {
    // SessionStorage restricted, full or blocked
  }
  memoryStorageFallback[key] = value;
  return true;
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore error
  }
  delete memoryStorageFallback[key];
}

export function generateDraftId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 9);
  return `draft_${ts}_${rnd}`;
}

/**
 * Sanitizes the payload to strictly strip any sensitive fields, credentials, or tokens.
 */
function sanitizeDraftPayload(raw: Partial<GuestBookingDraftPayload>): GuestBookingDraftPayload {
  const serviceIds = Array.isArray(raw.service_ids)
    ? raw.service_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : raw.service_id
    ? [String(raw.service_id)]
    : [];

  const rawPhone = String(raw.customer_phone || '').replace(/[^0-9]/g, '').slice(-10);
  const rawPincode = String(raw.pickup_pincode || '').replace(/[^0-9]/g, '').slice(0, 6);

  let lat: number | null = null;
  if (typeof raw.pickup_latitude === 'number' && Number.isFinite(raw.pickup_latitude)) {
    lat = raw.pickup_latitude;
  }

  let lng: number | null = null;
  if (typeof raw.pickup_longitude === 'number' && Number.isFinite(raw.pickup_longitude)) {
    lng = raw.pickup_longitude;
  }

  let step = 1;
  if (typeof raw.booking_step === 'number' && raw.booking_step >= 1 && raw.booking_step <= 5) {
    step = Math.floor(raw.booking_step);
  }

  let couponSnapshot: GuestCouponReference | null = null;
  if (raw.coupon_snapshot && typeof raw.coupon_snapshot === 'object') {
    const snap = raw.coupon_snapshot as any;
    if (typeof snap.code === 'string' && snap.code.trim()) {
      couponSnapshot = {
        code: snap.code.trim().toUpperCase(),
        discount_type: snap.discount_type === 'percentage' ? 'percentage' : 'fixed',
        discount_value: typeof snap.discount_value === 'number' ? snap.discount_value : 0,
        discount_paise: typeof snap.discount_paise === 'number' ? snap.discount_paise : undefined,
        min_order_paise: typeof snap.min_order_paise === 'number' ? snap.min_order_paise : undefined,
        max_discount_paise: typeof snap.max_discount_paise === 'number' ? snap.max_discount_paise : null,
        description: typeof snap.description === 'string' ? snap.description : undefined
      };
    }
  }

  return {
    service_ids: serviceIds,
    service_id: serviceIds[0] || (raw.service_id ? String(raw.service_id) : undefined),
    pickup_date: typeof raw.pickup_date === 'string' ? raw.pickup_date.trim() : '',
    pickup_slot: typeof raw.pickup_slot === 'string' ? raw.pickup_slot.trim() : '',
    customer_name: typeof raw.customer_name === 'string' ? raw.customer_name.trim() : '',
    customer_phone: rawPhone,
    pickup_address: typeof raw.pickup_address === 'string' ? raw.pickup_address.trim() : '',
    pickup_landmark: typeof raw.pickup_landmark === 'string' ? raw.pickup_landmark.trim() : '',
    pickup_pincode: rawPincode,
    pickup_latitude: lat,
    pickup_longitude: lng,
    coupon_code: typeof raw.coupon_code === 'string' ? raw.coupon_code.trim().toUpperCase() : undefined,
    coupon_snapshot: couponSnapshot,
    booking_step: step,
    client_submission_id: typeof raw.client_submission_id === 'string' ? raw.client_submission_id.trim() : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes.trim() : undefined
  };
}

/**
 * Validates a candidate guest booking draft object.
 */
export function validateGuestBookingDraft(data: unknown): {
  isValid: boolean;
  draft?: GuestBookingDraftRecord;
  reason?: string;
} {
  if (!data || typeof data !== 'object') {
    return { isValid: false, reason: 'Draft is null or not an object' };
  }

  const candidate = data as any;

  if (candidate.version !== GUEST_BOOKING_DRAFT_VERSION) {
    return { isValid: false, reason: `Unsupported schema version: ${candidate.version}` };
  }

  if (typeof candidate.draftId !== 'string' || !candidate.draftId.trim()) {
    return { isValid: false, reason: 'Missing or invalid draftId' };
  }

  if (typeof candidate.createdAt !== 'number' || candidate.createdAt <= 0) {
    return { isValid: false, reason: 'Invalid createdAt timestamp' };
  }

  if (typeof candidate.updatedAt !== 'number' || candidate.updatedAt <= 0) {
    return { isValid: false, reason: 'Invalid updatedAt timestamp' };
  }

  if (!candidate.payload || typeof candidate.payload !== 'object') {
    return { isValid: false, reason: 'Missing payload object' };
  }

  // Check TTL expiry
  const now = Date.now();
  if (now - candidate.updatedAt > GUEST_BOOKING_DRAFT_TTL_MS) {
    return { isValid: false, reason: 'Draft has expired' };
  }

  const sanitized = sanitizeDraftPayload(candidate.payload);

  return {
    isValid: true,
    draft: {
      version: GUEST_BOOKING_DRAFT_VERSION,
      draftId: candidate.draftId,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      payload: sanitized,
      boundUserId: typeof candidate.boundUserId === 'string' ? candidate.boundUserId : null,
      boundUserEmail: typeof candidate.boundUserEmail === 'string' ? candidate.boundUserEmail : null
    }
  };
}

/**
 * Checks whether the draft contains meaningful user input (so we don't save empty drafts).
 */
export function hasMeaningfulDraftContent(payload: Partial<GuestBookingDraftPayload>): boolean {
  if (payload.service_ids && payload.service_ids.length > 0) return true;
  if (payload.pickup_address && payload.pickup_address.trim().length > 0) return true;
  if (payload.customer_phone && payload.customer_phone.trim().length >= 3) return true;
  if (payload.coupon_code && payload.coupon_code.trim().length > 0) return true;
  if (payload.pickup_latitude !== null && payload.pickup_latitude !== undefined) return true;
  return false;
}

/**
 * Safely saves a guest booking draft record into sessionStorage.
 */
export function saveGuestBookingDraft(
  payload: GuestBookingDraftPayload,
  options?: {
    draftId?: string;
    boundUserId?: string | null;
    boundUserEmail?: string | null;
  }
): GuestBookingDraftRecord | null {
  try {
    const sanitized = sanitizeDraftPayload(payload);
    const now = Date.now();

    // Check if an existing draft is in storage to preserve its draftId and createdAt
    let draftId = options?.draftId;
    let createdAt = now;

    const existingRaw = safeGetItem(GUEST_BOOKING_DRAFT_KEY);
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (parsed && parsed.draftId && !draftId) {
          draftId = parsed.draftId;
        }
        if (parsed && typeof parsed.createdAt === 'number') {
          createdAt = parsed.createdAt;
        }
      } catch {
        // overwrite corrupted draft
      }
    }

    if (!draftId) {
      draftId = generateDraftId();
    }

    const record: GuestBookingDraftRecord = {
      version: GUEST_BOOKING_DRAFT_VERSION,
      draftId,
      createdAt,
      updatedAt: now,
      payload: sanitized,
      boundUserId: options?.boundUserId || null,
      boundUserEmail: options?.boundUserEmail || null
    };

    safeSetItem(GUEST_BOOKING_DRAFT_KEY, JSON.stringify(record));
    return record;
  } catch (err) {
    console.warn('Notice saving guest booking draft:', err);
    return null;
  }
}

/**
 * Retrieves and validates the guest booking draft from sessionStorage.
 * Automatically clears the draft if corrupted or expired.
 */
export function getGuestBookingDraft(): GuestBookingDraftRecord | null {
  const raw = safeGetItem(GUEST_BOOKING_DRAFT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const { isValid, draft, reason } = validateGuestBookingDraft(parsed);

    if (!isValid || !draft) {
      // Corrupted or expired draft: clear safely
      safeRemoveItem(GUEST_BOOKING_DRAFT_KEY);
      if (reason?.includes('expired')) {
        console.info('Guest booking draft expired and was cleared.');
      }
      return null;
    }

    return draft;
  } catch (err) {
    safeRemoveItem(GUEST_BOOKING_DRAFT_KEY);
    return null;
  }
}

/**
 * Clears the guest booking draft from sessionStorage.
 */
export function clearGuestBookingDraft(): void {
  safeRemoveItem(GUEST_BOOKING_DRAFT_KEY);
}

/**
 * Checks whether the draft belongs to a different authenticated user.
 */
export function isDraftAccountMismatch(
  draft: GuestBookingDraftRecord,
  currentUserId?: string | null
): boolean {
  if (!draft.boundUserId) {
    // Unbound guest draft: safe to associate with any newly logging-in user
    return false;
  }
  if (!currentUserId) {
    return false;
  }
  return draft.boundUserId !== currentUserId;
}
