import {
  Order, OrderStatus, PaymentStatus, PaymentMethod, BusinessSettings,
  PickupSlot, Profile, CustomerAddress, Payment, WeightChangeHistory, OrderStatusHistory,
  OrderFeedback, FeedbackStatus, FeedbackSummaryMetrics
} from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { WhatsAppService } from './whatsappService';

// Default Business Settings
const DEFAULT_SETTINGS: BusinessSettings = {
  business_name: 'SuperWash Express',
  business_phone: '+91 98765 43210',
  business_address: 'Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038',
  price_per_kg_paise: 8000, // ₹80.00 / kg
  min_weight_kg: 3.00,      // 3.00 kg minimum
  delivery_charge_paise: 0, // Free pickup & delivery
  upi_id: 'superwash@upi',
  allow_delivery_payment_recording: true,
  whatsapp_enabled: false,
  serviceable_pincodes: ['560038', '560008', '560103', '560075', '560001', '560066', '560037']
};

const DEFAULT_SLOTS: PickupSlot[] = [
  { id: 'slot-1', name: 'Morning (08:00 AM - 11:00 AM)', start_time: '08:00', end_time: '11:00', max_capacity: 15, is_active: true },
  { id: 'slot-2', name: 'Noon (11:00 AM - 02:00 PM)', start_time: '11:00', end_time: '14:00', max_capacity: 15, is_active: true },
  { id: 'slot-3', name: 'Afternoon (02:00 PM - 05:00 PM)', start_time: '14:00', end_time: '17:00', max_capacity: 15, is_active: true },
  { id: 'slot-4', name: 'Evening (05:00 PM - 08:00 PM)', start_time: '17:00', end_time: '20:00', max_capacity: 15, is_active: true },
];

// Pre-seeded Profiles for 4 Roles
export const DEMO_PROFILES: Profile[] = [
  {
    id: 'user-owner-1',
    phone: '9876543210',
    full_name: 'Rajesh Sharma (Owner)',
    role: 'owner',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'user-manager-1',
    phone: '9876543211',
    full_name: 'Ananya Verma (Store Manager)',
    role: 'manager',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'user-delivery-1',
    phone: '9876543215',
    full_name: 'Ramesh Kumar (Delivery Agent)',
    role: 'delivery',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'user-cust-1',
    phone: '9876543212',
    full_name: 'Priya Patel (Customer)',
    role: 'customer',
    is_active: true,
    created_at: new Date().toISOString()
  }
];

// Local fallback storage keys
const STORAGE_KEYS = {
  ORDERS: 'superwash_orders',
  SETTINGS: 'superwash_settings',
  SLOTS: 'superwash_slots',
  ADDRESSES: 'superwash_addresses',
  PROFILES: 'superwash_profiles',
  PAYMENTS: 'superwash_payments',
  WEIGHT_HISTORY: 'superwash_weight_history',
  STATUS_HISTORY: 'superwash_status_history',
  FEEDBACK: 'superwash_feedback',
};

// Initial Sample Orders
const INITIAL_SAMPLE_ORDERS: Order[] = [
  {
    id: 'ord-101',
    order_number: 'SW-1001',
    customer_id: 'user-cust-1',
    customer_name: 'Priya Patel',
    customer_phone: '9876543212',
    pickup_address: 'Flat 402, Green Glen Layout, Bellandur, Bengaluru',
    pickup_landmark: 'Near Central Mall',
    pickup_pincode: '560103',
    pickup_date: new Date().toISOString().split('T')[0],
    pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
    assigned_delivery_id: 'user-delivery-1',
    assigned_delivery_name: 'Ramesh Kumar',
    assigned_delivery_phone: '9876543215',
    measured_weight: 4.5,
    billable_weight: 4.5,
    price_per_kg_paise: 8000,
    min_weight_kg: 3.0,
    delivery_charge_paise: 0,
    total_amount_paise: 36000, // 4.5 * 8000 = ₹360.00
    paid_amount_paise: 0,
    payment_status: 'pending',
    payment_method: 'cash',
    order_status: 'washing',
    notes: 'Please separate delicate whites',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'ord-102',
    order_number: 'SW-1002',
    customer_id: 'user-cust-1',
    customer_name: 'Suresh Raina',
    customer_phone: '9845012345',
    pickup_address: '14, 12th Main, HAL 2nd Stage, Indiranagar, Bengaluru',
    pickup_landmark: 'Near Sony Center',
    pickup_pincode: '560038',
    pickup_date: new Date().toISOString().split('T')[0],
    pickup_slot: 'Noon (11:00 AM - 02:00 PM)',
    assigned_delivery_id: 'user-delivery-1',
    assigned_delivery_name: 'Ramesh Kumar',
    assigned_delivery_phone: '9876543215',
    measured_weight: null,
    billable_weight: null,
    price_per_kg_paise: 8000,
    min_weight_kg: 3.0,
    delivery_charge_paise: 0,
    total_amount_paise: null, // Pending weight
    paid_amount_paise: 0,
    payment_status: 'pending',
    payment_method: 'cash',
    order_status: 'collected',
    notes: 'Heavy winter blankets included',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    updated_at: new Date().toISOString()
  }
];

