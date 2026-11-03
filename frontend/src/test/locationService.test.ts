import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LocationService,
  sanitizeSearchQuery,
  DisabledGeocodingProvider,
  NominatimGeocodingProvider,
  CustomBackendGeocodingProvider
} from '../services/locationService';

describe('LocationService Authoritative Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    LocationService.setProvider('nominatim');
    LocationService.clearCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    LocationService.setProvider('nominatim');
  });

  describe('1. Coordinate Validation & Bounding', () => {
    it('validates legitimate geographical coordinates in Bengaluru', () => {
      expect(LocationService.isValidCoordinate(12.971598, 77.594562)).toBe(true);
      expect(LocationService.isValidCoordinate('12.971598', '77.594562')).toBe(true);
      expect(LocationService.isValidCoordinate(12.9352, 77.6245)).toBe(true);
    });

    it('rejects Null Island (0, 0)', () => {
      expect(LocationService.isValidCoordinate(0, 0)).toBe(false);
      expect(LocationService.isValidCoordinate('0', '0')).toBe(false);
      expect(LocationService.isValidCoordinate(0.0, 0.0)).toBe(false);
    });

    it('rejects null, undefined, NaN, and non-numeric strings', () => {
      expect(LocationService.isValidCoordinate(null, null)).toBe(false);
      expect(LocationService.isValidCoordinate(undefined, 77.59)).toBe(false);
      expect(LocationService.isValidCoordinate(12.97, undefined)).toBe(false);
      expect(LocationService.isValidCoordinate(NaN, 77.59)).toBe(false);
      expect(LocationService.isValidCoordinate('invalid', 'coord')).toBe(false);
    });

    it('rejects out-of-bounds coordinates', () => {
      expect(LocationService.isValidCoordinate(90.1, 77.59)).toBe(false);
      expect(LocationService.isValidCoordinate(-90.1, 77.59)).toBe(false);
      expect(LocationService.isValidCoordinate(12.97, 180.1)).toBe(false);
      expect(LocationService.isValidCoordinate(12.97, -180.1)).toBe(false);
    });
  });

  describe('2. GPS Accuracy Tier Evaluation', () => {
    it('categorizes accuracy <= 30m as precise', () => {
      const res = LocationService.evaluateAccuracy(12.4);
      expect(res.tier).toBe('precise');
      expect(res.message).toContain('High accuracy GPS');
      expect(res.message).toContain('±12m');
    });

    it('categorizes accuracy between 31m and 100m as approximate', () => {
      const res = LocationService.evaluateAccuracy(65.8);
      expect(res.tier).toBe('approximate');
      expect(res.message).toContain('Approximate location');
      expect(res.message).toContain('±66m');
    });

    it('categorizes accuracy > 100m as poor with user warning to adjust pin', () => {
      const res = LocationService.evaluateAccuracy(350);
      expect(res.tier).toBe('poor');
      expect(res.message).toContain('Low accuracy cellular fix');
      expect(res.message).toContain('±350m');
    });

    it('handles null and undefined accuracy gracefully', () => {
      const resNull = LocationService.evaluateAccuracy(null);
      expect(resNull.tier).toBe('unknown');
      expect(resNull.message).toBe('Coordinates captured');

      const resUndef = LocationService.evaluateAccuracy(undefined);
      expect(resUndef.tier).toBe('unknown');
    });
  });

  describe('3. Hardware GPS Acquisition with maximumAge: 0', () => {
    it('requests fresh position with high accuracy and maximumAge: 0', async () => {
      const mockGetCurrentPosition = vi.fn().mockImplementation((success) => {
        success({
          coords: {
            latitude: 12.971598,
            longitude: 77.594563,
            accuracy: 8.5
          }
        });
      });

      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: mockGetCurrentPosition
        }
      });

      const pos = await LocationService.getCurrentPosition();

      expect(mockGetCurrentPosition).toHaveBeenCalled();
      const calledOptions = mockGetCurrentPosition.mock.calls[0][2];
      expect(calledOptions.enableHighAccuracy).toBe(true);
      expect(calledOptions.maximumAge).toBe(0);
      expect(calledOptions.timeout).toBe(10000);

      expect(pos.latitude).toBeCloseTo(12.971598, 5);
      expect(pos.longitude).toBeCloseTo(77.594563, 5);
      expect(pos.accuracy).toBe(8.5);
      expect(pos.accuracyTier).toBe('precise');
    });

    it('rejects when browser denies permission', async () => {
      const mockGetCurrentPosition = vi.fn().mockImplementation((_, error) => {
        const err = new Error('User denied Geolocation');
        (err as any).code = 1;
        error(err);
      });

      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: mockGetCurrentPosition
        }
      });

      await expect(LocationService.getCurrentPosition()).rejects.toThrow();
    });
  });

  describe('4. Privacy & Query Sanitization for Public Providers', () => {
    it('strips phone numbers, flat/door/apartment numbers from search queries', () => {
      const raw = 'Flat 402, Sunrise Apts, 9876543210, 100 Feet Road, Indiranagar';
      const sanitized = sanitizeSearchQuery(raw);
      expect(sanitized).not.toContain('9876543210');
      expect(sanitized).not.toContain('Flat 402');
      expect(sanitized).toContain('100 Feet Road');
      expect(sanitized).toContain('Indiranagar');
    });

    it('preserves clean street and locality queries', () => {
      expect(sanitizeSearchQuery('Indiranagar 100ft road')).toBe('Indiranagar 100ft road');
      expect(sanitizeSearchQuery('HSR Layout Sector 1')).toBe('HSR Layout Sector 1');
    });
  });

  describe('5. Provider-Independent Architecture & Switching', () => {
    it('manages provider switching and reports availability cleanly', async () => {
      // Nominatim provider has direct public requests temporarily disabled
      expect(LocationService.getProvider().id).toBe('nominatim');
      expect(LocationService.isProviderAvailable()).toBe(false);

      LocationService.setProvider('disabled');
      expect(LocationService.getProvider().id).toBe('disabled');
      expect(LocationService.isProviderAvailable()).toBe(false);

      // In disabled mode, search returns empty array and reverse returns null without throwing
      const searchRes = await LocationService.searchAddress('MG Road');
      expect(searchRes).toEqual([]);
      const reverseRes = await LocationService.reverseGeocode(12.9716, 77.5946);
      expect(reverseRes).toBeNull();
    });

    it('provides required OpenStreetMap attribution string', () => {
      const attr = LocationService.getProvider().getAttribution();
      expect(attr).toContain('OpenStreetMap contributors');
    });
  });

  describe('6. Public Nominatim Privacy: Reverse Geocoding Disabled for Precise Home Coordinates', () => {
    it('disables public reverse geocoding to prevent sending precise home coordinates to public Nominatim', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      // Default provider is public Nominatim
      expect(LocationService.getProvider().id).toBe('nominatim');

      // Calling reverseGeocode with precise customer doorstep coordinates
      const res = await LocationService.reverseGeocode(12.97834, 77.64082);

      // Verifies precise home coordinates are NEVER sent to public Nominatim
      expect(res).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows approved backend proxy / self-hosted provider to perform reverse geocoding with server rate limiting', async () => {
      const mockResponse = {
        displayName: '100 Feet Road, Indiranagar, Bengaluru, 560038',
        addressLine: '100 Feet Road, Indiranagar, Bengaluru - 560038',
        street: '100 Feet Road',
        area: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        formattedAddress: '100 Feet Road, Indiranagar, Bengaluru - 560038',
        isVerified: true
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });
      vi.stubGlobal('fetch', fetchSpy);

      const customProvider = new CustomBackendGeocodingProvider({
        name: 'SuperWash Backend Geocoding Proxy',
        proxyUrl: 'https://api.superwash.in/api/v1/geocode'
      });
      LocationService.setProvider(customProvider);

      const res = await LocationService.reverseGeocode(12.97834, 77.64082);

      expect(res).not.toBeNull();
      expect(res?.street).toBe('100 Feet Road');
      expect(res?.pincode).toBe('560038');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.superwash.in/api/v1/geocode/reverse?lat=12.97834&lng=77.64082',
        expect.anything()
      );
    });
  });

  describe('7. Forward Geocoding Policy & Backend Proxy Support', () => {
    it('temporarily disables direct public Nominatim forward searches to eliminate unproxied external requests', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      LocationService.setProvider('nominatim');
      const results = await LocationService.searchAddress('Indiranagar');

      expect(results).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows approved backend proxy to execute forward search via server endpoint', async () => {
      const mockSearchResults = [
        {
          latitude: 12.9783,
          longitude: 77.6408,
          displayName: '100 Feet Road, Indiranagar, Bengaluru, Karnataka, 560038, India',
          shortName: '100 Feet Road, Bengaluru',
          pincode: '560038'
        }
      ];

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSearchResults
      });
      vi.stubGlobal('fetch', fetchSpy);

      const customProvider = new CustomBackendGeocodingProvider({
        name: 'Backend Proxy',
        proxyUrl: 'https://api.superwash.in/api/v1/geocode'
      });
      LocationService.setProvider(customProvider);

      const results = await LocationService.searchAddress('Indiranagar');

      expect(results.length).toBe(1);
      expect(results[0].latitude).toBe(12.9783);
      expect(results[0].shortName).toContain('100 Feet Road');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.superwash.in/api/v1/geocode/search?q=Indiranagar',
        expect.anything()
      );
    });
  });

  describe('8. Google Maps Directions vs. Search Fallback URL', () => {
    it('generates exact driving directions URL when valid coordinates exist', () => {
      const order = {
        pickup_latitude: 12.9716,
        pickup_longitude: 77.5946,
        pickup_address: 'MG Road'
      };

      const url = LocationService.getGoogleMapsDirectionsUrl(order);
      expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=12.9716,77.5946&travelmode=driving');
    });

    it('generates safe address search fallback when coordinates are missing', () => {
      const order = {
        pickup_latitude: null,
        pickup_longitude: null,
        pickup_address: 'Flat 402, Sunshine Apartments, Indiranagar',
        pickup_pincode: '560038'
      };

      const url = LocationService.getGoogleMapsDirectionsUrl(order);
      expect(url).toContain('https://www.google.com/maps/search/?api=1&query=');
      expect(url).toContain(encodeURIComponent('Flat 402, Sunshine Apartments, Indiranagar, 560038'));
    });
  });

  describe('9. Coordinate Formatting for UI', () => {
    it('formats valid coordinates to 6 decimal places', () => {
      expect(LocationService.formatCoordinates(12.9715987, 77.5945627)).toBe('12.971599, 77.594563');
    });

    it('returns fallback string when coordinates are missing', () => {
      expect(LocationService.formatCoordinates(null, null)).toBe('No GPS Attached');
      expect(LocationService.formatCoordinates(0, 0)).toBe('No GPS Attached');
    });
  });

  describe('10. Map Tile Layer Configuration & Policy Verification', () => {
    it('provides standard OpenStreetMap tile endpoint and mandatory copyright attribution', () => {
      const tileConfig = LocationService.getTileConfig();
      expect(tileConfig.url).toContain('tile.openstreetmap.org');
      expect(tileConfig.attribution).toContain('OpenStreetMap');
      expect(tileConfig.attribution).toContain('contributors');
      expect(tileConfig.maxZoom).toBe(19);
    });

    it('allows runtime tile configuration override without code changes', () => {
      LocationService.setTileConfig({
        url: 'https://tiles.custom-internal.com/{z}/{x}/{y}.png',
        attribution: '&copy; Custom Tiles'
      });

      expect(LocationService.getTileConfig().url).toBe('https://tiles.custom-internal.com/{z}/{x}/{y}.png');
      expect(LocationService.getTileConfig().attribution).toBe('&copy; Custom Tiles');

      // Reset to default
      LocationService.setTileConfig({
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      });
    });
  });
});
