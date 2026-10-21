from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Any
from datetime import datetime

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    user: "UserOut"

class TokenPayload(BaseModel):
    sub: Optional[str] = None

# User Schemas
class UserBase(BaseModel):
    phone: str
    full_name: str
    email: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role: Optional[str] = "customer"

class UserLogin(BaseModel):
    phone_or_email: str
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None

class CustomerAddressBase(BaseModel):
    label: str = "Home"
    address_line1: str
    address_line2: Optional[str] = None
    landmark: Optional[str] = None
    city: str = "Bengaluru"
    state: str = "Karnataka"
    pincode: str
    is_default: bool = False

class CustomerAddressCreate(CustomerAddressBase):
    pass

class CustomerAddressOut(CustomerAddressBase):
    id: str
    user_id: str
    is_serviceable: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CustomerProfileOut(BaseModel):
    id: str
    user_id: str
    notes: Optional[str] = None
    total_orders: int
    total_spent_paise: int
    outstanding_balance_paise: int

    model_config = ConfigDict(from_attributes=True)

class UserOut(UserBase):
    id: str
    role: str
    is_active: bool
    is_phone_verified: bool
    created_at: datetime
    addresses: List[CustomerAddressOut] = []
    customer_profile: Optional[CustomerProfileOut] = None

    model_config = ConfigDict(from_attributes=True)

# Service & Pricing Schemas
class ServicePriceBase(BaseModel):
    item_name: str
    pricing_type: str = "per_piece"
    price_paise: int
    min_quantity: int = 1
    is_active: bool = True
    sort_order: int = 0

class ServicePriceCreate(ServicePriceBase):
    pass

class ServicePriceUpdate(BaseModel):
    item_name: Optional[str] = None
    pricing_type: Optional[str] = None
    price_paise: Optional[int] = None
    min_quantity: Optional[int] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None

class ServicePriceOut(ServicePriceBase):
    id: str
    service_id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ServiceBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    category: str
    is_active: bool = True
    icon: str = "Sparkles"
    sort_order: int = 0

class ServiceCreate(ServiceBase):
    prices: Optional[List[ServicePriceCreate]] = []

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None

class ServiceOut(ServiceBase):
    id: str
    created_at: datetime
    prices: List[ServicePriceOut] = []

    model_config = ConfigDict(from_attributes=True)

# Delivery Time Slot & Area Schemas
class DeliveryTimeSlotBase(BaseModel):
    name: str
    start_time: str
    end_time: str
    slot_type: str = "both"
    max_capacity: int = 15
    is_active: bool = True

class DeliveryTimeSlotCreate(DeliveryTimeSlotBase):
    pass

class DeliveryTimeSlotOut(DeliveryTimeSlotBase):
    id: str
    model_config = ConfigDict(from_attributes=True)

class ServiceableAreaBase(BaseModel):
    pincode: str
    area_name: str
    city: str = "Bengaluru"
    delivery_fee_paise: int = 5000
    min_order_paise: int = 20000
    is_active: bool = True

class ServiceableAreaCreate(ServiceableAreaBase):
    pass

class ServiceableAreaOut(ServiceableAreaBase):
    id: str
    model_config = ConfigDict(from_attributes=True)

# Order Item Schemas
class OrderItemCreate(BaseModel):
    service_price_id: str
    quantity: int = 1
    weight_kg: Optional[float] = None
    special_instruction: Optional[str] = None

class OrderItemOut(BaseModel):
    id: str
    order_id: str
    service_id: Optional[str]
    service_price_id: Optional[str]
    service_name_snapshot: str
    item_name_snapshot: str
    pricing_type_snapshot: str
    unit_price_paise_snapshot: int
    quantity: int
    weight_kg: Optional[float]
    subtotal_paise: int
    special_instruction: Optional[str]

    model_config = ConfigDict(from_attributes=True)

# Inspection & History Schemas
class GarmentInspectionCreate(BaseModel):
    actual_count_received: int
    existing_stains_damage: Optional[str] = None
    customer_instructions: Optional[str] = None
    inspection_notes: Optional[str] = None
    quality_check_passed: bool = True
    quality_check_notes: Optional[str] = None
    missing_damaged_incidents: Optional[str] = None

class GarmentInspectionOut(GarmentInspectionCreate):
    id: str
    order_id: str
    inspected_by_id: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class OrderStatusHistoryOut(BaseModel):
    id: str
    order_id: str
    previous_status: Optional[str]
    new_status: str
    notes: Optional[str]
    changed_by_id: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Payment Schemas
class PaymentCreate(BaseModel):
    amount_paise: int
    payment_method: str # cash, upi_manual, razorpay
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None

