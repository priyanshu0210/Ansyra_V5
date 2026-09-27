# Landing-to-product audit — 27 September 2026

## Scope and conclusion

Reviewed the landing sections, all eleven public tool pages, their seven supporting capabilities, dashboard surfaces, and the API paths that implement their advertised behaviour. The core problem is supported by the product: keeping supplied evidence, assumptions, reviews, and decisions together, then recording post-close results. This is a workflow benefit, not proof that the product improves investment returns.

The previous presentation overstated some retrieval and automation. Copy and visible feature guides now distinguish user input, formula calculations, AI suggestions, human review, and server-enforced checks. These are code-backed descriptions, not a claim that every live AI provider or dashboard operation was exercised during this audit.

## Feature mapping

Every row is explained publicly through `src/lib/feature-guides.ts`, rendered by `src/pages/ToolDetail.tsx`. Dashboard About this page disclosures reuse the same guide for matching feature keys.

| Capability | Public page | Actual dashboard behaviour and boundary | Implementation evidence |
| --- | --- | --- | --- |
| Deal Pipeline | deal-pipeline | Manually entered deals, stages, filters, archives and export. Forward moves use recorded decisions and readiness checks; adding a deal need not start at sourcing. | `DealPipeline.tsx`, `api/deals-router.ts`, `api/decisions-router.ts` |
| Target Screening | target-screening | Manual shortlist; search by name or sector. Saving a target does not create a pipeline deal. | `TargetScreen.tsx`, `api/targets-router.ts` |
| AI Target Discovery | target-screening | Research candidates from the chosen thesis; save runs and selected targets. Financial estimates and fit judgements need checking. | `TargetDiscovery.tsx`, `api/ai-router.ts` |
| Deal Economics | deal-economics | Formula-based values, multiples, returns and financing checks. Server recomputes saved calculations; this is a simplified model. | `DealEconomics.tsx`, `api/economics-router.ts` |
| Scenario Analysis | deal-economics | AI narratives use at least two assessed assumptions and available economics/synergy context. Narrative weights are judgements, separate from numerical scenario calculations. | `ScenarioPanel.tsx`, `ScenarioCards.tsx`, `api/ai-router.ts`, `api/scenarios-router.ts` |
| Data Room | data-room | Upload, extract and analyse one document. Quote checks use extracted text; long/scanned/complex files have limits. | `DataRoom.tsx`, `api/documents-router.ts`, `api/ai-router.ts` |
| Diligence tracker | data-room | User-managed tasks and imported checklist findings; importing preserves manual statuses. | `DdTracker.tsx`, `api/dd-router.ts` |
| People & Integration Review | cultural-compatibility | Supplied context becomes questions and missing-evidence lists; optional deal link. No employer-review browsing or compatibility score. | `CulturalCompatibility.tsx`, `api/ai-router.ts` |
| Regulatory Review | regulatory-radar | Supplied transaction context becomes specialist-review questions. No current-law research, clearance prediction or filing determination. | `RegulatoryRadar.tsx`, `api/ai-router.ts` |
| Assumption Ledger | assumption-ledger | Model score/reasoning/action plus attributed reviews. Above 80 requires an evidenced resolved/risk-accepted review for advancement. Score is not a probability or proof. | `AssumptionLedger.tsx`, `api/assumptions-router.ts`, `contracts/assumption-gate.ts` |
| Decision Log & Committee Memo | decision-log | Human decisions and stage-change reasons; optional AI draft from selected saved records. It does not read every document or approve the deal. | `DecisionLog.tsx`, `api/decisions-router.ts`, `api/ai-router.ts` |
| Recommendations | decision-log | Drafts, review, acceptance/rejection, supersession, readiness and outcomes. AI draft does not satisfy approval checks. | `Recommendations.tsx`, `api/recommendations-router.ts` |
| Timeline | decision-log | User-entered milestones, owners, deadlines and statuses; no automatic external calendar or legal timetable. | `DealTimeline.tsx`, `api/milestones-router.ts` |
| Comments | decision-log | Attributed deal discussion; commenting is distinct from resolving a concern or approving a decision. | `DealComments.tsx`, `api/comments-router.ts` |
| Deal Genome | deal-genome | Searches an extract of up to 40 accessible deals, up to three selected assumptions per deal, and saved economics. No full-document, memo, decision narrative or synergy-plan search. Answers are not saved analyses. | `DealGenome.tsx`, `api/ai-router.ts` |
| Precedent Comps | comps-engine | Internal recorded valuation statistics and peer comparison, optionally completed deals only. Excludes demo rows; not an external market or returns database. | `CompsTable.tsx`, `api/comps-router.ts` |
| Analytics | comps-engine | Aggregates recorded deals, targets, assumptions, recommendations and outcomes. Incomplete input means incomplete reporting. | `Analytics.tsx`, `api/router.ts` |
| Synergy Engine | synergy-reality-engine | User-entered plans/actuals with computed differences and optional AI hypotheses/actions. No operating-system feed; plans do not automatically enter Genome search. | `SynergyEngine.tsx`, `api/ai-router.ts` |

