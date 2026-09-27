import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source assertions, the posture of failure-patterns / outcomes-owed /
// scenarios wiring tests: no database or tRPC harness exists here, so the
// things that can only be got wrong at the wiring layer are pinned by reading
// the source with comments stripped.

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const router = strip(read("assumptions-router.ts"));
const ledgerQuery = strip(read("queries/assumption-ledger.ts"));
const learningQuery = strip(read("queries/assumption-learning.ts"));
const patternsRouter = strip(read("patterns-router.ts"));
const appRouter = strip(read("router.ts"));
const contract = strip(readFileSync(join(__dirname, "../contracts/assumption-ledger.ts"), "utf8"));
const panel = strip(
  readFileSync(join(__dirname, "../src/components/dashboard/AssumptionLedgerPanel.tsx"), "utf8"),
);

describe("the ledger is append-only", () => {
  it("exposes no path that edits or removes a read", () => {
    // The trajectory — wrong at 30 days, right at 6 months — IS the signal.
    // An UPDATE destroys exactly it.
    expect(router).not.toMatch(/updateOutcome|deleteOutcome/);
    expect(router).not.toMatch(/\.delete\(/);
  });

  it("only ever inserts into assumption_outcomes", () => {
    const updates = router.match(/\.update\(\w+\)/g) ?? [];
    // setCategory is the ONE update, and it is on `assumptions`, not on a read.
    expect(updates).toEqual([".update(assumptions)"]);
    expect(router).toMatch(/\.insert\(assumptionOutcomes\)/);
  });

  it("the query module never writes at all", () => {
    for (const [name, src] of [["ledger", ledgerQuery], ["learning", learningQuery]] as const) {
      expect(src, `${name} must be read-only`).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });
});

describe("scoping, and the casing trap it exists to avoid", () => {
  it("puts ownerScope on every table it reads", () => {
    for (const t of ["assumptions", "assumptionOutcomes", "recommendations"]) {
      expect(ledgerQuery, `${t} must be scoped`).toMatch(
        new RegExp(`ownerScope\\(${t},`),
      );
    }
    expect(learningQuery).toMatch(/ownerScope\(assumptionOutcomes,/);
  });

  it("never hand-writes a column name", () => {
    // `assumptions` is camelCase ("dealId"/"createdBy"), assumption_outcomes is
    // snake_case, and both are read in one function. A hand-rolled predicate
    // type-checks and dies at runtime with 42703.
    for (const [name, src] of [["ledger", ledgerQuery], ["learning", learningQuery]] as const) {
      expect(src, `${name} must not hand-write columns`).not.toMatch(/"createdBy"|created_by|"dealId"|deal_id/);
      expect(src, `${name} must not drop to raw SQL`).not.toMatch(/db\.execute\(|sql`/);
    }
  });

  it("applies the moat rule to the cross-deal fold", () => {
    // Caller-scoped, never cross-org, demo deals always excluded.
    expect(learningQuery).toMatch(/isDemo, false/);
    // Scoped on the OUTCOME, not merely the deal: otherwise a colleague's reads
    // on a deal you can see would be counted as yours.
    expect(learningQuery).toMatch(/ownerScope\(assumptionOutcomes, userId, orgId\)/);
  });
});

describe("access is proved before anything is written", () => {
  it("every procedure proves deal access", () => {
    const procs = router.match(/^\s{2}(\w+): assumptionQuery/gm) ?? [];
    expect(procs).toHaveLength(3);
    expect(router.match(/assertDealAccess\(/g) ?? []).toHaveLength(3);
  });

  it("proves the assumption is on THIS deal, not merely visible", () => {
    // Deal access is not proof that a client-supplied id belongs to it.
    expect(router).toMatch(/assertAssumptionOnDeal\(/);
    expect(router.match(/assertAssumptionOnDeal\(/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("validates a linked recommendation outcome before storing the pointer", () => {
    const at = router.indexOf("recordOutcome:");
    const body = router.slice(at, router.indexOf("setCategory:"));
    expect(body).toMatch(/recommendationOutcomes/);
    expect(body).toMatch(/NOT_FOUND/);
  });

  it("uses the existing assumptions key — no new feature key", () => {
    expect(router).toMatch(/featureQuery\("assumptions"\)/);
    expect(router).not.toMatch(/featureQuery\("(?!assumptions")/);
  });
});

describe("nothing is inferred", () => {
  it("stores the recommendation-outcome link only when the caller supplies it", () => {
    // A traceable ledger, not magical hidden updates.
    expect(router).toMatch(/recommendationOutcomeId: input\.recommendationOutcomeId \?\? null/);
    // No path mutates an assumption because a recommendation outcome landed.
    expect(router).not.toMatch(/update\(assumptionOutcomes\)/);
  });

  it("coerces the AI's category rather than trusting it", () => {
    const ai = strip(read("ai-router.ts"));
    expect(ai).toMatch(/coerceCategory\(/);
  });
});

describe("the contract reuses rather than restates", () => {
  it("reads the shipped gate for red flags", () => {
    expect(contract).toMatch(/blocksAdvancement/);
    expect(contract).not.toMatch(/RED_FLAG_OPTIMISM\s*=/);
  });

  it("shares the schedule primitive instead of copying time logic", () => {
    expect(contract).toMatch(/horizonStatesFrom\(/);
    expect(contract).not.toMatch(/addMonths\(|addDays\(/);
  });

  it("stays pure", () => {
    expect(contract).not.toMatch(/Date\.now\(|getDb\(|@db\/schema/);
  });
});

describe("surfaces", () => {
  it("the panel owns its queries and mounts under the right router key", () => {
    expect(panel).toMatch(/trpc\.assumptionLedger\.ledger\.useQuery/);
    expect(appRouter).toMatch(/assumptionLedger: assumptionsRouter/);
  });

  it("renders nothing when the deal has no assumptions", () => {
    expect(panel).toMatch(/rows\.length === 0/);
  });

  it("the cross-deal findings sit behind analytics, beside failure patterns", () => {
    expect(patternsRouter).toMatch(/assumptionFindings: patternQuery/);
    expect(patternsRouter).toMatch(/featureQuery\("analytics"\)/);
  });
});

describe("assumption-aware drafting (Phase 15.16)", () => {
  const ai = strip(read("ai-router.ts"));

  // Bounded at the NEXT top-level procedure key, not at end-of-file.
  // draftRecommendations happens to be last today, so a slice-to-EOF would pass
  // by accident and then silently widen — the "exactly one const system"
  // assertion below would start counting all nine in the router. If a procedure
  // is ever added after it, this narrows correctly instead.
  const start = ai.indexOf("draftRecommendations:");
  const after = ai.slice(start + 1).search(/\n {2}[a-zA-Z_]+: [a-zA-Z]+\n?\s*\.input/);
  const drafter = after === -1 ? ai.slice(start) : ai.slice(start, start + 1 + after);

  it("reads the findings server-internally, not through the analytics gate", () => {
    // patterns.assumptionFindings is gated on `analytics`; drafting must not
    // require a second grant, which is why the query module exists.
    expect(drafter).toMatch(/loadAssumptionCells\(ctx\.user\.id, orgId\)/);
    expect(drafter).not.toMatch(/patterns\.assumptionFindings/);
  });

  it("puts the block in the prompt, between sections and prompt", () => {
    const s = drafter.indexOf("const sections");
    const p = drafter.indexOf("const prompt");
    const b = drafter.indexOf("assumptionHintBlock(");
    expect(s).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(s);
    expect(b).toBeLessThan(p);
  });

  it("narrows to the categories this deal actually relies on", () => {
    // A finding about financing assumptions is noise on a deal with none.
    expect(drafter).toMatch(/relevantFindings\(/);
    expect(drafter).toMatch(/assumptionRows\.map\(\(a\) => coerceCategory\(a\.category\)\)/);
  });

  it("appends to the EXISTING system prompt rather than adding a second const", () => {
    // api/ai-mock.test.ts extracts every `const system = \`…\`;` by regex and
    // asserts each reaches a branch. A second const in this procedure would
    // silently change what that test is counting.
    const systems = drafter.match(/const system = `/g) ?? [];
    expect(systems).toHaveLength(1);
    expect(drafter).toMatch(/assumption ledger records a CATEGORY/);
  });

  it("the block label cannot inject a phantom citation offer", () => {
    const learning = strip(readFileSync(join(__dirname, "../contracts/assumption-learning.ts"), "utf8"));
    const at = learning.indexOf("ASSUMPTION_BLOCK_LABEL =");
    const label = learning.slice(at, learning.indexOf(";", at));
    expect(label).not.toMatch(/cite as/);
    expect(label).not.toMatch(/\{"kind"/);
  });

  it("the two ledger blocks stay distinguishable to the mock's scanner", () => {
    const learning = strip(readFileSync(join(__dirname, "../contracts/assumption-learning.ts"), "utf8"));
    const patterns = strip(readFileSync(join(__dirname, "../contracts/failure-patterns.ts"), "utf8"));
    // ai-mock anchors on "have gone wrong before" and "have failed before".
    // If these ever converge, one block borrows the other's lines.
    expect(patterns).toMatch(/have gone wrong before/);
    expect(learning).toMatch(/have failed before/);
    expect(learning).not.toMatch(/have gone wrong before/);
  });
});

describe("assumption-aware scenario analysis (Phase 15.17)", () => {
  const ai = strip(read("ai-router.ts"));
  const start = ai.indexOf("scenarioAnalysis:");
  const end = ai.slice(start + 1).search(/\n {2}[a-zA-Z_]+: [a-zA-Z]+\n?\s*\.input/);
  const scenario = end === -1 ? ai.slice(start) : ai.slice(start, start + 1 + end);

  it("is a real, bounded slice of the procedure", () => {
    // Guard against the mistake made once already: an unbounded slice passes by
    // accident and then silently widens to the whole router.
    expect(start).toBeGreaterThan(-1);
    expect(scenario).toMatch(/scenario analyst/);
    expect(scenario).not.toMatch(/Recommendation Engine/);
  });

  it("reads the findings server-internally, not through the analytics gate", () => {
    expect(scenario).toMatch(/loadAssumptionCells\(ctx\.user\.id, orgId\)/);
  });

  it("narrows to the categories these drivers actually come from", () => {
    expect(scenario).toMatch(/relevantFindings\(/);
    expect(scenario).toMatch(/tested\.map\(\(a\) => coerceCategory\(a\.category\)\)/);
  });

  it("puts the block in the prompt", () => {
    expect(scenario).toMatch(/assumptionHintBlock\(scenarioFindings\)/);
    const b = scenario.indexOf("assumptionHintBlock(");
    const p = scenario.indexOf("const prompt");
    expect(b).toBeGreaterThan(p);
  });

  it("appends to the EXISTING system prompt rather than adding a second const", () => {
    expect(scenario.match(/const system = `/g) ?? []).toHaveLength(1);
  });

  it("tells the model to WEIGHT the range, not to assert the outcome", () => {
    // A scenario that declares the driver breaks is not a range, it is a
    // prediction — and the firm's record is evidence about frequency, not about
    // this deal.
    expect(scenario).toMatch(/do not assert that it breaks/i);
    expect(scenario).toMatch(/watchItems/);
  });

  it("reuses the drafter's block and narrowing rather than a second mechanism", () => {
    const learning = strip(
      readFileSync(join(__dirname, "../contracts/assumption-learning.ts"), "utf8"),
    );
    // One label, one narrowing function, two consumers.
    expect(learning.match(/export const ASSUMPTION_BLOCK_LABEL/g) ?? []).toHaveLength(1);
    expect(learning.match(/export function assumptionHintBlock/g) ?? []).toHaveLength(1);
    expect(ai.match(/assumptionHintBlock\(/g) ?? []).toHaveLength(2);
  });
});

describe("every read of `assumptions` is owner-scoped (Phase 15.18)", () => {
  const ai = strip(read("ai-router.ts"));

  // The repo's convention, made explicit because ai-router mixes both kinds:
  //   owner-scoped — multi-row, user-authored analyses (assumptions, cultural,
  //                  regulatory, recommendations)
  //   deal-scoped  — per-deal singletons and derived artefacts (dealEconomics,
  //                  synergyPlans, scenarioAnalyses, icMemos, documents)
  // `assumptions` is squarely the first kind, and scenarioAnalysis was the one
  // place reading it without a scope.
  // Each read of `assumptions`, with the surrounding source. A window rather
  // than the literal where-clause, because listAssumptions hoists its predicate
  // into a `where` variable — checking the clause text alone reported that
  // correctly-scoped read as a violation.
  const reads = [...ai.matchAll(/\.from\(assumptions\)/g)].map((m) => ({
    at: m.index!,
    window: ai.slice(Math.max(0, m.index! - 700), m.index! + 400),
  }));

  it("finds the reads it means to check", () => {
    // Guard against the regex silently matching nothing and passing vacuously.
    expect(reads.length).toBeGreaterThanOrEqual(2);
  });

  it("scopes every one of them", () => {
    for (const r of reads) {
      expect(
        /scoped\(assumptions|ownerScope\(assumptions/.test(r.window),
        `an unscoped read of assumptions near: …${ai.slice(r.at - 90, r.at + 60).replace(/\s+/g, " ")}…`,
      ).toBe(true);
    }
  });

  it("still bounds the scenario generator on the deal as well as the caller", () => {
    // Scope alone would pull in the caller's assumptions from OTHER deals.
    const start = ai.indexOf("scenarioAnalysis:");
    const scenario = ai.slice(start, start + 2000);
    expect(scenario).toMatch(/eq\(assumptions\.dealId, deal\.id\)/);
    expect(scenario).toMatch(/scoped\(assumptions, ctx\.user\.id, orgId\)/);
  });
});
