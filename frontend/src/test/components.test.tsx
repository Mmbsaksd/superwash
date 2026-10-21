import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import { Navbar } from '../components/Navbar';
import { AuthProvider } from '../context/AuthContext';
import { Order } from '../types';
import { OrderTimeline } from '../components/OrderTimeline';

describe('Status & Payment Badges', () => {
  it('renders order status badges properly', () => {
    render(<StatusBadge status="clothes_received" />);
    expect(screen.getByText(/Clothes Received/i)).toBeInTheDocument();

    render(<StatusBadge status="washing_drycleaning" />);
    expect(screen.getByText(/Washing \/ Dry Cleaning/i)).toBeInTheDocument();

    render(<StatusBadge status="delivered_collected" />);
    expect(screen.getByText(/Delivered \/ Collected/i)).toBeInTheDocument();
  });

  it('renders payment status badges properly', () => {
    render(<PaymentBadge status="paid" />);
    expect(screen.getByText(/Paid in Full/i)).toBeInTheDocument();

    render(<PaymentBadge status="partially_paid" />);
    expect(screen.getByText(/Partially Paid/i)).toBeInTheDocument();

    render(<PaymentBadge status="pending" />);
    expect(screen.getByText(/Payment Pending/i)).toBeInTheDocument();
  });
});

describe('Navbar Brand Header', () => {
  it('renders SuperWash brand and navigation links', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Navbar />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText(/Super/i)).toBeInTheDocument();
    expect(screen.getByText(/Wash/i)).toBeInTheDocument();
    expect(screen.getByText(/Services & Pricing/i)).toBeInTheDocument();
    expect(screen.getByText(/Track Order/i)).toBeInTheDocument();
  });
});

describe('OrderTimeline Component', () => {
  const mockOrder: Order = {
    id: 'test-123',
    order_number: 'SW-2026-1001',
    customer_name: 'Priya Sharma',
    customer_phone: '9876543210',
    handover_method: 'shop_dropoff',
    status: 'clothes_received',
    subtotal_paise: 9000,
    discount_paise: 0,
    delivery_fee_paise: 0,
    tax_paise: 1620,
    total_paise: 10620,
    paid_paise: 5000,
    outstanding_paise: 5620,
    payment_status: 'partially_paid',
    payment_method: 'cash',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [],
    status_history: [
      {
        id: 'hist-1',
        order_id: 'test-123',
        new_status: 'clothes_received',
        notes: 'Intake at shop counter',
        created_at: new Date().toISOString(),
      }
    ],
    inspections: [],
    payments: [],
    refunds: [],
    logistics_tasks: []
  };

  it('renders workflow progression stages', () => {
    render(<OrderTimeline order={mockOrder} />);
    expect(screen.getByText(/Order Placed/i)).toBeInTheDocument();
    expect(screen.getByText(/Clothes Received/i)).toBeInTheDocument();
    expect(screen.getByText(/Inspection & Tagging/i)).toBeInTheDocument();
    expect(screen.getByText(/Intake at shop counter/i)).toBeInTheDocument();
  });
});
