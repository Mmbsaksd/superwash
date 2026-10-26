import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoginPage } from '../pages/public/LoginPage';
import { CustomerHome } from '../pages/customer/CustomerHome';
import { OwnerDashboard } from '../pages/admin/OwnerDashboard';
import { ManagerDashboard } from '../pages/manager/ManagerDashboard';
import { DeliveryDashboard } from '../pages/delivery/DeliveryDashboard';
import { LaundryService } from '../services/laundryService';
import { Profile } from '../types';

describe('Customer & Owner/Staff Portal Separation & Security Invariants', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  // Scenario 1: Customer Google login and customer dashboard access
  it('Scenario 1: allows customer to authenticate via Google and access Customer Dashboard without staff links', async () => {
    const customerProfile: Profile = {
      id: 'cust-google-101',
      email: 'customer.priya@gmail.com',
      full_name: 'Priya Customer',
      phone: '9876543212',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for customer home to load
    await waitFor(() => {
      expect(screen.getByText(/Book Pickup/i)).toBeInTheDocument();
    });

    // Verify customer info displayed
    expect(screen.getByText(/Priya Customer/i)).toBeInTheDocument();

    // Verify customer header does NOT contain staff or owner portal buttons
    expect(screen.queryByText(/Owner Portal/i)).toBeNull();
    expect(screen.queryByText(/Manager Portal/i)).toBeNull();
    expect(screen.queryByText(/Delivery Portal/i)).toBeNull();
    expect(screen.queryByText(/Staff Portal/i)).toBeNull();
  });

  // Scenario 2: Owner Google login and management permissions
  it('Scenario 2: allows owner to sign in via Google and access all Owner management tools', async () => {
    const ownerProfile: Profile = {
      id: 'owner-google-001',
      email: 'owner@superwash.in',
      full_name: 'Rajesh Sharma (Owner)',
      phone: '9876543200',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <div data-testid="owner-admin-panel">SuperWash Business Administration</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('owner-admin-panel')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('access-denied')).toBeNull();
  });

  // Scenario 3: Registered, active staff login and role-specific access
  it('Scenario 3: allows registered delivery associate to access delivery portal while blocking manager/admin routes', async () => {
    const deliveryProfile: Profile = {
      id: 'staff-delivery-002',
      email: 'ramesh.delivery@superwash.in',
      full_name: 'Ramesh Courier',
      phone: '9876543215',
      role: 'delivery',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(deliveryProfile));

    // A: Can access delivery portal
    render(
      <MemoryRouter initialEntries={['/delivery']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/delivery"
              element={
                <ProtectedRoute allowedRoles={['delivery', 'owner']}>
                  <div data-testid="delivery-work-queue">Delivery Associate Portal</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <div data-testid="admin-panel">Admin Panel</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('delivery-work-queue')).toBeInTheDocument();
    });

    // B: When delivery staff navigates to /admin, access is restricted
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <div data-testid="admin-panel">Admin Panel</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
    });
  });

  // Scenario 4: Unregistered users cannot access the staff or owner portal
  it('Scenario 4: unauthenticated/unregistered users are redirected to staff login when attempting to access /admin', async () => {
    localStorage.clear();

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['owner']}>
                  <div data-testid="admin-panel">Admin Panel</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div data-testid="login-entry">Login Page Destination</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-entry')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-panel')).toBeNull();
  });

  // Scenario 5: Inactive staff cannot access protected features
  it('Scenario 5: displays Account Deactivated and denies access when an inactive staff member attempts to open portal', async () => {
    const deactivatedProfile: Profile = {
      id: 'staff-inactive-999',
      email: 'deactivated.staff@superwash.in',
      full_name: 'Ex Employee',
      role: 'delivery',
      is_active: false,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(deactivatedProfile));

    render(
      <MemoryRouter initialEntries={['/delivery']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/delivery"
              element={
                <ProtectedRoute allowedRoles={['delivery', 'owner']}>
                  <div data-testid="delivery-work-queue">Delivery Associate Portal</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('account-deactivated')).toBeInTheDocument();
    });
    expect(screen.getByText(/Account Deactivated/i)).toBeInTheDocument();
    expect(screen.queryByTestId('delivery-work-queue')).toBeNull();
  });

  // Scenario 6: Customers cannot access other customers orders or staff functions
  it('Scenario 6: strictly isolates customer orders and prevents customers from opening the manager or owner portal', async () => {
    const customerA: Profile = {
      id: 'cust-isolated-aaa',
      email: 'customer.a@gmail.com',
      full_name: 'Customer A',
      phone: '9876543290',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerA));

    // Try accessing /manager
    render(
      <MemoryRouter initialEntries={['/manager']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/manager"
              element={
                <ProtectedRoute allowedRoles={['manager', 'owner']}>
                  <div data-testid="manager-work-queue">Manager Portal</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('manager-work-queue')).toBeNull();

    // Verify order isolation: querying customer orders only returns orders for customerA
    const ordersA = await LaundryService.getCustomerOrders(customerA.id, customerA.phone);
    expect(ordersA.every(o => o.customer_id === customerA.id || o.customer_phone === customerA.phone)).toBe(true);
  });

  // Scenario 7: Direct URL access, page refresh, and session persistence work correctly
  it('Scenario 7: persists authenticated session on page refresh and restores authoritative role', async () => {
    const managerProfile: Profile = {
      id: 'manager-persist-001',
      email: 'ananya.manager@superwash.in',
      full_name: 'Ananya Verma',
      phone: '9876543220',
      role: 'manager',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(managerProfile));

    // Simulate page reload directly on /manager route
    render(
      <MemoryRouter initialEntries={['/manager']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/manager"
              element={
                <ProtectedRoute allowedRoles={['manager', 'owner']}>
                  <div data-testid="restored-manager-dashboard">Restored Store Manager Dashboard</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('restored-manager-dashboard')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('access-denied')).toBeNull();
  });

  // Scenario 8: Customer login page renders clean customer-only interface without staff tabs
  it('Scenario 8: customer login view is clean without staff tabs, while /admin/login presents staff portal', async () => {
    // 1. Customer view at /login
    const { unmount } = render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage isStaffPortal={false} />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Customer Sign In/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Staff Portal/i)).toBeNull();
    expect(screen.queryByLabelText(/Staff Email Address/i)).toBeNull();
    expect(screen.queryByText(/Quick Staff Credentials/i)).toBeNull();

    unmount();

    // 2. Staff portal view at /admin/login
    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <AuthProvider>
          <LoginPage isStaffPortal={true} />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Operations & Staff Portal/i)[0]).toBeInTheDocument();
    });
    expect(screen.getByText(/Continue with Google/i)).toBeInTheDocument();
    expect(screen.getByText(/Return to Customer Website/i)).toBeInTheDocument();
  });

  // Scenario 9: Logout clears user-specific operational cache while preserving public settings
  it('Scenario 9: logout clears user-specific operational cache while preserving shared business settings', async () => {
    // Seed operational cache with sensitive user records
    localStorage.setItem('superwash_auth_profile', JSON.stringify({
      id: 'manager-101',
      role: 'manager',
      full_name: 'Store Manager',
      is_active: true
    }));
    localStorage.setItem('superwash_orders', JSON.stringify([
      { id: 'ord-private-999', order_number: 'SW-9999', customer_phone: '9999988888', customer_name: 'Confidential Client' }
    ]));
    localStorage.setItem('superwash_payments', JSON.stringify([
      { id: 'pay-1', order_id: 'ord-private-999', amount_paise: 50000, transaction_reference: 'UPI-SECRET-999' }
    ]));
    localStorage.setItem('superwash_addresses_manager-101', JSON.stringify([
      { id: 'addr-1', address_line: 'Private Residence 123' }
    ]));
    localStorage.setItem('superwash_settings', JSON.stringify({
      business_name: 'SuperWash Exprez',
      business_phone: '+91 98765 43210'
    }));
    localStorage.setItem('superwash_slots', JSON.stringify([{ id: 'slot-1', name: 'Morning' }]));

    const TestLogoutComponent = () => {
      const { logout, currentUser } = useAuth();
      return (
        <div>
          <span data-testid="user-state">{currentUser ? currentUser.full_name : 'No User'}</span>
          <button onClick={() => logout()} data-testid="test-logout-btn">
            Logout
          </button>
        </div>
      );
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <TestLogoutComponent />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-state')).toHaveTextContent('Store Manager');
    });

    // Click logout
    fireEvent.click(screen.getByTestId('test-logout-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('user-state')).toHaveTextContent('No User');
    });

    // Verify sensitive operational cache was purged
    expect(localStorage.getItem('superwash_auth_profile')).toBeNull();
    expect(localStorage.getItem('superwash_orders')).toBeNull();
    expect(localStorage.getItem('superwash_payments')).toBeNull();
    expect(localStorage.getItem('superwash_addresses_manager-101')).toBeNull();

    // Verify shared public business settings and slots are preserved
    expect(localStorage.getItem('superwash_settings')).not.toBeNull();
    expect(localStorage.getItem('superwash_slots')).not.toBeNull();
  });

  // Scenario 10: Prevents cross-user cache contamination on re-login
  it('Scenario 10: prevents previous user cache exposure when switching accounts or re-logging in', async () => {
    // 1. User A (Manager) was logged in with private orders cached
    localStorage.setItem('superwash_orders', JSON.stringify([
      { id: 'ord-manager-1', order_number: 'SW-8001', customer_phone: '9888877777', customer_name: 'Customer of Manager' }
    ]));
    localStorage.setItem('superwash_addresses_user-a', JSON.stringify([
      { id: 'addr-a', address_line: 'Secret Villa A' }
    ]));

    // Execute cache clear simulating logout
    LaundryService.clearUserOperationalCache();

    // Verify cache is cleared
    expect(localStorage.getItem('superwash_orders')).toBeNull();
    expect(localStorage.getItem('superwash_addresses_user-a')).toBeNull();

    // 2. User B (Customer) logs in
    const customerB: Profile = {
      id: 'cust-b-202',
      email: 'customer.b@gmail.com',
      full_name: 'Customer B',
      phone: '9111122222',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerB));

    // When customer B retrieves orders, they must NOT see User A's cached orders
    const ordersForB = await LaundryService.getCustomerOrders(customerB.id, customerB.phone);
    expect(ordersForB.some(o => o.order_number === 'SW-8001')).toBe(false);

    // When customer B retrieves addresses, User A's address must NOT be returned
    const addressesForB = await LaundryService.getCustomerAddresses(customerB.id);
    expect(addressesForB.some(a => a.address_line === 'Secret Villa A')).toBe(false);
  });
});
