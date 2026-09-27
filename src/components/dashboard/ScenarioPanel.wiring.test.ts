import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source assertions rather than rendered DOM, for the reason
// DecisionCard.wiring.test.ts states: vitest runs with environment "node", no
// jsdom, no testing-library, and `.test.ts` globs only. The compare logic is
// unit-tested properly in contracts/scenarios.test.ts; what these pin is the
// wiring — that the grid stays presentational, that the panel does not cross a
// gate it lacks, and that no economics column is fabricated.

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const panel = strip(read("ScenarioPanel.tsx"));
const compare = strip(read("ScenarioCompare.tsx"));
const dealDetail = strip(readFileSync(join(__dirname, "../../pages/DealDetail.tsx"), "utf8"));

describe("the grid stays presentational", () => {
  it("never queries on its own behalf", () => {
    expect(compare).not.toMatch(/trpc\./);
    expect(compare).not.toMatch(/useQuery/);
  });

  it("the panel owns exactly the four queries it needs, named", () => {
    // Was two until 15.19 added the outcome ends of the chain. Named rather
    // than counted alone, so a swapped procedure fails as loudly as an extra one.
    expect(panel.match(/\.useQuery\(/g) ?? []).toHaveLength(4);
    for (const q of [
      /trpc\.scenarios\.listByDeal\.useQuery/,
      /trpc\.recommendations\.listScenarioLinks\.useQuery/,
      /trpc\.recommendations\.listOutcomes\.useQuery/,
      /trpc\.assumptionLedger\.ledger\.useQuery/,
    ]) {
      expect(panel).toMatch(q);
    }
  });

  it("guards the links query behind the grant that serves it", () => {
    // A `scenarios`-only member must never fire a request that would 403.
    expect(panel).toMatch(/hasFeature\(user, "recommendations"\)/);
    expect(panel).toMatch(/enabled: canSeeRecommendations/);
  });
});

describe("it borrows vocabulary rather than restating it", () => {
  it("takes labels and limits from contracts", () => {
    expect(panel).toMatch(/from "@contracts\/scenarios"/);
    expect(compare).toMatch(/from "@contracts\/scenarios"/);
    expect(panel).toMatch(/MAX_COMPARE/);
    expect(compare).toMatch(/DRIVER_DIRECTION_LABELS|RECOMMENDATION_STANCE_LABELS/);
  });

  it("does not hardcode the compare limits", () => {
    // A literal 2 or 3 here is a second definition of the cap.
    expect(panel).not.toMatch(/length\s*>=\s*3\b/);
    expect(panel).not.toMatch(/slice\(0,\s*3\)/);
  });

  it("re-derives no folding the contract already does", () => {
    for (const [name, src] of [["panel", panel], ["compare", compare]] as const) {
      expect(src, `${name} must not reimplement name normalisation`).not.toMatch(
        /toLowerCase\(\)\.replace/,
      );
    }
  });
});

describe("no fabricated economics", () => {
  it("shows no per-scenario return metric", () => {
    // ScenarioCase carries none, and deal_economics is unique-per-deal — one
    // IRR for the whole deal. A column that varied by case would be invented.
    for (const banned of ["NPV", "IRR", "MOIC", "Payback"]) {
      expect(compare, `compare must not present a per-scenario ${banned}`).not.toMatch(
        new RegExp(`>\\s*${banned}`, "i"),
      );
    }
  });

  it("treats keyMetricDelta as the free text it is", () => {
    expect(compare).toMatch(/keyMetricDelta/);
    expect(compare).not.toMatch(/parseFloat\(|Number\(\s*s\.keyMetricDelta/);
  });
});

describe("it degrades instead of showing furniture", () => {
  it("renders nothing until there is a real comparison to make", () => {
    expect(panel).toMatch(/scenarios\.length < 2/);
    expect(panel).toMatch(/q\.isLoading \|\| q\.isError/);
  });

  it("keeps the wide grid inside its own scroll container", () => {
    // The dossier body must never scroll horizontally at 375px.
    expect(compare).toMatch(/overflow-x-auto/);
  });
});

describe("the dossier mounts it with the runs it reads", () => {
  it("renders below ScenarioCards, inside the same scenarios gate", () => {
    // Bounded by the fragment that CLOSES the conditional, not by the next
    // gate. Verified by mutation: an earlier version sliced to
    // hasFeature(user, "decisions"), so a panel moved outside the conditional
    // but above that gate still landed inside the window and passed.
    const open = dealDetail.indexOf(`hasFeature(user, "scenarios") && (`);
    expect(open, "the scenarios gate block moved or changed shape").toBeGreaterThan(-1);
    const close = dealDetail.indexOf("</>", open);
    expect(close).toBeGreaterThan(open);
    const block = dealDetail.slice(open, close);

    expect(block, "ScenarioCards must be inside the scenarios gate").toMatch(/<ScenarioCards/);
    expect(block, "ScenarioPanel must be inside the SAME gate").toMatch(/<ScenarioPanel/);
    expect(block.indexOf("<ScenarioCards")).toBeLessThan(block.indexOf("<ScenarioPanel"));
  });
});

describe("the chain reaches outcomes, and drills down (Phase 15.19)", () => {
  const dealDetailSrc = strip(readFileSync(join(__dirname, "../../pages/DealDetail.tsx"), "utf8"));

  it("the compare shows what actually happened, not just what is in play", () => {
    expect(compare).toMatch(/scenarioChain\(/);
    expect(compare).toMatch(/latestOutcome/);
    // Folded in contracts, not recomputed here.
    expect(compare).not.toMatch(/sort\(.*recordedAt/);
  });

  it("renders NOTHING for an unread outcome rather than an em-dash", () => {
    // "—" in an outcome column reads as "fine"; it means "nobody looked".
    expect(compare).toMatch(/if \(!glimpse\) return null/);
  });

  it("says once, at the foot, when no case has been read back", () => {
    expect(compare).toMatch(/untestedChainNote\(/);
    // Per-column it would print the same sentence three times.
    expect(compare).toMatch(/chains\.every\(/);
  });

  it("drills into the surfaces that own the objects", () => {
    const anchors = [...compare.matchAll(/to=\{\{ hash: "#([\w-]+)" \}\}|to="#([\w-]+)"/g)];
    const emitted = new Set(compare.match(/#(recommendations|assumption-ledger)/g) ?? []);
    expect(emitted).toContain("#recommendations");
    expect(emitted).toContain("#assumption-ledger");
    expect(anchors.length).toBeGreaterThan(0);
  });

  it("uses Link, never a bare anchor tag", () => {
    // Under BrowserRouter an <a href="#…"> is a real document navigation.
    expect(compare).not.toMatch(/<a\s+href="#/);
    expect(compare).toMatch(/from "react-router"/);
  });

  it("every anchor it drills to is actually rendered somewhere", () => {
    // The closure assertion: a link and its target cannot drift apart. The
    // lookbehind is load-bearing — data-testid="recommendations" contains the
    // substring id="recommendations".
    const targets: Record<string, string> = {
      recommendations: strip(read("Recommendations.tsx")),
      "assumption-ledger": strip(read("AssumptionLedgerPanel.tsx")),
    };
    for (const [anchor, src] of Object.entries(targets)) {
      expect(src, `#${anchor} is linked but never rendered`).toMatch(
        new RegExp(`(?<![\\w-])id="${anchor}"`),
      );
    }
  });

  it("suppresses the assumption drill-down without the grant", () => {
    // #assumption-ledger only exists when AssumptionLedgerPanel is mounted, and
    // that is behind hasFeature(user, "assumptions") on DealDetail.
    expect(panel).toMatch(/hasFeature\(user, "assumptions"\)/);
    expect(compare).toMatch(/canSeeAssumptions && \(/);
    expect(dealDetailSrc).toMatch(/hasFeature\(user, "assumptions"\) && <AssumptionLedgerPanel/);
  });

  it("guards both new ledger queries behind their own grants", () => {
    expect(panel).toMatch(/listOutcomes\.useQuery\([\s\S]{0,80}enabled: canSeeRecommendations/);
    expect(panel).toMatch(/assumptionLedger\.ledger\.useQuery\([\s\S]{0,80}enabled: canSeeAssumptions/);
  });

  it("the compare still owns no query of its own", () => {
    expect(compare).not.toMatch(/trpc\./);
    expect(compare).not.toMatch(/useQuery/);
  });
});
