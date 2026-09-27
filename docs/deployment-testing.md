# Deployment and self-test runbook

This runbook targets a single Docker web service on Render or Railway with Supabase providing Auth, Postgres, and Storage. Vercel is intentionally not a target for the current long-running Node architecture.

## 1. Prepare Supabase

1. In **Authentication → Sign In / Providers**, disable **Allow new users to sign up** and anonymous sign-ins. The server refuses to start while self-signup is enabled.
2. In **Authentication → URL Configuration**, set the exact production origin as Site URL and add exactly two redirect URLs: `https://your-domain/welcome` and `https://your-domain/reset-password/confirm`. Do not add wildcard preview origins.
3. In **Authentication → Email Templates**, the app's invite and recovery pages read a `token_hash` parameter. Supabase's default templates do not send one (they redirect with an access token in the URL fragment), so with the defaults nobody can accept an invite or reset a password. Set the link in each template to:
   - Invite user: `{{ .SiteURL }}/welcome?token_hash={{ .TokenHash }}&type=invite`
   - Reset password: `{{ .SiteURL }}/reset-password/confirm?token_hash={{ .TokenHash }}&type=recovery`

   Send one real invite end-to-end before inviting anyone else.
4. Link the repository and apply every migration. **Check the migration history first**: the early migrations were once applied by hand, and `20260628000000_fix_column_types.sql` is guarded but the rest assume the recorded history is complete.

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npm run db:status          # every version in supabase/migrations must be listed as applied remotely
   npm run db:migrate         # only after db:status shows no unexpected gaps
   npm run db:status
   ```

   If `db:status` shows a migration that is missing remotely but whose changes already exist in the database, first verify the full migration effects, then record it with `npx supabase migration repair --status applied <version>` rather than re-running it. A matching column or migration name alone is not sufficient evidence. The hosted Ansyra project inspected on 11 September has 24 history entries with timestamps different from all 27 repository files; reconcile that history before a normal push. See `docs/release-completion-2026-09-11.md`.
5. Confirm the final migration is `organizations_rls_and_user_deactivation`. The hardening migration before it creates the shared limiter and enforces bucket MIME/size limits.
6. For a new database, bootstrap the first administrator only after migrations:

   ```bash
   npx tsx scripts/bootstrap-admin.ts you@example.com --name "Your Name"
   ```

## 2. Configure the host

Copy every applicable variable from `.env.example`. `render.yaml` is the real-data blueprint and already sets the fixed values; you supply the secrets. Required for a real-data deployment:

- `NODE_ENV=production` and `APP_MODE=production` — startup then refuses mock AI and requires email, Sentry, cron, and the three explicit acknowledgements (`LEGAL_REVIEW_COMPLETE`, `BACKUP_RESTORE_TESTED`, `AI_DATA_PROCESSING_APPROVED`) to be literally `true`.
- `SITE_URL=https://your-exact-domain` — requests on any other host (for example the platform's default hostname) are redirected to it.
- `TRUST_PROXY_HEADERS=true`, `PROXY_IP_HEADER=x-forwarded-for`, `TRUSTED_PROXY_HOPS=1` for Render; adjust the header/hops for a different proxy. Only that one header is read for rate limiting.
- `DATABASE_SSL=true`, `DATABASE_URL` (transaction pooler string)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — **rotated** if any earlier copy of them was ever exposed
- a long random `CRON_SECRET`, also stored as the GitHub secret `ANSYRA_CRON_SECRET`
- `AI_PROVIDER` and its key. Every live AI action can send deal or document text to the provider. Only set `AI_DATA_PROCESSING_APPROVED=true` after confirming the provider's data-processing terms. With `NODE_ENV=production`, live calls require this acknowledgement in every app mode. With `APP_MODE=production`, a missing acknowledgement prevents startup altogether.
- `RESEND_API_KEY`, `EMAIL_FROM`, `SENTRY_DSN`

A demo instance with synthetic data may use `APP_MODE=demo` and `AI_PROVIDER=mock`; do not point real users at one.

Never put the Supabase service-role key in a variable beginning with `VITE_`. Browser uploads do not require any Supabase browser key.

## 3. Verify the repository before deployment

Use Node 22.12 or newer:

```bash
npm ci
npm run verify
```

Expected result: typecheck, lint, all unit tests, production build, and the production dependency audit pass.

