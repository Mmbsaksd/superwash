import { describe, it, expect, beforeEach } from 'vitest';
import { LaundryService } from '../services/laundryService';

describe('Dynamic Bengaluru Service Coverage & Owner-Controlled Expansion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Adds a new Bengaluru PIN code through service area management with locality', async () => {
    // Add HSR Layout Sector 2 (560102)
    const newArea = await LaundryService.addServiceArea({
      pincode: '560102',
      area_name: 'HSR Layout Sector 2',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    });

    expect(newArea.pincode).toBe('560102');
    expect(newArea.area_name).toBe('HSR Layout Sector 2');
    expect(newArea.is_active).toBe(true);

    // Verify immediately serviceable
    const isServiceable = await LaundryService.isPincodeServiceable('560102');
    expect(isServiceable).toBe(true);

    // Verify locality lookup
    const lookup = await LaundryService.getServiceAreaForPincode('560102');
    expect(lookup).toBeDefined();
    expect(lookup?.area_name).toBe('HSR Layout Sector 2');
    expect(lookup?.city).toBe('Bengaluru');
  });

  it('2. Dynamically deactivates and reactivates a PIN code', async () => {
    const area = await LaundryService.addServiceArea({
      pincode: '560078',
      area_name: 'JP Nagar Phase 6',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    });

    expect(await LaundryService.isPincodeServiceable('560078')).toBe(true);

    // Deactivate
    const deactivated = await LaundryService.updateServiceArea(area.id, { is_active: false });
    expect(deactivated.is_active).toBe(false);
    expect(await LaundryService.isPincodeServiceable('560078')).toBe(false);

    // Locality lookup still reflects inactive state
    const lookupInactive = await LaundryService.getServiceAreaForPincode('560078');
    expect(lookupInactive?.is_active).toBe(false);

    // Reactivate
    const reactivated = await LaundryService.updateServiceArea(area.id, { is_active: true });
    expect(reactivated.is_active).toBe(true);
    expect(await LaundryService.isPincodeServiceable('560078')).toBe(true);
  });

  it('3. Rejects invalid PIN codes and duplicate PIN code registrations', async () => {
    // Invalid: less than 6 digits
    await expect(LaundryService.addServiceArea({
      pincode: '56003',
      area_name: 'Invalid Short',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    })).rejects.toThrow(/valid 6-digit Indian PIN code/i);

    // Invalid: more than 6 digits
    await expect(LaundryService.addServiceArea({
      pincode: '5600389',
      area_name: 'Invalid Long',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    })).rejects.toThrow(/valid 6-digit Indian PIN code/i);

    // Invalid: starts with 0
    await expect(LaundryService.addServiceArea({
      pincode: '056038',
      area_name: 'Invalid Zero Leading',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    })).rejects.toThrow(/valid 6-digit Indian PIN code/i);

    // Invalid: empty locality name
    await expect(LaundryService.addServiceArea({
      pincode: '560095',
      area_name: '   ',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    })).rejects.toThrow(/area or locality name/i);

    // Duplicate: 560038 is already registered in default areas
    await expect(LaundryService.addServiceArea({
      pincode: '560038',
      area_name: 'Duplicate Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    })).rejects.toThrow(/already registered/i);
  });

  it('4. Allows customer booking within an active coverage area', async () => {
    const booking = await LaundryService.createBooking({
      customer_name: 'Active Area Customer',
      customer_phone: '9876543210',
      pickup_address: '100ft Road, Indiranagar',
      pickup_pincode: '560038',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    expect(booking).toBeDefined();
    expect(booking.order_number).toMatch(/^SW-/);
    expect(booking.pickup_pincode).toBe('560038');
    expect(booking.order_status).toBe('booked');
  });

  it('5. Rejects customer booking outside active coverage area', async () => {
    // Uncovered PIN code (e.g. 560099 not yet activated)
    await expect(LaundryService.createBooking({
      customer_name: 'Out of Area Customer',
      customer_phone: '9876543210',
      pickup_address: 'Uncovered Street',
      pickup_pincode: '560099',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    })).rejects.toThrow(/outside our service coverage/i);
  });

  it('6. Deactivating a PIN code prevents new bookings while existing historical orders remain valid', async () => {
    // 1. Add area and make a legitimate booking
    const area = await LaundryService.addServiceArea({
      pincode: '560047',
      area_name: 'Austin Town',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    });

    const existingOrder = await LaundryService.createBooking({
      customer_name: 'Austin Town Customer',
      customer_phone: '9876543211',
      pickup_address: '15 Neelasandra Main',
      pickup_pincode: '560047',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });
    expect(existingOrder.order_status).toBe('booked');

    // 2. Owner deactivates Austin Town
    await LaundryService.updateServiceArea(area.id, { is_active: false });
    expect(await LaundryService.isPincodeServiceable('560047')).toBe(false);

    // 3. New booking for 560047 is now rejected
    await expect(LaundryService.createBooking({
      customer_name: 'New Austin Customer',
      customer_phone: '9876543212',
      pickup_address: '18 Neelasandra Main',
      pickup_pincode: '560047',
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    })).rejects.toThrow(/outside our service coverage/i);

    // 4. Pre-existing order remains fully accessible and operational
    const allOrders = await LaundryService.getOrders();
    const retrieved = allOrders.find(o => o.id === existingOrder.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.order_status).toBe('booked');
    expect(retrieved?.pickup_pincode).toBe('560047');

    // Order status progression (weighing, washing) continues normally
    const collectedOrder = await LaundryService.updateOrderStatus(existingOrder.id, 'collected');
    expect(collectedOrder.order_status).toBe('collected');
  });

  it('7. Gradual expansion: newly added PIN code immediately accepts customer bookings without code changes', async () => {
    const unservedPin = '560068'; // Madivala / Bommanahalli
    expect(await LaundryService.isPincodeServiceable(unservedPin)).toBe(false);

    // Owner expands to Bommanahalli through Admin Settings
    await LaundryService.addServiceArea({
      pincode: unservedPin,
      area_name: 'Bommanahalli / Madivala',
      city: 'Bengaluru',
      state: 'Karnataka',
      is_active: true
    });

    // Customer can now immediately book
    const expandedBooking = await LaundryService.createBooking({
      customer_name: 'Bommanahalli Customer',
      customer_phone: '9876543213',
      pickup_address: 'Hosur Main Road',
      pickup_pincode: unservedPin,
      pickup_date: '2026-11-05',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)'
    });

    expect(expandedBooking).toBeDefined();
    expect(expandedBooking.pickup_pincode).toBe(unservedPin);
    expect(expandedBooking.order_status).toBe('booked');
  });
});
