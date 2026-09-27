import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The pattern engine's JUDGEMENT is unit-tested in
// contracts/failure-patterns.test.ts, where it belongs — it is a pure function.
// What that cannot cover is the raw SQL that feeds it: there is no db harness
// here, and faking db.execute(sql`…`) with jsonb lateral-join semantics is not a
// test, it is a second Postgres.
//
// So: source-level assertions over the query, the same trade-off and for the
// same reason as api/recommendations-gate.wiring.test.ts. Every one of these
// guards a failure that is invisible until runtime.

const querySource = readFileSync(join(__dirname, "queries/failure-patterns.ts"), "utf8");
const routerSource = readFileSync(join(__dirname, "patterns-router.ts"), "utf8");
const aiSource = readFileSync(join(__dirname, "ai-router.ts"), "utf8");

/** Strip comments so prose ABOUT the rules never satisfies an assertion. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const query = strip(querySource);
const router = strip(routerSource);
const ai = strip(aiSource);

describe("the moat rule survives in the SQL", () => {
  it("excludes demo deals, so a sample portfolio cannot invent a pattern", () => {
    expect(query).toMatch(/is_demo\s*=\s*false/);
  });

  it("scopes to the caller and their organization, never cross-org", () => {
    expect(query).toMatch(/organization_id\s*=\s*\$\{orgId\}/);
    expect(query).toMatch(/d\.organization_id/);
    expect(query).toMatch(/r\.organization_id/);
  });

  // THE assertion this file exists for. `deals.createdBy` is uuid("createdBy") —
  // quoted camelCase in SQL — while recommendations.createdBy is
  // uuid("created_by"). Copying comps-router's scopeSql onto `r` produces
  // r."createdBy" and fails at RUNTIME with `column does not exist`, long after
  // tsc and every unit test have gone green.
  it("uses the RIGHT column name on each side of the join", () => {
    expect(query).toContain(`d."createdBy"`);
    expect(query).toContain("r.created_by");
    expect(query).not.toContain(`r."createdBy"`);
    expect(query).not.toContain("d.created_by");
  });
});

describe("the jsonb unnest is guarded", () => {
  it("unnests supporting_evidence rather than fetching every row into JS", () => {
    expect(query).toMatch(/jsonb_array_elements\(/);
  });

  it("checks the value is an array first", () => {
    // jsonb_array_elements RAISES on a scalar, and a Postgres error is not
    // recoverable per-row: one malformed row would 500 the whole Analytics tab.
    expect(query).toMatch(/jsonb_typeof\(/);
  });

  it("drops a recommendation that cites nothing instead of inventing a NULL kind", () => {
    expect(query).toMatch(/CROSS JOIN LATERAL/);
    expect(query).not.toMatch(/LEFT JOIN LATERAL/);
  });

  it("de-duplicates within a cluster, so one recommendation cannot count itself twice", () => {
    expect(query).toMatch(/SELECT DISTINCT/);
  });

  it("only keys clusters on known evidence kinds", () => {
    expect(query).toMatch(/ev ->> 'kind' IN \(/);
  });
});

describe("the rules live in one place, not two", () => {
  // isHighSignal's docblock says it exists so the failure-pattern detector reads
  // one definition. Restating it as a CASE in SQL would be a second copy, and
  // the two would drift the first time anyone touched either.
  it("does not restate the high-signal rule in SQL", () => {
    expect(query).not.toMatch(/'rejected'\s*AND/);
    expect(query).not.toMatch(/outcome_type\s*=\s*'contradicted'/);
  });

  it("returns status and outcome type as group keys, for TypeScript to judge", () => {
    expect(query).toMatch(/rec_status/);
    expect(query).toMatch(/outcome_type/);
  });

  it("borrows the confidence floors rather than hard-coding 40 and 70", () => {
    expect(query).toContain("${CONFIDENCE_HIGH_MIN}");
    expect(query).toContain("${CONFIDENCE_MEDIUM_MIN}");
    expect(query).not.toMatch(/confidence\s*>=\s*70/);
    expect(query).not.toMatch(/confidence\s*>=\s*40/);
  });

  it("does not conflate an unlabelled horizon with a deliberate ad-hoc read", () => {
    expect(query).toMatch(/COALESCE\(o\.horizon,\s*'unspecified'\)/);
    expect(query).not.toMatch(/COALESCE\(o\.horizon,\s*'ad_hoc'\)/);
  });

  it("introduces no database view — this repo has none and gains none here", () => {
    expect(query).not.toMatch(/CREATE\s+(OR REPLACE\s+)?(MATERIALIZED\s+)?VIEW/i);
  });
});

describe("the router boundary", () => {
  it("gates on analytics, so the Analytics tab cannot 403 on its own panel", () => {
    expect(router).toMatch(/featureQuery\("analytics"\)/);
  });

  it("re-scopes the example lookup even though the ids came from a scoped aggregate", () => {
    expect(router).toMatch(/ownerScope\(recommendations,/);
  });

  it("returns no claim text — the payload is counts and ids, not conclusions", () => {
    // What makes gating on `analytics` rather than `recommendations` defensible.
    expect(router).not.toMatch(/recommendations\.claim/);
    expect(router).not.toMatch(/recommendations\.rationale/);
    expect(router).not.toMatch(/recommendations\.counterarguments/);
  });
});

describe("the drafter reads patterns without touching the gate", () => {
  it("puts the pattern block inside the drafter's sections, before its prompt", () => {
    // ai-router declares `const prompt` in every AI procedure, so the search
    // has to be scoped to the drafter's own body or it anchors on the first one
    // in the file. Anchor on the procedure name, not the system-prompt marker —
    // that marker sits AFTER the sections it would be used to find.
    const body = ai.slice(ai.indexOf("draftRecommendations:"));
    const sections = body.indexOf("const sections");
    const hint = body.indexOf("patternHintBlock(patterns)");
    const prompt = body.indexOf("const prompt");
    expect(sections).toBeGreaterThan(-1);
    expect(hint).toBeGreaterThan(-1);
    // The block must be assembled with the other sections and reach the prompt.
    expect(hint).toBeLessThan(prompt);
  });

  it("reads the query module directly, not the analytics-gated procedure", () => {
    // Drafting must not require an `analytics` grant.
    expect(ai).toMatch(/loadPatternCells\(/);
    expect(ai).not.toMatch(/patternsRouter/);
  });

  it("never imports the stage gate", () => {
    // A failure pattern is a memory. The gate is a rule. Nothing in this phase
    // may blur them, and api/recommendations-gate.wiring.test.ts guards the
    // other side of the same line.
    expect(ai).not.toMatch(/@contracts\/recommendation-gate/);
  });
});
