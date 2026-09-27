-- Phase 6: forced password change for admin-issued temporary passwords.
-- Set true when an admin creates a user with a temp password or resets one;
-- cleared when the user completes a password change (auth.changePassword).
-- Applied on 2026-07-09 via MCP.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
