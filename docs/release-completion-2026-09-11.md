# Release completion — 11 September 2026

Starting revision: `529bd1e` on `release/hardening-2026-09`. This is a continuation of the remediation, not a replacement for either historical release review.

## Progress

- [x] Dependency advisory triage and fixes — COMPLETE
- [x] Isolated local Supabase startup and migration verification — COMPLETE on retained local stack
- [x] Database integration and regression suites — PASS
- [x] Isolated browser verification — PASS
- [x] Hosted Supabase configuration and security evidence — inspection COMPLETE; migration/credential work remains
- [ ] Production deployment and smoke verification — BLOCKED on unselected host/origin and launch prerequisites
- [x] Documentation corrections and repository checks — COMPLETE
- [x] Final assessment and outstanding operator actions — recorded below

## Verified starting state

GitHub PR #1 in `priyanshu0210/AnsyraV7` was open and mergeable at the start, with head `529bd1e17d237db668e867384852f71b93ed1b99`. CI and the container build succeeded on that revision. CI ran 73 unit test files / 1,046 tests, typecheck, lint, production build, and a production dependency audit with zero reported vulnerabilities. CodeQL was skipped, not executed. The full install reported three dependency advisories requiring triage.

No hosted migrations, credential rotations, merges, or deployments were performed in this continuation. Existing review documents are preserved as historical evidence.

## Hosted evidence (read-only)

The connected project matches the checkout's configured Supabase hostname: `itarxfdzkghmfjghkvzf` (dashboard name `AnsyraV3`). On 11 September:

- `users.deactivated_at` is absent; the release's required migration version is not recorded. The remediated application cannot start against this database yet.
- Hosted history has 24 entries, using different timestamps from the 27 repository migration files. This is an actual history divergence, not just one pending migration. Do not blindly run `db:migrate` or mark all versions applied.
- Every public table has RLS enabled. There are no SELECT/INSERT/UPDATE/DELETE grants to `anon` or `authenticated` on public tables. There are no Storage object policies. No permissive policy is needed for this server-mediated architecture.
- The document and bug-screenshot buckets are private with MIME/size limits. Avatars are public with a 2 MB image limit.
- Initially Auth reported `disable_signup=false`; the final read-only check confirmed signup disabled (see the hosted cross-check below). Anonymous sign-in is disabled.
- Supabase's security advisor reports leaked-password protection disabled, and informational notices for the intentional RLS-without-policies posture.

The owner confirmed that production URL/host selection, credential rotations, legal sign-off, AI data-processing approval, and the backup-restore drill have not been completed.

## Local environment

Started the existing `ansyra-test` Colima profile with 2 CPUs / 4 GB RAM. Started its Supabase stack from the retained local backup, applied the pending `20260910120000` migration locally, and generated a restricted-permission `.env.test.local`. The synthetic Thornevale seeder completed successfully; hosted data was not seeded or reset.

## Dependency triage

The three reported package advisories are two underlying issues: Vitest / `@vitest/mocker` path traversal ([maintainer advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9)), and ESLint's transitive `js-yaml` CPU exhaustion ([maintainer advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)). Both are development dependencies. Patched versions are Vitest 4.1.11 and js-yaml 4.3.2. npm hit an `edgesOut` installed-tree error; resolving the lockfile in a clean temporary directory succeeded, followed by the successful clean install and verification below.

**Final dependency result:** clean install succeeded. Vitest and its companion packages are now 4.1.11; js-yaml is 4.3.2. Both full and production-only audits report zero vulnerabilities on this date. `audit:all` is now part of `npm run verify` and GitHub CI, so future development-tool advisories no longer disappear behind a production-only audit.

## Work completed and defects found

### Administrator authorization — confirmed defect, fixed

The existing `admin.removeUser` route allowed a delegated administrator with `manage_users` to remove another administrator. Its source documented that only the main administrator may manage admin accounts, and password reset already enforced that distinction. A new real-database test demonstrated that the unauthorized removal succeeded before the fix.

`api/admin-router.ts` now requires the main administrator when removing an admin and when reactivating a non-member. Permission changes also reject a deactivated administrator. `AdminPanel.tsx` hides the corresponding actions when the caller cannot use them, and hides permission editing on deactivated accounts. Authorization remains enforced server-side.

Eight new integration tests exercise the actual tRPC procedures, local Supabase Auth, Postgres and Storage. They verify:

