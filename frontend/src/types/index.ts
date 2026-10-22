export type UserRole = 'customer' | 'delivery' | 'manager' | 'owner';

export type OrderStatus =
  | 'booked'
  | 'pickup_assigned'
  | 'collected'
  | 'washing'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'partially_paid' | 'paid';

export type PaymentMethod = 'cash' | 'upi_manual';

export interface Profile {
  id: string;
  phone: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface CustomerAddress {
  id: string;
  user_id: string;
  label: string; // Home, Work, Other
  address_line: string;
  landmark?: string;
  pincode: string;
  is_default: boolean;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
}

export interface ServiceArea {
  id: string;
  pincode: string;
  area_name: string;
  name?: string;
  city: string;
  state: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LaundryServiceItem {
  id: string;
  name: string;
  description?: string;
  pricing_unit: string; // 'per_kg', 'per_piece'
  unit_price_paise: number;
  price_paise?: number;
  min_weight_kg: number;
  is_active: boolean;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface BusinessSettings {
  id?: string;
  business_name: string;
  business_phone: string;
  business_address: string;
  price_per_kg_paise: number; // e.g. 8000 = ₹80.00
  min_weight_kg: number; // e.g. 3.00 kg
  delivery_charge_paise: number; // e.g. 0
  min_order_free_delivery_paise?: number;
  upi_id: string;
  upi_qr_url?: string;
  payment_collection_stage?: 'pickup' | 'delivery' | 'both';
  allow_delivery_payment_recording: boolean;
  whatsapp_enabled: boolean;
  serviceable_pincodes?: string[];
  updated_at?: string;
}

export type PeriodFilter = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

export interface DashboardPeriodAnalytics {
  period: PeriodFilter;
  startDate: string;
  endDate: string;
  // Operations
  ordersBooked: number;
  ordersInProgress: number;
  ordersDelivered: number;
  ordersCancelled: number;
  ordersAwaitingWeight: number;
  ordersReadyForDelivery: number;
  // Financials
  billedOrderValuePaise: number;
  actualCollectedPaise: number;
  outstandingBalancePaise: number;
  cashCollectedPaise: number;
  upiCollectedPaise: number;
  ordersAwaitingPayment: number;
  // Comparisons vs previous period
  previousPeriodBilledPaise: number;
  previousPeriodCollectedPaise: number;
  billedGrowthPercent: number;
  collectedGrowthPercent: number;
}

export type FeedbackStatus = 'new' | 'reviewed' | 'resolved';

export interface OrderFeedback {
  id: string;
  order_id: string;
  order_number: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  rating_overall: number; // 1-5
  rating_pickup?: number; // 1-5
  rating_washing?: number; // 1-5
  rating_delivery?: number; // 1-5
  comment?: string;
  suggestions?: string;
  low_rating_reason?: string;
  status: FeedbackStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  resolution_note?: string;
  created_at: string;
  updated_at?: string;
}

export interface FeedbackSummaryMetrics {
  totalCount: number;
  averageOverall: number;
  averagePickup: number;
  averageWashing: number;
  averageDelivery: number;
  newCount: number;
  reviewedCount: number;
  resolvedCount: number;
}

export interface PickupSlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  is_active: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  
  pickup_address: string;
  pickup_landmark?: string;
  pickup_pincode: string;
  pickup_date: string;
  pickup_slot: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  
  assigned_delivery_id?: string;
  assigned_delivery_name?: string;
  assigned_delivery_phone?: string;
  
  // Service & Pricing Snapshot
  service_id?: string;
  service_name?: string;
  pricing_unit?: string;
  measured_weight?: number | null; // e.g. 4.50 kg
  billable_weight?: number | null; // e.g. MAX(4.50, 3.00) = 4.50 kg
  price_per_kg_paise: number;
  min_weight_kg: number;
  delivery_charge_paise: number;
  total_amount_paise?: number | null; // null if pending weight
  paid_amount_paise: number;
  
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  order_status: OrderStatus;
  
  delivery_notes?: string;
  cancellation_reason?: string;
  notes?: string;
  
  collected_at?: string;
  weighed_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  previous_status?: OrderStatus;
  new_status: OrderStatus;
  notes?: string;
  changed_by?: string;
  created_at: string;
}

export interface WeightChangeHistory {
  id: string;
  order_id: string;
  old_weight?: number | null;
  new_weight: number;
  old_amount_paise?: number | null;
  new_amount_paise: number;
  reason?: string;
  changed_by?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  amount_paise: number;
  payment_method: PaymentMethod;
  transaction_reference?: string;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  order_id?: string;
  channel: string;
  recipient_phone: string;
  event_type: string;
  message: string;
  status: 'sent' | 'failed' | 'logged';
  error_message?: string;
  created_at: string;
}
