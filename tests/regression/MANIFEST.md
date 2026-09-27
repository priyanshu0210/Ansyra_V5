# Golden regression suite — `thornevale-v1`

The canonical set of release-critical scenarios for Ansyra, run against the
retained **Thornevale Industrial Group** synthetic corpus.

```bash
npm run seed:thornevale:verify   # confirm the corpus is present and intact
npm run test:regression          # run the suite
```

Requires `DATABASE_URL` and the Supabase keys. `AI_PROVIDER` is forced to `mock`
by the vitest config, so the suite is deterministic and costs nothing.

## Naming

Every scenario carries a stable `REG-<AREA>-<NNN>` id in its test name. Ids are
never reused or renumbered — a future run is compared to this one by id, so a
renumbering would silently break the comparison. `manifest.rtest.ts` enforces
uniqueness, format, single-file ownership, and that this document describes
every area in use.

## Areas

| Area | Covers |
|---|---|
| `REG-AUTH` | Authentication: what an unauthenticated caller can and cannot reach |
| `REG-RBAC` | Member-kind and per-feature gating, including admins being blocked from product features |
| `REG-ISO` | Cross-organisation isolation across every deal-scoped namespace |
| `REG-PIPE` | Deal pipeline: creation, value parsing, the numeric mirror, validation |
| `REG-DEC` | The stage gate and the decision log |
| `REG-REC` | Recommendation lifecycle: draft, accept, reject, supersede, expiry |
| `REG-OUT` | The append-only outcome ledger and its trajectories |
| `REG-DOC` | The data room: upload, signed download, contradictions, defective documents |
| `REG-ASSUM` | The assumption ledger and the advancement gate |
| `REG-SCEN` | Scenario snapshots, case addressing, and citation pinning |
| `REG-ECON` | Deal economics and server-derived multiples |
| `REG-TIME` | Milestones and deadlines |
| `REG-DD` | The diligence tracker and the manual-override merge rule |
| `REG-COMP` | The comps engine over realised outcomes |
| `REG-PAT` | Failure patterns, outcomes owed, assumption findings, scenario benchmarking |
| `REG-CALC` | Deterministic financial mathematics — pure, no database |
| `REG-DATA` | Corpus integrity |
| `REG-META` | The suite's own shape |

## Rules the suite obeys

1. **No global counts.** Every assertion is relative to rows the test created,
   or to a specific named row in the corpus. A count assertion would pass on the
   first run and fail on every run after it.
2. **Nothing is deleted.** Tests that mutate create their own scratch deal,
   prefixed `[test <run-id>]`. Those rows are retained too — a cleanup step is
   one more thing that can go wrong while holding a delete statement.
3. **The corpus is read-only in THIS suite.** Project Anvil and its siblings are
   never advanced, blocked or edited by a regression run, so the data a person
   inspects afterwards is the data that was signed off. (The browser suite is a
   deliberate partial exception: `E2E-ROOM-02` uploads one clearly-named
   `e2e-upload-<timestamp>.txt` to Anvil's data room each run, because it is
   testing the upload path through the real UI. It only ever adds.)
4. **Scratch deals accumulate on purpose, and can be pruned on demand.** A full
   pass leaves a few dozen `[test <run-id>] …` deals behind. Remove just those,
   never the corpus, with `npm run seed:thornevale:clear-scratch`.
5. **AI is mocked.** Deterministic and free. Live-provider verification is a
   separate, deliberately small exercise.
