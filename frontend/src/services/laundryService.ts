import {
  Order, OrderStatus, PaymentStatus, PaymentMethod, BusinessSettings,
  PickupSlot, Profile, CustomerAddress, Payment, WeightChangeHistory, OrderStatusHistory,
  OrderFeedback, FeedbackStatus, FeedbackSummaryMetrics,
  ServiceArea, LaundryServiceItem, PeriodFilter, DashboardPeriodAnalytics, UserRole
} from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { WhatsAppService } from './whatsappService';

export let isLiveMode = isSupabaseConfigured && import.meta.env.VITE_DEMO_MODE !== 'true';

export const setLiveModeForTesting = (val: boolean): void => {
  isLiveMode = val;
};

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

export const isUUID = (str?: string | null): boolean => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

// Default Business Settings
export const DEFAULT_SETTINGS: BusinessSettings = {
  business_name: 'SuperWash Exprez',
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
    id: 'f520c538-65e3-4b64-825e-5fdd3c282e8d',
    name: 'Wash & Fold (Normal)',
    description: 'Everyday clothes washed with premium gentle detergent, tumble-dried, and neatly steam-iron folded',
    pricing_unit: 'per_kg',
    unit_price_paise: 8000,
    min_weight_kg: 3.0,
    is_active: true,
    display_order: 1
  },
  {
    id: 'srv-iron-2',
    name: 'Steam Press & Ironing',
    description: 'Professional high-pressure steam pressing on hangers or precision folded',
    pricing_unit: 'per_piece',
    unit_price_paise: 2500,
    min_weight_kg: 0,
    is_active: true,
    display_order: 2
  },
  {
    id: 'srv-blanket-3',
    name: 'Heavy Comforter & Blanket',
    description: 'Deep antibacterial sanitization and gentle dry-cycle for large winter blankets and quilts',
    pricing_unit: 'per_item',
    unit_price_paise: 25000,
    min_weight_kg: 0,
    is_active: true,
    display_order: 3
  },
  {
    id: 'srv-bulk-4',
    name: 'Express Bulk Load (Same Day)',
    description: 'Dedicated private machine wash & dry up to 6 kg for rapid turnaround',
    pricing_unit: 'per_load',
    unit_price_paise: 45000,
    min_weight_kg: 0,
    is_active: true,
    display_order: 4
  }
];

// Pre-seeded Profiles for 4 Roles
export const DEMO_PROFILES: Profile[] = [
  {
    id: '00000000-0000-4000-a000-000000000001',
    email: 'owner@superwash.in',
    phone: '9876543210',
    full_name: 'Rajesh Sharma (Owner)',
    role: 'owner',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: '7010c68d-2da3-4ef5-ba16-99c22d00e77a',
    email: 'manager@superwash.in',
    phone: '9876543211',
    full_name: 'Ananya Verma (Store Manager)',
    role: 'manager',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7',
    email: 'superwash.audit.1792664886550@gmail.com',
    phone: '9876543215',
    full_name: 'Ramesh Kumar (Delivery Agent A)',
    role: 'delivery',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'c32bbcef-818d-4ee9-b92c-315d687d9bd0',
    email: 'suresh.superwash.express@gmail.com',
    phone: '9876543216',
    full_name: 'Suresh Kumar (Delivery Agent B)',
    role: 'delivery',
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: '06fcba51-f920-4278-95d5-b0bc3660c213',
    email: 'genaidream@gmail.com',
    phone: '5435678753',
    full_name: 'Gen AI (Customer)',
    role: 'customer',
    is_active: true,
    created_at: new Date().toISOString()
  }
];

