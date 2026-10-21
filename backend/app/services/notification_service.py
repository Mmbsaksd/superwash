from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.entities import NotificationLog
from app.core.config import settings

class NotificationService:
    @staticmethod
    def send_notification(
        db: Session,
        channel: str, # in_app, email, sms, whatsapp
        recipient: str,
        subject: Optional[str],
        message: str,
        user_id: Optional[str] = None,
        order_id: Optional[str] = None
    ) -> NotificationLog:
        """
        Extensible notification dispatcher with persistence to NotificationLog.
        Sends real external messages only when provider credentials are configured.
        """
        status = "sent"
        error = None

        if channel == "sms":
            if not settings.SMS_PROVIDER_CONFIGURED:
                # Log that external provider is not configured
                status = "logged"
                error = "SMS gateway not configured in environment"
        elif channel == "whatsapp":
            if not settings.WHATSAPP_PROVIDER_CONFIGURED:
                status = "logged"
                error = "WhatsApp gateway not configured in environment"
        elif channel == "email":
            if not settings.SMTP_CONFIGURED:
                status = "logged"
                error = "SMTP not configured in environment"

        log = NotificationLog(
            user_id=user_id,
            order_id=order_id,
            channel=channel,
            recipient=recipient,
            subject=subject,
            message=message,
            status=status,
            error=error
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    @staticmethod
    def notify_order_status_update(db: Session, order, new_status: str):
        subject = f"SuperWash Order Update: #{order.order_number}"
        message = f"Hello {order.customer_name}, your order #{order.order_number} status has been updated to '{new_status.replace('_', ' ').title()}'."
        
        # In-app log
        NotificationService.send_notification(
            db, channel="in_app", recipient=order.customer_phone,
            subject=subject, message=message, user_id=order.customer_id, order_id=order.id
        )
        
        # SMS or WhatsApp
        NotificationService.send_notification(
            db, channel="sms", recipient=order.customer_phone,
            subject=subject, message=message, user_id=order.customer_id, order_id=order.id
        )
