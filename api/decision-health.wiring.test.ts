import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The fold's JUDGEMENT is unit-tested in contracts/decision-health.test.ts,
// where it belongs — it is a pure function over plain data. What that cannot
// cover is the query feeding it and the layering that keeps a shipped test
// green, and there is no db harness here.
//
// Source-level assertions, the same posture as api/failure-patterns.wiring.test.ts
// and api/outcomes-owed.wiring.test.ts.

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");

/** Strip comments so prose ABOUT the rules never satisfies an assertion. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const query = strip(read("queries/decision-health.ts"));
const recRouter = strip(read("recommendations-router.ts"));
const health = strip(readFileSync(join(__dirname, "../contracts/decision-health.ts"), "utf8"));

describe("the layering that keeps decisions-router the sole enforcement point", () => {
  // THE assertion this file exists for. outcomes-owed.wiring.test.ts already
  // forbids the gate import in this router; that test would catch a violation,
  // but only by going red somewhere that reads like an unrelated feature. This
  // says why, next to the code that could break it.
  it("the router reaches the gate only transitively, never by import", () => {
    expect(recRouter).not.toMatch(/@contracts\/recommendation-gate/);
    expect(recRouter).toMatch(/loadDecisionHealth/);
    expect(query).not.toMatch(/@contracts\/recommendation-gate/);
    // The gate lives exactly one level deeper, in the pure fold.
    expect(health).toMatch(/from "\.\/recommendation-gate"/);
  });

  it("the procedure is a read that enforces nothing", () => {
    expect(recRouter).toMatch(/decisionHealth:\s*recQuery/);
    expect(recRouter).toMatch(/decisionHealth:[\s\S]{0,400}?\.query\(/);
    expect(query).not.toMatch(/TRPCError/);
  });

  it("proves deal access before reading anything", () => {
    expect(recRouter).toMatch(/decisionHealth:[\s\S]{0,400}?assertDealAccess\(/);
  });
});

describe("the query delegates rather than reimplements", () => {
  it("reads patterns server-internally, so the field is truthful without an analytics grant", () => {
    expect(query).toMatch(/loadPatternCells\(/);
    // A client-side patterns.list would yield [] for a recommendations-only
    // member — indistinguishable from "no patterns".
    expect(query).not.toMatch(/patternsRouter|trpc\./);
  });

  it("reuses the close anchor, so pickCloseDate keeps one definition", () => {
    expect(query).toMatch(/loadCloseAnchor\(/);
    expect(query).not.toMatch(/pickCloseDate\(/);
  });

  it("computes nothing itself — the fold owns every judgement", () => {
    expect(query).toMatch(/buildDecisionHealth\(/);
    expect(query).not.toMatch(/gateState\(|horizonStates\(|matchesPattern\(/);
  });
});

describe("scope and safety", () => {
  it("scopes both tables to the caller", () => {
    expect(query).toMatch(/ownerScope\(recommendations,/);
    expect(query).toMatch(/ownerScope\(recommendationOutcomes,/);
  });

  it("does not owner-scope milestones — a close date belongs to the deal", () => {
    expect(query).not.toMatch(/ownerScope\(dealMilestones/);
  });

  it("never hand-rolls a scope predicate, so the column-name trap cannot recur", () => {
    expect(query).not.toMatch(/"createdBy"/);
    expect(query).not.toMatch(/created_by/);
    expect(query).not.toMatch(/db\.execute\(/);
  });

  it("is read-only — the append-only ledger is untouched", () => {
    expect(query).not.toMatch(/\.insert\(/);
    expect(query).not.toMatch(/\.update\(/);
    expect(query).not.toMatch(/\.delete\(/);
  });

  it("puts no schedule rules in SQL", () => {
    expect(query).not.toMatch(/interval\s*'/i);
    expect(query).not.toMatch(/\bnow\(\)/i);
    expect(query).not.toMatch(/current_date/i);
    for (const h of ["30_day", "90_day", "6_month", "post_close"]) {
      expect(query, `the query must not name the horizon "${h}"`).not.toContain(`"${h}"`);
    }
  });
});

describe("the fold stays a fold", () => {
  it("never produces the gate SENTENCE, only the chip", () => {
    // gateStateHeadline is rendered once, beside the controls that resolve it.
    // A second copy is a second thing to keep in sync and a second thing that
    // can lie.
    expect(health).not.toMatch(/gateStateHeadline|recommendationGateReason/);
    expect(health).toMatch(/GATE_CHIP_LABELS/);
  });

  it("does no date arithmetic of its own", () => {
    expect(health).not.toMatch(/addDays|addMonths|HORIZON_OFFSETS/);
  });

  it("takes its clocks as arguments, reading the wall clock only as a fallback", () => {
    expect(health).not.toMatch(/Date\.now\(\)/);
    // `now` and `today` are fields of an input object rather than parameters, so
    // the injectable-clock form here is `input.now ?? new Date()` instead of a
    // default parameter. Both are fine; what must never appear is a bare
    // `new Date()` read mid-computation, which would make the fold untestable.
    const bare = [...health.matchAll(/(.{4})new Date\((?!\s*\w)/g)].map((m) => m[1]);
    const notAFallback = bare.filter((prefix) => !prefix.includes("??"));
    expect(notAFallback, "every wall-clock read must be a ?? fallback").toEqual([]);
  });

  it("does not carry cross-deal recommendation ids into a recommendations-gated payload", () => {
    // patterns.list exposes exampleRecommendationIds to `analytics` holders on
    // purpose. Carrying them here would make the card a back door.
    expect(health).not.toMatch(/exampleRecommendationIds:/);
  });
});
