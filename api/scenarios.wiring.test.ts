import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source assertions, the posture of failure-patterns.wiring.test.ts and
// outcomes-owed.wiring.test.ts: this repo has no database or tRPC harness, so
// the things that can only be got wrong at the wiring layer are pinned by
// reading the source with comments stripped.

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const query = strip(read("queries/scenarios.ts"));
const router = strip(read("scenarios-router.ts"));
const appRouter = strip(read("router.ts"));
const contract = strip(readFileSync(join(__dirname, "../contracts/scenarios.ts"), "utf8"));

describe("the read is scoped, and scoped the safe way", () => {
  it("puts ownerScope on both tables it reads", () => {
    expect(query).toMatch(/ownerScope\(scenarioAnalyses,/);
    expect(query).toMatch(/ownerScope\(assumptions,/);
  });

  it("never hand-rolls an ownership predicate", () => {
    // The 15.10 trap: `assumptions` has camelCase columns ("dealId",
    // "createdBy") while scenario_analyses has snake_case. A hand-written
    // predicate mixing them type-checks and dies at runtime with 42703.
    // ownerScope reads the names off the schema, so it cannot happen.
    expect(query).not.toMatch(/createdBy["']?\s*[,)]?\s*,\s*userId/);
    expect(query).not.toMatch(/"createdBy"/);
    expect(query).not.toMatch(/created_by/);
    expect(query).not.toMatch(/db\.execute\(/);
    expect(query).not.toMatch(/sql`/);
  });

  it("is read-only — scenarios are a projection, not a table", () => {
    for (const src of [query, router]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
    }
  });
});

describe("the procedures prove access before reading", () => {
  it("both are gated on the existing scenarios key", () => {
    expect(router).toMatch(/featureQuery\("scenarios"\)/);
    // No new feature key: `scenarios` is the key ai.scenarioAnalysis uses.
    expect(router).not.toMatch(/featureQuery\("(?!scenarios")/);
  });

  it("calls assertDealAccess in every procedure", () => {
    const procedures = router.match(/\b(listByDeal|getById):/g) ?? [];
    expect(procedures).toHaveLength(2);
    expect(router.match(/assertDealAccess\(/g) ?? []).toHaveLength(2);
  });

  it("getById takes dealId as well as the scenario id", () => {
    // Access is proved against the deal. Deriving the deal from a
    // client-supplied scenario id would let the caller pick the row that
    // decides whether they may read it.
    expect(router).toMatch(/getById:[\s\S]*?dealId: z\.number\(\)[\s\S]*?scenarioId: z\.string\(\)/);
  });

  it("rejects a malformed scenario id rather than querying on it", () => {
    const at = router.indexOf("getById:");
    const body = router.slice(at, at + 900);
    expect(body.indexOf("parseScenarioId(")).toBeLessThan(body.indexOf("assertDealAccess("));
    expect(body).toMatch(/BAD_REQUEST/);
    expect(body).toMatch(/NOT_FOUND/);
  });
});

describe("the layering holds", () => {
  it("keeps judgement in contracts — the router folds nothing", () => {
    expect(router).not.toMatch(/probabilityPct|thesisImpact|normaliseDriverName/);
    expect(query).toMatch(/projectScenarios\(/);
  });

  it("does not resolve recommendation links behind the scenarios gate", () => {
    // Claim text lives behind `recommendations`. listScenarioLinks already
    // serves it under that grant; resolving it here would widen who can read
    // conclusions to anyone holding `scenarios`.
    for (const [name, src] of [["query", query], ["router", router]] as const) {
      expect(src, `${name} must not read recommendation rows`).not.toMatch(
        /recommendationScenarios|recommendations\b/,
      );
    }
  });

  it("the contract invents no per-scenario economics", () => {
    // deal_economics is unique-per-deal: one IRR for the whole deal, not one
    // per case. A field here would be fabricated.
    for (const banned of ["npv", "irrEstimate", "paybackPeriod", "moic"]) {
      expect(contract, `contracts/scenarios must not carry ${banned}`).not.toMatch(
        new RegExp(`\\b${banned}\\b`, "i"),
      );
    }
  });

  it("the contract stays pure — no clock, no I/O", () => {
    // The hazard is reading the WALL CLOCK, which is `Date.now()` or a
    // no-argument `new Date()`. `new Date(row.recordedAt)` parses a supplied
    // value and is perfectly deterministic — contracts/assumption-ledger.ts has
    // done exactly that in its sort comparators since 15.15. The original form
    // of this assertion banned both and went red the moment this contract had a
    // date to compare (15.19), which is the assertion being wrong, not the code.
    expect(contract).not.toMatch(/Date\.now\(/);
    expect(contract, "a no-argument new Date() is a wall-clock read").not.toMatch(
      /new Date\(\s*\)/,
    );
    expect(contract).not.toMatch(/getDb\(|drizzle|@db\/schema/);
  });
});

describe("the router is mounted", () => {
  it("is registered on the app router", () => {
    expect(appRouter).toMatch(/scenarios: scenariosRouter/);
  });
});
