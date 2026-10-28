import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InvoiceModal } from '../components/InvoiceModal';
import { Order, BusinessSettings, Profile } from '../types';
import '../index.css';

const mockSettings: BusinessSettings = {
  id: 'settings_01',
  business_name: 'SuperWash Exprez',
  business_phone: '+91 98765 43210',
  business_address: 'Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038',
  price_per_kg_paise: 7900,
  min_weight_kg: 3.0,
  delivery_charge_paise: 0,
  upi_id: 'superwash@icici',
  allow_delivery_payment_recording: true,
  whatsapp_enabled: true,
  serviceable_pincodes: ['560001', '560038', '560103']
};

const authorizedCustomer: Profile = {
  id: 'cust_01',
  role: 'customer',
  full_name: 'Asha Sharma',
  phone: '9876543210',
  is_active: true,
  created_at: '2026-10-27T10:00:00Z'
};

// Scenario 1: Pre-weighing estimate (unweighed order)
const scenario1Order: Order = {
  id: 'ord_s1',
  order_number: '1001',
  customer_id: 'cust_01',
  customer_name: 'Asha Sharma',
  customer_phone: '9876543210',
  pickup_address: 'Flat 402, Sunshine Apartments, 12th Cross',
  pickup_landmark: 'Near BDA Complex',
  pickup_pincode: '560103',
  pickup_date: '2026-11-01',
  pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
  service_name: 'Wash & Fold (Normal)',
  pricing_unit: 'per_kg',
  price_per_kg_paise: 7900,
  min_weight_kg: 3.0,
  delivery_charge_paise: 0,
  paid_amount_paise: 0,
  payment_method: 'cash',
  order_status: 'collected',
  payment_status: 'pending',
  measured_weight: null,
  total_amount_paise: null,
  created_at: '2026-10-27T09:30:00Z',
  updated_at: '2026-10-27T10:00:00Z'
};

// Scenario 2: Post-weighing official bill (single service weighed)
const scenario2Order: Order = {
  id: 'ord_s2',
  order_number: '1002',
  customer_id: 'cust_01',
  customer_name: 'Asha Sharma',
  customer_phone: '9876543210',
  pickup_address: 'Flat 402, Sunshine Apartments, 12th Cross',
  pickup_landmark: 'Near BDA Complex',
  pickup_pincode: '560103',
  pickup_date: '2026-11-01',
  pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
  service_name: 'Wash & Fold (Normal)',
  pricing_unit: 'per_kg',
  price_per_kg_paise: 7900,
  min_weight_kg: 1.0,
  delivery_charge_paise: 0,
  paid_amount_paise: 0,
  payment_method: 'upi_manual',
  order_status: 'washing',
  payment_status: 'pending',
  measured_weight: 4.5,
  billable_weight: 4.5,
  total_amount_paise: 35550, // 4.5 * 79 = ₹355.50
  weighed_at: '2026-10-27T11:15:00Z',
  created_at: '2026-10-27T09:30:00Z',
  updated_at: '2026-10-27T11:15:00Z'
};

// Scenario 3: Single-service invoice with minimum weight enforcement
const scenario3Order: Order = {
  id: 'ord_s3',
  order_number: '1003',
  customer_id: 'cust_01',
  customer_name: 'Asha Sharma',
  customer_phone: '9876543210',
  pickup_address: 'Flat 402, Sunshine Apartments, 12th Cross',
  pickup_pincode: '560103',
  pickup_date: '2026-11-01',
  pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
  service_name: 'Wash & Fold (Normal)',
  pricing_unit: 'per_kg',
  price_per_kg_paise: 7900,
  min_weight_kg: 3.0,
  delivery_charge_paise: 0,
  paid_amount_paise: 0,
  payment_method: 'cash',
  order_status: 'ready_for_delivery',
  payment_status: 'pending',
  measured_weight: 2.1, // Below 3.0 min
  billable_weight: 3.0,
  total_amount_paise: 23700, // 3.0 * 79 = ₹237.00
  weighed_at: '2026-10-27T11:30:00Z',
  created_at: '2026-10-27T09:30:00Z',
  updated_at: '2026-10-27T11:30:00Z'
};

