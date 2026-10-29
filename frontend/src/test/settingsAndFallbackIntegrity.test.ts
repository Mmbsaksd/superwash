import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { LaundryService, DEFAULT_SETTINGS } from '../services/laundryService';

describe('Production Readiness: Settings, Sample Order & Discount Security Verification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Business Settings Fallback Consistency', () => {
    it('DEFAULT_SETTINGS matches authoritative Banashankari hub configuration', () => {
      expect(DEFAULT_SETTINGS.business_name).toBe('SuperWash Exprez');
      expect(DEFAULT_SETTINGS.business_phone).toBe('+91 8217541193');
      expect(DEFAULT_SETTINGS.business_address).toContain('Kadarenahalli Park');
      expect(DEFAULT_SETTINGS.business_address).toContain('Banashankari 2nd Stage');
      expect(DEFAULT_SETTINGS.business_address).toContain('560070');
      expect(DEFAULT_SETTINGS.price_per_kg_paise).toBe(7900); // ₹79.00 / kg
      expect(DEFAULT_SETTINGS.min_weight_kg).toBe(1.00);      // 1.00 kg minimum
      expect(DEFAULT_SETTINGS.delivery_charge_paise).toBe(0); // Free delivery
      expect(DEFAULT_SETTINGS.serviceable_pincodes).toContain('560111');
      expect(DEFAULT_SETTINGS.serviceable_pincodes).toContain('560070');
    });

    it('returns authoritative DEFAULT_SETTINGS when local storage is cleared', async () => {
      const settings = await LaundryService.getSettings();
      expect(settings.business_phone).toBe('+91 8217541193');
      expect(settings.price_per_kg_paise).toBe(7900);
      expect(settings.min_weight_kg).toBe(1.00);
      expect(settings.serviceable_pincodes).toEqual(['560111', '560070']);
    });
  });

  describe('2. Sample Orders & Pricing Invariants', () => {
    it('demo sample orders reflect ₹79/kg rate baseline and 1.0 kg min weight', async () => {
      const orders = await LaundryService.getOrders();
      const sw1001 = orders.find(o => o.order_number === 'SW-1001');
      const sw1002 = orders.find(o => o.order_number === 'SW-1002');

      expect(sw1001).toBeDefined();
      expect(sw1002).toBeDefined();

      if (sw1001) {
        expect(sw1001.price_per_kg_paise).toBe(7900);
        expect(sw1001.min_weight_kg).toBe(1.0);
        expect(sw1001.measured_weight).toBe(4.5);
        expect(sw1001.billable_weight).toBe(4.5);
        // Financial check: 4.5 kg * 7900 paise = 35550 paise (₹355.50)
        expect(sw1001.total_amount_paise).toBe(35550);
        expect(sw1001.notes).toContain('DEMO SAMPLE ORDER');
      }

      if (sw1002) {
        expect(sw1002.price_per_kg_paise).toBe(7900);
        expect(sw1002.min_weight_kg).toBe(1.0);
        expect(sw1002.notes).toContain('DEMO SAMPLE ORDER');
      }
    });

    it('verifies calculateBill produces exact total matching SW-1001 sample pricing', () => {
      const bill = LaundryService.calculateBill(4.5, 7900, 1.0, 0, 'per_kg', 0);
      expect(bill.billableWeightKg).toBe(4.5);
      expect(bill.subtotalPaise).toBe(35550);
      expect(bill.totalAmountPaise).toBe(35550);
    });
  });

  describe('3. Reviewed Database Migration Security Verification', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../supabase/migrations/20261028100000_grant_order_discount_paise_update.sql'
    );

    it('verifies migration file exists and is populated with hardened rules', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const content = fs.readFileSync(migrationPath, 'utf-8');

      // Column update privilege
      expect(content).toMatch(/GRANT\s+UPDATE\s*\(\s*discount_paise\s*\)\s+ON\s+(TABLE\s+)?public\.orders\s+TO\s+authenticated/i);

      // Trigger replacement
      expect(content).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enforce_order_workflow_integrity\(\)/i);

      // Universal discount integrity check: restricted to owner/manager
      expect(content).toMatch(/user_role\s+NOT\s+IN\s*\(\s*'owner'\s*,\s*'manager'\s*\)\s+AND\s+NEW\.discount_paise\s+IS\s+DISTINCT\s+FROM\s+OLD\.discount_paise/i);

      // Defense against PostgreSQL three-valued logic: explicit denial of NULL or missing roles
      expect(content).toMatch(/user_role\s+IS\s+NULL\s+AND\s+NEW\.discount_paise\s+IS\s+DISTINCT\s+FROM\s+OLD\.discount_paise/i);

      // Explicit check forbidding delivery associates and unauthorized roles from altering discount_paise
      expect(content).toMatch(/Security\s+violation:\s+Delivery\s+associates\s+cannot\s+modify\s+order\s+discounts/i);

      // Non-negative discount validation
      expect(content).toMatch(/NEW\.discount_paise\s*<\s*0/i);

      // Non-negative total amount validation
      expect(content).toMatch(/NEW\.total_amount_paise\s*<\s*0/i);

      // Invariant: Bill total cannot be reduced below already paid amount
      expect(content).toMatch(/NEW\.paid_amount_paise\s*>\s*NEW\.total_amount_paise/i);
    });
  });
});

