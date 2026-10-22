import {
  Order, OrderStatus, PaymentStatus, PaymentMethod, BusinessSettings,
  PickupSlot, Profile, CustomerAddress, Payment, WeightChangeHistory, OrderStatusHistory,
  OrderFeedback, FeedbackStatus, FeedbackSummaryMetrics,
  ServiceArea, LaundryServiceItem, PeriodFilter, DashboardPeriodAnalytics
} from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { WhatsAppService } from './whatsappService';

export const isLiveMode = isSupabaseConfigured && import.meta.env.VITE_DEMO_MODE !== 'true';

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

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

export const DEFAULT_SERVICE_AREAS: ServiceArea[] = [
  { id: 'sa-1', pincode: '560038', area_name: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', is_active: true },
  { id: 'sa-2', pincode: '560008', area_name: 'Ulsoor / Halasuru', city: 'Bengaluru', state: 'Karnataka', is_active: true },
  { id: 'sa-3', pincode: '560103', area_name: 'Bellandur', city: 'Bengaluru', state: 'Karnataka', is_active: true },
  { id: 'sa-4', pincode: '560075', area_name: 'HAL / Airport Road', city: 'Bengaluru', state: 'Karnataka', is_active: true },
  { id: 'sa-5', pincode: '560001', area_name: 'MG Road / Central Bengaluru', city: 'Bengaluru', state: 'Karnataka', is_active: true },
  { id: 'sa-6', pincode: '560066', area_name: 'Whitefield', city: 'Bengaluru', state: 'Karnataka', is_active: true },
  { id: 'sa-7', pincode: '560037', area_name: 'Marathahalli', city: 'Bengaluru', state: 'Karnataka', is_active: true },
];

export const DEFAULT_SERVICES: LaundryServiceItem[] = [
  {
    id: 'srv-1',
    name: 'Wash & Fold (Normal)',
    description: 'Everyday clothes washed with premium gentle detergent, tumble-dried, and neatly steam-iron folded',
    pricing_unit: 'per_kg',
    unit_price_paise: 8000,
    min_weight_kg: 3.0,
    is_active: true,
    display_order: 1
  }
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
  SERVICE_AREAS: 'superwash_service_areas',
  SERVICES: 'superwash_services',
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
    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    let localSettings: BusinessSettings | null = null;
    if (saved) {
      try { localSettings = JSON.parse(saved); } catch {}
    }

    if (isLiveMode && import.meta.env.MODE !== 'test') {
      try {
        const { data } = await supabase.from('business_settings').select('*').limit(1).single();
        if (data) {
          if (!localSettings) {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data));
            return data;
          }
          return { ...data, ...localSettings };
        }
      } catch (e) {
        console.warn('Using local settings cache:', e);
      }
    }

    if (localSettings) return localSettings;
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    return DEFAULT_SETTINGS;
  }

  static async updateSettings(newSettings: Partial<BusinessSettings>): Promise<BusinessSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...newSettings, updated_at: new Date().toISOString() };

    if (isLiveMode && import.meta.env.MODE !== 'test') {
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
    if (isLiveMode) {
      const { data, error } = await supabase.from('customer_addresses').select('*').eq('user_id', userId);
      if (error) {
        throw new Error(`Failed to load saved addresses: ${error.message}`);
      }
      return data || [];
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
        latitude: 12.9260,
        longitude: 77.6762,
        is_default: true,
        created_at: new Date().toISOString()
      }
    ];
  }

  static async saveAddress(address: Omit<CustomerAddress, 'id'>): Promise<CustomerAddress> {
    const newAddress: CustomerAddress = {
      ...address,
      id: generateUUID(),
      created_at: new Date().toISOString()
    };

    if (isLiveMode) {
      const { data, error } = await supabase.from('customer_addresses').insert(newAddress).select().single();
      if (error) {
        throw new Error(`Failed to save address: ${error.message}`);
      }
      return data || newAddress;
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
    if (isLiveMode) {
      try {
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (error) {
          console.warn('Notice querying Supabase orders, falling back to local session orders:', error.message);
        } else if (data) {
          const localSaved: Order[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]');
          const remoteIds = new Set(data.map(o => o.id));
          const merged = [...data];
          for (const lo of localSaved) {
            if (!remoteIds.has(lo.id)) {
              merged.push(lo);
            }
          }
          localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(merged));
          return merged;
        }
      } catch (e: any) {
        console.warn('Notice connecting to Supabase orders:', e?.message || e);
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
    if (isLiveMode) {
      try {
        const { data, error } = await supabase.from('orders').select('*').eq('id', id).single();
        if (error || !data) return null;
        return data;
      } catch {
        return null;
      }
    }
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
    pickup_latitude?: number | null;
    pickup_longitude?: number | null;
    notes?: string;
  }): Promise<Order> {
    // 1. Coverage validation: Authoritatively check PIN code serviceability
    const isServiceable = await this.isPincodeServiceable(data.pickup_pincode);
    if (!isServiceable) {
      throw new Error(`PIN code ${data.pickup_pincode} is currently outside our service coverage. Please verify your PIN code or contact support.`);
    }

    const settings = await this.getSettings();
    const existingOrders = await this.getOrders();

    // 2. Check slot capacity
    const slotCheck = await this.checkSlotAvailability(data.pickup_date, data.pickup_slot);
    if (!slotCheck.available) {
      throw new Error(`The pickup slot '${data.pickup_slot}' on ${data.pickup_date} is fully booked (${slotCheck.bookedCount}/${slotCheck.maxCapacity}). Please choose another slot.`);
    }

    // 3. Anti-duplicate protection: check if identical booking created in last 15 seconds
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
      id: generateUUID(),
      order_number: orderNumber,
      customer_id: data.customer_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      pickup_address: data.pickup_address,
      pickup_landmark: data.pickup_landmark,
      pickup_pincode: data.pickup_pincode,
      pickup_date: data.pickup_date,
      pickup_slot: data.pickup_slot,
      pickup_latitude: data.pickup_latitude || null,
      pickup_longitude: data.pickup_longitude || null,
      
      // Extensible Service & Pricing Snapshots (immutable once booked)
      service_name: 'Wash & Fold (Normal)',
      pricing_unit: 'per_kg',
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

    if (isLiveMode) {
      const { data: inserted, error } = await supabase.from('orders').insert(newOrder).select().single();
      if (error) {
        throw new Error(`Failed to save booking to database: ${error.message}`);
      }
      const orderToReturn = inserted || newOrder;
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]');
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([orderToReturn, ...existing.filter((o: Order) => o.id !== orderToReturn.id)]));
      return orderToReturn;
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
  static async assignPickupStaff(
    orderId: string,
    staffId: string,
    staffName: string,
    staffPhone: string
  ): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const previousStatus = order.order_status;
    order.assigned_pickup_id = staffId;
    order.assigned_pickup_name = staffName;
    order.assigned_pickup_phone = staffPhone;
    order.order_status = 'pickup_assigned';
    order.updated_at = new Date().toISOString();

    if (isLiveMode) {
      try {
        const { error } = await supabase.from('orders').update({
          assigned_pickup_id: staffId,
          assigned_pickup_name: staffName,
          assigned_pickup_phone: staffPhone,
          order_status: 'pickup_assigned',
          updated_at: order.updated_at
        }).eq('id', orderId);
        if (error) console.warn('Could not persist pickup assignment to Supabase:', error.message);

        await supabase.from('order_status_history').insert({
          order_id: orderId,
          previous_status: previousStatus,
          new_status: 'pickup_assigned',
          notes: `Pickup assigned to ${staffName} (${staffPhone})`
        });
      } catch (err: any) {
        console.warn('Notice updating pickup assignment:', err.message);
      }
    }

    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

    await WhatsAppService.sendNotification(
      order.customer_phone,
      'pickup_assigned',
      `Hello ${order.customer_name}, our pickup executive ${staffName} (${staffPhone}) has been assigned for Order #${order.order_number}. They will arrive at your address during the scheduled slot (${order.pickup_slot}).`,
      order.id
    );

    return order;
  }

  static async assignDeliveryStaff(
    orderId: string,
    staffId: string,
    staffName: string = 'Delivery Associate',
    staffPhone: string = '9876543215'
  ): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const previousStatus = order.order_status;
    order.assigned_delivery_id = staffId;
    order.assigned_delivery_name = staffName;
    order.assigned_delivery_phone = staffPhone;

    // Backward compatibility: if order is booked, assign pickup staff as well and transition to pickup_assigned
    if (order.order_status === 'booked') {
      order.order_status = 'pickup_assigned';
      if (!order.assigned_pickup_id) {
        order.assigned_pickup_id = staffId;
        order.assigned_pickup_name = staffName;
        order.assigned_pickup_phone = staffPhone;
      }
    } else if (order.order_status === 'ready_for_delivery') {
      order.order_status = 'out_for_delivery';
    }
    order.updated_at = new Date().toISOString();

    if (isLiveMode) {
      try {
        const updatePayload: any = {
          assigned_delivery_id: staffId,
          assigned_delivery_name: staffName,
          assigned_delivery_phone: staffPhone,
          order_status: order.order_status,
          updated_at: order.updated_at
        };
        if (order.order_status === 'pickup_assigned') {
          updatePayload.assigned_pickup_id = order.assigned_pickup_id;
          updatePayload.assigned_pickup_name = order.assigned_pickup_name;
          updatePayload.assigned_pickup_phone = order.assigned_pickup_phone;
        }

        const { error } = await supabase.from('orders').update(updatePayload).eq('id', orderId);
        if (error) console.warn('Could not persist delivery assignment to Supabase:', error.message);

        await supabase.from('order_status_history').insert({
          order_id: orderId,
          previous_status: previousStatus,
          new_status: order.order_status,
          notes: `Delivery associate assigned: ${staffName} (${staffPhone})`
        });
      } catch (err: any) {
        console.warn('Notice updating delivery assignment:', err.message);
      }
    }

    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    return order;
  }

  static async markAsCollected(orderId: string, notes?: string): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const previousStatus = order.order_status;
    order.order_status = 'collected';
    order.collected_at = new Date().toISOString();
    if (notes) {
      order.delivery_notes = notes;
    }
    order.updated_at = new Date().toISOString();

    if (isLiveMode) {
      try {
        const { error } = await supabase.from('orders').update({
          order_status: 'collected',
          collected_at: order.collected_at,
          delivery_notes: notes || null,
          updated_at: order.updated_at
        }).eq('id', orderId);
        if (error) console.warn('Could not persist collected status to Supabase:', error.message);

        await supabase.from('order_status_history').insert({
          order_id: orderId,
          previous_status: previousStatus,
          new_status: 'collected',
          notes: notes || 'Clothes collected from doorstep'
        });
      } catch (err: any) {
        console.warn('Notice updating collected status:', err.message);
      }
    }

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

    const previousStatus = order.order_status;
    order.order_status = 'delivered';
    order.delivered_at = new Date().toISOString();
    if (notes) {
      order.delivery_notes = notes;
    }
    order.updated_at = new Date().toISOString();

    if (isLiveMode) {
      try {
        const { error } = await supabase.from('orders').update({
          order_status: 'delivered',
          delivered_at: order.delivered_at,
          delivery_notes: notes || null,
          updated_at: order.updated_at
        }).eq('id', orderId);
        if (error) console.warn('Could not persist delivered status to Supabase:', error.message);

        await supabase.from('order_status_history').insert({
          order_id: orderId,
          previous_status: previousStatus,
          new_status: 'delivered',
          notes: notes || 'Clean clothes delivered to customer'
        });
      } catch (err: any) {
        console.warn('Notice updating delivered status:', err.message);
      }
    }

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

    if (isLiveMode) {
      try {
        const { error } = await supabase.from('orders').update({
          measured_weight: measuredWeightKg,
          billable_weight: billableWeightKg,
          total_amount_paise: totalAmountPaise,
          weighed_at: order.weighed_at,
          order_status: order.order_status,
          updated_at: order.updated_at
        }).eq('id', order.id);
        if (error) console.warn('Could not persist measured weight to Supabase:', error.message);

        await supabase.from('weight_change_history').insert({
          order_id: order.id,
          old_weight: oldWeight,
          new_weight: measuredWeightKg,
          old_amount_paise: oldAmount,
          new_amount_paise: totalAmountPaise,
          reason: correctionReason || (oldWeight ? 'Weight correction by manager' : 'Initial intake weight')
        });

        await supabase.from('order_status_history').insert({
          order_id: order.id,
          previous_status: 'collected',
          new_status: order.order_status,
          notes: `Weighed: ${measuredWeightKg.toFixed(2)} kg (Billable: ${billableWeightKg.toFixed(2)} kg @ ₹${order.price_per_kg_paise / 100}/kg = ₹${totalAmountPaise / 100})`
        });
      } catch (err: any) {
        console.warn('Notice updating weight in Supabase:', err.message);
      }
    }

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

    if (isLiveMode) {
      try {
        const updates: any = {
          order_status: newStatus,
          updated_at: order.updated_at
        };
        if (cancellationReason) updates.cancellation_reason = cancellationReason;
        if (notes) updates.notes = notes;
        if (newStatus === 'delivered') updates.delivered_at = new Date().toISOString();

        const { error } = await supabase.from('orders').update(updates).eq('id', order.id);
        if (error) console.warn('Could not persist status transition to Supabase:', error.message);

        await supabase.from('order_status_history').insert({
          order_id: order.id,
          previous_status: previousStatus,
          new_status: newStatus,
          notes
        });
      } catch (err: any) {
        console.warn('Notice updating status transition in Supabase:', err.message);
      }
    }

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
  // Maps & Navigation URL Helper
  // ----------------------------------------------------
  static getGoogleMapsDirectionsUrl(order: Order): string {
    if (order.pickup_latitude && order.pickup_longitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${order.pickup_latitude},${order.pickup_longitude}&travelmode=driving`;
    }
    const destinationParts = [
      order.pickup_address,
      order.pickup_landmark,
      order.pickup_pincode,
      'Bengaluru',
      'Karnataka'
    ].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationParts)}&travelmode=driving`;
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
    if (!amountPaise || amountPaise <= 0) {
      throw new Error('Payment amount must be a positive value greater than zero.');
    }

    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const totalDue = order.total_amount_paise || 0;
    const remainingBalance = Math.max(0, totalDue - order.paid_amount_paise);

    if (totalDue > 0 && amountPaise > remainingBalance) {
      throw new Error(`Payment amount (₹${amountPaise / 100}) exceeds the remaining balance of ₹${remainingBalance / 100}.`);
    }

    if (paymentMethod === 'upi_manual' && (!transactionReference || transactionReference.trim().length < 4)) {
      throw new Error('A valid UPI transaction reference (UTR) is required for manual UPI verification.');
    }

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
      id: generateUUID(),
      order_id: order.id,
      amount_paise: amountPaise,
      payment_method: paymentMethod,
      transaction_reference: transactionReference?.trim(),
      notes: notes?.trim(),
      recorded_by: recordedByName,
      created_at: new Date().toISOString()
    };

    if (isLiveMode) {
      const { error: payError } = await supabase.from('payments').insert(payment);
      if (payError) {
        throw new Error(`Failed to record payment in database ledger: ${payError.message}`);
      }
      const { error: orderError } = await supabase.from('orders').update({
        paid_amount_paise: order.paid_amount_paise,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        updated_at: order.updated_at
      }).eq('id', order.id);
      if (orderError) {
        throw new Error(`Failed to update order payment balance: ${orderError.message}`);
      }
    }

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
    const isDevDemo = !isLiveMode || import.meta.env.DEV;

    // Pickups: assigned for pickup to this staff member (or unassigned in dev/demo mode)
    const pickups = all.filter(o => {
      const isAssigned = o.assigned_pickup_id === staffId || (isDevDemo && !o.assigned_pickup_id);
      return isAssigned && (o.order_status === 'booked' || o.order_status === 'pickup_assigned');
    });

    // Deliveries: assigned for delivery to this staff member (or unassigned in dev/demo mode)
    const deliveries = all.filter(o => {
      const isAssigned = o.assigned_delivery_id === staffId || (isDevDemo && !o.assigned_delivery_id);
      return isAssigned && (o.order_status === 'ready_for_delivery' || o.order_status === 'out_for_delivery');
    });

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
    pickup_latitude?: number | null;
    pickup_longitude?: number | null;
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

  static async getCustomerOrders(userId?: string, phone?: string | null): Promise<Order[]> {
    if (isLiveMode) {
      try {
        let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (userId) {
          query = query.eq('customer_id', userId);
        }
        const { data, error } = await query;
        if (error) {
          console.warn('Notice loading customer orders:', error.message);
          return [];
        }
        return data || [];
      } catch (err: any) {
        console.warn('Notice fetching customer orders:', err.message);
        return [];
      }
    }

    const all = await this.getOrders();
    const cleanPhone = phone ? phone.replace(/[^0-9]/g, '').slice(-10) : '';
    return all.filter(o => 
      (userId && o.customer_id === userId) || 
      (cleanPhone && o.customer_phone.replace(/[^0-9]/g, '').slice(-10) === cleanPhone)
    );
  }

  static async markOrderCollected(orderId: string, _staffName?: string, notes?: string): Promise<Order> {
    return this.markAsCollected(orderId, notes);
  }

  static async markOrderDelivered(orderId: string, _staffName?: string, notes?: string): Promise<Order> {
    return this.markAsDelivered(orderId, notes);
  }

  static async getStaffProfiles(): Promise<Profile[]> {
    if (isLiveMode) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .neq('role', 'customer')
          .eq('is_active', true);
        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (err) {
        console.warn('Notice querying remote staff profiles:', err);
      }
    }

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
  // Service Areas Management (Dedicated Table & Validation)
  // ----------------------------------------------------
  static async getServiceAreas(): Promise<ServiceArea[]> {
    if (isLiveMode) {
      const { data, error } = await supabase.from('service_areas').select('*').order('pincode', { ascending: true });
      if (error) throw new Error(`Failed to load service areas: ${error.message}`);
      return data || [];
    }

    const saved = localStorage.getItem(STORAGE_KEYS.SERVICE_AREAS);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    localStorage.setItem(STORAGE_KEYS.SERVICE_AREAS, JSON.stringify(DEFAULT_SERVICE_AREAS));
    return DEFAULT_SERVICE_AREAS;
  }

  static async addServiceArea(data: Omit<ServiceArea, 'id' | 'created_at' | 'updated_at'>): Promise<ServiceArea> {
    const cleanPin = (data.pincode || '').trim().replace(/[^0-9]/g, '');
    if (cleanPin.length !== 6) {
      throw new Error('Please enter a valid 6-digit Indian PIN code.');
    }

    const areaName = (data.area_name || (data as any).name || '').trim();
    if (!areaName) {
      throw new Error('Please provide an area or locality name.');
    }

    const areas = await this.getServiceAreas();
    if (areas.some(a => a.pincode === cleanPin)) {
      throw new Error(`PIN code ${cleanPin} is already registered.`);
    }

    const newArea: ServiceArea = {
      id: generateUUID(),
      pincode: cleanPin,
      area_name: areaName,
      name: areaName,
      city: (data.city || 'Bengaluru').trim(),
      state: (data.state || 'Karnataka').trim(),
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isLiveMode) {
      const { data: inserted, error } = await supabase.from('service_areas').insert(newArea).select().single();
      if (error) throw new Error(`Failed to save service area: ${error.message}`);
      return inserted || newArea;
    }

    const updated = [...areas, newArea];
    localStorage.setItem(STORAGE_KEYS.SERVICE_AREAS, JSON.stringify(updated));
    return newArea;
  }

  static async updateServiceArea(id: string, updates: Partial<ServiceArea>): Promise<ServiceArea> {
    const areas = await this.getServiceAreas();
    const item = areas.find(a => a.id === id);
    if (!item) throw new Error('Service area not found');

    const updatedItem = {
      ...item,
      ...updates,
      updated_at: new Date().toISOString()
    };

    if (isLiveMode) {
      const { data: updatedDb, error } = await supabase.from('service_areas').update(updatedItem).eq('id', id).select().single();
      if (error) throw new Error(`Failed to update service area: ${error.message}`);
      return updatedDb || updatedItem;
    }

    const updatedList = areas.map(a => a.id === id ? updatedItem : a);
    localStorage.setItem(STORAGE_KEYS.SERVICE_AREAS, JSON.stringify(updatedList));
    return updatedItem;
  }

  static async isPincodeServiceable(pincode: string): Promise<boolean> {
    const cleanPin = pincode.trim().replace(/[^0-9]/g, '');
    if (cleanPin.length !== 6) return false;

    try {
      const areas = await this.getServiceAreas();
      if (areas && areas.length > 0) {
        const found = areas.find(a => a.pincode === cleanPin);
        if (found) {
          return Boolean(found.is_active);
        }
      }
    } catch {}

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
  // Services Catalog Management
  // ----------------------------------------------------
  static async getServices(): Promise<LaundryServiceItem[]> {
    if (isLiveMode) {
      const { data, error } = await supabase.from('services').select('*').order('display_order', { ascending: true });
      if (error) throw new Error(`Failed to load services: ${error.message}`);
      return data || [];
    }

    const saved = localStorage.getItem(STORAGE_KEYS.SERVICES);
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(DEFAULT_SERVICES));
    return DEFAULT_SERVICES;
  }

  static async updateService(id: string, updates: Partial<LaundryServiceItem>): Promise<LaundryServiceItem> {
    const services = await this.getServices();
    const item = services.find(s => s.id === id);
    if (!item) throw new Error('Service not found');

    const updatedItem = { ...item, ...updates, updated_at: new Date().toISOString() };

    if (isLiveMode) {
      const { data: updatedDb, error } = await supabase.from('services').update(updatedItem).eq('id', id).select().single();
      if (error) throw new Error(`Failed to update service: ${error.message}`);
      return updatedDb || updatedItem;
    }

    const updatedList = services.map(s => s.id === id ? updatedItem : s);
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(updatedList));
    return updatedItem;
  }

  // ----------------------------------------------------
  // Sales & Operations Period Analytics (Asia/Kolkata Business Timezone)
  // ----------------------------------------------------
  static async getPeriodAnalytics(
    period: PeriodFilter,
    customStart?: string,
    customEnd?: string
  ): Promise<DashboardPeriodAnalytics> {
    const [orders, allPayments] = await Promise.all([
      this.getOrders(),
      this.getAllPayments()
    ]);

    // Format YYYY-MM-DD in Asia/Kolkata
    const getISTDate = (d: Date): string => {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    };

    const now = new Date();
    const todayStr = getISTDate(now);
    const d = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

    let startDate = todayStr;
    let endDate = todayStr;
    let prevStartDate = todayStr;
    let prevEndDate = todayStr;

    if (period === 'today') {
      startDate = todayStr;
      endDate = todayStr;
      const y = new Date(d);
      y.setDate(y.getDate() - 1);
      prevStartDate = getISTDate(y);
      prevEndDate = prevStartDate;
    } else if (period === 'yesterday') {
      const y = new Date(d);
      y.setDate(y.getDate() - 1);
      startDate = getISTDate(y);
      endDate = startDate;
      const dayBefore = new Date(d);
      dayBefore.setDate(dayBefore.getDate() - 2);
      prevStartDate = getISTDate(dayBefore);
      prevEndDate = prevStartDate;
    } else if (period === 'this_week') {
      const dayOfWeek = (d.getDay() + 6) % 7;
      const mon = new Date(d);
      mon.setDate(mon.getDate() - dayOfWeek);
      startDate = getISTDate(mon);
      endDate = todayStr;
      const prevMon = new Date(mon);
      prevMon.setDate(prevMon.getDate() - 7);
      const prevSun = new Date(mon);
      prevSun.setDate(prevSun.getDate() - 1);
      prevStartDate = getISTDate(prevMon);
      prevEndDate = getISTDate(prevSun);
    } else if (period === 'last_week') {
      const dayOfWeek = (d.getDay() + 6) % 7;
      const thisMon = new Date(d);
      thisMon.setDate(thisMon.getDate() - dayOfWeek);
      const lastMon = new Date(thisMon);
      lastMon.setDate(lastMon.getDate() - 7);
      const lastSun = new Date(thisMon);
      lastSun.setDate(lastSun.getDate() - 1);
      startDate = getISTDate(lastMon);
      endDate = getISTDate(lastSun);
      const prevLastMon = new Date(lastMon);
      prevLastMon.setDate(prevLastMon.getDate() - 7);
      const prevLastSun = new Date(lastMon);
      prevLastSun.setDate(prevLastSun.getDate() - 1);
      prevStartDate = getISTDate(prevLastMon);
      prevEndDate = getISTDate(prevLastSun);
    } else if (period === 'this_month') {
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
      startDate = getISTDate(firstDay);
      endDate = todayStr;
      const prevMonthFirst = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const prevMonthLast = new Date(d.getFullYear(), d.getMonth(), 0);
      prevStartDate = getISTDate(prevMonthFirst);
      prevEndDate = getISTDate(prevMonthLast);
    } else if (period === 'last_month') {
      const prevMonthFirst = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const prevMonthLast = new Date(d.getFullYear(), d.getMonth(), 0);
      startDate = getISTDate(prevMonthFirst);
      endDate = getISTDate(prevMonthLast);
      const twoMonthsAgoFirst = new Date(d.getFullYear(), d.getMonth() - 2, 1);
      const twoMonthsAgoLast = new Date(d.getFullYear(), d.getMonth() - 1, 0);
      prevStartDate = getISTDate(twoMonthsAgoFirst);
      prevEndDate = getISTDate(twoMonthsAgoLast);
    } else if (period === 'custom' && customStart && customEnd) {
      startDate = customStart;
      endDate = customEnd;
      prevStartDate = customStart;
      prevEndDate = customEnd;
    }

    const orderInPeriod = (o: Order, start: string, end: string) => {
      const dt = o.pickup_date || o.created_at.slice(0, 10);
      return dt >= start && dt <= end;
    };

    const paymentInPeriod = (p: Payment, start: string, end: string) => {
      const dt = p.created_at.slice(0, 10);
      return dt >= start && dt <= end;
    };

    const currentOrders = orders.filter(o => orderInPeriod(o, startDate, endDate));
    const prevOrders = orders.filter(o => orderInPeriod(o, prevStartDate, prevEndDate));

    // Operational Metrics
    const ordersBooked = currentOrders.length;
    const ordersInProgress = orders.filter(o => 
      ['pickup_assigned', 'collected', 'washing', 'ready_for_delivery', 'out_for_delivery'].includes(o.order_status)
    ).length;
    const ordersDelivered = currentOrders.filter(o => o.order_status === 'delivered').length;
    const ordersCancelled = currentOrders.filter(o => o.order_status === 'cancelled').length;
    const ordersAwaitingWeight = orders.filter(o => 
      o.order_status !== 'cancelled' && (o.measured_weight === null || o.measured_weight === undefined)
    ).length;
    const ordersReadyForDelivery = orders.filter(o => o.order_status === 'ready_for_delivery').length;

    // Financial Metrics
    const nonCancelledCurrent = currentOrders.filter(o => o.order_status !== 'cancelled');
    const billedOrderValuePaise = nonCancelledCurrent.reduce((acc, o) => acc + (o.total_amount_paise || 0), 0);

    const nonCancelledPrev = prevOrders.filter(o => o.order_status !== 'cancelled');
    const previousPeriodBilledPaise = nonCancelledPrev.reduce((acc, o) => acc + (o.total_amount_paise || 0), 0);

    const currentPayments = allPayments.filter(p => paymentInPeriod(p, startDate, endDate));
    const prevPayments = allPayments.filter(p => paymentInPeriod(p, prevStartDate, prevEndDate));

    const actualCollectedPaise = currentPayments.reduce((acc, p) => acc + p.amount_paise, 0);
    const previousPeriodCollectedPaise = prevPayments.reduce((acc, p) => acc + p.amount_paise, 0);

    const cashCollectedPaise = currentPayments.filter(p => p.payment_method === 'cash').reduce((acc, p) => acc + p.amount_paise, 0);
    const upiCollectedPaise = currentPayments.filter(p => p.payment_method === 'upi_manual').reduce((acc, p) => acc + p.amount_paise, 0);

    const nonCancelledAll = orders.filter(o => o.order_status !== 'cancelled');
    const outstandingBalancePaise = nonCancelledAll.reduce((acc, o) => {
      const bill = o.total_amount_paise || 0;
      return acc + Math.max(0, bill - o.paid_amount_paise);
    }, 0);

    const ordersAwaitingPayment = nonCancelledAll.filter(o => 
      o.payment_status !== 'paid' && (o.total_amount_paise || 0) > 0
    ).length;

    const calcGrowth = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Number((((curr - prev) / prev) * 100).toFixed(1));
    };

    return {
      period,
      startDate,
      endDate,
      ordersBooked,
      ordersInProgress,
      ordersDelivered,
      ordersCancelled,
      ordersAwaitingWeight,
      ordersReadyForDelivery,
      billedOrderValuePaise,
      actualCollectedPaise,
      outstandingBalancePaise,
      cashCollectedPaise,
      upiCollectedPaise,
      ordersAwaitingPayment,
      previousPeriodBilledPaise,
      previousPeriodCollectedPaise,
      billedGrowthPercent: calcGrowth(billedOrderValuePaise, previousPeriodBilledPaise),
      collectedGrowthPercent: calcGrowth(actualCollectedPaise, previousPeriodCollectedPaise)
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
