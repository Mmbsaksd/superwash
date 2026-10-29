import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PromotionalCarousel } from '../components/PromotionalCarousel';
import { CustomerOrderTracker } from '../components/CustomerOrderTracker';
import { CustomerTopNav } from '../components/CustomerTopNav';
import { CustomerBottomNav } from '../components/CustomerBottomNav';
import { CustomerHome } from '../pages/customer/CustomerHome';
import { AuthProvider } from '../context/AuthContext';
import { Order, Profile } from '../types';

describe('Customer UX Redesign — Promotional Carousel Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders promotional slides and allows manual previous/next navigation', () => {
    render(
      <MemoryRouter>
        <PromotionalCarousel />
      </MemoryRouter>
    );

    // Initial slide 1 headline
    expect(screen.getByText(/Fast Doorstep Pickup & Delivery/i)).toBeInTheDocument();

    // Click next button
    const nextBtn = screen.getByLabelText(/Next promotional banner/i);
    fireEvent.click(nextBtn);

    // Slide 2 headline
    expect(screen.getByText(/Flat ₹50 OFF on Your First Order/i)).toBeInTheDocument();

    // Click next button again
    fireEvent.click(nextBtn);
    expect(screen.getByText(/Save 10% on Every Laundry Batch/i)).toBeInTheDocument();

    // Click previous button
    const prevBtn = screen.getByLabelText(/Previous promotional banner/i);
    fireEvent.click(prevBtn);
    expect(screen.getByText(/Flat ₹50 OFF on Your First Order/i)).toBeInTheDocument();
  });

  it('navigates to specific slide when indicator dots are clicked', () => {
    render(
      <MemoryRouter>
        <PromotionalCarousel />
      </MemoryRouter>
    );

    const slide4Dot = screen.getByLabelText(/Go to slide 4/i);
    fireEvent.click(slide4Dot);
    expect(screen.getByText(/Steam Press & Gentle Fabric Care/i)).toBeInTheDocument();
  });

  it('supports touch swipe navigation (left swipe advances, right swipe retreats)', () => {
    render(
      <MemoryRouter>
        <PromotionalCarousel />
      </MemoryRouter>
    );

    const carousel = screen.getByRole('region', { name: /Promotional Offers & Highlights/i });

    // Swipe left (touchStart at 200, touchEnd at 50 -> delta -150)
    fireEvent.touchStart(carousel, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 50 }] });
    expect(screen.getByText(/Flat ₹50 OFF on Your First Order/i)).toBeInTheDocument();

    // Swipe right (touchStart at 50, touchEnd at 200 -> delta +150)
    fireEvent.touchStart(carousel, { touches: [{ clientX: 50 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 200 }] });
    expect(screen.getByText(/Fast Doorstep Pickup & Delivery/i)).toBeInTheDocument();
  });

  it('auto-rotates every 5 seconds and pauses on hover', () => {
    render(
      <MemoryRouter>
        <PromotionalCarousel />
      </MemoryRouter>
    );

    expect(screen.getByText(/Fast Doorstep Pickup & Delivery/i)).toBeInTheDocument();

    // Advance timer 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText(/Flat ₹50 OFF on Your First Order/i)).toBeInTheDocument();

    // Hover over carousel to pause
    const carousel = screen.getByRole('region', { name: /Promotional Offers & Highlights/i });
    fireEvent.mouseEnter(carousel);

    // Advance timer 10 seconds while paused
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    // Still on slide 2
    expect(screen.getByText(/Flat ₹50 OFF on Your First Order/i)).toBeInTheDocument();

    // Leave hover
    fireEvent.mouseLeave(carousel);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText(/Save 10% on Every Laundry Batch/i)).toBeInTheDocument();
  });
});

