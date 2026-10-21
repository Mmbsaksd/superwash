import axios from 'axios';
import {
  User, Service, DeliveryTimeSlot, ServiceableArea,
  Order, DashboardMetrics, Payment, Refund, GarmentInspection, LogisticsTask
} from '../types';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('superwash_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const apiClient = {
  // Auth
  register: (data: any) => api.post<{ access_token: string; token_type: string; user: User }>('/auth/register', data),
  login: (data: any) => api.post<{ access_token: string; token_type: string; user: User }>('/auth/login', data),
  getMe: () => api.get<User>('/auth/me'),
  addAddress: (data: any) => api.post('/auth/addresses', data),

  // Services & Pricing
  getServices: () => api.get<Service[]>('/services'),
  getService: (id: string) => api.get<Service>(`/services/${id}`),
  getSlots: () => api.get<DeliveryTimeSlot[]>('/slots'),
  getAreas: () => api.get<ServiceableArea[]>('/areas'),
  validateCoupon: (code: string, subtotal_paise: number) =>
    api.post<{ valid: boolean; code: string; discount_paise: number; message: string }>('/coupons/validate', { code, subtotal_paise }),

  // Orders
  bookOrder: (data: any) => api.post<Order>('/orders/book', data),
  trackOrder: (orderNumber: string, phone?: string) =>
    api.get<Order>(`/orders/track/${orderNumber}${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`),
  getMyOrders: () => api.get<Order[]>('/orders/my-orders'),
  getOrder: (id: string) => api.get<Order>(`/orders/${id}`),
  cancelOrder: (id: string, reason: string) => api.post<Order>(`/orders/${id}/cancel`, { reason }),

  // Admin
  getMetrics: () => api.get<DashboardMetrics>('/admin/metrics'),
  listAdminOrders: (params?: { search?: string; status?: string; handover_method?: string; payment_status?: string; limit?: number; offset?: number }) =>
    api.get<Order[]>('/admin/orders', { params }),
  createWalkInOrder: (data: any) => api.post<Order>('/admin/orders/walk-in', data),
  updateOrderDetails: (id: string, data: any) => api.put<Order>(`/admin/orders/${id}`, data),
  updateOrderStatus: (id: string, status: string, notes?: string) =>
    api.post<Order>(`/admin/orders/${id}/status`, { status, notes }),
  recordInspection: (id: string, data: any) =>
    api.post<GarmentInspection>(`/admin/orders/${id}/inspection`, data),
  assignLogistics: (id: string, data: any) =>
    api.post<LogisticsTask>(`/admin/orders/${id}/assign-logistics`, data),
  getStaff: () => api.get<User[]>('/admin/staff'),
  createStaff: (data: any) => api.post<User>('/admin/staff', data),

  // Service Management
  createService: (data: any) => api.post<Service>('/admin/services', data),
  updateService: (id: string, data: any) => api.put<Service>(`/admin/services/${id}`, data),
  addServicePrice: (serviceId: string, data: any) => api.post(`/admin/services/${serviceId}/prices`, data),
  updateServicePrice: (priceId: string, data: any) => api.put(`/admin/prices/${priceId}`, data),

  // Payments
  createRazorpayOrder: (order_id: string) =>
    api.post<{ razorpay_order_id: string; key_id: string; amount_paise: number; currency: string; order_number: string; customer_name: string; customer_phone: string; customer_email: string }>(
      '/payments/razorpay/create-order',
      { order_id }
    ),
  verifyRazorpay: (data: { order_id: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    api.post<Payment>('/payments/razorpay/verify', data),
  recordManualPayment: (order_id: string, data: { amount_paise: number; payment_method: string; transaction_reference?: string; notes?: string }) =>
    api.post<Payment>(`/payments/record-manual?order_id=${order_id}`, data),
  processRefund: (order_id: string, data: { amount_paise: number; reason: string; payment_id?: string }) =>
    api.post<Refund>(`/payments/refund?order_id=${order_id}`, data),

  // Reports
  getAnalytics: (days: number = 30) => api.get(`/reports/analytics?days=${days}`),
  getExportCsvUrl: () => '/api/v1/reports/export-csv',
};

export default api;
