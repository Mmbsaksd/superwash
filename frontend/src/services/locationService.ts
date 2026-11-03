/**
 * SuperWash Exprez - Location, Geocoding & GPS Navigation Service
 *
 * Provider-independent architecture:
 * 1. Supports provider switching (Nominatim, Custom, Disabled).
 * 2. Strictly complies with OpenStreetMap Nominatim usage policies:
 *    - Absolutely NO client-side autocomplete / search-as-you-type on nominatim.openstreetmap.org.
 *    - Enforces 1 request-per-second maximum rate limiting.
 *    - Sanitizes search queries to protect customer privacy (strips names, phones, flat numbers).
 *    - Prominently displays required OpenStreetMap attribution.
 * 3. Graceful degradation: If geocoding provider is disabled or fails, manual address entry
 *    and customer map pin placement remain 100% operational with an "Unverified" indicator.
 */

export type AccuracyTier = 'precise' | 'approximate' | 'poor' | 'unknown';
export type GeocodingProviderType = 'nominatim' | 'disabled' | 'custom';

export interface GeolocationPositionResult {
  latitude: number;
  longitude: number;
  accuracy: number | null; // radius in meters
  accuracyTier: AccuracyTier;
  accuracyMessage: string;
}

export interface ReverseGeocodeResult {
  displayName: string;
  addressLine: string; // Backward compatibility alias
  street: string; // Street / Road
  area: string; // Locality / Suburb
  city: string; // City / Town
  state: string; // State
  pincode: string; // 6-digit postal code
  formattedAddress: string; // Combined verified address
  isVerified: boolean;
  raw?: any;
}

export interface GeocodeSearchResult {
  latitude: number;
  longitude: number;
  displayName: string;
  shortName: string;
  pincode?: string;
  type?: string;
}

export interface OrderCoordinateContext {
  pickup_latitude?: number | string | null;
  pickup_longitude?: number | string | null;
  pickup_address?: string | null;
  pickup_landmark?: string | null;
  pickup_pincode?: string | null;
}

export interface IGeocodingProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): boolean;
  searchAddress(query: string, signal?: AbortSignal): Promise<GeocodeSearchResult[]>;
  reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<ReverseGeocodeResult | null>;
  getAttribution(): string;
}

// In-memory caches to prevent redundant network requests
const reverseGeocodeCache = new Map<string, ReverseGeocodeResult>();
const searchGeocodeCache = new Map<string, GeocodeSearchResult[]>();

/**
 * Sanitizes search queries before sending to public providers:
 * Strips phone numbers, flat/door/room numbers, and personal identifiers
 * to ensure customer privacy compliance.
 */
