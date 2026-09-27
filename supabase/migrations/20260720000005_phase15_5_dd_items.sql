-- Phase 15.5 — DD Tracker
-- Diligence as a LIVING checklist rather than a one-shot AI report. Seeded from
-- the 12 standard DD_CHECKLIST_ITEMS; custom items can be added per deal.
-- `manually_set` is the linchpin of the AI-import merge rule: once a human rules
-- on an item, an imported analysis may append a note but can NEVER restatus it
-- (contracts/dd-merge.ts). `is_standard` protects the canonical 12 from deletion
-- (they get status n_a instead) so the checklist stays auditable.
-- RLS: enabled with NO policies — deny-by-default, server-enforced scoping.

CREATE TABLE IF NOT EXISTS public.dd_items (
  id serial PRIMARY KEY,
  deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  item text NOT NULL,
  workstream varchar(24) NOT NULL CHECK (workstream IN
    ('legal','financial','tax','hr','it','commercial','regulatory','other')),
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN
    ('open','requested','received','reviewed','issue','n_a')),
  assignee_id uuid,
  note text,
  is_standard boolean NOT NULL DEFAULT false,
  manually_set boolean NOT NULL DEFAULT false,
  source_analysis_id integer REFERENCES public.document_analyses(id) ON DELETE SET NULL,
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Makes seeding idempotent and blocks duplicate checklist lines per deal.
  CONSTRAINT dd_items_deal_item_uq UNIQUE (deal_id, item)
);

CREATE INDEX IF NOT EXISTS dd_items_deal_idx ON public.dd_items(deal_id);
ALTER TABLE public.dd_items ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_features (user_id, feature_key)
SELECT u.id, 'dd_tracker'
FROM public.users u
WHERE u.user_kind = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_features f
    WHERE f.user_id = u.id AND f.feature_key = 'dd_tracker'
  );
