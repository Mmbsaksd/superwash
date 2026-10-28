import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvoiceModal } from '../components/InvoiceModal';
import { Order, Profile, BusinessSettings } from '../types';

const mockSettings: BusinessSettings = {
  id: 'settings_01',
  business_name: 'SuperWash Exprez',
  business_phone: '+91 98765 43210',
  business_address: '123 Koramangala 4th Block, Bengaluru, KA 560103',
  price_per_kg_paise: 7900,
  min_weight_kg: 1.0,
  delivery_charge_paise: 0,
  upi_id: 'superwash@icici',
  allow_delivery_payment_recording: true,
  whatsapp_enabled: true,
  serviceable_pincodes: ['560001', '560038', '560103'],
  updated_at: new Date().toISOString()
};

const customerProfile: Profile = {
  id: 'cust_01',
  role: 'customer',
  full_name: 'Asha Sharma',
  phone: '9876543210',
  is_active: true,
  created_at: new Date().toISOString()
};

const otherCustomerProfile: Profile = {
  id: 'cust_99',
  role: 'customer',
  full_name: 'Intruder Bob',
  phone: '9999999999',
  is_active: true,
  created_at: new Date().toISOString()
};

const managerProfile: Profile = {
  id: 'mgr_01',
  role: 'manager',
  full_name: 'Ramesh StoreManager',
  phone: '9876543211',
  is_active: true,
  created_at: new Date().toISOString()
};

const courierProfile: Profile = {
  id: 'del_01',
  role: 'delivery',
  full_name: 'Suresh Courier',
  phone: '9876543212',
  is_active: true,
  created_at: new Date().toISOString()
};

