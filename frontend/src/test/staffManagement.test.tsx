import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import * as AuthContextModule from '../context/AuthContext';
import { OwnerDashboard } from '../pages/admin/OwnerDashboard';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LaundryService, DEMO_PROFILES } from '../services/laundryService';
import { supabase } from '../services/supabase';
import { Profile } from '../types';

describe('Staff Management Enhancements (Edit, Toggle Status, Search & Filter)', () => {
  const getSeedStaff = (): Profile[] => [
    {
      id: 'staff-owner-1',
      email: 'owner@superwash.in',
      phone: '9876543210',
      full_name: 'Rajesh Sharma',
      role: 'owner',
      is_active: true,
      created_at: '2026-10-20T10:00:00Z'
    },
    {
      id: 'staff-manager-1',
      email: 'manager@superwash.in',
      phone: '9876543211',
      full_name: 'Ananya Verma',
      role: 'manager',
      is_active: true,
      created_at: '2026-10-21T10:00:00Z'
    },
    {
      id: 'staff-delivery-1',
      email: 'ramesh@superwash.in',
      phone: '9876543215',
      full_name: 'Ramesh Kumar',
      role: 'delivery',
      is_active: true,
      created_at: '2026-10-22T10:00:00Z'
    },
    {
      id: 'staff-delivery-2',
      email: 'suresh.superwash.express@gmail.com',
      phone: '9876543216',
      full_name: 'Suresh Kumar',
      role: 'delivery',
      is_active: false, // inactive for filtering test
      created_at: '2026-10-22T11:00:00Z'
    }
  ];

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    window.alert = vi.fn();

    // Reset demo staff directory
    localStorage.setItem('superwash_profiles', JSON.stringify(getSeedStaff()));
  });

  describe('1. Edit Employee Details Business Logic', () => {
    it('successfully updates employee full name, phone, and operational role', async () => {
      const updated = await LaundryService.updateStaffProfile('staff-delivery-1', {
        full_name: 'Ramesh K. Senior',
        phone: '9876543299',
        role: 'manager'
      });

      expect(updated.full_name).toBe('Ramesh K. Senior');
      expect(updated.phone).toBe('9876543299');
      expect(updated.role).toBe('manager');

      // Verify persistence after re-querying directory
      const freshList = await LaundryService.getStaffProfiles(true);
      const reloaded = freshList.find(s => s.id === 'staff-delivery-1');
      expect(reloaded?.full_name).toBe('Ramesh K. Senior');
      expect(reloaded?.phone).toBe('9876543299');
      expect(reloaded?.role).toBe('manager');
    });

    it('rejects names shorter than 2 characters and invalid phone numbers', async () => {
      await expect(
        LaundryService.updateStaffProfile('staff-delivery-1', {
          full_name: 'A',
          phone: '9876543215',
          role: 'delivery'
        })
      ).rejects.toThrow(/at least 2 characters/i);

      await expect(
        LaundryService.updateStaffProfile('staff-delivery-1', {
          full_name: 'Ramesh Kumar',
          phone: '12345', // < 10 digits
          role: 'delivery'
        })
      ).rejects.toThrow(/10-digit Indian phone number/i);
    });

    it('prevents duplicate phone numbers assigned to other employees', async () => {
      // Trying to assign manager's phone '9876543211' to Ramesh
      await expect(
        LaundryService.updateStaffProfile('staff-delivery-1', {
          full_name: 'Ramesh Kumar',
          phone: '9876543211',
          role: 'delivery'
        })
      ).rejects.toThrow(/already registered/i);
    });

    it('prevents demoting the last active business owner', async () => {
      await expect(
        LaundryService.updateStaffProfile('staff-owner-1', {
          full_name: 'Rajesh Sharma',
          phone: '9876543210',
          role: 'delivery' // Attempting to demote sole owner
        })
      ).rejects.toThrow(/Cannot demote the last active business owner/i);
    });

    it('prevents an owner from demoting their own account role', async () => {
      await expect(
        LaundryService.updateStaffProfile(
          'staff-owner-1',
          {
            full_name: 'Rajesh Sharma',
            phone: '9876543210',
            role: 'manager'
          },
          'staff-owner-1' // callerId is the same owner
        )
      ).rejects.toThrow(/Business owners cannot demote their own account role/i);
    });
  });

  describe('2. Activate & Deactivate Employees Logic & Safety', () => {
    it('deactivates an active employee and persists inactive state', async () => {
      const deactivated = await LaundryService.toggleStaffStatus('staff-delivery-1', false);
      expect(deactivated?.is_active).toBe(false);

      const freshList = await LaundryService.getStaffProfiles(true);
      const reloaded = freshList.find(s => s.id === 'staff-delivery-1');
      expect(reloaded?.is_active).toBe(false);
    });

    it('reactivates a deactivated employee and restores active state', async () => {
      // Suresh was seeded as inactive
      const reactivated = await LaundryService.toggleStaffStatus('staff-delivery-2', true);
      expect(reactivated?.is_active).toBe(true);

      const freshList = await LaundryService.getStaffProfiles(true);
      const reloaded = freshList.find(s => s.id === 'staff-delivery-2');
      expect(reloaded?.is_active).toBe(true);
      expect(reloaded?.role).toBe('delivery');
    });

    it('prevents an owner from deactivating their own account', async () => {
      await expect(
        LaundryService.toggleStaffStatus('staff-owner-1', false, 'staff-owner-1')
      ).rejects.toThrow(/You cannot deactivate your own owner account/i);
    });

    it('prevents deactivating the last active owner in the system', async () => {
      await expect(
        LaundryService.toggleStaffStatus('staff-owner-1', false, 'other-caller')
      ).rejects.toThrow(/Cannot deactivate the last active business owner/i);
    });

    it('blocks deactivated staff from accessing protected portals in ProtectedRoute', async () => {
      const inactiveStaffProfile: Profile = {
        id: 'staff-delivery-inactive',
        email: 'inactive@superwash.in',
        phone: '9876543290',
        full_name: 'Inactive Courier',
        role: 'delivery',
        is_active: false,
        created_at: '2026-10-21T00:00:00Z'
      };

      // Mock useAuth to return an inactive logged-in profile
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: { id: 'staff-delivery-inactive', email: 'inactive@superwash.in' } as any,
        currentUser: inactiveStaffProfile,
        isLoading: false,
        needsPhonePrompt: false,
        sendOtp: vi.fn(),
        verifyOtp: vi.fn(),
        signInWithPassword: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
        resetPassword: vi.fn(),
        updateProfile: vi.fn(),
        signInWithGoogle: vi.fn(),
        logout: vi.fn(),
        switchDemoRole: vi.fn(),
        isCustomer: false,
        isDelivery: true,
        isManager: false,
        isOwner: false,
        isStaff: true
      });

      render(
        <MemoryRouter initialEntries={['/delivery']}>
          <Routes>
            <Route
              path="/delivery"
              element={
                <ProtectedRoute allowedRoles={['delivery']}>
                  <div data-testid="delivery-dashboard-content">Confidential Orders</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      // Protected route must block dashboard and render account deactivated barrier
      expect(screen.getByTestId('account-deactivated')).toBeInTheDocument();
      expect(screen.getByText(/Account Deactivated/i)).toBeInTheDocument();
      expect(screen.queryByTestId('delivery-dashboard-content')).not.toBeInTheDocument();

      // Clean up spy so following tests use real AuthContext
      vi.restoreAllMocks();
    });

    it('denies sign-in when account is inactive', async () => {
      // Mock Supabase sign-in to return Suresh's auth user
      vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
        data: {
          user: {
            id: 'staff-delivery-2',
            email: 'suresh.superwash.express@gmail.com'
          } as any,
          session: {} as any
        },
        error: null
      });

      vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null });

      // Mock profile fetch to return inactive profile
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'staff-delivery-2',
                email: 'suresh.superwash.express@gmail.com',
                full_name: 'Suresh Kumar',
                role: 'delivery',
                is_active: false
              },
              error: null
            })
          })
        })
      } as any);

      // Also set demo profile inactive for demo-mode test branch
      const sureshDemo = DEMO_PROFILES.find(p => p.email === 'suresh.superwash.express@gmail.com');
      if (sureshDemo) sureshDemo.is_active = false;

      const TestConsumer = () => {
        const { signInWithPassword } = useAuth();
        const [errMsg, setErrMsg] = React.useState('');

        return (
          <div>
            <button
              onClick={async () => {
                const res = await signInWithPassword('suresh.superwash.express@gmail.com', 'password123');
                if (!res?.success && res?.message) setErrMsg(res.message);
              }}
            >
              Sign In Suresh
            </button>
            <div data-testid="login-error">{errMsg}</div>
          </div>
        );
      };

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      fireEvent.click(screen.getByText('Sign In Suresh'));

      await waitFor(() => {
        expect(screen.getByTestId('login-error').textContent).toContain('account has been deactivated');
      });

      // Restore suresh demo status
      if (sureshDemo) sureshDemo.is_active = true;
    });
  });

  describe('3. Owner Dashboard Staff Directory UI: Search, Filters & Edit Modals', () => {
    beforeEach(() => {
      localStorage.setItem('superwash_profiles', JSON.stringify(getSeedStaff()));
      const ownerProfile: Profile = {
        id: 'staff-owner-1',
        email: 'owner@superwash.in',
        phone: '9876543210',
        full_name: 'Rajesh Sharma',
        role: 'owner',
        is_active: true,
        created_at: '2026-10-20T10:00:00Z'
      };
      localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));
    });

    it('filters staff directory by search query across name, email, and phone', async () => {
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <OwnerDashboard />
          </AuthProvider>
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /staff accounts/i }));

      expect(await screen.findByText('Ananya Verma')).toBeInTheDocument();
      expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument();
      expect(screen.getByText('Suresh Kumar')).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText(/search staff by name, email, or phone/i);

      // 1. Search by name
      fireEvent.change(searchInput, { target: { value: 'Ananya' } });
      expect(screen.getByText('Ananya Verma')).toBeInTheDocument();
      expect(screen.queryByText('Ramesh Kumar')).not.toBeInTheDocument();

      // 2. Search by phone
      fireEvent.change(searchInput, { target: { value: '9876543215' } });
      expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument();
      expect(screen.queryByText('Ananya Verma')).not.toBeInTheDocument();

      // 3. Search by email
      fireEvent.change(searchInput, { target: { value: 'suresh' } });
      expect(screen.getByText('Suresh Kumar')).toBeInTheDocument();
      expect(screen.queryByText('Ramesh Kumar')).not.toBeInTheDocument();
    });

    it('filters staff by role and active/inactive status and combines with search', async () => {
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <OwnerDashboard />
          </AuthProvider>
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /staff accounts/i }));
      await screen.findByText('Ananya Verma');

      const roleFilter = screen.getByLabelText(/filter staff by operational role/i);
      const statusFilter = screen.getByLabelText(/filter staff by active status/i);

      // Filter: Store Manager role
      fireEvent.change(roleFilter, { target: { value: 'manager' } });
      expect(screen.getByText('Ananya Verma')).toBeInTheDocument();
      expect(screen.queryByText('Ramesh Kumar')).not.toBeInTheDocument();
      expect(screen.queryByText('Suresh Kumar')).not.toBeInTheDocument();

      // Filter: Delivery Person role
      fireEvent.change(roleFilter, { target: { value: 'delivery' } });
      expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument();
      expect(screen.getByText('Suresh Kumar')).toBeInTheDocument();
      expect(screen.queryByText('Ananya Verma')).not.toBeInTheDocument();

      // Combined with Inactive status filter
      fireEvent.change(statusFilter, { target: { value: 'inactive' } });
      expect(screen.getByText('Suresh Kumar')).toBeInTheDocument();
      expect(screen.queryByText('Ramesh Kumar')).not.toBeInTheDocument(); // active delivery

      // Reset filters button
      const resetBtn = screen.getByRole('button', { name: /reset filters/i });
      fireEvent.click(resetBtn);

      expect(screen.getByText('Ananya Verma')).toBeInTheDocument();
      expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument();
      expect(screen.getByText('Suresh Kumar')).toBeInTheDocument();
    });

    it('renders empty state when search finds no match and allows clearing filters', async () => {
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <OwnerDashboard />
          </AuthProvider>
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /staff accounts/i }));
      await screen.findByText('Ananya Verma');

      const searchInput = screen.getByPlaceholderText(/search staff by name, email, or phone/i);
      fireEvent.change(searchInput, { target: { value: 'NonexistentPerson' } });

      expect(screen.getByText(/no staff members found/i)).toBeInTheDocument();

      const clearBtn = screen.getByRole('button', { name: /clear search & filters/i });
      fireEvent.click(clearBtn);

      expect(screen.getByText('Ananya Verma')).toBeInTheDocument();
    });

    it('opens edit modal, validates inputs, confirms role change, and saves updates', async () => {
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <OwnerDashboard />
          </AuthProvider>
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /staff accounts/i }));
      await screen.findByText('Ramesh Kumar');

      // Click Edit button on Ramesh's card
      const rameshCard = screen.getByText('Ramesh Kumar').closest('.bg-white') as HTMLElement;
      const editBtn = within(rameshCard).getByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtn);

      expect(await screen.findByText(/edit employee details/i)).toBeInTheDocument();
      const nameInput = screen.getByLabelText(/full name/i);
      const phoneInput = screen.getByLabelText(/phone number/i);
      const roleSelect = document.getElementById('edit-staff-role') as HTMLSelectElement;

      // Verify email is present and marked read only
      expect(screen.getAllByText('ramesh@superwash.in').length).toBeGreaterThan(0);
      expect(screen.getByText(/Read Only/i)).toBeInTheDocument();

      // Change role from delivery to manager
      fireEvent.change(nameInput, { target: { value: 'Ramesh K. Lead' } });
      fireEvent.change(phoneInput, { target: { value: '9876543288' } });
      fireEvent.change(roleSelect, { target: { value: 'manager' } });

      // Role change requires confirmation check
      expect(await screen.findByText(/Role Change Confirmation Required/i)).toBeInTheDocument();
      const saveBtn = screen.getByRole('button', { name: /save changes/i });
      expect(saveBtn).toBeDisabled();

      // Check confirmation checkbox
      const confirmCheck = screen.getByLabelText(/confirm this role transition/i);
      fireEvent.click(confirmCheck);
      expect(saveBtn).not.toBeDisabled();

      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText(/successfully updated employee details/i)).toBeInTheDocument();
        expect(screen.getByText('Ramesh K. Lead')).toBeInTheDocument();
      });
    });

    it('opens confirmation modal before deactivating an employee and confirms', async () => {
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <OwnerDashboard />
          </AuthProvider>
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /staff accounts/i }));
      await screen.findByText('Ananya Verma');

      // Find the toggle button on Ananya's card (currently Active)
      const ananyaCard = screen.getByText('Ananya Verma').closest('.bg-white') as HTMLElement;
      const ananyaActiveBtn = within(ananyaCard).getByRole('button', { name: /^active$/i });
      fireEvent.click(ananyaActiveBtn);

      // Confirmation modal should open
      expect(await screen.findByText(/Deactivate Employee Account\?/i)).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to deactivate/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /confirm deactivation/i })).toBeInTheDocument();

      // Confirm deactivation
      fireEvent.click(screen.getByRole('button', { name: /confirm deactivation/i }));

      await waitFor(() => {
        expect(screen.getByText(/successfully deactivated ananya verma/i)).toBeInTheDocument();
      });
    });
  });

  describe('4. Staff Account Deletion & Security Authorization Audit', () => {
    it('successfully deletes an eligible demo staff member without order assignments', async () => {
      // Add a disposable staff member
      const disposableStaff: Profile = {
        id: 'disposable-staff-99',
        email: 'disposable@superwash.in',
        phone: '9876543999',
        full_name: 'Temporary Assistant',
        role: 'delivery',
        is_active: true,
        created_at: new Date().toISOString()
      };
      const existing = await LaundryService.getStaffProfiles(true);
      localStorage.setItem('superwash_profiles', JSON.stringify([...existing, disposableStaff]));

      const res = await LaundryService.deleteStaffProfile(
        'disposable-staff-99',
        'staff-owner-1',
        'owner'
      );

      expect(res.success).toBe(true);
      expect(res.deactivatedInstead).toBe(false);
      expect(res.message).toMatch(/successfully deleted/i);

      // Verify profile is removed from directory
      const fresh = await LaundryService.getStaffProfiles(true);
      expect(fresh.find(p => p.id === 'disposable-staff-99')).toBeUndefined();

      // Verify unrelated staff profiles remain intact
      expect(fresh.find(p => p.id === 'staff-delivery-1')).toBeDefined();
      expect(fresh.find(p => p.id === 'staff-manager-1')).toBeDefined();
      expect(fresh.find(p => p.id === 'staff-owner-1')).toBeDefined();
    });

    it('safely deactivates staff with historical order assignments instead of deleting to protect audit history', async () => {
      // Seed an order assigned to Ramesh (staff-delivery-1)
      const testOrder = {
        id: 'ord-hist-audit-1',
        order_number: 'SW-9901',
        customer_phone: '9876543210',
        customer_name: 'Audit Customer',
        assigned_delivery_id: 'staff-delivery-1',
        order_status: 'delivered',
        created_at: new Date().toISOString()
      };
      localStorage.setItem('superwash_orders', JSON.stringify([testOrder]));

      const res = await LaundryService.deleteStaffProfile(
        'staff-delivery-1',
        'staff-owner-1',
        'owner'
      );

      expect(res.success).toBe(true);
      expect(res.deactivatedInstead).toBe(true);
      expect(res.message).toMatch(/safely deactivated instead of deleted/i);

      // Profile must still exist to satisfy foreign key and audit history, but is_active = false
      const fresh = await LaundryService.getStaffProfiles(true);
      const ramesh = fresh.find(p => p.id === 'staff-delivery-1');
      expect(ramesh).toBeDefined();
      expect(ramesh?.is_active).toBe(false);

      // Historical order still retains assigned_delivery_id intact
      const orders = await LaundryService.getOrders();
      const preservedOrder = orders.find(o => o.id === 'ord-hist-audit-1');
      expect(preservedOrder?.assigned_delivery_id).toBe('staff-delivery-1');
    });

    it('strictly prevents the authenticated owner from deleting their own account', async () => {
      await expect(
        LaundryService.deleteStaffProfile(
          'staff-owner-1',
          'staff-owner-1', // callerId === staffId
          'owner'
        )
      ).rejects.toThrow(/cannot delete your own authenticated owner account/i);
    });

    it('strictly prevents deleting the permanent primary owner account (superwashexprez@gmail.com)', async () => {
      const primaryOwner: Profile = {
        id: 'primary-owner-perm',
        email: 'superwashexprez@gmail.com',
        phone: '9876543000',
        full_name: 'SuperWash Primary Owner',
        role: 'owner',
        is_active: true,
        created_at: new Date().toISOString()
      };
      const existing = await LaundryService.getStaffProfiles(true);
      localStorage.setItem('superwash_profiles', JSON.stringify([...existing, primaryOwner]));

      await expect(
        LaundryService.deleteStaffProfile(
          'primary-owner-perm',
          'staff-owner-1',
          'owner'
        )
      ).rejects.toThrow(/permanent primary owner account \(superwashexprez@gmail.com\) cannot be deleted/i);
    });

    it('strictly prevents deleting the last active business owner account', async () => {
      // Remove all owners except staff-owner-1
      const onlyOneOwnerStaff = getSeedStaff().filter(p => p.role !== 'owner' || p.id === 'staff-owner-1');
      localStorage.setItem('superwash_profiles', JSON.stringify(onlyOneOwnerStaff));

      await expect(
        LaundryService.deleteStaffProfile(
          'staff-owner-1',
          'different-caller-id',
          'owner'
        )
      ).rejects.toThrow(/cannot delete the last remaining active business owner/i);
    });

    it('strictly rejects non-owner roles (manager, delivery, customer) from deleting staff', async () => {
      // Manager attempt
      await expect(
        LaundryService.deleteStaffProfile(
          'staff-delivery-1',
          'staff-manager-1',
          'manager' // unauthorized role
        )
      ).rejects.toThrow(/access denied.*only the business owner is authorized/i);

      // Delivery attempt
      await expect(
        LaundryService.deleteStaffProfile(
          'staff-delivery-1',
          'staff-delivery-1',
          'delivery' // unauthorized role
        )
      ).rejects.toThrow(/access denied.*only the business owner is authorized/i);

      // Customer attempt
      await expect(
        LaundryService.deleteStaffProfile(
          'staff-delivery-1',
          'cust-101',
          'customer' // unauthorized role
        )
      ).rejects.toThrow(/access denied.*only the business owner is authorized/i);
    });

    it('strictly rejects non-owner roles from editing staff details or updating active status', async () => {
      // Manager attempting to edit staff
      await expect(
        LaundryService.updateStaffProfile(
          'staff-delivery-1',
          { full_name: 'Unauthorized Change', phone: '9876543215', role: 'delivery' },
          'staff-manager-1',
          'manager'
        )
      ).rejects.toThrow(/access denied.*only the business owner is authorized/i);

      // Delivery attempting to toggle active status
      await expect(
        LaundryService.toggleStaffStatus(
          'staff-delivery-1',
          false,
          'staff-delivery-1',
          'delivery'
        )
      ).rejects.toThrow(/access denied.*only the business owner is authorized/i);
    });

    it('cancelling the delete confirmation modal makes zero modifications to staff records', async () => {
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <OwnerDashboard />
          </AuthProvider>
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /staff accounts/i }));
      await screen.findByText('Ramesh Kumar');

      // Click Delete button on Ramesh's card
      const rameshCard = screen.getByText('Ramesh Kumar').closest('.bg-white') as HTMLElement;
      const deleteBtn = within(rameshCard).getByRole('button', { name: /delete/i });
      fireEvent.click(deleteBtn);

      // Confirmation modal should open
      expect(await screen.findByText(/Delete Employee Account\?/i)).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();

      // Click Cancel button in modal
      const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
      fireEvent.click(cancelBtn);

      // Modal closes, Ramesh remains in directory
      await waitFor(() => {
        expect(screen.queryByText(/Delete Employee Account\?/i)).not.toBeInTheDocument();
      });
      expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument();
    });

    it('confirming delete in the UI modal removes the employee and updates the directory view', async () => {
      // Add a clean temporary staff member without orders
      const tempStaff: Profile = {
        id: 'staff-temp-delete-test',
        email: 'temp.clean@superwash.in',
        phone: '9876543555',
        full_name: 'Temp Delete Candidate',
        role: 'delivery',
        is_active: true,
        created_at: new Date().toISOString()
      };
      const existing = await LaundryService.getStaffProfiles(true);
      localStorage.setItem('superwash_profiles', JSON.stringify([...existing, tempStaff]));

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <OwnerDashboard />
          </AuthProvider>
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /staff accounts/i }));
      await screen.findByText('Temp Delete Candidate');

      // Find Temp Candidate card and click Delete
      const tempCard = screen.getByText('Temp Delete Candidate').closest('.bg-white') as HTMLElement;
      const deleteBtn = within(tempCard).getByRole('button', { name: /delete/i });
      fireEvent.click(deleteBtn);

      // Confirm modal opens
      expect(await screen.findByText(/Delete Employee Account\?/i)).toBeInTheDocument();
      const confirmDeleteBtn = screen.getByRole('button', { name: /confirm delete/i });
      fireEvent.click(confirmDeleteBtn);

      // Modal closes, success notice shown, candidate removed from DOM
      await waitFor(() => {
        expect(screen.getByText(/has been successfully deleted/i)).toBeInTheDocument();
      });
      expect(screen.queryByText('Temp Delete Candidate')).not.toBeInTheDocument();
    });

    it('displays clear deactivation notice and updates employee status when staff has historical orders', async () => {
      // Seed a staff member with an assigned historical order
      const assignedStaff: Profile = {
        id: 'staff-with-orders-1',
        full_name: 'Assigned Courier Staff',
        email: 'assigned.courier@superwash.in',
        phone: '9876543099',
        role: 'delivery',
        is_active: true,
        created_at: new Date().toISOString()
      };
      const testOrder = {
        id: 'ord-hist-assigned-1',
        order_number: 'SW-8801',
        customer_phone: '9876543210',
        customer_name: 'Test Customer',
        assigned_delivery_id: 'staff-with-orders-1',
        order_status: 'delivered',
        created_at: new Date().toISOString()
      };
      const existing = await LaundryService.getStaffProfiles(true);
      localStorage.setItem('superwash_profiles', JSON.stringify([...existing, assignedStaff]));
      localStorage.setItem('superwash_orders', JSON.stringify([testOrder]));

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <OwnerDashboard />
          </AuthProvider>
        </MemoryRouter>
      );

      fireEvent.click(await screen.findByRole('button', { name: /staff accounts/i }));
      await screen.findByText('Assigned Courier Staff');

      // Click Delete on Assigned Staff
      const card = screen.getByText('Assigned Courier Staff').closest('.bg-white') as HTMLElement;
      const deleteBtn = within(card).getByRole('button', { name: /delete/i });
      fireEvent.click(deleteBtn);

      // Confirm modal opens
      expect(await screen.findByText(/Delete Employee Account\?/i)).toBeInTheDocument();
      const confirmDeleteBtn = screen.getByRole('button', { name: /confirm delete/i });
      fireEvent.click(confirmDeleteBtn);

      // Modal closes, deactivation notice shown, staff remains in directory as Inactive
      await waitFor(() => {
        expect(screen.getByText(/safely deactivated instead of deleted/i)).toBeInTheDocument();
      });
      expect(screen.getByText('Assigned Courier Staff')).toBeInTheDocument();

      // Check status badge is Inactive
      const updatedProfiles = await LaundryService.getStaffProfiles(true);
      const target = updatedProfiles.find(p => p.id === 'staff-with-orders-1');
      expect(target?.is_active).toBe(false);
    });
  });
});
