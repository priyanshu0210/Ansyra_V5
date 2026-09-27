-- Admin is a permission flag, separate from the persona `role` column.
-- Applied on 2026-07-06 via MCP.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
