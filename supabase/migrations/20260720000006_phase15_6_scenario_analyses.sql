-- Phase 15.6 — Scenario Analysis (+ time-phased synergies)
-- Base/upside/downside cases composed from a deal's stress-tested assumptions:
-- no IC accepts a single-point thesis. Immutable snapshots (regenerate to
-- update), like ic_memos. `assumption_count` powers the staleness hint ("built
-- from 3 assumptions — you've added 2 since").
--
-- Synergy phasing needs NO migration: `periods` is an optional array inside the
-- existing synergy_plans.categories jsonb, so every plan saved before 15.6 keeps
-- loading unchanged (contracts/synergy.ts treats absent periods as unphased).
-- RLS: enabled with NO policies — deny-by-default, server-enforced scoping.

CREATE TABLE IF NOT EXISTS public.scenario_analyses (
  id serial PRIMARY KEY,
  deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  assumption_count integer NOT NULL DEFAULT 0,
  model varchar(120),
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenario_analyses_deal_idx ON public.scenario_analyses(deal_id);
ALTER TABLE public.scenario_analyses ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_features (user_id, feature_key)
SELECT u.id, 'scenarios'
FROM public.users u
WHERE u.user_kind = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_features f
    WHERE f.user_id = u.id AND f.feature_key = 'scenarios'
  );