export class LaundryService {
  // ----------------------------------------------------
  // Helpers & Financial Calculations
  // ----------------------------------------------------
  static calculateBill(
    measuredWeightKg: number,
    pricePerKgPaise: number,
    minWeightKg: number,
    deliveryChargePaise: number = 0
  ): {
    measuredWeightKg: number;
    billableWeightKg: number;
    totalAmountPaise: number;
    minWeightApplied: boolean;
  } {
    const safeMeasured = Math.max(0, measuredWeightKg);
    const minWeightApplied = safeMeasured < minWeightKg;
    const billableWeightKg = Math.max(safeMeasured, minWeightKg);
    const laundryChargePaise = Math.round(billableWeightKg * pricePerKgPaise);
    const totalAmountPaise = laundryChargePaise + deliveryChargePaise;
    return {
      measuredWeightKg: safeMeasured,
      billableWeightKg,
      totalAmountPaise,
      minWeightApplied
    };
  }

  // ----------------------------------------------------
  // Settings Management
  // ----------------------------------------------------
  static async getSettings(): Promise<BusinessSettings> {
    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.from('business_settings').select('*').limit(1).single();
        if (data) return data;
      } catch (e) {
        console.warn('Using local settings cache:', e);
      }
    }

    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    return DEFAULT_SETTINGS;
  }

  static async updateSettings(newSettings: Partial<BusinessSettings>): Promise<BusinessSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...newSettings, updated_at: new Date().toISOString() };

    if (isSupabaseConfigured) {
      try {
        await supabase.from('business_settings').update(updated).eq('id', current.id);
      } catch (e) {
        console.warn('Could not update Supabase settings:', e);
      }
    }

    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  }

  // ----------------------------------------------------
  // Pickup Slots
  // ----------------------------------------------------
  static async getSlots(): Promise<PickupSlot[]> {
    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.from('pickup_slots').select('*').eq('is_active', true);
        if (data && data.length > 0) return data;
      } catch (e) {
        console.warn('Falling back to local slots:', e);
      }
    }

    const saved = localStorage.getItem(STORAGE_KEYS.SLOTS);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    localStorage.setItem(STORAGE_KEYS.SLOTS, JSON.stringify(DEFAULT_SLOTS));
    return DEFAULT_SLOTS;
  }

  // ----------------------------------------------------
  // Customer Addresses
  // ----------------------------------------------------
  static async getAddresses(userId: string): Promise<CustomerAddress[]> {
    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.from('customer_addresses').select('*').eq('user_id', userId);
        if (data) return data;
      } catch {}
    }

    const saved = localStorage.getItem(`${STORAGE_KEYS.ADDRESSES}_${userId}`);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 'addr-default-1',
        user_id: userId,
        label: 'Home',
        address_line: 'Flat 402, Green Glen Layout, Bellandur',
        landmark: 'Near Central Mall',
        pincode: '560103',
        is_default: true,
        created_at: new Date().toISOString()
      }
    ];
  }

  static async saveAddress(address: Omit<CustomerAddress, 'id'>): Promise<CustomerAddress> {
    const newAddress: CustomerAddress = {
      ...address,
      id: `addr-${Date.now()}`
    };

    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.from('customer_addresses').insert(newAddress).select().single();
        if (data) return data;
      } catch {}
    }

    const list = await this.getAddresses(address.user_id);
    const updated = [newAddress, ...list];
    localStorage.setItem(`${STORAGE_KEYS.ADDRESSES}_${address.user_id}`, JSON.stringify(updated));
    return newAddress;
  }

  // ----------------------------------------------------
  // Order Operations
  // ----------------------------------------------------
  static async getOrders(): Promise<Order[]> {
    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (data && data.length > 0) return data;
      } catch (e) {
        console.warn('Falling back to local orders cache:', e);
      }
    }

    const saved = localStorage.getItem(STORAGE_KEYS.ORDERS);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(INITIAL_SAMPLE_ORDERS));
    return INITIAL_SAMPLE_ORDERS;
  }

  static async getOrderById(id: string): Promise<Order | null> {
    const all = await this.getOrders();
    return all.find(o => o.id === id) || null;
  }

  static async createBooking(data: {
    customer_id?: string;
    customer_name: string;
    customer_phone: string;
    pickup_address: string;
    pickup_landmark?: string;
    pickup_pincode: string;
    pickup_date: string;
    pickup_slot: string;
    notes?: string;
  }): Promise<Order> {
    const settings = await this.getSettings();
    const existingOrders = await this.getOrders();

    // Check slot capacity
    const slotCheck = await this.checkSlotAvailability(data.pickup_date, data.pickup_slot);
    if (!slotCheck.available) {
      throw new Error(`The pickup slot '${data.pickup_slot}' on ${data.pickup_date} is fully booked (${slotCheck.bookedCount}/${slotCheck.maxCapacity}). Please choose another slot.`);
    }

    // Anti-duplicate protection: check if identical booking created in last 15 seconds
    const now = Date.now();
    const duplicate = existingOrders.find(o => 
      o.customer_phone.replace(/[^0-9]/g, '') === data.customer_phone.replace(/[^0-9]/g, '') &&
      o.pickup_date === data.pickup_date &&
      o.pickup_slot === data.pickup_slot &&
      (now - new Date(o.created_at).getTime()) < 15000
    );
    if (duplicate) {
      return duplicate;
    }

    const orderNumber = `SW-${1000 + existingOrders.length + 1}`;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      order_number: orderNumber,
      customer_id: data.customer_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      pickup_address: data.pickup_address,
      pickup_landmark: data.pickup_landmark,
      pickup_pincode: data.pickup_pincode,
      pickup_date: data.pickup_date,
      pickup_slot: data.pickup_slot,
      
      // Price snapshots (immutable once booked)
      price_per_kg_paise: settings.price_per_kg_paise,
      min_weight_kg: settings.min_weight_kg,
      delivery_charge_paise: settings.delivery_charge_paise,
      
      measured_weight: null,
      billable_weight: null,
      total_amount_paise: null, // Pending weight
      paid_amount_paise: 0,
      
      payment_status: 'pending',
      payment_method: 'cash',
      order_status: 'booked',
      notes: data.notes,
      
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      try {
        await supabase.from('orders').insert(newOrder);
      } catch (e) {
        console.warn('Supabase booking insert error:', e);
      }
    }

    const updatedList = [newOrder, ...existingOrders];
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(updatedList));

    // Send optional WhatsApp notification
    await WhatsAppService.sendNotification(
      data.customer_phone,
      'booking_confirmed',
      `Namaste ${data.customer_name}! Your laundry pickup #${orderNumber} has been booked for ${data.pickup_date} (${data.pickup_slot}). Rate: ₹${settings.price_per_kg_paise / 100}/kg (Min ${settings.min_weight_kg} kg).`,
      newOrder.id
    );

    return newOrder;
  }

  // ----------------------------------------------------
  // Delivery Person Actions
  // ----------------------------------------------------
  static async assignDeliveryStaff(
    orderId: string,
    staffId: string,
    staffName: string,
    staffPhone: string
  ): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    order.assigned_delivery_id = staffId;
    order.assigned_delivery_name = staffName;
    order.assigned_delivery_phone = staffPhone;
    if (order.order_status === 'booked') {
      order.order_status = 'pickup_assigned';
    }
    order.updated_at = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    return order;
  }

  static async markAsCollected(orderId: string, notes?: string): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    order.order_status = 'collected';
    order.collected_at = new Date().toISOString();
    if (notes) {
      order.delivery_notes = notes;
    }
    order.updated_at = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

    await WhatsAppService.sendNotification(
      order.customer_phone,
      'clothes_collected',
      `Hello ${order.customer_name}, our delivery executive has collected your clothes (Order #${order.order_number}). They are now on their way to the store for weighing and washing.`,
      order.id
    );

    return order;
  }

  static async markAsDelivered(orderId: string, notes?: string): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    order.order_status = 'delivered';
    order.delivered_at = new Date().toISOString();
    if (notes) {
      order.delivery_notes = notes;
    }
    order.updated_at = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

    await WhatsAppService.sendNotification(
      order.customer_phone,
      'order_delivered',
      `Namaste ${order.customer_name}! Your clean clothes for order #${order.order_number} have been delivered. Thank you for choosing SuperWash!`,
      order.id
    );

    return order;
  }

  // ----------------------------------------------------
  // Store Manager Actions: Weight Entry & Recalculation
  // ----------------------------------------------------
  static async enterMeasuredWeight(
    orderId: string,
    measuredWeightKg: number,
    changedByUserName: string = 'Store Manager',
    correctionReason?: string
  ): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const oldWeight = order.measured_weight;
    const oldAmount = order.total_amount_paise;

    // Apply strict business rule: MAX(measured, min_weight_kg)
    const { billableWeightKg, totalAmountPaise } = this.calculateBill(
      measuredWeightKg,
      order.price_per_kg_paise,
      order.min_weight_kg,
      order.delivery_charge_paise
    );

    order.measured_weight = measuredWeightKg;
    order.billable_weight = billableWeightKg;
    order.total_amount_paise = totalAmountPaise;
    order.weighed_at = new Date().toISOString();
    order.updated_at = new Date().toISOString();

    // Auto-advance from collected to washing if freshly weighed
    if (order.order_status === 'collected') {
      order.order_status = 'washing';
    }

    // Save weight change history audit
    const weightHistory: WeightChangeHistory = {
      id: `wh-${Date.now()}`,
      order_id: order.id,
      old_weight: oldWeight,
      new_weight: measuredWeightKg,
      old_amount_paise: oldAmount,
      new_amount_paise: totalAmountPaise,
      reason: correctionReason || (oldWeight ? 'Weight correction by manager' : 'Initial intake weight'),
      changed_by: changedByUserName,
      created_at: new Date().toISOString()
    };
    const prevHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.WEIGHT_HISTORY) || '[]');
    localStorage.setItem(STORAGE_KEYS.WEIGHT_HISTORY, JSON.stringify([weightHistory, ...prevHistory]));

    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

    // Send WhatsApp notification
    await WhatsAppService.sendNotification(
      order.customer_phone,
      'weight_and_bill_ready',
      `Order #${order.order_number} Update: Your clothes weighed ${measuredWeightKg.toFixed(2)} kg (Billable: ${billableWeightKg.toFixed(2)} kg @ ₹${order.price_per_kg_paise / 100}/kg). Total Bill: ₹${totalAmountPaise / 100}. Washing is now underway!`,
      order.id
    );

    return order;
  }

  // ----------------------------------------------------
  // Order Status Transitions
  // ----------------------------------------------------
  static async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    notes?: string,
    cancellationReason?: string
  ): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const previousStatus = order.order_status;
    order.order_status = newStatus;
    if (cancellationReason) {
      order.cancellation_reason = cancellationReason;
    }
    if (notes) {
      order.notes = notes;
    }
    order.updated_at = new Date().toISOString();

    // Status change history audit
    const statusHistory: OrderStatusHistory = {
      id: `sh-${Date.now()}`,
      order_id: order.id,
      previous_status: previousStatus,
      new_status: newStatus,
      notes,
      created_at: new Date().toISOString()
    };
    const prevStatusHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.STATUS_HISTORY) || '[]');
    localStorage.setItem(STORAGE_KEYS.STATUS_HISTORY, JSON.stringify([statusHistory, ...prevStatusHistory]));

    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

    // Notification for ready for delivery
    if (newStatus === 'ready_for_delivery') {
      await WhatsAppService.sendNotification(
        order.customer_phone,
        'ready_for_delivery',
        `Great news! Order #${order.order_number} is clean, steam-ironed, and ready for delivery. Our delivery executive will arrive shortly. Amount due: ₹${((order.total_amount_paise || 0) - order.paid_amount_paise) / 100}.`,
        order.id
      );
    }

    return order;
  }

  // ----------------------------------------------------
  // Payment Recording (Cash / Manual UPI)
  // ----------------------------------------------------
  static async recordPayment(
    orderId: string,
    amountPaise: number,
    paymentMethod: PaymentMethod,
    transactionReference?: string,
    notes?: string,
    recordedByName?: string
  ): Promise<Order & { payment: Payment }> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const totalDue = order.total_amount_paise || 0;
    const newPaidAmount = order.paid_amount_paise + amountPaise;

    order.paid_amount_paise = newPaidAmount;
    order.payment_method = paymentMethod;

    if (totalDue > 0 && newPaidAmount >= totalDue) {
      order.payment_status = 'paid';
    } else if (newPaidAmount > 0) {
      order.payment_status = 'partially_paid';
    }

    order.updated_at = new Date().toISOString();

    const payment: Payment = {
      id: `pay-${Date.now()}`,
      order_id: order.id,
      amount_paise: amountPaise,
      payment_method: paymentMethod,
      transaction_reference: transactionReference,
      notes,
      recorded_by: recordedByName,
      created_at: new Date().toISOString()
    };

    const prevPayments = JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYMENTS) || '[]');
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([payment, ...prevPayments]));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

    await WhatsAppService.sendNotification(
      order.customer_phone,
      'payment_received',
      `Receipt: Received ₹${amountPaise / 100} via ${paymentMethod === 'cash' ? 'Cash' : 'UPI'} for SuperWash Order #${order.order_number}. Remaining Balance: ₹${Math.max(0, totalDue - newPaidAmount) / 100}. Thank you!`,
      order.id
    );

    return Object.assign(order, { payment });
  }

  // ----------------------------------------------------
  // Role-Specific Filtered Order Queries
  // ----------------------------------------------------
  static async getOrdersForCustomer(phone: string): Promise<Order[]> {
    const all = await this.getOrders();
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
    return all.filter(o => o.customer_phone.replace(/[^0-9]/g, '').slice(-10) === cleanPhone);
  }

  static async getOrdersForDelivery(staffId: string): Promise<{ pickups: Order[]; deliveries: Order[] }> {
    const all = await this.getOrders();
    const assigned = all.filter(o => o.assigned_delivery_id === staffId || !o.assigned_delivery_id);

    // Pickups: Booked or Pickup Assigned
    const pickups = assigned.filter(o => 
      o.order_status === 'booked' || o.order_status === 'pickup_assigned'
    );

    // Deliveries: Ready for Delivery or Out for Delivery
    const deliveries = assigned.filter(o =>
      o.order_status === 'ready_for_delivery' || o.order_status === 'out_for_delivery'
    );

    return { pickups, deliveries };
  }

  static async getOrdersForManager(): Promise<{
    newCollected: Order[];
    washing: Order[];
    readyForDelivery: Order[];
  }> {
    const all = await this.getOrders();
    return {
      newCollected: all.filter(o => o.order_status === 'collected' || (o.order_status === 'booked' && !o.measured_weight)),
      washing: all.filter(o => o.order_status === 'washing'),
      readyForDelivery: all.filter(o => o.order_status === 'ready_for_delivery')
    };
  }

  // ----------------------------------------------------
  // Convenience Aliases & Staff/Payments Management
  // ----------------------------------------------------
  static async getAllOrders(): Promise<Order[]> {
    return this.getOrders();
  }

  static async createOrder(data: {
    customer_id?: string;
    customer_name: string;
    customer_phone: string;
    pickup_address: string;
    pickup_landmark?: string;
    pickup_pincode: string;
    pickup_date: string;
    pickup_slot: string;
    notes?: string;
  }): Promise<Order> {
    return this.createBooking(data);
  }

  static async getPickupSlots(): Promise<PickupSlot[]> {
    return this.getSlots();
  }

  static async getCustomerAddresses(userId: string): Promise<CustomerAddress[]> {
    return this.getAddresses(userId);
  }

  static async saveCustomerAddress(address: Omit<CustomerAddress, 'id'>): Promise<CustomerAddress> {
    return this.saveAddress(address);
  }

  static async getCustomerOrders(userId: string, phone: string): Promise<Order[]> {
    return this.getOrdersForCustomer(phone);
  }

  static async markOrderCollected(orderId: string, _staffName?: string, notes?: string): Promise<Order> {
    return this.markAsCollected(orderId, notes);
  }

  static async markOrderDelivered(orderId: string, _staffName?: string, notes?: string): Promise<Order> {
    return this.markAsDelivered(orderId, notes);
  }

  static async getStaffProfiles(): Promise<Profile[]> {
    const saved = localStorage.getItem(STORAGE_KEYS.PROFILES);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    const initial = DEMO_PROFILES.filter(p => p.role !== 'customer');
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(initial));
    return initial;
  }

  static async addStaffProfile(data: { full_name: string; phone: string; role: 'delivery' | 'manager' }): Promise<Profile> {
    const profiles = await this.getStaffProfiles();
    const newStaff: Profile = {
      id: `staff-${Date.now()}`,
      phone: data.phone,
      full_name: data.full_name,
      role: data.role,
      is_active: true,
      created_at: new Date().toISOString()
    };
    const updated = [...profiles, newStaff];
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(updated));
    return newStaff;
  }

  static async toggleStaffStatus(staffId: string, isActive: boolean): Promise<Profile | null> {
    const profiles = await this.getStaffProfiles();
    const staff = profiles.find(s => s.id === staffId);
    if (!staff) return null;
    staff.is_active = isActive;
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    return staff;
  }

  static async getAllPayments(): Promise<Payment[]> {
    const saved = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  }

  // ----------------------------------------------------
  // Coverage & Capacity Validation
  // ----------------------------------------------------
  static async isPincodeServiceable(pincode: string): Promise<boolean> {
    const cleanPin = pincode.trim().replace(/[^0-9]/g, '');
    const settings = await this.getSettings();
    const supported = settings.serviceable_pincodes || ['560038', '560008', '560103', '560075', '560001', '560066', '560037'];
    return supported.includes(cleanPin);
  }

  static async checkSlotAvailability(date: string, slotName: string): Promise<{ available: boolean; bookedCount: number; maxCapacity: number }> {
    const [slots, allOrders] = await Promise.all([this.getSlots(), this.getOrders()]);
    const slot = slots.find(s => s.name === slotName);
    const maxCapacity = slot ? slot.max_capacity : 15;

    const bookedCount = allOrders.filter(
      o => o.pickup_date === date && o.pickup_slot === slotName && o.order_status !== 'cancelled'
    ).length;

    return {
      available: bookedCount < maxCapacity,
      bookedCount,
      maxCapacity
    };
  }

  // ----------------------------------------------------
  // Private Customer Feedback (Order-linked, Private)
  // ----------------------------------------------------
  static async submitOrderFeedback(data: {
    order_id: string;
    customer_id?: string;
    customer_name: string;
    customer_phone: string;
    rating_overall: number;
    rating_pickup?: number;
    rating_washing?: number;
    rating_delivery?: number;
    comment?: string;
    suggestions?: string;
    low_rating_reason?: string;
  }): Promise<OrderFeedback> {
    // 1. Verify rating range
    if (data.rating_overall < 1 || data.rating_overall > 5) {
      throw new Error('Overall rating must be between 1 and 5');
    }

    // 2. Verify order exists and is delivered
    const order = await this.getOrderById(data.order_id);
    if (!order) {
      throw new Error('Order not found');
    }
    if (order.order_status !== 'delivered') {
      throw new Error('Feedback can only be provided for delivered orders');
    }

    // 3. Check if feedback already submitted for this order (allow update/correction)
    const existingList: OrderFeedback[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.FEEDBACK) || '[]');
    const existingIndex = existingList.findIndex(f => f.order_id === data.order_id);

    const feedbackRecord: OrderFeedback = {
      id: existingIndex >= 0 ? existingList[existingIndex].id : `fb-${Date.now()}`,
      order_id: data.order_id,
      order_number: order.order_number,
      customer_id: data.customer_id || order.customer_id,
      customer_name: data.customer_name || order.customer_name,
      customer_phone: data.customer_phone || order.customer_phone,
      rating_overall: data.rating_overall,
      rating_pickup: data.rating_pickup,
      rating_washing: data.rating_washing,
      rating_delivery: data.rating_delivery,
      comment: data.comment?.trim(),
      suggestions: data.suggestions?.trim(),
      low_rating_reason: data.low_rating_reason?.trim(),
      status: existingIndex >= 0 ? existingList[existingIndex].status : 'new',
      created_at: existingIndex >= 0 ? existingList[existingIndex].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      try {
        await supabase.from('order_feedback').upsert(feedbackRecord);
      } catch (e) {
        console.warn('Supabase feedback save error:', e);
      }
    }

    let updatedList: OrderFeedback[];
    if (existingIndex >= 0) {
      updatedList = existingList.map((f, i) => (i === existingIndex ? feedbackRecord : f));
    } else {
      updatedList = [feedbackRecord, ...existingList];
    }
    localStorage.setItem(STORAGE_KEYS.FEEDBACK, JSON.stringify(updatedList));

    return feedbackRecord;
  }

  static async getFeedbackForOrder(orderId: string): Promise<OrderFeedback | null> {
    const list: OrderFeedback[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.FEEDBACK) || '[]');
    return list.find(f => f.order_id === orderId) || null;
  }

  static async getFeedbackForCustomer(customerId: string): Promise<OrderFeedback[]> {
    const list: OrderFeedback[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.FEEDBACK) || '[]');
    return list.filter(f => f.customer_id === customerId);
  }

  static async getAllFeedback(): Promise<OrderFeedback[]> {
    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.from('order_feedback').select('*').order('created_at', { ascending: false });
        if (data && data.length > 0) return data;
      } catch (e) {
        console.warn('Using local feedback cache:', e);
      }
    }
    const saved = localStorage.getItem(STORAGE_KEYS.FEEDBACK);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  }

  static async updateFeedbackReview(
    feedbackId: string,
    status: FeedbackStatus,
    resolutionNote?: string,
    reviewerName?: string
  ): Promise<OrderFeedback | null> {
    const list: OrderFeedback[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.FEEDBACK) || '[]');
    const item = list.find(f => f.id === feedbackId);
    if (!item) return null;

    item.status = status;
    item.resolution_note = resolutionNote?.trim() || item.resolution_note;
    item.reviewed_by = reviewerName || 'Authorized Staff';
    item.reviewed_at = new Date().toISOString();
    item.updated_at = new Date().toISOString();

    if (isSupabaseConfigured) {
      try {
        await supabase.from('order_feedback').update(item).eq('id', feedbackId);
      } catch (e) {
        console.warn('Supabase feedback review update error:', e);
      }
    }

    localStorage.setItem(STORAGE_KEYS.FEEDBACK, JSON.stringify(list));
    return item;
  }

  static async getFeedbackMetrics(): Promise<FeedbackSummaryMetrics> {
    const all = await this.getAllFeedback();
    const count = all.length;
    if (count === 0) {
      return {
        totalCount: 0,
        averageOverall: 0,
        averagePickup: 0,
        averageWashing: 0,
        averageDelivery: 0,
        newCount: 0,
        reviewedCount: 0,
        resolvedCount: 0
      };
    }

    const avg = (arr: number[]) => arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : 0;

    const overallList = all.map(f => f.rating_overall);
    const pickupList = all.filter(f => f.rating_pickup !== undefined && f.rating_pickup !== null).map(f => f.rating_pickup!);
    const washingList = all.filter(f => f.rating_washing !== undefined && f.rating_washing !== null).map(f => f.rating_washing!);
    const deliveryList = all.filter(f => f.rating_delivery !== undefined && f.rating_delivery !== null).map(f => f.rating_delivery!);

    return {
      totalCount: count,
      averageOverall: avg(overallList),
      averagePickup: avg(pickupList),
      averageWashing: avg(washingList),
      averageDelivery: avg(deliveryList),
      newCount: all.filter(f => f.status === 'new').length,
      reviewedCount: all.filter(f => f.status === 'reviewed').length,
      resolvedCount: all.filter(f => f.status === 'resolved').length
    };
  }
}
