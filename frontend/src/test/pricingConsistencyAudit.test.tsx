import { describe, it, expect, beforeEach } from 'vitest';
import { LaundryService } from '../services/laundryService';

describe('Master Application Audit: Pricing Consistency & Address Deduplication', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('preserves order price snapshots when service catalogue price changes', async () => {
    // 1. Initial service in catalogue: ₹79/kg (7900 paise)
    const initialServices = await LaundryService.getServices(false);
    expect(initialServices.length).toBeGreaterThan(0);

    // Create an order at current rate
    const order1 = await LaundryService.createOrder({
      customer_name: 'Audit Customer',
      customer_phone: '9876543210',
      pickup_address: '123 Main St, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: initialServices[0].id
    });

    const historicalRate = order1.price_per_kg_paise;
    expect(historicalRate).toBeGreaterThan(0);

    // 2. Owner updates the service rate in catalogue to ₹95/kg (9500 paise)
    await LaundryService.updateService(initialServices[0].id, {
      unit_price_paise: 9500
    }, 'owner');

    // 3. New booking must pick up the new active rate ₹95/kg
    const order2 = await LaundryService.createOrder({
      customer_name: 'New Customer',
      customer_phone: '9876543211',
      pickup_address: '456 Cross St, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: initialServices[0].id
    });
    expect(order2.price_per_kg_paise).toBe(9500);

    // 4. Historical order MUST strictly preserve its original snapshot rate
    const retrievedOrder1 = await LaundryService.getOrderById(order1.id);
    expect(retrievedOrder1?.price_per_kg_paise).toBe(historicalRate);

    // 5. Doorstep or store weighing on historical order calculates bill using historical rate
    const weighed = await LaundryService.recordPickupCollectionAndWeight(
      order1.id,
      5.0,
      'test-courier-id',
      'Test Courier'
    );
    expect(weighed.price_per_kg_paise).toBe(historicalRate);
    expect(weighed.total_amount_paise).toBe(5.0 * historicalRate);
  });

  it('deduplicates customer addresses by normalized address line and pincode at retrieval', async () => {
    const userId = 'user-audit-dedup-1';

    // Simulate pre-existing duplicate records from prior unconstrained saves
    const rawDuplicates = [
      {
        id: 'dup-1',
        user_id: userId,
        label: 'Home',
        address_line: 'Flat 101, Palm Meadows, Whitefield',
        landmark: 'Near Club House',
        pincode: '560066',
        is_default: true,
        created_at: '2026-10-25T10:00:00Z'
      },
      {
        id: 'dup-2',
        user_id: userId,
        label: 'Home',
        address_line: '  flat 101, palm meadows,  whitefield  ',
        landmark: 'Near Club House',
        pincode: '560066',
        is_default: false,
        created_at: '2026-10-24T10:00:00Z'
      }
    ];
    localStorage.setItem(`superwash_addresses_${userId}`, JSON.stringify(rawDuplicates));

    // Retrieved addresses must deduplicate identical normalized line + pincode
    const list = await LaundryService.getCustomerAddresses(userId);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('dup-1');
  });

  it('rejects invalid or negative weights during doorstep collection', async () => {
    const services = await LaundryService.getServices(false);
    const order = await LaundryService.createOrder({
      customer_name: 'Bounds Customer',
      customer_phone: '9876543212',
      pickup_address: '789 5th Main, Bengaluru',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: services[0].id
    });

    // Negative weight
    await expect(
      LaundryService.recordPickupCollectionAndWeight(order.id, -2.5, 'staff-1', 'Staff')
    ).rejects.toThrow(/valid measured scale weight/);

    // Zero weight
    await expect(
      LaundryService.recordPickupCollectionAndWeight(order.id, 0, 'staff-1', 'Staff')
    ).rejects.toThrow(/valid measured scale weight/);

    // Excessive weight exceeding scale capacity (100 kg)
    await expect(
      LaundryService.recordPickupCollectionAndWeight(order.id, 150, 'staff-1', 'Staff')
    ).rejects.toThrow(/valid measured scale weight/);
  });
});
