import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The recommendation gate's JUDGEMENT is unit-tested in
// contracts/recommendation-gate.test.ts, where it belongs — it is a pure
// function. What that cannot cover is the gate being correct and wired into the
// wrong place: read outside the transaction, or on `db` instead of `tx`, it
// still returns the right answer and still lets the wrong thing through.
//
// A tRPC/db harness would cover it properly. There is none in this repo, and
// building one means a fake Drizzle builder supporting .select().from().where(),
// .transaction() and .insert().values().returning() — the largest and most
// brittle new surface in an otherwise conventional change, to test the part that
// is not the risky part.
//
// So: source-level assertions, the same trade-off and for the same reason as
// AdminPanel.catalog.test.ts and DashboardSidebar.a11y.test.ts. Crude, but it
// catches the exact regression a prettier test that does not exist would not.

const source = readFileSync(join(__dirname, "decisions-router.ts"), "utf8");

/** Strip comments so prose ABOUT the gate never satisfies an assertion. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the recommendation gate is wired into decisions.record", () => {
  it("uses the shared predicate rather than restating the rule", () => {
    expect(code).toMatch(/from "@contracts\/decision-readiness"/);
    expect(code).toMatch(/decisionReadiness\(/);
  });

  it("runs INSIDE the record transaction, before the decision is written", () => {
    // The load-bearing assertion. Outside the transaction, a concurrent
    // supersede can be observed mid-flight; after the insert, the decision is
    // already recorded when the gate rejects it.
    const txOpen = code.indexOf("db.transaction(");
    const gate = code.indexOf("decisionReadiness(");
    const insert = code.search(/tx\s*\n?\s*\.insert\(decisions\)/);
    expect(txOpen).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(txOpen);
    expect(insert).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(insert);
  });

  it("reads through the transaction handle, not the pool", () => {
    // `tx.select(...).from(recommendations)` — a `db.select()` here would be a
    // read outside the transaction that merely looks like it is inside one.
    expect(code).toMatch(/tx\s*\n?\s*\.select\([\s\S]{0,400}?\.from\(recommendations\)/);
    expect(code).not.toMatch(/db\s*\n?\s*\.select\([\s\S]{0,400}?\.from\(recommendations\)/);
  });

  it("scopes the gate read the same way the client's banner is scoped", () => {
    // The assumption gate shipped enforcing over an UNSCOPED read while the
    // banner was computed from a scoped one, so the two could disagree about
    // whether a deal was blocked. Not twice.
    expect(code).toMatch(/ownerScope\(recommendations,/);
  });

  it("keeps the assumption gate ahead of it, so existing behaviour is unchanged", () => {
    expect(code.indexOf(".from(assumptions)")).toBeLessThan(code.indexOf("decisionReadiness("));
  });
});
