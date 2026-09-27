# Ansyra — Pre-production release-gate review, round 2 (post-remediation)

Second full pass over the working tree at `AnsyraV6-github` after the remediation batch of
2026-09-10. Baseline for comparison: `docs/release-review.md` (round 1, left unchanged).
Reviewed state: branch `main`, HEAD `1310acc` plus **165 uncommitted paths** (121 modified,
44 untracked, 6 deleted). The working tree is what would be built and deployed, so it is
what was reviewed. Review date: 2026-09-10.

Read-only apart from this file. No migrations, seeds, or database writes were run.
Secrets are never printed here.

Round-1 finding ids (`P1-1`, `P3-2`, …) are referenced where a round-2 conclusion depends
on them. New findings in this round are numbered `R2-<area>-<n>`.

## Progress tracker

- [x] Architecture and trust-boundary mapping — COMPLETE
- [x] Early typecheck/build gate — COMPLETE
- [x] P1. Tenant isolation, authorization and authentication — COMPLETE
- [x] P2. Secrets, privileged access and Supabase security — COMPLETE
- [x] P3. AI, RAG, uploads and confidential-data handling — COMPLETE
- [x] P4. Application correctness and data integrity — COMPLETE
- [x] P5. Database schema, migrations and persistence — COMPLETE
- [x] P6. Deployment architecture and hosting compatibility — COMPLETE
- [x] P7. Error handling and operational resilience — COMPLETE
- [x] P8. Performance, scalability and AI cost controls — COMPLETE
- [x] P9. TypeScript and code reliability — COMPLETE
- [x] P10. Logging, repository hygiene and dependencies — COMPLETE
- [x] P11. Accessibility and UI reliability — COMPLETE (in-browser checks NOT VERIFIED)
- [x] Remaining verification commands — COMPLETE (DB-backed and e2e suites SKIPPED)
- [x] Final production assessment — COMPLETE

---

## Architecture and trust-boundary mapping — COMPLETE

### Stack (re-confirmed from `package.json`, lockfile, configs and source)

Unchanged in kind from round 1: React 19 + Vite 7 SPA; Hono 4 + tRPC 11 in one persistent
Node 22 process that also serves `dist/public`; Drizzle over `pg` to Supabase Postgres
through the Supavisor transaction pooler as the `postgres` role; Supabase Auth used
server-side only behind one httpOnly cookie; Supabase Storage via service-role-signed
URLs; provider-agnostic AI over raw `fetch`; Resend and Sentry optional; Docker image;
Render blueprint; GitHub Actions for CI, CodeQL and the daily cron trigger.

**No vector store, no embeddings, no RAG** (re-grepped `api/`, `db/`, `supabase/`,
`contracts/`, `src/`).

### What changed since round 1 (structure only; behaviour is assessed per section)

| Area | Round 1 | Now |
|---|---|---|
| tRPC routers | 22, including `chat` (public, DB-writing), `screening` (fabricated results), `leads` | **19**. The three dead routers are deleted; their tables remain. |
| Supabase clients | Six ad-hoc `createClient(...)` sites, all service-role | One factory `api/lib/supabase-clients.ts` (`anonClient` / `adminClient`, fetch timeout). Anon key used for sign-in, `getUser`, refresh, `verifyOtp`. |
| Client-IP resolution | Cascade of platform headers | One configured header (`PROXY_IP_HEADER`) + `TRUSTED_PROXY_HOPS`; socket peer fallback via a new `remoteAddress` field on the tRPC context. |
| Boot | — | Canonical-host redirect middleware; cron endpoint also runs a Storage orphan sweep. |
| Organisation assignment | Free-text find-or-create | `organizationId` (validated) or `createOrganization` (CONFLICT on duplicate). |
| User offboarding | Hard delete | Deactivate (ban + session revocation + `users.deactivated_at`) when the account authored records; hard delete otherwise; `reactivateUser`. |
| Document analysis | Only `red_flags` validated | All four kinds validated and stripped; live-provider analysis gated on `AI_DATA_PROCESSING_APPROVED` in production. |
| Migrations | 24 | **25** (`20260910120000_organizations_rls_and_user_deactivation.sql`); `20260628000000_fix_column_types.sql` made idempotent. |
| Deployment manifest | `APP_MODE=demo`, free plan, Gemini | `APP_MODE=production`, starter plan, all secrets `sync: false`. |
| Dependencies | 69 prod | 63 prod (AWS SDK ×2, `next-themes`, `nanoid`, `date-fns`, `@hookform/resolvers` removed; `@types/three` → dev). |
| Deleted files | — | `api/chat-router.ts`, `api/screening-router.ts`, `api/leads-router.ts`, `db/seed.ts`, `scripts/api-bridge.mjs`, `tests/e2e/.auth/*.json`, `drizzle.config.ts` (already deleted in round 1). |

### Runtime placement (unchanged)

Browser: SPA only; the only browser-visible env is `VITE_SENTRY_DSN` / `VITE_SENTRY_RELEASE`;
no Supabase key in the bundle. Persistent Node process: everything else. No serverless, no
workers; scheduling external via `POST /internal/cron/deadlines`.

### Request path (trust boundaries, updated)

```
browser ──httpOnly cookie──▶ Hono
   │   secureHeaders (CSP prod-only) · bodyLimit 2 MB
   │   /health, /ready                      (exempt from the host redirect)
   │   canonical-host redirect              (prod: Host ≠ SITE_URL → 301 GET/HEAD, 421 otherwise)
   │   /internal/cron/deadlines             (Bearer CRON_SECRET, timingSafeEqual)
   │   /api/export/pipeline.csv             (authenticateRequest inside)
   │   /api/trpc/* ──▶ createContext(opts, socket.remoteAddress)
   │                     └─ authenticateRequest
   │                          ├─ anonClient.getUser(access_token)  → refresh (deduped, 30 s cache)
   │                          ├─ assertActiveSession (auth.sessions row must exist)
   │                          └─ public.users row required; deactivated_at must be NULL
   │                   securedProcedure: Origin === SITE_URL on mutations · mustChangePassword gate
   │                   tiers: publicQuery | authedQuery | memberQuery | featureQuery(k) | aiFeatureQuery(k)
   │                          | adminQuery | adminPermQuery(p)
   │                   aiFeatureQuery adds: in-flight dedupe + 4 DB-backed limiters
   │                   routers ──▶ Drizzle ──▶ pg Pool ──▶ Supavisor ──▶ Postgres (postgres role; RLS bypassed)
   │                          ├──▶ Storage (adminClient; signed URLs; bucket size/MIME limits)
   │                          └──▶ AI provider (server key; 45 s/attempt; 60 s budget; no retry after timeout)
   └──PUT──▶ Storage signed upload URL
```

