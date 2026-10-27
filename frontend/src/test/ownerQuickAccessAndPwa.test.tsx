import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { OwnerDashboard } from '../pages/admin/OwnerDashboard';
import { PwaInstallPrompt } from '../components/PwaInstallPrompt';
import { LaundryService } from '../services/laundryService';
import { Profile } from '../types';
import { supabase } from '../services/supabase';

describe('Owner Quick Access, Secure Logout, and PWA Installation Improvements', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // ==========================================
  // Task 1: Owner Dashboard Quick Access
  // ==========================================
  describe('Task 1: Owner Dashboard Layout & Route Security', () => {
    const ownerProfile: Profile = {
      id: '00000000-0000-4000-a000-000000000001',
      email: 'owner@superwash.in',
      phone: '9876543210',
      full_name: 'Rajesh Sharma (Owner)',
      role: 'owner',
      is_active: true,
      created_at: new Date().toISOString()
    };

    it('confirms the three-card portal navigation section is completely removed and staff directory is immediately visible', async () => {
      localStorage.setItem('superwash_auth_profile', JSON.stringify(ownerProfile));

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <OwnerDashboard />
          </AuthProvider>
        </MemoryRouter>
      );

      // Verify the three-card portal section is completely gone
      await waitFor(() => {
        expect(screen.queryByRole('region', { name: /quick access/i })).toBeNull();
      });
      expect(screen.queryByLabelText(/Admin Portal/i)).toBeNull();
      expect(screen.queryByLabelText(/Store Manager/i)).toBeNull();
      expect(screen.queryByLabelText(/Delivery Portal/i)).toBeNull();

      // Verify Staff Directory is immediately visible without scrolling
      expect(screen.getByText(/Authorized Staff Directory/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add Staff Member/i })).toBeInTheDocument();
    });

    it('strictly blocks non-owners from accessing Owner Dashboard routes', async () => {
      const managerProfile: Profile = {
        id: '7010c68d-2da3-4ef5-ba16-99c22d00e77a',
        email: 'manager@superwash.in',
        phone: '9876543211',
        full_name: 'Ananya Verma (Store Manager)',
        role: 'manager',
        is_active: true,
        created_at: new Date().toISOString()
      };
      localStorage.setItem('superwash_auth_profile', JSON.stringify(managerProfile));

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <Routes>
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['owner']}>
                    <OwnerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/manager" element={<div data-testid="manager-fallback">Store Manager View</div>} />
              <Route path="/login" element={<div data-testid="login-fallback">Login View</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      // Verify manager cannot view OwnerDashboard
      await waitFor(() => {
        expect(screen.queryByRole('region', { name: /owner quick access/i })).toBeNull();
      });
      // ProtectedRoute renders Access Restricted for unauthorized role
      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
      expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
    });
  });

  // ==========================================
  // Task 2: Secure Logout & Account Switching
  // ==========================================
  describe('Task 2: Secure Logout and Account Switching', () => {
    it('purges all sensitive user operational keys while preserving public catalog and settings on logout', async () => {
      // Seed operational and private user data
      localStorage.setItem('superwash_orders', JSON.stringify([{ id: 'ord-101', customer_phone: '9876543210' }]));
      localStorage.setItem('superwash_payments', JSON.stringify([{ id: 'pay-101', amount_paise: 50000 }]));
      localStorage.setItem('superwash_weight_history', JSON.stringify([{ id: 'wh-101', measured_weight: 4.5 }]));
      localStorage.setItem('superwash_status_history', JSON.stringify([{ id: 'sh-101', status: 'washing' }]));
      localStorage.setItem('superwash_feedback', JSON.stringify([{ id: 'fb-101', rating: 5 }]));
      localStorage.setItem('superwash_addresses_user-1', JSON.stringify([{ id: 'addr-1', address_line: 'Private St 1' }]));
      localStorage.setItem('superwash_auth_profile', JSON.stringify({ id: 'user-1', role: 'customer' }));

      // Seed public configuration
      localStorage.setItem('superwash_settings', JSON.stringify({ business_name: 'SuperWash Exprez' }));
      localStorage.setItem('superwash_slots', JSON.stringify([{ id: 'slot-1', name: 'Morning' }]));
      localStorage.setItem('superwash_services', JSON.stringify([{ id: 'srv-1', name: 'Wash & Fold' }]));
      localStorage.setItem('superwash_service_areas', JSON.stringify([{ id: 'sa-1', pincode: '560038' }]));

      const LogoutTest = () => {
        const { logout, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="user-role">{currentUser?.role || 'none'}</span>
            <button data-testid="logout-btn" onClick={() => logout()}>Logout</button>
          </div>
        );
      };

      render(
        <MemoryRouter>
          <AuthProvider>
            <LogoutTest />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-role')).toHaveTextContent('customer');
      });

      fireEvent.click(screen.getByTestId('logout-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('user-role')).toHaveTextContent('none');
      });

      // Verify all private keys are purged
      expect(localStorage.getItem('superwash_orders')).toBeNull();
      expect(localStorage.getItem('superwash_payments')).toBeNull();
      expect(localStorage.getItem('superwash_weight_history')).toBeNull();
      expect(localStorage.getItem('superwash_status_history')).toBeNull();
      expect(localStorage.getItem('superwash_feedback')).toBeNull();
      expect(localStorage.getItem('superwash_addresses_user-1')).toBeNull();
      expect(localStorage.getItem('superwash_auth_profile')).toBeNull();

      // Verify public catalog and settings remain intact
      expect(localStorage.getItem('superwash_settings')).not.toBeNull();
      expect(localStorage.getItem('superwash_slots')).not.toBeNull();
      expect(localStorage.getItem('superwash_services')).not.toBeNull();
      expect(localStorage.getItem('superwash_service_areas')).not.toBeNull();
    });

    it('safely handles sign-out failure: reports error without falsely masking it and still sanitizes local cache', async () => {
      // Mock supabase.auth.signOut to reject/fail
      const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockRejectedValueOnce(new Error('Network timeout during sign out'));

      localStorage.setItem('superwash_orders', JSON.stringify([{ id: 'ord-fail', customer_phone: '9999999999' }]));
      localStorage.setItem('superwash_auth_profile', JSON.stringify({ id: 'user-err', role: 'customer' }));

      let logoutResult: any = null;
      const FailureLogoutTest = () => {
        const { logout } = useAuth();
        return (
          <button
            data-testid="fail-logout-btn"
            onClick={async () => {
              logoutResult = await logout();
            }}
          >
            Logout
          </button>
        );
      };

      render(
        <MemoryRouter>
          <AuthProvider>
            <FailureLogoutTest />
          </AuthProvider>
        </MemoryRouter>
      );

      fireEvent.click(screen.getByTestId('fail-logout-btn'));

      await waitFor(() => {
        expect(logoutResult).not.toBeNull();
      });

      // Verify that failure is reported truthfully (does not falsely claim success: true)
      expect(logoutResult.success).toBe(false);
      expect(logoutResult.error).toBeDefined();

      // Verify local private cache was still sanitized for security on the device
      expect(localStorage.getItem('superwash_orders')).toBeNull();
      expect(localStorage.getItem('superwash_auth_profile')).toBeNull();

      signOutSpy.mockRestore();
    });

    it('clears operational cache during account switching', async () => {
      // User 1 has cached orders
      localStorage.setItem('superwash_orders', JSON.stringify([{ id: 'ord-u1', order_number: 'SW-9001' }]));
      localStorage.setItem('superwash_auth_profile', JSON.stringify({
        id: '00000000-0000-4000-a000-000000000001',
        email: 'owner@superwash.in',
        role: 'owner',
        full_name: 'Owner'
      }));

      const SwitchRoleTest = () => {
        const { switchDemoRole, currentUser } = useAuth();
        return (
          <div>
            <span data-testid="current-role">{currentUser?.role}</span>
            <button data-testid="switch-delivery-btn" onClick={() => switchDemoRole('delivery')}>
              Switch to Delivery
            </button>
          </div>
        );
      };

      render(
        <MemoryRouter>
          <AuthProvider>
            <SwitchRoleTest />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-role')).toHaveTextContent('owner');
      });

      // Switch role to delivery
      fireEvent.click(screen.getByTestId('switch-delivery-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('current-role')).toHaveTextContent('delivery');
      });

      // Operational cache was cleared so owner's orders don't bleed into delivery
      expect(localStorage.getItem('superwash_orders')).toBeNull();
    });

    it('syncs logout across tabs via window storage event', async () => {
      const activeUser: Profile = {
        id: 'cust-tab-1',
        email: 'tab@gmail.com',
        phone: '9876543210',
        full_name: 'Tab User',
        role: 'customer',
        is_active: true,
        created_at: new Date().toISOString()
      };
      localStorage.setItem('superwash_auth_profile', JSON.stringify(activeUser));
      localStorage.setItem('superwash_orders', JSON.stringify([{ id: 'ord-tab' }]));

      const TabSyncTest = () => {
        const { currentUser } = useAuth();
        return (
          <span data-testid="tab-user">{currentUser ? currentUser.full_name : 'Logged Out'}</span>
        );
      };

      render(
        <MemoryRouter>
          <AuthProvider>
            <TabSyncTest />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('tab-user')).toHaveTextContent('Tab User');
      });

      // Simulate Tab B clearing superwash_auth_profile (cross-tab logout)
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'superwash_auth_profile',
          oldValue: JSON.stringify(activeUser),
          newValue: null,
          storageArea: localStorage
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('tab-user')).toHaveTextContent('Logged Out');
      });

      expect(localStorage.getItem('superwash_orders')).toBeNull();
    });
  });

  // ==========================================
  // Task 3: PWA Installation Experience
  // ==========================================
  describe('Task 3: PWA Installation Experience', () => {
    it('does not render customer install banner when no beforeinstallprompt has fired and not iOS', () => {
      const { container } = render(<PwaInstallPrompt variant="customer-banner" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders customer banner when beforeinstallprompt event is captured and invokes prompt on click', async () => {
      render(<PwaInstallPrompt variant="customer-banner" />);

      // Create mock BeforeInstallPromptEvent
      const promptMock = vi.fn().mockResolvedValue(undefined);
      const mockEvent = new Event('beforeinstallprompt') as any;
      mockEvent.prompt = promptMock;
      mockEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

      // Dispatch beforeinstallprompt
      window.dispatchEvent(mockEvent);

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /app installation offer/i })).toBeInTheDocument();
      });

      expect(screen.getByText(/Install SuperWash Exprez/i)).toBeInTheDocument();

      // Click Install button
      const installBtn = screen.getByRole('button', { name: /^install$/i });
      fireEvent.click(installBtn);

      expect(promptMock).toHaveBeenCalledTimes(1);
    });

    it('respects user dismissal and stores superwash_pwa_dismissed in sessionStorage', async () => {
      render(<PwaInstallPrompt variant="customer-banner" />);

      const mockEvent = new Event('beforeinstallprompt') as any;
      mockEvent.prompt = vi.fn().mockResolvedValue(undefined);
      mockEvent.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
      window.dispatchEvent(mockEvent);

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /app installation offer/i })).toBeInTheDocument();
      });

      // Click dismiss (X) button
      const dismissBtn = screen.getByLabelText(/dismiss install notification/i);
      fireEvent.click(dismissBtn);

      await waitFor(() => {
        expect(screen.queryByRole('region', { name: /app installation offer/i })).toBeNull();
      });

      // Verify persisted in sessionStorage for this session
      expect(sessionStorage.getItem('superwash_pwa_dismissed')).toBe('true');
    });

    it('does not show install prompt when application is already installed in standalone mode', () => {
      // Mock standalone media query
      const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      } as any));

      const { container } = render(<PwaInstallPrompt variant="customer-banner" />);
      expect(container.firstChild).toBeNull();

      matchMediaSpy.mockRestore();
    });

    it('renders inline-button variant for staff portals and displays unsupported modal if direct prompt unavailable', async () => {
      render(
        <PwaInstallPrompt
          variant="inline-button"
          portalName="Store Manager"
        />
      );

      const staffInstallBtn = screen.getByRole('button', { name: /install store manager app/i });
      expect(staffInstallBtn).toBeInTheDocument();

      // Click install on browser without direct prompt
      fireEvent.click(staffInstallBtn);

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /install store manager/i })).toBeInTheDocument();
      });

      expect(screen.getByText(/open your browser's menu/i)).toBeInTheDocument();

      // Close modal
      fireEvent.click(screen.getByRole('button', { name: /understood/i }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /install store manager/i })).toBeNull();
      });
    });

    it('opens iOS Safari Add to Home Screen step-by-step guide when clicked on iOS device', async () => {
      // Mock iPhone user agent
      const originalUserAgent = window.navigator.userAgent;
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        configurable: true
      });

      render(<PwaInstallPrompt variant="customer-banner" />);

      await waitFor(() => {
        expect(screen.getByRole('region', { name: /app installation offer/i })).toBeInTheDocument();
      });

      // Click Install on iOS
      fireEvent.click(screen.getByRole('button', { name: /^install$/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /install on iphone or ipad/i })).toBeInTheDocument();
      });

      const iosDialog = screen.getByRole('dialog', { name: /install on iphone or ipad/i });
      expect(within(iosDialog).getByText(/Tap the/i)).toBeInTheDocument();
      expect(within(iosDialog).getByText(/Add to Home Screen/i)).toBeInTheDocument();

      // Close guide
      fireEvent.click(screen.getByRole('button', { name: /got it/i }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /install on iphone or ipad/i })).toBeNull();
      });

      // Restore user agent
      Object.defineProperty(window.navigator, 'userAgent', {
        value: originalUserAgent,
        configurable: true
      });
    });
  });
});
