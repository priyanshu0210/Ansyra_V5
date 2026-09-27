import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mockAIResponse } from "./lib/ai-mock";
import { foldPatterns, patternHintBlock } from "@contracts/failure-patterns";
import {
  assumptionHintBlock,
  foldAssumptionFindings,
} from "@contracts/assumption-learning";

// Every AI feature must have a mock branch, or it is dead without an API key.
// Two shipped features — the IC memo and scenario analysis — were exactly that
// for weeks: their system prompts matched no branch, fell through to the generic
// {summary} fallback, and the router threw "AI returned malformed JSON". Mock
// mode is the zero-cost dev path and the demo path without a provider, so a
// feature that cannot run in it is half-shipped.
//
// This deliberately does NOT hard-code the match tokens. A hand-written token
// list drifts the same way the branches did. Instead it extracts the system
// prompts from ai-router.ts and asserts each one reaches something other than
// the fallback — so a NEW AI feature added without a mock branch fails here.
// Same source-level posture as api/recommendations-gate.wiring.test.ts.

const routerSource = readFileSync(join(__dirname, "ai-router.ts"), "utf8");

/** Every `const system = \`…\`;` in the router, in source order. */
const systemPrompts = [...routerSource.matchAll(/const system = `([\s\S]*?)`;/g)].map((m) => m[1]);

const FALLBACK = { summary: "[mock] Placeholder JSON response — no AI provider configured." };

/** mockAIResponse sleeps a hard 600ms, so every call is made in parallel. */
async function mockJson(system: string, prompt = ""): Promise<unknown> {
  return JSON.parse(await mockAIResponse(prompt, system, true));
}

describe("the extraction itself", () => {
  it("finds the router's system prompts", () => {
    // Guards the regex: a refactor to `const system = "..."` or a helper would
    // silently reduce this to zero and make every assertion below vacuous.
    expect(systemPrompts.length).toBeGreaterThanOrEqual(6);
  });
});

describe("every AI feature has a mock branch", () => {
  it("routes each of the router's system prompts to something other than the fallback", async () => {
    const results = await Promise.all(systemPrompts.map((s) => mockJson(s)));
    const unmocked = systemPrompts
      .map((s, i) => ({ s, r: results[i] }))
      .filter(({ r }) => JSON.stringify(r) === JSON.stringify(FALLBACK))
      .map(({ s }) => s.slice(0, 80));
    expect(unmocked, `these system prompts hit the generic fallback:\n${unmocked.join("\n")}`).toEqual([]);
  });
});

describe("IC memo mock", () => {
  it("returns a memo of the shape the router persists and DecisionLog renders", async () => {
    const memo = (await mockJson("You are Ansyra's Investment Committee memo generator.")) as {
      thesis: string;
      dealSummary: string;
      valuation: { summary: string; keyMultiples: string };
      risks: { source: string; risk: string; severity: string }[];
      openItems: string[];
      decisionHistory: string;
      recommendation: { verdict: string; conditions: string[]; reasoning: string };
    };
    expect(memo.thesis).toContain("[mock]");
    expect(memo.dealSummary.length).toBeGreaterThan(0);
    expect(memo.valuation.summary.length).toBeGreaterThan(0);
    expect(memo.openItems.length).toBeGreaterThan(0);
    expect(memo.decisionHistory.length).toBeGreaterThan(0);
    expect(["proceed", "proceed_with_conditions", "hold", "decline"]).toContain(
      memo.recommendation.verdict,
    );
    for (const r of memo.risks) {
      // DecisionLog colours the dot off `severity` and prints `source` verbatim.
      expect(["high", "medium", "low"]).toContain(r.severity);
      expect(["assumptions", "cultural", "regulatory", "synergy", "documents", "other"]).toContain(r.source);
    }
  });
});

const withPatternForCross = patternHintBlock(
  foldPatterns([
    {
      kind: "regulatory", stage: "diligence", band: "high", horizon: "6_month",
      recStatus: "accepted", outcomeType: "contradicted", n: 4, exampleRecommendationIds: [11],
    },
    {
      kind: "regulatory", stage: "diligence", band: "high", horizon: "6_month",
      recStatus: "accepted", outcomeType: "held", n: 2, exampleRecommendationIds: [],
    },
  ]),
);

