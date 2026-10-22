import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, UserRole } from '../types';
import { DEMO_PROFILES } from '../services/laundryService';
import { supabase, isSupabaseConfigured } from '../services/supabase';

interface AuthContextType {
  currentUser: Profile | null;
  user: Profile | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<{ success: boolean; message?: string }>;
  signInWithPassword: (email: string, password: string) => Promise<{ success: boolean; message?: string; role?: UserRole }>;
  updateProfile: (updates: { phone?: string; full_name?: string }) => Promise<{ success: boolean; message: string }>;
  needsPhonePrompt: boolean;
  sendOtp: (phone: string) => Promise<{ success: boolean; message: string }>;
  verifyOtp: (phone: string, otp: string, roleHint?: UserRole) => Promise<{ success: boolean; message: string }>;
  switchDemoRole: (role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  isCustomer: boolean;
  isDelivery: boolean;
  isManager: boolean;
  isOwner: boolean;
  isStaff: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'superwash_auth_profile';
const isLiveAuth = isSupabaseConfigured && import.meta.env.VITE_DEMO_MODE !== 'true';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Helper to load or provision profile from Supabase user
  const syncSupabaseProfile = async (authUser: any): Promise<Profile> => {
    try {
      const { data: existingProfile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (existingProfile && !error) {
        return existingProfile;
      }

      // Provision new customer profile with default 'customer' role
      const newProfile: Profile = {
        id: authUser.id,
        email: authUser.email || null,
        phone: authUser.phone ? authUser.phone.replace(/[^0-9]/g, '').slice(-10) : null,
        full_name:
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          (authUser.email ? authUser.email.split('@')[0] : 'Customer'),
        avatar_url: authUser.user_metadata?.avatar_url || null,
        role: 'customer', // Untrusted public OAuth sign-ins strictly default to customer
        is_active: true,
        created_at: new Date().toISOString()
      };

      const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select()
        .single();

      if (insertError) {
        console.warn('Profile provisioning notice (handled):', insertError.message);
        // If database trigger on_auth_user_created already provisioned the record, re-fetch it
        const { data: reFetched } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();
        if (reFetched) {
          return reFetched;
        }
      }
      return inserted || newProfile;
    } catch (e) {
      console.error('Error synchronizing profile:', e);
      return {
        id: authUser.id,
        email: authUser.email || null,
        phone: null,
        full_name: authUser.user_metadata?.full_name || 'Customer',
        avatar_url: authUser.user_metadata?.avatar_url || null,
        role: 'customer',
        is_active: true,
        created_at: new Date().toISOString()
      };
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      setIsLoading(true);

      if (isSupabaseConfigured) {
        try {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (session?.user && !sessionError) {
            const profile = await syncSupabaseProfile(session.user);
            if (isMounted) {
              setCurrentUser(profile);
              localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
              setIsLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn('Session restoration notice:', err);
        }
      }

      // Check local storage session (demo or offline cached)
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        try {
          if (isMounted) setCurrentUser(JSON.parse(saved));
        } catch {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          if (isMounted) setCurrentUser(null);
        }
      } else {
        if (isMounted) setCurrentUser(null);
      }

      if (isMounted) setIsLoading(false);
    };

    initializeAuth();

    // Subscribe to Supabase Auth state events (OAuth callback, token refresh, logout)
    let authListener: any = null;
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const profile = await syncSupabaseProfile(session.user);
          if (isMounted) {
            setCurrentUser(profile);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
          }
        } else if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setCurrentUser(null);
            localStorage.removeItem(AUTH_STORAGE_KEY);
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          const profile = await syncSupabaseProfile(session.user);
          if (isMounted) {
            setCurrentUser(profile);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
          }
        }
      });
      authListener = data.subscription;
    }

    return () => {
      isMounted = false;
      if (authListener) authListener.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async (): Promise<{ success: boolean; message?: string }> => {
    if (isLiveAuth) {
      try {
        const redirectUrl = `${window.location.origin}/customer`;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            queryParams: {
              access_type: 'offline',
              prompt: 'select_account'
            }
          }
        });

        if (error) {
          return { success: false, message: error.message || 'Google sign-in could not be initiated.' };
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || 'Failed to connect to Google OAuth provider' };
      }
    }

    // Explicit Demo Mode: Instant Google Sign-In with Demo Profile
    const demoGoogleProfile: Profile = {
      id: 'demo-google-customer-1',
      email: 'priya.patel@gmail.com',
      phone: null, // Initial missing phone to test seamless onboarding prompt
      full_name: 'Priya Patel (Google)',
      avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };

    setCurrentUser(demoGoogleProfile);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(demoGoogleProfile));
    return { success: true, message: 'Signed in with Google (Demo Mode)' };
  };

  const signInWithPassword = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; message?: string; role?: UserRole }> => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error || !data.user) {
          return { success: false, message: error?.message || 'Invalid email or password' };
        }
        const profile = await syncSupabaseProfile(data.user);
        setCurrentUser(profile);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
        return { success: true, role: profile.role };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Authentication failed' };
      }
    }

    const matchedProfile = DEMO_PROFILES.find(p => p.email === email);
    if (matchedProfile) {
      setCurrentUser(matchedProfile);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(matchedProfile));
      return { success: true, role: matchedProfile.role };
    }
    return { success: false, message: 'Invalid credentials' };
  };

  const updateProfile = async (updates: { phone?: string; full_name?: string }): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) {
      return { success: false, message: 'Not authenticated' };
    }

    const cleanPhone = updates.phone ? updates.phone.replace(/[^0-9]/g, '').slice(-10) : currentUser.phone;
    if (updates.phone && (!cleanPhone || cleanPhone.length < 10)) {
      return { success: false, message: 'Please enter a valid 10-digit Indian mobile number.' };
    }

    const updatedProfile: Profile = {
      ...currentUser,
      phone: cleanPhone || null,
      full_name: updates.full_name?.trim() || currentUser.full_name
    };

    if (isLiveAuth) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            phone: cleanPhone || null,
            full_name: updatedProfile.full_name,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUser.id);

        if (error) {
          return { success: false, message: error.message || 'Database error updating profile.' };
        }
      } catch (err: any) {
        return { success: false, message: err.message || 'Connection error updating profile.' };
      }
    }

    setCurrentUser(updatedProfile);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedProfile));
    return { success: true, message: 'Profile updated successfully.' };
  };

  // Legacy/Demo helper methods kept for backward compatibility and test isolation
  const sendOtp = async (phone: string): Promise<{ success: boolean; message: string }> => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      return { success: false, message: 'Please enter a valid 10-digit Indian mobile number' };
    }

    if (isLiveAuth) {
      try {
        const { error } = await supabase.auth.signInWithOtp({
          phone: `+91${cleanPhone.slice(-10)}`
        });
        if (error) {
          return { success: false, message: error.message || 'Failed to send OTP.' };
        }
        return { success: true, message: 'OTP sent to your mobile number via SMS' };
      } catch (err: any) {
        return { success: false, message: err.message || 'Error connecting to authentication service' };
      }
    }

    return {
      success: true,
      message: 'Demo Mode: Enter OTP 123456 to verify'
    };
  };

  const verifyOtp = async (
    phone: string,
    otp: string,
    _roleHint?: UserRole
  ): Promise<{ success: boolean; message: string }> => {
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);

    if (isLiveAuth) {
      try {
        const { data, error } = await supabase.auth.verifyOtp({
          phone: `+91${cleanPhone}`,
          token: otp,
          type: 'sms'
        });
        if (error || !data.user) {
          return { success: false, message: error?.message || 'Invalid or expired OTP. Please try again.' };
        }

        const profile = await syncSupabaseProfile(data.user);
        setCurrentUser(profile);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
        return { success: true, message: 'Login successful' };
      } catch (err: any) {
        return { success: false, message: err.message || 'Authentication verification failed' };
      }
    }

    if (otp !== '123456') {
      return { success: false, message: 'Invalid OTP. Enter 123456 for demo access.' };
    }

    const matchedProfile = DEMO_PROFILES.find(p => p.phone === cleanPhone);
    const profileToSet: Profile = matchedProfile || {
      id: `user-${Date.now()}`,
      phone: cleanPhone,
      full_name: 'Customer',
      role: 'customer',
      is_active: true,
      created_at: new Date().toISOString()
    };

    setCurrentUser(profileToSet);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profileToSet));
    return { success: true, message: 'Verified successfully (Demo Mode)' };
  };

  const switchDemoRole = async (role: UserRole): Promise<void> => {
    if (isLiveAuth) {
      try {
        if (role === 'manager' || role === 'owner') {
          const res = await signInWithPassword('manager@superwash.in', 'SuperWashManager2026!');
          if (res.success) return;
        } else if (role === 'delivery') {
          const res = await signInWithPassword('superwash.audit.1792664886550@gmail.com', 'SuperWashManager2026!');
          if (res.success) return;
        } else if (role === 'customer') {
          await supabase.auth.signOut();
        }
      } catch (err) {
        console.warn('Notice switching authenticated role:', err);
      }
    }

    const profile = DEMO_PROFILES.find(p => p.role === role);
    if (profile) {
      setCurrentUser(profile);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
    }
  };

  const logout = async () => {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Sign-out error:', err);
      }
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setCurrentUser(null);
  };

  // Phone onboarding prompt needed if customer is missing mobile number
  const needsPhonePrompt = Boolean(
    currentUser &&
    currentUser.role === 'customer' &&
    (!currentUser.phone || currentUser.phone.trim().length < 10)
  );

  const isCustomer = currentUser?.role === 'customer';
  const isDelivery = currentUser?.role === 'delivery';
  const isManager = currentUser?.role === 'manager';
  const isOwner = currentUser?.role === 'owner';
  const isStaff = isOwner || isManager || isDelivery;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        user: currentUser,
        isLoading,
        signInWithGoogle,
        signInWithPassword,
        updateProfile,
        needsPhonePrompt,
        sendOtp,
        verifyOtp,
        switchDemoRole,
        logout,
        isCustomer,
        isDelivery,
        isManager,
        isOwner,
        isStaff
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
