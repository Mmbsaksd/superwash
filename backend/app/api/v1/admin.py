from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional
from datetime import datetime, timezone, date

from app.core.database import get_db
from app.models.entities import (
    Order, OrderItem, OrderStatus, HandoverMethod, PaymentStatus, PaymentMethod,
    User, UserRole, CustomerProfile, StaffProfile, GarmentInspection, PickupDelivery
)
from app.schemas import (
    OrderOut, WalkInOrderCreate, OrderStatusUpdate, OrderUpdate,
    GarmentInspectionCreate, GarmentInspectionOut,
    DashboardMetricsOut, LogisticsTaskCreate, LogisticsTaskOut,
    UserOut, UserCreate
)
from app.services.pricing_service import PricingService
from app.services.order_service import OrderService
from app.services.payment_service import PaymentService
from app.services.logistics_service import LogisticsService
from app.services.notification_service import NotificationService
from app.schemas import PaymentCreate
from app.api.deps import require_roles, get_current_user
from app.core.security import get_password_hash

router = APIRouter(prefix="/admin", tags=["Admin Operations"])

@router.get("/metrics", response_model=DashboardMetricsOut)
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value, UserRole.PROCESSING_STAFF.value))
):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    # 1. Orders received today
    orders_received_today = db.query(func.count(Order.id)).filter(Order.created_at >= today_start).scalar() or 0

    # 2. New orders awaiting confirmation
    new_orders = db.query(func.count(Order.id)).filter(
        Order.status.in_([OrderStatus.ORDER_PLACED.value, OrderStatus.PICKUP_SCHEDULED.value])
    ).scalar() or 0

    # 3. Garments received at shop
    garments_received = db.query(func.count(Order.id)).filter(Order.status == OrderStatus.CLOTHES_RECEIVED.value).scalar() or 0

    # 4. Processing
    orders_processing = db.query(func.count(Order.id)).filter(
        Order.status.in_([OrderStatus.GARMENT_INSPECTION.value, OrderStatus.WASHING_DRYCLEANING.value, OrderStatus.IRONING_FINISHING.value])
    ).scalar() or 0

    # 5. Awaiting QC
    orders_awaiting_qc = db.query(func.count(Order.id)).filter(Order.status == OrderStatus.QUALITY_CHECK.value).scalar() or 0

    # 6. Ready for delivery or collection
    orders_ready = db.query(func.count(Order.id)).filter(Order.status == OrderStatus.READY_FOR_DELIVERY.value).scalar() or 0

    # 7. Pickups scheduled today
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pickups_today = db.query(func.count(Order.id)).filter(
        (Order.pickup_date == today_str) | (Order.created_at >= today_start)
    ).filter(Order.handover_method == HandoverMethod.HOME_PICKUP_DELIVERY.value).scalar() or 0

    # 8. Deliveries scheduled today
    deliveries_today = db.query(func.count(Order.id)).filter(
        (Order.delivery_date == today_str) | (Order.status == OrderStatus.OUT_FOR_DELIVERY.value)
    ).scalar() or 0

    # 9. Revenue today and month (based on completed orders value)
    revenue_today = db.query(func.sum(Order.total_paise)).filter(
        Order.created_at >= today_start,
        Order.status != OrderStatus.CANCELLED.value
    ).scalar() or 0

    revenue_month = db.query(func.sum(Order.total_paise)).filter(
        Order.created_at >= month_start,
        Order.status != OrderStatus.CANCELLED.value
    ).scalar() or 0

    # 10. Payments actually collected & outstanding balances
    payments_collected = db.query(func.sum(Order.paid_paise)).scalar() or 0
    outstanding_balances = db.query(func.sum(Order.outstanding_paise)).filter(
        Order.status != OrderStatus.CANCELLED.value
    ).scalar() or 0

    return {
        "orders_received_today": orders_received_today,
        "new_orders_awaiting_confirmation": new_orders,
        "garments_received_at_shop": garments_received,
        "orders_processing": orders_processing,
        "orders_awaiting_qc": orders_awaiting_qc,
        "orders_ready": orders_ready,
        "pickups_scheduled_today": pickups_today,
        "deliveries_scheduled_today": deliveries_today,
        "revenue_today_paise": revenue_today,
        "revenue_this_month_paise": revenue_month,
        "total_payments_collected_paise": payments_collected,
        "outstanding_customer_balances_paise": outstanding_balances
    }

