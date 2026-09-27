-- Phase 13.3: resolve Supabase advisor findings (security + performance).

-- ── Security: pin search_path on our functions (mutable-search_path lint) ──
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
-- This platform helper exists on hosted projects but not on every local CLI
-- version. Harden it when present; do not create a privileged helper locally.
DO $migration$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    ALTER FUNCTION public.rls_auto_enable() SET search_path = '';
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END
$migration$;

-- ── Security: rls_auto_enable is an event-trigger helper; it must not be
--    callable through PostgREST RPC by anon/authenticated roles ─────────────




-- ── Performance: users policies — evaluate auth.uid() once per statement ───
ALTER POLICY select_own_profile ON public.users USING ((SELECT auth.uid()) = id);
ALTER POLICY insert_own_profile ON public.users WITH CHECK ((SELECT auth.uid()) = id);
ALTER POLICY update_own_profile ON public.users USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
ALTER POLICY delete_own_profile ON public.users USING ((SELECT auth.uid()) = id);

-- ── Performance: covering indexes for every advisor-flagged foreign key ────
CREATE INDEX IF NOT EXISTS idx_assumptions_organization_id ON public.assumptions (organization_id);
CREATE INDEX IF NOT EXISTS idx_cultural_scores_deal_id ON public.cultural_scores ("dealId");
CREATE INDEX IF NOT EXISTS idx_cultural_scores_organization_id ON public.cultural_scores (organization_id);
CREATE INDEX IF NOT EXISTS idx_document_analyses_document_id ON public.document_analyses (document_id);
CREATE INDEX IF NOT EXISTS idx_documents_deal_id ON public.documents ("dealId");
CREATE INDEX IF NOT EXISTS idx_regulatory_analyses_deal_id ON public.regulatory_analyses ("dealId");
CREATE INDEX IF NOT EXISTS idx_regulatory_analyses_organization_id ON public.regulatory_analyses (organization_id);
CREATE INDEX IF NOT EXISTS idx_synergy_plans_organization_id ON public.synergy_plans (organization_id);
