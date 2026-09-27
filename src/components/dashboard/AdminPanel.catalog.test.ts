import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MEMBER_FEATURES, FEATURE_KEYS } from "@contracts/constants";

// Guard for a bug that shipped: AI Target Discovery and Document Intelligence
// were built, server-enforced, and advertised in the changelog ("ask your admin
// to enable it") — while being ungrantable by any admin alive.
//
// Cause: AdminPanel rendered DEFAULT_MEMBER_FEATURES as its grant CATALOG. That
// constant is the set pre-checked for a NEW member, and it deliberately omits
// the two opt-in features. Used as the catalog, it made them unreachable. The
// edit modal also filtered a member's existing grants through the same list, so
// opening a member who somehow held `documents` dropped it from state and
// SAVING SILENTLY REVOKED IT.
//
// Two constants, one letter apart in the same import, with opposite jobs. The
// assertions below are source-level rather than rendered-DOM because vitest
// runs `environment: "node"` here with no jsdom/testing-library — the same
// trade-off, for the same reason, as DashboardSidebar.a11y.test.ts. Crude, but
// it catches the exact regression, which a prettier test that does not exist
// would not.

const source = readFileSync(join(__dirname, "AdminPanel.tsx"), "utf8");

/** Strip comments so prose ABOUT the constants never satisfies an assertion. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("AdminPanel grant catalog", () => {
  it("renders the full catalog, not the new-member defaults", () => {
    // Two checkbox lists: create-user and the per-member edit modal.
    const catalogs = code.match(/FEATURE_KEYS\.map\(/g) ?? [];
    expect(catalogs.length).toBeGreaterThanOrEqual(2);
  });

  it("never maps DEFAULT_MEMBER_FEATURES into a checkbox list", () => {
    // The regression, exactly: `{DEFAULT_MEMBER_FEATURES.map((k) => (`
    expect(code).not.toMatch(/DEFAULT_MEMBER_FEATURES\s*\.\s*map\(/);
  });

  it("filters a member's existing grants against the full catalog", () => {
    // Filtering against the defaults is what silently revoked opt-in grants.
    expect(code).toMatch(/FEATURE_KEYS as readonly string\[\]\)\.includes\(/);
    expect(code).not.toMatch(/DEFAULT_MEMBER_FEATURES as string\[\]\)\.includes\(/);
  });

  it("counts a member's grants out of the catalog size", () => {
    expect(code).toMatch(/FEATURE_KEYS\.length/);
    expect(code).not.toMatch(/DEFAULT_MEMBER_FEATURES\.length/);
  });

  it("still seeds a new member from the defaults", () => {
    // DEFAULT_MEMBER_FEATURES is not banned — this is its one correct use, and
    // deleting it would make every new member start with nothing checked.
    expect(code).toMatch(/useState<FeatureKey\[\]>\(\[\.\.\.DEFAULT_MEMBER_FEATURES\]\)/);
  });
});

describe("the two constants stay meaningfully different", () => {
  it("keeps opt-in features out of the defaults but inside the catalog", () => {
    // If these ever converge, the bug becomes unreproducible and this whole
    // test file can go — but so can the distinction it protects, so fail loudly
    // and make someone decide rather than letting it rot into a no-op.
    const optIn = FEATURE_KEYS.filter((k) => !DEFAULT_MEMBER_FEATURES.includes(k));
    expect(optIn).toContain("target_discovery");
    expect(optIn).toContain("documents");
  });
});
