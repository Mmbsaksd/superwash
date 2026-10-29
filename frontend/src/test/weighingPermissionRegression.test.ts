import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { LaundryService } from '../services/laundryService';

describe('Stage 5A: Weighing Permission Migration & Payload Regression Check', () => {
  const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');
  const targetMigrationPath = path.join(
    migrationsDir,
    '20261028100000_grant_order_discount_paise_update.sql'
  );
  const baselineMigrationPath = path.join(
    migrationsDir,
    '20261022180000_database_enforced_workflow_and_security.sql'
  );

  it('1. verifies that the new migration file exists in supabase/migrations/', () => {
    expect(fs.existsSync(targetMigrationPath)).toBe(true);
  });

  it('2. verifies that the migration grants UPDATE strictly and exclusively on discount_paise', () => {
    const sql = fs.readFileSync(targetMigrationPath, 'utf-8');

    // Matches GRANT UPDATE (discount_paise) ON TABLE public.orders TO authenticated;
    const hasTargetGrant = /GRANT\s+UPDATE\s*\(\s*discount_paise\s*\)\s+ON\s+(TABLE\s+)?public\.orders\s+TO\s+authenticated/i.test(sql);
    expect(hasTargetGrant).toBe(true);
  });

  it('3. verifies that no broad table-wide UPDATE privilege is granted', () => {
    const sql = fs.readFileSync(targetMigrationPath, 'utf-8');

    // Must NOT contain unconstrained "GRANT UPDATE ON public.orders"
    const hasBroadGrant = /GRANT\s+UPDATE\s+ON\s+(TABLE\s+)?public\.orders/i.test(
      sql.replace(/GRANT\s+UPDATE\s*\([^)]+\)/gi, '') // strip column-specific grants
    );
    expect(hasBroadGrant).toBe(false);
  });

  it('4. verifies that sensitive financial columns (paid_amount_paise, payment_status, payment_method) are NOT granted', () => {
    const sql = fs.readFileSync(targetMigrationPath, 'utf-8');

    // Extract all GRANT UPDATE statements to verify sensitive columns are not granted
    const grantStatements = sql.match(/GRANT\s+UPDATE[^\n;]+/gi) || [];
    const grantedText = grantStatements.join(' ');

    expect(/paid_amount_paise/i.test(grantedText)).toBe(false);
    expect(/payment_status/i.test(grantedText)).toBe(false);
    expect(/payment_method/i.test(grantedText)).toBe(false);
    expect(/customer_id/i.test(grantedText)).toBe(false);
  });

  it('5. verifies that trigger function restricts discount_paise modifications strictly to store managers and owners', () => {
    const sql = fs.readFileSync(targetMigrationPath, 'utf-8');

    // Must verify delivery associates and non-manager/owner roles cannot alter discount_paise
    expect(sql).toMatch(/user_role\s+NOT\s+IN\s*\(\s*'owner'\s*,\s*'manager'\s*\)\s+AND\s+NEW\.discount_paise\s+IS\s+DISTINCT\s+FROM\s+OLD\.discount_paise/i);
    expect(sql).toMatch(/Delivery\s+associates\s+cannot\s+modify\s+order\s+discounts/i);
  });

  it('5. verifies that all columns in enterMeasuredWeight update payload have matching database grants', () => {
    // Columns sent in LaundryService.enterMeasuredWeight (laundryService.ts lines 1753-1759):
    const payloadColumns = [
      'measured_weight',
      'billable_weight',
      'discount_paise',
      'total_amount_paise',
      'weighed_at',
      'order_status',
      'updated_at'
    ];

    const baselineSql = fs.readFileSync(baselineMigrationPath, 'utf-8');
    const targetSql = fs.readFileSync(targetMigrationPath, 'utf-8');
    const combinedSql = baselineSql + '\n' + targetSql;

    // Check that every single column in the update payload is covered by column grants to authenticated
    for (const col of payloadColumns) {
      const colRegex = new RegExp(`GRANT\\s+UPDATE\\s*\\([\\s\\S]*?\\b${col}\\b[\\s\\S]*?\\)\\s+ON\\s+(TABLE\\s+)?public\\.orders\\s+TO\\s+authenticated`, 'i');
      const isGranted = colRegex.test(combinedSql);
      expect(isGranted, `Column '${col}' must be granted in column allowlist`).toBe(true);
    }
  });

  it('6. verifies that bill and discount recalculation logic remains unaltered', () => {
    // 5.0 kg @ ₹79/kg with ₹50 (5000 paise) discount
    const bill = LaundryService.calculateBill(
      5.0,
      7900,
      3.0,
      0,
      'per_kg',
      5000
    );

    expect(bill.billableWeightKg).toBe(5.0);
    expect(bill.subtotalPaise).toBe(39500); // 5 * 79 = 395
    expect(bill.discountPaise).toBe(5000);   // 50
    expect(bill.totalAmountPaise).toBe(34500); // 395 - 50 = 345
  });
});