class PaymentOut(BaseModel):
    id: str
    order_id: str
    payment_number: str
    amount_paise: int
    payment_method: str
    payment_status: str
    transaction_reference: Optional[str]
    gateway_order_id: Optional[str]
    notes: Optional[str]
    recorded_by_id: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class RefundCreate(BaseModel):
    payment_id: Optional[str] = None
    amount_paise: int
    reason: str

class RefundOut(BaseModel):
    id: str
    order_id: str
    payment_id: Optional[str]
    amount_paise: int
    reason: str
    gateway_refund_id: Optional[str]
    status: str
    recorded_by_id: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class RazorpayCreateOrderRequest(BaseModel):
    order_id: str

class RazorpayVerifyRequest(BaseModel):
    order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

# Logistics Task Schemas
class LogisticsTaskCreate(BaseModel):
    task_type: str  # pickup, delivery
    scheduled_date: str
    scheduled_time_slot: str
    assigned_staff_id: Optional[str] = None
    notes: Optional[str] = None

class LogisticsTaskUpdate(BaseModel):
    status: str
    failure_reason: Optional[str] = None
    notes: Optional[str] = None

class LogisticsTaskOut(BaseModel):
    id: str
    order_id: str
    task_type: str
    scheduled_date: str
    scheduled_time_slot: str
    assigned_staff_id: Optional[str]
    status: str
    failure_reason: Optional[str]
    notes: Optional[str]
    completed_at: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# Order Creation & Out Schemas
class CustomerBookingCreate(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    handover_method: str  # shop_dropoff, home_pickup_delivery
    pickup_address: Optional[str] = None
    delivery_address: Optional[str] = None
    pincode: Optional[str] = None
    pickup_slot_id: Optional[str] = None
    delivery_slot_id: Optional[str] = None
    pickup_date: Optional[str] = None
    delivery_date: Optional[str] = None
    special_instructions: Optional[str] = None
    coupon_code: Optional[str] = None
    payment_method: str = "cash"
    items: List[OrderItemCreate]

class WalkInOrderCreate(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    special_instructions: Optional[str] = None
    items: List[OrderItemCreate]
    coupon_code: Optional[str] = None
    initial_payment_paise: Optional[int] = 0
    payment_method: str = "cash"
    transaction_reference: Optional[str] = None

class OrderStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

class OrderUpdate(BaseModel):
    special_instructions: Optional[str] = None
    internal_notes: Optional[str] = None
    assigned_pickup_staff_id: Optional[str] = None
    assigned_delivery_staff_id: Optional[str] = None

class OrderCancelRequest(BaseModel):
    reason: str

class OrderOut(BaseModel):
    id: str
    order_number: str
    customer_id: Optional[str]
    customer_name: str
    customer_phone: str
    customer_email: Optional[str]
    handover_method: str
    status: str
    cancellation_reason: Optional[str]
    special_instructions: Optional[str]
    internal_notes: Optional[str]
    subtotal_paise: int
    discount_paise: int
    delivery_fee_paise: int
    tax_paise: int
    total_paise: int
    paid_paise: int
    outstanding_paise: int
    coupon_code: Optional[str]
    payment_status: str
    payment_method: str
    pickup_address: Optional[str]
    delivery_address: Optional[str]
    pincode: Optional[str]
    pickup_slot_id: Optional[str]
    delivery_slot_id: Optional[str]
    pickup_date: Optional[str]
    delivery_date: Optional[str]
    assigned_pickup_staff_id: Optional[str]
    assigned_delivery_staff_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    items: List[OrderItemOut] = []
    status_history: List[OrderStatusHistoryOut] = []
    inspections: List[GarmentInspectionOut] = []
    payments: List[PaymentOut] = []
    refunds: List[RefundOut] = []
    logistics_tasks: List[LogisticsTaskOut] = []

    model_config = ConfigDict(from_attributes=True)

# Dashboard Metrics Schema
class DashboardMetricsOut(BaseModel):
    orders_received_today: int
    new_orders_awaiting_confirmation: int
    garments_received_at_shop: int
    orders_processing: int
    orders_awaiting_qc: int
    orders_ready: int
    pickups_scheduled_today: int
    deliveries_scheduled_today: int
    revenue_today_paise: int
    revenue_this_month_paise: int
    total_payments_collected_paise: int
    outstanding_customer_balances_paise: int

class CouponValidateRequest(BaseModel):
    code: str
    subtotal_paise: int

class CouponValidateResponse(BaseModel):
    valid: bool
    code: str
    discount_paise: int
    message: str
