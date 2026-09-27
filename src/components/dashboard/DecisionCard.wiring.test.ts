import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source assertions rather than rendered-DOM assertions, because this project's
// vitest environment is "node" with no jsdom or testing-library, and the include
// globs are `.test.ts` only. Adding that stack — plus a tRPC/react-query mock
// harness, which no test here has — would be a larger change than the feature.
// Same posture and same reason as DashboardSidebar.a11y.test.ts,
// AdminPanel.catalog.test.ts and OutcomesOwed.wiring.test.ts.
//
// The card's actual logic lives in contracts/decision-health.ts and is properly
// unit-tested there. What these assertions protect is the wiring: that the card
// stays presentational, that it never grows a second copy of the gate sentence,
// and that its links point at anchors which exist.

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const card = strip(read("DecisionCard.tsx"));
const panel = strip(read("DecisionPanel.tsx"));
const recommendations = strip(read("Recommendations.tsx"));
const decisionLog = strip(read("DecisionLog.tsx"));
const dealDetail = strip(readFileSync(join(__dirname, "../../pages/DealDetail.tsx"), "utf8"));

describe("the card stays presentational", () => {
  it("never queries on its own behalf", () => {
    expect(card).not.toMatch(/trpc\./);
    expect(card).not.toMatch(/useQuery/);
  });

  it("the panel owns exactly one query, and it is decisionHealth", () => {
    const queries = panel.match(/\.useQuery\(/g) ?? [];
    expect(queries).toHaveLength(1);
    expect(panel).toMatch(/trpc\.recommendations\.decisionHealth\.useQuery/);
  });

  it("neither file crosses a gate it does not hold", () => {
    // patterns.list is `analytics`-gated and milestones are `timeline`-gated;
    // both facts are resolved server-side inside the recommendations-gated
    // procedure, precisely so this surface never has to ask for them.
    for (const [name, src] of [["card", card], ["panel", panel]] as const) {
      expect(src, `${name} must not call the analytics-gated patterns router`).not.toMatch(
        /trpc\.patterns/,
      );
      expect(src, `${name} must not call the timeline-gated milestones router`).not.toMatch(
        /trpc\.milestones/,
      );
    }
  });
});

describe("the card summarises the gate, it does not restate it", () => {
  it("never renders the gate sentence", () => {
    // gateStateHeadline is rendered once, in Recommendations.tsx, beside the
    // controls that resolve it. A second copy is a second thing to keep in sync.
    expect(card).not.toMatch(/gateStateHeadline|recommendationGateReason/);
    expect(card).not.toMatch(/Advancement gate/);
    expect(card).not.toMatch(/requires at least one accepted/);
  });

  it("uses the chip vocabulary from contracts", () => {
    expect(card).toMatch(/GATE_CHIP_LABELS/);
    expect(card).toMatch(/from "@contracts\/decision-health"/);
  });

  it("never calls a draft a blocker", () => {
    // Drafts do not block; the absence of an accepted recommendation does.
    expect(card).not.toMatch(/drafts? blocking|blocked by \{?health\.draftsPending/);
  });

  it("borrows the horizon and severity vocabulary rather than restating it", () => {
    expect(card).toMatch(/coverageLabel|PATTERN_SEVERITY_LABELS/);
    for (const h of ["30-day", "90-day", "6-month", "post-close"]) {
      expect(card, `the phrase "${h}" belongs in contracts, not here`).not.toContain(`"${h}"`);
    }
  });
});

describe("the panel degrades rather than 403s", () => {
  it("suppresses the links whose targets need a grant", () => {
    expect(panel).toMatch(/hasFeature\(user, "decisions"\)/);
    expect(panel).toMatch(/hasFeature\(user, "analytics"\)/);
  });

  it("renders nothing when there is nothing to summarise", () => {
    expect(panel).toMatch(/totalRecommendations === 0/);
    expect(panel).toMatch(/q\.isError/);
    expect(panel).toMatch(/Readiness is unknown/);
  });
});

describe("every anchor the card emits actually exists", () => {
  // The closure assertion: a link and its target can no longer drift apart.
  const emitted = [...card.matchAll(/hash:\s*"#([\w-]+)"/g)].map((m) => m[1]);

  it("emits the anchors it was designed to", () => {
    expect(new Set(emitted)).toEqual(new Set(["recommendations", "decision-log"]));
  });

  it("targets only anchors that are rendered somewhere", () => {
    const targets: Record<string, string> = {
      recommendations,
      "decision-log": decisionLog,
    };
    for (const anchor of emitted) {
      const src = targets[anchor];
      expect(src, `no file is registered as the home of #${anchor}`).toBeDefined();
      // The lookbehind is load-bearing: `data-testid="recommendations"` contains
      // the substring `id="recommendations"`, so a naive match would pass even
      // with the real anchor deleted. Verified by mutation.
      expect(src, `#${anchor} is linked but never rendered`).toMatch(
        new RegExp(`(?<![\\w-])id="${anchor}"`),
      );
    }
  });

  it("uses Link, never a bare anchor tag", () => {
    // Under BrowserRouter an <a href="#…"> is a real document navigation.
    expect(card).not.toMatch(/<a\s+href="#/);
  });
});

describe("the dossier mounts it as a summary of the panel below", () => {
  it("renders the card before the panel it summarises", () => {
    const cardAt = dealDetail.indexOf("<DecisionPanel");
    const panelAt = dealDetail.indexOf("<Recommendations");
    expect(cardAt).toBeGreaterThan(-1);
    expect(panelAt).toBeGreaterThan(-1);
    expect(cardAt).toBeLessThan(panelAt);
  });

  it("puts both inside the same feature gate", () => {
    // A summary of a panel must never appear without the panel.
    const block = dealDetail.slice(
      dealDetail.indexOf(`hasFeature(user, "recommendations")`),
      dealDetail.indexOf("<ScenarioCards"),
    );
    expect(block).toMatch(/<DecisionPanel/);
    expect(block).toMatch(/<Recommendations/);
  });
});
