import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source assertions, the posture of the sibling wiring tests: no database or
// tRPC harness exists here, so what can only be got wrong at the wiring layer
// is pinned by reading the source with comments stripped.

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const query = strip(read("queries/forecast-benchmark.ts"));
const router = strip(read("patterns-router.ts"));
const contract = strip(readFileSync(join(__dirname, "../contracts/forecast-actual.ts"), "utf8"));
const surface = strip(
  readFileSync(join(__dirname, "../src/components/dashboard/ScenarioBenchmark.tsx"), "utf8"),
);
const compare = strip(
  readFileSync(join(__dirname, "../src/components/dashboard/ScenarioCompare.tsx"), "utf8"),
);

describe("the moat rule holds on the benchmark", () => {
  it("scopes every table it reads", () => {
    for (const t of ["deals", "scenarioAnalyses", "assumptions", "assumptionOutcomes"]) {
      expect(query, `${t} must be scoped`).toMatch(new RegExp(`ownerScope\\(${t},`));
    }
  });

  it("excludes demo deals", () => {
    // A fixture deal must not invent a track record the firm never had.
    expect(query).toMatch(/isDemo, false/);
  });

  it("never hand-writes a column name", () => {
    // assumptions is camelCase, assumption_outcomes is snake_case, and both are
    // read here — a hand-rolled predicate type-checks and dies with 42703.
    expect(query).not.toMatch(/"createdBy"|created_by|"dealId"|deal_id/);
    expect(query).not.toMatch(/db\.execute\(|sql`/);
  });

  it("is read-only", () => {
    expect(query).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it("resolves drivers per deal, never across deals", () => {
    // One wide join would let one deal's assumption text resolve another deal's
    // driver name, silently scoring a forecast against the wrong ledger. The
    // three tables are fetched ONCE for the whole portfolio (no query loop per
    // deal), then grouped by deal in memory, and each projection sees only its
    // own deal's snapshots and assumptions.
    expect(query).toMatch(/inArray\(scenarioAnalyses\.dealId, dealIds\)/);
    expect(query).toMatch(/inArray\(assumptions\.dealId, dealIds\)/);
    expect(query).toMatch(/inArray\(assumptionOutcomes\.dealId, dealIds\)/);
    expect(query).not.toMatch(/innerJoin|leftJoin/);
    expect(query).toMatch(/for \(const id of dealIds\)/);
    expect(query).toMatch(/projectScenarios\(dealSnapshots, assumptionsByDeal\.get\(id\) \?\? \[\]\)/);
    expect(query).toMatch(/scoreScenario\(scenario, dealOutcomes\)/);
  });
});

describe("the judgement stays in contracts", () => {
  it("the query folds nothing itself", () => {
    expect(query).toMatch(/scoreScenario\(/);
    expect(query).toMatch(/projectScenarios\(/);
    expect(query).not.toMatch(/MIN_BENCHMARK|hitRate\s*=/);
  });

  it("drops a case nothing could be judged on, so the scenario floor means something", () => {
    expect(query).toMatch(/a\.judgeable === 0/);
  });

  it("the contract is pure", () => {
    expect(contract).not.toMatch(/Date\.now\(/);
    expect(contract, "a no-argument new Date() is a wall-clock read").not.toMatch(
      /new Date\(\s*\)/,
    );
    expect(contract).not.toMatch(/getDb\(|drizzle|@db\/schema/);
  });
});

describe("the surfaces", () => {
  it("the benchmark sits behind analytics, beside the other folds", () => {
    expect(router).toMatch(/scenarioBenchmark: patternQuery/);
    expect(router).toMatch(/featureQuery\("analytics"\)/);
  });

  it("carries no deal names, ids or claim text in the payload", () => {
    // Which is what makes it safe behind that gate.
    const at = router.indexOf("scenarioBenchmark:");
    const body = router.slice(at, at + 500);
    expect(body).not.toMatch(/dealName|claim|statement|assumption:/);
  });

  it("renders nothing when the firm has no record yet", () => {
    expect(surface).toMatch(/findings\.length === 0/);
  });

  it("shows the low-sample hedge rather than hiding a thin record", () => {
    expect(surface).toMatch(/benchmarkLowSampleNote\(/);
  });

  it("states what is excluded, so a rate is not read as a full picture", () => {
    expect(surface).toMatch(/too early/i);
  });

  it("the per-deal accuracy row reuses the same scorer", () => {
    expect(compare).toMatch(/scoreScenario\(/);
    // And stays quiet before anything has been read back.
    expect(compare).toMatch(/accuracy\.some\(\(a\) => a\.judgeable > 0\)/);
  });
});