describe('Customer UX Redesign — Customer Order Tracker Component', () => {
  const baseOrder: Order = {
    id: 'ord-test-01',
    order_number: 'SW-8001',
    customer_id: 'cust-01',
    customer_name: 'Pooja Hegde',
    customer_phone: '9876543210',
    pickup_address: '102 Indiranagar 100ft Road, Bengaluru',
    pickup_pincode: '560038',
    pickup_date: '2026-10-30',
    pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
    order_status: 'booked',
    payment_status: 'pending',
    payment_method: 'cash',
    price_per_kg_paise: 7900,
    min_weight_kg: 3.0,
    delivery_charge_paise: 0,
    paid_amount_paise: 0,
    total_amount_paise: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  it('renders Stage 1 (Order Placed) as active for a newly booked order', () => {
    render(
      <MemoryRouter>
        <CustomerOrderTracker order={baseOrder} />
      </MemoryRouter>
    );

    expect(screen.getByText('Order Placed')).toBeInTheDocument();
    expect(screen.getByText('Pickup & Collection')).toBeInTheDocument();
    expect(screen.getByText('Washing & Care')).toBeInTheDocument();
    expect(screen.getByText('Steam Press & Packaging')).toBeInTheDocument();
    expect(screen.getByText('Out for Delivery')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();

    expect(screen.getByText(/Booked for 2026-10-30/i)).toBeInTheDocument();
  });

  it('renders Stage 2 (Pickup & Collection) with doorstep weight display', () => {
    const collectedOrder: Order = {
      ...baseOrder,
      order_status: 'collected',
      doorstep_scale_weight_kg: 3.5,
      delivery_charge_paise: 0,
      total_amount_paise: 27650
    };

    render(
      <MemoryRouter>
        <CustomerOrderTracker order={collectedOrder} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Collected • Weighed: 3.50 kg/i)).toBeInTheDocument();
  });

  it('renders Stage 3 (Washing & Care) when order status is washing', () => {
    const washingOrder: Order = {
      ...baseOrder,
      order_status: 'washing',
      doorstep_scale_weight_kg: 4.0,
      measured_weight: 4.0,
      total_amount_paise: 31600
    };

    render(
      <MemoryRouter>
        <CustomerOrderTracker order={washingOrder} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Hygienic wash cycle & antibacterial sanitization/i)).toBeInTheDocument();
  });

  it('renders Stage 5 (Out for Delivery) with assigned delivery courier name', () => {
    const outOrder: Order = {
      ...baseOrder,
      order_status: 'out_for_delivery',
      assigned_delivery_name: 'Ramesh Delivery',
      delivery_staff_id: 'staff-driver-01',
      total_amount_paise: 31600
    };

    render(
      <MemoryRouter>
        <CustomerOrderTracker order={outOrder} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Courier: Ramesh Delivery/i)).toBeInTheDocument();
  });

  it('renders Stage 6 (Delivered) with completion message', () => {
    const deliveredOrder: Order = {
      ...baseOrder,
      order_status: 'delivered',
      delivered_at: new Date().toISOString(),
      total_amount_paise: 31600,
      payment_status: 'paid'
    };

    render(
      <MemoryRouter>
        <CustomerOrderTracker order={deliveredOrder} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Safely delivered to your doorstep/i)).toBeInTheDocument();
  });

  it('renders clear cancellation notice when order is cancelled', () => {
    const cancelledOrder: Order = {
      ...baseOrder,
      order_status: 'cancelled',
      notes: 'Customer cancelled pickup'
    };

    render(
      <MemoryRouter>
        <CustomerOrderTracker order={cancelledOrder} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Pickup Order Cancelled/i)).toBeInTheDocument();
    expect(screen.getByText(/This order was cancelled/i)).toBeInTheDocument();
  });

  it('renders compact summary card variant for landing page', () => {
    render(
      <MemoryRouter>
        <CustomerOrderTracker order={baseOrder} variant="compact" />
      </MemoryRouter>
    );

    expect(screen.getByText(/Live Order Tracker/i)).toBeInTheDocument();
    expect(screen.getByText(/#SW-8001/i)).toBeInTheDocument();
    expect(screen.getByText(/View Details/i)).toBeInTheDocument();
  });
});

