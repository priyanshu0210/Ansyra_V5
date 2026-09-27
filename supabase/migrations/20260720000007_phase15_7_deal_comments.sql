-- Phase 15.7 — Deal Comments
-- The first collaboration primitive: a flat discussion thread per deal. Org
-- members read the whole thread; edit/delete are own-row-only (enforced in the
-- router's WHERE clause). Hard-delete (no tombstones); the activity log keeps
-- the trace. RLS: enabled with NO policies — deny-by-default, server-enforced.

CREATE TABLE IF NOT EXISTS public.deal_comments (
  id serial PRIMARY KEY,
  deal_id integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  body text NOT NULL,
  edited_at timestamptz,
  created_by uuid NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_comments_deal_idx ON public.deal_comments(deal_id);
ALTER TABLE public.deal_comments ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_features (user_id, feature_key)
SELECT u.id, 'comments'
FROM public.users u
WHERE u.user_kind = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_features f
    WHERE f.user_id = u.id AND f.feature_key = 'comments'
  );