Dashboard component paths above are under `src/components/dashboard/`.

## Cross-cutting corrections

- Copilot receives the surface, the current message and recent conversation. It does not automatically receive dashboard records, documents or live web results. Removed misleading introductions and reinforced these boundaries in its server prompt.
- Scope → Ground → Analyse → Verdict is an explanatory assumption-review sequence, not one automated backend pipeline used by every tool. Ground means supplied context; Analyse means model judgement; Verdict includes a human review and application checks. The Ground illustration no longer implies a low AI score is verified evidence.
- Successful structured analyses are saved to their relevant records. Genome answers are not saved analyses; chat has separate history. Persistence and a valid schema do not establish accuracy.
- Replaced IC with accessible wording about committees, approvals and decisions. The hero defines mergers and acquisitions. Audience explanations now describe concrete tasks rather than implied automatic intelligence.
- Public supporting-capability mappings previously existed without their full explanation being rendered. All seven supporting guides are now visible on their parent tool pages.
- People and regulatory dashboard titles now match their actual question-based tools and public names. Existing route slugs remain compatible.

## Layout changes

- Reduced hero spacing and made headline size responsive to viewport height. The three source links remain visible with the CTA on standard desktop screens.
- Removed the hero portfolio-project sentence and the duplicate closing-section sentence; the footer disclosure remains.
- Replaced the overlapping, lifting audience cards with six stationary, keyboard-accessible choices and one detail panel. Selection changes content without scaling or translating the layout.

## Research context

Rechecked the four linked articles. They support the background discussion, not validation of Ansyra's capabilities or efficacy:

- [PwC: What buyers really look for](https://www.pwc.com/my/en/perspective/epb/260701-what-buyers-really-look-for.html)
- [Bain: M&A Midyear Outlook 2026](https://www.bain.com/insights/m-and-a-midyear-outlook-2026-a-winners-paradox/)
- [PwC: The synergies credibility gap](https://www.pwc.com/us/en/services/consulting/deals/library/m-and-a-synergies-credibility-gap-reporting.html)
- [McKinsey: Gen AI in M&A](https://www.mckinsey.com/capabilities/m-and-a/our-insights/gen-ai-in-m-and-a-from-theory-to-practice-to-high-performance)

The synergy statistic is scoped to PwC's sample. Fictional examples and charts remain labelled. Nothing here establishes that AI estimates are factually correct or that an acquisition should proceed.

## Verification

- TypeScript check passed.
- Landing coverage and shared sample-rule tests: 31 passed.
- Browser: at 1366×768, hero sources ended at y=670; at 1280×720, y=642. No horizontal document overflow at those widths.
- Browser: all six desktop audience selections retained identical document position and 390px section height. Home-key navigation selected the first role.
- Additional final verification results are recorded below.
- Final targeted suite: 35 tests passed across landing coverage, sample rules, audience keyboard/selection behaviour, and hero headline leading.
- Targeted ESLint checks passed for changed audit files; production build passed.
- Browser: all eleven public tool routes rendered the guides for all eighteen capabilities (including the seven supporting capabilities).
- Browser: at 1440×900 the source row ended at y=751. At 375×812 it ended at y=741, with no horizontal document overflow; mobile audience text also stayed within the viewport.
- Browser viewport override restored after testing.
- Live AI-provider factual accuracy and every authenticated dashboard mutation were not tested end-to-end. This review maps implemented capabilities and visible descriptions; it does not certify generated conclusions.