// Scenario 4: Multi-service invoice with different service types & applicable units
const batchId4 = 'BATCH-M04';
const scenario4Order1: Order = {
  id: 'ord_s4_1',
  order_number: '1004',
  customer_id: 'cust_01',
  customer_name: 'Asha Sharma',
  customer_phone: '9876543210',
  pickup_address: 'Flat 402, Sunshine Apartments, 12th Cross',
  pickup_pincode: '560103',
  pickup_date: '2026-11-01',
  pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
  service_name: 'Wash & Fold (Normal)',
  pricing_unit: 'per_kg',
  price_per_kg_paise: 7900,
  min_weight_kg: 1.0,
  delivery_charge_paise: 0,
  paid_amount_paise: 0,
  payment_method: 'upi_manual',
  order_status: 'ready_for_delivery',
  payment_status: 'pending',
  measured_weight: 3.5,
  billable_weight: 3.5,
  total_amount_paise: 27650, // 3.5 * 79 = ₹276.50
  notes: `[Linked Batch ${batchId4}: Service 1 of 3]`,
  weighed_at: '2026-10-27T11:00:00Z',
  created_at: '2026-10-27T09:30:00Z',
  updated_at: '2026-10-27T11:00:00Z'
};
const scenario4Order2: Order = {
  ...scenario4Order1,
  id: 'ord_s4_2',
  order_number: '1005',
  service_name: 'Steam Press & Ironing',
  pricing_unit: 'per_piece',
  price_per_kg_paise: 2500, // ₹25/pc
  min_weight_kg: 1.0,
  measured_weight: 4.0, // 4 pcs
  billable_weight: 4.0,
  total_amount_paise: 10000, // 4 * 25 = ₹100.00
  notes: `[Linked Batch ${batchId4}: Service 2 of 3]`
};
const scenario4Order3: Order = {
  ...scenario4Order1,
  id: 'ord_s4_3',
  order_number: '1006',
  service_name: 'Heavy Comforter & Blanket',
  pricing_unit: 'per_piece',
  price_per_kg_paise: 25000, // ₹250/item
  min_weight_kg: 1.0,
  measured_weight: 1.0, // 1 item
  billable_weight: 1.0,
  total_amount_paise: 25000, // 1 * 250 = ₹250.00
  notes: `[Linked Batch ${batchId4}: Service 3 of 3]`
};

// Scenario 5: Multi-service invoice with coupon applied once
const batchId5 = 'BATCH-C05';
const scenario5Order1: Order = {
  id: 'ord_s5_1',
  order_number: '1007',
  customer_id: 'cust_01',
  customer_name: 'Asha Sharma',
  customer_phone: '9876543210',
  pickup_address: 'Flat 402, Sunshine Apartments, 12th Cross',
  pickup_pincode: '560103',
  pickup_date: '2026-11-01',
  pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
  service_name: 'Wash & Fold (Normal)',
  pricing_unit: 'per_kg',
  price_per_kg_paise: 7900,
  min_weight_kg: 1.0,
  delivery_charge_paise: 0,
  paid_amount_paise: 0,
  payment_method: 'upi_manual',
  order_status: 'ready_for_delivery',
  payment_status: 'pending',
  measured_weight: 3.0,
  billable_weight: 3.0,
  total_amount_paise: 18700, // 23700 - 5000 coupon = ₹187.00
  discount_paise: 5000,
  coupon_code: 'WELCOME50',
  notes: `[Linked Batch ${batchId5}: Service 1 of 2]`,
  weighed_at: '2026-10-27T11:00:00Z',
  created_at: '2026-10-27T09:30:00Z',
  updated_at: '2026-10-27T11:00:00Z'
};
const scenario5Order2: Order = {
  ...scenario5Order1,
  id: 'ord_s5_2',
  order_number: '1008',
  service_name: 'Steam Press & Ironing',
  pricing_unit: 'per_piece',
  price_per_kg_paise: 2500,
  discount_paise: 0,
  coupon_code: null,
  measured_weight: 3.0,
  billable_weight: 3.0,
  total_amount_paise: 7500, // 3 * 25 = ₹75.00
  notes: `[Linked Batch ${batchId5}: Service 2 of 2]`
};

// Scenario 6: Invoice with cancelled service
const batchId6 = 'BATCH-X06';
const scenario6Order1: Order = {
  id: 'ord_s6_1',
  order_number: '1009',
  customer_id: 'cust_01',
  customer_name: 'Asha Sharma',
  customer_phone: '9876543210',
  pickup_address: 'Flat 402, Sunshine Apartments, 12th Cross',
  pickup_pincode: '560103',
  pickup_date: '2026-11-01',
  pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
  service_name: 'Wash & Fold (Normal)',
  pricing_unit: 'per_kg',
  price_per_kg_paise: 7900,
  min_weight_kg: 1.0,
  delivery_charge_paise: 0,
  paid_amount_paise: 0,
  payment_method: 'upi_manual',
  order_status: 'ready_for_delivery',
  payment_status: 'pending',
  measured_weight: 2.5,
  billable_weight: 2.5,
  total_amount_paise: 19750, // 2.5 * 79 = ₹197.50
  notes: `[Linked Batch ${batchId6}: Service 1 of 2]`,
  weighed_at: '2026-10-27T11:00:00Z',
  created_at: '2026-10-27T09:30:00Z',
  updated_at: '2026-10-27T11:00:00Z'
};
const scenario6Order2: Order = {
  ...scenario6Order1,
  id: 'ord_s6_2',
  order_number: '1010',
  service_name: 'Steam Press & Ironing',
  pricing_unit: 'per_piece',
  price_per_kg_paise: 2500,
  measured_weight: null,
  total_amount_paise: null,
  order_status: 'cancelled',
  cancellation_reason: 'Customer cancelled ironing request',
  notes: `[Linked Batch ${batchId6}: Service 2 of 2]`
};

