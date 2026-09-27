-- Phase 8: profile fields, data-rights soft-delete flag, bug reports, and the
-- first Storage buckets. Applied on 2026-07-09 via MCP.

-- 8.1 Profile columns on users.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS title varchar(120);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone varchar(50);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS firm varchar(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location varchar(120);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone varchar(64);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
-- 8.6 data rights: soft account-deletion request.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

-- 8.5 Bug reports (deny-by-default; access is admin-permission-based, not scopeFilter).
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id serial PRIMARY KEY,
  title varchar(200),
  description text,
  page varchar(120),
  severity varchar(16) CHECK (severity IN ('low','medium','high')),
  screenshots text[] NOT NULL DEFAULT '{}',
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','fixed','closed')),
  reporter uuid,
  organization_id uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.bug_reports FROM anon, authenticated;

-- Storage buckets: avatars is public-read; bug-screenshots is private (access
-- only via service-role-signed URLs). All uploads go through signed upload URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true), ('bug-screenshots', 'bug-screenshots', false)
ON CONFLICT (id) DO NOTHING;
