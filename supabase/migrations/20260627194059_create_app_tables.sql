/*
# Create application tables for Ansyra M&A platform

Creates five tables: users, deals, targets, leads, chat_messages.
RLS enabled on all. Users table is owner-scoped; business tables are permissive.
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- users table
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  avatar text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "lastSignInAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON users;
CREATE POLICY "select_own_profile" ON users FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON users;
CREATE POLICY "insert_own_profile" ON users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON users;
CREATE POLICY "update_own_profile" ON users FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON users;
CREATE POLICY "delete_own_profile" ON users FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============================================================
-- deals table
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  "targetCompany" varchar(255) NOT NULL,
  stage varchar(50) NOT NULL DEFAULT 'sourcing' CHECK (stage IN ('sourcing','evaluation','diligence','negotiation','closing','integration')),
  status varchar(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed','cancelled')),
  value varchar(50),
  industry varchar(100),
  "createdBy" integer,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_deals" ON deals;
CREATE POLICY "anon_select_deals" ON deals FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_deals" ON deals;
CREATE POLICY "anon_insert_deals" ON deals FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_deals" ON deals;
CREATE POLICY "anon_update_deals" ON deals FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_deals" ON deals;
CREATE POLICY "anon_delete_deals" ON deals FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- targets table
-- ============================================================
CREATE TABLE IF NOT EXISTS targets (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  sector varchar(100) NOT NULL,
  ebitda varchar(50),
  revenue varchar(50),
  "fitScore" integer NOT NULL DEFAULT 0,
  description text,
  status varchar(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new','screened','contacted','offer','declined','acquired')),
  "createdBy" integer,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_targets" ON targets;
CREATE POLICY "anon_select_targets" ON targets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_targets" ON targets;
CREATE POLICY "anon_insert_targets" ON targets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_targets" ON targets;
CREATE POLICY "anon_update_targets" ON targets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_targets" ON targets;
CREATE POLICY "anon_delete_targets" ON targets FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- leads table
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  email varchar(320) NOT NULL,
  company varchar(255) NOT NULL,
  role varchar(255),
  type varchar(50) NOT NULL DEFAULT 'access_request' CHECK (type IN ('access_request','contact')),
  subject varchar(255),
  message text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_leads" ON leads;
CREATE POLICY "anon_select_leads" ON leads FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_leads" ON leads;
CREATE POLICY "anon_insert_leads" ON leads FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_leads" ON leads;
CREATE POLICY "anon_update_leads" ON leads FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_leads" ON leads;
CREATE POLICY "anon_delete_leads" ON leads FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- chat_messages table
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id serial PRIMARY KEY,
  "userId" integer,
  role varchar(20) NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  "sessionId" varchar(100),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chat_messages" ON chat_messages;
CREATE POLICY "anon_select_chat_messages" ON chat_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_chat_messages" ON chat_messages;
CREATE POLICY "anon_insert_chat_messages" ON chat_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_chat_messages" ON chat_messages;
CREATE POLICY "anon_update_chat_messages" ON chat_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_chat_messages" ON chat_messages;
CREATE POLICY "anon_delete_chat_messages" ON chat_messages FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS deals_updated_at ON deals;
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS targets_updated_at ON targets;
CREATE TRIGGER targets_updated_at BEFORE UPDATE ON targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();