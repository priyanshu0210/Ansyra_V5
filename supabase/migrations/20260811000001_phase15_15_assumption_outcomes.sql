-- Phase 15.15 — Assumption-to-outcome ledger
-- The learning layer for the decision engine: the half of the loop that was
-- missing. Since 15.9 a RECOMMENDATION can be read back at 30/90/180 days and
-- post-close, but an assumption could not — even though the assumption is the
-- thing that actually turns out to be right or wrong. A recommendation is a
-- conclusion; the assumption underneath it is the claim about the world.
--
-- Deliberately small. `assumptions` has been a real table since Phase 3 with
-- exactly one producer (ai.stressTestAssumption), so nothing is being unified
-- here and no `module`/`source` column is added — it would read 'assumptions'
-- on every row ever written. Recommendation -> assumption links already exist
-- as supporting_evidence with kind 'assumption' (15.8), and scenario ->
-- assumption already resolves through 15.13, so NO join table is added either:
-- a second place for the same fact is a second place for it to drift.
--
-- This migration is therefore two things and nothing else:
--   1. assumptions.category — the axis cross-deal learning folds on.
--   2. assumption_outcomes  — the append-only reads.

-- ─── 1. The category axis ────────────────────────────────────────────────────
-- Free text cannot be aggregated: "EBITDA margin holds" and "margins are
-- sustainable" are one claim that no GROUP BY can see. A closed vocabulary set
-- at creation is what makes "revenue-retention assumptions were contradicted in
-- 4 of 7 post-close reads" a sentence the product is allowed to say.
--
-- Nullable, with no backfill and no default: existing rows predate the concept
-- and guessing their category from statement text would be exactly the fuzzy
-- matching 15.13 refused for scenario drivers. contracts/assumption-ledger.ts
-- reads NULL as 'other', so nothing disappears from the deal panel; the
-- cross-deal fold excludes 'other' from topic claims rather than inventing one.
--
-- No CHECK constraint, matching every other vocabulary column in this schema
-- (recommendations.status, recommendation_outcomes.outcome_type): the closed
-- set lives in contracts/ and is enforced by zod at the boundary, so adding a
-- value stays a code change rather than a migration.
ALTER TABLE public.assumptions
  ADD COLUMN IF NOT EXISTS category varchar(32);

COMMENT ON COLUMN public.assumptions.category IS
  'Closed vocabulary from contracts/assumption-ledger.ts (revenue_retention, margin, integration, regulatory, market, financing, other). The axis cross-deal assumption learning folds on. NULL means pre-15.15; read as "other".';

-- ─── 2. The append-only reads ────────────────────────────────────────────────
-- A near-exact sibling of recommendation_outcomes, on purpose: a read is a
-- read, so it reuses the same vocabulary (held / partially_held / contradicted
-- / too_early / moot), the same horizons, and the same "recorded_at is the date
-- of the READING, not of the insert" rule.
--
-- APPEND-ONLY, like its sibling. There is no updated_at and no update/delete
-- procedure anywhere in the API. Correcting a read means recording another one;
-- the trajectory (wrong at 30 days, right at 6 months) IS the signal this table
-- exists to preserve, and an UPDATE would destroy exactly that.
CREATE TABLE IF NOT EXISTS public.assumption_outcomes (
  id serial PRIMARY KEY,

  assumption_id integer NOT NULL
    REFERENCES public.assumptions(id) ON DELETE CASCADE,

  -- Denormalised, exactly as recommendation_outcomes.deal_id is: the panel
  -- reads every outcome on a deal in ONE query to render N rows, and ownerScope
  -- needs a deal-local read regardless.
  deal_id integer NOT NULL
    REFERENCES public.deals(id) ON DELETE CASCADE,

  outcome_type varchar(24) NOT NULL,
  outcome_summary text NOT NULL,

  -- NULL = an ad-hoc read that satisfies no scheduled horizon. Reported as
  -- unlabelled rather than silently credited to one — matching on the label is
  -- exact, never inferred from recorded_at, because recorded_at is user-settable
  -- ("a 30-day read written up in month two is still a 30-day read").
  horizon varchar(16),

  -- EXPLICIT, never inferred. When a recommendation outcome implies something
  -- about an assumption underneath it, the person filing says so and we store
  -- the pointer. Nothing in this system mutates an assumption's state because a
  -- recommendation outcome landed: the brief asked for a traceable ledger, not
  -- magical hidden updates, and a derived link would be unfalsifiable later.
  -- ON DELETE SET NULL: recommendation outcomes are themselves append-only, so
  -- this only fires if a recommendation cascades away, and losing the pointer
  -- must not lose the assumption read.
  recommendation_outcome_id integer
    REFERENCES public.recommendation_outcomes(id) ON DELETE SET NULL,

  -- Same shape as recommendations.supporting_evidence, so the per-kind resolver
  -- in recommendations-router.ts reads it with no new code.
  metric_links jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- The date of the READING, not of the insert. User-settable by design.
  recorded_at timestamptz NOT NULL DEFAULT now(),

  -- Standard ownership pair: api/lib/scope.ts::ownerScope reads exactly these
  -- names off the schema, which is also why this table is snake_case even
  -- though `assumptions` itself is camelCase ("dealId"/"createdBy") — the older
  -- table predates the convention and is not being rewritten here.
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One assumption's trajectory, in order — the card's read.
CREATE INDEX IF NOT EXISTS assumption_outcomes_assumption_idx
  ON public.assumption_outcomes (assumption_id, recorded_at);

-- Every outcome on the deal in one query — the panel's batch read.
CREATE INDEX IF NOT EXISTS assumption_outcomes_deal_idx
  ON public.assumption_outcomes (deal_id);

-- The cross-deal fold groups on (category, horizon, outcome_type); this is the
-- supporting index for the scoped scan behind it.
CREATE INDEX IF NOT EXISTS assumption_outcomes_learning_idx
  ON public.assumption_outcomes (organization_id, created_by, horizon);

COMMENT ON TABLE public.assumption_outcomes IS
  'Append-only reads against an assumption at 30/90-day, 6-month and post-close horizons. Never updated or deleted — correcting a read means recording another. Phase 15.15.';

-- RLS on, zero policies: deny-by-default at the database, every read scoped
-- server-side by ownerScope. Identical posture to every other table here.
ALTER TABLE public.assumption_outcomes ENABLE ROW LEVEL SECURITY;