1. Explicit organization-ID assignment and rejection of an existing organization name.
2. Decision-author deactivation, grant removal, old-session rejection, frozen admin edits, audit-record retention and reactivation.
3. Deletion of an account without authored records from both Auth and the application profile.
4. Rejection of delegated-admin removal of another admin.
5. Rejection of delegated-admin reactivation and frozen permission editing while deactivated.
6. Concurrent access approval provisioning exactly once, without joining the requester-supplied company.
7. Failed approval returning to pending while preserving an existing account.
8. Deal deletion removing the actual uploaded Storage object as well as database records.

All test-created identities are synthetic and unique to the run. No hosted records were used for test writes.

### Browser test isolation and stale workflows — fixed

Previously the browser command could load hosted credentials and reuse an arbitrary dev server. `playwright.config.ts` now requires the isolated local-test environment. `test:local:e2e` supplies loopback credentials, mock AI and separate generated passwords; Playwright refuses to reuse an existing server and uses a strict port. The wrapper forwards termination signals to its child so Playwright can shut down its server.

The first real browser execution exposed two obsolete test assumptions:

- Fixture deals were assumed to remain on the first Pipeline page. The retained test database now has enough scratch records to paginate them out. Tests now search for the desired deal through the UI.
- Data Room tests tried to interact with the collapsed Documents chapter. They now open it through the visible navigation before inspecting, uploading or analyzing a document.

An intermediate Storage-test failure was a test-client problem: signing into the shared privileged test client replaced its authorization context. The tests now use independent low-privilege sign-in clients and leave the privileged Storage/admin client unchanged. No application Storage defect was established by that failure.

### Repeatable read-only release preflight — added

`scripts/release-preflight.ts` compares ORM column names and repository migration versions with the target database, inspects RLS/grants/buckets, verifies hosted TLS, reads the effective statement timeout, and checks public Auth settings. Database inspection uses `BEGIN READ ONLY` and rolls back. It does not run migrations, repair history or read deal/user content; errors suppress driver connection details.

Commands:

```sh
npm run release:preflight        # target selected by the application's environment
npm run release:preflight:local  # explicit isolated loopback test environment
```

The script and the test runner / Playwright configuration are now included in TypeScript checking. These checks report column presence, not complete schema/constraint equivalence. They do not certify legal approval, credentials' revocation, backups or live-provider agreements.

### Documentation — corrected and extended

The new [production setup guide](production-setup-guide.md) gives owner steps for signup controls, credential replacement, migration reconciliation, URL/template/SMTP setup, approval flags, backup restoration and deployment checks. The local-testing and deployment runbooks now explain isolated browser tests, full dependency audits and the difference between startup and per-call AI acknowledgement gates.

The historical review documents were not edited. Their statements about uncommitted work, skipped Docker/browser tests and migration counts are historical; this report records the current evidence. AnsyraV7 is the release repository, while the V6 folder/remote name remains for compatibility with the existing checkout.

## Verification results

All successful results below were executed during this continuation, rather than copied from the prior review.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| `npm ci --ignore-scripts --no-audit` | PASS | Exact patched lockfile installed. |
| `npm run check` | PASS | Application plus release preflight / local runner / Playwright config. |
| `npm run lint` | PASS | Zero-warning ESLint gate. |
| `npm test` | PASS | 73 files, **1,046 tests**. |
| `npm run test:local:integration` | PASS | 9 files, **168 tests**, including 8 new remediation tests. |
| `npm run test:local:regression` | PASS | 5 files, **219 tests**, rerun after the authorization fix. |
| `npm run test:local:e2e` | PASS | **30 checks**: 27 browser tests plus 3 account setup checks. Final run 57.3 s. |
| `npm run build` | PASS | Frontend and persistent Node API bundles. Known approximately 5.8 MB server-bundle warning remains. |
| `npm run audit:prod` | PASS | Zero reported production vulnerabilities. |
| `npm run audit:all` | PASS | Zero reported vulnerabilities across the full installed tree. |
| Docker build | PASS | Local `ansyra:release-2026-09-11` image built. This verifies image construction, not a hosted deployment. |
| `npm run release:preflight:local` | PASS, exit 0 | All 27 versions recorded, no missing ORM columns, signup disabled, effective 30 s statement timeout. |
| `npm run release:preflight` (hosted) | FAIL, exit 1 — expected blocker | Missing deactivation column and divergent migration history. Verified TLS; effective timeout 2 min. |
| `git diff --check` | PASS | No whitespace errors. |
| Hosted smoke / cron / email / live AI | NOT RUN | No production origin, service, approved provider or completed credential setup. |

