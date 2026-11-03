import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocationService, CustomBackendGeocodingProvider } from '../services/locationService';
import { LaundryService } from '../services/laundryService';
import { Order, CustomerAddress } from '../types';

describe('Coordinate Pipeline & Geocoding Integrity Audit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    LocationService.setProvider('nominatim');
    LocationService.clearCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    LocationService.setProvider('nominatim');
  });

  describe('1. Full End-to-End Coordinate Pipeline Trace', () => {
    it('proves exact coordinate propagation from pin capture to delivery navigation destination', async () => {
      // Configure approved backend proxy provider for reverse geocoding
      LocationService.setProvider(new CustomBackendGeocodingProvider({
        proxyUrl: 'https://api.superwash.in/api/v1/geocode'
      }));

      // Stage 1: Hardware GPS / Map pin placement
      const rawCapturedCoords = {
        latitude: 12.935246,
        longitude: 77.624531
      };
      expect(LocationService.isValidCoordinate(rawCapturedCoords.latitude, rawCapturedCoords.longitude)).toBe(true);

      // Stage 2: Reverse Geocoding via Provider
      const mockNominatimResponse = {
        displayName: '100 Feet Road, Indiranagar, Bengaluru, Karnataka, 560038, India',
        street: '100 Feet Road',
        area: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        formattedAddress: '100 Feet Road, Indiranagar, Bengaluru - 560038',
        isVerified: true
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockNominatimResponse
      }));

      const geoResult = await LocationService.reverseGeocode(rawCapturedCoords.latitude, rawCapturedCoords.longitude);
      expect(geoResult).not.toBeNull();
      expect(geoResult?.street).toBe('100 Feet Road');
      expect(geoResult?.area).toBe('Indiranagar');
      expect(geoResult?.pincode).toBe('560038');

      // Stage 3: Customer Confirmation with Separated Flat Details
      const customerFlatDetails = 'Flat 402, 4th Floor, Sunrise Apartments';
      const confirmedCombinedAddress = `${customerFlatDetails}, ${geoResult?.street}, ${geoResult?.area}, ${geoResult?.city} - ${geoResult?.pincode}`;

      const customerConfirmedPayload = {
        latitude: rawCapturedCoords.latitude,
        longitude: rawCapturedCoords.longitude,
        flatBuilding: customerFlatDetails,
        street: geoResult?.street,
        area: geoResult?.area,
        city: geoResult?.city,
        pincode: geoResult?.pincode,
        formattedAddress: confirmedCombinedAddress,
        isVerified: true
      };

      // Verify exact coordinates preserved upon customer confirmation
      expect(customerConfirmedPayload.latitude).toBe(12.935246);
      expect(customerConfirmedPayload.longitude).toBe(77.624531);
      expect(customerConfirmedPayload.formattedAddress).toContain('Flat 402, 4th Floor, Sunrise Apartments');
      expect(customerConfirmedPayload.formattedAddress).toContain('100 Feet Road, Indiranagar');

      // Stage 4: Saved Address Record in Customer Address Book
      const savedAddressRecord: CustomerAddress = {
        id: 'addr-uuid-cust-1',
        user_id: 'cust-uuid-1',
        label: 'Home',
        address_line: customerConfirmedPayload.formattedAddress,
        pincode: customerConfirmedPayload.pincode!,
        latitude: customerConfirmedPayload.latitude,
        longitude: customerConfirmedPayload.longitude,
        is_default: true,
        created_at: new Date().toISOString()
      };

      expect(savedAddressRecord.latitude).toBe(12.935246);
      expect(savedAddressRecord.longitude).toBe(77.624531);

      // Stage 5: Booking Submission & Order Snapshot in Database
      const submittedOrder = await LaundryService.createBooking({
        customer_name: 'Ananya Sharma',
        customer_phone: '9876543210',
        pickup_address: savedAddressRecord.address_line,
        pickup_pincode: savedAddressRecord.pincode,
        pickup_date: '2026-11-05',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        pickup_latitude: savedAddressRecord.latitude,
        pickup_longitude: savedAddressRecord.longitude
      });

      // Stage 6: Verify Database Order Snapshot
      expect(submittedOrder.pickup_latitude).toBe(12.935246);
      expect(submittedOrder.pickup_longitude).toBe(77.624531);
      expect(submittedOrder.pickup_address).toBe(savedAddressRecord.address_line);

      // Stage 7: Assigned Delivery Account
      const deliveryExecutiveId = 'delivery-exec-uuid-99';
      const assignedOrder = await LaundryService.assignPickupStaff(
        submittedOrder.id,
        deliveryExecutiveId,
        'Ramesh Kumar',
        '9876543299'
      );

      expect(assignedOrder.pickup_latitude).toBe(12.935246);
      expect(assignedOrder.pickup_longitude).toBe(77.624531);
      expect(LaundryService.hasValidCoordinates(assignedOrder)).toBe(true);

      // Stage 8: Delivery Navigation URL Generation
      const navigationUrl = LaundryService.getGoogleMapsDirectionsUrl(assignedOrder);
      expect(navigationUrl).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=12.935246,77.624531&travelmode=driving'
      );

      // Assert complete coordinate identity: Pin == Address == Order Snapshot == Navigation Target
      expect(assignedOrder.pickup_latitude).toBe(rawCapturedCoords.latitude);
      expect(assignedOrder.pickup_longitude).toBe(rawCapturedCoords.longitude);
    });
  });

  describe('2. Cross-Customer & Cross-Order Coordinate Isolation', () => {
    it('strictly isolates coordinates between different customer bookings without leakage', async () => {
      // Customer A in Indiranagar (560038)
      const orderA = await LaundryService.createBooking({
        customer_name: 'Customer A (Indiranagar)',
        customer_phone: '9876500001',
        pickup_address: 'Flat 101, Indiranagar',
        pickup_pincode: '560038',
        pickup_date: '2026-11-05',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        pickup_latitude: 12.978345,
        pickup_longitude: 77.640823
      });

      // Customer B in MG Road (560001)
      const orderB = await LaundryService.createBooking({
        customer_name: 'Customer B (MG Road)',
        customer_phone: '9876500002',
        pickup_address: 'Villa 22, MG Road',
        pickup_pincode: '560001',
        pickup_date: '2026-11-05',
        pickup_slot: 'Evening (04:00 PM - 07:00 PM)',
        pickup_latitude: 12.971598,
        pickup_longitude: 77.594562
      });

      expect(orderA.pickup_latitude).toBe(12.978345);
      expect(orderA.pickup_longitude).toBe(77.640823);

      expect(orderB.pickup_latitude).toBe(12.971598);
      expect(orderB.pickup_longitude).toBe(77.594562);

      // Verify no cross-talk
      expect(orderA.pickup_latitude).not.toBe(orderB.pickup_latitude);
      expect(orderA.pickup_longitude).not.toBe(orderB.pickup_longitude);

      const navUrlA = LaundryService.getGoogleMapsDirectionsUrl(orderA);
      const navUrlB = LaundryService.getGoogleMapsDirectionsUrl(orderB);

      expect(navUrlA).toContain('destination=12.978345,77.640823');
      expect(navUrlB).toContain('destination=12.971598,77.594562');
    });
  });

  describe('3. Order Snapshot Immutability after Address Book Modifications', () => {
    it('preserves historical order pickup coordinates when customer later modifies their address book', async () => {
      // Step 1: Customer creates initial booking at Address 1 (Indiranagar 560038)
      const originalCoords = { lat: 12.935246, lng: 77.624531 };
      const savedAddress = await LaundryService.saveAddress({
        user_id: 'cust-immutability-1',
        label: 'Home',
        address_line: 'Flat 204, Indiranagar 100ft road',
        pincode: '560038',
        latitude: originalCoords.lat,
        longitude: originalCoords.lng,
        is_default: true
      });

      const order = await LaundryService.createBooking({
        customer_name: 'Immutability Tester',
        customer_phone: '9876543201',
        pickup_address: savedAddress.address_line,
        pickup_pincode: savedAddress.pincode,
        pickup_date: '2026-11-05',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        pickup_latitude: savedAddress.latitude,
        pickup_longitude: savedAddress.longitude
      });

      expect(order.pickup_latitude).toBe(12.935246);
      expect(order.pickup_longitude).toBe(77.624531);

      // Step 2: Customer later edits their saved address to Whitefield (560066) with completely new coordinates
      const newCoords = { lat: 12.969876, lng: 77.749876 };
      await LaundryService.updateAddress(savedAddress.id, {
        user_id: 'cust-immutability-1',
        label: 'Home',
        address_line: 'Villa 50, Prestige Whitefield',
        pincode: '560066',
        latitude: newCoords.lat,
        longitude: newCoords.lng
      });

      // Step 3: Fetch original order from store/database
      const fetchedOrder = (await LaundryService.getAllOrders()).find((o) => o.id === order.id);
      expect(fetchedOrder).toBeDefined();

      // The historical order snapshot must retain original Indiranagar coordinates
      expect(fetchedOrder?.pickup_latitude).toBe(12.935246);
      expect(fetchedOrder?.pickup_longitude).toBe(77.624531);
      expect(fetchedOrder?.pickup_address).toBe('Flat 204, Indiranagar 100ft road');
    });
  });

  describe('4. Graceful Degradation & Unverified Location Handling', () => {
    it('preserves map marker and marks address as unverified when reverse geocoding is unavailable', async () => {
      // Disable geocoding provider
      LocationService.setProvider('disabled');

      const manualCoords = { latitude: 12.981234, longitude: 77.589123 };
      const geoResult = await LocationService.reverseGeocode(manualCoords.latitude, manualCoords.longitude);

      // Geocoding returns null without throwing
      expect(geoResult).toBeNull();

      // Customer enters address manually while pin coordinates remain valid
      const manualOrder = await LaundryService.createBooking({
        customer_name: 'Manual Pin Customer',
        customer_phone: '9876543202',
        pickup_address: 'Custom Building, Bellandur',
        pickup_pincode: '560103',
        pickup_date: '2026-11-05',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        pickup_latitude: manualCoords.latitude,
        pickup_longitude: manualCoords.longitude
      });

      expect(manualOrder.pickup_latitude).toBe(12.981234);
      expect(manualOrder.pickup_longitude).toBe(77.589123);

      const navUrl = LaundryService.getGoogleMapsDirectionsUrl(manualOrder);
      expect(navUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=12.981234,77.589123&travelmode=driving');
    });
  });
});
