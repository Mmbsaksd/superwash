import { NotificationLog } from '../types';

export const isWhatsAppConfigured = Boolean(
  import.meta.env.VITE_WHATSAPP_API_TOKEN && 
  import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID
);

export class WhatsAppService {
  static async sendNotification(
    recipientPhone: string,
    eventType: string,
    message: string,
    orderId?: string
  ): Promise<NotificationLog> {
    const log: NotificationLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      order_id: orderId,
      channel: 'whatsapp',
      recipient_phone: recipientPhone,
      event_type: eventType,
      message,
      status: 'logged',
      created_at: new Date().toISOString()
    };

    if (!isWhatsAppConfigured) {
      log.status = 'logged';
      log.error_message = 'WhatsApp provider credentials not configured in environment.';
      console.info(`[WhatsApp Notification Logged]: To ${recipientPhone} [${eventType}]: ${message}`);
      return log;
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: recipientPhone.replace(/[^0-9]/g, ''),
            type: 'text',
            text: { body: message }
          })
        }
      );

      if (response.ok) {
        log.status = 'sent';
      } else {
        const errorData = await response.json();
        log.status = 'failed';
        log.error_message = errorData?.error?.message || 'Failed to dispatch via WhatsApp API';
      }
    } catch (err: any) {
      log.status = 'failed';
      log.error_message = err.message || 'Network error sending WhatsApp';
    }

    return log;
  }
}
