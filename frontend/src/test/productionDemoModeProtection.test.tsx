import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth, isDemoModeActive } from '../context/AuthContext';
import { LoginPage } from '../pages/public/LoginPage';
import { RoleSwitcherBar } from '../components/RoleSwitcherBar';
import { LaundryService, setLiveModeForTesting } from '../services/laundryService';
import { supabase } from '../services/supabase';

describe('Production Demo Mode Immunity & Strict Security Invariants', () => {
  const originalDev = import.meta.env.DEV;
  const originalDemoMode = import.meta.env.VITE_DEMO_MODE;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    import.meta.env.DEV = originalDev;
    import.meta.env.VITE_DEMO_MODE = originalDemoMode;
    setLiveModeForTesting(false);
  });

  it('Invariant 1: isDemoModeActive is strictly false when DEV is false, even if VITE_DEMO_MODE is true', () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true';
    expect(isDemoModeActive()).toBe(false);
  });

  it('Invariant 2: signInWithGoogle in production mode strictly calls Supabase signInWithOAuth and rejects demo fallback', async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true'; // Intentionally misconfigured env
    setLiveModeForTesting(true);

    const signInWithOAuthSpy = vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/v2/auth?...' },
      error: null
    } as any);

    let authContextRef: any;
    const TestConsumer = () => {
      authContextRef = useAuth();
      return <div data-testid="ready">Ready</div>;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toBeInTheDocument();
    });

    const result = await authContextRef.signInWithGoogle('/customer');
    expect(result.success).toBe(true);
    expect(signInWithOAuthSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('/login?redirect=%2Fcustomer')
        })
      })
    );

    // Verify localStorage NEVER received a simulated demo persona
    const stored = localStorage.getItem('superwash_auth_profile');
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.id).not.toBe('demo-google-customer-1');
      expect(parsed.email).not.toBe('priya.patel@gmail.com');
    }
  });

  it('Invariant 3: signInWithGoogle returns failure if Supabase OAuth fails and NEVER falls back to demo persona', async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true';
    setLiveModeForTesting(true);

    vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { message: 'Google OAuth provider timeout' }
    } as any);

    let authContextRef: any;
    const TestConsumer = () => {
      authContextRef = useAuth();
      return <div data-testid="ready">Ready</div>;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toBeInTheDocument();
    });

    const result = await authContextRef.signInWithGoogle('/customer');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Google OAuth provider timeout');

    // Confirm absolutely no demo profile was minted
    expect(localStorage.getItem('superwash_auth_profile')).toBeNull();
  });

  it('Invariant 4: getOrders on empty database returns empty array and NEVER seeds INITIAL_SAMPLE_ORDERS', async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true';
    setLiveModeForTesting(true);

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null })
      })
    } as any);

    const orders = await LaundryService.getOrders();
    expect(orders).toEqual([]);
    expect(orders.length).toBe(0);

    const storedOrders = localStorage.getItem('superwash_orders');
    expect(storedOrders).toBe('[]');
    expect(storedOrders).not.toContain('SW-1001');
    expect(storedOrders).not.toContain('SW-1002');
  });

  it('Invariant 5: getCustomerOrders on empty database returns empty array without mock fallback', async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true';
    setLiveModeForTesting(true);

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      })
    } as any);

    const customerOrders = await LaundryService.getCustomerOrders('user-123', '9876543210');
    expect(customerOrders).toEqual([]);
    expect(customerOrders.length).toBe(0);
  });

  it('Invariant 6: getAddresses on empty database returns empty array and NEVER seeds addr-default-1', async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true';
    setLiveModeForTesting(true);

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      })
    } as any);

    const addresses = await LaundryService.getAddresses('user-123');
    expect(addresses).toEqual([]);
    expect(addresses.length).toBe(0);

    const stored = localStorage.getItem('superwash_addresses_user-123');
    expect(stored).toBeNull();
  });

  it('Invariant 7: getStaffProfiles on empty database returns empty array and NEVER leaks DEMO_PROFILES', async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true';
    setLiveModeForTesting(true);

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            neq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              }),
              order: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          })
        } as any;
      }
      return {
        select: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      } as any;
    });

    const staff = await LaundryService.getStaffProfiles(false);
    expect(staff).toEqual([]);
    expect(staff.length).toBe(0);
  });

  it('Invariant 8: RoleSwitcherBar returns null in production mode', () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true';

    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <RoleSwitcherBar />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
  });

  it('Invariant 9: LoginPage in production mode NEVER renders Demo Persona Selector or Demo Active badges', async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true';

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage isStaffPortal={false} />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Customer Sign In/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Customer Persona \(Demo Mode\)/i)).toBeNull();
    expect(screen.queryByText(/Demo Active/i)).toBeNull();
    expect(screen.queryByText(/Priya Patel/i)).toBeNull();
  });

  it('Invariant 10: Staff LoginPage in production mode NEVER renders quick-select buttons for Ramesh, Ananya, or Rajesh', async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_DEMO_MODE = 'true';

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

    expect(screen.queryByText(/Staff Personas \(Demo Mode\)/i)).toBeNull();
    expect(screen.queryByText(/Demo Active/i)).toBeNull();
    expect(screen.queryByText(/Ramesh Kumar/i)).toBeNull();
    expect(screen.queryByText(/Ananya Verma/i)).toBeNull();
    expect(screen.queryByText(/Rajesh Sharma/i)).toBeNull();
  });
});
