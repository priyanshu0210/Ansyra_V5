-- Phase 15.2 — Deal Economics
-- One record per deal (unique deal_id, like synergy_plans). All amounts are in
-- MILLIONS of `currency` — same convention as deals.value_amount. Derived
-- columns (ev_ebitda, ev_revenue, irr_estimate, moic_estimate) are recomputed
-- SERVER-SIDE from contracts/economics.ts on every save; clients never supply
-- them. `realized` is present from day one as the comps-engine (15.4) seed.
-- RLS: enabled with NO policies — deny-by-default, server-enforced scoping.

CREATE TABLE IF NOT EXISTS public.deal_economics (
  id serial PRIMARY KEY,
  deal_id integer NOT NULL UNIQUE REFERENCES public.deals(id) ON DELETE CASCADE,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  enterprise_value numeric,
  equity_value numeric,
  net_debt numeric,
  target_ebitda numeric,
  target_revenue numeric,
  ev_ebitda numeric,
  ev_revenue numeric,
  pe_inputs jsonb,
  irr_estimate numeric,
  moic_estimate numeric,
  sources_uses jsonb,
  realized jsonb,
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Supports the comps-engine joins/filters (Phase 15.4) and multiples sorting.
CREATE INDEX IF NOT EXISTS deal_economics_multiples_idx
  ON public.deal_economics(ev_ebitda) WHERE ev_ebitda IS NOT NULL;
ALTER TABLE public.deal_economics ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_features (user_id, feature_key)
SELECT u.id, 'economics'
FROM public.users u
WHERE u.user_kind = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_features f
    WHERE f.user_id = u.id AND f.feature_key = 'economics'
  );
