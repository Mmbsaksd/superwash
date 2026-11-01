const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

async function testSqlLifecycle() {
  console.log('Running database_lifecycle_test.sql in isolated PostgreSQL...');
  const db = new PGlite();

  // Initialize Auth & Environment
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      instance_id UUID,
      aud VARCHAR(255),
      role VARCHAR(255),
      email VARCHAR(255),
      encrypted_password VARCHAR(255),
      email_confirmed_at TIMESTAMPTZ,
      raw_app_meta_data JSONB,
      raw_user_meta_data JSONB,
      created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
      updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
    );
    CREATE PUBLICATION supabase_realtime;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    $$ LANGUAGE sql STABLE;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
    $$ LANGUAGE sql STABLE;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::JSONB;
    $$ LANGUAGE sql STABLE;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
  `);

  // Apply all migrations
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      const normA = a.replace('20261022_', '20261022000000_');
      const normB = b.replace('20261022_', '20261022000000_');
      return normA.localeCompare(normB);
    });

  for (const file of migrationFiles) {
    const fullPath = path.join(migrationsDir, file);
    await db.exec(fs.readFileSync(fullPath, 'utf8'));
  }

  // Pre-seed mock users in auth.users
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('a0000000-0000-4000-a000-000000000001', 'custA@test.com'),
      ('a0000000-0000-4000-a000-000000000002', 'custB@test.com'),
      ('a0000000-0000-4000-a000-000000000003', 'owner@test.com'),
      ('a0000000-0000-4000-a000-000000000004', 'courier@test.com')
    ON CONFLICT (id) DO NOTHING;
  `);

  // Run database_lifecycle_test.sql
  const testSql = fs.readFileSync(path.join(__dirname, 'database_lifecycle_test.sql'), 'utf8');
  await db.exec(testSql);
  console.log('✓ database_lifecycle_test.sql executed successfully without any errors!');
}

testSqlLifecycle().catch(err => {
  console.error('❌ database_lifecycle_test.sql failed:', err);
  process.exit(1);
});

