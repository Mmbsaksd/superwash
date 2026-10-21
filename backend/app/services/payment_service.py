import hmac
import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.entities import Order, Payment, Refund, PaymentWebhookEvent, PaymentStatus, User, AuditLog
from app.schemas import PaymentCreate, RefundCreate
from app.core.config import settings
import razorpay

class PaymentService:
    @staticmethod
    def get_razorpay_client():
        try:
            return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        except Exception:
            return None

    @staticmethod
    def create_razorpay_order(db: Session, order: Order) -> Dict[str, Any]:
        """
        Creates an online payment order with Razorpay or sandbox simulator.
        """
        amount_to_pay = order.outstanding_paise
        if amount_to_pay <= 0:
            raise ValueError("Order is already fully paid")

        razorpay_order_id = f"order_mock_{uuid.uuid4().hex[:14]}"
        
        # If real keys are provided and not default mock
        if not settings.RAZORPAY_KEY_ID.startswith("rzp_test_SuperWashMock"):
            try:
                client = PaymentService.get_razorpay_client()
                if client:
                    rp_order = client.order.create({
                        "amount": amount_to_pay,
                        "currency": "INR",
                        "receipt": order.order_number,
                        "notes": {
                            "order_id": order.id,
                            "order_number": order.order_number,
                            "customer_phone": order.customer_phone
                        }
                    })
                    razorpay_order_id = rp_order["id"]
            except Exception as e:
                # Fallback to sandbox mock in dev if API call fails
                razorpay_order_id = f"order_mock_{uuid.uuid4().hex[:14]}"

        return {
            "razorpay_order_id": razorpay_order_id,
            "key_id": settings.RAZORPAY_KEY_ID,
            "amount_paise": amount_to_pay,
            "currency": "INR",
            "order_number": order.order_number,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "customer_email": order.customer_email or "guest@superwash.in"
        }

    @staticmethod
    def verify_razorpay_signature(razorpay_order_id: str, razorpay_payment_id: str, razorpay_signature: str) -> bool:
        """
        Cryptographically verifies the HMAC SHA256 signature returned by Razorpay.
        """
        if not razorpay_order_id or not razorpay_payment_id or not razorpay_signature:
            return False

        message = f"{razorpay_order_id}|{razorpay_payment_id}".encode("utf-8")
        secret = settings.RAZORPAY_KEY_SECRET.encode("utf-8")

        generated_signature = hmac.new(secret, message, hashlib.sha256).hexdigest()

        # Check standard hmac match or sandbox dev token match
        if hmac.compare_digest(generated_signature, razorpay_signature):
            return True
        
        # Sandbox bypass check only in development mock mode
        if settings.RAZORPAY_SANDBOX_MODE and razorpay_signature.startswith("sandbox_sig_"):
            return True

        return False

    @staticmethod
    def record_payment(
        db: Session,
        order: Order,
        payment_data: PaymentCreate,
        gateway_order_id: Optional[str] = None,
        gateway_signature: Optional[str] = None,
        recorded_by: Optional[User] = None
    ) -> Payment:
        """
        Records a payment against an order and updates order financial state.
        Supports cash, UPI manual, and Razorpay online payments.
        """
        if payment_data.amount_paise <= 0:
            raise ValueError("Payment amount must be greater than 0")

        # Create unique payment receipt number
        payment_count = db.query(Payment).filter(Payment.order_id == order.id).count()
        payment_number = f"PAY-{order.order_number}-{payment_count + 1}"

        payment = Payment(
            order_id=order.id,
            payment_number=payment_number,
            amount_paise=payment_data.amount_paise,
            payment_method=payment_data.payment_method,
            payment_status=PaymentStatus.PAID.value,
            transaction_reference=payment_data.transaction_reference,
            gateway_order_id=gateway_order_id,
            gateway_signature=gateway_signature,
            notes=payment_data.notes,
            recorded_by_id=recorded_by.id if recorded_by else None
        )
        db.add(payment)

        # Update order financials
        order.paid_paise += payment_data.amount_paise
        order.outstanding_paise = max(0, order.total_paise - order.paid_paise)

        if order.outstanding_paise == 0:
            order.payment_status = PaymentStatus.PAID.value
        elif order.paid_paise > 0:
            order.payment_status = "partially_paid"
        
        order.payment_method = payment_data.payment_method

        # Audit log
        audit = AuditLog(
            user_id=recorded_by.id if recorded_by else None,
            action="PAYMENT_RECORDED",
            entity_type="Payment",
            entity_id=payment.id,
            details_json=f'{{"order_number": "{order.order_number}", "amount_paise": {payment_data.amount_paise}, "method": "{payment_data.payment_method}"}}'
        )
        db.add(audit)

        db.commit()
        db.refresh(order)
        db.refresh(payment)
        return payment

    @staticmethod
    def record_refund(
        db: Session,
        order: Order,
        refund_data: RefundCreate,
        recorded_by: Optional[User] = None
    ) -> Refund:
        if refund_data.amount_paise <= 0:
            raise ValueError("Refund amount must be positive")
        if refund_data.amount_paise > order.paid_paise:
            raise ValueError(f"Refund amount (₹{refund_data.amount_paise // 100}) cannot exceed amount paid (₹{order.paid_paise // 100})")

        refund = Refund(
            order_id=order.id,
            payment_id=refund_data.payment_id,
            amount_paise=refund_data.amount_paise,
            reason=refund_data.reason,
            gateway_refund_id=f"rfnd_mock_{uuid.uuid4().hex[:10]}",
            status="processed",
            recorded_by_id=recorded_by.id if recorded_by else None
        )
        db.add(refund)

        # Update order paid amount
        order.paid_paise -= refund_data.amount_paise
        order.outstanding_paise = max(0, order.total_paise - order.paid_paise)
        if order.paid_paise == 0:
            order.payment_status = PaymentStatus.REFUNDED.value
        else:
            order.payment_status = PaymentStatus.PARTIALLY_REFUNDED.value

        db.commit()
        db.refresh(order)
        db.refresh(refund)
        return refund

    @staticmethod
    def process_webhook(db: Session, event_id: str, event_type: str, payload_json: str, signature: str) -> bool:
        # Check idempotency
        existing_event = db.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.event_id == event_id).first()
        if existing_event:
            return True # already processed

        event_record = PaymentWebhookEvent(
            event_id=event_id,
            event_type=event_type,
            payload_json=payload_json,
            processed=False
        )
        db.add(event_record)
        db.commit()

        # In production, verify settings.RAZORPAY_WEBHOOK_SECRET against signature
        event_record.processed = True
        db.commit()
        return True
