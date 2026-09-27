# Ansyra portfolio release — changes and next steps

6 September 2026. This pass fixes the existing product and updates its presentation. The guided case inside the authenticated workspace and earnings bridge below are proposed additions, not shipped features. The owner will personally provide sample account credentials; login and Request Access remain part of the product. Nothing has been deployed or changed in the live database.

## What changed: before and after

| Area | Before | After |
|---|---|---|
| High-risk assumptions | A non-empty reviewer note could clear an assumption above 80. | An answer alone stays open. Resolution or explicit risk acceptance needs a reason, evidence reference, authenticated reviewer and server timestamp. Reviews append to history. |
| Existing notes | A note could imply approval without an explicit decision. | Old notes remain visible but do not count as an attributed resolution. Previously cleared high-risk rows may need review again. |
| Readiness | Recommendation-only messages could disagree with the assumption gate. | Advancement, health, recommendation status and the exported pack use a shared readiness rule. Missing query coverage is shown as unavailable. Passing recorded checks is explicitly not approval to acquire. |
| Recommendation evidence | A draft or replacement could be accepted without an available supporting record. | Both acceptance paths require an available source and reject missing references. The pack resolves and displays supporting records, including missing-source warnings. |
| Document red flags | Generated quotes were not checked against extracted text before saving. | Every new red-flag quote must occur literally in the extracted text. Results include a file hash, text offsets and a PDF page where identifiable. A failed quote check stops the analysis being saved. |
| Document coverage | A result could appear to cover the complete file. | The UI states extraction limits and truncation. Scanned images are not assessed. A matching quote verifies the quotation, not the legal interpretation. |
| People and regulatory tools | Company-name prompts produced numerical assessments with insufficient evidence. | Supplied context produces questions and evidence gaps. Legacy scores are hidden behind an unverified-analysis notice. No clearance probabilities or compatibility scores are requested. |
| Scenarios | Generated percentages resembled calculated likelihoods. | Bear/base/bull cases are illustrative. Percentages are removed from cards, comparison, evidence summaries and exports. Driver assumptions must match supplied statements. |
| Assumption comparables | A model could return references without retrieved precedents. | The prompt states that no precedents were retrieved, and the saved comparables array is empty. |
| AI failures | Provider failures could surface poorly; a missing key could substitute mock output. | Quota, busy, configuration and timeout messages are understandable. Temporary errors get bounded retries; daily quota failures do not. Missing live keys return an error. Mock output requires explicit configuration. |
| AI allowance | One user's calls could consume the shared allocation without a useful status display. | Personal and platform request limits are enforced on the server; users see their app allowance, reset time and low-capacity warning. |
| Marketing | Some copy implied universal factual checks, definitive scores or complete sign-off. | Copy distinguishes saved records, AI suggestions, recorded advancement checks and human judgment. Portfolio status is explicit. |
| Financial language | Acronyms and return assumptions needed prior knowledge. | Economics has a small expandable explanation of EV, EBITDA, multiples, MOIC, IRR and the quick model’s limitations. Synergies and the optimism indicator also have short explanations. |
| Motion and imagery | Carousel movement did not pause for reading. | Motion remains on by default. Hover/focus pauses the carousel; leaving resumes it. No navigation buttons were added. Still mode exposes all six cards. A labelled fictional manufacturing image adds business context. |

The indicator threshold of 80 is an application policy, not a statistically calibrated failure probability. Risk acceptance records a person's decision to proceed despite a concern; it does not prove that the concern disappeared.

## The guided acquisition case, step by step

This is a curated path through the tools you already have. Visitors should understand one acquisition decision in about five to ten minutes instead of being asked to learn eleven tools at once.

1. The owner provides a reviewer with sample account credentials. After login, a **Start the sample acquisition** card in the dashboard opens the guided case. The fictional nature of the deal is visible immediately. A public no-login demo route is not planned.
2. A short deal brief explains the buyer, target, asking price and the reason for the acquisition. Use a single fictional industrial-services or manufacturing acquisition consistently throughout.
3. The visitor opens two or three short fictional source documents in the Data Room. Each claim links to a specific page or passage.
4. The Assumption Ledger highlights one consequential issue: the seller's claimed earnings include an adjustment the buyer cannot support.
5. The visitor changes that assumption. The proposed earnings bridge explains how it changes the earnings used to assess the price.
6. The scenario view shows the consequences of accepting the seller's case or adopting the buyer's more cautious case. These are alternatives, not predictions with invented probabilities.
7. A recommendation explains **proceed, renegotiate or stop**, with evidence and an objection. A human review records why the issue is resolved or why the risk is accepted.
8. The Decision Pack summarises the case. A short fictional post-close chapter in the Synergy Reality Engine compares what was promised with what happened.

