import { describe, expect, it } from "vitest";
import { ownerScope } from "./scope";
import { assumptions, deals, recommendations, scenarioAnalyses } from "@db/schema";

// ownerScope is THE multi-tenancy read rule — "a row is yours if you created it
// or it belongs to your organization" — and until now it had no executable test
// at all. Seven `*.wiring.test.ts` files assert `toMatch(/ownerScope\(/)` on
// router source, which proves the call site exists and says nothing about
// whether the predicate it builds is right.
//
// These read the generated SQL rather than the object graph. A predicate is a
// claim about what Postgres will do, and the only honest way to check it at
// this layer is to look at what Postgres would be sent.

function sqlFor(chunks: ReturnType<typeof ownerScope>): string {
  // Drizzle's SQL object carries the query as alternating chunks; stringifying
  // the column references gives a readable, assertable rendering without
  // needing a dialect or a connection.
  return JSON.stringify(chunks, (_k, v) => {
    if (v && typeof v === "object" && "name" in v && "table" in v) {
      return `col:${String((v as { name: string }).name)}`;
    }
    return v;
  });
}

describe("ownerScope with an organization", () => {
  const sql = sqlFor(ownerScope(deals, "user-1", "org-1"));

  it("matches rows the user created", () => {
    expect(sql).toContain("col:createdBy");
    expect(sql).toContain("user-1");
  });

  it("also matches rows shared by the organization", () => {
    expect(sql).toContain("col:organization_id");
    expect(sql).toContain("org-1");
  });

  it("combines the two with OR, not AND", () => {
    // AND here would be a silent, total data-loss bug: every user would see only
    // rows they BOTH created AND that belong to their org, which for anything
    // created by a colleague is nothing at all.
    expect(sql.toLowerCase()).toContain(" or ");
    expect(sql.toLowerCase()).not.toContain(" and ");
  });
});

describe("ownerScope without an organization", () => {
  const sql = sqlFor(ownerScope(deals, "solo-user", null));

  it("matches only rows the user created", () => {
    expect(sql).toContain("col:createdBy");
    expect(sql).toContain("solo-user");
  });

  it("does NOT fall back to matching a null organization", () => {
    // The trap this function was written to close. `organizationId IS NULL`
    // reads naturally and would pool every org-less user in the product into one
    // shared bucket where they all see each other's deals. The module's own
    // docblock calls this out; nothing executable enforced it until now.
    expect(sql).not.toContain("col:organization_id");
    expect(sql.toLowerCase()).not.toContain("null");
  });

  it("is a single equality, not a disjunction", () => {
    expect(sql.toLowerCase()).not.toContain(" or ");
  });
});

describe("ownerScope reads column names off the table it is given", () => {
  // The 15.10 trap, in a form a regex cannot catch: `assumptions` has camelCase
  // quoted columns ("createdBy") while the Phase-15 tables are snake_case
  // (created_by). A hand-written predicate that mixes them type-checks fine and
  // dies at runtime with a 42703 undefined-column error. ownerScope cannot make
  // that mistake because it never names a column literally — this proves it.

  it("uses camelCase columns on a camelCase table", () => {
    const sql = sqlFor(ownerScope(assumptions, "u", "o"));
    expect(sql).toContain("col:createdBy");
  });

  it("uses snake_case columns on a snake_case table", () => {
    const sql = sqlFor(ownerScope(scenarioAnalyses, "u", "o"));
    expect(sql).toContain("col:created_by");
    expect(sql).not.toContain("col:createdBy");
  });

  it("produces the same SHAPE for tables with different naming conventions", () => {
    // Same rule, two column vocabularies. Structural equality after stripping
    // the names is the property that matters.
    const strip = (s: string) => s.replace(/col:[A-Za-z_]+/g, "COL");
    expect(strip(sqlFor(ownerScope(assumptions, "u", "o")))).toEqual(
      strip(sqlFor(ownerScope(recommendations, "u", "o"))),
    );
  });
});
