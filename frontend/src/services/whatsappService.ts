import { NotificationLog, BusinessSettings } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { STORAGE_KEYS } from './laundryService';

export type WhatsAppEventType =
  | 'booking_confirmed'
  | 'pickup_assigned'
  | 'clothes_collected'
  | 'weight_recorded'
  | 'weight_and_bill_ready'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'delivered'
  | 'payment_recorded'
  | 'payment_received'
  | 'cancelled';

/**
 * Provider-independent notification adapter interface.
 */
export interface NotificationProvider {
  name: string;
  isAvailable(): boolean;
  send(payload: {
    recipientPhone: string;
    eventType: string;
    message: string;
    orderId?: string;
    channel?: string;
  }): Promise<{ success: boolean; externalId?: string; error?: string }>;
}

/**
 * Mock notification provider for deterministic local tests and offline execution.
 */
export class MockNotificationProvider implements NotificationProvider {
  name = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async send(payload: {
    recipientPhone: string;
    eventType: string;
    message: string;
    orderId?: string;
  }): Promise<{ success: boolean; externalId?: string }> {
    console.info(`[Mock Notification Provider]: Dispatched to ${payload.recipientPhone} [${payload.eventType}]: ${payload.message}`);
    return {
      success: true,
      externalId: `mock-msg-${Date.now()}`
    };
  }
}

/**
 * Supabase Edge Function notification provider (Production / Server-side).
 * Safely keeps provider API secrets (WhatsApp API token, Twilio auth, etc.) in Supabase Secrets.
 */
export class SupabaseEdgeNotificationProvider implements NotificationProvider {
  name = 'supabase_edge';

  isAvailable(): boolean {
    const isDemo = Boolean(import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true');
    return isSupabaseConfigured && !isDemo;
  }

  async send(payload: {
    recipientPhone: string;
    eventType: string;
    message: string;
    orderId?: string;
  }): Promise<{ success: boolean; externalId?: string; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: payload
      });

      if (error || !data?.success) {
        return {
          success: false,
          error: error?.message || data?.error || 'WhatsApp edge function dispatch failed'
        };
      }

      return {
        success: true,
        externalId: data?.message_id || data?.id
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error invoking notification edge function'
      };
    }
  }
}

// Global active notification provider
let activeProvider: NotificationProvider = new SupabaseEdgeNotificationProvider();

