import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { apiClient } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isStaff: boolean;
  isAdmin: boolean;
  isCustomer: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('superwash_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      if (token) {
        const res = await apiClient.getMe();
        setUser(res.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
      setToken(null);
      localStorage.removeItem('superwash_token');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('superwash_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('superwash_token');
    setToken(null);
    setUser(null);
  };

  const isStaff = user?.role === 'owner' || user?.role === 'manager' || user?.role === 'processing_staff' || user?.role === 'delivery_staff';
  const isAdmin = user?.role === 'owner' || user?.role === 'manager';
  const isCustomer = user?.role === 'customer';

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser, isStaff, isAdmin, isCustomer }}>
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