### Tenant model (unchanged rule, tightened assignment)

`ownerScope`: `createdBy = me OR organization_id = myOrg`; own rows only when the user has
no organisation. Organisation membership is now assigned **only** by an admin selecting an
existing organisation id or deliberately creating a new one; no code path derives it from
text. Roles: `main_admin` / `admin` / `member`; admins are blocked from product features;
members carry per-feature grants. Authorization remains entirely application-side.

---

## Early typecheck/build gate — COMPLETE

Scripts re-inspected: no `pre*`/`post*` hooks; `check` is `tsc -b` with `noEmit`; `build`
writes only the gitignored `dist/`. Both safe.

| Command | Result | Exit | Notes |
|---|---|---|---|
| `npm run check` | **PASS** | 0 | No diagnostics. |
| `npm run build` | **PASS** | 0 | Client 4.7 s; server bundle `dist/boot.js` 5.8 MB (esbuild warning; composition is `unpdf`, `mammoth`, `pg`, Drizzle, supabase-js — the removed AWS SDK was never imported, so this did not shrink). |

---

## P1. Tenant isolation, authorization and authentication — COMPLETE

### Re-verification method

Every changed file on the authentication/authorization path was re-read in full after
remediation (`api/boot.ts`, `api/context.ts`, `api/middleware.ts`, `api/auth/verify.ts`,
`api/auth-router.ts`, `api/admin-router.ts`, `api/access-router.ts`, `api/lib/provision.ts`,
`api/queries/users.ts`, `api/lib/rate-limit.ts`, `api/dd-router.ts`, `api/deals-router.ts`)
and four whole-API censuses were re-run: procedure tiers, insert ownership, client-IP
callers, and public procedures.

### Authentication

| Control | Round 2 state | Verdict |
|---|---|---|
| Sign-in / tokens | Unchanged design; sign-in, `getUser`, refresh and `verifyOtp` now go through `anonClient()` — correct key for the operation, no behavioural change. Cookie flags unchanged. | PASS |
| Revocation | Unchanged (`assertActiveSession` on every request; global sign-out on password change). **New:** `authenticateRequest` refuses any `public.users` row with `deactivated_at` set (`api/auth/verify.ts`), and deactivation deletes the user's `auth.sessions` rows directly, so an open tab is rejected on its next request. | PASS |
| Provisioning boundary | Unchanged (no self-signup; `public.users` row required; boot refuses unless GoTrue `disable_signup=true`). | PASS |
| CSRF / origin | Unchanged (`Origin === SITE_URL` on every mutation, `SameSite=Lax`, no CORS). The new canonical-host middleware only redirects/refuses; it never relaxes the origin check. | PASS |
| Forced password change | Unchanged. | PASS |
| Client-IP for limiters | One configured header, entry `TRUSTED_PROXY_HOPS` from the right; platform headers ignored unless configured; socket peer fallback from `HttpBindings` (server-supplied, never client-supplied). Six unit tests cover spoof-prepend, hop count, unconfigured headers, and fallback. | PASS (round-1 P1-1 closed) |

### Server authorization — census

19 routers. Public procedures are exactly `ping`, `auth.login`, `auth.requestPasswordReset`,
`auth.confirmPasswordReset`, `auth.confirmInvite`, `access.submit` — the anonymous
`chat.*` writes are gone. `admin.reactivateUser` is `adminPermQuery("manage_users")`.
Every product router remains on `featureQuery`/`aiFeatureQuery`. The CSV route is
unchanged.

### Isolation — re-verified

