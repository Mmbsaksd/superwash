from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, timezone, timedelta
import csv
import io

from app.core.database import get_db
from app.models.entities import Order, OrderItem, Payment, UserRole, OrderStatus
from app.api.deps import require_roles

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])

@router.get("/analytics")
def get_analytics(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    since_date = datetime.now(timezone.utc) - timedelta(days=days)

    # Total order count & total revenue
    orders_count = db.query(func.count(Order.id)).filter(
        Order.created_at >= since_date,
        Order.status != OrderStatus.CANCELLED.value
    ).scalar() or 0

    total_order_value = db.query(func.sum(Order.total_paise)).filter(
        Order.created_at >= since_date,
        Order.status != OrderStatus.CANCELLED.value
    ).scalar() or 0

    total_payments_received = db.query(func.sum(Payment.amount_paise)).filter(
        Payment.created_at >= since_date,
        Payment.payment_status == "paid"
    ).scalar() or 0

    outstanding_balance = db.query(func.sum(Order.outstanding_paise)).filter(
        Order.created_at >= since_date,
        Order.status != OrderStatus.CANCELLED.value
    ).scalar() or 0

    # Orders by handover method
    handover_stats = db.query(
        Order.handover_method,
        func.count(Order.id)
    ).filter(
        Order.created_at >= since_date
    ).group_by(Order.handover_method).all()

    # Orders by status
    status_stats = db.query(
        Order.status,
        func.count(Order.id)
    ).filter(
        Order.created_at >= since_date
    ).group_by(Order.status).all()

    # Top garments / services
    popular_items = db.query(
        OrderItem.item_name_snapshot,
        func.sum(OrderItem.quantity),
        func.sum(OrderItem.subtotal_paise)
    ).join(Order, Order.id == OrderItem.order_id).filter(
        Order.created_at >= since_date
    ).group_by(OrderItem.item_name_snapshot).order_by(func.sum(OrderItem.quantity).desc()).limit(10).all()

    return {
        "period_days": days,
        "total_orders": orders_count,
        "total_order_value_paise": total_order_value,
        "total_payments_received_paise": total_payments_received,
        "outstanding_balance_paise": outstanding_balance,
        "orders_by_handover": [{"method": h[0], "count": h[1]} for h in handover_stats],
        "orders_by_status": [{"status": s[0], "count": s[1]} for s in status_stats],
        "popular_items": [
            {"item_name": item[0], "quantity": item[1], "revenue_paise": item[2]}
            for item in popular_items
        ]
    }

@router.get("/export-csv")
def export_orders_csv(
    db: Session = Depends(get_db),
    admin_user = Depends(require_roles(UserRole.OWNER.value, UserRole.MANAGER.value))
):
    orders = db.query(Order).order_by(Order.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Order Number", "Date", "Customer Name", "Customer Phone",
        "Handover Method", "Status", "Items Count",
        "Subtotal (INR)", "Discount (INR)", "Delivery Fee (INR)", "Tax (INR)", "Total (INR)",
        "Paid (INR)", "Outstanding (INR)", "Payment Status"
    ])

    for o in orders:
        items_count = sum(i.quantity for i in o.items)
        writer.writerow([
            o.order_number,
            o.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            o.customer_name,
            o.customer_phone,
            o.handover_method,
            o.status,
            items_count,
            f"{o.subtotal_paise / 100:.2f}",
            f"{o.discount_paise / 100:.2f}",
            f"{o.delivery_fee_paise / 100:.2f}",
            f"{o.tax_paise / 100:.2f}",
            f"{o.total_paise / 100:.2f}",
            f"{o.paid_paise / 100:.2f}",
            f"{o.outstanding_paise / 100:.2f}",
            o.payment_status
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=superwash_orders_{datetime.now().strftime('%Y%m%d')}.csv"}
    )
