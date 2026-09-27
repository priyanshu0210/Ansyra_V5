# Ansyra

Ansyra is a workspace for mergers and acquisitions (M&A). It helps a team keep the evidence, assumptions, reviews, and decisions behind an acquisition together, then compare planned benefits with recorded results after closing.

This is a personal portfolio demonstration. Use fictional companies, documents, and deal data. AI provides research and draft analysis; people check the evidence and make the decisions. The application does not establish that an investment is sound or replace specialist advice.

## What you can do

| Feature | Purpose and important limits |
| --- | --- |
| Deal Pipeline | Track opportunities through six deal stages. Forward moves require a recorded decision and applicable readiness checks. |
| Target Screening and AI Discovery | Keep a manual shortlist or research candidate companies by industry, geography and size. Check source links and financial estimates. Saving a target does not create a pipeline deal. |
| Deal Economics | Calculate valuation multiples, financing balances and simplified investment returns with defined formulas, not AI arithmetic. |
| Data Room and diligence tracker | Upload documents, request analysis of extracted text, and track review tasks. Quoted concerns are checked against extracted text; scanned or long documents may have limits. |
| People & Integration Review | Turn supplied information into questions about leadership, retention and working practices. It does not browse employee reviews or assign a compatibility score. |
| Regulatory Review | Organise questions and missing evidence for specialist review. It does not research current law or predict regulatory clearance. |
| Assumption Ledger | Ask AI to challenge an assumption, then record an attributed review. Scores above 80 block advancement until the concern is resolved or its risk accepted with evidence and a reason. Scores are model judgements, not probabilities. |
| Decision Log and committee memo | Record decisions and reasons. Request a draft investment committee memo based on selected saved records, then review it. AI cannot approve a deal. |
| Recommendations and scenarios | Record proposed conclusions, evidence, alternatives, reviews and outcomes. Compare scenarios; AI-generated weights are not calibrated forecasts. |
| Timeline and comments | Keep deadlines, owners and discussion with the deal. Comments do not replace formal review or approval. |
| Deal Genome | Ask questions about an extract of up to 40 accessible deals, selected assumptions and saved economics. It does not search full documents, memos, decision narratives or synergy plans. |
| Precedent Comps and Analytics | Compare your recorded transactions and review portfolio summaries. These are internal records, not a market-wide database. |
| Synergy Engine | Enter planned and actual benefits, compare differences, and request explanations and possible corrective actions. Actuals are entered by the team; AI explanations need investigation. |

The copilot uses the page context and recent conversation. It does not automatically read the dashboard database, search the web, or change deal records. Successful structured analyses are saved to their relevant records; Genome answers are not saved analyses, and chat has its own history.

Public feature pages and dashboard help explain the inputs, outputs, AI contribution, limits, and relevant deal stage. See the [feature mapping and audit](docs/landing-product-audit-2026-09-27.md).

**Engineering highlights**

- **One AI gateway.** Every AI call goes through `api/lib/ai.ts::callAI` — provider-agnostic (Gemini/Groq/OpenRouter/Anthropic), strict-JSON output contracts validated with zod, automatic retry, and a mock provider so the full product runs with **zero AI spend** in development. Web-grounded research calls (Target Discovery) use Gemini native grounding with source citations.
- **Defense-in-depth multi-tenancy.** Postgres RLS is locked down deny-by-default; the app layer independently scopes every query through `scopeFilter`/`assertDealAccess` (`createdBy = user OR organization`). Isolation is curl-tested across users as part of the definition of done.
- **AI results are never ephemeral.** Every AI mutation persists its result server-side in the same request — analyses survive reloads, feed the Deal Genome corpus, and build the data moat.
- **Sessions done properly.** httpOnly cookie sessions wrapping Supabase JWTs, concurrent-refresh deduplication (Supabase rotates refresh tokens on first use), sticky client auth that survives transient network failures.
- **RBAC with feature gating.** `user_kind` roles + granular admin permissions + per-user feature flags, with a single source of truth in `contracts/constants.ts`; product features are gated per user, and the middleware tiers (`memberQuery`/`featureQuery`/`adminPermQuery`) make authorization declarative.
- **Migration discipline.** Hand-written SQL migrations dual-applied (Supabase + versioned in `supabase/migrations/`) and mirrored in a typed Drizzle schema.
- **Ships like a product.** Multi-stage Dockerfile, GitHub Actions CI, Sentry (client + server), and a smoke-test runbook.

