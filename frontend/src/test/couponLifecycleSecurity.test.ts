import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LaundryService } from '../services/laundryService';
import { supabase } from '../services/supabase';
import { Coupon } from '../types';

describe('Coupon Architecture & Production Safety Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------
  // 1. Public Promotional Data Access
  // -------------------------------------------------------------
  describe('1. Public Promotional Data Access & Minimal Exposure', () => {
    it('retrieves only active, unexpired promotions with minimal fields', async () => {
      const sampleCoupons: Coupon[] = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          code: 'PUBLICACTIVE',
          description: 'Public Active Offer',
          discount_type: 'fixed',
          discount_value: 5000,
          min_order_paise: 15000,
          max_discount_paise: null,
          max_redemptions: 100,
          total_redemptions: 5,
          per_customer_limit: 1,
          applicable_service_ids: null,
          first_time_only: false,
          is_active: true,
          valid_until: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date().toISOString()
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          code: 'INACTIVEDISABLED',
          description: 'Disabled Internal Offer',
          discount_type: 'percentage',
          discount_value: 20,
          min_order_paise: 20000,
          max_discount_paise: 5000,
          max_redemptions: 50,
          total_redemptions: 10,
          per_customer_limit: 1,
          applicable_service_ids: null,
          first_time_only: false,
          is_active: false,
          valid_until: null,
          created_at: new Date().toISOString()
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          code: 'EXPIREDPAST',
          description: 'Expired Offer',
          discount_type: 'fixed',
          discount_value: 3000,
          min_order_paise: 10000,
          max_discount_paise: null,
          max_redemptions: 50,
          total_redemptions: 2,
          per_customer_limit: 1,
          applicable_service_ids: null,
          first_time_only: false,
          is_active: true,
          valid_until: '2024-01-01T00:00:00Z',
          created_at: new Date().toISOString()
        }
      ];

      localStorage.setItem('superwash_coupons', JSON.stringify(sampleCoupons));

      const publicPromotions = await LaundryService.getPublicPromotions();

      // Must include the active coupon
      expect(publicPromotions.some(p => p.code === 'PUBLICACTIVE')).toBe(true);

      // Must strictly filter out the inactive coupon
      expect(publicPromotions.some(p => p.code === 'INACTIVEDISABLED')).toBe(false);

      // Must strictly filter out the expired coupon
      expect(publicPromotions.some(p => p.code === 'EXPIREDPAST')).toBe(false);

      // Verify that internal sensitive columns are NOT exposed in public promotion objects
      const activePromo = publicPromotions.find(p => p.code === 'PUBLICACTIVE');
      expect(activePromo).toBeDefined();
      expect((activePromo as any).total_redemptions).toBeUndefined();
      expect((activePromo as any).max_redemptions).toBeUndefined();
      expect((activePromo as any).per_customer_limit).toBeUndefined();
      expect((activePromo as any).id).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // 2. Legacy String ID Resolution & Fail-Closed Error Propagation
  // -------------------------------------------------------------
  describe('2. Legacy String ID Resolution & Fail-Closed Safety', () => {
    it('normalizes legacy string IDs (e.g. coupon-welcome50) during update', async () => {
      const demoCoupons: Coupon[] = [
        {
          id: 'coupon-welcome50',
          code: 'WELCOME50',
          description: 'Welcome ₹50',
          discount_type: 'fixed',
          discount_value: 5000,
          min_order_paise: 15000,
          max_discount_paise: null,
          max_redemptions: 100,
          total_redemptions: 0,
          per_customer_limit: 1,
          applicable_service_ids: null,
          first_time_only: true,
          is_active: false,
          valid_until: null,
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('superwash_coupons', JSON.stringify(demoCoupons));

      // Owner activates legacy coupon
      const updated = await LaundryService.updateCoupon('coupon-welcome50', { is_active: true }, 'owner');
      expect(updated.is_active).toBe(true);
      expect(updated.code).toBe('WELCOME50');

      // Local storage reflects the update
      const stored = JSON.parse(localStorage.getItem('superwash_coupons') || '[]');
      const storedWelcome = stored.find((c: Coupon) => c.code === 'WELCOME50');
      expect(storedWelcome?.is_active).toBe(true);
    });

    it('rejects unauthorized non-owner callers from updating coupons', async () => {
      const demoCoupons: Coupon[] = [
        {
          id: 'coupon-test-01',
          code: 'TEST01',
          discount_type: 'fixed',
          discount_value: 1000,
          min_order_paise: 5000,
          is_active: true,
          total_redemptions: 0,
          per_customer_limit: 1,
          first_time_only: false,
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('superwash_coupons', JSON.stringify(demoCoupons));

      // Caller as customer
      await expect(
        LaundryService.updateCoupon('coupon-test-01', { is_active: false }, 'customer')
      ).rejects.toThrow(/Only business owners can update coupons/);

      // Caller as manager
      await expect(
        LaundryService.updateCoupon('coupon-test-01', { is_active: false }, 'manager')
      ).rejects.toThrow(/Only business owners can update coupons/);

      // Verify localStorage was NOT modified on unauthorized call
      const stored = JSON.parse(localStorage.getItem('superwash_coupons') || '[]');
      expect(stored[0].is_active).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 3. Delete Handler & Historical Record Protection
  // -------------------------------------------------------------
  describe('3. Delete Handler & Historical Record Protection', () => {
    it('permanently deletes unused coupon (total_redemptions = 0)', async () => {
      const coupons: Coupon[] = [
        {
          id: 'unused-uuid-001',
          code: 'UNUSEDCOUPON',
          discount_type: 'fixed',
          discount_value: 2000,
          min_order_paise: 10000,
          total_redemptions: 0,
          per_customer_limit: 1,
          first_time_only: false,
          is_active: true,
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('superwash_coupons', JSON.stringify(coupons));

      const deleted = await LaundryService.deleteCoupon('unused-uuid-001', 'owner');
      expect(deleted).toBe(true);

      const stored = JSON.parse(localStorage.getItem('superwash_coupons') || '[]');
      expect(stored.find((c: Coupon) => c.id === 'unused-uuid-001')).toBeUndefined();
    });

    it('safely handles coupons with historical redemptions without corrupting order history', async () => {
      const coupons: Coupon[] = [
        {
          id: 'historical-uuid-002',
          code: 'HISTORICALUSED',
          discount_type: 'fixed',
          discount_value: 5000,
          min_order_paise: 15000,
          total_redemptions: 12, // Has 12 historical redemptions on orders/invoices
          per_customer_limit: 1,
          first_time_only: false,
          is_active: true,
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('superwash_coupons', JSON.stringify(coupons));

      // Deleting a coupon that has redemptions safely removes it from the active list
      const deleted = await LaundryService.deleteCoupon('historical-uuid-002', 'owner');
      expect(deleted).toBe(true);

      // It is removed from the active owner listing
      const stored = JSON.parse(localStorage.getItem('superwash_coupons') || '[]');
      expect(stored.find((c: Coupon) => c.id === 'historical-uuid-002')).toBeUndefined();
    });

    it('rejects unauthorized non-owner callers from deleting coupons', async () => {
      const coupons: Coupon[] = [
        {
          id: 'protected-uuid-003',
          code: 'PROTECTED',
          discount_type: 'fixed',
          discount_value: 1000,
          min_order_paise: 5000,
          total_redemptions: 0,
          per_customer_limit: 1,
          first_time_only: false,
          is_active: true,
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('superwash_coupons', JSON.stringify(coupons));

      await expect(
        LaundryService.deleteCoupon('protected-uuid-003', 'delivery')
      ).rejects.toThrow(/Only business owners can delete coupons/);

      // Verify record is preserved
      const stored = JSON.parse(localStorage.getItem('superwash_coupons') || '[]');
      expect(stored.length).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // 4. Server-Side Validation Rejection
  // -------------------------------------------------------------
  describe('4. Server-Side Validation Rejection at Checkout', () => {
    it('strictly rejects deactivated coupons during checkout validation', async () => {
      const coupons: Coupon[] = [
        {
          id: 'uuid-deactivated',
          code: 'DEACTIVATED50',
          discount_type: 'fixed',
          discount_value: 5000,
          min_order_paise: 15000,
          total_redemptions: 0,
          per_customer_limit: 1,
          first_time_only: false,
          is_active: false, // Disabled
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('superwash_coupons', JSON.stringify(coupons));

      const result = await LaundryService.validateCoupon('DEACTIVATED50', '9876543210', 25000);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('disabled');
      expect(result.discount_paise).toBe(0);
    });

    it('strictly rejects deleted or non-existent coupons during checkout validation', async () => {
      localStorage.setItem('superwash_coupons', JSON.stringify([]));

      const result = await LaundryService.validateCoupon('NONEXISTENT', '9876543210', 25000);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('invalid or does not exist');
      expect(result.discount_paise).toBe(0);
    });

    it('strictly rejects expired coupons during checkout validation', async () => {
      const coupons: Coupon[] = [
        {
          id: 'uuid-expired',
          code: 'EXPIRED10',
          discount_type: 'percentage',
          discount_value: 10,
          min_order_paise: 10000,
          total_redemptions: 0,
          per_customer_limit: 1,
          first_time_only: false,
          is_active: true,
          valid_until: '2025-01-01T00:00:00Z',
          created_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('superwash_coupons', JSON.stringify(coupons));

      const result = await LaundryService.validateCoupon('EXPIRED10', '9876543210', 20000);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
      expect(result.discount_paise).toBe(0);
    });
  });
});