The browser suite covers session persistence, rejected login, cross-tenant dossier denial, feature-gated navigation, document upload/refresh/analysis, advancement gates and horizontal overflow at 375 / 768 / 1280 px. It is Chromium-only. It is not a comprehensive keyboard, screen-reader, cross-browser or all-page visual audit. The admin API behavior has real integration coverage; the entire admin UI was not separately exercised end to end.

The local stack was restored from an existing local backup; only its pending latest migration was applied during this session. This is **not** evidence that all historical migrations were replayed from a completely empty Supabase project in this continuation, nor is it a production backup/restore drill.

## Hosted cross-check update

At 12:37 UTC, the read-only preflight reported signup disabled and anonymous sign-in disabled. The earlier enabled-signup finding is therefore closed for the observed project; I made no dashboard setting changes.

Historical hosted and local preflight snapshots are retained privately as operational evidence and are not included in the publishable source.

Current hosted blockers and follow-ups:

- **Missing schema:** `users.deactivated_at` is the only missing column among the ORM's table/column names. The newest required migration is not recorded. The current production boot gate should refuse this database.
- **Migration-history divergence:** 24 hosted entries versus 27 repository files, with no matching version timestamps. Column presence does not prove every migration's constraints, policies, triggers or data transformations are equivalent. No mass repair or hosted migration was attempted.
- **Timeout mismatch:** the application requests 30 seconds; the effective hosted server setting is 2 minutes. The local stack reports 30 seconds. The separate client timeout remains approximately 35 seconds by default. Server-side cancellation behavior through the hosted pooler was not tested with a deliberately expensive query.
- **Credential rotation:** still required; the owner confirmed it has not been done. No key/password values were printed or committed.
- **Auth mail and URLs:** production origin and SMTP/template configuration remain unverified. Public signup is now closed, but this alone does not prove invitations or recovery work.
- **Leaked-password protection:** Supabase advisor warning remains. Its RLS-without-policies notices are informational and consistent with the server-mediated deny-by-default design.

## Remaining work, ownership and release decision

**Do not admit real users with confidential M&A data yet.** The repository has substantially stronger execution evidence now, but the production environment is not ready.

The owner steps are fully described in `production-setup-guide.md`:

1. Replace and revoke the compromised Supabase privileged credential, database password and Gemini key, updating each consumer.
2. Select the persistent Node host and canonical HTTPS origin; configure Auth redirects, custom SMTP if needed, invitation and recovery templates, and verify delivery.
3. Complete legal approval and provider data-processing approval; resolve four legal placeholders and configure provider spending controls.
4. Perform a real backup restoration drill that covers both the database and uploaded file bytes.
5. Supply actual host secrets and acknowledgements, monitoring and cron configuration.

Engineering work still needed with that setup:

1. Preserve/compare the hosted migration history and full migration effects, review a specific reconciliation plan, repair verified equivalences, and apply the real pending schema change.
2. Validate production runtime, proxy behavior, Auth mail flows, provider integration, cron, monitoring and smoke checks against the selected origin.
3. Merge and deploy the reviewed AnsyraV7 release only when these prerequisites are satisfied. No merge or deployment was performed in this continuation.

The previously deferred dedicated application DB role, server-side pooler timeout configuration, worker-based PDF parsing, deliberate fail-fast policy, runtime dependency installation and reduced-motion product choice remain separate follow-ups. The timeout now has measured hosted evidence; the other deferred decisions were not silently marked fixed.

**Planning estimate:** remaining technical work is approximately 1–3 focused engineering days once credentials, hosting decisions and approvals are available, assuming migration reconciliation and live verification do not uncover more defects. External legal/provider approval and recovery arrangements can extend the calendar time. This is an estimate, not an assertion that the unresolved production gates are minor.

## Repository delivery

The implementation was committed and pushed as `4aa3f0ab8ea26ba823be35e6e153523c103d555a` on the existing `release/hardening-2026-09` branch and [PR #1 in AnsyraV7](https://github.com/priyanshu0210/AnsyraV7/pull/1). [GitHub CI and the container build](https://github.com/priyanshu0210/AnsyraV7/actions/runs/34601844335) both passed on that exact code revision. This report's final delivery update is documentation-only. CodeQL remains skipped rather than executed; no static-security scan is claimed.

The local Supabase stack and its `ansyra-test` Colima VM were stopped after testing, preserving their local test data. The release PR remains unmerged.
