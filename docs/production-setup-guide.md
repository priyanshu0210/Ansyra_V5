# Production setup — owner checklist

**Portfolio scope update, 14 September 2026:** the owner selected Render Free with fictional deal data and full uploads, editing and live AI. Follow [the portfolio deployment walkthrough](portfolio-deployment-walkthrough.md) for that target. The real-data business gates below remain relevant to a future real-data launch; do not claim they have been completed merely because the portfolio uses separate disclosures.

This guide accompanies `release-completion-2026-09-11.md`. The inspected Supabase project is **AnsyraV3**, reference `itarxfdzkghmfjghkvzf`. The release PR belongs to **priyanshu0210/AnsyraV7**; the checkout folder and `origin` remote still use the older V6 name. Do not deploy the V6 repository by accident.

The owner elected to make dashboard settings changes personally. No credentials should be pasted into chat, a report, Git, or a pull request.

## 1. Close public registration

Open [Sign In / Providers](https://supabase.com/dashboard/project/itarxfdzkghmfjghkvzf/auth/providers).

1. Turn **Allow new users to sign up** OFF and save.
2. Keep anonymous sign-ins OFF.
3. Keep the **Email** provider enabled: invited/existing users still need to sign in.

**Verified during this session:** the public Auth settings initially reported signup enabled, then reported it disabled at 12:37 UTC on 11 September. Anonymous sign-ins were disabled. I did not change these hosted settings.

## 2. Replace compromised credentials

Replace credentials in each environment that uses this project, including the local ignored `.env` and the eventual host's secret store. Confirm replacement credentials work, then revoke the compromised credentials; simply adding a replacement does not revoke the old access.

### Supabase API credentials

Current Supabase guidance differs from the older review's suggestion to rotate a legacy JWT secret. Open **Project Settings → API Keys → Publishable and secret API keys**. Create/use a replacement publishable key and a new server secret key, migrate consumers, then disable the compromised legacy API keys. Supabase now recommends this migration instead of legacy secret rotation. Follow its [current migration instructions](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) and [rotation guidance](https://supabase.com/docs/guides/troubleshooting/rotating-anon-service-and-jwt-secrets-1Jq6yd).

Ansyra currently uses these environment variable names:

- `SUPABASE_ANON_KEY`: the low-privilege key passed to the server-side Auth client and public Auth-settings request.
- `SUPABASE_SERVICE_ROLE_KEY`: the privileged key passed to the server-side admin/Storage client.

These names do not themselves require JWT-formatted values; the clients pass the strings to supabase-js. The installed SDK supports modern API keys, but login, invitations, recovery and signed uploads must still be tested with the actual replacement keys before legacy keys are disabled. Do not put a privileged key in any `VITE_*` variable. Rotating a JWT signing key alone does not establish that the old privileged API credential has been revoked.

### Database password

Use the project's database password reset control under **Database / Settings**, then update the password component of every consuming `DATABASE_URL`, using the connection string supplied by Supabase. Restart affected consumers to replace existing pooled connections. Run `npm run release:preflight` to verify the new connection and TLS; the migration-history failures described below will remain until reconciled. Do not print the connection string in a terminal or share it.

### Gemini credential

In the Google project that issued the compromised key, create a replacement key, set appropriate restrictions, update `GEMINI_API_KEY` wherever used, and revoke the old key. If the production provider will be different, the compromised Gemini key still needs revocation. Check provider usage for unexpected activity. This work does not constitute approval to send confidential deal documents to any provider.

## 3. Reconcile the database before deployment

**Do not blindly run `npm run db:migrate` on the inspected hosted database.** Its 24 migration-history entries have timestamps different from all 27 repository migration files. A normal push cannot safely infer that the older changes already exist. The expected `users.deactivated_at` column is also genuinely missing.

The safe sequence is:

1. Obtain a recoverable backup and preserve the hosted migration-history records.
2. Compare the full hosted migration statements and schema effects with the repository migrations, including constraints, triggers, policies, grants and data conversions. The new preflight compares column presence, not all these effects.
3. Prepare and review an explicit mapping of equivalent versions and any true missing changes. Retain an audit copy of original history before repairing it.
4. Use Supabase migration repair only for versions whose effects are verified. Do not mark all versions applied, and do not use matching names or column presence as sole evidence.
5. Apply the actual pending deactivation migration through the agreed migration workflow, recording its canonical repository version `20260910120000`.
6. Run `npm run db:status` and `npm run release:preflight`. There should be no unexplained history differences and no missing ORM columns.

This migration was successfully applied to the isolated local database, and the changed offboarding behavior passed real database/Auth tests there. Hosted repair and migration application remain engineering work; this guide intentionally does not supply a mass-repair command. [Supabase migration-history guidance](https://supabase.com/docs/guides/local-development/overview#diagnosing-and-fixing-sync-errors).

The hosted pooler currently reports `statement_timeout = 2min`, despite the application's requested 30 seconds. The application has a separate client query timeout of approximately 35 seconds by default. Resolve the server timeout through the eventual application's database-role/pooler configuration and verify through that same connection; do not assume the client timeout cancels database execution. Do not change the shared `postgres` role globally without considering other consumers.

## 4. Choose the production origin, then configure Auth URLs and mail

The current code and Dockerfile expect one persistent Node service serving both the frontend and API. `render.yaml` supplies a Render blueprint, but no production service/domain was selected or provisioned in this work. Choose the canonical HTTPS origin before configuring the following values. Use one origin consistently; avoid wildcard preview redirects.

In **Authentication → URL Configuration**:

- **Site URL:** your exact production origin, such as `https://your-domain`.
- **Redirect URLs:** that origin followed by `/welcome` and `/reset-password/confirm`.

In **Authentication → Emails → Email Templates**, put the following links in the corresponding templates:

Invite user:

```html
<a href="{{ .SiteURL }}/welcome?token_hash={{ .TokenHash }}&type=invite">Accept invitation</a>
```

Reset password:

```html
<a href="{{ .SiteURL }}/reset-password/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

The application reads `token_hash`; the default fragment-token flow is insufficient. If template editing is unavailable, configure **custom SMTP** first. Supabase restricts template editing for new free-tier projects using its default mail provider. Setting Ansyra's `RESEND_API_KEY` only configures application email; it does not configure Supabase Auth SMTP. [Supabase email-template change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

After deployment, send a test invitation to an address you control, accept it, sign out/in, and complete a password reset. Confirm links land on the canonical site and old sessions are rejected after password change. Delivery through the production mail provider has not been tested in this continuation.

Under **Authentication → Attack Protection**, enable leaked-password protection if available on your plan. Supabase's advisor reported it disabled. Do not upgrade a paid plan solely by following this guide without deciding its cost.

## 5. Finish the three business/recovery acknowledgements

Do not set an acknowledgement merely to make startup succeed.

**`LEGAL_REVIEW_COMPLETE=true`:** resolve the four remaining `CounselMark` placeholders in `src/pages/LegalPrivacy.tsx` and `src/pages/LegalTerms.tsx`: Supabase/AI processing agreements, postal-address requirements, jurisdiction-specific liability carve-outs, and governing jurisdiction. Have the business owner/counsel confirm the applicable policies and commitments. No legal terms were invented in this work.

**`AI_DATA_PROCESSING_APPROVED=true`:** record the selected provider, account/tier, processing terms, retention/training choices and approval for the deal/document data sent to it. Configure provider spending controls. Test using synthetic data first. Mock AI tests do not verify a live provider's behavior or contractual terms.

**`BACKUP_RESTORE_TESTED=true`:** restore a backup into an isolated destination, verify representative users, relationships and deal records, and download restored documents to verify their contents. Record backup date, restoration duration, verification results and recovery owner. Include a separate recovery path for uploaded Storage objects: Supabase database backups contain their metadata, not their file bytes. The local synthetic test stack does not prove production disaster recovery. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

## 6. Configure and verify the actual host

Populate the applicable values in `.env.example` / `render.yaml` using the host's secret store. The real-data service needs `NODE_ENV=production`, `APP_MODE=production`, the canonical `SITE_URL`, verified database TLS, Supabase credentials, the selected AI provider and model/key, application email configuration, Sentry, a cron secret, and the three genuine acknowledgements above.

Create GitHub Actions secrets **in AnsyraV7**:

- `ANSYRA_CRON_URL`: the production origin, without a trailing slash.
- `ANSYRA_CRON_SECRET`: the same value as the host's `CRON_SECRET`.

After the prerequisites are satisfied and the release PR is merged/deployed:

1. Verify the host runs the intended AnsyraV7 commit and passes both `/health` and database-backed `/ready`.
2. Run `SMOKE_BASE_URL=https://your-domain npm run smoke` with the real origin substituted.
3. Run **Actions → Deadline reminders → Run workflow** and inspect both reminder and Storage-cleanup results. A successful HTTP response alone is not evidence every sweep subtask succeeded.
4. Check canonical-host redirects, actual proxy-header rate limiting, invite/reset delivery, logout/session revocation, document upload/deletion and the admin offboarding flows with synthetic records.
5. Verify production Sentry receives a controlled non-confidential error, and configure alert recipients and provider spending limits.
6. Confirm the deployment platform's `checksPass` behavior with the skipped CodeQL job. CodeQL is currently inactive; enabling it for this private repo requires the appropriate GitHub entitlement and `ENABLE_CODEQL=true`.

Merging can trigger deployment. The release PR was not merged as part of this continuation.
