from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.entities import (
    Order, OrderItem, OrderStatusHistory, GarmentInspection,
    OrderStatus, HandoverMethod, User, CustomerProfile, AuditLog
)
from app.schemas import GarmentInspectionCreate
from typing import Optional

# Valid transitions state machine
ALLOWED_TRANSITIONS = {
    # Home pickup flow:
    OrderStatus.ORDER_PLACED.value: [
        OrderStatus.PICKUP_SCHEDULED.value,
        OrderStatus.CLOTHES_RECEIVED.value, # for shop drop-off directly
        OrderStatus.CANCELLED.value
    ],
    OrderStatus.PICKUP_SCHEDULED.value: [
        OrderStatus.CLOTHES_RECEIVED.value,
        OrderStatus.CANCELLED.value
    ],
    OrderStatus.CLOTHES_RECEIVED.value: [
        OrderStatus.GARMENT_INSPECTION.value,
        OrderStatus.CANCELLED.value
    ],
    OrderStatus.GARMENT_INSPECTION.value: [
        OrderStatus.WASHING_DRYCLEANING.value,
        OrderStatus.CANCELLED.value
    ],
    OrderStatus.WASHING_DRYCLEANING.value: [
        OrderStatus.IRONING_FINISHING.value,
        OrderStatus.QUALITY_CHECK.value
    ],
    OrderStatus.IRONING_FINISHING.value: [
        OrderStatus.QUALITY_CHECK.value
    ],
    OrderStatus.QUALITY_CHECK.value: [
        OrderStatus.READY_FOR_DELIVERY.value,
        OrderStatus.WASHING_DRYCLEANING.value # Send back if failed QC
    ],
    OrderStatus.READY_FOR_DELIVERY.value: [
        OrderStatus.OUT_FOR_DELIVERY.value,
        OrderStatus.DELIVERED_COLLECTED.value # if collected at shop directly
    ],
    OrderStatus.OUT_FOR_DELIVERY.value: [
        OrderStatus.DELIVERED_COLLECTED.value,
        OrderStatus.READY_FOR_DELIVERY.value # failed delivery attempt
    ],
    OrderStatus.DELIVERED_COLLECTED.value: [],
    OrderStatus.CANCELLED.value: []
}

class OrderService:
    @staticmethod
    def generate_order_number(db: Session) -> str:
        current_year = datetime.now(timezone.utc).year
        # Count orders in the current year
        year_prefix = f"SW-{current_year}-"
        count = db.query(func.count(Order.id)).filter(Order.order_number.like(f"{year_prefix}%")).scalar() or 0
        return f"{year_prefix}{1001 + count}"

    @staticmethod
    def update_status(
        db: Session,
        order: Order,
        new_status: str,
        notes: Optional[str] = None,
        changed_by_user: Optional[User] = None
    ) -> Order:
        if new_status == order.status:
            return order

        # Validate transition
        allowed = ALLOWED_TRANSITIONS.get(order.status, [])
        # Admin override or valid state transition
        is_admin = changed_by_user and changed_by_user.role in ["owner", "manager"]
        if new_status not in allowed and not is_admin:
            raise ValueError(f"Cannot transition order from '{order.status}' to '{new_status}'. Allowed: {allowed}")

        previous_status = order.status
        order.status = new_status
        order.updated_at = datetime.now(timezone.utc)

        # Record in history (append-only)
        history = OrderStatusHistory(
            order_id=order.id,
            previous_status=previous_status,
            new_status=new_status,
            notes=notes,
            changed_by_id=changed_by_user.id if changed_by_user else None
        )
        db.add(history)

        # If order is completed or delivered, update customer profile spending stats
        if new_status == OrderStatus.DELIVERED_COLLECTED.value and order.customer_id:
            profile = db.query(CustomerProfile).filter(CustomerProfile.user_id == order.customer_id).first()
            if profile:
                profile.total_orders += 1
                profile.total_spent_paise += order.paid_paise
                profile.outstanding_balance_paise = max(0, profile.outstanding_balance_paise + order.outstanding_paise)

        # Audit log
        audit = AuditLog(
            user_id=changed_by_user.id if changed_by_user else None,
            action="ORDER_STATUS_CHANGED",
            entity_type="Order",
            entity_id=order.id,
            details_json=f'{{"from": "{previous_status}", "to": "{new_status}", "notes": "{notes or ""}"}}'
        )
        db.add(audit)

        db.commit()
        db.refresh(order)
        return order

    @staticmethod
    def record_garment_inspection(
        db: Session,
        order: Order,
        inspection_data: GarmentInspectionCreate,
        inspected_by: Optional[User] = None
    ) -> GarmentInspection:
        inspection = GarmentInspection(
            order_id=order.id,
            inspected_by_id=inspected_by.id if inspected_by else None,
            actual_count_received=inspection_data.actual_count_received,
            existing_stains_damage=inspection_data.existing_stains_damage,
            customer_instructions=inspection_data.customer_instructions,
            inspection_notes=inspection_data.inspection_notes,
            quality_check_passed=inspection_data.quality_check_passed,
            quality_check_notes=inspection_data.quality_check_notes,
            missing_damaged_incidents=inspection_data.missing_damaged_incidents
        )
        db.add(inspection)
        db.commit()
        db.refresh(inspection)
        return inspection

    @staticmethod
    def cancel_order(
        db: Session,
        order: Order,
        reason: str,
        user: Optional[User] = None
    ) -> Order:
        # Check if cancellation is allowed
        non_cancellable = [
            OrderStatus.WASHING_DRYCLEANING.value,
            OrderStatus.IRONING_FINISHING.value,
            OrderStatus.QUALITY_CHECK.value,
            OrderStatus.READY_FOR_DELIVERY.value,
            OrderStatus.OUT_FOR_DELIVERY.value,
            OrderStatus.DELIVERED_COLLECTED.value,
            OrderStatus.CANCELLED.value
        ]
        is_admin = user and user.role in ["owner", "manager"]
        if order.status in non_cancellable and not is_admin:
            raise ValueError(f"Order cannot be cancelled once processing has started ({order.status}).")

        order.cancellation_reason = reason
        OrderService.update_status(db, order, OrderStatus.CANCELLED.value, notes=f"Cancelled: {reason}", changed_by_user=user)
        return order
