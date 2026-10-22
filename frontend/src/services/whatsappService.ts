import { NotificationLog } from '../types';
import { supabase } from './supabase';

export type WhatsAppEventType =
  | 'booking_confirmed'
  | 'clothes_collected'
  | 'weight_recorded'
  | 'ready_for_delivery'
  | 'delivered'
  | 'payment_recorded';

export class WhatsAppService {
  /**
   * Dispatches a notification securely.
   * If a Supabase Edge Function is deployed, it triggers the server-side function
   * where WhatsApp secrets (WHATSAPP_API_TOKEN, etc.) reside safely.
   * Otherwise, it persists the record to public.notification_logs with status 'logged'.
   * Never blocks business operations if notifications fail or are unconfigured.
   */
  static async sendNotification(
    recipientPhone: string,
    eventType: WhatsAppEventType | string,
    message: string,
    orderId?: string
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

    try {
      // Attempt to invoke server-side Supabase Edge Function without exposing secrets to frontend
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          recipient_phone: cleanPhone,
          event_type: eventType,
          message,
          order_id: orderId
        }
      });

      if (!error && data?.success) {
        log.status = 'sent';
      } else if (error) {
        // Edge function may not be deployed in local/test setup
        log.status = 'logged';
        log.error_message = error.message || 'WhatsApp edge function not reachable';
      }
    } catch {
      // Non-blocking fallback
      log.status = 'logged';
      log.error_message = 'WhatsApp provider not configured locally; message logged to database.';
    }

    // Persist to notification_logs table in Supabase if live
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
      // Ignore DB logging failure to avoid breaking critical UI path
    }

    console.info(`[WhatsApp Notification Logged]: To ${cleanPhone} [${eventType}]: ${message}`);
    return log;
  }

  // Pre-formatted transactional business messages
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

  static async notifyDelivered(orderNumber: string, phone: string, orderId?: string) {
    const msg = `SuperWash: Order #${orderNumber} has been delivered! Thank you for choosing SuperWash Express. Rate your wash: https://superwash.in`;
    return this.sendNotification(phone, 'delivered', msg, orderId);
  }

  static async notifyPaymentRecorded(orderNumber: string, phone: string, amountRupees: number, method: string, balanceRemainingRupees: number, orderId?: string) {
    const balMsg = balanceRemainingRupees > 0 ? ` Outstanding balance: ₹${balanceRemainingRupees.toFixed(2)}.` : ' Paid in full. Thank you!';
    const msg = `SuperWash: Payment of ₹${amountRupees.toFixed(2)} received via ${method.toUpperCase()} for order #${orderNumber}.${balMsg}`;
    return this.sendNotification(phone, 'payment_recorded', msg, orderId);
  }
}
