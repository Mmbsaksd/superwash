from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.models.entities import Order, User, UserRole, PaymentStatus
from app.schemas import (
    PaymentCreate, PaymentOut, RefundCreate, RefundOut,
    RazorpayCreateOrderRequest, RazorpayVerifyRequest
)
from app.services.payment_service import PaymentService
from app.api.deps import get_current_user, require_roles

router = APIRouter(prefix="/payments", tags=["Payments"])

@router.post("/razorpay/create-order")
def create_razorpay_order_endpoint(
    req: RazorpayCreateOrderRequest,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == req.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    try:
        rp_data = PaymentService.create_razorpay_order(db, order)
        return rp_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/razorpay/verify", response_model=PaymentOut)
def verify_razorpay_payment(
    req: RazorpayVerifyRequest,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == req.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Cryptographically verify signature on backend
    is_valid = PaymentService.verify_razorpay_signature(
        razorpay_order_id=req.razorpay_order_id,
        razorpay_payment_id=req.razorpay_payment_id,
        razorpay_signature=req.razorpay_signature
    )

    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail="Payment verification failed: Invalid cryptographic signature."
        )

    # Check if payment ID already recorded (idempotency)
    existing = [p for p in order.payments if p.transaction_reference == req.razorpay_payment_id]
    if existing:
        return existing[0]

    # Record payment
    payment = PaymentService.record_payment(
        db=db,
        order=order,
        payment_data=PaymentCreate(
            amount_paise=order.outstanding_paise,
            payment_method="razorpay",
            transaction_reference=req.razorpay_payment_id,
            notes=f"Razorpay online payment verified. Order ID: {req.razorpay_order_id}"
        ),
        gateway_order_id=req.razorpay_order_id,
        gateway_signature=req.razorpay_signature
    )
    return payment

@router.post("/record-manual", response_model=PaymentOut)
def record_manual_payment(
    order_id: str,
    payment_in: PaymentCreate,
    db: Session = Depends(get_db),
    staff_user = Depends(require_roles(
        UserRole.OWNER.value, UserRole.MANAGER.value,
        UserRole.PROCESSING_STAFF.value, UserRole.DELIVERY_STAFF.value
    ))
):
    """
    Staff / Admin records a cash or UPI payment (with UTR reference).
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if payment_in.amount_paise > order.outstanding_paise:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount (₹{payment_in.amount_paise // 100}) cannot exceed outstanding balance (₹{order.outstanding_paise // 100})"
        )

    payment = PaymentService.record_payment(
        db=db,
        order=order,
        payment_data=payment_in,
        recorded_by=staff_user
    )
    return payment

@router.post("/refund", response_model=RefundOut)
def process_refund(
    order_id: str,
    refund_in: RefundCreate,
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    try:
        refund = PaymentService.record_refund(
            db=db,
            order=order,
            refund_data=refund_in,
            recorded_by=admin_user
        )
        return refund
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    body_bytes = await request.body()
    body_str = body_bytes.decode("utf-8")
    event_id = request.headers.get("x-razorpay-event-id", "evt_unknown")

    try:
        PaymentService.process_webhook(
            db=db,
            event_id=event_id,
            event_type="payment.captured",
            payload_json=body_str,
            signature=x_razorpay_signature or ""
        )
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
