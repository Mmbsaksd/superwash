const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.resolve('supabase/backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const TABLES = [
  'public.business_settings',
  'public.pricing_versions',
  'public.pricing_version_items',
  'public.services',
  'public.service_areas',
  'public.pickup_slots',
  'public.coupons',
  'public.profiles',
  'public.orders',
  'public.payments',
  'public.customer_addresses',
  'public.order_feedback',
  'public.order_status_history',
  'public.notification_logs',
  'public.weight_change_history',
  'public.coupon_reservations',
  'public.coupon_redemptions',
  'public.payment_events',
  'public.staff_pre_registrations',
  '_backups.customer_addresses_rel_20261027_140000',
  '_backups.services_rel_20261027_140000',
  '_backups.address_mutations_rel_20261027_140000'
];

function runQuery(sql) {
  const tmpFile = path.resolve('supabase/.temp/query_' + Date.now() + Math.random().toString(36).substring(7) + '.sql');
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    const cmd = `npx supabase db query --linked -f "${tmpFile}"`;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    const jsonStart = out.indexOf('{\n  "boundary":');
    if (jsonStart === -1) {
      throw new Error(`Failed to parse CLI JSON output: ${out}`);
    }
    const parsed = JSON.parse(out.substring(jsonStart));
    return parsed.rows || [];
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (Array.isArray(val)) {
    // Array in postgres
    const inner = val.map(v => typeof v === 'string' ? `"${v.replace(/"/g, '\\"')}"` : v).join(',');
    return `'${"{" + inner + "}"}'`;
  }
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
  console.log(`Starting Production Backup at ${timestamp}...`);

  // 1. Table Data Backup
  console.log('--- 1. Extracting Table Data ---');
  let dataSql = `-- =============================================================================\n` +
                `-- SuperWash Exprez — Production Database Full Data Backup\n` +
                `-- Project: ierbhbfgqleobjepamrx\n` +
                `-- Timestamp: ${new Date().toISOString()}\n` +
                `-- =============================================================================\n\n` +
                `BEGIN;\n\n`;

  const counts = {};

  for (const table of TABLES) {
    process.stdout.write(`Dumping ${table}... `);
    const countRows = runQuery(`SELECT count(*) as cnt FROM ${table};`);
    const count = parseInt(countRows[0]?.cnt || '0', 10);
    counts[table] = count;

    dataSql += `-- Table: ${table} (${count} rows)\n`;

    if (count > 0) {
      const rows = runQuery(`SELECT json_agg(t) as data FROM (SELECT * FROM ${table}) t;`);
      const rowList = rows[0]?.data || [];

      if (rowList.length > 0) {
        const columns = Object.keys(rowList[0]);
        for (const r of rowList) {
          const vals = columns.map(col => escapeSqlValue(r[col]));
          dataSql += `INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')});\n`;
        }
      }
    }
    dataSql += `\n`;
    console.log(`✓ (${count} rows)`);
  }

  dataSql += `COMMIT;\n`;

  const dataBackupPath = path.join(BACKUP_DIR, `backup_data_production.sql`);
  fs.writeFileSync(dataBackupPath, dataSql, 'utf8');
  console.log(`Saved Data Backup to ${dataBackupPath} (${fs.statSync(dataBackupPath).size} bytes)`);

  // 2. Auth Users Backup
  console.log('\n--- 2. Extracting Auth Accounts ---');
  const authRows = runQuery(`
    SELECT json_agg(t) as users FROM (
      SELECT id, email, phone, role, created_at, updated_at, last_sign_in_at, raw_user_meta_data, raw_app_meta_data
      FROM auth.users
      ORDER BY created_at
    ) t;
  `);
  const authUsers = authRows[0]?.users || [];
  counts['auth.users'] = authUsers.length;

  const authBackupPath = path.join(BACKUP_DIR, `backup_auth_users_production.json`);
  fs.writeFileSync(authBackupPath, JSON.stringify(authUsers, null, 2), 'utf8');
  console.log(`Saved Auth Users Backup to ${authBackupPath} (${authUsers.length} accounts, ${fs.statSync(authBackupPath).size} bytes)`);

  // 3. Schema DDL Backup
  console.log('\n--- 3. Extracting Schema DDL ---');
  const schemaDdlRows = runQuery(`
    SELECT
      table_schema,
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema IN ('public', '_backups')
    ORDER BY table_schema, table_name, ordinal_position;
  `);

  const triggersRows = runQuery(`
    SELECT
      event_object_schema,
      event_object_table,
      trigger_name,
      action_timing,
      event_manipulation,
      action_statement
    FROM information_schema.triggers
    WHERE trigger_schema IN ('public', 'auth')
    ORDER BY event_object_table, trigger_name;
  `);

  const constraintsRows = runQuery(`
    SELECT
      tc.table_schema,
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema IN ('public', '_backups')
    ORDER BY tc.table_schema, tc.table_name, tc.constraint_name;
  `);

  const schemaObj = {
    generated_at: new Date().toISOString(),
    project: 'ierbhbfgqleobjepamrx',
    tables: schemaDdlRows,
    triggers: triggersRows,
    constraints: constraintsRows
  };

  const schemaBackupPath = path.join(BACKUP_DIR, `backup_schema_production.json`);
  fs.writeFileSync(schemaBackupPath, JSON.stringify(schemaObj, null, 2), 'utf8');
  console.log(`Saved Schema DDL Backup to ${schemaBackupPath} (${fs.statSync(schemaBackupPath).size} bytes)`);

  // 4. Verification of Backup Integrity
  console.log('\n--- 4. Verifying Backup File Integrity ---');
  const dSize = fs.statSync(dataBackupPath).size;
  const aSize = fs.statSync(authBackupPath).size;
  const sSize = fs.statSync(schemaBackupPath).size;

  if (dSize < 5000) throw new Error(`Data backup too small: ${dSize} bytes`);
  if (aSize < 1000) throw new Error(`Auth backup too small: ${aSize} bytes`);
  if (sSize < 5000) throw new Error(`Schema backup too small: ${sSize} bytes`);

  // Verify Auth users count is 15
  const parsedAuth = JSON.parse(fs.readFileSync(authBackupPath, 'utf8'));
  if (!Array.isArray(parsedAuth) || parsedAuth.length !== 15) {
    throw new Error(`Auth users count mismatch: expected 15, got ${parsedAuth.length}`);
  }

  console.log('✓ All 3 backup files verified on disk and non-empty:');
  console.log(`  - Data:   ${dataBackupPath} (${dSize} bytes)`);
  console.log(`  - Auth:   ${authBackupPath} (${aSize} bytes, 15 users)`);
  console.log(`  - Schema: ${schemaBackupPath} (${sSize} bytes)`);

  // Print Summary Table
  console.log('\n--- 5. Exact Row Count Inventory ---');
  let totalRows = 0;
  for (const [t, c] of Object.entries(counts)) {
    console.log(`  ${t.padEnd(50)}: ${c}`);
    if (t !== 'auth.users') totalRows += c;
  }
  console.log(`  ${'TOTAL (22 tables)'.padEnd(50)}: ${totalRows}`);
  console.log(`  ${'TOTAL (+ 15 auth.users)'.padEnd(50)}: ${totalRows + counts['auth.users']}`);

  return { counts, paths: { dataBackupPath, authBackupPath, schemaBackupPath } };
}

createBackup().catch(err => {
  console.error('\nBACKUP FAILED:', err);
  process.exit(1);
});
