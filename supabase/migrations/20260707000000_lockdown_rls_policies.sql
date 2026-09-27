-- Phase 5.1: drop misleading USING(true) anon policies (latent landmines) and
-- make the deny-by-default state explicit + drift-proof. The server connects as
-- the table-owning postgres role and is unaffected by these grants/policies.
-- Applied on 2026-07-07 via MCP.
-- NOTE: audit re-verified these anon policies were NOT exploitable — anon/authenticated
-- never held DML grants — but the policies were misleading; this enforces the safe state.

DROP POLICY IF EXISTS anon_select_deals ON public.deals;
DROP POLICY IF EXISTS anon_insert_deals ON public.deals;
DROP POLICY IF EXISTS anon_update_deals ON public.deals;
DROP POLICY IF EXISTS anon_delete_deals ON public.deals;
DROP POLICY IF EXISTS anon_select_targets ON public.targets;
DROP POLICY IF EXISTS anon_insert_targets ON public.targets;
DROP POLICY IF EXISTS anon_update_targets ON public.targets;
DROP POLICY IF EXISTS anon_delete_targets ON public.targets;
DROP POLICY IF EXISTS anon_select_leads ON public.leads;
DROP POLICY IF EXISTS anon_insert_leads ON public.leads;
DROP POLICY IF EXISTS anon_update_leads ON public.leads;
DROP POLICY IF EXISTS anon_delete_leads ON public.leads;
DROP POLICY IF EXISTS anon_select_chat_messages ON public.chat_messages;
DROP POLICY IF EXISTS anon_insert_chat_messages ON public.chat_messages;
DROP POLICY IF EXISTS anon_update_chat_messages ON public.chat_messages;
DROP POLICY IF EXISTS anon_delete_chat_messages ON public.chat_messages;

REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;
