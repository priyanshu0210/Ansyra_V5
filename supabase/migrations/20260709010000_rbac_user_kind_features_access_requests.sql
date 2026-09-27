-- Phase 7: RBAC — user kinds, per-user feature grants, admin permission
-- checklist, and the access-request pipeline. Applied on 2026-07-09 via MCP.

-- 1. User kind + admin permission checklist on users.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_kind varchar(16) NOT NULL DEFAULT 'member'
  CHECK (user_kind IN ('main_admin','admin','member'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS admin_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill kinds: existing is_admin users become plain admins. is_admin is kept
-- (legacy) but is no longer authoritative — every gate reads user_kind.
--
-- The main_admin is NOT set here. It used to be a hard-coded UPDATE matching one
-- operator's email address, which meant this migration granted nothing at all on
-- any other database and left a fresh deployment with no reachable admin
-- console. Bootstrapping the first main_admin is a deployment step, not a schema
-- step:
--
--   npx tsx scripts/bootstrap-admin.ts you@example.com
--
UPDATE public.users SET user_kind='admin' WHERE is_admin = true AND user_kind='member';

-- 2. Per-user feature grants (which product tabs/routes a member can reach).
CREATE TABLE IF NOT EXISTS public.user_features (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  feature_key varchar(40) NOT NULL,
  granted_by uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature_key)
);

-- 3. Public access-request intake → admin review → provisioned user.
CREATE TABLE IF NOT EXISTS public.access_requests (
  id serial PRIMARY KEY,
  request_type varchar(16) NOT NULL DEFAULT 'individual' CHECK (request_type IN ('individual','organization')),
  name varchar(255) NOT NULL,
  email varchar(320) NOT NULL,
  company varchar(255),
  role varchar(255),
  phone varchar(50),
  reason text,
  requested_features text[] NOT NULL DEFAULT '{}',
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_user_id uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- Deny-by-default over the REST/anon path (same posture as every other table).
ALTER TABLE public.user_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_features, public.access_requests FROM anon, authenticated;

-- 4. Grandfather every existing member into the 8 currently-live features.
INSERT INTO public.user_features (user_id, feature_key)
SELECT u.id, k.key
FROM public.users u
CROSS JOIN (VALUES
  ('pipeline'),('targets'),('genome'),('assumptions'),
  ('cultural'),('regulatory'),('synergy'),('analytics')
) AS k(key)
WHERE u.user_kind = 'member'
ON CONFLICT DO NOTHING;
