from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.core.database import get_db
from app.models.entities import (
    Order, OrderItem, OrderStatus, HandoverMethod, PaymentStatus, PaymentMethod,
    User, UserRole, DeliveryTimeSlot, ServiceableArea
)
from app.schemas import (
    CustomerBookingCreate, OrderOut, OrderCancelRequest
)
from app.services.pricing_service import PricingService
from app.services.order_service import OrderService
from app.services.logistics_service import LogisticsService
from app.services.notification_service import NotificationService
from app.api.deps import get_current_user, get_optional_current_user

router = APIRouter(prefix="/orders", tags=["Orders"])

@router.post("/book", response_model=OrderOut)
def book_order(
    booking_in: CustomerBookingCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    if not booking_in.items:
        raise HTTPException(status_code=400, detail="Order must include at least one garment item.")

    # Validate slot capacity if home pickup & delivery
    if booking_in.handover_method == HandoverMethod.HOME_PICKUP_DELIVERY.value:
        if not booking_in.pickup_address or not booking_in.pincode:
            raise HTTPException(status_code=400, detail="Pickup address and PIN code are required for home pickup.")

        # Check serviceable PIN code
        area = db.query(ServiceableArea).filter(
            ServiceableArea.pincode == booking_in.pincode.strip(),
            ServiceableArea.is_active == True
        ).first()
        if not area:
            raise HTTPException(status_code=400, detail=f"PIN code {booking_in.pincode} is currently outside our service area.")

        if booking_in.pickup_slot_id and booking_in.pickup_date:
            is_available = LogisticsService.validate_slot_capacity(
                db, booking_in.pickup_slot_id, booking_in.pickup_date
            )
            if not is_available:
                raise HTTPException(status_code=400, detail="Selected pickup time slot is fully booked. Please choose another slot.")

    # Calculate financial breakdown
    financials = PricingService.calculate_order_financials(
        db=db,
        items_data=booking_in.items,
        handover_method=booking_in.handover_method,
        pincode=booking_in.pincode,
        coupon_code=booking_in.coupon_code
    )

    # Determine customer_id (logged-in or lookup by phone)
    customer_id = None
    if current_user:
        customer_id = current_user.id
    else:
        # Check if existing customer has this phone
        existing_cust = db.query(User).filter(User.phone == booking_in.customer_phone.strip()).first()
        if existing_cust:
            customer_id = existing_cust.id

    order_number = OrderService.generate_order_number(db)

    # Initial status depends on handover method
    initial_status = OrderStatus.ORDER_PLACED.value
    if booking_in.handover_method == HandoverMethod.HOME_PICKUP_DELIVERY.value:
        initial_status = OrderStatus.PICKUP_SCHEDULED.value

    order = Order(
        order_number=order_number,
        customer_id=customer_id,
        customer_name=booking_in.customer_name.strip(),
        customer_phone=booking_in.customer_phone.strip(),
        customer_email=booking_in.customer_email.strip().lower() if booking_in.customer_email else None,
        handover_method=booking_in.handover_method,
        status=initial_status,
        special_instructions=booking_in.special_instructions,
        subtotal_paise=financials["subtotal_paise"],
        discount_paise=financials["discount_paise"],
        delivery_fee_paise=financials["delivery_fee_paise"],
        tax_paise=financials["tax_paise"],
        total_paise=financials["total_paise"],
        paid_paise=0,
        outstanding_paise=financials["total_paise"],
        coupon_code=financials["coupon_code"],
        payment_status=PaymentStatus.PENDING.value,
        payment_method=booking_in.payment_method,
        pickup_address=booking_in.pickup_address,
        delivery_address=booking_in.delivery_address or booking_in.pickup_address,
        pincode=booking_in.pincode,
        pickup_slot_id=booking_in.pickup_slot_id,
        delivery_slot_id=booking_in.delivery_slot_id,
        pickup_date=booking_in.pickup_date,
        delivery_date=booking_in.delivery_date
    )
    db.add(order)
    db.flush()

    # Create immutable order item snapshots
    for item_snap in financials["resolved_items"]:
        item_record = OrderItem(
            order_id=order.id,
            service_id=item_snap["service_id"],
            service_price_id=item_snap["service_price_id"],
            service_name_snapshot=item_snap["service_name_snapshot"],
            item_name_snapshot=item_snap["item_name_snapshot"],
            pricing_type_snapshot=item_snap["pricing_type_snapshot"],
            unit_price_paise_snapshot=item_snap["unit_price_paise_snapshot"],
            quantity=item_snap["quantity"],
            weight_kg=item_snap["weight_kg"],
            subtotal_paise=item_snap["subtotal_paise"],
            special_instruction=item_snap["special_instruction"]
        )
        db.add(item_record)

    db.commit()

    # Record initial history
    OrderService.update_status(
        db, order, initial_status,
        notes="Order booked online by customer",
        changed_by_user=current_user
    )

    # Notify customer
    NotificationService.notify_order_status_update(db, order, initial_status)

    db.refresh(order)
    return order

@router.get("/track/{order_number}", response_model=OrderOut)
def track_order_securely(
    order_number: str,
    phone: Optional[str] = Query(None, description="Customer phone number for verification"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    order = db.query(Order).filter(Order.order_number == order_number.strip().upper()).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Authorization / verification check
    is_staff = current_user and current_user.role in [
        UserRole.OWNER.value, UserRole.MANAGER.value,
        UserRole.PROCESSING_STAFF.value, UserRole.DELIVERY_STAFF.value
    ]
    is_owner = current_user and order.customer_id == current_user.id
    phone_matches = phone and (phone.strip()[-10:] == order.customer_phone[-10:])

    if not (is_staff or is_owner or phone_matches):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="To view this order, please provide the registered customer phone number or log in to your account."
        )

    return order

@router.get("/my-orders", response_model=List[OrderOut])
def get_customer_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Match both customer_id and customer phone number
    orders = db.query(Order).filter(
        (Order.customer_id == current_user.id) | (Order.customer_phone == current_user.phone)
    ).order_by(Order.created_at.desc()).all()
    return orders

@router.get("/{order_id}", response_model=OrderOut)
def get_order_by_id(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_staff = current_user.role in [
        UserRole.OWNER.value, UserRole.MANAGER.value,
        UserRole.PROCESSING_STAFF.value, UserRole.DELIVERY_STAFF.value
    ]
    if not is_staff and order.customer_id != current_user.id and order.customer_phone != current_user.phone:
        raise HTTPException(status_code=403, detail="Access denied")

    return order

@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_order_request(
    order_id: str,
    cancel_in: OrderCancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_staff = current_user.role in [UserRole.OWNER.value, UserRole.MANAGER.value]
    if not is_staff and order.customer_id != current_user.id and order.customer_phone != current_user.phone:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        updated = OrderService.cancel_order(db, order, cancel_in.reason, user=current_user)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
