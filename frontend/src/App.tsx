import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { RoleSwitcherBar } from './components/RoleSwitcherBar';
import { CustomerHome } from './pages/customer/CustomerHome';
import { DeliveryDashboard } from './pages/delivery/DeliveryDashboard';
import { ManagerDashboard } from './pages/manager/ManagerDashboard';
import { OwnerDashboard } from './pages/admin/OwnerDashboard';
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { ResetPasswordPage } from './pages/public/ResetPasswordPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const { currentUser, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Test & Role Switcher Bar */}
      {location.pathname !== '/login' && location.pathname !== '/admin/login' && location.pathname !== '/reset-password' && <RoleSwitcherBar />}

      {/* Main Content Viewports */}
      <main className="flex-1">
        <Routes>
          {/* Public Landing Page */}
          <Route path="/" element={<LandingPage />} />

          {/* 1. Customer Role */}
          <Route path="/customer" element={<CustomerHome />} />

          {/* 2. Delivery Person Role */}
          <Route
            path="/delivery"
            element={
              <ProtectedRoute allowedRoles={['delivery', 'owner']}>
                <DeliveryDashboard />
              </ProtectedRoute>
            }
          />

          {/* 3. Store Manager Role */}
          <Route
            path="/manager"
            element={
              <ProtectedRoute allowedRoles={['manager', 'owner']}>
                <ManagerDashboard />
              </ProtectedRoute>
            }
          />

          {/* 4. Business Owner / Admin Role */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['owner']}>
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/owner" element={<Navigate to="/admin" replace />} />
          <Route path="/staff" element={<Navigate to="/admin/login" replace />} />

          {/* Authentication Portals */}
          <Route path="/admin/login" element={<LoginPage isStaffPortal={true} />} />
          <Route path="/login" element={<LoginPage isStaffPortal={false} />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
