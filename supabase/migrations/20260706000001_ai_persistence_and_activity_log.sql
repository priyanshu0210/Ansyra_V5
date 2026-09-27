-- AI outputs + activity feed. Scoping matches deals/targets:
-- owned by "createdBy", shared via organization_id, enforced server-side.
-- Applied on 2026-07-06 via MCP.

CREATE TABLE IF NOT EXISTS public.assumptions (
  id serial PRIMARY KEY,
  "dealId" integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  assumption text NOT NULL,
  reviewer varchar(255),
  "reviewerNote" text,
  result jsonb,
  "createdBy" uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cultural_scores (
  id serial PRIMARY KEY,
  acquirer varchar(255) NOT NULL,
  target varchar(255) NOT NULL,
  sector varchar(100),
  "dealId" integer REFERENCES public.deals(id) ON DELETE SET NULL,
  result jsonb NOT NULL,
  "createdBy" uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.regulatory_analyses (
  id serial PRIMARY KEY,
  target varchar(255) NOT NULL,
  sector varchar(100) NOT NULL,
  geography varchar(100) NOT NULL,
  "combinedMarketShare" varchar(50),
  "dealId" integer REFERENCES public.deals(id) ON DELETE SET NULL,
  result jsonb NOT NULL,
  "createdBy" uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.synergy_plans (
  id serial PRIMARY KEY,
  "dealId" integer NOT NULL UNIQUE REFERENCES public.deals(id) ON DELETE CASCADE,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  analysis jsonb,
  "createdBy" uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id serial PRIMARY KEY,
  type varchar(20) NOT NULL,
  action varchar(120) NOT NULL,
  detail text,
  "dealId" integer,
  "targetId" integer,
  "userId" uuid,
  organization_id uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assumptions_deal_idx ON public.assumptions ("dealId");
CREATE INDEX IF NOT EXISTS assumptions_scope_idx ON public.assumptions ("createdBy", organization_id);
CREATE INDEX IF NOT EXISTS cultural_scores_scope_idx ON public.cultural_scores ("createdBy", organization_id);
CREATE INDEX IF NOT EXISTS regulatory_scope_idx ON public.regulatory_analyses ("createdBy", organization_id);
CREATE INDEX IF NOT EXISTS activity_scope_time_idx ON public.activity_log ("userId", organization_id, "createdAt" DESC);

ALTER TABLE public.assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultural_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synergy_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
