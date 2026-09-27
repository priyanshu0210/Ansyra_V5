-- Phase 9: AI Target Discovery — persisted web-grounded research runs.
-- Applied on 2026-07-09 via MCP.
CREATE TABLE IF NOT EXISTS public.discovery_runs (
  id serial PRIMARY KEY,
  input jsonb NOT NULL,
  results jsonb NOT NULL,
  "createdBy" uuid,
  organization_id uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.discovery_runs FROM anon, authenticated;