describe("recommendation drafter mock — the failure-pattern hint", () => {
  const SYSTEM = "You are Ansyra's Recommendation Engine.";

  // The prompt block is built by the same pure function the router calls, so
  // this asserts the real contract rather than a copy of it.
  const withPattern = patternHintBlock(
    foldPatterns([
      {
        kind: "regulatory",
        stage: "diligence",
        band: "high",
        horizon: "6_month",
        recStatus: "accepted",
        outcomeType: "contradicted",
        n: 4,
        exampleRecommendationIds: [11],
      },
      {
        kind: "regulatory",
        stage: "diligence",
        band: "high",
        horizon: "6_month",
        recStatus: "accepted",
        outcomeType: "held",
        n: 2,
        exampleRecommendationIds: [],
      },
    ]),
  );

  it("carries the firm's own pattern into a counterargument", async () => {
    const out = (await mockJson(SYSTEM, withPattern)) as {
      recommendations: { counterarguments: { point: string }[]; confidence: number }[];
    };
    const points = out.recommendations[0].counterarguments.map((c) => c.point).join(" ");
    expect(points).toContain("were contradicted in 4 of 6 six-month reads");
  });

  it("prices the pattern into the confidence rather than ignoring it", async () => {
    const [withHint, without] = await Promise.all([
      mockJson(SYSTEM, withPattern),
      mockJson(SYSTEM, patternHintBlock([])),
    ]);
    const conf = (o: unknown) =>
      (o as { recommendations: { confidence: number }[] }).recommendations[0].confidence;
    expect(conf(withHint)).toBeLessThan(conf(without));
  });

  it("adds nothing when the firm has no recorded patterns", async () => {
    const out = (await mockJson(SYSTEM, patternHintBlock([]))) as {
      recommendations: { counterarguments: { point: string }[] }[];
    };
    const points = out.recommendations[0].counterarguments.map((c) => c.point).join(" ");
    expect(points).not.toContain("own ledger");
  });
});

describe("recommendation drafter mock — the assumption hint (Phase 15.16)", () => {
  const SYSTEM = "You are Ansyra's Recommendation Engine.";

  // Built by the same pure function the router calls, so this asserts the real
  // contract rather than a copy of it.
  const withAssumption = assumptionHintBlock(
    foldAssumptionFindings([
      { category: "revenue_retention", horizon: "post_close", outcomeType: "contradicted", n: 4 },
      { category: "revenue_retention", horizon: "post_close", outcomeType: "held", n: 3 },
    ]),
  );

  it("carries the assumption's recorded history into a counterargument", async () => {
    const out = (await mockJson(SYSTEM, withAssumption)) as {
      recommendations: { counterarguments: { point: string }[] }[];
    };
    const points = out.recommendations[0].counterarguments.map((c) => c.point).join(" ");
    expect(points).toContain("were contradicted in 4 of 7 post-close reads");
  });

  it("prices it into the confidence", async () => {
    const [withHint, without] = await Promise.all([
      mockJson(SYSTEM, withAssumption),
      mockJson(SYSTEM, assumptionHintBlock([])),
    ]);
    const conf = (o: unknown) =>
      (o as { recommendations: { confidence: number }[] }).recommendations[0].confidence;
    expect(conf(withHint)).toBeLessThan(conf(without));
  });

  it("adds nothing when the firm has no recorded assumption history", async () => {
    const out = (await mockJson(SYSTEM, assumptionHintBlock([]))) as {
      recommendations: { counterarguments: { point: string }[] }[];
    };
    const points = out.recommendations[0].counterarguments.map((c) => c.point).join(" ");
    expect(points).not.toContain("has a record");
  });

  it("keeps the two histories apart, and deducts for each", async () => {
    // The headers are "have gone wrong before" and "have failed before". If
    // either scanner borrowed the other's lines, one block would produce two
    // counterarguments — or the wrong one entirely.
    const both = await mockJson(SYSTEM, `${withPatternForCross}\n\n${withAssumption}`);
    const rec = (both as {
      recommendations: { counterarguments: { point: string }[]; confidence: number }[];
    }).recommendations[0];
    const points = rec.counterarguments.map((c) => c.point);
    expect(points.filter((p) => p.includes("own ledger says otherwise"))).toHaveLength(1);
    expect(points.filter((p) => p.includes("has a record"))).toHaveLength(1);

    const onlyPattern = await mockJson(SYSTEM, withPatternForCross);
    const conf = (o: unknown) =>
      (o as { recommendations: { confidence: number }[] }).recommendations[0].confidence;
    // Two independent histories, two independent deductions.
    expect(rec.confidence).toBeLessThan(conf(onlyPattern));
  });
});