// In-memory deduplication cache: `${orderId}:${eventType}` -> timestamp
const recentDispatches = new Map<string, number>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export class WhatsAppService {
  /**
   * Set custom or mock notification provider (useful for integration tests)
   */
  static setProvider(provider: NotificationProvider) {
    activeProvider = provider;
  }

  static getProvider(): NotificationProvider {
    return activeProvider;
  }

  /**
   * Dispatches a notification securely according to Section 8 cost minimization rules.
   * 
   * COST-OPTIMIZATION INVARIANT:
   * Only TWO customer notification events are eligible for external paid dispatch:
   * 1. 'pickup_assigned' (controlled by settings.notify_pickup_assigned, default true)
   * 2. 'out_for_delivery' (controlled by settings.notify_out_for_delivery, default true)
   * 
   * All other lifecycle events ('booking_confirmed', 'clothes_collected', 'weight_recorded',
   * 'ready_for_delivery', 'delivered', 'cancelled') represent internal operational transitions.
   * They are persisted to audit logs for user tracking without incurring external SMS/WhatsApp charges.
   */
  static async sendNotification(
    recipientPhone: string,
    eventType: WhatsAppEventType | string,
    message: string,
    orderId?: string,
    settings?: BusinessSettings | null
  ): Promise<NotificationLog> {
    const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
    const logId = crypto.randomUUID();

    const log: NotificationLog = {
      id: logId,
      order_id: orderId,
      channel: 'whatsapp',
      recipient_phone: cleanPhone,
      event_type: eventType,
      message,
      status: 'logged',
      created_at: new Date().toISOString()
    };

    // 1. Deduplication Guard
    if (orderId) {
      const dedupKey = `${orderId}:${eventType}`;
      const lastSent = recentDispatches.get(dedupKey);
      const now = Date.now();
      if (lastSent && now - lastSent < DEDUP_WINDOW_MS) {
        log.status = 'logged';
        log.error_message = 'Duplicate event suppressed by deduplication window';
        return log;
      }
      recentDispatches.set(dedupKey, now);
    }

    // 2. Determine eligibility for external messaging
    const isPaidCustomerEvent = eventType === 'pickup_assigned' || eventType === 'out_for_delivery';
    const isDemo = Boolean(import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true');
    const isLive = isSupabaseConfigured && !isDemo;

    // Retrieve settings if not passed
    let effectiveSettings: BusinessSettings | null = settings || null;
    if (!effectiveSettings) {
      try {
        const stored =
          localStorage.getItem(STORAGE_KEYS.SETTINGS) ||
          localStorage.getItem('superwash_business_settings');
        if (stored) effectiveSettings = JSON.parse(stored);
      } catch {}
    }

    const isProviderConfigured = Boolean(effectiveSettings?.whatsapp_enabled);
    let isEventToggleEnabled = true;

    if (eventType === 'pickup_assigned') {
      isEventToggleEnabled = effectiveSettings ? effectiveSettings.notify_pickup_assigned !== false : true;
    } else if (eventType === 'out_for_delivery') {
      isEventToggleEnabled = effectiveSettings ? effectiveSettings.notify_out_for_delivery !== false : true;
    }

    // 3. Dispatch to external provider if eligible and configured
    if (isPaidCustomerEvent && isProviderConfigured && isEventToggleEnabled) {
      if (activeProvider.isAvailable()) {
        try {
          const result = await activeProvider.send({
            recipientPhone: cleanPhone,
            eventType,
            message,
            orderId
          });

          if (result.success) {
            log.status = 'sent';
          } else {
            log.status = 'logged';
            log.error_message = result.error || 'Provider dispatch failed';
          }
        } catch (err: any) {
          log.status = 'logged';
          log.error_message = err?.message || 'Provider communication error';
        }
      } else {
        log.status = 'logged';
        log.error_message = 'Notification provider not available in this environment';
      }
    } else if (isPaidCustomerEvent && !isEventToggleEnabled) {
      log.status = 'logged';
      log.error_message = 'Notification disabled by store policy';
    } else if (isPaidCustomerEvent && !isProviderConfigured) {
      log.status = 'logged';
      log.error_message = 'External messaging provider inactive pending configuration';
    } else {
      // Internal operational tracking
      log.status = isLive ? 'logged' : 'sent';
    }

    // 4. Persist to Supabase notification_logs if in live environment
    if (isLive) {
      try {
        await supabase.from('notification_logs').insert([
          {
            id: log.id,
            order_id: log.order_id || null,
            channel: log.channel,
            recipient_phone: log.recipient_phone,
            event_type: log.event_type,
            message: log.message,
            status: log.status,
            error_message: log.error_message || null,
            created_at: log.created_at
          }
        ]);
      } catch {
        // Non-blocking: database logging errors must never disrupt business operations
      }
    }

    // 5. Persist to local cache for customer tracking and tests
    try {
      const existingLogs = JSON.parse(localStorage.getItem('superwash_notifications') || '[]');
      existingLogs.unshift(log);
      localStorage.setItem('superwash_notifications', JSON.stringify(existingLogs.slice(0, 100)));
    } catch {}

    console.info(`[WhatsApp Notification Logged]: To ${cleanPhone} [${eventType}]: ${message}`);
    return log;
  }

  // =========================================================================
  // The Two Official Paid Customer Notification Templates (Section 8)
  // =========================================================================

  /**
   * Event 1: Pickup assigned — driver is on the way (with ETA)
   */
  static async notifyPickupAssigned(
    orderNumber: string,
    phone: string,
    staffName: string = 'Pickup Associate',
    staffPhone: string = '9876543215',
    pickupSlot: string = 'Morning (08:00 AM - 11:00 AM)',
    eta?: string,
    orderId?: string,
    settings?: BusinessSettings | null
  ) {
    const etaText = eta ? ` (Est. Arrival: ${eta})` : ' (Driver is on the way)';
    const msg = `Namaste! Our pickup executive ${staffName} (+91 ${staffPhone}) has been assigned for Order #${orderNumber}. Scheduled Slot: ${pickupSlot}.${etaText} Track live: https://superwash.in`;
    return this.sendNotification(phone, 'pickup_assigned', msg, orderId, settings);
  }

  /**
   * Event 2: Out for delivery — fresh clothes on the way (with ETA)
   */
  static async notifyOutForDelivery(
    orderNumber: string,
    phone: string,
    staffName: string = 'Delivery Associate',
    staffPhone: string = '9876543215',
    balanceDueRs: number = 0,
    eta?: string,
    orderId?: string,
    settings?: BusinessSettings | null
  ) {
    const etaText = eta ? ` (Est. Arrival: ${eta})` : '';
    const dueText = balanceDueRs > 0
      ? ` Amount Due: ₹${balanceDueRs.toFixed(2)} (Cash on Delivery or UPI).`
      : ' All paid in full.';
    const msg = `Great news! Your clean, fresh clothes for Order #${orderNumber} are out for delivery! Executive: ${staffName} (+91 ${staffPhone}).${etaText}${dueText}`;
    return this.sendNotification(phone, 'out_for_delivery', msg, orderId, settings);
  }

  // =========================================================================
  // Internal Operational Tracking Helpers (Audited Internally)
  // =========================================================================

  static async notifyBookingConfirmed(orderNumber: string, phone: string, pickupSlot: string, orderId?: string) {
    const msg = `Namaste! Your SuperWash order #${orderNumber} is confirmed for pickup during ${pickupSlot}. Our delivery executive will arrive shortly. Track live: https://superwash.in`;
    return this.sendNotification(phone, 'booking_confirmed', msg, orderId);
  }

  static async notifyClothesCollected(orderNumber: string, phone: string, orderId?: string) {
    const msg = `Namaste! Your clothes for order #${orderNumber} have been safely collected by our driver and are heading to our wash center.`;
    return this.sendNotification(phone, 'clothes_collected', msg, orderId);
  }

  static async notifyWeightRecorded(orderNumber: string, phone: string, weightKg: number, amountRupees: number, orderId?: string) {
    const msg = `SuperWash: Order #${orderNumber} weighed at ${weightKg.toFixed(1)} kg. Total bill: ₹${amountRupees.toFixed(2)}. Pay online via UPI or Cash upon delivery.`;
    return this.sendNotification(phone, 'weight_recorded', msg, orderId);
  }

  static async notifyReadyForDelivery(orderNumber: string, phone: string, orderId?: string) {
    const msg = `SuperWash: Order #${orderNumber} is clean, folded, and ready for delivery! Out for dispatch soon.`;
    return this.sendNotification(phone, 'ready_for_delivery', msg, orderId);
  }

  static async notifyDelivered(orderNumber: string, phone: string, orderId?: string, nextOrderPromoCode?: string) {
    const promoSuffix = nextOrderPromoCode
      ? ` As a thank you, enjoy a discount on your next booking with code ${nextOrderPromoCode}!`
      : '';
    const msg = `SuperWash: Order #${orderNumber} has been delivered! Thank you for choosing SuperWash Exprez.${promoSuffix} Rate your wash: https://superwash.in`;
    return this.sendNotification(phone, 'delivered', msg, orderId);
  }

  static async notifyPaymentRecorded(orderNumber: string, phone: string, amountRupees: number, method: string, balanceRemainingRupees: number, orderId?: string) {
    const balMsg = balanceRemainingRupees > 0 ? ` Outstanding balance: ₹${balanceRemainingRupees.toFixed(2)}.` : ' Paid in full. Thank you!';
    const msg = `SuperWash: Payment of ₹${amountRupees.toFixed(2)} received via ${method.toUpperCase()} for order #${orderNumber}.${balMsg}`;
    return this.sendNotification(phone, 'payment_recorded', msg, orderId);
  }

  static async notifyCancelled(orderNumber: string, phone: string, reason?: string, orderId?: string) {
    const reasonSuffix = reason ? ` Reason: ${reason}.` : '';
    const msg = `SuperWash: Your order #${orderNumber} has been cancelled.${reasonSuffix} If you have questions, please reach out to our support.`;
    return this.sendNotification(phone, 'cancelled', msg, orderId);
  }
}