@router.get("/orders", response_model=List[OrderOut])
def list_orders(
    search: Optional[str] = Query(None, description="Search by Order ID, Customer Name, or Phone"),
    status: Optional[str] = Query(None, description="Filter by status"),
    handover_method: Optional[str] = Query(None, description="Filter by handover method"),
    payment_status: Optional[str] = Query(None, description="Filter by payment status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    staff_user = Depends(require_roles(
        UserRole.OWNER.value, UserRole.MANAGER.value,
        UserRole.PROCESSING_STAFF.value, UserRole.DELIVERY_STAFF.value
    ))
):
    query = db.query(Order)

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Order.order_number.ilike(search_pattern),
                Order.customer_name.ilike(search_pattern),
                Order.customer_phone.ilike(search_pattern)
            )
        )

    if status:
        query = query.filter(Order.status == status)

    if handover_method:
        query = query.filter(Order.handover_method == handover_method)

    if payment_status:
        query = query.filter(Order.payment_status == payment_status)

    orders = query.order_by(Order.created_at.desc()).offset(offset).limit(limit).all()
    return orders

@router.post("/orders/walk-in", response_model=OrderOut)
def create_walk_in_order(
    order_in: WalkInOrderCreate,
    db: Session = Depends(get_db),
    staff_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value, UserRole.PROCESSING_STAFF.value))
):
    """
    Creates an in-person walk-in customer drop-off order with immediate itemization
    and optional initial payment recording.
    """
    if not order_in.items:
        raise HTTPException(status_code=400, detail="Order must include at least one garment item.")

    # Financials calculation
    financials = PricingService.calculate_order_financials(
        db=db,
        items_data=order_in.items,
        handover_method=HandoverMethod.SHOP_DROPOFF.value,
        pincode=None,
        coupon_code=order_in.coupon_code
    )

    # Check or create customer account
    customer = db.query(User).filter(User.phone == order_in.customer_phone.strip()).first()
    if not customer:
        customer = User(
            phone=order_in.customer_phone.strip(),
            email=order_in.customer_email.strip().lower() if order_in.customer_email else None,
            full_name=order_in.customer_name.strip(),
            hashed_password=get_password_hash("SuperWash@123"), # default temp password
            role=UserRole.CUSTOMER.value,
            is_active=True,
            is_phone_verified=True
        )
        db.add(customer)
        db.flush()
        profile = CustomerProfile(user_id=customer.id)
        db.add(profile)
        db.flush()

    order_number = OrderService.generate_order_number(db)

    # Walk-in starts directly at CLOTHES_RECEIVED
    order = Order(
        order_number=order_number,
        customer_id=customer.id,
        customer_name=order_in.customer_name.strip(),
        customer_phone=order_in.customer_phone.strip(),
        customer_email=order_in.customer_email.strip().lower() if order_in.customer_email else None,
        handover_method=HandoverMethod.SHOP_DROPOFF.value,
        status=OrderStatus.CLOTHES_RECEIVED.value,
        special_instructions=order_in.special_instructions,
        subtotal_paise=financials["subtotal_paise"],
        discount_paise=financials["discount_paise"],
        delivery_fee_paise=0,
        tax_paise=financials["tax_paise"],
        total_paise=financials["total_paise"],
        paid_paise=0,
        outstanding_paise=financials["total_paise"],
        coupon_code=financials["coupon_code"],
        payment_status=PaymentStatus.PENDING.value,
        payment_method=order_in.payment_method
    )
    db.add(order)
    db.flush()

    # Add items snapshots
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

    OrderService.update_status(
        db, order, OrderStatus.CLOTHES_RECEIVED.value,
        notes="Walk-in order created at shop counter; clothes physically handed over.",
        changed_by_user=staff_user
    )

    # If partial or full initial payment made
    if order_in.initial_payment_paise and order_in.initial_payment_paise > 0:
        PaymentService.record_payment(
            db=db,
            order=order,
            payment_data=PaymentCreate(
                amount_paise=order_in.initial_payment_paise,
                payment_method=order_in.payment_method,
                transaction_reference=order_in.transaction_reference,
                notes="Counter payment during walk-in order placement"
            ),
            recorded_by=staff_user
        )

    db.refresh(order)
    return order

