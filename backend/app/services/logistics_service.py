from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.entities import DeliveryTimeSlot, Order, PickupDelivery, TaskStatus, User, OrderStatus
from app.schemas import LogisticsTaskCreate, LogisticsTaskUpdate

class LogisticsService:
    @staticmethod
    def validate_slot_capacity(db: Session, slot_id: str, date_str: str) -> bool:
        """
        Validates that a time slot is not overbooked for the specified date.
        """
        slot = db.query(DeliveryTimeSlot).filter(DeliveryTimeSlot.id == slot_id).first()
        if not slot or not slot.is_active:
            return False

        # Count existing orders booked for this slot and date
        booked_count = db.query(func.count(Order.id)).filter(
            ((Order.pickup_slot_id == slot_id) & (Order.pickup_date == date_str)) |
            ((Order.delivery_slot_id == slot_id) & (Order.delivery_date == date_str))
        ).scalar() or 0

        return booked_count < slot.max_capacity

    @staticmethod
    def create_or_assign_task(
        db: Session,
        order: Order,
        task_data: LogisticsTaskCreate
    ) -> PickupDelivery:
        task = PickupDelivery(
            order_id=order.id,
            task_type=task_data.task_type,
            scheduled_date=task_data.scheduled_date,
            scheduled_time_slot=task_data.scheduled_time_slot,
            assigned_staff_id=task_data.assigned_staff_id,
            status=TaskStatus.SCHEDULED.value,
            notes=task_data.notes
        )
        db.add(task)

        # Update order assigned staff
        if task_data.task_type == "pickup":
            order.assigned_pickup_staff_id = task_data.assigned_staff_id
        else:
            order.assigned_delivery_staff_id = task_data.assigned_staff_id

        db.commit()
        db.refresh(task)
        return task

    @staticmethod
    def update_task_status(
        db: Session,
        task_id: str,
        update_data: LogisticsTaskUpdate,
        user: Optional[User] = None
    ) -> PickupDelivery:
        task = db.query(PickupDelivery).filter(PickupDelivery.id == task_id).first()
        if not task:
            raise ValueError("Logistics task not found")

        task.status = update_data.status
        if update_data.failure_reason:
            task.failure_reason = update_data.failure_reason
        if update_data.notes:
            task.notes = update_data.notes

        if update_data.status == TaskStatus.COMPLETED.value:
            task.completed_at = datetime.now(timezone.utc)
            # Update order status accordingly
            if task.task_type == "pickup":
                task.order.status = OrderStatus.CLOTHES_RECEIVED.value
            elif task.task_type == "delivery":
                task.order.status = OrderStatus.DELIVERED_COLLECTED.value

        db.commit()
        db.refresh(task)
        return task
