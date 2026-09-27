-- ─────────────────────────────────────────────────────────────────────────────
-- Ansyra: organizations + role/organization scoping on users, deals, targets
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. organizations table --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_lower_idx
  ON public.organizations (lower(name));

-- 2. users: expand role enum + add organization_id ------------------------
-- The existing CHECK constrains role to ('user','admin'). We migrate any legacy
-- 'user'/'admin' rows to the new default 'other', then swap the constraint.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE public.users
   SET role = 'other'
 WHERE role NOT IN (
   'private_equity', 'corporate_development', 'ma_advisor',
   'freelancer', 'other'
 );

ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'other';

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'private_equity', 'corporate_development', 'ma_advisor',
    'freelancer', 'other'
  ));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_organization_id_idx
  ON public.users (organization_id);

-- 3. deals: reuse existing createdBy as user_id + add organization_id -----
-- The `createdBy` column already exists as uuid (added in an earlier fix).
-- We reuse it and add an FK to auth.users (which mirrors public.users.id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'deals_createdby_fkey'
       AND table_name = 'deals'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_createdby_fkey
      FOREIGN KEY ("createdBy") REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS deals_createdby_idx        ON public.deals ("createdBy");
CREATE INDEX IF NOT EXISTS deals_organization_id_idx  ON public.deals (organization_id);

-- 4. targets: same pattern -----------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'targets_createdby_fkey'
       AND table_name = 'targets'
  ) THEN
    ALTER TABLE public.targets
      ADD CONSTRAINT targets_createdby_fkey
      FOREIGN KEY ("createdBy") REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.targets
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS targets_createdby_idx        ON public.targets ("createdBy");
CREATE INDEX IF NOT EXISTS targets_organization_id_idx  ON public.targets (organization_id);