describe("scenario mock — the assumption hint (Phase 15.17)", () => {
  const SYSTEM = "You are Ansyra's scenario analyst.";

  const withHistory = assumptionHintBlock(
    foldAssumptionFindings([
      { category: "revenue_retention", horizon: "post_close", outcomeType: "contradicted", n: 4 },
      { category: "revenue_retention", horizon: "post_close", outcomeType: "held", n: 3 },
    ]),
  );

  const caseOf = (o: unknown, name: string) =>
    (o as { cases: { name: string; probabilityPct: number }[] }).cases.find((c) => c.name === name)!;

  it("weights the downside up when the firm's record argues for it", async () => {
    const [withIt, without] = await Promise.all([
      mockJson(SYSTEM, withHistory),
      mockJson(SYSTEM, assumptionHintBlock([])),
    ]);
    expect(caseOf(withIt, "downside").probabilityPct).toBeGreaterThan(
      caseOf(without, "downside").probabilityPct,
    );
  });

  it("takes the weight OUT of the base rather than inventing probability mass", async () => {
    // The three must still land near 100 before ai-router renormalises, or the
    // renormalisation silently hides a generator that does not add up.
    for (const block of [withHistory, assumptionHintBlock([])]) {
      const out = (await mockJson(SYSTEM, block)) as { cases: { probabilityPct: number }[] };
      const total = out.cases.reduce((n, c) => n + c.probabilityPct, 0);
      expect(total).toBe(100);
    }
  });

  it("WEIGHTS the range without asserting the driver breaks in the base case", async () => {
    // The instruction is to price the history, not to declare the outcome.
    const out = (await mockJson(SYSTEM, withHistory)) as {
      cases: { name: string; drivers: { direction: string }[] }[];
    };
    const base = out.cases.find((c) => c.name === "base")!;
    expect(base.drivers.every((d) => d.direction !== "breaks")).toBe(true);
  });

  it("names the record in the summary and adds a watch item", async () => {
    const out = (await mockJson(SYSTEM, withHistory)) as {
      summary: string;
      watchItems: string[];
    };
    expect(out.summary).toContain("were contradicted in 4 of 7 post-close reads");
    expect(out.watchItems.join(" ")).toContain("wrong about before");
  });

  it("says nothing about a record the firm does not have", async () => {
    const out = (await mockJson(SYSTEM, assumptionHintBlock([]))) as {
      summary: string;
      watchItems: string[];
    };
    expect(out.summary).not.toContain("own record");
    expect(out.watchItems.join(" ")).not.toContain("wrong about before");
  });
});

describe("scenario mock", () => {
  const SYSTEM = "You are Ansyra's scenario analyst.";

  it("emits all three cases, since ScenarioCards drops the ones it cannot find", async () => {
    const out = (await mockJson(SYSTEM)) as {
      cases: { name: string; probabilityPct: number; drivers: { assumption: string }[] }[];
      summary: string;
      watchItems: string[];
    };
    expect(out.cases.map((c) => c.name).sort()).toEqual(["base", "downside", "upside"]);
    for (const c of out.cases) expect(c.probabilityPct).toBeGreaterThan(0);
    expect(out.watchItems.length).toBeGreaterThan(0);
    expect(out.summary).toContain("[mock]");
  });

  it("quotes the assumptions the prompt actually supplied, rather than inventing drivers", async () => {
    const prompt = [
      "Stress-tested assumptions:",
      `- "Freight volume grows 12% a year." → optimism 85/100, Low confidence.`,
      `- "Two depots consolidate in year one." → optimism 40/100, High confidence.`,
    ].join("\n");
    const out = (await mockJson(SYSTEM, prompt)) as {
      cases: { drivers: { assumption: string }[] }[];
    };
    const cited = new Set(out.cases.flatMap((c) => c.drivers.map((d) => d.assumption)));
    expect(cited).toContain("Freight volume grows 12% a year.");
    expect(cited).toContain("Two depots consolidate in year one.");
  });

  it("falls back to a labelled placeholder when the prompt supplies no assumptions", async () => {
    const out = (await mockJson(SYSTEM)) as { cases: { drivers: { assumption: string }[] }[] };
    for (const c of out.cases) {
      for (const d of c.drivers) expect(d.assumption).toContain("[mock]");
    }
  });
});


it("returns an explicitly marked text response for the non-JSON copilot", async () => {
  const response = await mockAIResponse("Explain this workflow", "You are Ansyra's copilot.", false);
  expect(response).toContain("[mock]");
  expect(response).toContain("placeholder response");
});
