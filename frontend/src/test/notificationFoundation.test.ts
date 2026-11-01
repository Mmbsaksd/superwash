import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WhatsAppService, MockNotificationProvider, NotificationProvider } from '../services/whatsappService';
import { BusinessSettings } from '../types';

describe('Notification Foundation & Cost-Minimization Architecture (Section 8)', () => {
  let mockProvider: NotificationProvider;
  let sendSpy: ReturnType<typeof vi.fn>;

  const defaultEnabledSettings: BusinessSettings = {
    id: 'test-settings',
    business_name: 'SuperWash Exprez',
    business_phone: '9876543210',
    business_address: 'Indiranagar, Bengaluru',
    upi_id: 'superwash@icici',
    price_per_kg_paise: 7900,
    min_weight_kg: 1,
    delivery_charge_paise: 0,
    serviceable_pincodes: ['560038'],
    allow_delivery_payment_recording: true,
    advance_payment_enabled: true,
    cod_payment_enabled: true,
    online_payment_enabled: false,
    whatsapp_enabled: true,
    notify_pickup_assigned: true,
    notify_out_for_delivery: true
  };

  beforeEach(() => {
    localStorage.clear();
    sendSpy = vi.fn().mockResolvedValue({ success: true, externalId: 'mock-123' });
    mockProvider = {
      name: 'spy-provider',
      isAvailable: () => true,
      send: sendSpy
    };
    WhatsAppService.setProvider(mockProvider);
  });

  it('1. Only pickup_assigned and out_for_delivery invoke external provider when whatsapp_enabled is true', async () => {
    // Pickup assigned: should invoke provider
    const pickupLog = await WhatsAppService.notifyPickupAssigned(
      'ORD-1001',
      '9876543210',
      'Ramesh Kumar',
      '9876543211',
      'Morning (08:00 AM - 11:00 AM)',
      '15 mins',
      'order-uuid-1',
      defaultEnabledSettings
    );

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      eventType: 'pickup_assigned',
      recipientPhone: '9876543210',
      orderId: 'order-uuid-1'
    }));
    expect(pickupLog.status).toBe('sent');

    // Out for delivery: should invoke provider
    const deliveryLog = await WhatsAppService.notifyOutForDelivery(
      'ORD-1002',
      '9876543210',
      'Suresh Delivery',
      '9876543212',
      158,
      '20 mins',
      'order-uuid-2',
      defaultEnabledSettings
    );

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      eventType: 'out_for_delivery',
      recipientPhone: '9876543210',
      orderId: 'order-uuid-2'
    }));
    expect(deliveryLog.status).toBe('sent');
  });

  it('2. External provider dispatch is completely suppressed when whatsapp_enabled is false', async () => {
    const disabledSettings: BusinessSettings = {
      ...defaultEnabledSettings,
      whatsapp_enabled: false
    };

    const log = await WhatsAppService.notifyPickupAssigned(
      'ORD-2001',
      '9876543210',
      'Ramesh Kumar',
      '9876543211',
      'Morning',
      '10 mins',
      'order-uuid-disabled-1',
      disabledSettings
    );

    expect(sendSpy).not.toHaveBeenCalled();
    expect(log.status).toBe('logged');
    expect(log.error_message).toContain('External messaging provider inactive');
  });

  it('3. Individual toggles independently suppress respective notification events', async () => {
    // notify_pickup_assigned = false, notify_out_for_delivery = true
    const settingsNoPickup: BusinessSettings = {
      ...defaultEnabledSettings,
      notify_pickup_assigned: false,
      notify_out_for_delivery: true
    };

    const pickupLog = await WhatsAppService.notifyPickupAssigned(
      'ORD-3001',
      '9876543210',
      'Ramesh',
      '9876543211',
      'Morning',
      '10 mins',
      'order-uuid-3a',
      settingsNoPickup
    );

    expect(sendSpy).not.toHaveBeenCalled();
    expect(pickupLog.status).toBe('logged');
    expect(pickupLog.error_message).toContain('Notification disabled by store policy');

    // Out for delivery should still go through
    const deliveryLog = await WhatsAppService.notifyOutForDelivery(
      'ORD-3002',
      '9876543210',
      'Suresh',
      '9876543212',
      200,
      '15 mins',
      'order-uuid-3b',
      settingsNoPickup
    );

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(deliveryLog.status).toBe('sent');
  });

  it('4. Internal operational events are never dispatched to external paid provider', async () => {
    // booking_confirmed
    await WhatsAppService.notifyBookingConfirmed('ORD-4001', '9876543210', 'Evening slot', 'order-uuid-4a');
    // clothes_collected
    await WhatsAppService.notifyClothesCollected('ORD-4001', '9876543210', 'order-uuid-4b');
    // weight_recorded
    await WhatsAppService.notifyWeightRecorded('ORD-4001', '9876543210', 3.5, 276.5, 'order-uuid-4c');
    // ready_for_delivery
    await WhatsAppService.notifyReadyForDelivery('ORD-4001', '9876543210', 'order-uuid-4d');
    // delivered
    await WhatsAppService.notifyDelivered('ORD-4001', '9876543210', 'order-uuid-4e');
    // payment_recorded
    await WhatsAppService.notifyPaymentRecorded('ORD-4001', '9876543210', 276.5, 'cash', 0, 'order-uuid-4f');
    // cancelled
    await WhatsAppService.notifyCancelled('ORD-4001', '9876543210', 'Customer request', 'order-uuid-4g');

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('5. Deduplication window suppresses duplicate dispatches within 5 minutes', async () => {
    const orderId = 'order-uuid-dedup-1';

    // First call: succeeds and calls provider
    const firstLog = await WhatsAppService.notifyPickupAssigned(
      'ORD-5001',
      '9876543210',
      'Ramesh',
      '9876543211',
      'Morning',
      '10 mins',
      orderId,
      defaultEnabledSettings
    );
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(firstLog.status).toBe('sent');

    // Immediate duplicate call: suppressed before calling provider
    const secondLog = await WhatsAppService.notifyPickupAssigned(
      'ORD-5001',
      '9876543210',
      'Ramesh',
      '9876543211',
      'Morning',
      '10 mins',
      orderId,
      defaultEnabledSettings
    );
    expect(sendSpy).toHaveBeenCalledTimes(1); // Still 1
    expect(secondLog.status).toBe('logged');
    expect(secondLog.error_message).toContain('Duplicate event suppressed by deduplication window');
  });

  it('6. MockNotificationProvider returns deterministic mock message id', async () => {
    const mock = new MockNotificationProvider();
    expect(mock.name).toBe('mock');
    expect(mock.isAvailable()).toBe(true);

    const res = await mock.send({
      recipientPhone: '9876543210',
      eventType: 'pickup_assigned',
      message: 'Hello'
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toMatch(/^mock-msg-\d+$/);
  });
});
