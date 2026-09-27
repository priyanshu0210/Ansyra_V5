-- Phase 15.8 — Recommendations
-- AI outputs and human conclusions as first-class persistent records: claim,
-- rationale, cited evidence, counterarguments, confidence, owner, expiry,
-- status. Linked to a deal AND to the stage the conclusion was reached at.
--
-- Accepted, unexpired recommendations are what the HARD stage-gate checks on
-- forward moves into diligence / negotiation / closing / integration (enforced
-- inside the decisions.record transaction; predicate in
-- contracts/recommendation-gate.ts). sourcing -> evaluation stays ungated.
--
-- `supersedes_id` is self-referential: a recommendation is never edited after
-- acceptance, it is replaced, and the chain stays auditable.
-- `confidence` is an integer 0-100; the low/medium/high band is derived by a
-- pure helper, mirroring assumptions.result.optimism_score + src/lib/severity.ts.
--
-- No CHECK constraints on stage/owner/status, consistent with every other table
-- here (decisions.decision_type, dd_items.status): the vocabulary is enforced by
-- zod at the router boundary and by $type<>() in Drizzle.
--
-- RLS: enabled with NO policies — deny-by-default, server-enforced scoping.
--
-- NOTE: the gate is not retroactive, but it is not free either. Deals already
-- past `sourcing` carry no recommendations, so the FIRST forward move into a
-- gated stage after this ships is blocked until someone records one. Demo deals
-- are affected too. Deliberate: a gate with a grandfather clause is a gate
-- nobody trusts. Unblocking is two clicks — draft with AI, accept.

CREATE TABLE IF NOT EXISTS public.recommendations (
  id serial PRIMARY KEY,
  deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  stage varchar(24) NOT NULL,
  claim text NOT NULL,
  rationale text NOT NULL,
  supporting_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  counterarguments jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer NOT NULL DEFAULT 50,
  owner varchar(8) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'draft',
  expires_at timestamptz,
  supersedes_id integer REFERENCES public.recommendations(id) ON DELETE SET NULL,
  decided_by uuid,
  decided_at timestamptz,
  model varchar(120),
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recommendations_deal_idx ON public.recommendations(deal_id);
CREATE INDEX IF NOT EXISTS recommendations_gate_idx
  ON public.recommendations(deal_id, stage, status);
CREATE INDEX IF NOT EXISTS recommendations_supersedes_idx
  ON public.recommendations(supersedes_id);
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

-- IC memo provenance: which recommendations the memo was composed from. Kept
-- OUT of ic_memos.result, which is the model's output shape. Nullable, so every
-- existing memo row is untouched.
ALTER TABLE public.ic_memos ADD COLUMN IF NOT EXISTS recommendation_ids jsonb;

INSERT INTO public.user_features (user_id, feature_key)
SELECT u.id, 'recommendations'
FROM public.users u
WHERE u.user_kind = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_features f
    WHERE f.user_id = u.id AND f.feature_key = 'recommendations'
  );
