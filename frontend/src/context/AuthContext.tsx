import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, UserRole } from '../types';
import { DEMO_PROFILES } from '../services/laundryService';
import { supabase, isSupabaseConfigured } from '../services/supabase';

interface AuthContextType {
  currentUser: Profile | null;
  user: Profile | null;
  isLoading: boolean;
  signInWithGoogle: (redirectPath?: string, roleHint?: UserRole) => Promise<{ success: boolean; message?: string }>;
  signInWithPassword: (email: string, password: string) => Promise<{ success: boolean; message?: string; role?: UserRole }>;
  sendPasswordResetEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (newPassword: string) => Promise<{ success: boolean; message: string }>;
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

      // Check if profile exists by email (e.g. staff registered by owner with that email)
      if (authUser.email) {
        const cleanEmail = authUser.email.trim().toLowerCase();
        const { data: profileByEmail, error: emailError } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .single();

        if (profileByEmail && !emailError) {
          if (profileByEmail.id !== authUser.id) {
            try {
              await supabase.rpc('sync_google_staff_profile', { p_email: cleanEmail });
            } catch (syncErr) {
              console.warn('Google staff profile linking note:', syncErr);
            }
          }
          return {
            ...profileByEmail,
            id: authUser.id
          };
        }
      }

      // Fallback match against known staff profile when profile row not found (e.g. tests or offline)
      const staffMatch = DEMO_PROFILES.find(
        (p) => p.id === authUser.id || (p.email && authUser.email && p.email.toLowerCase() === authUser.email.toLowerCase())
      );
      if (staffMatch) {
        return staffMatch;
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
        role: (authUser.email && ['genaidream@gmail.com', 'bs.munavar@gmail.com', 'owner@superwash.in'].includes(authUser.email.toLowerCase())) ? 'owner' : 'customer',
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
          let { data: { session }, error: sessionError } = await supabase.auth.getSession();

          // If session exists and token is expired or close to expiring (within 60s), proactively refresh it
          if (session) {
            const isExpiring = session.expires_at && (session.expires_at * 1000 < Date.now() + 60000);
            if (isExpiring) {
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
              if (!refreshError && refreshData.session) {
                session = refreshData.session;
              }
            }
          }

          if (session?.user && !sessionError) {
            const profile = await syncSupabaseProfile(session.user);
            if (isMounted) {
              setCurrentUser(profile);
              if (profile && profile.is_active !== false) {
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
              }
              setIsLoading(false);
              return;
            }
          } else if (isLiveAuth) {
            // In live Supabase mode, if session restoration returns null/error, clear stale session profile
            localStorage.removeItem(AUTH_STORAGE_KEY);
            if (isMounted) setCurrentUser(null);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Session restoration notice:', err);
        }
      }

      // Check local storage session (demo or offline cached)
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (isMounted) {
            setCurrentUser(parsed);
          }
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
        } else if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') && session?.user) {
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

  const signInWithGoogle = async (redirectPath?: string, roleHint?: UserRole): Promise<{ success: boolean; message?: string }> => {
    if (isLiveAuth) {
      try {
        const redirectUrl = redirectPath
          ? `${window.location.origin}/login?redirect=${encodeURIComponent(redirectPath)}`
          : `${window.location.origin}/login`;
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

    // Explicit Demo / Testing Mode: Instant Google Sign-In with Role-Specific Persona
    let targetProfile: Profile | undefined;
    const effectiveRole = roleHint || (redirectPath?.includes('/admin') || redirectPath?.includes('/owner')
      ? 'owner'
      : redirectPath?.includes('/manager')
      ? 'manager'
      : redirectPath?.includes('/delivery')
      ? 'delivery'
      : 'customer');

    if (effectiveRole !== 'customer') {
      targetProfile = DEMO_PROFILES.find(p => p.role === effectiveRole);
    }

    if (!targetProfile) {
      targetProfile = {
        id: 'demo-google-customer-1',
        email: 'priya.patel@gmail.com',
        phone: null,
        full_name: 'Priya Patel (Google)',
        avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        role: 'customer',
        is_active: true,
        created_at: new Date().toISOString()
      };
    }

    if (targetProfile.is_active === false) {
      return {
        success: false,
        message: 'Your staff account has been deactivated. Please contact the business owner.'
      };
    }

    setCurrentUser(targetProfile);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(targetProfile));
    return { success: true, message: `Signed in with Google (${targetProfile.role.toUpperCase()} Demo Mode)` };
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
        if (profile && profile.is_active === false) {
          await supabase.auth.signOut();
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setCurrentUser(null);
          return {
            success: false,
            message: 'Your staff account has been deactivated. Please contact the business owner.'
          };
        }
        setCurrentUser(profile);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
        return { success: true, role: profile.role };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Authentication failed' };
      }
    }

    const matchedProfile = DEMO_PROFILES.find(p => p.email === email);
    if (matchedProfile) {
      if (matchedProfile.is_active === false) {
        return {
          success: false,
          message: 'Your staff account has been deactivated. Please contact the business owner.'
        };
      }
      setCurrentUser(matchedProfile);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(matchedProfile));
      return { success: true, role: matchedProfile.role };
    }
    return { success: false, message: 'Invalid credentials' };
  };

  const sendPasswordResetEmail = async (
    email: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!email || !email.trim()) {
      return { success: false, message: 'Please provide a valid staff email address.' };
    }

    if (isSupabaseConfigured || import.meta.env.MODE === 'test') {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) {
          return { success: false, message: error.message };
        }
        return {
          success: true,
          message: `Password reset instructions sent to ${email.trim()}. Please check your inbox.`
        };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Password reset request failed.' };
      }
    }

    return {
      success: true,
      message: `Password reset request simulated for ${email.trim()} (Demo Mode).`
    };
  };

  const resetPassword = async (
    newPassword: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!newPassword || newPassword.length < 8) {
      return { success: false, message: 'Password must be at least 8 characters long.' };
    }

    if (isSupabaseConfigured || import.meta.env.MODE === 'test') {
      try {
        const { data, error } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (error) {
          return { success: false, message: error.message };
        }
        return { success: true, message: 'Password updated successfully!' };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed to update password.' };
      }
    }

    return {
      success: true,
      message: 'Password updated successfully (Demo Mode).'
    };
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
      if (role === 'customer') {
        await supabase.auth.signOut();
        window.location.href = '/customer';
        return;
      } else {
        window.location.href = `/login?role=${role}`;
        return;
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
        sendPasswordResetEmail,
        resetPassword,
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
