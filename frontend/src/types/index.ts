export type UserRole = 'owner' | 'manager' | 'processing_staff' | 'delivery_staff' | 'customer';

export type HandoverMethod = 'shop_dropoff' | 'home_pickup_delivery';

export type OrderStatus =
  | 'order_placed'
  | 'pickup_scheduled'
  | 'clothes_received'
  | 'garment_inspection'
  | 'washing_drycleaning'
  | 'ironing_finishing'
  | 'quality_check'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'delivered_collected'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'failed' | 'partially_paid' | 'partially_refunded' | 'refunded';

export type PaymentMethod = 'cash' | 'upi_manual' | 'razorpay' | 'pay_on_delivery' | 'pay_later';

export interface CustomerAddress {
  id: string;
  user_id: string;
  label: string;
  address_line1: string;
  address_line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  is_serviceable: boolean;
  created_at: string;
}

export interface CustomerProfile {
  id: string;
  user_id: string;
  notes?: string;
  total_orders: number;
  total_spent_paise: number;
  outstanding_balance_paise: number;
}

export interface User {
  id: string;
  phone: string;
  full_name: string;
  email?: string;
  role: UserRole;
  is_active: boolean;
  is_phone_verified: boolean;
  created_at: string;
  addresses?: CustomerAddress[];
  customer_profile?: CustomerProfile;
}

export interface ServicePrice {
  id: string;
  service_id: string;
  item_name: string;
  pricing_type: 'per_piece' | 'per_kg' | 'per_item';
  price_paise: number;
  min_quantity: number;
  is_active: boolean;
  sort_order: number;
}

export interface Service {
  id: string;
  name: string;
  code: string;
  description?: string;
  category: string;
  is_active: boolean;
  icon: string;
  sort_order: number;
  prices: ServicePrice[];
}

export interface DeliveryTimeSlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  slot_type: 'pickup' | 'delivery' | 'both';
  max_capacity: number;
  is_active: boolean;
}

export interface ServiceableArea {
  id: string;
  pincode: string;
  area_name: string;
  city: string;
  delivery_fee_paise: number;
  min_order_paise: number;
  is_active: boolean;
}

export interface OrderItem {
  id: string;
  order_id: string;
  service_id?: string;
  service_price_id?: string;
  service_name_snapshot: string;
  item_name_snapshot: string;
  pricing_type_snapshot: string;
  unit_price_paise_snapshot: number;
  quantity: number;
  weight_kg?: number;
  subtotal_paise: number;
  special_instruction?: string;
}

export interface GarmentInspection {
  id: string;
  order_id: string;
  inspected_by_id?: string;
  actual_count_received: number;
  existing_stains_damage?: string;
  customer_instructions?: string;
  inspection_notes?: string;
  quality_check_passed: boolean;
  quality_check_notes?: string;
  missing_damaged_incidents?: string;
  created_at: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  previous_status?: string;
  new_status: string;
  notes?: string;
  changed_by_id?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  payment_number: string;
  amount_paise: number;
  payment_method: string;
  payment_status: string;
  transaction_reference?: string;
  gateway_order_id?: string;
  notes?: string;
  recorded_by_id?: string;
  created_at: string;
}

export interface Refund {
  id: string;
  order_id: string;
  payment_id?: string;
  amount_paise: number;
  reason: string;
  gateway_refund_id?: string;
  status: string;
  recorded_by_id?: string;
  created_at: string;
}

export interface LogisticsTask {
  id: string;
  order_id: string;
  task_type: 'pickup' | 'delivery';
  scheduled_date: string;
  scheduled_time_slot: string;
  assigned_staff_id?: string;
  status: string;
  failure_reason?: string;
  notes?: string;
  completed_at?: string;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  handover_method: HandoverMethod;
  status: OrderStatus;
  cancellation_reason?: string;
  special_instructions?: string;
  internal_notes?: string;
  subtotal_paise: number;
  discount_paise: number;
  delivery_fee_paise: number;
  tax_paise: number;
  total_paise: number;
  paid_paise: number;
  outstanding_paise: number;
  coupon_code?: string;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  pickup_address?: string;
  delivery_address?: string;
  pincode?: string;
  pickup_slot_id?: string;
  delivery_slot_id?: string;
  pickup_date?: string;
  delivery_date?: string;
  assigned_pickup_staff_id?: string;
  assigned_delivery_staff_id?: string;
  created_at: string;
  updated_at: string;

  items: OrderItem[];
  status_history: OrderStatusHistory[];
  inspections: GarmentInspection[];
  payments: Payment[];
  refunds: Refund[];
  logistics_tasks: LogisticsTask[];
}

export interface DashboardMetrics {
  orders_received_today: number;
  new_orders_awaiting_confirmation: number;
  garments_received_at_shop: number;
  orders_processing: number;
  orders_awaiting_qc: number;
  orders_ready: number;
  pickups_scheduled_today: number;
  deliveries_scheduled_today: number;
  revenue_today_paise: number;
  revenue_this_month_paise: number;
  total_payments_collected_paise: number;
  outstanding_customer_balances_paise: number;
}
