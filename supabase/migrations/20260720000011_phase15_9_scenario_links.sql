-- Phase 15.9 — Recommendation ↔ scenario links
-- A recommendation is a claim; a scenario is a range the claim was drawn
-- against. Linking them turns the dossier into something you can interrogate:
-- "if this conclusion is wrong, which case are we in?"
--
-- The link points at a SPECIFIC scenario_analyses snapshot, not at "the deal's
-- scenarios". Those rows are immutable and regenerating inserts a NEW one, so
-- this pins what the recommender actually read. It deliberately never re-points
-- at the latest run — a citation that follows a regeneration is not a citation.
-- When a newer snapshot exists the UI says so, computed server-side by
-- contracts/scenario-links.ts::linkStaleness (an id comparison; scenario_analyses.id
-- is a serial and therefore monotonic, so no clock and no tie-break are needed).
--
-- `case_name` is NOT NULL DEFAULT 'all' precisely so the unique index below
-- dedupes: NULLs never collide in Postgres, which would make it useless.
--
-- Unlike recommendation_outcomes, links ARE deletable. The asymmetry is
-- deliberate: a link is metadata about a citation and a wrong one is noise; an
-- outcome is a dated claim about reality.
--
-- No new feature key: links ride on `recommendations`, resolved by authorship
-- rather than display. Every link procedure is featureQuery('recommendations')
-- and staleness is computed server-side, so a recommendations-only member reads
-- every link with full staleness and never calls a scenarios-gated procedure.
--
-- RLS: enabled with NO policies — deny-by-default, server-enforced scoping.

CREATE TABLE IF NOT EXISTS public.recommendation_scenarios (
  id serial PRIMARY KEY,
  recommendation_id integer NOT NULL
    REFERENCES public.recommendations(id) ON DELETE CASCADE,
  scenario_analysis_id integer NOT NULL
    REFERENCES public.scenario_analyses(id) ON DELETE CASCADE,
  deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  -- all | base | upside | downside
  case_name varchar(12) NOT NULL DEFAULT 'all',
  -- supports | assumes | relevant_if_false | stress_case | contradicted_by
  relation varchar(24) NOT NULL DEFAULT 'supports',
  note text,
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recommendation_scenarios_unique_idx
  ON public.recommendation_scenarios(recommendation_id, scenario_analysis_id, case_name);
CREATE INDEX IF NOT EXISTS recommendation_scenarios_rec_idx
  ON public.recommendation_scenarios(recommendation_id);
CREATE INDEX IF NOT EXISTS recommendation_scenarios_scenario_idx
  ON public.recommendation_scenarios(scenario_analysis_id);
CREATE INDEX IF NOT EXISTS recommendation_scenarios_deal_idx
  ON public.recommendation_scenarios(deal_id);

ALTER TABLE public.recommendation_scenarios ENABLE ROW LEVEL SECURITY;