These steps tie the authenticated demonstration to the existing workflow. The differentiator is the visible connection **source → assumption → financial effect → decision → later outcome**. More AI tools alone will not create that distinction.

The existing Request Access button, form and approval logic remain. Reviewers can sign in using the credentials the owner personally supplies; other visitors can request access. A separate ordinary member account for each reviewer is recommended, with fictional data isolated from private work. Shared editable credentials would mix changes, attribution and per-account AI allowances. A restricted read-only shared-account mode is a possible alternative, but is not currently implemented.

## Where the earnings bridge fits

Add it inside **Deal dossier → Economics**, beside the current price and multiples. Link each adjustment to the Assumption Ledger and its source in the Data Room. Pass the selected, reviewed earnings figure to the existing deterministic calculation, then carry the effect into scenarios and the Decision Pack.

A simple fictional example:

| Step | Earnings / price |
|---|---:|
| Seller's claimed adjusted EBITDA | £10m |
| Adjustment the buyer does not accept | −£2m |
| Buyer's supported EBITDA | £8m |
| Asking enterprise value | £80m |
| Price using the seller's earnings | 8× EBITDA |
| Price using the buyer's earnings | 10× EBITDA |

The business has not become more expensive in pounds; the same £80m price buys less supported earnings. That is the financial consequence a visitor should see immediately.

Keep future synergies separate from current earnings. A hoped-for £1m saving next year is not £1m already earned. Show when the saving is expected and the implementation cost separately, avoiding double counting. Arithmetic belongs in shared calculation code, with AI limited to explanations and proposed questions. This bridge is not yet implemented.

## Motion and images

Continuous motion fits this portfolio's identity. The changes keep it enabled by default, pause the carousel while reading and resume it on leaving. No previous/next controls were added. The optional Still setting remains for someone who chooses it; it shows all six cards.

Normal scrolling means the wheel, trackpad and touch keep controlling page movement normally. Effects may follow scrolling without trapping the visitor in an animation. Navigation to a new page now jumps directly to its top; in-page movement retains the existing behaviour.

A **decision replay** would be an optional control inside the proposed authenticated case. The visitor moves from “seller's case” to “buyer adjustment” to “revised decision”; the earnings bar, multiple and recommendation change together. Motion then demonstrates a financial consequence. This replay is proposed, not shipped.

Added image: `public/images/industrial-case.jpg` (about 312 KB). Generated to depict a fictional precision-manufacturing interior in deep teal and warm neutral tones, without logos, people, text or a real company identity. It is captioned as AI-generated. Existing diagrams continue to explain the software.

## Research replaced throughout the connected pages

The library now uses four 2026 publications. Article pages show publication date, evidence type, scope and the distinction between source findings and Ansyra's interpretation. Hero references, landing cards, footer links, related instruments and six old URL redirects were updated together. Conceptual diagrams are labelled as such.

