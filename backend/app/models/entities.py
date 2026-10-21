import uuid
from datetime import datetime, timezone
import enum
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, ForeignKey, 
    Text, Enum as SQLEnum, Float, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.core.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class UserRole(str, enum.Enum):
    OWNER = "owner"
    MANAGER = "manager"
    PROCESSING_STAFF = "processing_staff"
    DELIVERY_STAFF = "delivery_staff"
    CUSTOMER = "customer"

class HandoverMethod(str, enum.Enum):
    SHOP_DROPOFF = "shop_dropoff"
    HOME_PICKUP_DELIVERY = "home_pickup_delivery"

class OrderStatus(str, enum.Enum):
    ORDER_PLACED = "order_placed"
    PICKUP_SCHEDULED = "pickup_scheduled"
    CLOTHES_RECEIVED = "clothes_received"
    GARMENT_INSPECTION = "garment_inspection"
    WASHING_DRYCLEANING = "washing_drycleaning"
    IRONING_FINISHING = "ironing_finishing"
    QUALITY_CHECK = "quality_check"
    READY_FOR_DELIVERY = "ready_for_delivery"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED_COLLECTED = "delivered_collected"
    CANCELLED = "cancelled"

class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    AUTHORIZED = "authorized"
    PAID = "paid"
    FAILED = "failed"
    PARTIALLY_REFUNDED = "partially_refunded"
    REFUNDED = "refunded"

class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    UPI_MANUAL = "upi_manual"
    RAZORPAY = "razorpay"
    PAY_ON_DELIVERY = "pay_on_delivery"
    PAY_LATER = "pay_later"

class PricingType(str, enum.Enum):
    PER_PIECE = "per_piece"
    PER_KG = "per_kg"
    PER_ITEM = "per_item"

class TaskStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=True)
    phone = Column(String(20), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default=UserRole.CUSTOMER.value, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_phone_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    customer_profile = relationship("CustomerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    staff_profile = relationship("StaffProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    addresses = relationship("CustomerAddress", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="customer", foreign_keys="[Order.customer_id]")

class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    notes = Column(Text, nullable=True)
    total_orders = Column(Integer, default=0, nullable=False)
    total_spent_paise = Column(Integer, default=0, nullable=False)
    outstanding_balance_paise = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="customer_profile")

class CustomerAddress(Base):
    __tablename__ = "customer_addresses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(50), default="Home", nullable=False)  # Home, Work, Other
    address_line1 = Column(String(255), nullable=False)
    address_line2 = Column(String(255), nullable=True)
    landmark = Column(String(255), nullable=True)
    city = Column(String(100), default="Bengaluru", nullable=False)
    state = Column(String(100), default="Karnataka", nullable=False)
    pincode = Column(String(10), nullable=False, index=True)
    is_default = Column(Boolean, default=False, nullable=False)
    is_serviceable = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="addresses")

class StaffProfile(Base):
    __tablename__ = "staff_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    designation = Column(String(100), nullable=False)
    phone_alternate = Column(String(20), nullable=True)
    is_available = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="staff_profile")