describe('Customer UX Redesign — Navigation Components', () => {
  it('renders CustomerTopNav with brand logo, links, and Book Pickup CTA', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <CustomerTopNav activeTab="home" />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByTitle('SuperWash Exprez Home')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Home$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My Orders/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My Profile/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Book a Home Pickup/i })).toBeInTheDocument();
  });

  it('renders CustomerBottomNav with fixed bottom menu items and active indicator', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <CustomerBottomNav activeTab="orders" hasActiveOrder={true} />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('My Orders')).toBeInTheDocument();
    expect(screen.getByText('Book Now')).toBeInTheDocument();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});

describe('Customer UX Redesign — 5-Step Sequential Booking Flow in CustomerHome', () => {
  const testCustomer: Profile = {
    id: '00000000-0000-4000-a000-000000000001',
    role: 'customer',
    full_name: 'Pooja Wizard Tester',
    phone: '9876543210',
    is_active: true,
    created_at: new Date().toISOString()
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('superwash_auth_profile', JSON.stringify(testCustomer));
  });

  it('guides customer sequentially through 5 steps with back/continue validation', async () => {
    render(
      <MemoryRouter initialEntries={['/customer?tab=book']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Verify initial render lands on Step 1 and services have loaded
    await waitFor(() => {
      expect(screen.getByText('Schedule Home Pickup')).toBeInTheDocument();
      expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
      expect(screen.getByText(/Select 3-Hour Time Window/i)).toBeInTheDocument();
      expect(screen.getByText(/Select Laundry Service\(s\)/i)).toBeInTheDocument();
    }, { timeout: 5000 });

    // Step 1: Click Continue to Contact Info
    const continueToContactBtn = screen.getByRole('button', { name: /Continue to Contact Info/i });
    expect(continueToContactBtn).toBeInTheDocument();
    fireEvent.click(continueToContactBtn);

    // Step 2: Contact info step should now be active
    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();
      expect(screen.getByText(/Step 2: Contact & Mobile Number/i)).toBeInTheDocument();
    }, { timeout: 4000 });

    // Step 2: Continue to address
    const continueToAddressBtn = screen.getByRole('button', { name: /Continue to Pickup Address/i });
    fireEvent.click(continueToAddressBtn);

    // Step 3: Pickup address
    await waitFor(() => {
      expect(screen.getByText(/Step 3 of 5/i)).toBeInTheDocument();
      expect(screen.getByText(/Step 3: Pickup Address/i)).toBeInTheDocument();
    }, { timeout: 4000 });

    // Step 3: Continue to review
    const continueToReviewBtn = screen.getByRole('button', { name: /Continue to Order Review/i });
    fireEvent.click(continueToReviewBtn);

    // Step 4: Review & coupon
    await waitFor(() => {
      expect(screen.getByText(/Step 4 of 5/i)).toBeInTheDocument();
      expect(screen.getByText(/Step 4: Review Booking Details/i)).toBeInTheDocument();
      expect(screen.getByText(/Scheduled Pickup/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Promotional Coupon/i).length).toBeGreaterThanOrEqual(1);
    }, { timeout: 4000 });

    // Step 4: Continue to payment
    const continueToPaymentBtn = screen.getByRole('button', { name: /Continue to Payment/i });
    fireEvent.click(continueToPaymentBtn);

    // Step 5: Payment & confirmation
    await waitFor(() => {
      expect(screen.getByText(/Step 5 of 5/i)).toBeInTheDocument();
      expect(screen.getByText(/Step 5: Payment Option/i)).toBeInTheDocument();
      expect(screen.getByText(/Zero Advance Charge/i)).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Confirm Pickup Booking/i }).length).toBeGreaterThanOrEqual(1);
    }, { timeout: 4000 });

    // Can navigate back from Step 5 to Step 4
    const backToReviewBtn = screen.getByRole('button', { name: /Back to Review/i });
    fireEvent.click(backToReviewBtn);

    await waitFor(() => {
      expect(screen.getByText(/Step 4 of 5/i)).toBeInTheDocument();
      expect(screen.getByText(/Step 4: Review Booking Details/i)).toBeInTheDocument();
    }, { timeout: 4000 });
  });
});