- [PwC: What buyers really look for in an M&A](https://www.pwc.com/my/en/perspective/epb/260701-what-buyers-really-look-for.html), 1 July: earnings credibility and sale readiness; practitioner commentary.
- [Bain: M&A Midyear Outlook 2026](https://www.bain.com/insights/m-and-a-midyear-outlook-2026-a-winners-paradox/), 29 June: changing acquisition theses; an outlook, not completed-year results.
- [PwC: The M&A synergies credibility gap](https://www.pwc.com/us/en/services/consulting/deals/library/m-and-a-synergies-credibility-gap-reporting.html), 18 May: follow-through on synergy reporting. Its sample covers 180 large US public transactions, not all mid-market acquisitions.
- [McKinsey: Gen AI in M&A](https://www.mckinsey.com/capabilities/m-and-a/our-insights/gen-ai-in-m-and-a-from-theory-to-practice-to-high-performance), 14 January: practical AI use and reported practitioner experiences.

These sources motivate the workflow; none validates Ansyra or endorses the product.

## Gemini, quotas and future paid use

Six live calls tested three synthetic cases on each Gemini model. No private deal documents were sent. The detailed historical results are retained locally as operational evidence, outside the publishable source.

| Check | Gemini 3.8 Flash | Gemini 2.5 Flash |
|---|---|---|
| Reject £2m from £10m claimed earnings, then calculate £80m / £8m | Correct | Returned £10m and 8× |
| Avoid probabilities and cultural scores when evidence is missing | Correct; listed missing inputs | Correct null scores; missing-input list was empty |
| Separate first-year costs from later synergy benefits | Correct | Correct |

This is a smoke test, not a broad accuracy benchmark. The configurations also differ: low thinking for 3.8 versus no thinking for 2.5. The result supports trying 3.8 as the analysis default; it does not prove universal superiority. Grounded web research keeps its separately configurable 2.5 model. Groq GPT-OSS 120B remains untested, as requested.

A later Groq comparison should use the same fictional sources, output requirements and marking rubric across more cases: factual support, correct calculations, quotation matching, acknowledging missing information, valid output, latency and tokens. Repeat cases to check consistency. Do not judge only by fluent writing.

Google's limits apply to the **project**, not separately to each key or Ansyra visitor. Creating another key in the same project does not create a fresh allowance. Exact active model limits must be checked in AI Studio. [Google rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits).

Ansyra now adds its own configurable defaults: 20 attempted AI requests per member per 24-hour window; 100 across the platform per 24-hour window; 20 per member per minute and 5 across the platform per minute. These conservative app limits are not Google's quota. Counters measure attempts, including failed attempts; they are not token billing. A blocked request shows its error immediately, while the allowance display refreshes every minute. Provider capacity may run out earlier, and exact provider reset times are not inferred.

“Reviewed sample analysis available at all times” means saving curated fictional outputs in the sample workspace, so its core case does not need an API call. A separately labelled live button can add fresh AI analysis while capacity exists. It must never silently present a saved sample as a new response. The curated guided case and automatic fallback to its records are not built yet. Login remains required to access the sample workspace.

For a paid launch, keep the same server-only key pattern, then add measured token/cost accounting, paid-plan allowances, budget controls and operational monitoring before pricing subscriptions. This pass does not add billing, an owner notification service, automatic provider switching or a queue.

## Cloudflare in plain language

Cloudflare can keep the public website files on servers close to visitors and give the site a shareable address such as `your-project.pages.dev`. You do not need to buy a domain for that address. Pages supports deployment of prebuilt files. [Direct Upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/).

The free Pages plan currently allows 500 builds per month, up to 20,000 files and 25 MiB per asset. A build happens when publishing a version; it is not a visitor's page view. Server functions have separate Workers limits. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

There are three parts to distinguish: the frontend is what visitors see; the backend handles login, saves and AI requests; the database stores records. Putting frontend files on Pages does not automatically move the existing Node/Hono server and database there. Never put Gemini or database service credentials in public frontend variables.

For this portfolio, preserve the existing login-based full application. Cloudflare Pages can host frontend assets, but authenticated sample records and AI requests should be served through the protected backend. Data bundled into public JavaScript is downloadable even if the UI has a login screen. The repository also has a Render configuration for the full Node application; this pass updates its Gemini settings but does not deploy it. A complete Cloudflare migration needs backend compatibility, authentication/cookie routing and deployment testing. No public URL has been created in this pass.

## Verification and release boundary

- TypeScript check and ESLint passed.
- 990 tests passed across 67 files, including new review/readiness, document quotation and AI availability cases.
- Frontend and backend production builds passed.
- Desktop image placement and mobile landing/research layouts were visually inspected. Mobile document width matched the 390px viewport and the image loaded. The browser later became unresponsive during the final carousel interaction check, so hover/resume is implemented and inspected in code, not claimed as fully browser-tested.
- No authenticated database integration suite, real-user end-to-end run, cloud smoke test or new dependency security audit was run in this pass. Updated integration tests are prepared for the existing test database workflow.
- Existing live records were not migrated. Reviews use the existing JSON field; no database schema migration is needed for the added history structure.

Revised release plan: keep login, provide individual sample member credentials, and prepare a fictional sample workspace. Validate authenticated workflows and access isolation against a separate test database, address the security findings, configure hosting, then run deployed smoke and authenticated browser checks. The guided case and earnings bridge are product improvements; they are not prerequisites for deploying the existing app securely. No system can be certified “fully secure” from the current unit tests or the presence of a login screen alone. The public landing page can explain the product while actual workspace access remains authenticated.