describe('Invoice Audit, Visibility & Financial Integrity Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Access Control & Permission Enforcement', () => {
    const sampleOrder: Order = {
      id: 'ord_01',
      order_number: '1001',
      customer_id: 'cust_01',
      customer_name: 'Asha Sharma',
      customer_phone: '9876543210',
      pickup_address: 'Flat 402, Sunshine Apartments',
      pickup_pincode: '560103',
      pickup_date: '2026-11-01',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      order_status: 'booked',
      payment_status: 'pending',
      payment_method: 'upi_manual',
      min_weight_kg: 1.0,
      price_per_kg_paise: 7900,
      delivery_charge_paise: 0,
      paid_amount_paise: 0,
      created_at: '2026-10-27T10:00:00Z',
      updated_at: '2026-10-27T10:00:00Z'
    };

    it('allows the ordering customer to access their own invoice', () => {
      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={sampleOrder}
          settings={mockSettings}
          currentUser={customerProfile}
        />
      );

      expect(screen.getByText('Billed To (Customer)')).toBeDefined();
      expect(screen.getByText('Asha Sharma')).toBeDefined();
      expect(screen.queryByText('Access Restricted')).toBeNull();
    });

    it('blocks an unauthorized cross-customer from viewing another customer invoice', () => {
      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={sampleOrder}
          settings={mockSettings}
          currentUser={otherCustomerProfile}
        />
      );

      expect(screen.getByText('Access Restricted')).toBeDefined();
      expect(screen.getByText(/You do not have permission to access invoices for this order/i)).toBeDefined();
      expect(screen.queryByText('Billed To (Customer)')).toBeNull();
    });

    it('blocks unauthenticated visitors without a valid session from accessing invoices', () => {
      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={sampleOrder}
          settings={mockSettings}
          currentUser={null}
        />
      );

      expect(screen.getByText('Access Restricted')).toBeDefined();
      expect(screen.getByText(/You do not have permission to access invoices for this order/i)).toBeDefined();
      expect(screen.queryByText('Billed To (Customer)')).toBeNull();
    });

    it('permits store manager and store owner to inspect any customer invoice for operations', () => {
      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={sampleOrder}
          settings={mockSettings}
          currentUser={managerProfile}
        />
      );

      expect(screen.getByText('Billed To (Customer)')).toBeDefined();
      expect(screen.getByText('Asha Sharma')).toBeDefined();
      expect(screen.queryByText('Access Restricted')).toBeNull();
    });

    it('permits assigned delivery courier to view invoice but blocks unassigned courier', () => {
      const assignedOrder: Order = {
        ...sampleOrder,
        assigned_delivery_id: 'del_01',
        assigned_delivery_name: 'Suresh Courier'
      };

      const { rerender } = render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={assignedOrder}
          settings={mockSettings}
          currentUser={courierProfile}
        />
      );
      expect(screen.getByText('Asha Sharma')).toBeDefined();

      // Unassigned courier test
      const unassignedCourier: Profile = {
        ...courierProfile,
        id: 'del_99'
      };
      rerender(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={assignedOrder}
          settings={mockSettings}
          currentUser={unassignedCourier}
        />
      );
      expect(screen.getByText('Access Restricted')).toBeDefined();
    });
  });

  describe('2. Weighing Workflow: Pre-Weighing Pro-Forma vs Post-Weighing Official Bill', () => {
    it('marks a booked order prior to weighing as a preliminary pro-forma estimate', () => {
      const unweighedOrder: Order = {
        id: 'ord_02',
        order_number: '1002',
        customer_id: 'cust_01',
        customer_name: 'Asha Sharma',
        customer_phone: '9876543210',
        pickup_address: 'Flat 402, Sunshine Apartments',
        pickup_pincode: '560103',
        pickup_date: '2026-11-01',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        order_status: 'collected',
        payment_status: 'pending',
        payment_method: 'cash',
        min_weight_kg: 1.0,
        price_per_kg_paise: 7900,
        delivery_charge_paise: 0,
        paid_amount_paise: 0,
        pricing_unit: 'per_kg',
        measured_weight: null, // Pending scale weighing
        total_amount_paise: null,
        created_at: '2026-10-27T10:00:00Z',
        updated_at: '2026-10-27T10:00:00Z'
      };

      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={unweighedOrder}
          settings={mockSettings}
          currentUser={customerProfile}
        />
      );

      // Verify badges and warnings
      expect(screen.getByText('Pro-Forma Booking Estimate')).toBeDefined();
      expect(screen.getByText(/Pre-Weighing Estimate/i)).toBeDefined();
      expect(screen.getByText(/Estimated figures will be replaced with authoritative weights and final invoice upon store intake/i)).toBeDefined();
      expect(screen.getByText(/Est\. 1\.00 kg \(Min\.\)/i)).toBeDefined();
    });

    it('marks an order with confirmed digital scale measurements as an official retail bill & tax invoice', () => {
      const weighedOrder: Order = {
        id: 'ord_03',
        order_number: '1003',
        customer_id: 'cust_01',
        customer_name: 'Asha Sharma',
        customer_phone: '9876543210',
        pickup_address: 'Flat 402, Sunshine Apartments',
        pickup_pincode: '560103',
        pickup_date: '2026-11-01',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        order_status: 'washing',
        payment_status: 'pending',
        payment_method: 'upi_manual',
        min_weight_kg: 1.0,
        price_per_kg_paise: 7900,
        delivery_charge_paise: 0,
        paid_amount_paise: 0,
        pricing_unit: 'per_kg',
        measured_weight: 4.5,
        billable_weight: 4.5,
        total_amount_paise: 35550, // 4.5 * 7900 = 35550 paise (₹355.50)
        weighed_at: '2026-10-27T11:00:00Z',
        created_at: '2026-10-27T10:00:00Z',
        updated_at: '2026-10-27T11:00:00Z'
      };

      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={weighedOrder}
          settings={mockSettings}
          currentUser={customerProfile}
        />
      );

      expect(screen.getByText('Official Bill & Tax Invoice')).toBeDefined();
      expect(screen.getByText(/Official Tax & Retail Bill/i)).toBeDefined();
      expect(screen.getByText(/4\.50 kg \(Billable: 4\.50 kg\)/i)).toBeDefined();
      expect(screen.getAllByText('₹355.50').length).toBeGreaterThan(0);
    });
  });

  describe('3. Multi-Service Linked Booking Aggregation', () => {
    it('aggregates multiple linked orders in a batch into a unified invoice with separate line items', () => {
      const batchId = 'BATCH-M01';
      const order1: Order = {
        id: 'ord_10',
        order_number: '1010',
        customer_id: 'cust_01',
        customer_name: 'Asha Sharma',
        customer_phone: '9876543210',
        pickup_address: 'Flat 402, Sunshine Apartments',
        pickup_pincode: '560103',
        pickup_date: '2026-11-01',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        service_id: 'srv_wf',
        service_name: 'Wash & Fold (Normal)',
        pricing_unit: 'per_kg',
        price_per_kg_paise: 7900,
        min_weight_kg: 1.0,
        delivery_charge_paise: 0,
        paid_amount_paise: 0,
        payment_method: 'upi_manual',
        measured_weight: 3.0,
        billable_weight: 3.0,
        total_amount_paise: 18700, // 23700 - 5000 coupon = 18700
        discount_paise: 5000,
        coupon_code: 'WELCOME50',
        notes: `[Linked Batch ${batchId}: Service 1 of 2]`,
        order_status: 'ready_for_delivery',
        payment_status: 'pending',
        created_at: '2026-10-27T10:00:00Z',
        updated_at: '2026-10-27T11:00:00Z'
      };

      const order2: Order = {
        id: 'ord_11',
        order_number: '1011',
        customer_id: 'cust_01',
        customer_name: 'Asha Sharma',
        customer_phone: '9876543210',
        pickup_address: 'Flat 402, Sunshine Apartments',
        pickup_pincode: '560103',
        pickup_date: '2026-11-01',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        service_id: 'srv_dc',
        service_name: 'Premium Dry Clean',
        pricing_unit: 'per_piece',
        price_per_kg_paise: 15000,
        min_weight_kg: 1.0,
        delivery_charge_paise: 0,
        paid_amount_paise: 0,
        payment_method: 'upi_manual',
        measured_weight: 2.0,
        billable_weight: 2.0,
        total_amount_paise: 30000, // 2 pcs @ ₹150 = ₹300
        discount_paise: 0,
        notes: `[Linked Batch ${batchId}: Service 2 of 2]`,
        order_status: 'ready_for_delivery',
        payment_status: 'pending',
        created_at: '2026-10-27T10:00:00Z',
        updated_at: '2026-10-27T11:00:00Z'
      };

      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={order1}
          linkedOrders={[order1, order2]}
          settings={mockSettings}
          currentUser={customerProfile}
        />
      );

      // Verify batch header
      expect(screen.getByText(`#BILL-${batchId}`)).toBeDefined();
      expect(screen.getByText(/Linked Appointment:/i)).toBeDefined();
      expect(screen.getByText(/Batch BATCH-M01 \(2 Services\)/i)).toBeDefined();

      // Verify line items
      expect(screen.getByText('Wash & Fold (Normal)')).toBeDefined();
      expect(screen.getByText('Premium Dry Clean')).toBeDefined();
      expect(screen.getAllByText(/1010/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/1011/).length).toBeGreaterThan(0);

      // Verify subtotal, coupon deduction, and net total payable
      // Subtotal = 23700 + 30000 = 53700 paise (₹537.00)
      // Discount = 5000 paise (₹50.00)
      // Total Payable = 18700 + 30000 = 48700 paise (₹487.00)
      expect(screen.getByText('₹537.00')).toBeDefined();
      expect(screen.getByText('-₹50.00')).toBeDefined();
      expect(screen.getAllByText('₹487.00').length).toBeGreaterThan(0);
    });

    it('correctly handles cancelled linked service without inflating total payable', () => {
      const batchId = 'BATCH-C01';
      const order1: Order = {
        id: 'ord_20',
        order_number: '1020',
        customer_id: 'cust_01',
        customer_name: 'Asha Sharma',
        customer_phone: '9876543210',
        pickup_address: 'Flat 402, Sunshine Apartments',
        pickup_pincode: '560103',
        pickup_date: '2026-11-01',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        service_name: 'Wash & Fold (Normal)',
        price_per_kg_paise: 7900,
        min_weight_kg: 1.0,
        delivery_charge_paise: 0,
        paid_amount_paise: 0,
        payment_method: 'upi_manual',
        measured_weight: 2.0,
        total_amount_paise: 15800,
        discount_paise: 0,
        notes: `[Linked Batch ${batchId}: Service 1 of 2]`,
        order_status: 'washing',
        payment_status: 'pending',
        created_at: '2026-10-27T10:00:00Z',
        updated_at: '2026-10-27T11:00:00Z'
      };

      const order2Cancelled: Order = {
        id: 'ord_21',
        order_number: '1021',
        customer_id: 'cust_01',
        customer_name: 'Asha Sharma',
        customer_phone: '9876543210',
        pickup_address: 'Flat 402, Sunshine Apartments',
        pickup_pincode: '560103',
        pickup_date: '2026-11-01',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        service_name: 'Express Ironing',
        price_per_kg_paise: 9900,
        min_weight_kg: 1.0,
        delivery_charge_paise: 0,
        paid_amount_paise: 0,
        payment_method: 'cash',
        measured_weight: null,
        total_amount_paise: null,
        notes: `[Linked Batch ${batchId}: Service 2 of 2]`,
        order_status: 'cancelled',
        cancellation_reason: 'Customer requested cancellation of ironing',
        payment_status: 'pending',
        created_at: '2026-10-27T10:00:00Z',
        updated_at: '2026-10-27T10:30:00Z'
      };

      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={order1}
          linkedOrders={[order1, order2Cancelled]}
          settings={mockSettings}
          currentUser={customerProfile}
        />
      );

      // Verify line 2 shows Cancelled
      expect(screen.getByText(/Cancelled: Customer requested cancellation/i)).toBeDefined();
      expect(screen.getAllByText('₹0.00').length).toBeGreaterThan(0);

      // Only order 1 contributes to total payable
      expect(screen.getAllByText('₹158.00').length).toBeGreaterThan(0);
    });
  });

  describe('4. Payment State & Balance Reconciliation', () => {
    it('accurately reconciles paid amounts and displays remaining balance due', () => {
      const partiallyPaidOrder: Order = {
        id: 'ord_30',
        order_number: '1030',
        customer_id: 'cust_01',
        customer_name: 'Asha Sharma',
        customer_phone: '9876543210',
        pickup_address: 'Flat 402, Sunshine Apartments',
        pickup_pincode: '560103',
        pickup_date: '2026-11-01',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        service_name: 'Wash & Fold',
        price_per_kg_paise: 7900,
        min_weight_kg: 1.0,
        delivery_charge_paise: 0,
        payment_method: 'upi_manual',
        measured_weight: 5.0,
        total_amount_paise: 39500, // ₹395.00
        paid_amount_paise: 20000,  // ₹200.00 advance paid
        order_status: 'ready_for_delivery',
        payment_status: 'partially_paid',
        created_at: '2026-10-27T10:00:00Z',
        updated_at: '2026-10-27T11:00:00Z'
      };

      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={partiallyPaidOrder}
          settings={mockSettings}
          currentUser={customerProfile}
        />
      );

      expect(screen.getAllByText('₹395.00').length).toBeGreaterThan(0);
      expect(screen.getByText('₹200.00')).toBeDefined(); // Amount Paid
      expect(screen.getByText('₹195.00')).toBeDefined(); // Balance Due
    });
  });

  describe('5. Print and PDF Export Trigger', () => {
    it('triggers window.print when user clicks Print / Save PDF button', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      const sampleOrder: Order = {
        id: 'ord_40',
        order_number: '1040',
        customer_id: 'cust_01',
        customer_name: 'Asha Sharma',
        customer_phone: '9876543210',
        pickup_address: 'Flat 402, Sunshine Apartments',
        pickup_pincode: '560103',
        pickup_date: '2026-11-01',
        pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
        order_status: 'booked',
        payment_status: 'pending',
        payment_method: 'cash',
        min_weight_kg: 1.0,
        price_per_kg_paise: 7900,
        delivery_charge_paise: 0,
        paid_amount_paise: 0,
        created_at: '2026-10-27T10:00:00Z',
        updated_at: '2026-10-27T10:00:00Z'
      };

      render(
        <InvoiceModal
          isOpen={true}
          onClose={() => {}}
          order={sampleOrder}
          settings={mockSettings}
          currentUser={customerProfile}
        />
      );

      const printBtn = screen.getByTestId('print-invoice-btn');
      fireEvent.click(printBtn);

      expect(printSpy).toHaveBeenCalledTimes(1);
    });
  });
});
