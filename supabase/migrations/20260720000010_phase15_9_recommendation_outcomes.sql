-- Phase 15.9 — Outcome ledger
-- What actually happened to a conclusion. A recommendation records what the firm
-- believed; this records what came of it.
--
-- APPEND-ONLY, MANY PER RECOMMENDATION. The trajectory is the point: being wrong
-- at 30 days and right at 6 months is precisely the signal a failure-pattern
-- detector reads, and one editable verdict destroys it. There is deliberately no
-- `updated_at` column here and no update/delete procedure in the router — the
-- absence of that column IS the rule. A read that turns out wrong is answered
-- with another read; a later entry does not erase an earlier one, it dates it.
--
-- Outcomes attach to any DECIDED recommendation, REJECTED INCLUDED. A rejected
-- recommendation that turned out true — or an accepted one that turned out
-- false — is the highest-signal row in the whole system, and restricting the
-- ledger to accepted rows would silently discard the more instructive half.
--
-- `deal_id` is denormalised off the recommendation so the panel can read every
-- outcome on a deal in ONE query to render N cards, and so ownerScope has a
-- deal-local read. `created_by` IS the ledger's "recorded by"; it carries the
-- standard name because ownerScope reads created_by/organization_id.
--
-- No new feature key: outcomes ride on `recommendations`. A member who can
-- accept a recommendation must be able to record what came of it — that is the
-- accountability half of the same act, not a separate privilege.
--
-- RLS: enabled with NO policies — deny-by-default, server-enforced scoping.

CREATE TABLE IF NOT EXISTS public.recommendation_outcomes (
  id serial PRIMARY KEY,
  recommendation_id integer NOT NULL
    REFERENCES public.recommendations(id) ON DELETE CASCADE,
  deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  -- held | partially_held | contradicted | too_early | moot
  outcome_type varchar(24) NOT NULL,
  outcome_summary text NOT NULL,
  -- 30_day | 90_day | 6_month | post_close | ad_hoc. Nullable: an ad-hoc
  -- observation is still worth keeping.
  horizon varchar(16),
  metric_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The date of the READING, not of the insert. User-settable, because a 30-day
  -- read written up in month two is still a 30-day read.
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The card's read: this recommendation's trajectory, in order.
CREATE INDEX IF NOT EXISTS recommendation_outcomes_rec_idx
  ON public.recommendation_outcomes(recommendation_id, recorded_at);
-- The panel's batch read: every outcome on the deal, one query for N cards.
CREATE INDEX IF NOT EXISTS recommendation_outcomes_deal_idx
  ON public.recommendation_outcomes(deal_id);

ALTER TABLE public.recommendation_outcomes ENABLE ROW LEVEL SECURITY;