- **Ownership on insert:** every `.insert(` in the routers sets `createdBy`/`organizationId`
  (or the table's equivalent) from the session; the census exceptions are the public
  `access_requests` intake (no owner by design), demo rows via the `own` spread, and the
  supersede path whose values include `createdBy` further down.
- **Organisation assignment:** `findOrCreateOrganization` no longer exists.
  `provisionUser` accepts `organizationId` (validated against `organizations`) **or**
  `organizationName` (creates; CONFLICT if `lower(name)` exists). `admin.createUser`'s
  zod `refine` rejects both at once. `access.approve` passes `null` for both. **Round-1
  P1-2 closed.**
- **Deal/child scoping:** unchanged and re-spot-checked (`assertDealAccess`,
  `ownerScope`, evidence/link/import binding).
- **Assignees:** `dd.updateItem` now requires the assignee to be the caller or an active
  member of the caller's organisation. **P1-4 closed.**
- **Deactivated accounts:** blocked at `authenticateRequest`; feature grants removed on
  deactivation.

No IDOR, missing ownership check, or client-controlled ownership found. **No cross-user
or cross-organisation exposure.**

### Findings

#### R2-P1-1 — Admin mutations still accept a deactivated target

- **Severity:** P3 · **Confidence:** VERIFIED
- **File:** `api/admin-router.ts` · **Lines:** 221-246 (`setUserKind`), 249-268
  (`setUserFeatures`), 306-331 (`resetPassword`)
- **What's wrong:** none of the three checks `deactivatedAt`. `resetPassword` on a
  deactivated (banned) account changes the password, then `revokeSessionsWithPassword`'s
  sign-in is refused by the ban and the call returns `SERVICE_UNAVAILABLE` after the
  password was already rotated. `setUserFeatures` re-grants features that
  `authenticateRequest` will never honour. The UI hides these actions for deactivated
  rows, so this is server-only inconsistency, not exposure.
- **Targeted fix:** in each, `if (target.deactivatedAt) throw BAD_REQUEST("Reactivate the
  account first.")`.
- **Deployment blocker:** NO

### P1 verdict

Authentication **PASS**. API authorization **PASS**. User isolation **PASS**. Organisation
isolation **PASS** — the round-1 soft edge (name-matched membership) is removed.

---

## P2. Secrets, privileged access and Supabase security — COMPLETE

- **History:** unchanged since round 1 (still 12 commits, HEAD `1310acc`; nothing has been
  committed since). The clean-history conclusion stands.
- **Working tree (re-scanned, including the 44 new/untracked files):** no key-shaped
  strings, no connection strings with passwords outside `.env.example` placeholders and
  loopback test fixtures. `tests/e2e/.auth/` is now empty (**P2-2 closed**). `.env`,
  `.env.seed.local` and `tests/e2e/.auth/` remain gitignored and dockerignored.
- **Browser env:** unchanged — `VITE_SENTRY_DSN`/`VITE_SENTRY_RELEASE` only; no
  Supabase key in the bundle.
- **Service-role usage:** narrowed. `adminClient()` is now used only for `auth.admin.*`
  (`admin-router`, `provision`, `revoke-sessions`, `auth.logout`, `changePassword`'s
  temporary-session sign-out, `confirm*` password updates) and Storage signing
  (`api/lib/storage.ts`). Direct `createClient` calls remain only in the three operator
  scripts, which are not in the runtime image. **P2-5 closed.**
- **RLS:** `organizations` gains RLS and an explicit revoke in the new migration
  (**P2-3 closed**; hosted application is a checklist item). Every other table:
  unchanged deny-by-default.
- **Storage:** no `storage.objects` policies (unchanged); bucket limits unchanged;
  new server-side bulk removal and listing use the service-role client only.
- **Admin/recovery scripts:** unchanged and still unreachable at runtime.
- **Still open, operational:** round-1 **P2-1** (rotate the burned service-role key, DB
  password and Gemini key) — cannot be verified from the repository; remains a launch
  prerequisite. **P2-4** (dedicated DB role) unchanged, post-launch.

### P2 verdict

Secrets in repo **PASS**; privileged access **PASS** (narrower than round 1); RLS
**PASS** in the repository; rotation of previously burned credentials **still required**.

---

## P3. AI, RAG, uploads and confidential-data handling — COMPLETE

### Re-traced

- **Entry point and keys:** unchanged — `callAI`/`callAIResearch`, server env only. The
  `emergent` provider and its proxy URL are removed from code, `.env.example` and
  `docker-compose.yml`.
- **Data leaving Ansyra:** same set as round 1. **New gate:** `ai.analyzeDocument`
  refuses with `PRECONDITION_FAILED` when `NODE_ENV=production`, the provider is not
  `mock`, and `AI_DATA_PROCESSING_APPROVED` is not `true` (`api/ai-router.ts`, before the
  download). This applies in every `APP_MODE`. Other routes (assumptions, memo, drafter,
  genome, copilot) still send deal-derived text without that gate — they were not in
  scope of round-1 P3-1, which concerned full document text; noted below as R2-P3-2.
- **Output validation:** all four analysis kinds are zod-validated and stripped to the
  rendered fields before persistence (`api/lib/document-evidence.ts`). Cross-checked
  against the panel: `DataRoom.tsx` reads exactly `headline`, `keyPoints`, `summary`,
  `flags[]`, `parties`, `effectiveDate`, `consideration`, `conditions`, `indemnities`,
  `changeOfControl`, `nonCompete`, `items[]` — every retained field, nothing dropped that
  the UI renders. Mock outputs conform (unit tests pass). Red-flag quotes still verified
  verbatim.
- **Error hygiene:** no router throws an `Error` that embeds model text; the only raw
  `Error` throws left in `api/lib/ai.ts` are boot-time configuration errors.
  `malformedAiOutput()` returns a `BAD_GATEWAY` with a fixed message. **P3-4 closed.**
- **Cross-tenant context:** unchanged and re-spot-checked (all corpus reads scoped).
- **RAG/vectors:** none.
- **Prompt injection:** unchanged posture (no tools, no actions); the three previously
  unvalidated kinds are now shape-checked, and checklist statuses are coerced to the
  closed vocabulary, so a document cannot smuggle arbitrary keys or statuses into the
  tracker import. The merge rule (humans never overwritten) is unchanged. **P3-3 largely
  closed**; the residual is content manipulation of an analytical aid.
- **Upload lifecycle:** unchanged on the way in. On the way out: `deals.delete` and
  `deals.removeSamples` now collect document paths before the cascade and remove the
  objects; a daily sweep reconciles the bucket with the `documents` table
  (`api/lib/storage-sweep.ts`, one-hour grace for in-flight uploads). `documents.delete`
  is still row-then-best-effort-object, now backstopped by the sweep. **P3-2 closed** for
  new deletions; historical residue is cleared by the sweep over successive runs (see
  R2-P3-1 for a limit).
- **Retries:** `fetchWithRetry` has a 60 s wall-clock budget and never resends after its
  own timeout. **P6-5/P7-1 closed.**

### Findings

#### R2-P3-1 — The orphan sweep only ever inspects the first 200 folders by name

- **Severity:** P3 · **Confidence:** VERIFIED
- **File:** `api/lib/storage-sweep.ts` · **Lines:** 23-27
- **What's wrong:** `listObjects(BUCKET, "", maxFolders)` with no offset returns the same
  first 200 deal folders (lexically sorted deal ids) every run. A bucket with more than
  200 deals never reconciles the rest.
- **Targeted fix:** persist an offset (e.g. in `rate_limits` or a tiny `sweep_state` row)
  and advance it each run, or iterate pages until exhausted with a total time budget.
- **Deployment blocker:** NO

#### R2-P3-2 — Non-document AI routes send deal text without the DPA acknowledgement

- **Severity:** P3 · **Confidence:** VERIFIED (design gap, not a defect in the new gate)
- **File:** `api/ai-router.ts` (every `callAI` site other than `analyzeDocument`)
- **What's wrong:** assumptions, memos, drafts, genome and copilot prompts carry deal
  names, economics, rationales and user-pasted evidence; only document analysis is
  gated on `AI_DATA_PROCESSING_APPROVED`. In `APP_MODE=production` the boot check
  already requires the flag for the whole service, so the gap exists only for a
  `demo`-mode deployment with a live provider and real data — which the runbook now says
  not to run.
- **Targeted fix:** move the check into `resolveProvider()` so it covers every live call
  in production, keeping mock unaffected.
- **Deployment blocker:** NO

### P3 verdict

Key handling **PASS**; cross-tenant context **PASS**; RAG **N/A**; document validation and
deletion lifecycle **PASS**; AI confidential-data governance **PASS under the shipped
manifest** (production mode + explicit acknowledgement), with the provider/DPA decision
itself still the operator's.

---

## P4. Application correctness and data integrity — COMPLETE

### New and changed flows, traced

- **Offboarding (`admin.removeUser`):** counts authored deals/targets/decisions/documents.
  If any: GoTrue ban (`876000h`) → delete `auth.sessions` rows (refresh tokens cascade in
  Supabase's auth schema) → transaction sets `deactivated_at` and removes feature grants
  → returns `{mode:"deactivated", retained}`. If none: GoTrue delete → `users` row
  delete. `reactivateUser` lifts the ban (`"none"`) and clears the column. The admin UI
  shows a "Deactivated" chip, hides other actions, offers "Reactivate", and the modal
  copy explains both outcomes. **P4-1 and P4-6 closed** (records stay attributed;
  nothing orphans).
- **Access approval:** claims the row atomically with a `status='pending'` predicate,
  provisions, reverts on failure. **P4-5 closed.**
- **Organisation picker:** select existing (by id) or "create new" (name required by the
  form); server refuses both-at-once and duplicate names.
- **Input bounds:** zod maxima match column widths; `fitScore` integer 0–100 on both
  create and update. **P4-3 closed.**
- **Dead endpoints:** `chat`, `screening`, `leads` routers deleted; `db/seed.ts` and
  `scripts/api-bridge.mjs` deleted. **P4-4/P4-7 closed.** Five procedures with no client
  caller remain by design (`admin.getUserDetail`, `patterns.assumptionFindings`,
  `scenarios.getById`, `ai.deleteScenarioAnalysis`, `recommendations.get`) because the
  integration/regression suites exercise them as isolation checks; all are scoped.
- **Persistence, guards, stage gate, provisioning compensation:** unchanged and re-read.
- **Templates (P4-2):** still a hosted-configuration dependency; now documented
  step-by-step in the runbook.

### Findings

#### R2-P4-1 — Deactivation spans two systems without a compensating step

- **Severity:** P3 · **Confidence:** VERIFIED
- **File:** `api/admin-router.ts` · **Lines:** 357-373
- **What's wrong:** if the DB transaction fails after the GoTrue ban and session
  deletion, the account is banned but not marked deactivated and keeps its feature
  grants. The user cannot sign in (ban) and existing sessions are gone, so nothing is
  exposed; the admin sees an error and a retry completes the sequence (idempotent).
- **Targeted fix:** run the DB transaction first and ban second, or wrap the ban in a
  compensating `ban_duration: "none"` on transaction failure.
- **Deployment blocker:** NO

#### R2-P4-2 — Strict analysis validation can reject a legitimate but sparse model answer

- **Severity:** P3 · **Confidence:** VERIFIED (behavioural consequence of the new
  validators)
- **File:** `api/lib/document-evidence.ts` · **Lines:** 21-25, 82-90
- **What's wrong:** `summary` requires a non-empty `summary` string; a model that
  returns only `headline` + `keyPoints` is refused with "review was incomplete". Correct
  from a data-integrity view (nothing partial is stored), but it surfaces to the user as
  a retry. Similarly `dd_checklist` refuses any item with a status outside the three
  words.
- **Targeted fix:** none required; optionally fall back to `headline` as the summary
  when `summary` is absent.
- **Deployment blocker:** NO

### P4 verdict

Core flows correct; the round-1 P2 correctness items are resolved. Two P3 notes on the
new code.

---

## P5. Database schema, migrations and persistence — COMPLETE

### Schema vs. migrations

- **25 migrations.** The new `20260910120000_organizations_rls_and_user_deactivation.sql`
  adds RLS + revoke on `organizations` and `users.deactivated_at`; `db/schema.ts` carries
  the matching `deactivatedAt` column. Drizzle model and SQL re-compared for the changed
  table: aligned.
- **Idempotency on re-application:** `20260628000000_fix_column_types.sql` is now
  guarded on `information_schema.columns.data_type`. Every other file was re-read for
  re-run safety: `CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `DROP … IF EXISTS` before `CREATE POLICY/TRIGGER`, `DROP CONSTRAINT IF EXISTS` before
  `ADD CONSTRAINT`, DO-guarded FKs, `ON CONFLICT DO NOTHING` grants, and backfill
  `UPDATE`s that recompute the same values. **P5-1 closed as a data-loss risk**; the
  history check remains good practice.
- `supabase/config.toml` no longer references a missing `seed.sql`. **P5-2 closed** in
  the repository; hosted `organizations` RLS applies once the migration is pushed.
- **Connection architecture:** unchanged; boot TLS check now feature-detects the pg
  internal (P9-2 closed). `statement_timeout` through Supavisor remains unverified
  (P5-3, SUSPECTED).

### Findings

#### R2-P5-1 — Boot passes but every login fails if the newest migration is not applied

- **Severity:** P1 · **Confidence:** VERIFIED
- **File:** `api/lib/deployment-check.ts` · **Lines:** 24-29; `api/queries/users.ts:6-13`;
  `db/schema.ts` (`deactivatedAt`)
- **Affected flow:** every authenticated request.
- **What's wrong:** `assertDeploymentReady` verifies only `public.rate_limits` and the
  three buckets. `findUserById` is `select()` — Drizzle lists every column, including
  `deactivated_at`. On a database where `20260910120000_…` has not been pushed, the
  process starts, `/health` and `/ready` return OK, and `authenticateRequest` throws
  `42703 column "deactivated_at" does not exist` on every request: nobody can sign in,
  and the platform's health check reports a healthy service.
- **Why it matters:** the boot gate exists precisely to refuse to start on a stale
  schema; this change added a required column outside its coverage. The runbook orders
  `db:migrate` before deploy, but the gate is what protects against the runbook being
  skipped.
- **Realistic scenario:** `autoDeployTrigger: checksPass` deploys the commit before an
  operator runs `npm run db:migrate`; the site is up and no one can log in until they
  do.
- **Targeted fix:** in `assertDeploymentReady`, add a query against
  `information_schema.columns` for `users.deactivated_at` (five lines), or — better and
  general — read `supabase_migrations.schema_migrations` and require the newest version
  present in `supabase/migrations/` to be recorded, so every future migration is covered
  without editing the check.
- **Deployment blocker:** YES until the migration is applied to the target database (an
  operational step); the code fix should land before the next schema change.

### P5 verdict

Schema and migrations consistent and now safe to re-apply. One new P1: the boot gate
does not cover the newest migration.

---

## P6. Deployment architecture and hosting compatibility — COMPLETE

### Runtime components

Unchanged: one persistent Node process serving API and static assets; Supabase; external
cron. No workers, no serverless, no realtime, no filesystem persistence. The cron endpoint
now also runs the Storage orphan sweep in-request.

### Vercel

Unchanged conclusion, re-confirmed against the current `api/boot.ts` (top-level `await`,
`serve()`, process signal handlers, in-memory refresh dedupe and AI dedupe): **not
suitable for the backend, not needed for the frontend.**

### Platform-neutral checks (delta from round 1)

| Check | Round 2 |
|---|---|
| Manifest posture | `render.yaml`: `APP_MODE=production`, `plan: starter`, all secrets and the three acknowledgements `sync: false`. A deploy from this blueprint refuses to start until the operator supplies genuine values. **P6-1 closed.** |
| Canonical host | Production middleware redirects (GET/HEAD, 301) or refuses (421) any `Host` other than `SITE_URL`'s; `/health` and `/ready` exempt so the container `HEALTHCHECK` (127.0.0.1) and the platform's checker keep working; `CANONICAL_HOST_REDIRECT=false` opts out. `x-forwarded-host` is honoured only when proxy headers are trusted. **P6-4 closed.** |
| Cron | Workflow exits 1 when secrets are absent. **P6-3 closed.** |
| Cold start | `AUTH_SETTLE_TIMEOUT_MS` raised to 20 s; paid plan avoids spin-down. **P6-2 closed.** |
| AI request budget | 60 s wall-clock. **P6-5 closed.** |
| Build / start / port / non-root / TLS / secrets injection | Unchanged; all PASS. |

### Findings

#### R2-P6-1 — Two callers must use the canonical origin or they will be refused

- **Severity:** P3 · **Confidence:** VERIFIED
- **File:** `api/boot.ts` · **Lines:** 104-116; `.github/workflows/deadline-cron.yml`;
  `scripts/smoke-deployment.ts`
- **What's wrong:** the cron `POST` gets a 421 if `ANSYRA_CRON_URL` is the platform's
  default hostname rather than `SITE_URL`, and the smoke script (which expects `200` on
  `/`) fails on a non-canonical `SMOKE_BASE_URL`. Both are correct signals, but they are
  new ways to misconfigure.
- **Targeted fix:** none in code; the runbook already says "the same production origin".
  Added to the manual checklist below.
- **Deployment blocker:** NO

#### R2-P6-2 — Host-header dependence behind a rewriting proxy

- **Severity:** P3 · **Confidence:** SUSPECTED (platform-dependent)
- **File:** `api/boot.ts` · **Lines:** 106-109
- **What's wrong:** with `TRUST_PROXY_HEADERS=false` the middleware compares the raw
  `Host` header. A proxy that rewrites `Host` to an internal name would redirect every
  request in a loop. Render, Fly, Railway and Cloud Run preserve `Host`; the opt-out
  exists for the ones that do not.
- **Deployment blocker:** NO (verify one page load after deploy; disable via env if it
  loops)

### Deployment decision

**SINGLE PLATFORM APPEARS SUFFICIENT** — unchanged.

---

## P7. Error handling and operational resilience — COMPLETE

Re-verified: no empty catch blocks other than the deliberate JWT guard; `/ready` and
pool error handling unchanged; AI failures mapped to user-facing codes; nothing persisted
before validation. Changes since round 1:

- **Supabase calls** on the request path now time out (`EXTERNAL_REQUEST_TIMEOUT_MS`) via
  the shared client factory. **P7-2 closed.**
- **Retries** stop after our own timeout and inside a wall-clock budget. **P7-1 closed.**
- **Reminders** are stamped only when the email was sent or legitimately skipped; a
  provider failure retries next sweep. **P7-3 closed.**
- **Orphan sweep** failures are caught and reported in the cron JSON without failing the
  reminder run.
- **Fail-fast on unhandled rejection** kept by design (P7-5).

### Findings

#### R2-P7-1 — The cron request can outlive the caller's timeout

- **Severity:** P3 · **Confidence:** VERIFIED
- **File:** `api/boot.ts` · **Lines:** 118-136; `.github/workflows/deadline-cron.yml:27`
- **What's wrong:** the endpoint runs the reminder sweep, two prunes and the Storage
  sweep (up to 200 folders × one list call each) inside one request; `curl --max-time
  120` may give up while the server continues. The work still completes, but the
  workflow reports a failure and `--retry 3` re-invokes it (idempotent, so harmless).
- **Targeted fix:** run the storage sweep with its own time budget (e.g. stop after 60 s
  and report `partial: true`), or move it to a second cron path.
- **Deployment blocker:** NO

---

## P8. Performance, scalability and AI cost controls — COMPLETE

- **AI cost:** limits unchanged and DB-backed; **new** in-flight dedupe refuses an
  identical request from the same user while one runs (**P8-3 closed**); anonymous
  paths no longer exist at all.
- **Database:** `loadBenchmarkCells` is three batched queries + in-memory grouping;
  `packEvidence` resolves the union of citations once per deal (**P8-1 closed**). The
  three AI history lists are capped at 500 (**P8-2 partly closed**; `deals.list` /
  `targets.list` intentionally unbounded). `admin.removeUser` adds four count queries —
  negligible.
- **Per-request auth cost** unchanged (one GoTrue call + three DB queries per batch).
- **Runtime:** PDF extraction still on the event loop (**P8-4 open**, deferred with
  reason).

No new findings.

---

## P9. TypeScript and code reliability — COMPLETE

`tsc -b` clean; ESLint clean at `--max-warnings 0`. Census: `as any` 0 in `api/`/`src/`;
`@ts-ignore`/`@ts-expect-error` 0; the three `as never` casts at UI/API seams are gone
(remaining grep hits are comment text). `as unknown as` remains only where it is
feature-detected (`api/queries/connection.ts`) or in UI typing shims. **P9-1, P9-2, P9-3
closed.** New code introduced no assertions or unhandled promises (every fire-and-forget
path still `.catch`es; the sweep is awaited with a `.catch`).

No new findings.

---

## P10. Logging, repository hygiene and dependencies — COMPLETE

- **Logging:** re-read every `console.*` in `api/`: still no secrets, prompts,
  completions or document text. The new lines log counts and provider error text only.
- **Hygiene:** no tracked junk; `.gitignore`/`.dockerignore` unchanged and still correct;
  dead code removed. **Still uncommitted: 165 paths**, including every security control
  from the 7 September pass and this remediation. This is now the single largest
  operational risk in the repository (R2-P10-1).
- **Dependencies:** 63 production packages (was 69); `npm audit --omit=dev`: 0
  vulnerabilities; lockfile updated by `npm uninstall`/`install`. `@types/three` is a
  devDependency. **P10-1/P10-2 closed.** Runtime image still reinstalls all production
  deps (P10-3, kept for reproducibility).
- **Docs:** `docs/deployment-testing.md` updated for templates, migration history, new
  env vars and new checks; `docs/SECURITY_CHANGES.md` still cites the pre-remediation
  test counts (R2-P10-2).

### Findings

#### R2-P10-1 — The deployable state exists only in an uncommitted working tree

- **Severity:** P1 · **Confidence:** VERIFIED
- **File:** repository state (`git status`: 121 modified, 44 untracked, 6 deleted; HEAD
  `1310acc` unchanged since round 1)
- **What's wrong:** GitHub still holds the pre-hardening application. CI, CodeQL, the
  container build and Render's `autoDeployTrigger: checksPass` all operate on commits;
  none of them has seen the active-session check, origin check, boot gates, rate-limit
  table, deactivation flow, or the production manifest.
- **Realistic scenario:** a push of any small change from another checkout deploys the
  old code; or the local tree is lost.
- **Targeted fix:** review the diff, commit, push, confirm the three workflows pass on
  that commit, tag it as the release candidate.
- **Deployment blocker:** YES (nothing reviewed here is deployable until it is committed)

#### R2-P10-2 — Security-changes note cites superseded numbers

- **Severity:** P3 · **Confidence:** VERIFIED
- **File:** `docs/SECURITY_CHANGES.md` · **Lines:** 25-27
- **Targeted fix:** update or add a dated addendum referencing this review.
- **Deployment blocker:** NO

---

## P11. Accessibility and UI reliability — COMPLETE

Read-only; no browser session driven, so responsive/mobile and focus order remain **NOT
VERIFIED** in situ. From source: the new organisation `<select>` is labelled through
`FieldGroup`/`useFieldControlId` like the role select; the "Deactivated" chip is text;
"Remove account" modal uses the same `DialogShell` (Radix) as before; password
placeholders now say 12 characters (**P11-1 closed**). Motion preference unchanged by
design (P11-2).

No new findings.

---

## Remaining verification commands — COMPLETE

Scripts re-inspected before running; nothing here writes to a database or modifies
source (`lint` has no `--fix`; `test` is the pure unit config).

| Command | Result | Exit | Notes |
|---|---|---|---|
| `npm run check` | PASS | 0 | early gate |
| `npm run build` | PASS | 0 | early gate; 5.8 MB server bundle |
| `npm run lint` | PASS | 0 | `--max-warnings 0` |
| `npm test` | PASS | 0 | 71 files, **1,039 tests** (8 added in remediation, all passing) |
| `npm run audit:prod` | PASS | 0 | 0 vulnerabilities |
| `npm run test:integration` | **SKIPPED — potential real-service/database writes** | — | Needs a loopback local Supabase stack and `.env.test.local`; neither present. Harness refuses hosted URLs. Four procedures changed behaviour since the last green run (7 Sep): `admin.createUser`, `admin.removeUser`, `access.approve`, `deals.delete` — run `npm run test:local:*` before release. |
| `npm run test:regression` | **SKIPPED — potential real-service/database writes** | — | Same. |
| `npm run test:e2e` | **SKIPPED — potential real-service/database writes** | — | Launches the dev server against `.env` (hosted project) and creates scratch rows. Note: no e2e spec references the renamed "Delete"→"Remove" action or the organisation field, so the UI changes should not break them. |
| `npm run smoke` | SKIPPED | — | Needs a deployed origin. |
| `docker build` | SKIPPED | — | No daemon available here; CI covers it once committed. |

---

## Final production assessment — COMPLETE

### Actual architecture

Unchanged in shape from round 1: one persistent Node process (Hono + tRPC) serving the
React SPA and the API on a single origin; Supabase Postgres (via pooler, as `postgres`),
Auth (server-side only, httpOnly cookie, per-request active-session check, deactivation
flag), Storage (service-role-signed URLs, bucket limits, deletion cleanup + daily sweep);
provider-agnostic AI with server keys, DB-backed limits, in-flight dedupe, validated
outputs, and a data-processing acknowledgement gate; external cron. No vector store.

### Deployment architecture

**SINGLE PLATFORM APPEARS SUFFICIENT.** Persistent Node host + Supabase + external cron.
Vercel unsuitable for the backend and unnecessary for the frontend.

### What round 2 confirms was fixed

Of the 44 round-1 findings: **31 closed in code** (P1-1, P1-2, P1-3, P1-4, P2-2, P2-3,
P2-5, P3-1 (config + gate), P3-2, P3-3 (largely), P3-4, P4-1, P4-3, P4-4, P4-5, P4-6, P4-7,
P5-1, P5-2, P6-1, P6-2, P6-3, P6-4, P6-5, P7-1, P7-2, P7-3, P8-1, P8-2 (partly), P8-3,
P9-1, P9-2, P9-3, P10-1, P10-2, P11-1), **5 deferred with reasons** (P2-4, P5-3, P7-5,
P8-4, P10-3, P11-2), **2 operational** (P2-1 rotation, P4-2 templates). No round-1
conclusion had to be reversed.

### Deployment verdict

**DO NOT DEPLOY YET.**

The verdict is unchanged, but the reason has narrowed to three concrete gates, two of
which are operator actions and one of which is a small code change that should land
before the next schema change:

### Release blockers (VERIFIED P0/P1)

1. **R2-P10-1** — Commit and push the working tree; confirm CI, CodeQL and the container
   build pass on that commit. Nothing reviewed here is deployed until this happens.
2. **R2-P5-1** — Apply `20260910120000_organizations_rls_and_user_deactivation.sql` to
   the target database before (or with) the deploy; otherwise the service boots healthy
   and every login fails with a missing-column error. Extend `assertDeploymentReady` to
   check the newest migration so this class of failure cannot recur.

### Critical findings requiring action (SUSPECTED P1 / operational)

3. **P2-1** — Rotate the burned Supabase service-role key, DB password and Gemini key.
4. **P4-2** — Set the Supabase invite/recovery email templates to send `token_hash`;
   disable self-signup; set Site URL and the two redirect URLs; verify with one real
   invite.
5. Choose an AI provider/tier with a data-processing agreement and only then set
   `AI_DATA_PROCESSING_APPROVED=true` (the gate now enforces this for document analysis).

### Recommended before launch (P2/P3 worth doing)

- R2-P1-1 (refuse admin mutations on deactivated accounts), R2-P4-1 (order the
  deactivation steps), R2-P3-1 (rotate the sweep offset), R2-P7-1 (time-box the sweep),
  R2-P3-2 (move the DPA gate into `resolveProvider`).
- Run the local integration and regression suites once against the changed procedures.

### Can wait until after launch

R2-P4-2, R2-P6-1, R2-P6-2, R2-P10-2; round-1 deferrals P2-4, P5-3, P8-4, P10-3.

### Security summary

| Area | Rating | Change vs round 1 |
|---|---|---|
| Authentication | **PASS** | deactivation enforced per request |
| API/tRPC authorization | **PASS** | anonymous write paths removed |
| User isolation | **PASS** | — |
| Organisation isolation | **PASS** | name-matched membership removed |
| Supabase/RLS | **PASS** (repo) / **NOT VERIFIED** (hosted) | `organizations` covered by migration |
| Service-role/privileged access | **PASS** | narrowed to admin + Storage |
| Secrets | **NEEDS ATTENTION** | rotation still outstanding (P2-1) |
| Vector/RAG isolation | **PASS** (none exists) | — |
| Uploaded documents | **PASS** | deletion cleanup + sweep |
| AI confidential-data handling | **PASS** under the shipped manifest; **NEEDS ATTENTION** for the provider/DPA choice | gate added |
| AI abuse controls | **PASS** | spoof-resistant IP keying, in-flight dedupe |
| Admin functionality | **PASS** | offboarding fixed; R2-P1-1 minor |

### Manual deployment checklist (outside the repository)

Repository
- [ ] Commit, push, tag; CI + CodeQL + container build green on that commit (R2-P10-1).
- [ ] Run `npm run test:local:integration` and `test:local:regression` once.

Supabase
- [ ] Rotate service-role key, DB password, Gemini key; update host env (P2-1).
- [ ] `npm run db:status` → all **25** migrations recorded; `npm run db:migrate` (R2-P5-1).
- [ ] Disable self-signup and anonymous sign-ins (boot gate).
- [ ] Site URL = canonical origin; redirect URLs `/welcome`, `/reset-password/confirm`.
- [ ] Invite and Recovery templates carry `token_hash`; send one real invite (P4-2).
- [ ] Advisor: `organizations` shows RLS enabled after the push; anon/authenticated hold no grants.
- [ ] Buckets `avatars`/`bug-screenshots`/`deal-documents` with limits (boot gate).
- [ ] `SHOW statement_timeout` through the pooler (P5-3).
- [ ] Backup restore drill completed before `BACKUP_RESTORE_TESTED=true`.

Host (Render or equivalent)
- [ ] Supply every `sync: false` value in `render.yaml`; set the three acknowledgements to `true` only when true.
- [ ] `SITE_URL` = the custom domain; confirm one page load on the default `*.onrender.com` host redirects (set `CANONICAL_HOST_REDIRECT=false` only if it loops) (R2-P6-2).
- [ ] `TRUST_PROXY_HEADERS=true`, `PROXY_IP_HEADER=x-forwarded-for`, `TRUSTED_PROXY_HOPS=1`; verify the spoof test in the runbook (item 6).
- [ ] AI provider/tier with a DPA; spend limits at the provider; `AI_DATA_PROCESSING_APPROVED=true` only after that.
- [ ] GitHub secrets `ANSYRA_CRON_URL` (**the canonical origin**, R2-P6-1) and `ANSYRA_CRON_SECRET` (copied from the host); run the workflow once and read the JSON, including the `storage` sweep object.
- [ ] `SMOKE_BASE_URL` = canonical origin; `npm run smoke`.
- [ ] Sentry DSN(s); DNS/TLS; then the runbook's manual tests §5 (including the new offboarding and deal-deletion checks).

Legal
- [ ] Four `CounselMark` placeholders resolved before `LEGAL_REVIEW_COMPLETE=true`.

### Not reviewed / could not verify

- Hosted Supabase configuration and migration history (only inferable).
- Integration, regression and e2e suites — SKIPPED (no local stack; e2e targets the hosted project); last green 7 September, before four procedures changed.
- Docker image build — no daemon; CI covers it after commit.
- Platform behaviours: Render's `Host` handling, request timeout, `X-Forwarded-For` append semantics — SUSPECTED values only.
- Supavisor's handling of `statement_timeout`.
- In-browser behaviour (responsive layout, focus order, the new admin select in situ).
- Effect of `ban_duration` on an already-issued access token at GoTrue (the app's own
  `deactivated_at` check covers it regardless).

Every tracker item above was completed as described; skipped executions carry their
reason; nothing is marked PASS that was not run or traced. `docs/release-review.md`
(round 1) was not modified by this round.

---

## Remediation log — round 2 (applied 2026-09-11 at the owner's request)

Verification after the changes: `npm run check` PASS · `npm run lint` PASS · `npm test`
PASS (73 files, **1,046** tests; 7 added) · `npm run build` PASS · `npm run audit:prod`
0 vulnerabilities. DB-backed suites still not run here (no local Supabase).

| Finding | Change |
|---|---|
| **R2-P10-1** (blocker) | Working tree committed on branch `release/hardening-2026-09` and pushed; a pull request into `main` was opened so CI, CodeQL and the container build run on the exact commit. Merging to `main` (which auto-deploys on green checks) is the owner's decision. |
| **R2-P5-1** (blocker) | `api/lib/migrations-manifest.ts` pins the newest migration version; `assertDeploymentReady` refuses to start unless `supabase_migrations.schema_migrations` records it (clear message naming `db:status`, `db:migrate` and `migration repair`). `migrations-manifest.test.ts` fails the unit suite — and CI — whenever a migration file is added without moving the pin. |
| R2-P1-1 | `setUserKind`, `setUserFeatures`, `resetPassword` refuse a deactivated target (`requireActive`). |
| R2-P3-1, R2-P7-1 | `sweepOrphanedDocuments` collects every folder name (one call per thousand), inspects a window that rotates daily by the window size (no state to persist), and stops inside a 45 s budget reporting `partial: true`. Four unit tests (orphan vs known vs young, rotation coverage, budget, empty bucket). |
| R2-P3-2 | The data-processing acknowledgement is checked in `resolveProvider()` for every live call in production; `analyzeDocument` calls the exported `assertLiveAiPermitted()` before the 20 MB download. `.env.example` and the runbook say "every live AI call". |
| R2-P4-1 | Deactivation now sets `deactivated_at` and strips grants first, revokes sessions second, and bans at GoTrue last; a ban failure reports a clear retryable error with the account already closed on the Ansyra side. |
| R2-P4-2 | A headline-only summary is kept with the headline as the prose; an answer with neither is still refused. One unit test. |
| R2-P6-1 | `/internal/*` is exempt from the canonical-host redirect (it is secret-authenticated); the smoke script names the canonical origin when it receives a redirect; runbook updated. |
| R2-P6-2 | The redirect applies only to public hostnames: localhost, IP literals, IPv6 literals and dotless internal names are served as-is, so a Host-rewriting proxy cannot cause a loop. |
| R2-P10-2 | `docs/SECURITY_CHANGES.md` carries a dated addendum pointing at both reviews with current counts. |

### R2-P6-3 — CodeQL cannot succeed on this repository, and a red check blocks auto-deploy

Found while verifying the R2-P10-1 fix, on the workflow's **first ever run** (the file
was one of the untracked paths, so it had never executed before).

- **Severity:** P2 · **Confidence:** VERIFIED
- **File:** `.github/workflows/codeql.yml`; `render.yaml:15`
- **Evidence:** `github/codeql-action/analyze@v3` fails with `Resource not accessible by
  integration`; `GET /repos/priyanshu0210/AnsyraV7/code-scanning/alerts` returns
  `403 Code scanning is not enabled for this repository`; the repository is private.
  Code scanning is free only on public repositories; on a private one it requires
  GitHub Advanced Security.
- **Why it matters:** beyond a permanently red pull request, `render.yaml` uses
  `autoDeployTrigger: checksPass`. A check that can never pass means the service would
  never auto-deploy, which would have looked like a broken deployment pipeline rather
  than a disabled security tool.
- **Fix applied:** the job is guarded with
  `if: github.event.repository.visibility == 'public' || vars.ENABLE_CODEQL == 'true'`.
  On the private repository the job is skipped instead of failing; it enables itself if
  the repository is ever made public, and the repository variable `ENABLE_CODEQL=true`
  turns it on for a private repository once Advanced Security is purchased. No security
  capability is removed — the analysis was never running.
- **Left to the owner:** whether to buy Advanced Security, make the repository public, or
  accept dependency scanning (Dependabot) plus `npm run audit:prod` as the automated
  security coverage. **Static analysis is currently NOT running on this codebase.**
- **Deployment blocker:** NO (but confirm on the first deploy that Render treats a
  *skipped* check as passing for `checksPass`; if it does not, set the trigger to
  `commit` or enable the workflow properly).

### Verdict after this remediation

With the branch pushed and the migration gate in place, the code-level reading is
**SAFE TO DEPLOY AFTER MINOR FIXES**; the remaining gates are operator actions listed in
the checklist above (credential rotation, Supabase auth/template/URL configuration,
applying migration `20260910120000` and confirming `db:status`, provider/DPA choice, and
the local DB-backed test run), plus merging the pull request once its checks are green.