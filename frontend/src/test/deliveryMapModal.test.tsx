import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeliveryMapModal } from '../components/DeliveryMapModal';
import { Order } from '../types';

describe('DeliveryMapModal Component', () => {
  const mockOrderWithCoords: Order = {
    id: 'ord-101',
    order_number: 'SW-101',
    customer_id: 'cust-1',
    customer_name: 'Ananya Sharma',
    customer_phone: '9876543210',
    pickup_address: 'Flat 301, Lakeview Apartments, HSR Layout Sector 1',
    pickup_landmark: 'Near Agara Lake',
    pickup_pincode: '560102',
    pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
    pickup_date: '2026-11-04',
    pickup_latitude: 12.912345,
    pickup_longitude: 77.645678,
    order_status: 'pickup_assigned',
    payment_status: 'pending',
    payment_method: 'cash',
    price_per_kg_paise: 7900,
    min_weight_kg: 1,
    delivery_charge_paise: 0,
    paid_amount_paise: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const mockOrderWithoutCoords: Order = {
    id: 'ord-102',
    order_number: 'SW-102',
    customer_id: 'cust-2',
    customer_name: 'Rahul Varma',
    customer_phone: '9876543211',
    pickup_address: '12th Cross, Indiranagar',
    pickup_pincode: '560038',
    pickup_slot: 'Evening (04:00 PM - 07:00 PM)',
    pickup_date: '2026-11-04',
    pickup_latitude: null,
    pickup_longitude: null,
    order_status: 'pickup_assigned',
    payment_status: 'pending',
    payment_method: 'cash',
    price_per_kg_paise: 7900,
    min_weight_kg: 1,
    delivery_charge_paise: 0,
    paid_amount_paise: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  it('renders modal with exact coordinates and navigation button when coordinates exist', () => {
    const onClose = vi.fn();

    render(
      <DeliveryMapModal
        isOpen={true}
        onClose={onClose}
        order={mockOrderWithCoords}
      />
    );

    expect(screen.getByTestId('delivery-map-modal')).toBeInTheDocument();
    expect(screen.getByText('Doorstep Location Pin')).toBeInTheDocument();
    expect(screen.getByText(/#SW-101/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Ananya Sharma/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/12.912345, 77.645678/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Flat 301, Lakeview Apartments/i).length).toBeGreaterThanOrEqual(1);

    const navBtn = screen.getByRole('link', { name: /Start GPS Navigation/i });
    expect(navBtn).toBeInTheDocument();
    expect(navBtn.getAttribute('href')).toContain('https://www.google.com/maps/dir/?api=1&destination=12.912345,77.645678&travelmode=driving');

    const callBtn = screen.getByRole('link', { name: /Call Customer/i });
    expect(callBtn.getAttribute('href')).toBe('tel:9876543210');

    const closeBtn = screen.getByTitle('Close Preview');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders text address fallback warning when coordinates are null', () => {
    const onClose = vi.fn();

    render(
      <DeliveryMapModal
        isOpen={true}
        onClose={onClose}
        order={mockOrderWithoutCoords}
      />
    );

    expect(screen.getByTestId('delivery-map-modal')).toBeInTheDocument();
    expect(screen.getByText(/No Precise GPS Coordinates/i)).toBeInTheDocument();
    expect(screen.getByText(/Text Address Only/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Search in Google Maps/i })).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const onClose = vi.fn();

    render(
      <DeliveryMapModal
        isOpen={false}
        onClose={onClose}
        order={mockOrderWithCoords}
      />
    );

    expect(screen.queryByTestId('delivery-map-modal')).not.toBeInTheDocument();
  });
});
