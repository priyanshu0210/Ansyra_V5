-- Phase 15.3 — Deal Timeline & Deadlines
-- Milestones are MANY-per-deal rows, not columns on `deals`: the set varies by
-- deal (a corporate buyer may have none of the PE ones). due_date is a DATE, not
-- a timestamptz — a closing date is a calendar day, and a timestamp would shift
-- the date for anyone in another timezone. last_notified makes the reminder job
-- idempotent (see contracts/milestones.ts::dueReminder).
-- RLS: enabled with NO policies — deny-by-default, server-enforced scoping.

CREATE TABLE IF NOT EXISTS public.deal_milestones (
  id serial PRIMARY KEY,
  deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL CHECK (kind IN
    ('loi_signed','exclusivity_expiry','filing_submitted','regulatory_deadline',
     'financing_commitment','signing','closing','custom')),
  custom_label varchar(120),
  due_date date NOT NULL,
  note text,
  completed boolean NOT NULL DEFAULT false,
  last_notified jsonb,
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A custom milestone must carry its own label; the fixed kinds must not.
  CONSTRAINT deal_milestones_custom_label_ck
    CHECK ((kind = 'custom') = (custom_label IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS deal_milestones_deal_idx ON public.deal_milestones(deal_id);
-- Partial index: the upcoming-deadlines widget and the daily reminder sweep both
-- only ever look at incomplete milestones ordered by date.
CREATE INDEX IF NOT EXISTS deal_milestones_due_idx
  ON public.deal_milestones(due_date) WHERE NOT completed;

ALTER TABLE public.deal_milestones ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_features (user_id, feature_key)
SELECT u.id, 'timeline'
FROM public.users u
WHERE u.user_kind = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_features f
    WHERE f.user_id = u.id AND f.feature_key = 'timeline'
  );
