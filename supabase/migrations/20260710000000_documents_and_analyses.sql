-- Phase 10: Data Room / Document Intelligence — deal documents + AI analyses.
-- Applied on 2026-07-10 via MCP.

CREATE TABLE IF NOT EXISTS public.documents (
  id serial PRIMARY KEY,
  "dealId" integer NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  path text NOT NULL,
  mime varchar(120) NOT NULL,
  size_bytes integer NOT NULL,
  "createdBy" uuid,
  organization_id uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_analyses (
  id serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL CHECK (kind IN ('summary','red_flags','key_terms','dd_checklist')),
  result jsonb NOT NULL,
  model varchar(120),
  "createdBy" uuid,
  organization_id uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.documents, public.document_analyses FROM anon, authenticated;

-- Private bucket: downloads only via short-lived service-role-signed URLs
-- issued after assertDealAccess.
INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-documents', 'deal-documents', false)
ON CONFLICT (id) DO NOTHING;