class Service(Base):
    __tablename__ = "services"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    code = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False)  # wash_fold, wash_iron, dry_clean, ironing, premium, blankets, curtains
    is_active = Column(Boolean, default=True, nullable=False)
    icon = Column(String(50), default="Sparkles", nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    prices = relationship("ServicePrice", back_populates="service", cascade="all, delete-orphan", order_by="ServicePrice.sort_order")

class ServicePrice(Base):
    __tablename__ = "service_prices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    item_name = Column(String(100), nullable=False)  # e.g., "Shirt", "Trouser", "Suit 2-pc", "Per KG"
    pricing_type = Column(String(20), default=PricingType.PER_PIECE.value, nullable=False)
    price_paise = Column(Integer, nullable=False)  # integer paise (e.g. 3000 = Rs 30)
    min_quantity = Column(Integer, default=1, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    service = relationship("Service", back_populates="prices")

class DeliveryTimeSlot(Base):
    __tablename__ = "delivery_time_slots"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)  # "09:00 AM - 12:00 PM"
    start_time = Column(String(10), nullable=False)  # "09:00"
    end_time = Column(String(10), nullable=False)    # "12:00"
    slot_type = Column(String(20), default="both", nullable=False) # pickup, delivery, both
    max_capacity = Column(Integer, default=15, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

class ServiceableArea(Base):
    __tablename__ = "serviceable_areas"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    pincode = Column(String(10), unique=True, nullable=False, index=True)
    area_name = Column(String(100), nullable=False)
    city = Column(String(100), default="Bengaluru", nullable=False)
    delivery_fee_paise = Column(Integer, default=5000, nullable=False)
    min_order_paise = Column(Integer, default=20000, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    code = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    discount_type = Column(String(20), default="percentage", nullable=False)  # percentage, fixed
    discount_value = Column(Integer, nullable=False)  # percentage (e.g. 10) or paise (e.g. 5000)
    min_order_paise = Column(Integer, default=0, nullable=False)
    max_discount_paise = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    valid_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class Order(Base):
    __tablename__ = "orders"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    order_number = Column(String(30), unique=True, nullable=False, index=True)  # e.g., "SW-2026-1001"
    customer_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(20), nullable=False, index=True)
    customer_email = Column(String(255), nullable=True)
    
    handover_method = Column(String(30), default=HandoverMethod.SHOP_DROPOFF.value, nullable=False, index=True)
    status = Column(String(30), default=OrderStatus.ORDER_PLACED.value, nullable=False, index=True)
    cancellation_reason = Column(Text, nullable=True)
    special_instructions = Column(Text, nullable=True)
    internal_notes = Column(Text, nullable=True)

    # Financial snapshots (accurate integer paise)
    subtotal_paise = Column(Integer, default=0, nullable=False)
    discount_paise = Column(Integer, default=0, nullable=False)
    delivery_fee_paise = Column(Integer, default=0, nullable=False)
    tax_paise = Column(Integer, default=0, nullable=False)
    total_paise = Column(Integer, default=0, nullable=False)
    paid_paise = Column(Integer, default=0, nullable=False)
    outstanding_paise = Column(Integer, default=0, nullable=False)
    coupon_code = Column(String(50), nullable=True)

    payment_status = Column(String(30), default=PaymentStatus.PENDING.value, nullable=False, index=True)
    payment_method = Column(String(30), default=PaymentMethod.CASH.value, nullable=False)

    # Pickup & Delivery Details
    pickup_address = Column(Text, nullable=True)
    delivery_address = Column(Text, nullable=True)
    pincode = Column(String(10), nullable=True)
    pickup_slot_id = Column(String(36), ForeignKey("delivery_time_slots.id", ondelete="SET NULL"), nullable=True)
    delivery_slot_id = Column(String(36), ForeignKey("delivery_time_slots.id", ondelete="SET NULL"), nullable=True)
    pickup_date = Column(String(20), nullable=True)
    delivery_date = Column(String(20), nullable=True)
    assigned_pickup_staff_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_delivery_staff_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    customer = relationship("User", foreign_keys=[customer_id], back_populates="orders")
    assigned_pickup_staff = relationship("User", foreign_keys=[assigned_pickup_staff_id])
    assigned_delivery_staff = relationship("User", foreign_keys=[assigned_delivery_staff_id])
    pickup_slot = relationship("DeliveryTimeSlot", foreign_keys=[pickup_slot_id])
    delivery_slot = relationship("DeliveryTimeSlot", foreign_keys=[delivery_slot_id])

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    status_history = relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan", order_by="OrderStatusHistory.created_at")
    inspections = relationship("GarmentInspection", back_populates="order", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="order", cascade="all, delete-orphan")
    refunds = relationship("Refund", back_populates="order", cascade="all, delete-orphan")
    logistics_tasks = relationship("PickupDelivery", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="SET NULL"), nullable=True)
    service_price_id = Column(String(36), ForeignKey("service_prices.id", ondelete="SET NULL"), nullable=True)
    
    # Historical Snapshots (immutable once recorded)
    service_name_snapshot = Column(String(100), nullable=False)
    item_name_snapshot = Column(String(100), nullable=False)
    pricing_type_snapshot = Column(String(20), nullable=False)
    unit_price_paise_snapshot = Column(Integer, nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    weight_kg = Column(Float, nullable=True)
    subtotal_paise = Column(Integer, nullable=False)
    special_instruction = Column(String(255), nullable=True)

    order = relationship("Order", back_populates="items")

class GarmentInspection(Base):
    __tablename__ = "garment_inspections"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    inspected_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actual_count_received = Column(Integer, nullable=False)
    existing_stains_damage = Column(Text, nullable=True)
    customer_instructions = Column(Text, nullable=True)
    inspection_notes = Column(Text, nullable=True)
    quality_check_passed = Column(Boolean, default=True, nullable=False)
    quality_check_notes = Column(Text, nullable=True)
    missing_damaged_incidents = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    order = relationship("Order", back_populates="inspections")
    inspected_by = relationship("User", foreign_keys=[inspected_by_id])

class OrderStatusHistory(Base):
    __tablename__ = "order_status_histories"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_status = Column(String(30), nullable=True)
    new_status = Column(String(30), nullable=False)
    notes = Column(Text, nullable=True)
    changed_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    order = relationship("Order", back_populates="status_history")
    changed_by = relationship("User", foreign_keys=[changed_by_id])

class Payment(Base):
    __tablename__ = "payments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_number = Column(String(40), unique=True, nullable=False, index=True)
    amount_paise = Column(Integer, nullable=False)
    payment_method = Column(String(30), nullable=False) # cash, upi_manual, razorpay
    payment_status = Column(String(30), default=PaymentStatus.PENDING.value, nullable=False, index=True)
    transaction_reference = Column(String(100), nullable=True, index=True) # UTR or Razorpay Payment ID
    gateway_order_id = Column(String(100), nullable=True, index=True)
    gateway_signature = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    recorded_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    order = relationship("Order", back_populates="payments")
    recorded_by = relationship("User", foreign_keys=[recorded_by_id])

class Refund(Base):
    __tablename__ = "refunds"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    payment_id = Column(String(36), ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_paise = Column(Integer, nullable=False)
    reason = Column(Text, nullable=False)
    gateway_refund_id = Column(String(100), nullable=True)
    status = Column(String(30), default="processed", nullable=False)
    recorded_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    order = relationship("Order", back_populates="refunds")

class PaymentWebhookEvent(Base):
    __tablename__ = "payment_webhook_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    event_id = Column(String(100), unique=True, nullable=False, index=True)
    event_type = Column(String(100), nullable=False)
    payload_json = Column(Text, nullable=False)
    processed = Column(Boolean, default=False, nullable=False)
    error_log = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class PickupDelivery(Base):
    __tablename__ = "pickup_deliveries"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    task_type = Column(String(20), nullable=False)  # pickup, delivery
    scheduled_date = Column(String(20), nullable=False)
    scheduled_time_slot = Column(String(100), nullable=False)
    assigned_staff_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(30), default=TaskStatus.SCHEDULED.value, nullable=False)
    failure_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    order = relationship("Order", back_populates="logistics_tasks")
    assigned_staff = relationship("User", foreign_keys=[assigned_staff_id])

class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    channel = Column(String(20), nullable=False)  # in_app, email, sms, whatsapp
    recipient = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String(20), default="sent", nullable=False)  # sent, failed, pending
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(50), nullable=True)
    details_json = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