`verify` also audits development dependencies. Run `npm run release:preflight` against the intended database for read-only column, migration-history, TLS, timeout, RLS, grants, bucket and Auth evidence. A successful check is limited to those checks; it does not certify backups, legal approval, provider terms, email delivery, or production hosting. Run the local integration/regression/browser commands in `docs/LOCAL_TESTING.md` before release.

If Docker is installed, also run:

```bash
docker build -t ansyra:local .
```

## 4. Deploy and smoke-test

Deploy the Dockerfile. The process deliberately refuses to start if self-signup is enabled, database TLS is absent, **the newest migration is not recorded in the database's migration history** (`supabase_migrations.schema_migrations` must contain the version pinned in `api/lib/migrations-manifest.ts`), the hardening migration is missing, or Storage bucket limits are absent. A migration applied by hand must be recorded with `supabase migration repair --status applied <version>` or the server will not start.

After the host reports healthy:

```bash
SMOKE_BASE_URL=https://your-domain npm run smoke
```

This verifies `/health`, database-backed `/ready`, the homepage, security headers, and API 404 behavior. `SMOKE_BASE_URL` must be the canonical `SITE_URL` origin: any other hostname is redirected to it, and the script reports that explicitly.

Configure the daily scheduler with these repository secrets:

- `ANSYRA_CRON_URL`: the production origin (the canonical `SITE_URL`; the `/internal/` cron path also accepts the platform's default hostname because it is authenticated by the secret, not by origin)
- `ANSYRA_CRON_SECRET`: the same value as the host's `CRON_SECRET`

Run **Actions → Deadline reminders → Run workflow** once. It should return a successful JSON sweep (including a `storage` object from the orphaned-document cleanup). The workflow now **fails** when the two secrets are missing instead of skipping silently.

## 5. Manual role and workflow tests

Perform these with synthetic data only.

1. **Unprovisioned identity:** create a temporary user in Supabase Auth without a corresponding `public.users` row. Login must be rejected as unprovisioned. Delete the temporary Auth user afterward.
2. **Delegated admin:** sign in as an admin with `manage_users`. They may reset a member but must not reset an admin or main administrator.
3. **Personal export:** as two members in one organization, create different synthetic deals. Each member's Profile → Download my data must contain only rows they personally created.
4. **Upload enforcement:** upload a valid PDF/TXT/DOCX and confirm it appears. Rename an executable or random binary to `.pdf`; confirmation must reject it and remove the object. Try a file over 20 MB; Storage must reject it.
5. **Pipeline concurrency:** type rapidly in Pipeline search, change industry/stage while a page loads, and press Show more. Results must match the latest filter with no duplicates. Typing inside Create/Edit dialogs must keep focus.
6. **Anonymous abuse boundaries:** submit the access-request form more than five times in an hour from one address; the sixth must return HTTP 429. Then repeat with a spoofed `X-Forwarded-For: 203.0.113.9` header; it must still be limited (the limiter reads only the entry your proxy appended).
7. **AI safety:** in demo mode confirm outputs are visibly mock/synthetic. On a disposable test instance with `APP_MODE=production`, a missing provider key or acknowledgement must prevent startup. To exercise the per-call acknowledgement gate, use `NODE_ENV=production` and `APP_MODE=demo` with a live provider configured: live AI calls must be refused without the acknowledgement. Do not remove production credentials from a running real-user service for this test.
8. **Logout:** sign in, log out, then revisit `/dashboard` and use the browser Back button. Protected data must not reappear and the server must reject the revoked session.
8a. **Offboarding:** as an admin, remove a synthetic member who has recorded a decision. The row must show "Deactivated", their sign-in must fail immediately (including an already-open tab), their deals must still be visible to the organisation, and "Reactivate" must restore sign-in. Removing a member who authored nothing must delete the account outright.
8b. **Deal deletion:** upload a document to a synthetic deal, delete the deal, then confirm in Supabase Storage that the object under `deal-documents/<dealId>/` is gone.
9. **Mobile and keyboard:** at 390px width, navigate landing, login, pipeline, dossier and profile. Use Tab/Shift+Tab/Escape through every dialog and drawer. Do not enable reduced-motion emulation for this test suite.
10. **Failure recovery:** temporarily use an invalid database hostname. Startup or `/ready` must fail within roughly ten seconds instead of hanging. Restore the correct value and redeploy.

## 6. Real-data launch gate

Do not remove the prototype/confidential-data warning until counsel and the business owner have supplied the missing jurisdiction, postal address, liability language, processor/DPA decisions, retention schedule, and incident-response policy. Complete a backup restoration test before accepting real M&A documents.
