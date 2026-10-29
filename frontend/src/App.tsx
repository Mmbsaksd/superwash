import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { RoleSwitcherBar } from './components/RoleSwitcherBar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicLayout } from './components/PublicLayout';
import { Loader2 } from 'lucide-react';

// Lazy-loaded routes for optimal initial bundle size and route-level code splitting
const CustomerHome = React.lazy(() =>
  import('./pages/customer/CustomerHome').then((m) => ({ default: m.CustomerHome }))
);
const DeliveryDashboard = React.lazy(() =>
  import('./pages/delivery/DeliveryDashboard').then((m) => ({ default: m.DeliveryDashboard }))
);
const ManagerDashboard = React.lazy(() =>
  import('./pages/manager/ManagerDashboard').then((m) => ({ default: m.ManagerDashboard }))
);
const OwnerDashboard = React.lazy(() =>
  import('./pages/admin/OwnerDashboard').then((m) => ({ default: m.OwnerDashboard }))
);
const LandingPage = React.lazy(() =>
  import('./pages/public/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const LoginPage = React.lazy(() =>
  import('./pages/public/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const ResetPasswordPage = React.lazy(() =>
  import('./pages/public/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
);
const ContactPage = React.lazy(() =>
  import('./pages/public/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const HowItWorksPage = React.lazy(() =>
  import('./pages/public/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage }))
);
const PrivacyPage = React.lazy(() =>
  import('./pages/public/LegalPages').then((m) => ({ default: m.PrivacyPage }))
);
const TermsPage = React.lazy(() =>
  import('./pages/public/LegalPages').then((m) => ({ default: m.TermsPage }))
);

const PageFallback: React.FC = () => (
  <div className="min-h-[50vh] flex items-center justify-center bg-slate-50">
    <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
  </div>
);

export const App: React.FC = () => {
  const { currentUser: _currentUser, isLoading } = useAuth();
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
      {location.pathname !== '/login' &&
        location.pathname !== '/admin/login' &&
        location.pathname !== '/reset-password' && <RoleSwitcherBar />}

      {/* Main Content Viewports */}
      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public Landing Page */}
            <Route path="/" element={<LandingPage />} />

            {/* Public Information Pages */}
            <Route
              path="/contact"
              element={
                <PublicLayout>
                  <ContactPage />
                </PublicLayout>
              }
            />
            <Route
              path="/how-it-works"
              element={
                <PublicLayout>
                  <HowItWorksPage />
                </PublicLayout>
              }
            />
            <Route
              path="/privacy"
              element={
                <PublicLayout>
                  <PrivacyPage />
                </PublicLayout>
              }
            />
            <Route
              path="/terms"
              element={
                <PublicLayout>
                  <TermsPage />
                </PublicLayout>
              }
            />

            {/* Navigation aliases & redirects */}
            <Route path="/book" element={<Navigate to="/customer?tab=book" replace />} />
            <Route path="/services" element={<Navigate to="/customer?tab=book" replace />} />
            <Route path="/track" element={<Navigate to="/customer?tab=current" replace />} />
            <Route path="/orders" element={<Navigate to="/customer?tab=current" replace />} />
            <Route path="/my-orders" element={<Navigate to="/customer?tab=current" replace />} />
            <Route path="/profile" element={<Navigate to="/customer?tab=addresses" replace />} />
            <Route path="/my-profile" element={<Navigate to="/customer?tab=addresses" replace />} />
            <Route path="/settings" element={<Navigate to="/customer?tab=settings" replace />} />
            <Route path="/customer/orders" element={<Navigate to="/customer?tab=current" replace />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />

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
        </Suspense>
      </main>
    </div>
  );
};

export default App;