@router.put("/orders/{order_id}", response_model=OrderOut)
def update_order_details(
    order_id: str,
    update_in: OrderUpdate,
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Protect completed/delivered orders
    if order.status in [OrderStatus.DELIVERED_COLLECTED.value, OrderStatus.CANCELLED.value]:
        raise HTTPException(status_code=400, detail="Cannot modify completed or cancelled orders.")

    for field, value in update_in.model_dump(exclude_unset=True).items():
        setattr(order, field, value)

    db.commit()
    db.refresh(order)
    return order

@router.post("/orders/{order_id}/status", response_model=OrderOut)
def advance_order_status(
    order_id: str,
    status_in: OrderStatusUpdate,
    db: Session = Depends(get_db),
    staff_user = Depends(require_roles(
        UserRole.OWNER.value, UserRole.MANAGER.value,
        UserRole.PROCESSING_STAFF.value, UserRole.DELIVERY_STAFF.value
    ))
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    try:
        updated = OrderService.update_status(
            db, order, status_in.status,
            notes=status_in.notes,
            changed_by_user=staff_user
        )
        # Send customer notification
        NotificationService.notify_order_status_update(db, updated, status_in.status)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/orders/{order_id}/inspection", response_model=GarmentInspectionOut)
def record_garment_inspection(
    order_id: str,
    inspection_in: GarmentInspectionCreate,
    db: Session = Depends(get_db),
    staff_user = Depends(require_roles(
        UserRole.OWNER.value, UserRole.MANAGER.value,
        UserRole.PROCESSING_STAFF.value
    ))
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    inspection = OrderService.record_garment_inspection(
        db, order, inspection_in, inspected_by=staff_user
    )

    # Automatically advance to garment_inspection status if clothes received
    if order.status == OrderStatus.CLOTHES_RECEIVED.value:
        OrderService.update_status(
            db, order, OrderStatus.GARMENT_INSPECTION.value,
            notes=f"Inspection complete. Count received: {inspection_in.actual_count_received}.",
            changed_by_user=staff_user
        )

    return inspection

@router.post("/orders/{order_id}/assign-logistics", response_model=LogisticsTaskOut)
def assign_logistics_task(
    order_id: str,
    task_in: LogisticsTaskCreate,
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    task = LogisticsService.create_or_assign_task(db, order, task_in)
    return task

@router.get("/staff", response_model=List[UserOut])
def get_staff_members(
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    staff_roles = [UserRole.OWNER.value, UserRole.MANAGER.value, UserRole.PROCESSING_STAFF.value, UserRole.DELIVERY_STAFF.value]
    return db.query(User).filter(User.role.in_(staff_roles)).all()

@router.post("/staff", response_model=UserOut)
def create_staff_account(
    user_in: UserCreate,
    designation: Optional[str] = "Store Associate",
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value))
):
    existing = db.query(User).filter(User.phone == user_in.phone.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this phone number already exists.")

    new_staff = User(
        phone=user_in.phone.strip(),
        email=user_in.email.strip().lower() if user_in.email else None,
        full_name=user_in.full_name.strip(),
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role or UserRole.PROCESSING_STAFF.value,
        is_active=True,
        is_phone_verified=True
    )
    db.add(new_staff)
    db.flush()

    staff_profile = StaffProfile(
        user_id=new_staff.id,
        designation=designation or "Staff Member"
    )
    db.add(staff_profile)
    db.commit()
    db.refresh(new_staff)
    return new_staff
