-- Release-review remediation (2026-09-10).
--
-- 1. organizations was the one public table created without RLS. Its grants
--    were already revoked by the Phase 5 lockdown, so nothing was reachable,
--    but the advisor flagged it and a future GRANT would have exposed the
--    tenant list. Same deny-by-default posture as every other table.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.organizations FROM anon, authenticated;

-- 2. Reversible offboarding. decisions.decided_by references users with no
--    ON DELETE action (an audit record must stay attributed), which made a
--    hard delete of any user who had recorded a decision fail inside GoTrue's
--    cascade. admin.removeUser now DEACTIVATES such accounts instead: sign-in
--    banned, sessions revoked, feature grants removed, and this column set.
--    authenticateRequest refuses any account with it populated.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

COMMENT ON COLUMN public.users.deactivated_at IS
  'Set by admin.removeUser for accounts that authored records. Sign-in is refused while non-null; cleared by admin.reactivateUser.';
