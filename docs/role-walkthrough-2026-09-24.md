# Reported dashboard defects and role walkthrough — 24 September 2026

## Scope and release status

Code fixes are in the local working tree, not deployed. Browser checks used the local application with the actual hosted workspace and all three user-supplied accounts. The deployed site was also used to reproduce the partner pipeline contamination. No credentials are included here.

## Fixes

- Removed 18 historical regression-test deals and their 18 linked activity rows from the hosted Thornevale workspace after the reviewed cleanup was approved. No documents matched. The eight intended portfolio deals remain. Backup: `scratch-backup-1790189096850.local/rows.json` (ignored, local only).
- Fixed card foreground inheritance, including Synergy's category form and legacy explanation.
- Replaced six cramped desktop pipeline columns with columns that maintain a usable minimum width. Card actions are visible without hover.
- Grouped identical cultural/regulatory results while retaining individual history records. Legacy results are collapsed separately and explicitly marked unverified. Results with different context or evidence remain distinct.
- Fixed regulatory form column span and required geography input.
- Fixed additional analyst-discovered synergy defects: phased totals are read-only; fractional quarterly edits update totals; switching deals clears the prior draft; changed numbers hide stale explanations; saving revised numbers clears the prior analysis server-side.
- Clarified Genome's bounded search context and supplied explicit deal IDs to the AI. Full documents and IC memos are not searched by that endpoint.
- Corrected reporting labels that described all recorded deals as in flight and active/cancelled comparable valuations as prices actually paid.
- Fixed the regression test that created the non-demo scratch record to clean up its own deal in a finally block. Existing local-only database guards remain in place.

## Browser acceptance checks actually performed

| User/workflow | Observation |
| --- | --- |
| Partner login and pipeline | Reproduced 18 unwanted records, then confirmed 7 non-archived portfolio deals plus 1 archived deal after cleanup. |
| Partner pipeline search | Searching Anvil returned its two matching deals. |
| Partner diligence dossier | Project Anvil opened with five unanswered red flags, blocked advancement, recommendations, assumptions and IC memo. No actual investment decision was submitted. |
| Partner/associate review history | Repeated legacy results collapsed into history; expanded identical-copy dates and individual removal controls. No review records deleted. |
| Associate login and shared access | Same eight-deal portfolio; partner's unfinished form did not carry over. |
| Associate Genome | Real AI search identified the highest recorded enterprise value and a deal match. Its overbroad claim about absent QoE evidence prompted the context-limit fix. The revised prompt was not re-queried. |
| Associate Synergy | Changed a quarterly actual from 0.20 to 0.25 in a draft: category actual became 5.25 and portfolio actual 15.95; added a draft category with 1.5 planned / 0.75 actual. Switching deals restored saved totals of 24.9 planned / 15.9 actual. Draft changes were not saved to the hosted plan. |
| Visual Synergy | Category labels, fields, action and stale-result warning visibly readable against the white card. |
| Target screening | Search for Verity returned the euro-denominated target with its existing financials. |
| Comparables | USD and EUR kept separate; EUR showed one-observation warning; closed-only filter showed the completed Nordhaven transaction. |
| Analytics/assumptions | Currency-separated values and outcomes queue loaded; a deal with only one tested assumption disabled scenario generation with an explanation. |
| Third account | Logged in as Arjun, saw own 3-deal / 3-target portfolio, and received a visible 403 when opening Thornevale deal 421 directly. |
| Mobile pipeline | Checked at 390 × 844: single-column layout, readable cards, stage filter and navigation controls; document scroll width equalled viewport width. Viewport reset afterwards. |
| Regulatory live generation | Two attempts returned a provider 503/unavailable error. Inputs remained intact; no successful generation or saved-result persistence is claimed. |

## Focused automated verification

- 13 new/updated history and Synergy component assertions passed.
- New isolated local database integration test passed: revised quarter values persist through a fresh caller and invalidate the previous explanation; its scratch deal is removed afterwards.
- Type checking, lint on changed files, production build and whitespace checks were run. Final completion status is recorded in the task response.

## Limits

This is a bounded acceptance walkthrough, not proof that every possible bug is gone. Live regulatory generation remains dependent on provider availability. No blanket claim is made for every browser, role grant, export, upload or destructive workflow. UI/server code changes still require deployment; only the reviewed data cleanup is already live.