// Local fallback storage keys
export const STORAGE_KEYS = {
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
    id: '00000000-0000-4000-b000-000000000101',
    order_number: 'SW-1001',
    customer_id: '00000000-0000-4000-a000-000000000005',
    customer_name: 'Priya Patel',
    customer_phone: '9876543212',
    pickup_address: 'Flat 402, Green Glen Layout, Bellandur, Bengaluru',
    pickup_landmark: 'Near Central Mall',
    pickup_pincode: '560103',
    pickup_date: new Date().toISOString().split('T')[0],
    pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
    assigned_pickup_id: '00000000-0000-4000-a000-000000000003',
    assigned_pickup_name: 'Ramesh Kumar',
    assigned_pickup_phone: '9876543215',
    assigned_delivery_id: '00000000-0000-4000-a000-000000000004',
    assigned_delivery_name: 'Suresh Kumar',
    assigned_delivery_phone: '9876543216',
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
    id: '00000000-0000-4000-b000-000000000102',
    order_number: 'SW-1002',
    customer_id: '00000000-0000-4000-a000-000000000005',
    customer_name: 'Priya Patel',
    customer_phone: '9876543212',
    pickup_address: '14, 12th Main, HAL 2nd Stage, Indiranagar, Bengaluru',
    pickup_landmark: 'Near Sony Center',
    pickup_pincode: '560038',
    pickup_date: new Date().toISOString().split('T')[0],
    pickup_slot: 'Noon (11:00 AM - 02:00 PM)',
    assigned_pickup_id: '00000000-0000-4000-a000-000000000003',
    assigned_pickup_name: 'Ramesh Kumar',
    assigned_pickup_phone: '9876543215',
    assigned_delivery_id: null,
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
  private static inFlightAddressSaves = new Map<string, Promise<CustomerAddress>>();

  private static formatDatabaseError(action: string, error: any): string {
    if (!error) return `Failed to ${action}.`;
    const msg = error.message || String(error);
    if (msg.includes('permission denied for table') || error.code === '42501') {
      return `Permission denied: Modifying the service catalogue requires authorized Business Owner privileges and database migration permissions.`;
    }
    if (msg.includes('duplicate key value') || error.code === '23505') {
      return `A service with this name or identifier already exists in the catalogue.`;
    }
    if (msg.includes('foreign key constraint') || error.code === '23503') {
      return `This service cannot be removed because it is referenced by existing customer orders. Deactivate it instead.`;
    }
    return `Unable to ${action}: ${msg}`;
  }

  // ----------------------------------------------------
  // Helpers & Financial Calculations
  // ----------------------------------------------------
  static calculateBill(
    measuredWeightKg: number,
    pricePerKgPaise: number,
    minWeightKg: number = 0,
    deliveryChargePaise: number = 0,
    pricingUnit: string = 'per_kg'
  ): {
    measuredWeightKg: number;
    billableWeightKg: number;
    totalAmountPaise: number;
    minWeightApplied: boolean;
  } {
    const safeMeasured = Math.max(0, measuredWeightKg);
    let billableWeightKg = safeMeasured;
    let laundryChargePaise = 0;
    let minWeightApplied = false;

    if (pricingUnit === 'per_kg') {
      minWeightApplied = safeMeasured < minWeightKg && minWeightKg > 0;
      billableWeightKg = Math.max(safeMeasured, minWeightKg);
      laundryChargePaise = Math.round(billableWeightKg * pricePerKgPaise);
    } else if (pricingUnit === 'per_piece' || pricingUnit === 'per_item') {
      const safeUnits = Math.round(safeMeasured);
      billableWeightKg = safeUnits;
      laundryChargePaise = Math.round(safeUnits * pricePerKgPaise);
    } else if (pricingUnit === 'per_load') {
      const safeLoads = Math.max(1, Math.round(safeMeasured || 1));
      billableWeightKg = safeLoads;
      laundryChargePaise = Math.round(safeLoads * pricePerKgPaise);
    } else if (pricingUnit === 'per_order') {
      billableWeightKg = 1;
      laundryChargePaise = pricePerKgPaise;
    } else {
      billableWeightKg = Math.max(safeMeasured, minWeightKg);
      laundryChargePaise = Math.round(billableWeightKg * pricePerKgPaise);
    }

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
        const { data, error } = await supabase.from('business_settings').select('*').limit(1).single();
        if (!error && data) {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data));
          return data;
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
      const { error } = await supabase.from('business_settings').update(updated).eq('id', current.id);
      if (error) {
        throw new Error(error.message || 'Failed to update business settings in database');
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
        const { data, error } = await supabase.from('pickup_slots').select('*').eq('is_active', true);
        if (!error && data && data.length > 0) return data;
      } catch (e) {
        console.warn('Falling back to local slots:', e);
      }
    }

    const saved = localStorage.getItem(STORAGE_KEYS.SLOTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
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
    const normalizedNew = address.address_line.trim().toLowerCase().replace(/\s+/g, ' ');
    const normalizedPin = (address.pincode || '').trim();
    const saveKey = `${address.user_id}:${normalizedNew}:${normalizedPin}`;

    const existingInFlight = this.inFlightAddressSaves.get(saveKey);
    if (existingInFlight) {
      return existingInFlight;
    }

    const savePromise = (async () => {
      // Deduplication check: verify if an address with identical normalized address_line and pincode already exists
      const existingList = await this.getAddresses(address.user_id);

      const existingMatch = existingList.find((a) => {
        const matchLine = a.address_line.trim().toLowerCase().replace(/\s+/g, ' ');
        const matchPin = (a.pincode || '').trim();
        return matchLine === normalizedNew && matchPin === normalizedPin;
      });

      if (existingMatch) {
        // Determine label: Never let a default 'Home' label overwrite an existing customized label (e.g. 'Work', 'Office', 'Other')
        const shouldPreserveExistingLabel = Boolean(existingMatch.label && existingMatch.label !== 'Home' && address.label === 'Home');
        const targetLabel = shouldPreserveExistingLabel ? existingMatch.label : (address.label || existingMatch.label || 'Home');

        const hasNewLat = address.latitude !== undefined && address.latitude !== existingMatch.latitude;
        const hasNewLng = address.longitude !== undefined && address.longitude !== existingMatch.longitude;
        const hasNewLandmark = Boolean(address.landmark && address.landmark !== existingMatch.landmark);
        const hasNewLabel = Boolean(targetLabel !== existingMatch.label);

        if (hasNewLat || hasNewLng || hasNewLandmark || hasNewLabel) {
          return this.updateAddress(existingMatch.id, {
            latitude: address.latitude ?? existingMatch.latitude,
            longitude: address.longitude ?? existingMatch.longitude,
            landmark: address.landmark || existingMatch.landmark,
            label: targetLabel,
            user_id: address.user_id
          });
        }
        return existingMatch;
      }

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

      const updated = [newAddress, ...existingList];
      localStorage.setItem(`${STORAGE_KEYS.ADDRESSES}_${address.user_id}`, JSON.stringify(updated));
      return newAddress;
    })();

    this.inFlightAddressSaves.set(saveKey, savePromise);
    try {
      return await savePromise;
    } finally {
      this.inFlightAddressSaves.delete(saveKey);
    }
  }

  static async updateAddress(addressId: string, updates: Partial<CustomerAddress>): Promise<CustomerAddress> {
    if (isLiveMode) {
      const updatePayload: Record<string, any> = {};
      if (updates.label !== undefined) updatePayload.label = updates.label;
      if (updates.address_line !== undefined) updatePayload.address_line = updates.address_line;
      if (updates.landmark !== undefined) updatePayload.landmark = updates.landmark;
      if (updates.pincode !== undefined) updatePayload.pincode = updates.pincode;
      if (updates.latitude !== undefined) updatePayload.latitude = updates.latitude;
      if (updates.longitude !== undefined) updatePayload.longitude = updates.longitude;
      if (updates.is_default !== undefined) updatePayload.is_default = updates.is_default;

      const { data, error } = await supabase
        .from('customer_addresses')
        .update(updatePayload)
        .eq('id', addressId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update address: ${error.message}`);
      }
      return data;
    }

    // Mock / LocalStorage mode
    const userId = updates.user_id;
    let list: CustomerAddress[] = [];
    let targetKey = '';

    if (userId) {
      targetKey = `${STORAGE_KEYS.ADDRESSES}_${userId}`;
      const saved = localStorage.getItem(targetKey);
      if (saved) {
        try { list = JSON.parse(saved); } catch {}
      }
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEYS.ADDRESSES)) {
          try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(parsed) && parsed.some((a) => a.id === addressId)) {
              list = parsed;
              targetKey = key;
              break;
            }
          } catch {}
        }
      }
    }

    const idx = list.findIndex((a) => a.id === addressId);
    if (idx === -1) {
      const updatedAddr = { id: addressId, ...updates } as CustomerAddress;
      return updatedAddr;
    }

    const updatedAddr: CustomerAddress = {
      ...list[idx],
      ...updates
    };
    list[idx] = updatedAddr;
    if (targetKey) {
      localStorage.setItem(targetKey, JSON.stringify(list));
    }
    return updatedAddr;
  }

  static async deleteAddress(addressId: string, userId?: string): Promise<boolean> {
    if (isLiveMode) {
      const { error } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', addressId);

      if (error) {
        throw new Error(`Failed to delete address: ${error.message}`);
      }
      return true;
    }

    // Mock / LocalStorage mode
    const keysToCheck: string[] = [];
    if (userId) {
      keysToCheck.push(`${STORAGE_KEYS.ADDRESSES}_${userId}`);
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEYS.ADDRESSES)) {
          keysToCheck.push(key);
        }
      }
    }

    for (const key of keysToCheck) {
      try {
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(list)) {
          const filtered = list.filter((a) => a.id !== addressId);
          if (filtered.length !== list.length) {
            localStorage.setItem(key, JSON.stringify(filtered));
            return true;
          }
        }
      } catch {}
    }
    return true;
  }

  // ----------------------------------------------------
  // Order Operations
  // ----------------------------------------------------
  static async getOrders(): Promise<Order[]> {
    if (isLiveMode) {
      try {
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (error) {
          console.error('Error querying Supabase orders:', error.message);
          throw new Error(`Failed to load orders from database: ${error.message}`);
        }
        if (data) {
          localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(data));
          return data;
        }
      } catch (e: any) {
        console.error('Error connecting to Supabase orders:', e?.message || e);
        throw e;
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

  static async getOrderBySubmissionId(
    submissionId: string,
    customerId?: string
  ): Promise<Order | null> {
    if (!submissionId) return null;

    if (isLiveMode) {
      try {
        let query = supabase
          .from('orders')
          .select('*')
          .eq('client_submission_id', submissionId);

        if (customerId) {
          query = query.eq('customer_id', customerId);
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
          throw error;
        }
        return (data as Order) || null;
      } catch (err: any) {
        // If column or schema cache does not exist yet (migration pending), do NOT return null.
        // Returning null would falsely signal "no order created" and cause duplicate orders.
        if (
          err?.code === '42703' ||
          err?.code === 'PGRST204' ||
          err?.message?.includes('column') ||
          err?.message?.includes('does not exist') ||
          err?.message?.includes('client_submission_id')
        ) {
          const schemaUnavailableErr: any = new Error(
            'The idempotency verification service is temporarily unavailable while database upgrades are pending.'
          );
          schemaUnavailableErr.code = 'SCHEMA_OR_SERVICE_UNAVAILABLE';
          throw schemaUnavailableErr;
        }
        throw err;
      }
    }

    const all = await this.getOrders();
    return (
      all.find(
        (o) =>
          o.client_submission_id === submissionId &&
          (!customerId || o.customer_id === customerId)
      ) || null
    );
  }

  private static inFlightBookings = new Map<string, Promise<Order>>();
  private static submissionRegistry = new Map<string, { order: Order; timestamp: number }>();
  private static localSequenceCounter: number = 0;

  static resetOrderSequence(): void {
    this.localSequenceCounter = 0;
    this.inFlightBookings.clear();
    this.submissionRegistry.clear();
  }

  static clearUserOperationalCache(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEYS.ORDERS);
      localStorage.removeItem(STORAGE_KEYS.PAYMENTS);
      localStorage.removeItem(STORAGE_KEYS.WEIGHT_HISTORY);
      localStorage.removeItem(STORAGE_KEYS.STATUS_HISTORY);
      localStorage.removeItem(STORAGE_KEYS.FEEDBACK);

      // Clear all user-specific address cache keys (superwash_addresses_*)
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(STORAGE_KEYS.ADDRESSES) || key.startsWith('superwash_addresses')) {
          localStorage.removeItem(key);
        }
      });

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('superwash_pending_booking');
      }

      this.resetOrderSequence();
    } catch (e) {
      console.warn('Notice clearing local operational cache:', e);
    }
  }


  static generateSafeOrderNumber(existingOrders: Order[]): string {
    let maxSeq = 1000;
    const existingSet = new Set<string>();

    for (const o of existingOrders) {
      if (o.order_number) {
        existingSet.add(o.order_number);
        const match = o.order_number.match(/^SW-(\d+)$/i);
        if (match) {
          const val = parseInt(match[1], 10);
          if (!isNaN(val) && val > maxSeq) {
            maxSeq = val;
          }
        }
      }
    }

    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]');
      if (Array.isArray(stored)) {
        for (const o of stored) {
          if (o.order_number) {
            existingSet.add(o.order_number);
            const match = o.order_number.match(/^SW-(\d+)$/i);
            if (match) {
              const val = parseInt(match[1], 10);
              if (!isNaN(val) && val > maxSeq) {
                maxSeq = val;
              }
            }
          }
        }
      }
    } catch {}

    this.localSequenceCounter = Math.max(this.localSequenceCounter, maxSeq);
    let nextSeq = this.localSequenceCounter + 1;
    let candidate = `SW-${nextSeq}`;

    while (existingSet.has(candidate)) {
      nextSeq++;
      candidate = `SW-${nextSeq}`;
    }

    this.localSequenceCounter = nextSeq;
    return candidate;
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
    service_id?: string;
    notes?: string;
    client_submission_id?: string;
  }): Promise<Order> {
    // 0. Ensure request has a submission identity
    if (!data.client_submission_id) {
      data.client_submission_id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    // Idempotency: Return completed order for retries of the same client submission ID
    if (this.submissionRegistry.has(data.client_submission_id)) {
      const cached = this.submissionRegistry.get(data.client_submission_id)!;
      if (Date.now() - cached.timestamp < 1800000) {
        return cached.order;
      }
    }

    const dedupePhone = (data.customer_phone || '').replace(/[^0-9]/g, '');
    const inFlightKey = `sub_${data.client_submission_id}`;

    // Concurrency protection: Return active in-flight request to prevent race duplicate creation
    if (this.inFlightBookings.has(inFlightKey)) {
      return this.inFlightBookings.get(inFlightKey)!;
    }

    const bookingPromise = this.internalCreateBooking(data, dedupePhone);
    this.inFlightBookings.set(inFlightKey, bookingPromise);

    try {
      const order = await bookingPromise;
      this.submissionRegistry.set(data.client_submission_id, {
        order,
        timestamp: Date.now()
      });
      return order;
    } finally {
      this.inFlightBookings.delete(inFlightKey);
    }
  }

  private static async internalCreateBooking(
    data: {
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
      service_id?: string;
      notes?: string;
      client_submission_id?: string;
    },
    dedupePhone: string
  ): Promise<Order> {
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

    // 3. Authoritatively resolve service from catalogue
    const activeServices = await this.getServices(false);
    let chosenService: LaundryServiceItem | undefined;

    if (data.service_id) {
      chosenService = activeServices.find(s => s.id === data.service_id);
      if (!chosenService) {
        // If not found in active, check if it was deactivated
        const allServices = await this.getServices(true);
        const inactive = allServices.find(s => s.id === data.service_id);
        if (inactive && !inactive.is_active) {
          throw new Error(`The service '${inactive.name}' is currently deactivated and not accepting new bookings. Please select another active service.`);
        }
        throw new Error('Selected service not found in catalogue.');
      }
    } else {
      chosenService = activeServices[0];
    }

    const serviceId = chosenService?.id;
    const serviceName = chosenService ? chosenService.name : 'Wash & Fold (Normal)';
    const pricingUnit = chosenService ? chosenService.pricing_unit : 'per_kg';
    const unitPricePaise = chosenService ? (chosenService.unit_price_paise || chosenService.price_paise || 8000) : settings.price_per_kg_paise;
    const minWeightKg = chosenService && chosenService.pricing_unit === 'per_kg' ? (chosenService.min_weight_kg ?? 3.0) : 0;

    // Authoritative, collision-safe candidate generation
    const orderNumber = this.generateSafeOrderNumber(existingOrders);

    // Check existing orders in local storage by client_submission_id (for local/mock mode and fast recovery)
    if (data.client_submission_id) {
      const existingBySubId = existingOrders.find(
        (o) => o.client_submission_id === data.client_submission_id
      );
      if (existingBySubId) {
        return existingBySubId;
      }
    }

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
      client_submission_id: data.client_submission_id,
      
      // Extensible Service & Pricing Snapshots (immutable once booked)
      service_id: serviceId,
      service_name: serviceName,
      pricing_unit: pricingUnit,
      price_per_kg_paise: unitPricePaise,
      min_weight_kg: minWeightKg,
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
      // In live mode, all bookings must go through the atomic, idempotent RPC.
      // Under no circumstances do we fall back to a direct insert if the RPC is unavailable.
      const submissionId = data.client_submission_id || generateUUID();

      let rpcOrder: Order | null = null;
      let rpcError: any = null;

      try {
        const { data: resOrder, error: err } = await supabase.rpc(
          'create_booking_idempotent',
          {
            p_client_submission_id: submissionId,
            p_customer_name: data.customer_name,
            p_customer_phone: data.customer_phone,
            p_pickup_address: data.pickup_address,
            p_pickup_landmark: data.pickup_landmark || null,
            p_pickup_pincode: data.pickup_pincode,
            p_pickup_date: data.pickup_date,
            p_pickup_slot: data.pickup_slot,
            p_service_id: data.service_id || null,
            p_pickup_latitude: data.pickup_latitude || null,
            p_pickup_longitude: data.pickup_longitude || null,
            p_notes: data.notes || null
          }
        );
        rpcOrder = resOrder as Order | null;
        rpcError = err;
      } catch (callErr: any) {
        rpcError = callErr;
      }

      if (rpcError) {
        const isRpcMissing =
          rpcError.code === 'PGRST202' ||
          rpcError.message?.includes('could not find the function') ||
          (rpcError.message?.includes('function') && rpcError.message?.includes('does not exist')) ||
          rpcError.message?.includes('function public.create_booking_idempotent');

        if (isRpcMissing) {
          const serviceUnavailableError: any = new Error(
            'The booking service is temporarily unavailable while database upgrades are pending. Your booking details have been safely preserved. Please try again in a few moments.'
          );
          serviceUnavailableError.code = 'BOOKING_SERVICE_UNAVAILABLE';
          throw serviceUnavailableError;
        }

        throw rpcError;
      }

      if (!rpcOrder) {
        throw new Error('No order was returned from the booking service.');
      }

      const orderToReturn = rpcOrder;
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]');
      localStorage.setItem(
        STORAGE_KEYS.ORDERS,
        JSON.stringify([orderToReturn, ...existing.filter((o: Order) => o.id !== orderToReturn.id)])
      );

      // WhatsApp notification using authoritative returned order number
      let rateMsg = `Rate: ₹${unitPricePaise / 100}/${pricingUnit === 'per_kg' ? 'kg' : pricingUnit}`;
      if (pricingUnit === 'per_kg' && minWeightKg > 0) {
        rateMsg += ` (Min ${minWeightKg} kg)`;
      }

      await WhatsAppService.sendNotification(
        data.customer_phone,
        'booking_confirmed',
        `Namaste ${data.customer_name}! Your laundry pickup #${orderToReturn.order_number} has been booked for ${data.pickup_date} (${data.pickup_slot}). ${rateMsg}.`,
        orderToReturn.id
      );

      return orderToReturn;
    }

    const freshStored = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]');
    const updatedList = [newOrder, ...freshStored.filter((o: Order) => o.id !== newOrder.id)];
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(updatedList));

    // Send optional WhatsApp notification
    let rateMsg = `Rate: ₹${unitPricePaise / 100}/${pricingUnit === 'per_kg' ? 'kg' : pricingUnit}`;
    if (pricingUnit === 'per_kg' && minWeightKg > 0) {
      rateMsg += ` (Min ${minWeightKg} kg)`;
    }

    await WhatsAppService.sendNotification(
      data.customer_phone,
      'booking_confirmed',
      `Namaste ${data.customer_name}! Your laundry pickup #${newOrder.order_number} has been booked for ${data.pickup_date} (${data.pickup_slot}). ${rateMsg}.`,
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
    staffName: string = 'Pickup Associate',
    staffPhone: string = '9876543215'
  ): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    if (order.order_status !== 'booked' && order.order_status !== 'pickup_assigned') {
      throw new Error(`Order #${order.order_number} has already progressed past pickup stage (${order.order_status}). Pickup staff cannot be reassigned.`);
    }

    const previousStatus = order.order_status;
    order.assigned_pickup_id = staffId;
    order.assigned_pickup_name = staffName;
    order.assigned_pickup_phone = staffPhone;
    order.order_status = 'pickup_assigned';
    order.updated_at = new Date().toISOString();

    if (isLiveMode) {
      const { data, error } = await supabase
        .from('orders')
        .update({
          assigned_pickup_id: staffId,
          assigned_pickup_name: staffName,
          assigned_pickup_phone: staffPhone,
          order_status: 'pickup_assigned',
          updated_at: order.updated_at
        })
        .eq('id', orderId)
        .select();

      if (error) {
        throw new Error(`Failed to persist pickup assignment in database: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error(
          'Database denied update: 0 rows modified. Your current session does not have Store Manager permissions under Supabase Row-Level Security. Please sign in with an authorized manager account.'
        );
      }

      // Authoritative database record
      const persisted = data[0] as Order;
      order.assigned_pickup_id = persisted.assigned_pickup_id;
      order.assigned_pickup_name = persisted.assigned_pickup_name;
      order.assigned_pickup_phone = persisted.assigned_pickup_phone;
      order.order_status = persisted.order_status;
      order.updated_at = persisted.updated_at;

      const auditUuid = isUUID(staffId) ? staffId : null;
      await supabase.from('order_status_history').insert({
        order_id: orderId,
        previous_status: previousStatus,
        new_status: 'pickup_assigned',
        notes: `Pickup assigned to ${staffName} (${staffPhone})`,
        changed_by: auditUuid
      });
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

    if (order.order_status === 'booked' || order.order_status === 'pickup_assigned') {
      throw new Error(`Order #${order.order_number} has not yet been collected from customer. Assign a pickup associate instead of delivery courier.`);
    }

    const previousStatus = order.order_status;
    if (order.order_status === 'ready_for_delivery') {
      order.order_status = 'delivery_assigned';
    }
    order.assigned_delivery_id = staffId;
    order.assigned_delivery_name = staffName;
    order.assigned_delivery_phone = staffPhone;
    order.updated_at = new Date().toISOString();

    if (isLiveMode) {
      let updatePayload: any = {
        assigned_delivery_id: staffId,
        assigned_delivery_name: staffName,
        assigned_delivery_phone: staffPhone,
        order_status: order.order_status,
        updated_at: order.updated_at
      };

      let { data, error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .select();

      // Graceful fallback if remote schema has not yet applied delivery_assigned constraint
      if (error && error.message?.includes('orders_order_status_check') && order.order_status === 'delivery_assigned') {
        order.order_status = 'ready_for_delivery';
        updatePayload = {
          assigned_delivery_id: staffId,
          assigned_delivery_name: staffName,
          assigned_delivery_phone: staffPhone,
          updated_at: order.updated_at
        };
        const retryResult = await supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', orderId)
          .select();
        data = retryResult.data;
        error = retryResult.error;
      }

      if (error) {
        throw new Error(`Failed to persist delivery assignment in database: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error(
          'Database denied update: 0 rows modified. Your current session does not have Store Manager permissions under Supabase Row-Level Security. Please sign in with an authorized manager account.'
        );
      }

      // Synchronize with authoritative database row
      const persisted = data[0] as Order;
      order.order_status = persisted.order_status;
      order.assigned_delivery_id = persisted.assigned_delivery_id;
      order.assigned_delivery_name = persisted.assigned_delivery_name;
      order.assigned_delivery_phone = persisted.assigned_delivery_phone;
      order.updated_at = persisted.updated_at;

      const auditUuid = isUUID(staffId) ? staffId : null;
      await supabase.from('order_status_history').insert({
        order_id: orderId,
        previous_status: previousStatus,
        new_status: order.order_status,
        notes: `Delivery courier assigned: ${staffName} (${staffPhone})`,
        changed_by: auditUuid
      });
    }

    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    return order;
  }

  static async recordPickupCollectionAndWeight(
    orderId: string,
    weightKg: number,
    staffId?: string,
    staffName: string = 'Delivery Associate',
    notes?: string
  ): Promise<Order> {
    if (typeof weightKg !== 'number' || isNaN(weightKg) || weightKg <= 0 || weightKg > 100) {
      throw new Error('Please enter a valid measured scale weight between 0.1 kg and 100 kg.');
    }

    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const previousStatus = order.order_status;
    const { billableWeightKg, totalAmountPaise } = this.calculateBill(
      weightKg,
      order.price_per_kg_paise,
      order.min_weight_kg,
      order.delivery_charge_paise,
      order.pricing_unit || 'per_kg'
    );

    const now = new Date().toISOString();
    const effectiveStaffUuid = (staffId && isUUID(staffId)) ? staffId : null;
    const deliveryNotes = notes || `Doorstep collection: ${weightKg.toFixed(2)} kg recorded on portable scale by ${staffName}`;

    if (isLiveMode) {
      // Strictly avoid modifying store intake timestamp (weighed_at). Doorstep scale
      // collection sets pickup_weighed_at and pickup_measured_weight under associate permissions.
      const updatePayload: any = {
        order_status: 'collected',
        pickup_measured_weight: weightKg,
        pickup_weighed_at: now,
        pickup_weighed_by: effectiveStaffUuid,
        measured_weight: weightKg,
        billable_weight: billableWeightKg,
        total_amount_paise: totalAmountPaise,
        collected_at: now,
        delivery_notes: deliveryNotes,
        updated_at: now
      };

      const { data, error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .select();

      if (error) {
        throw new Error(`Failed to persist collection and weight in database: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error('Database denied update: 0 rows modified. You are not authorized under Row-Level Security.');
      }

      // Mutate in-memory order ONLY after database update succeeds
      const persisted = data[0] as Order;
      order.order_status = persisted.order_status;
      order.pickup_measured_weight = persisted.pickup_measured_weight;
      order.pickup_weighed_at = persisted.pickup_weighed_at;
      order.pickup_weighed_by = persisted.pickup_weighed_by;
      order.measured_weight = persisted.measured_weight;
      order.billable_weight = persisted.billable_weight;
      order.total_amount_paise = persisted.total_amount_paise;
      order.collected_at = persisted.collected_at;
      order.delivery_notes = persisted.delivery_notes;
      order.updated_at = persisted.updated_at;

      await supabase.from('order_status_history').insert({
        order_id: orderId,
        previous_status: previousStatus,
        new_status: 'collected',
        notes: `Collected & weighed at doorstep: ${weightKg.toFixed(2)} kg (Bill: ₹${(totalAmountPaise / 100).toFixed(2)}) by ${staffName}`,
        changed_by: effectiveStaffUuid
      });
    } else {
      // Local/demo/offline mode
      order.order_status = 'collected';
      order.pickup_measured_weight = weightKg;
      order.pickup_weighed_at = now;
      order.pickup_weighed_by = staffId;
      order.measured_weight = weightKg;
      order.billable_weight = billableWeightKg;
      order.total_amount_paise = totalAmountPaise;
      order.collected_at = now;
      order.delivery_notes = deliveryNotes;
      order.updated_at = now;
    }

    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

    await WhatsAppService.sendNotification(
      order.customer_phone,
      'clothes_collected',
      `Hello ${order.customer_name}, our pickup executive ${staffName} has collected your clothes (Order #${order.order_number}). Doorstep measured weight: ${weightKg.toFixed(2)} kg. Total Bill: ₹${((order.total_amount_paise || 0) / 100).toFixed(2)}. They are now on their way to the store for washing!`,
      order.id
    );

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
      const { data, error } = await supabase.from('orders').update({
        order_status: 'collected',
        collected_at: order.collected_at,
        delivery_notes: notes || null,
        updated_at: order.updated_at
      }).eq('id', orderId).select();
      if (error) {
        throw new Error(`Failed to update collected status in database: ${error.message}`);
      }
      if (!data || data.length === 0) {
        throw new Error('Database denied update: 0 rows modified. You are not authorized under Row-Level Security.');
      }
      const persisted = data[0] as Order;
      order.order_status = persisted.order_status;
      order.collected_at = persisted.collected_at;
      order.updated_at = persisted.updated_at;

      await supabase.from('order_status_history').insert({
        order_id: orderId,
        previous_status: previousStatus,
        new_status: 'collected',
        notes: notes || 'Clothes collected from doorstep'
      });
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

    if (order.order_status !== 'out_for_delivery') {
      throw new Error(`Order #${order.order_number} must be in 'out_for_delivery' status to complete delivery (current status: '${order.order_status}').`);
    }

    const previousStatus = order.order_status;
    order.order_status = 'delivered';
    order.delivered_at = new Date().toISOString();
    if (notes) {
      order.delivery_notes = notes;
    }
    order.updated_at = new Date().toISOString();

    if (isLiveMode) {
      const { data, error } = await supabase.from('orders').update({
        order_status: 'delivered',
        delivered_at: order.delivered_at,
        delivery_notes: notes || null,
        updated_at: order.updated_at
      }).eq('id', orderId).select();
      if (error) {
        throw new Error(`Failed to update delivered status in database: ${error.message}`);
      }
      if (!data || data.length === 0) {
        throw new Error('Database denied update: 0 rows modified. You are not authorized under Row-Level Security.');
      }
      const persisted = data[0] as Order;
      order.order_status = persisted.order_status;
      order.delivered_at = persisted.delivered_at;
      order.updated_at = persisted.updated_at;

      await supabase.from('order_status_history').insert({
        order_id: orderId,
        previous_status: previousStatus,
        new_status: 'delivered',
        notes: notes || 'Clean clothes delivered to customer'
      });
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
      order.delivery_charge_paise,
      order.pricing_unit || 'per_kg'
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
      id: generateUUID(),
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
      const { data, error } = await supabase.from('orders').update({
        measured_weight: measuredWeightKg,
        billable_weight: billableWeightKg,
        total_amount_paise: totalAmountPaise,
        weighed_at: order.weighed_at,
        order_status: order.order_status,
        updated_at: order.updated_at
      }).eq('id', order.id).select();
      if (error) {
        throw new Error(`Failed to persist measured weight in database: ${error.message}`);
      }
      if (!data || data.length === 0) {
        throw new Error(
          'Database denied weight update: 0 rows modified. Your current session does not have Store Manager permissions under Row-Level Security.'
        );
      }
      const persisted = data[0] as Order;
      order.measured_weight = persisted.measured_weight;
      order.billable_weight = persisted.billable_weight;
      order.total_amount_paise = persisted.total_amount_paise;
      order.weighed_at = persisted.weighed_at;
      order.order_status = persisted.order_status;
      order.updated_at = persisted.updated_at;

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

    // Strict lifecycle validations
    if (newStatus === 'out_for_delivery') {
      if (!order.assigned_delivery_id) {
        throw new Error('Cannot dispatch order: A delivery courier must be assigned before dispatching out for delivery.');
      }
      if (order.order_status !== 'ready_for_delivery' && order.order_status !== 'delivery_assigned') {
        throw new Error(`Invalid transition: Order #${order.order_number} must be ready for delivery before dispatch (Current status: ${order.order_status}).`);
      }
    }
    if (newStatus === 'washing') {
      if (!order.measured_weight && order.measured_weight !== 0) {
        throw new Error('Cannot start washing: Laundry must be weighed before washing.');
      }
    }
    if (newStatus === 'delivered') {
      if (order.order_status !== 'out_for_delivery') {
        throw new Error(`Invalid transition: Order #${order.order_number} must be out for delivery before being marked delivered.`);
      }
    }

    const previousStatus = order.order_status;
    order.order_status = newStatus;
    if (newStatus === 'cancelled' && cancellationReason) {
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
        if (newStatus === 'cancelled' && cancellationReason) updates.cancellation_reason = cancellationReason;
        if (notes) updates.notes = notes;
        if (newStatus === 'delivered') updates.delivered_at = new Date().toISOString();

        const { data, error } = await supabase.from('orders').update(updates).eq('id', order.id).select();
        if (error) {
          console.error('Could not persist status transition to Supabase:', error.message);
          throw new Error(`Failed to persist status transition in database: ${error.message}`);
        }
        if (!data || data.length === 0) {
          throw new Error(
            'Database denied status update: 0 rows modified. Your current session does not have permission under Row-Level Security.'
          );
        }
        const persisted = data[0] as Order;
        order.order_status = persisted.order_status;
        order.updated_at = persisted.updated_at;

        await supabase.from('order_status_history').insert({
          order_id: order.id,
          previous_status: previousStatus,
          new_status: newStatus,
          notes
        });
      } catch (err: any) {
        console.error('Notice updating status transition in Supabase:', err.message);
        throw err;
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
  // ----------------------------------------------------
  // Maps & Navigation URL Helper
  // ----------------------------------------------------
  static hasValidCoordinates(order: { pickup_latitude?: number | null; pickup_longitude?: number | null }): boolean {
    if (order.pickup_latitude === null || order.pickup_latitude === undefined ||
        order.pickup_longitude === null || order.pickup_longitude === undefined) {
      return false;
    }
    const lat = typeof order.pickup_latitude === 'number' ? order.pickup_latitude : parseFloat(String(order.pickup_latitude));
    const lng = typeof order.pickup_longitude === 'number' ? order.pickup_longitude : parseFloat(String(order.pickup_longitude));

    if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) return false;
    // Reject Null Island (0, 0)
    if (lat === 0 && lng === 0) return false;
    // Standard global coordinate bounds
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  static getGoogleMapsDirectionsUrl(order: Order): string {
    // 1. When valid saved pickup coordinates exist, generate a direct driving directions URL
    if (this.hasValidCoordinates(order)) {
      const lat = Number(order.pickup_latitude);
      const lng = Number(order.pickup_longitude);
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    }

    // 2. Fallback when coordinates are absent or invalid:
    // Generate a properly encoded Google Maps Search URL based on available address, landmark, and postcode.
    // Google Maps Search drops a pin on the matching street or building and avoids "Cannot seem to find a way there"
    // that occurs when complex room/flat strings are fed into the strict directions router.
    const addressComponents = [
      order.pickup_address?.trim(),
      order.pickup_landmark?.trim(),
      order.pickup_pincode?.trim()
    ].filter(Boolean);

    const query = addressComponents.join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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
    recordedByOrName?: string,
    recordedByNameDisplay?: string,
    idempotencyKey?: string
  ): Promise<Order & { payment: Payment }> {
    if (!amountPaise || amountPaise <= 0 || !Number.isInteger(amountPaise)) {
      throw new Error('Payment amount must be a positive integer value greater than zero (in paise).');
    }

    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    if (order.order_status === 'cancelled') {
      throw new Error('Cannot record payment for a cancelled order.');
    }

    if (order.total_amount_paise === null || order.total_amount_paise === undefined) {
      throw new Error('Cannot record payment: Order has not yet been weighed and billed.');
    }

    const totalDue = order.total_amount_paise || 0;
    const remainingBalance = Math.max(0, totalDue - order.paid_amount_paise);

    if (totalDue > 0 && amountPaise > remainingBalance) {
      throw new Error(`Payment amount (₹${amountPaise / 100}) exceeds the remaining balance of ₹${remainingBalance / 100}.`);
    }

    if (paymentMethod === 'upi_manual' && (!transactionReference || transactionReference.trim().length < 4)) {
      throw new Error('A valid UPI transaction reference (UTR) is required for manual UPI verification.');
    }

    const storedPayments: Payment[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYMENTS) || '[]');

    // Check idempotency key replay FIRST
    const effectiveIdempotencyKey = idempotencyKey?.trim() || undefined;
    if (effectiveIdempotencyKey) {
      const existingPayment = storedPayments.find(p => p.idempotency_key === effectiveIdempotencyKey);
      if (existingPayment) {
        const incomingRef = transactionReference?.trim() || undefined;
        const existingRef = existingPayment.transaction_reference?.trim() || undefined;
        if (
          existingPayment.order_id !== order.id ||
          existingPayment.amount_paise !== amountPaise ||
          existingPayment.payment_method !== paymentMethod ||
          existingRef !== incomingRef
        ) {
          throw new Error(
            `Idempotency conflict: Key ${effectiveIdempotencyKey} was previously used with different payment parameters (Original Order: ${existingPayment.order_id}, Amount: ${existingPayment.amount_paise}, Method: ${existingPayment.payment_method}).`
          );
        }
        return Object.assign(order, { payment: existingPayment });
      }
    }

    // Prevent duplicate UPI transaction reference globally across ALL orders
    if (paymentMethod === 'upi_manual' && transactionReference) {
      const cleanRef = transactionReference.trim();
      const duplicateRef = storedPayments.find(p => p.transaction_reference === cleanRef);
      if (duplicateRef) {
        throw new Error(`Duplicate payment: UPI transaction reference ${cleanRef} has already been recorded for Order #${duplicateRef.order_id}.`);
      }
    }

    // Helper to validate UUID format for PostgreSQL recorded_by column
    const isUUID = (str?: string): boolean =>
      Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

    let recordedByUuid: string | null = null;
    let staffNameDisplay: string | undefined = recordedByNameDisplay;

    if (isUUID(recordedByOrName)) {
      recordedByUuid = recordedByOrName!;
    } else if (recordedByOrName && !staffNameDisplay) {
      staffNameDisplay = recordedByOrName;
    }

    if (isLiveMode && !recordedByUuid) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id && isUUID(session.user.id)) {
          recordedByUuid = session.user.id;
        }
      } catch {
        // Fallback to null
      }
    }

    let finalNotes = notes?.trim() || undefined;
    if (staffNameDisplay && staffNameDisplay !== 'Staff' && !finalNotes?.includes(staffNameDisplay)) {
      finalNotes = finalNotes
        ? `${finalNotes} (Recorded by: ${staffNameDisplay})`
        : `Recorded by: ${staffNameDisplay}`;
    }

    let payment: Payment = {
      id: generateUUID(),
      order_id: order.id,
      amount_paise: amountPaise,
      payment_method: paymentMethod,
      transaction_reference: transactionReference?.trim(),
      notes: finalNotes,
      recorded_by: recordedByUuid || undefined,
      idempotency_key: effectiveIdempotencyKey,
      created_at: new Date().toISOString()
    };

    if (isLiveMode) {
      // Execute via atomic PostgreSQL database RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('record_order_payment', {
        p_order_id: order.id,
        p_amount_paise: amountPaise,
        p_payment_method: paymentMethod,
        p_transaction_reference: transactionReference?.trim() || null,
        p_notes: finalNotes || null,
        p_idempotency_key: effectiveIdempotencyKey || null
      });

      if (!rpcError && rpcData) {
        if (rpcData.payment_id) {
          payment.id = rpcData.payment_id;
        }
        order.paid_amount_paise = rpcData.paid_amount_paise ?? (order.paid_amount_paise + amountPaise);
        order.payment_status = rpcData.payment_status ?? ((order.paid_amount_paise >= totalDue) ? 'paid' : 'partially_paid');
        order.payment_method = paymentMethod;
        order.updated_at = new Date().toISOString();
      } else {
        const isRpcMissing = rpcError?.code === '42883' || rpcError?.message?.includes('record_order_payment');
        if (isRpcMissing) {
          console.warn('Database RPC record_order_payment is pending remote migration; executing fallback payment update.');
          const dbPaymentPayload = {
            id: payment.id,
            order_id: payment.order_id,
            amount_paise: payment.amount_paise,
            payment_method: payment.payment_method,
            transaction_reference: payment.transaction_reference || null,
            notes: payment.notes || null,
            recorded_by: recordedByUuid || null,
            idempotency_key: effectiveIdempotencyKey || null,
            created_at: payment.created_at
          };

          const { data: insertedPayment, error: payError } = await supabase
            .from('payments')
            .insert(dbPaymentPayload)
            .select();

          if (payError) {
            throw new Error(`Failed to record payment in database ledger: ${payError.message}`);
          }

          if (insertedPayment && insertedPayment.length > 0) {
            payment.id = insertedPayment[0].id;
            payment.created_at = insertedPayment[0].created_at;
          }

          const newPaidAmount = order.paid_amount_paise + amountPaise;
          order.paid_amount_paise = newPaidAmount;
          order.payment_method = paymentMethod;
          order.payment_status = (totalDue > 0 && newPaidAmount >= totalDue) ? 'paid' : 'partially_paid';
          order.updated_at = new Date().toISOString();

          const { data: updatedOrders, error: orderError } = await supabase
            .from('orders')
            .update({
              paid_amount_paise: order.paid_amount_paise,
              payment_status: order.payment_status,
              payment_method: order.payment_method,
              updated_at: order.updated_at
            })
            .eq('id', order.id)
            .select();

          if (orderError) {
            throw new Error(`Failed to update order payment balance: ${orderError.message}`);
          }

          if (updatedOrders && updatedOrders.length > 0) {
            const persistedOrder = updatedOrders[0] as Order;
            order.paid_amount_paise = persistedOrder.paid_amount_paise;
            order.payment_status = persistedOrder.payment_status;
            order.payment_method = persistedOrder.payment_method;
            order.updated_at = persistedOrder.updated_at;
          }
        } else {
          throw new Error(rpcError?.message || 'Payment transaction failed in database RPC.');
        }
      }
    } else {
      const newPaidAmount = order.paid_amount_paise + amountPaise;
      order.paid_amount_paise = newPaidAmount;
      order.payment_method = paymentMethod;
      order.payment_status = (totalDue > 0 && newPaidAmount >= totalDue) ? 'paid' : 'partially_paid';
      order.updated_at = new Date().toISOString();
    }

    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([payment, ...storedPayments]));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));

    await WhatsAppService.sendNotification(
      order.customer_phone,
      'payment_received',
      `Receipt: Received ₹${amountPaise / 100} via ${paymentMethod === 'cash' ? 'Cash' : 'UPI'} for SuperWash Order #${order.order_number}. Remaining Balance: ₹${Math.max(0, totalDue - order.paid_amount_paise) / 100}. Thank you!`,
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

  static async getOrdersForDelivery(staffId: string): Promise<{
    pickups: Order[];
    deliveries: Order[];
    completedDeliveries: Order[];
    pickupHistory: Order[];
    completed: Order[];
  }> {
    const all = await this.getOrders();

    // 1. Pickups: Strictly assigned for pickup to this staff member and awaiting collection
    const pickups = all.filter(o => {
      return o.assigned_pickup_id === staffId && o.order_status === 'pickup_assigned';
    });

    // 2. Deliveries: Strictly assigned for delivery to this staff member at ready, delivery_assigned, or out_for_delivery stage
    const deliveries = all.filter(o => {
      return o.assigned_delivery_id === staffId && (
        o.order_status === 'ready_for_delivery' ||
        o.order_status === 'delivery_assigned' ||
        o.order_status === 'out_for_delivery'
      );
    });

    // 3. Completed Deliveries: STRICTLY delivered orders completed by this delivery associate
    const completedDeliveries = all.filter(o => {
      return o.assigned_delivery_id === staffId && o.order_status === 'delivered';
    });

    // 4. Pickup History: Orders collected by this pickup associate (doorstep scale measurements)
    const pickupHistory = all.filter(o => {
      return o.assigned_pickup_id === staffId && [
        'collected', 'washing', 'ready_for_delivery', 'delivery_assigned', 'out_for_delivery', 'delivered'
      ].includes(o.order_status);
    });

    return {
      pickups,
      deliveries,
      completedDeliveries,
      pickupHistory,
      completed: completedDeliveries // backwards-compatibility: strictly delivered orders only
    };
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
      readyForDelivery: all.filter(o => o.order_status === 'ready_for_delivery' || o.order_status === 'delivery_assigned')
    };
  }

  // ----------------------------------------------------
  // Convenience Aliases & Staff/Payments Management
  // ----------------------------------------------------
  static async getAllOrders(): Promise<Order[]> {
    return this.getOrders();
  }

  // ----------------------------------------------------
  // Direct Update Security Validation (Testing & Enforcing Column Allowlist)
  // ----------------------------------------------------
  static async attemptDirectOrderUpdate(
    orderId: string,
    fields: Partial<Order>,
    userRole: 'delivery' | 'manager' | 'owner' | 'customer'
  ): Promise<Order> {
    const orders = await this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    if (userRole === 'customer') {
      throw new Error('Unauthorized: Customers cannot modify order records.');
    }

    // Immutable columns for all roles
    const immutableFields: (keyof Order)[] = [
      'id', 'order_number', 'customer_id', 'customer_name', 'customer_phone',
      'pickup_address', 'pickup_pincode', 'pickup_date', 'pickup_slot',
      'service_id', 'service_name', 'pricing_unit', 'price_per_kg_paise',
      'min_weight_kg', 'delivery_charge_paise', 'created_at'
    ];
    for (const f of immutableFields) {
      if (fields[f] !== undefined && fields[f] !== order[f]) {
        throw new Error(`Security violation: Field ${f} is immutable once booked.`);
      }
    }

    // Direct payment field tampering check (for ALL roles, including manager/owner)
    const paymentFields: (keyof Order)[] = ['paid_amount_paise', 'payment_status', 'payment_method'];
    for (const pf of paymentFields) {
      if (fields[pf] !== undefined && fields[pf] !== order[pf]) {
        throw new Error(
          `Security violation: Direct payment field modification is prohibited for ${userRole}. Payments must be processed through record_order_payment().`
        );
      }
    }

    if (userRole === 'delivery') {
      // Invariant columns associates can never modify
      const associateForbidden: (keyof Order)[] = [
        'assigned_pickup_id', 'assigned_pickup_name', 'assigned_pickup_phone',
        'assigned_delivery_id', 'assigned_delivery_name', 'assigned_delivery_phone',
        'cancellation_reason', 'weighed_at'
      ];
      for (const f of associateForbidden) {
        if (fields[f] !== undefined && fields[f] !== order[f]) {
          throw new Error(`Security violation: Delivery associates cannot modify field ${f}.`);
        }
      }

      // Task-specific allowlists
      if (order.order_status === 'pickup_assigned') {
        const allowedPickup: (keyof Order)[] = [
          'order_status', 'measured_weight', 'pickup_measured_weight', 'billable_weight',
          'total_amount_paise', 'collected_at', 'pickup_weighed_at', 'pickup_weighed_by',
          'delivery_notes', 'notes', 'updated_at'
        ];
        for (const k of Object.keys(fields) as (keyof Order)[]) {
          if (!allowedPickup.includes(k) && fields[k] !== undefined && fields[k] !== order[k]) {
            throw new Error(`Security violation: Field ${k} not permitted for pickup task.`);
          }
        }
      } else if (order.order_status === 'ready_for_delivery' || order.order_status === 'delivery_assigned') {
        const allowedDispatch: (keyof Order)[] = ['order_status', 'delivery_notes', 'notes', 'updated_at'];
        for (const k of Object.keys(fields) as (keyof Order)[]) {
          if (!allowedDispatch.includes(k) && fields[k] !== undefined && fields[k] !== order[k]) {
            throw new Error(`Security violation: Field ${k} not permitted for delivery dispatch task.`);
          }
        }
      } else if (order.order_status === 'out_for_delivery') {
        const allowedHandover: (keyof Order)[] = ['order_status', 'delivered_at', 'delivery_notes', 'notes', 'updated_at'];
        for (const k of Object.keys(fields) as (keyof Order)[]) {
          if (!allowedHandover.includes(k) && fields[k] !== undefined && fields[k] !== order[k]) {
            throw new Error(`Security violation: Field ${k} not permitted for delivery handover task.`);
          }
        }
      } else {
        throw new Error(`Unauthorized: Delivery associates cannot update orders in status ${order.order_status}.`);
      }
    }

    if (userRole === 'manager' || userRole === 'owner') {
      if (fields.order_status === 'cancelled' && (!fields.cancellation_reason || !fields.cancellation_reason.trim())) {
        throw new Error('Validation error: A cancellation reason is mandatory when cancelling an order.');
      }
    }

    Object.assign(order, fields);
    return order;
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
    service_id?: string;
    notes?: string;
    client_submission_id?: string;
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

  static async updateCustomerAddress(addressId: string, updates: Partial<CustomerAddress>): Promise<CustomerAddress> {
    return this.updateAddress(addressId, updates);
  }

  static async deleteCustomerAddress(addressId: string, userId?: string): Promise<boolean> {
    return this.deleteAddress(addressId, userId);
  }

  static async updateOrderPickupLocation(
    orderId: string,
    details: {
      pickup_address: string;
      pickup_landmark?: string | null;
      pickup_pincode: string;
      pickup_latitude?: number | null;
      pickup_longitude?: number | null;
    }
  ): Promise<Order> {
    const trimmedAddress = details.pickup_address.trim();
    const trimmedPincode = details.pickup_pincode.trim();
    if (!trimmedAddress) {
      throw new Error('Pickup address is required.');
    }
    if (!trimmedPincode) {
      throw new Error('Pickup PIN code is required.');
    }
    if (!/^[1-9][0-9]{5}$/.test(trimmedPincode)) {
      throw new Error('Invalid PIN code format. Must be a 6-digit Indian PIN code.');
    }

    const hasLat = details.pickup_latitude !== undefined && details.pickup_latitude !== null;
    const hasLng = details.pickup_longitude !== undefined && details.pickup_longitude !== null;
    if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
      throw new Error('Latitude and longitude must be provided as a coordinate pair.');
    }
    if (hasLat && hasLng) {
      const latVal = details.pickup_latitude as number;
      const lngVal = details.pickup_longitude as number;
      if (latVal < -90 || latVal > 90 || lngVal < -180 || lngVal > 180) {
        throw new Error('Coordinates are outside the valid geographic range.');
      }
    }

    if (isLiveMode) {
      const { data, error } = await supabase.rpc('update_order_pickup_location', {
        p_order_id: orderId,
        p_pickup_address: trimmedAddress,
        p_pickup_landmark: details.pickup_landmark ? details.pickup_landmark.trim() : null,
        p_pickup_pincode: trimmedPincode,
        p_pickup_latitude: details.pickup_latitude ?? null,
        p_pickup_longitude: details.pickup_longitude ?? null
      });

      if (error) {
        throw new Error(error.message);
      }
      return data;
    }

    // Mock / LocalStorage mode
    const orders = await this.getOrders();
    const orderIndex = orders.findIndex((o) => o.id === orderId);
    if (orderIndex === -1) {
      throw new Error('Order not found.');
    }
    const order = orders[orderIndex];
    if (order.order_status !== 'booked') {
      throw new Error(`Pickup location can only be updated while the order is in "booked" status. Current status is "${order.order_status}".`);
    }

    const updatedOrder: Order = {
      ...order,
      pickup_address: trimmedAddress,
      pickup_landmark: details.pickup_landmark ? details.pickup_landmark.trim() : undefined,
      pickup_pincode: trimmedPincode,
      pickup_latitude: details.pickup_latitude ?? undefined,
      pickup_longitude: details.pickup_longitude ?? undefined,
      updated_at: new Date().toISOString()
    };
    orders[orderIndex] = updatedOrder;
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    return updatedOrder;
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
          console.error('Error loading customer orders:', error.message);
          throw new Error(`Failed to load customer orders from database: ${error.message}`);
        }
        return data || [];
      } catch (err: any) {
        console.error('Error fetching customer orders:', err.message);
        throw err;
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

  static async getStaffProfiles(includeInactive: boolean = true): Promise<Profile[]> {
    if (isLiveMode) {
      try {
        let query = supabase
          .from('profiles')
          .select('*')
          .neq('role', 'customer');

        if (!includeInactive) {
          query = query.eq('is_active', true);
        }

        const { data, error } = await query.order('created_at', { ascending: true });
        if (!error && data) {
          // Include active unclaimed staff pre-registrations so owner sees invited accounts
          try {
            const { data: preRegs } = await supabase
              .from('staff_pre_registrations')
              .select('*')
              .is('claimed_at', null);

            if (preRegs && preRegs.length > 0) {
              const existingEmails = new Set(data.map((p) => p.email?.toLowerCase()).filter(Boolean));
              for (const reg of preRegs) {
                if (!existingEmails.has(reg.email.toLowerCase())) {
                  data.push({
                    id: reg.id,
                    email: reg.email,
                    phone: reg.phone,
                    full_name: `${reg.full_name} (Invited - Pending Google Sign-In)`,
                    role: reg.role,
                    is_active: reg.is_active,
                    created_at: reg.created_at
                  });
                }
              }
            }
          } catch {}

          localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(data));
          return data;
        }
        if (error) {
          console.warn('Notice querying remote staff profiles:', error.message);
        }
      } catch (err) {
        console.warn('Notice querying remote staff profiles:', err);
      }
    }

    const saved = localStorage.getItem(STORAGE_KEYS.PROFILES);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return includeInactive ? parsed : parsed.filter((p: Profile) => p.is_active);
        }
      } catch {}
    }
    const initial = DEMO_PROFILES.filter(p => p.role !== 'customer');
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(initial));
    return includeInactive ? initial : initial.filter(p => p.is_active);
  }

  static async addStaffProfile(data: {
    full_name: string;
    email: string;
    phone: string;
    role: 'delivery' | 'manager';
    password?: string;
    send_invite?: boolean;
  }): Promise<Profile> {
    const cleanEmail = data.email?.trim()?.toLowerCase();
    const cleanPhone = data.phone?.replace(/[^0-9]/g, '')?.slice(-10);
    const cleanName = data.full_name?.trim();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('A valid email address is required for staff account creation.');
    }
    if (!cleanName || cleanName.length < 2) {
      throw new Error('Full name must be at least 2 characters.');
    }
    if (!cleanPhone || cleanPhone.length !== 10) {
      throw new Error('Please enter a valid 10-digit Indian phone number.');
    }
    if (!['delivery', 'manager'].includes(data.role)) {
      throw new Error("Operational role must be either 'delivery' or 'manager'.");
    }

    const currentProfiles = await this.getStaffProfiles(true);

    // Client-side fast duplicate email check
    const emailDuplicate = currentProfiles.find(
      (p) => p.email && p.email.toLowerCase() === cleanEmail
    );
    if (emailDuplicate) {
      throw new Error(`An account with email ${cleanEmail} already exists (${emailDuplicate.full_name}).`);
    }

    // Client-side fast duplicate phone check
    const phoneDuplicate = currentProfiles.find(
      (p) => p.phone && p.phone.replace(/[^0-9]/g, '').slice(-10) === cleanPhone
    );
    if (phoneDuplicate) {
      throw new Error(`A staff member with phone number ${cleanPhone} already exists (${phoneDuplicate.full_name}).`);
    }

    // Authoritative Server-Side Persistence in Live Mode
    if (isLiveMode) {
      let serverError: string | null = null;

      // 1. Primary secure server-side method: Database RPC 'create_staff_account'
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_staff_account', {
          p_email: cleanEmail,
          p_phone: cleanPhone,
          p_full_name: cleanName,
          p_role: data.role,
          p_password: data.password?.trim() || null
        });

        if (!rpcError && rpcData?.success && rpcData?.profile) {
          const persistedProfile = rpcData.profile as Profile;
          const updated = [...currentProfiles.filter(p => p.id !== persistedProfile.id), persistedProfile];
          localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(updated));
          return persistedProfile;
        }

        if (rpcError) {
          const isRpcMissing = rpcError.code === '42883' || (rpcError.message?.includes('function') && rpcError.message?.includes('does not exist'));
          if (!isRpcMissing) {
            throw new Error(rpcError.message || 'Database error creating staff account.');
          }
          serverError = rpcError.message;
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('already exists') || err.message.includes('Access denied') || err.message.includes('required'))) {
          throw err;
        }
        serverError = err.message || String(err);
      }

      // 2. Secondary secure server-side method: Edge Function 'create-staff-account'
      try {
        let session = (await supabase.auth.getSession()).data?.session;

        // Proactive token refresh if session is missing or near expiration (within 60s)
        if (session) {
          const isExpiring = session.expires_at && (session.expires_at * 1000 < Date.now() + 60000);
          if (isExpiring) {
            const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
            if (!refreshErr && refreshData?.session) {
              session = refreshData.session;
            }
          }
        }

        // If no authenticated user session exists, fail fast with explicit 401
        if (!session?.access_token) {
          throw new Error('[HTTP 401] Invalid or expired session. Please log in again to manage staff accounts.');
        }

        const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke(
          'create-staff-account',
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`
            },
            body: {
              full_name: cleanName,
              email: cleanEmail,
              phone: cleanPhone,
              role: data.role,
              password: data.password?.trim() || undefined,
              send_invite: data.send_invite ?? true
            }
          }
        );

        if (!edgeErr && edgeRes?.success && edgeRes?.profile) {
          const persistedProfile = edgeRes.profile as Profile;
          const updated = [...currentProfiles.filter(p => p.id !== persistedProfile.id), persistedProfile];
          localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(updated));
          return persistedProfile;
        }

        if (edgeRes?.error) {
          throw new Error(edgeRes.error);
        }

        if (edgeErr) {
          let detailedMessage = edgeErr.message;
          let httpStatus = (edgeErr as any).status || 400;
          try {
            const ctx = (edgeErr as any).context;
            if (ctx && typeof ctx.json === 'function') {
              const errBody = await ctx.json();
              if (errBody?.error) detailedMessage = errBody.error;
              else if (errBody?.message) detailedMessage = errBody.message;
              if (errBody?.status) httpStatus = errBody.status;
            } else if (ctx && typeof ctx.text === 'function') {
              const errText = await ctx.text();
              if (errText) detailedMessage = errText;
            }
          } catch {}

          if (!detailedMessage.startsWith('[HTTP')) {
            detailedMessage = `[HTTP ${httpStatus}] ${detailedMessage}`;
          }
          throw new Error(detailedMessage);
        }
      } catch (err: any) {
        if (err.message && (
          err.message.includes('already exists') ||
          err.message.includes('Access denied') ||
          err.message.includes('required') ||
          err.message.includes('Please enter') ||
          err.message.includes('Invalid or expired') ||
          err.message.includes('HTTP 401') ||
          err.message.includes('HTTP 403') ||
          err.message.includes('session')
        )) {
          throw err;
        }
        serverError = err.message || serverError;
      }

      // In live mode, NEVER pretend success or create unpersisted local records when database operations fail!
      throw new Error(
        `Failed to persist staff account to database: ${serverError || 'The server-side creation function is not available or returned an error.'}. ` +
        `Please ensure the secure staff creation migration or Edge Function is deployed on Supabase.`
      );
    }

    // Demo / Test Mode Fallback: Persist in local storage so refreshing retains newly created demo staff
    const newStaff: Profile = {
      id: generateUUID(),
      email: cleanEmail,
      phone: cleanPhone,
      full_name: cleanName,
      role: data.role,
      is_active: true,
      created_at: new Date().toISOString()
    };

    const updated = [...currentProfiles, newStaff];
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(updated));
    return newStaff;
  }

  static async updateStaffProfile(
    staffId: string,
    data: { full_name: string; phone: string; role: UserRole; email?: string; is_active?: boolean },
    callerId?: string,
    callerRole?: string
  ): Promise<Profile> {
    if (callerRole && callerRole !== 'owner') {
      throw new Error('Access denied. Only the business owner is authorized to update employee details.');
    }
    const cleanName = data.full_name?.trim();
    const cleanPhone = data.phone?.replace(/[^0-9]/g, '')?.slice(-10);
    const cleanEmail = data.email?.trim().toLowerCase();

    if (!cleanName || cleanName.length < 2) {
      throw new Error('Full name must be at least 2 characters.');
    }
    if (!cleanPhone || cleanPhone.length !== 10) {
      throw new Error('Please enter a valid 10-digit Indian phone number.');
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!['owner', 'manager', 'delivery'].includes(data.role)) {
      throw new Error("Operational role must be either 'manager' or 'delivery'.");
    }

    const profiles = await this.getStaffProfiles(true);
    const staff = profiles.find(s => s.id === staffId);
    if (!staff) {
      throw new Error('Employee profile not found.');
    }

    // Check duplicate phone number with other accounts
    const phoneDuplicate = profiles.find(
      p => p.id !== staffId && p.phone && p.phone.replace(/[^0-9]/g, '').slice(-10) === cleanPhone
    );
    if (phoneDuplicate) {
      throw new Error(`Phone number ${cleanPhone} is already registered to ${phoneDuplicate.full_name}.`);
    }

    // Check duplicate email with other accounts
    if (cleanEmail) {
      const emailDuplicate = profiles.find(
        p => p.id !== staffId && p.email && p.email.toLowerCase() === cleanEmail
      );
      if (emailDuplicate) {
        throw new Error(`Email address ${cleanEmail} is already registered to ${emailDuplicate.full_name}.`);
      }
    }

    // Permanent primary owner safeguards
    if (staff.email?.toLowerCase() === 'superwashexprez@gmail.com') {
      if (cleanEmail && cleanEmail !== 'superwashexprez@gmail.com') {
        throw new Error('The permanent primary owner email (superwashexprez@gmail.com) cannot be changed.');
      }
      if (data.role !== 'owner') {
        throw new Error('The permanent primary owner role cannot be changed.');
      }
      if (data.is_active === false) {
        throw new Error('The permanent primary owner account cannot be deactivated.');
      }
    }

    // Owner protection safeguards
    if (staff.role === 'owner' && data.role !== 'owner') {
      if (callerId && staffId === callerId) {
        throw new Error('Business owners cannot demote their own account role.');
      }
      const otherActiveOwners = profiles.filter(
        p => p.role === 'owner' && p.is_active && p.id !== staffId
      );
      if (otherActiveOwners.length === 0) {
        throw new Error('Cannot demote the last active business owner. The system must have at least one active owner.');
      }
    }

    if (staff.role === 'owner' && data.is_active === false) {
      if (callerId && staffId === callerId) {
        throw new Error('You cannot deactivate your own owner account.');
      }
      const otherActiveOwners = profiles.filter(
        p => p.role === 'owner' && p.is_active && p.id !== staffId
      );
      if (otherActiveOwners.length === 0) {
        throw new Error('Cannot deactivate the last active business owner.');
      }
    }

    if (isLiveMode) {
      let updatedFromDb: any = null;

      // 1. If updating only basic fields without email or status, try secure atomic RPC
      if (!cleanEmail && typeof data.is_active !== 'boolean') {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('update_staff_profile', {
            p_staff_id: staffId,
            p_full_name: cleanName,
            p_phone: cleanPhone,
            p_role: data.role
          });

          if (!rpcError && rpcData?.success) {
            updatedFromDb = rpcData.profile;
          } else if (rpcError) {
            const isRpcMissing = rpcError.code === '42883' || rpcError.message?.includes('does not exist');
            if (!isRpcMissing) {
              throw new Error(rpcError.message || 'Database error updating employee details.');
            }
          }
        } catch (err: any) {
          if (err.message && (err.message.includes('already') || err.message.includes('denied') || err.message.includes('owner'))) {
            throw err;
          }
        }
      }

      // 2. Direct table update supporting full profile fields (name, phone, role, email, is_active)
      if (!updatedFromDb) {
        const updatePayload: any = {
          full_name: cleanName,
          phone: cleanPhone,
          role: data.role,
          updated_at: new Date().toISOString()
        };
        if (cleanEmail) updatePayload.email = cleanEmail;
        if (typeof data.is_active === 'boolean') updatePayload.is_active = data.is_active;

        const { data: tableData, error: tableError } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', staffId)
          .select()
          .single();

        if (tableError) {
          if (tableError.code === '23505' || tableError.message.toLowerCase().includes('unique')) {
            throw new Error('Email or phone number is already registered to another account.');
          }
          throw new Error(`Failed to update employee details in database: ${tableError.message}`);
        }
        updatedFromDb = tableData;
      }

      if (updatedFromDb) {
        staff.full_name = updatedFromDb.full_name || cleanName;
        staff.phone = updatedFromDb.phone || cleanPhone;
        staff.role = updatedFromDb.role || data.role;
        if (updatedFromDb.email) staff.email = updatedFromDb.email;
        if (typeof updatedFromDb.is_active === 'boolean') staff.is_active = updatedFromDb.is_active;
      }
    } else {
      staff.full_name = cleanName;
      staff.phone = cleanPhone;
      staff.role = data.role;
      if (cleanEmail) staff.email = cleanEmail;
      if (typeof data.is_active === 'boolean') staff.is_active = data.is_active;
    }

    // Keep demo list in sync
    const demoStaff = DEMO_PROFILES.find(p => p.id === staffId);
    if (demoStaff) {
      demoStaff.full_name = cleanName;
      demoStaff.phone = cleanPhone;
      demoStaff.role = data.role;
      if (cleanEmail) demoStaff.email = cleanEmail;
      if (typeof data.is_active === 'boolean') demoStaff.is_active = data.is_active;
    }

    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    return staff;
  }

  static async deleteStaffProfile(
    staffId: string,
    callerId?: string,
    callerRole?: string
  ): Promise<{ success: boolean; deactivatedInstead?: boolean; message: string }> {
    // 1. Authorization: Only authorized business owners can delete staff accounts
    if (callerRole && callerRole !== 'owner') {
      throw new Error('Access denied. Only the business owner is authorized to delete staff accounts.');
    }

    const profiles = await this.getStaffProfiles(true);
    const staff = profiles.find(s => s.id === staffId);
    if (!staff) {
      throw new Error('Staff member profile not found.');
    }

    // 2. Safeguard: Prevent deleting permanent primary owner
    if (staff.email?.toLowerCase() === 'superwashexprez@gmail.com') {
      throw new Error('Access denied. The permanent primary owner account (superwashexprez@gmail.com) cannot be deleted.');
    }

    // 3. Safeguard: Prevent owner from deleting their own authenticated account
    if (callerId && staffId === callerId) {
      throw new Error('You cannot delete your own authenticated owner account.');
    }

    // 4. Safeguard: Prevent deleting the last remaining active owner
    if (staff.role === 'owner') {
      const remainingOwners = profiles.filter(
        p => p.role === 'owner' && p.is_active && p.id !== staffId
      );
      if (remainingOwners.length === 0) {
        throw new Error('Cannot delete the last remaining active business owner.');
      }
    }

    // 5. Inspect foreign keys, order assignments, and audit records
    let hasOrderAssignments = false;
    try {
      if (isLiveMode) {
        const { data: assignedOrders, error: checkErr } = await supabase
          .from('orders')
          .select('id')
          .or(`assigned_pickup_id.eq.${staffId},assigned_delivery_id.eq.${staffId},pickup_weighed_by.eq.${staffId}`)
          .limit(1);

        if (!checkErr && assignedOrders && assignedOrders.length > 0) {
          hasOrderAssignments = true;
        }
      } else {
        const orders = await this.getOrders();
        hasOrderAssignments = orders.some(
          o => o.assigned_pickup_id === staffId || o.assigned_delivery_id === staffId
        );
      }
    } catch {
      // In case of query issue, proceed safely
    }

    // 6. If referenced by orders, deactivate instead to preserve audit history & referential integrity
    if (hasOrderAssignments) {
      await this.toggleStaffStatus(staffId, false, callerId, callerRole);
      return {
        success: true,
        deactivatedInstead: true,
        message: `Staff member ${staff.full_name} is assigned to existing orders. To preserve audit history and referential integrity, their account has been safely deactivated instead of deleted.`
      };
    }

    // 7. Atomic secure deletion via SECURITY DEFINER database RPC (Direct table DELETE is intentionally disabled)
    if (isLiveMode) {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_staff_profile', {
        p_staff_id: staffId
      });

      if (rpcErr) {
        if (rpcErr.code === '42883' || rpcErr.message?.includes('does not exist')) {
          throw new Error("Database RPC 'delete_staff_profile' is not configured or migration 20261027130000 has not been applied. Direct profile deletion is disabled for security.");
        }
        throw new Error(rpcErr.message || 'Database error occurred while deleting staff account.');
      }

      if (!rpcData?.success) {
        throw new Error(rpcData?.message || 'Failed to delete staff account.');
      }

      if (rpcData.deactivated_instead) {
        // Synchronize local cache to show deactivated status
        const cached = profiles.find(p => p.id === staffId);
        if (cached) cached.is_active = false;
        localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
        const demoProfile = DEMO_PROFILES.find(p => p.id === staffId);
        if (demoProfile) demoProfile.is_active = false;

        return {
          success: true,
          deactivatedInstead: true,
          message: rpcData.message || `Staff member ${staff.full_name} has historical records and was safely deactivated instead of deleted.`
        };
      }
    }

    // Update local cache and demo directory for permanent deletion
    const updatedProfiles = profiles.filter(p => p.id !== staffId);
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(updatedProfiles));
    const demoIndex = DEMO_PROFILES.findIndex(p => p.id === staffId);
    if (demoIndex !== -1) {
      DEMO_PROFILES.splice(demoIndex, 1);
    }

    return {
      success: true,
      deactivatedInstead: false,
      message: `Staff account for ${staff.full_name} has been successfully deleted.`
    };
  }

  static async toggleStaffStatus(
    staffId: string,
    isActive: boolean,
    callerId?: string,
    callerRole?: string
  ): Promise<Profile | null> {
    if (callerRole && callerRole !== 'owner') {
      throw new Error('Access denied. Only the business owner is authorized to activate or deactivate staff accounts.');
    }

    const profiles = await this.getStaffProfiles(true);
    const staff = profiles.find(s => s.id === staffId);
    if (!staff) return null;

    // Owner protection safeguards
    if (!isActive) {
      if (staff.email?.toLowerCase() === 'superwashexprez@gmail.com') {
        throw new Error('The permanent primary owner account (superwashexprez@gmail.com) cannot be deactivated.');
      }
      if (callerId && staffId === callerId) {
        throw new Error('You cannot deactivate your own owner account.');
      }
      if (staff.role === 'owner') {
        const otherActiveOwners = profiles.filter(
          p => p.role === 'owner' && p.is_active && p.id !== staffId
        );
        if (otherActiveOwners.length === 0) {
          throw new Error('Cannot deactivate the last active business owner.');
        }
      }
    }

    if (isLiveMode) {
      let updatedFromDb: any = null;

      // 1. Try secure atomic RPC 'set_staff_active_status'
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('set_staff_active_status', {
          p_staff_id: staffId,
          p_is_active: isActive
        });

        if (!rpcError && rpcData?.success) {
          updatedFromDb = rpcData.profile;
        } else if (rpcError) {
          const isRpcMissing = rpcError.code === '42883' || rpcError.message?.includes('does not exist');
          if (!isRpcMissing) {
            throw new Error(rpcError.message || 'Database error updating employee status.');
          }
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('denied') || err.message.includes('owner') || err.message.includes('cannot deactivate'))) {
          throw err;
        }
      }

      // 2. Fallback to direct table update
      if (!updatedFromDb) {
        const { data: tableData, error: tableError } = await supabase
          .from('profiles')
          .update({
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', staffId)
          .select()
          .single();

        if (tableError) {
          throw new Error(`Failed to update staff status in database: ${tableError.message}`);
        }
        updatedFromDb = tableData;
      }

      staff.is_active = updatedFromDb?.is_active ?? isActive;
    } else {
      staff.is_active = isActive;
    }

    // Keep demo list in sync
    const demoStaff = DEMO_PROFILES.find(p => p.id === staffId);
    if (demoStaff) {
      demoStaff.is_active = isActive;
    }

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
      try {
        const { data, error } = await supabase
          .from('service_areas')
          .select('*')
          .order('pincode', { ascending: true });
        if (!error && data) {
          const mapped: ServiceArea[] = data.map((d: any) => ({
            ...d,
            name: d.area_name || d.name
          }));
          localStorage.setItem(STORAGE_KEYS.SERVICE_AREAS, JSON.stringify(mapped));
          return mapped;
        }
        if (error) {
          console.warn('Notice loading service areas from Supabase:', error.message);
        }
      } catch (err: any) {
        console.warn('Notice querying service areas:', err?.message || err);
      }
    }

    const saved = localStorage.getItem(STORAGE_KEYS.SERVICE_AREAS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((d: any) => ({ ...d, name: d.area_name || d.name }));
        }
      } catch {}
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
      throw new Error(`PIN code ${cleanPin} is already registered (${areas.find(a => a.pincode === cleanPin)?.area_name || 'Service Area'}).`);
    }

    // Precise database payload matching public.service_areas table schema:
    // (id, pincode, area_name, city, state, is_active, created_at, updated_at)
    // Note: 'name' is NOT a database column, so it is strictly excluded from dbPayload.
    const nowIso = new Date().toISOString();
    const dbPayload = {
      id: generateUUID(),
      pincode: cleanPin,
      area_name: areaName,
      city: (data.city || 'Bengaluru').trim(),
      state: (data.state || 'Karnataka').trim(),
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_at: nowIso,
      updated_at: nowIso
    };

    if (isLiveMode) {
      const { data: inserted, error } = await supabase
        .from('service_areas')
        .insert(dbPayload)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save service area in database: ${error.message}`);
      }

      const result: ServiceArea = {
        ...(inserted || dbPayload),
        name: (inserted || dbPayload).area_name
      };
      const updatedList = [...areas.filter(a => a.id !== result.id), result];
      localStorage.setItem(STORAGE_KEYS.SERVICE_AREAS, JSON.stringify(updatedList));
      return result;
    }

    const newArea: ServiceArea = {
      ...dbPayload,
      name: areaName
    };
    const updated = [...areas, newArea];
    localStorage.setItem(STORAGE_KEYS.SERVICE_AREAS, JSON.stringify(updated));
    return newArea;
  }

  static async updateServiceArea(id: string, updates: Partial<ServiceArea>): Promise<ServiceArea> {
    const areas = await this.getServiceAreas();
    const item = areas.find(a => a.id === id);
    if (!item) throw new Error('Service area not found');

    const dbUpdates: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
    if (updates.pincode !== undefined) dbUpdates.pincode = (updates.pincode || '').trim().replace(/[^0-9]/g, '');
    if (updates.area_name !== undefined) dbUpdates.area_name = updates.area_name.trim();
    else if ((updates as any).name !== undefined) dbUpdates.area_name = (updates as any).name.trim();
    if (updates.city !== undefined) dbUpdates.city = (updates.city || '').trim();
    if (updates.state !== undefined) dbUpdates.state = (updates.state || '').trim();
    if (updates.is_active !== undefined) dbUpdates.is_active = Boolean(updates.is_active);

    if (isLiveMode) {
      const { data: updatedDb, error } = await supabase
        .from('service_areas')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update service area in database: ${error.message}`);
      }

      const result: ServiceArea = {
        ...updatedDb,
        name: updatedDb.area_name
      };
      const updatedList = areas.map(a => a.id === id ? result : a);
      localStorage.setItem(STORAGE_KEYS.SERVICE_AREAS, JSON.stringify(updatedList));
      return result;
    }

    const updatedItem: ServiceArea = {
      ...item,
      ...updates,
      area_name: dbUpdates.area_name || item.area_name,
      name: dbUpdates.area_name || item.area_name,
      updated_at: dbUpdates.updated_at
    };
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
  static async getServices(includeInactive: boolean = true): Promise<LaundryServiceItem[]> {
    if (isLiveMode) {
      try {
        let query = supabase.from('services').select('*').order('display_order', { ascending: true });
        if (!includeInactive) {
          query = query.eq('is_active', true);
        }
        const { data, error } = await query;
        if (error) {
          console.warn('Supabase services load notice:', error.message);
        } else if (data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(data));
          return data;
        }
      } catch (err: any) {
        console.warn('Falling back to local services cache:', err?.message || err);
      }
    }

    const saved = localStorage.getItem(STORAGE_KEYS.SERVICES);
    let list: LaundryServiceItem[] = DEFAULT_SERVICES;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          list = parsed;
        }
      } catch {}
    } else {
      localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(DEFAULT_SERVICES));
    }

    if (!includeInactive) {
      return list.filter(s => s.is_active);
    }
    return list;
  }

  static async addService(serviceData: {
    name: string;
    description?: string;
    pricing_unit: string;
    unit_price_paise: number;
    min_weight_kg?: number;
    is_active?: boolean;
    display_order?: number;
  }, callerRole?: UserRole): Promise<LaundryServiceItem> {
    const currentProfileStr = typeof localStorage !== 'undefined' ? localStorage.getItem('superwash_auth_profile') : null;
    let storedRole: UserRole | undefined;
    if (currentProfileStr) {
      try {
        const parsed = JSON.parse(currentProfileStr);
        storedRole = parsed?.role;
      } catch {}
    }
    const effectiveRole = callerRole || storedRole;
    if (effectiveRole && effectiveRole !== 'owner') {
      throw new Error(`Unauthorized: Only business owners can add services to the catalogue. Current role: '${effectiveRole}'.`);
    }

    const trimmedName = serviceData.name?.trim();
    if (!trimmedName) {
      throw new Error('Service name is required');
    }
    if (!serviceData.unit_price_paise || serviceData.unit_price_paise <= 0) {
      throw new Error('Unit price must be greater than zero');
    }

    const allowedUnits = ['per_kg', 'per_piece', 'per_item', 'per_load', 'per_order'];
    if (!allowedUnits.includes(serviceData.pricing_unit)) {
      throw new Error(`Invalid pricing unit '${serviceData.pricing_unit}'. Supported units: ${allowedUnits.join(', ')}`);
    }

    // Check duplicate service name (case-insensitive)
    const existingServices = await this.getServices(true);
    const duplicate = existingServices.find(s => s.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (duplicate) {
      throw new Error(`A service with the name '${trimmedName}' already exists. Please choose a unique name.`);
    }

    const newService: LaundryServiceItem = {
      id: generateUUID(),
      name: trimmedName,
      description: serviceData.description?.trim() || '',
      pricing_unit: serviceData.pricing_unit,
      unit_price_paise: serviceData.unit_price_paise,
      min_weight_kg: serviceData.pricing_unit === 'per_kg' ? (serviceData.min_weight_kg ?? 3.0) : 0,
      is_active: serviceData.is_active !== undefined ? serviceData.is_active : true,
      display_order: serviceData.display_order ?? (existingServices.length + 1),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isLiveMode) {
      const { data, error } = await supabase.from('services').insert(newService).select().single();
      if (error) {
        throw new Error(this.formatDatabaseError('add service to database', error));
      }
      const created = data || newService;
      const updatedList = [...existingServices, created];
      localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(updatedList));
      return created;
    }

    const updatedList = [...existingServices, newService];
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(updatedList));
    return newService;
  }

  static async updateService(id: string, updates: Partial<LaundryServiceItem>, callerRole?: UserRole): Promise<LaundryServiceItem> {
    const currentProfileStr = typeof localStorage !== 'undefined' ? localStorage.getItem('superwash_auth_profile') : null;
    let storedRole: UserRole | undefined;
    if (currentProfileStr) {
      try {
        const parsed = JSON.parse(currentProfileStr);
        storedRole = parsed?.role;
      } catch {}
    }
    const effectiveRole = callerRole || storedRole;
    if (effectiveRole && effectiveRole !== 'owner') {
      throw new Error(`Unauthorized: Only business owners can modify services in the catalogue. Current role: '${effectiveRole}'.`);
    }

    const services = await this.getServices(true);
    const item = services.find(s => s.id === id);
    if (!item) throw new Error('Service not found');

    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (!trimmedName) throw new Error('Service name cannot be empty');
      const duplicate = services.find(s => s.id !== id && s.name.trim().toLowerCase() === trimmedName.toLowerCase());
      if (duplicate) {
        throw new Error(`A service with the name '${trimmedName}' already exists. Please choose a unique name.`);
      }
      updates.name = trimmedName;
    }

    if (updates.unit_price_paise !== undefined && updates.unit_price_paise <= 0) {
      throw new Error('Unit price must be greater than zero');
    }

    const updatedItem: LaundryServiceItem = {
      ...item,
      ...updates,
      min_weight_kg: (updates.pricing_unit || item.pricing_unit) === 'per_kg' 
        ? (updates.min_weight_kg !== undefined ? updates.min_weight_kg : item.min_weight_kg)
        : 0,
      updated_at: new Date().toISOString()
    };

    if (isLiveMode) {
      const { data: updatedDb, error } = await supabase.from('services').update(updatedItem).eq('id', id).select().single();
      if (error) throw new Error(this.formatDatabaseError('update service', error));
      const persisted = updatedDb || updatedItem;
      const updatedList = services.map(s => s.id === id ? persisted : s);
      localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(updatedList));
      return persisted;
    }

    const updatedList = services.map(s => s.id === id ? updatedItem : s);
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(updatedList));
    return updatedItem;
  }

  static async toggleServiceStatus(id: string, isActive: boolean, callerRole?: UserRole): Promise<LaundryServiceItem> {
    return this.updateService(id, { is_active: isActive }, callerRole);
  }

  static async deleteService(id: string, callerRole?: UserRole): Promise<{ success: boolean; message: string }> {
    const currentProfileStr = typeof localStorage !== 'undefined' ? localStorage.getItem('superwash_auth_profile') : null;
    let storedRole: UserRole | undefined;
    if (currentProfileStr) {
      try {
        const parsed = JSON.parse(currentProfileStr);
        storedRole = parsed?.role;
      } catch {}
    }
    const effectiveRole = callerRole || storedRole;
    if (effectiveRole && effectiveRole !== 'owner') {
      throw new Error(`Unauthorized: Only business owners can delete services from the catalogue. Current role: '${effectiveRole}'.`);
    }

    const services = await this.getServices(true);
    const item = services.find(s => s.id === id);
    if (!item) throw new Error('Service not found');

    // Referential integrity protection: check if any order references this service
    let orderCount = 0;
    if (isLiveMode) {
      try {
        const { data: referencedOrders, error } = await supabase
          .from('orders')
          .select('id, order_number')
          .or(`service_id.eq.${id},service_name.eq.${item.name}`)
          .limit(5);

        if (!error && referencedOrders && referencedOrders.length > 0) {
          orderCount = referencedOrders.length;
        }
      } catch (err) {
        console.warn('Referential check query fallback:', err);
      }
    }

    if (orderCount === 0) {
      // Also check local/cached orders
      const allOrders = await this.getOrders();
      const localRefs = allOrders.filter(
        o => o.service_id === id || (o.service_name && o.service_name.trim().toLowerCase() === item.name.trim().toLowerCase())
      );
      if (localRefs.length > 0) {
        orderCount = localRefs.length;
      }
    }

    if (orderCount > 0) {
      throw new Error(
        `Cannot delete service '${item.name}' because it is referenced by existing order(s). Deactivate the service instead so historical bills and audit trails are preserved.`
      );
    }

    if (isLiveMode) {
      const { error } = await supabase.from('services').delete().eq('id', id);
      if (error) {
        throw new Error(this.formatDatabaseError('delete service from database', error));
      }
    }

    const remaining = services.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(remaining));
    return { success: true, message: `Service '${item.name}' deleted successfully.` };
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

    const feedbackId = (existingIndex >= 0 && isUUID(existingList[existingIndex].id))
      ? existingList[existingIndex].id
      : generateUUID();

    const feedbackRecord: OrderFeedback = {
      id: feedbackId,
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

    if (isLiveMode && import.meta.env.MODE !== 'test') {
      try {
        const dbPayload: any = {
          order_id: feedbackRecord.order_id,
          customer_id: (feedbackRecord.customer_id && isUUID(feedbackRecord.customer_id)) ? feedbackRecord.customer_id : null,
          customer_name: feedbackRecord.customer_name,
          customer_phone: feedbackRecord.customer_phone,
          rating_overall: feedbackRecord.rating_overall,
          rating_pickup: feedbackRecord.rating_pickup ?? null,
          rating_washing: feedbackRecord.rating_washing ?? null,
          rating_delivery: feedbackRecord.rating_delivery ?? null,
          comment: feedbackRecord.comment ?? null,
          suggestions: feedbackRecord.suggestions ?? null,
          low_rating_reason: feedbackRecord.low_rating_reason ?? null,
          status: feedbackRecord.status || 'new',
          created_at: feedbackRecord.created_at,
          updated_at: feedbackRecord.updated_at
        };
        if (isUUID(feedbackRecord.id)) {
          dbPayload.id = feedbackRecord.id;
        }

        const { data: upserted, error } = await supabase
          .from('order_feedback')
          .upsert(dbPayload, { onConflict: 'order_id' })
          .select()
          .single();

        if (!error && upserted) {
          feedbackRecord.id = upserted.id;
        } else if (error) {
          console.warn('Supabase feedback save error:', error.message);
        }
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
    if (isLiveMode && import.meta.env.MODE !== 'test') {
      try {
        const { data, error } = await supabase
          .from('order_feedback')
          .select('*')
          .eq('order_id', orderId)
          .maybeSingle();
        if (!error && data) {
          return data;
        }
      } catch (e) {
        console.warn('Using local feedback for order:', e);
      }
    }
    const list: OrderFeedback[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.FEEDBACK) || '[]');
    return list.find(f => f.order_id === orderId) || null;
  }

  static async getFeedbackForCustomer(customerId: string): Promise<OrderFeedback[]> {
    if (isLiveMode && import.meta.env.MODE !== 'test') {
      try {
        const { data, error } = await supabase
          .from('order_feedback')
          .select('*')
          .eq('customer_id', customerId);
        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (e) {
        console.warn('Using local feedback for customer:', e);
      }
    }
    const list: OrderFeedback[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.FEEDBACK) || '[]');
    return list.filter(f => f.customer_id === customerId);
  }

  static async getAllFeedback(): Promise<OrderFeedback[]> {
    if (isLiveMode && import.meta.env.MODE !== 'test') {
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

    if (isLiveMode && import.meta.env.MODE !== 'test') {
      try {
        const updatePayload: any = {
          status: item.status,
          resolution_note: item.resolution_note || null,
          reviewed_by_name: item.reviewed_by || 'Authorized Staff',
          reviewed_at: item.reviewed_at,
          updated_at: item.updated_at
        };
        await supabase.from('order_feedback').update(updatePayload).eq('id', feedbackId);
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
