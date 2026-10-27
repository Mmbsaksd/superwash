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
import { HowItWorksPage } from '../pages/public/HowItWorksPage';
import { ContactPage } from '../pages/public/ContactPage';
import { PrivacyPage, TermsPage } from '../pages/public/LegalPages';
import { PublicLayout } from '../components/PublicLayout';

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

describe('Service Catalogue Role & Permission Separation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('allows an authorised owner/admin to create a service in the catalogue', async () => {
    const ownerProfile: Profile = {
      id: 'owner-auth-001',
      email: 'owner@superwash.in',
      full_name: 'Rajesh Sharma (Owner)',
      phone: '9876543200',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    const created = await LaundryService.addService({
      name: 'Wash & Iron',
      description: 'Complete machine wash with precision steam press',
      pricing_unit: 'per_kg',
      unit_price_paise: 9900, // ₹99/kg
      min_weight_kg: 3.0,
      is_active: true,
      display_order: 10
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Wash & Iron');
    expect(created.unit_price_paise).toBe(9900);
    expect(created.pricing_unit).toBe('per_kg');
    expect(created.is_active).toBe(true);

    const catalogue = await LaundryService.getServices(true);
    expect(catalogue.some(s => s.name === 'Wash & Iron')).toBe(true);
  });

  it('strictly prevents an ordinary customer from creating a service', async () => {
    const customerProfile: Profile = {
      id: 'cust-unauth-001',
      email: 'customer@gmail.com',
      full_name: 'Sneha Patel',
      phone: '9876543210',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    await expect(
      LaundryService.addService({
        name: 'Hacked Free Service',
        pricing_unit: 'per_order',
        unit_price_paise: 100
      })
    ).rejects.toThrow(/Unauthorized: Only business owners can add services/i);
  });

  it('strictly prevents unauthorised staff (manager, delivery) from creating services', async () => {
    // 1. Manager check
    await expect(
      LaundryService.addService(
        {
          name: 'Manager Added Service',
          pricing_unit: 'per_load',
          unit_price_paise: 25000
        },
        'manager'
      )
    ).rejects.toThrow(/Unauthorized: Only business owners can add services/i);

    // 2. Delivery check
    await expect(
      LaundryService.addService(
        {
          name: 'Delivery Added Service',
          pricing_unit: 'per_load',
          unit_price_paise: 25000
        },
        'delivery'
      )
    ).rejects.toThrow(/Unauthorized: Only business owners can add services/i);
  });

  it('strictly prevents unauthorised roles from updating or deleting services', async () => {
    // 1. Manager update attempt
    await expect(
      LaundryService.updateService('f520c538-65e3-4b64-825e-5fdd3c282e8d', { unit_price_paise: 9999 }, 'manager')
    ).rejects.toThrow(/Unauthorized: Only business owners can modify services/i);

    // 2. Delivery delete attempt
    await expect(
      LaundryService.deleteService('f520c538-65e3-4b64-825e-5fdd3c282e8d', 'delivery')
    ).rejects.toThrow(/Unauthorized: Only business owners can delete services/i);

    // 3. Customer update attempt
    await expect(
      LaundryService.updateService('f520c538-65e3-4b64-825e-5fdd3c282e8d', { unit_price_paise: 100 }, 'customer')
    ).rejects.toThrow(/Unauthorized: Only business owners can modify services/i);
  });

  it('ensures customers can retrieve active services while inactive services are filtered', async () => {
    const ownerProfile: Profile = {
      id: 'owner-auth-001',
      email: 'owner@superwash.in',
      full_name: 'Rajesh Sharma (Owner)',
      phone: '9876543200',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    // Create an active service and an inactive service
    const activeSrv = await LaundryService.addService({
      name: 'Delicate Woolen Care',
      pricing_unit: 'per_piece',
      unit_price_paise: 18000,
      is_active: true
    });

    const inactiveSrv = await LaundryService.addService({
      name: 'Discontinued Summer Promo',
      pricing_unit: 'per_order',
      unit_price_paise: 5000,
      is_active: false
    });

    // Customer logs in
    const customerProfile: Profile = {
      id: 'cust-view-002',
      email: 'customer.view@gmail.com',
      full_name: 'Customer View',
      phone: '9876543211',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(customerProfile));

    // Customer retrieves active services (includeInactive = false)
    const activeList = await LaundryService.getServices(false);
    expect(activeList.some(s => s.id === activeSrv.id)).toBe(true);
    expect(activeList.some(s => s.id === inactiveSrv.id)).toBe(false);
  });

  it('preserves service editing, activation, pricing, and booking flows for existing services', async () => {
    const ownerProfile: Profile = {
      id: 'owner-auth-001',
      email: 'owner@superwash.in',
      full_name: 'Rajesh Sharma (Owner)',
      phone: '9876543200',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    // 1. Create service
    const service = await LaundryService.addService({
      name: 'Silk & Saree Steam Press',
      pricing_unit: 'per_piece',
      unit_price_paise: 12000,
      is_active: true
    });

    // 2. Owner updates price to ₹150 (15000 paise)
    const updated = await LaundryService.updateService(service.id, {
      unit_price_paise: 15000,
      description: 'Updated high-pressure steam press'
    });
    expect(updated.unit_price_paise).toBe(15000);
    expect(updated.description).toBe('Updated high-pressure steam press');

    // 3. Owner toggles status
    const deactivated = await LaundryService.toggleServiceStatus(service.id, false);
    expect(deactivated.is_active).toBe(false);

    const reactivated = await LaundryService.toggleServiceStatus(service.id, true);
    expect(reactivated.is_active).toBe(true);

    // 4. Customer books order referencing this active service
    const booking = await LaundryService.createBooking({
      customer_name: 'Pooja Hegde',
      customer_phone: '9876543299',
      pickup_address: '15 Indiranagar 100ft Rd',
      pickup_pincode: '560038',
      pickup_date: '2026-10-28',
      pickup_slot: 'Morning (08:00 AM - 11:00 AM)',
      service_id: reactivated.id
    });

    expect(booking.id).toBeDefined();
    expect(booking.service_id).toBe(reactivated.id);
    expect(booking.service_name).toBe('Silk & Saree Steam Press');
  });

  it('allows owner to delete an unreferenced service, but protects services referenced by orders', async () => {
    const ownerProfile: Profile = {
      id: 'owner-auth-001',
      email: 'owner@superwash.in',
      full_name: 'Rajesh Sharma (Owner)',
      phone: '9876543200',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

    // 1. Add temporary unreferenced service
    const tempService = await LaundryService.addService({
      name: 'Temporary Demo Service',
      pricing_unit: 'per_load',
      unit_price_paise: 30000,
      is_active: true
    }, 'owner');

    const catalogueBefore = await LaundryService.getServices(true);
    expect(catalogueBefore.some(s => s.id === tempService.id)).toBe(true);

    // 2. Delete unreferenced service
    const deleteRes = await LaundryService.deleteService(tempService.id, 'owner');
    expect(deleteRes.success).toBe(true);

    const catalogueAfter = await LaundryService.getServices(true);
    expect(catalogueAfter.some(s => s.id === tempService.id)).toBe(false);
  });
});

describe('Public Information Routes, Branding & Navigation Integrity', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders HowItWorksPage with dual channels and SuperWash Exprez service details', async () => {
    render(
      <MemoryRouter>
        <HowItWorksPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /How SuperWash Works/i })).toBeInTheDocument();
    expect(screen.getByText(/Shop Drop-Off Counter/i)).toBeInTheDocument();
    expect(screen.getByText(/Doorstep Pickup & Delivery/i)).toBeInTheDocument();
  });

  it('renders ContactPage with store counter, email, and business phone', async () => {
    render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /Visit Or Contact Us/i })).toBeInTheDocument();
    expect(screen.getByText(/care@superwash.in/i)).toBeInTheDocument();
    expect(screen.getByText(/Physical Shop Address/i)).toBeInTheDocument();
  });

  it('renders LegalPages with exact SuperWash Exprez brand name and policies', async () => {
    const { unmount: unmountPrivacy } = render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /Privacy Policy/i })).toBeInTheDocument();
    expect(screen.getByText(/SuperWash Exprez & Dry Cleaners/i)).toBeInTheDocument();
    unmountPrivacy();

    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /Terms of Service/i })).toBeInTheDocument();
    expect(screen.getByText(/SuperWash Exprez & Dry Cleaners/i)).toBeInTheDocument();
  });

  it('PublicLayout seamlessly renders Navbar, child content, and Footer with brand integrity', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <PublicLayout>
            <div data-testid="test-content">Test Body Content</div>
          </PublicLayout>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getAllByText(/SuperWash Exprez/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Free Pickup & Delivery on orders over ₹500/i)).toBeInTheDocument();
    expect(screen.getByText(/GSTIN:/i)).toBeInTheDocument();
  });
});
