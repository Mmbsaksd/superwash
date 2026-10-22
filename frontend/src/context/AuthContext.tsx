import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, UserRole } from '../types';
import { DEMO_PROFILES } from '../services/laundryService';
import { supabase, isSupabaseConfigured } from '../services/supabase';

interface AuthContextType {
  currentUser: Profile | null;
  user: Profile | null;
  isLoading: boolean;
  sendOtp: (phone: string) => Promise<{ success: boolean; message: string }>;
  verifyOtp: (phone: string, otp: string, roleHint?: UserRole) => Promise<{ success: boolean; message: string }>;
  switchDemoRole: (role: UserRole) => void;
  logout: () => void;
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

  useEffect(() => {
    // Check saved session
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setCurrentUser(null);
      }
    } else {
      // Unauthenticated visitors start as null (guest)
      setCurrentUser(null);
    }
    setIsLoading(false);
  }, []);

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
          return { success: false, message: error.message || 'Failed to send OTP. Please try again.' };
        }
        return { success: true, message: 'OTP sent to your mobile number via SMS' };
      } catch (err: any) {
        return { success: false, message: err.message || 'Error connecting to authentication service' };
      }
    }

    // Explicit Demo Mode
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

    // Live Supabase verification in production mode
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

        // Fetch authoritative profile from database
        let { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        // If newly created user, insert safe customer profile with default role
        if (!profileData) {
          const newProfile: Profile = {
            id: data.user.id,
            phone: cleanPhone,
            full_name: 'Customer',
            role: 'customer', // Always default to customer, never allow self-promotion
            is_active: true,
            created_at: new Date().toISOString()
          };
          const { error: insertError } = await supabase.from('profiles').insert(newProfile);
          if (insertError) {
            console.error('Profile creation error:', insertError);
          }
          profileData = newProfile;
        }

        setCurrentUser(profileData);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profileData));
        return { success: true, message: 'Login successful' };
      } catch (err: any) {
        return { success: false, message: err.message || 'Authentication verification failed' };
      }
    }

    // Demo Mode Verification (Only accepts exactly '123456')
    if (otp !== '123456') {
      return { success: false, message: 'Invalid OTP. Enter 123456 for demo access.' };
    }

    // Check if phone matches any pre-configured demo staff profile
    const matchedProfile = DEMO_PROFILES.find(p => p.phone === cleanPhone);

    const profileToSet: Profile = matchedProfile || {
      id: `user-${Date.now()}`,
      phone: cleanPhone,
      full_name: 'Customer',
      role: 'customer', // Untrusted phone always gets customer role
      is_active: true,
      created_at: new Date().toISOString()
    };

    setCurrentUser(profileToSet);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profileToSet));
    return { success: true, message: 'Verified successfully (Demo Mode)' };
  };

  const switchDemoRole = (role: UserRole) => {
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
      } catch {}
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setCurrentUser(null);
  };

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
