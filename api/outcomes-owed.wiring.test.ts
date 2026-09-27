import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The schedule's JUDGEMENT is unit-tested in contracts/outcome-schedule.test.ts,
// where it belongs — it is a pure function. What that cannot cover is the query
// feeding it, and there is no db harness here.
//
// So: source-level assertions, the same posture as
// api/failure-patterns.wiring.test.ts and api/recommendations-gate.wiring.test.ts.
// Every one of these guards a failure that is invisible until runtime, or a rule
// that would quietly acquire a second copy.

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");

/** Strip comments so prose ABOUT the rules never satisfies an assertion. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const query = strip(read("queries/outcomes-owed.ts"));
const recRouter = strip(read("recommendations-router.ts"));
const patRouter = strip(read("patterns-router.ts"));
const schedule = strip(readFileSync(join(__dirname, "../contracts/outcome-schedule.ts"), "utf8"));

describe("the moat rule survives in the query", () => {
  it("scopes both deals and recommendations to the caller", () => {
    expect(query).toMatch(/ownerScope\(deals,/);
    expect(query).toMatch(/ownerScope\(recommendations,/);
    expect(query).toMatch(/ownerScope\(recommendationOutcomes,/);
  });

  it("excludes demo deals, so a sample portfolio cannot invent work", () => {
    expect(query).toMatch(/eq\(deals\.isDemo,\s*false\)/);
  });

  // The 15.10 trap, structurally prevented rather than guarded against: the
  // builder reads column names off the schema, so deals."createdBy" vs
  // recommendations.created_by cannot be got wrong here at all.
  it("never hand-rolls a scope predicate, which is why the column trap cannot recur", () => {
    expect(query).not.toMatch(/"createdBy"/);
    expect(query).not.toMatch(/created_by/);
    expect(query).not.toMatch(/db\.execute\(/);
  });

  it("anchors on the closing milestone specifically", () => {
    expect(query).toMatch(/eq\(dealMilestones\.kind,\s*"closing"\)/);
  });

  // Milestones are scoped by DEAL access alone, matching milestonesRouter.list.
  // A closing date belongs to the deal, not to the colleague who typed it —
  // scoping it would give two members of one firm different due dates.
  it("does not owner-scope milestones", () => {
    expect(query).not.toMatch(/ownerScope\(dealMilestones/);
  });
});

describe("the schedule has one definition, and it is not in the query", () => {
  it("does no date arithmetic in SQL", () => {
    expect(query).not.toMatch(/interval\s*'/i);
    expect(query).not.toMatch(/\bnow\(\)/i);
    expect(query).not.toMatch(/current_date/i);
  });

  it("contains no horizon literal", () => {
    for (const h of ["30_day", "90_day", "6_month", "post_close", "ad_hoc"]) {
      expect(query, `query must not name the horizon "${h}"`).not.toContain(`"${h}"`);
    }
  });

  it("delegates the multi-milestone rule rather than restating it", () => {
    expect(query).toMatch(/pickCloseDate\(/);
  });

  it("introduces no database view", () => {
    expect(query).not.toMatch(/CREATE\s+(OR REPLACE\s+)?(MATERIALIZED\s+)?VIEW/i);
  });
});

describe("append-only is asserted, not trusted", () => {
  it("the owed query only ever reads", () => {
    // Owed is derived. Nothing in this phase writes except the existing
    // recordOutcome, and recommendation_outcomes still has no updated_at.
    expect(query).not.toMatch(/\.insert\(/);
    expect(query).not.toMatch(/\.update\(/);
    expect(query).not.toMatch(/\.delete\(/);
  });
});

describe("the two procedures sit on the two existing gates", () => {
  it("the per-deal anchor is recommendations-gated", () => {
    expect(recRouter).toMatch(/outcomeSchedule:\s*recQuery/);
  });

  it("the firm-wide roll-up is analytics-gated", () => {
    expect(patRouter).toMatch(/outcomesOwed:\s*patternQuery/);
    expect(patRouter).toMatch(/featureQuery\("analytics"\)/);
  });

  it("the roll-up returns counts, never claim text", () => {
    // What makes the analytics gate defensible, exactly as in patterns.list.
    expect(patRouter).not.toMatch(/recommendations\.claim/);
    expect(patRouter).not.toMatch(/recommendations\.rationale/);
    expect(patRouter).not.toMatch(/recommendations\.counterarguments/);
  });

  it("the roll-up folds server-side, so one surface reads one clock", () => {
    expect(patRouter).toMatch(/foldOwed\(rows,\s*todayIso\(\)\)/);
  });

  it("neither router imports the stage gate", () => {
    // Owed is a memory. The gate is a rule.
    // api/recommendations-gate.wiring.test.ts guards the other side of this line.
    expect(patRouter).not.toMatch(/@contracts\/recommendation-gate/);
    expect(recRouter).not.toMatch(/@contracts\/recommendation-gate/);
  });
});

describe("the clock is injected, never ambient", () => {
  it("the schedule module never reads the wall clock except through isoDateOf", () => {
    // react-hooks/purity only catches Date.now() in a render body; this catches
    // it in the contracts layer, where the whole engine would become untestable.
    expect(schedule).not.toMatch(/Date\.now\(\)/);
    const bareNewDate = schedule.match(/new Date\((?!\s*\w)/g) ?? [];
    expect(bareNewDate, "new Date() with no argument belongs only in a default parameter").toEqual([]);
  });
});

describe("the timeline gate is never crossed from the client", () => {
  const clientFiles = [
    "../src/components/dashboard/Recommendations.tsx",
    "../src/components/dashboard/RecommendationCard.tsx",
  ];

  // milestones-router gates EVERY procedure on featureQuery("timeline"). A
  // client-side fetch of the closing milestone would silently 403 the dossier
  // for every member holding `recommendations` without `timeline`. The anchor is
  // resolved server-side instead — the same move listScenarioLinks makes.
  it("no dossier component reaches for trpc.milestones", () => {
    for (const f of clientFiles) {
      const src = strip(readFileSync(join(__dirname, f), "utf8"));
      expect(src, `${f} must not call the timeline-gated milestones router`).not.toMatch(
        /trpc\.milestones/,
      );
    }
  });
});
