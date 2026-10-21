import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import { PublicLayout } from './layouts/PublicLayout';
import { CustomerLayout } from './layouts/CustomerLayout';
import { AdminLayout } from './layouts/AdminLayout';

// Public Pages
import { Home } from './pages/public/Home';
import { ServicesPage } from './pages/public/ServicesPage';
import { HowItWorksPage } from './pages/public/HowItWorksPage';
import { BookingPage } from './pages/public/BookingPage';
import { OrderTrackingPage } from './pages/public/OrderTrackingPage';
import { ContactPage } from './pages/public/ContactPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { PrivacyPage, TermsPage } from './pages/public/LegalPages';

// Customer Pages
import { CustomerOrdersPage } from './pages/customer/CustomerOrdersPage';
import { CustomerAddressesPage, CustomerProfilePage } from './pages/customer/CustomerAddressesPage';

// Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminOrderDetailPage } from './pages/admin/AdminOrderDetailPage';
import { AdminWalkInOrderPage } from './pages/admin/AdminWalkInOrderPage';
import { AdminServicesPage } from './pages/admin/AdminServicesPage';
import { AdminLogisticsPage } from './pages/admin/AdminLogisticsPage';
import { AdminReportsPage } from './pages/admin/AdminReportsPage';

export const App: React.FC = () => {
  return (
    <Routes>
      {/* Public Pages */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/book" element={<BookingPage />} />
        <Route path="/track" element={<OrderTrackingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Route>

      {/* Customer Protected Pages */}
      <Route path="/customer" element={<CustomerLayout />}>
        <Route index element={<Navigate to="/customer/orders" replace />} />
        <Route path="orders" element={<CustomerOrdersPage />} />
        <Route path="addresses" element={<CustomerAddressesPage />} />
        <Route path="profile" element={<CustomerProfilePage />} />
      </Route>

      {/* Admin / Staff Protected Pages */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="orders/:orderId" element={<AdminOrderDetailPage />} />
        <Route path="walk-in" element={<AdminWalkInOrderPage />} />
        <Route path="services" element={<AdminServicesPage />} />
        <Route path="logistics" element={<AdminLogisticsPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