## Recent improvements and why they were made

| Change | Why |
| --- | --- |
| INR-default currency dropdown and shared money controls | Keep currency selection consistent while preserving the original units in saved records. Reference exchange rates are dated, not live market quotes. |
| Route and deal preloading, shared request handling, and deferred dossier sections | Reduce repeated requests and unnecessary work during navigation. First visits still depend on network, server and cache conditions. |
| Deferred export preparation | Load the required dossier content before printing instead of printing incomplete sections. |
| Review-history and deal-scoped review queries | Show the relevant review record without mixing information from different deals. |
| Synergy rendering and stale-analysis fixes | Handle older saved results safely and clear an explanation when the numbers it described change. |
| Session controls and inactivity handling | Support sign-out scopes and browser-side inactivity handling. A suspended browser enforces its deadline when it resumes. |
| Responsive hero and stationary audience selector | Keep the hero content visible on desktop and stop audience cards jumping over other content. |

Scope → Ground → Analyse → Verdict describes an assumption-review process: choose the question, supply context, review the model's reasoning, and record a human response. It is not an automatic pipeline shared by every feature.

## Technology and structure

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS and Framer Motion.
- **API:** Hono, tRPC, TanStack Query and Zod contracts.
- **Data:** Supabase Postgres, Auth and Storage, with Drizzle schema definitions and versioned migrations.
- **AI:** Configurable providers through a shared gateway; mock mode supports development without live AI charges. Discovery uses a supported research provider for web grounding.
- **Delivery:** Docker, GitHub Actions, Vitest and Playwright.

`src/` contains the interface, `api/` the server, `contracts/` shared rules, and `supabase/migrations/` database changes. The server enforces authentication, feature permissions and record access; frontend visibility is not the security boundary. Financial formulas remain separate from AI reasoning.


## Deployment

The Docker image serves the frontend and API from one Node process. `/health` checks the process; `/ready` checks database readiness. Render hosts the current application from AnsyraV7's `release/hardening-2026-09` branch. Ansyra_V5 is a separate private source snapshot prepared for possible later publication; it does not replace that deployment source.

`render.portfolio.yaml` describes the portfolio setup. `render.yaml` describes the separate real-data setup with additional startup requirements. Follow the [deployment runbook](docs/deployment-testing.md). A Git push and a successful deployment are separate steps.

Optional `VITE_PUBLIC_CONTACT_EMAIL` supplies the public contact shown on legal pages. It is intentionally public and must never contain a password, token or other secret. All service credentials belong in the hosting platform's environment settings. The mirror's scheduled reminder job stays disabled unless explicitly configured with `ENABLE_DEADLINE_CRON=true` and its own secrets.

## Repository safety

- Do not commit `.env` files, generated seed passwords, database dumps, authentication sessions, private keys, or test artifacts. `.env.example` contains configuration names and placeholders only.
- The Ansyra_V5 snapshot starts with a clean Git history rather than copying historical operational records and author metadata.
- A scan can identify known patterns and accidental copies; it cannot guarantee that every possible secret has been found. Review the exact files before changing repository visibility, and rotate any credential that was ever exposed.

Source-available for review, not open source: see [LICENSE](LICENSE). Bundled fonts retain their separate terms in [public/fonts/LICENSES.md](public/fonts/LICENSES.md).

Built by **Priyanshu Singh**.