// Scenario 7: Invoice with partial payment and outstanding balance
const scenario7Order: Order = {
  id: 'ord_s7',
  order_number: '1011',
  customer_id: 'cust_01',
  customer_name: 'Asha Sharma',
  customer_phone: '9876543210',
  pickup_address: 'Flat 402, Sunshine Apartments, 12th Cross',
  pickup_pincode: '560103',
  pickup_date: '2026-11-01',
  pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
  service_name: 'Wash & Fold (Normal)',
  pricing_unit: 'per_kg',
  price_per_kg_paise: 7900,
  min_weight_kg: 1.0,
  delivery_charge_paise: 0,
  payment_method: 'upi_manual',
  order_status: 'ready_for_delivery',
  payment_status: 'partially_paid',
  measured_weight: 5.0,
  billable_weight: 5.0,
  total_amount_paise: 39500, // ₹395.00
  paid_amount_paise: 20000,  // ₹200.00
  weighed_at: '2026-10-27T11:00:00Z',
  created_at: '2026-10-27T09:30:00Z',
  updated_at: '2026-10-27T11:00:00Z'
};

const scenarios = [
  { id: 1, title: '1. Pre-Weighing Estimate', order: scenario1Order, linked: [scenario1Order] },
  { id: 2, title: '2. Post-Weighing Official Bill', order: scenario2Order, linked: [scenario2Order] },
  { id: 3, title: '3. Single-Service (Min Weight)', order: scenario3Order, linked: [scenario3Order] },
  { id: 4, title: '4. Multi-Service (3 Distinct Types)', order: scenario4Order1, linked: [scenario4Order1, scenario4Order2, scenario4Order3] },
  { id: 5, title: '5. Multi-Service + Coupon (-₹50)', order: scenario5Order1, linked: [scenario5Order1, scenario5Order2] },
  { id: 6, title: '6. Cancelled Service (₹0.00)', order: scenario6Order1, linked: [scenario6Order1, scenario6Order2] },
  { id: 7, title: '7. Partial Payment & Balance', order: scenario7Order, linked: [scenario7Order] },
];

export const InvoicePreviewApp: React.FC = () => {
  const [activeScenarioId, setActiveScenarioId] = useState<number>(1);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(true);

  const current = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans p-4">
      {/* Test Harness Navigation Header */}
      <header className="max-w-6xl mx-auto mb-4 bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-700">
          <div>
            <h1 className="text-base font-black text-white flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-brand-600 text-xs uppercase tracking-wider font-mono">Stage 1B</span>
              SuperWash Exprez — Invoice UI Verification Harness
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Isolated local rendering harness using verified realistic fixtures. Zero database writes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer"
            >
              Open Invoice Modal
            </button>
            <span className="text-xs font-mono text-slate-400">
              Scenario {activeScenarioId}/7
            </span>
          </div>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-3">
          {scenarios.map((sc) => {
            const isActive = sc.id === activeScenarioId;
            return (
              <button
                key={sc.id}
                onClick={() => {
                  setActiveScenarioId(sc.id);
                  setIsModalOpen(true);
                }}
                className={`py-2 px-2.5 rounded-xl text-left text-xs font-bold transition flex flex-col justify-between cursor-pointer border ${
                  isActive
                    ? 'bg-brand-600 text-white border-brand-400 shadow-md ring-2 ring-brand-400/30'
                    : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300 border-slate-600'
                }`}
                data-testid={`scenario-btn-${sc.id}`}
              >
                <span className="truncate">{sc.title}</span>
                <span className="text-[10px] font-mono opacity-75 mt-0.5">
                  #{sc.order.order_number}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Rendered Invoice Modal Component */}
      <InvoiceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        order={current.order}
        linkedOrders={current.linked}
        settings={mockSettings}
        currentUser={authorizedCustomer}
      />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<InvoicePreviewApp />);
