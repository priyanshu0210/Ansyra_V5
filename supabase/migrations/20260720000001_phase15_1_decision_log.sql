-- Phase 15.1 — Decision Log & IC Memo
-- Two additive tables. `decisions` is the append-only reasoning behind each
-- stage transition and the enforcement path for the stage-gate; `ic_memos`
-- stores AI-assembled committee memos. RLS is enabled with NO permissive
-- policies (deny-by-default) — the server bypasses RLS as the connection owner
-- and enforces scoping in code via scopeFilter / assertDealAccess, exactly like
-- every other product table (see the Phase 5 RLS lockdown).

CREATE TABLE IF NOT EXISTS public.decisions (
  id serial PRIMARY KEY,
  deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  decision_type varchar(24) NOT NULL CHECK (decision_type IN
    ('advance','hold','pass','approve_loi','approve_binding','kill','other')),
  from_stage varchar(24),
  to_stage varchar(24),
  rationale text NOT NULL,
  outcome jsonb,
  decided_by uuid NOT NULL REFERENCES public.users(id),
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_deal_idx ON public.decisions(deal_id);
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ic_memos (
  id serial PRIMARY KEY,
  deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  model varchar(120),
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ic_memos_deal_idx ON public.ic_memos(deal_id);
ALTER TABLE public.ic_memos ENABLE ROW LEVEL SECURITY;

-- Backfill: grant the new 'decisions' feature to every existing member who
-- already holds 'pipeline', so the stage-gate never blocks a current user from
-- advancing a deal. New members get it via DEFAULT_MEMBER_FEATURES.
INSERT INTO public.user_features (user_id, feature_key)
SELECT DISTINCT uf.user_id, 'decisions'
FROM public.user_features uf
WHERE uf.feature_key = 'pipeline'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_features x
    WHERE x.user_id = uf.user_id AND x.feature_key = 'decisions'
  );