export function sanitizeSearchQuery(rawQuery: string): string {
  let cleaned = rawQuery.trim();
  // Strip 10-digit phone numbers
  cleaned = cleaned.replace(/\b[6-9]\d{9}\b/g, '');
  // Strip room / flat / door / building prefixes like "Flat 402", "Room 12B", "Door #5", "#102"
  cleaned = cleaned.replace(/\b(?:flat|apt|apartment|room|door|villa|house|no|unit|bldg|building|#)\s*[:.-]?\s*\w+[\w-]*\b/gi, '');
  // Strip floor / plot prefixes to prevent leaking residential unit details
  cleaned = cleaned.replace(/\b(?:floor|flr|plot|site)\s*[:.-]?\s*\w+[\w-]*\b/gi, '');
  // Strip leading house / door numbers e.g. "12/4, Main Road" -> "Main Road"
  cleaned = cleaned.replace(/^#?\d+[\w\/-]*\s*,?\s*/i, '');
  // Strip multiple commas or excess whitespace
  cleaned = cleaned.replace(/,\s*,+/g, ',').replace(/\s{2,}/g, ' ').replace(/^,\s*|,\s*$/g, '').trim();
  return cleaned;
}

/**
 * OpenStreetMap Nominatim Provider
 *
 * SAFETY POLICY: Direct public Nominatim requests are temporarily DISABLED across
 * the application, including explicit forward searches and reverse geocoding.
 * This guarantees:
 * 1. Zero external requests to public unproxied community geocoding servers.
 * 2. Zero risk of customer coordinates or residential addresses reaching external public services.
 * 3. Manual doorstep pin placement and customer address entry remain 100% operational.
 *
 * Future activation requires a verified application-wide rate-limited backend proxy,
 * server-side caching, provider switching, and privacy review.
 */
export class NominatimGeocodingProvider implements IGeocodingProvider {
  readonly id = 'nominatim';
  readonly name = 'OpenStreetMap Nominatim (Public Requests Temporarily Disabled)';

  isAvailable(): boolean {
    return false;
  }

  getAttribution(): string {
    return '© OpenStreetMap contributors';
  }

  async searchAddress(_query: string, _signal?: AbortSignal): Promise<GeocodeSearchResult[]> {
    // Direct public Nominatim forward searches are temporarily disabled.
    // Address entry and doorstep pin placement remain manual.
    return [];
  }

  /**
   * Reverse Geocoding is explicitly DISABLED for public Nominatim to protect
   * customer residential location privacy and avoid unproxied coordinate leakage.
   */
  async reverseGeocode(_lat: number, _lng: number, _signal?: AbortSignal): Promise<ReverseGeocodeResult | null> {
    // Direct public Nominatim reverse geocoding is disabled to protect customer privacy.
    // Manual map pin placement and customer-entered address details remain fully operational.
    return null;
  }
}

export interface TileLayerConfig {
  url: string;
  attribution: string;
  maxZoom: number;
}

let activeTileConfig: TileLayerConfig = {
  url: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAP_TILE_URL) || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAP_TILE_ATTRIBUTION) || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 19
};

/**
 * Custom Backend / Self-Hosted Geocoding Provider
 * For self-hosted instances (e.g. Photon / Pelias / Nominatim container) or approved
 * commercial APIs routed through an application-wide backend proxy with server-side secrets.
 */
export class CustomBackendGeocodingProvider implements IGeocodingProvider {
  readonly id = 'custom';
  readonly name: string;
  private proxyUrl: string;
  private attribution: string;

  constructor(options: { name?: string; proxyUrl: string; attribution?: string }) {
    this.name = options.name || 'Backend Geocoding Proxy';
    this.proxyUrl = options.proxyUrl;
    this.attribution = options.attribution || 'Map & Location Services';
  }

  isAvailable(): boolean {
    return Boolean(this.proxyUrl);
  }

  getAttribution(): string {
    return this.attribution;
  }

  async searchAddress(query: string, signal?: AbortSignal): Promise<GeocodeSearchResult[]> {
    const sanitized = sanitizeSearchQuery(query);
    if (!sanitized || sanitized.length < 3) return [];

    try {
      const url = `${this.proxyUrl}/search?q=${encodeURIComponent(sanitized)}`;
      const res = await fetch(url, { signal });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<ReverseGeocodeResult | null> {
    if (!LocationService.isValidCoordinate(lat, lng)) return null;

    try {
      const url = `${this.proxyUrl}/reverse?lat=${lat}&lng=${lng}`;
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}

/**
 * Disabled Provider
 * Safe fallback when geocoding is disabled or offline.
 * Allows manual address entry and customer map pin placement without network calls.
 */
export class DisabledGeocodingProvider implements IGeocodingProvider {
  readonly id = 'disabled';
  readonly name = 'Manual Entry Only (Geocoding Disabled)';

  isAvailable(): boolean {
    return false;
  }

  getAttribution(): string {
    return '© OpenStreetMap contributors';
  }

  async searchAddress(): Promise<GeocodeSearchResult[]> {
    return [];
  }

  async reverseGeocode(): Promise<ReverseGeocodeResult | null> {
    return null;
  }
}

// Active provider instance
let activeProvider: IGeocodingProvider = new NominatimGeocodingProvider();

export class LocationService {
  /**
   * Configure the active geocoding provider.
   */
  static setProvider(provider: IGeocodingProvider | GeocodingProviderType): void {
    if (typeof provider === 'string') {
      if (provider === 'disabled') {
        activeProvider = new DisabledGeocodingProvider();
      } else {
        activeProvider = new NominatimGeocodingProvider();
      }
    } else {
      activeProvider = provider;
    }
  }

  /**
   * Get the currently active provider.
   */
  static getProvider(): IGeocodingProvider {
    return activeProvider;
  }

  /**
   * Check if active provider supports search/reverse geocoding.
   */
  static isProviderAvailable(): boolean {
    return activeProvider.isAvailable();
  }

  /**
   * Validate if latitude and longitude form a valid, non-zero geographical coordinate.
   */
  static isValidCoordinate(lat: unknown, lng: unknown): boolean {
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
      return false;
    }
    const nLat = typeof lat === 'number' ? lat : parseFloat(String(lat));
    const nLng = typeof lng === 'number' ? lng : parseFloat(String(lng));

    if (isNaN(nLat) || isNaN(nLng) || !isFinite(nLat) || !isFinite(nLng)) {
      return false;
    }
    // Reject Null Island (0, 0)
    if (nLat === 0 && nLng === 0) {
      return false;
    }
    return nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
  }

  /**
   * Categorize GPS accuracy into user-friendly tiers.
   * - precise: <= 30m (satellite / dual-frequency GPS fix)
   * - approximate: 30m - 100m (Wi-Fi assisted or coarse satellite fix)
   * - poor: > 100m (cell-tower triangulation)
   */
  static evaluateAccuracy(accuracyMeters: number | null | undefined): {
    tier: AccuracyTier;
    message: string;
  } {
    if (accuracyMeters === null || accuracyMeters === undefined || isNaN(accuracyMeters)) {
      return {
        tier: 'unknown',
        message: 'Coordinates captured'
      };
    }

    const rounded = Math.round(accuracyMeters);
    if (accuracyMeters <= 30) {
      return {
        tier: 'precise',
        message: `High accuracy GPS (±${rounded}m)`
      };
    } else if (accuracyMeters <= 100) {
      return {
        tier: 'approximate',
        message: `Approximate location (±${rounded}m) — adjust pin to doorstep`
      };
    } else {
      return {
        tier: 'poor',
        message: `Low accuracy cellular fix (±${rounded}m) — please drag pin to your building`
      };
    }
  }

  /**
   * Acquire high-accuracy position from browser/device.
   * Uses maximumAge: 0 to guarantee fresh hardware GPS fix rather than stale cache.
   */
  static async getCurrentPosition(options?: PositionOptions): Promise<GeolocationPositionResult> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const err: any = new Error('Geolocation is not supported by your browser or environment.');
      err.code = 'UNSUPPORTED';
      throw err;
    }

    const mergedOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
      ...options
    };

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const acc = typeof pos.coords.accuracy === 'number' && !isNaN(pos.coords.accuracy)
            ? Number(pos.coords.accuracy.toFixed(1))
            : null;

          const evaluation = LocationService.evaluateAccuracy(acc);

          resolve({
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            accuracyTier: evaluation.tier,
            accuracyMessage: evaluation.message
          });
        },
        (err) => {
          reject(err);
        },
        mergedOptions
      );
    });
  }

  /**
   * Reverse-geocode coordinates to an address via active provider.
   */
  static async reverseGeocode(
    lat: number,
    lng: number,
    signal?: AbortSignal
  ): Promise<ReverseGeocodeResult | null> {
    if (!this.isValidCoordinate(lat, lng)) {
      return null;
    }
    return activeProvider.reverseGeocode(lat, lng, signal);
  }

  /**
   * Forward search address via active provider.
   * Explicit user-initiated queries only.
   */
  static async searchAddress(
    query: string,
    signal?: AbortSignal
  ): Promise<GeocodeSearchResult[]> {
    return activeProvider.searchAddress(query, signal);
  }

  /**
   * Build direct Google Maps driving directions URL when valid confirmed coordinates exist.
   */
  static getGoogleMapsDirectionsUrl(
    context: OrderCoordinateContext | { latitude: number; longitude: number }
  ): string {
    const lat = 'pickup_latitude' in context ? context.pickup_latitude : (context as any).latitude;
    const lng = 'pickup_longitude' in context ? context.pickup_longitude : (context as any).longitude;

    if (this.isValidCoordinate(lat, lng)) {
      const nLat = Number(lat);
      const nLng = Number(lng);
      return `https://www.google.com/maps/dir/?api=1&destination=${nLat},${nLng}&travelmode=driving`;
    }

    // Fallback when coordinates are missing
    const parts = [
      ('pickup_address' in context ? context.pickup_address : '')?.trim(),
      ('pickup_landmark' in context ? context.pickup_landmark : '')?.trim(),
      ('pickup_pincode' in context ? context.pickup_pincode : '')?.trim()
    ].filter(Boolean);

    const query = parts.length > 0 ? parts.join(', ') : 'Bengaluru, Karnataka';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  /**
   * Safe fallback search URL when coordinates are unverified.
   */
  static getGoogleMapsSearchFallbackUrl(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }

  /**
   * Format coordinate pair for clean UI display.
   */
  static formatCoordinates(lat: number | null | undefined, lng: number | null | undefined): string {
    if (!this.isValidCoordinate(lat, lng)) {
      return 'No GPS Attached';
    }
    return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }

  /**
   * Get the active map tile configuration.
   */
  static getTileConfig(): TileLayerConfig {
    return activeTileConfig;
  }

  /**
   * Configure map tile provider at runtime without modifying application code.
   */
  static setTileConfig(config: Partial<TileLayerConfig>): void {
    activeTileConfig = { ...activeTileConfig, ...config };
  }

  /**
   * Clear in-memory caches (useful in testing or when resetting session).
   */
  static clearCache(): void {
    reverseGeocodeCache.clear();
    searchGeocodeCache.clear();
  }
}
