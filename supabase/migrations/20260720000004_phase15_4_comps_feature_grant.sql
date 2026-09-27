-- Phase 15.4 — Comps Engine
-- NO new tables: comps are a read model over deals ⋈ deal_economics, aggregated
-- with percentile_cont in Postgres. The supporting partial index
-- (deal_economics_multiples_idx) already shipped with the 15.2 migration.
-- This migration only issues the feature grant.

INSERT INTO public.user_features (user_id, feature_key)
SELECT u.id, 'comps'
FROM public.users u
WHERE u.user_kind = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_features f
    WHERE f.user_id = u.id AND f.feature_key = 'comps'
  );
