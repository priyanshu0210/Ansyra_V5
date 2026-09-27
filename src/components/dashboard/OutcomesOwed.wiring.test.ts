import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Analytics is a props-only component whose mount sits inside the dashboard's
// shared deals/targets loading contract. Two things must stay true about it, and
// neither is visible to tsc:
//
//  1. The self-querying siblings stay siblings — a query moved INTO Analytics
//     would put a third async source under a loading contract that knows nothing
//     about it.
//  2. The KPI grid stays four-wide. It is hardcoded `lg:grid-cols-4`, so a fifth
//     tile wraps; the queue is a block, not a tile.
//
// Same source-level posture as AdminPanel.catalog.test.ts.

const source = readFileSync(join(__dirname, "Analytics.tsx"), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the Analytics tab hosts the queue without absorbing it", () => {
  it("renders both self-querying siblings", () => {
    expect(code).toMatch(/<OutcomesOwed\s*\/>/);
    expect(code).toMatch(/<FailurePatterns\s*\/>/);
  });

  it("puts the queue you act on before the retrospective you learn from", () => {
    expect(code.indexOf("<OutcomesOwed")).toBeLessThan(code.indexOf("<FailurePatterns"));
  });

  it("keeps the KPI grid four-wide — the queue is a block, not a fifth tile", () => {
    expect(code).toContain("lg:grid-cols-4");
  });

  it("never queries on its own behalf", () => {
    // Its props contract and the Dashboard.tsx:190 mount stay untouched.
    expect(code).not.toMatch(/trpc\./);
    expect(code).toMatch(/export function Analytics\(\{\s*deals,\s*targets\s*\}/);
  });
});

describe("the queue component", () => {
  const owed = readFileSync(join(__dirname, "OutcomesOwed.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("reads the analytics-gated roll-up, not a recommendations-gated one", () => {
    expect(owed).toMatch(/trpc\.patterns\.outcomesOwed\.useQuery/);
    expect(owed).not.toMatch(/trpc\.recommendations\./);
  });

  it("never reaches for the timeline-gated milestones router", () => {
    expect(owed).not.toMatch(/trpc\.milestones/);
  });

  it("borrows the horizon vocabulary rather than restating it", () => {
    expect(owed).toMatch(/from "@contracts\/outcome-schedule"/);
    for (const h of ["30-day", "90-day", "6-month", "post-close"]) {
      expect(owed, `the phrase "${h}" belongs in contracts, not here`).not.toContain(`"${h}"`);
    }
  });
});
