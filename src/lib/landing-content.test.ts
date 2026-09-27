import { describe, expect, it } from "vitest";
import { FEATURE_KEYS } from "@contracts/constants";
import {
  CATEGORIES,
  FEATURED_RESEARCH,
  RESEARCH,
  RESEARCH_REDIRECTS,
  SUPPORTING,
  TOOLS,
  toolsInCategory,
  unrepresentedFeatureKeys,
} from "./landing-content";

// The audit that produced these tests found the landing selling 5 of 17 shipped
// features, with no mechanism that would ever have noticed. These are that
// mechanism. A failure here is not a broken test — it is a shipped feature the
// public surface does not admit exists.

describe("the landing covers the product", () => {
  it("gives every grantable feature either a page or a parent page", () => {
    expect(unrepresentedFeatureKeys()).toEqual([]);
  });

  it("never points a supporting feature at a parent that has no page", () => {
    const paged = new Set(TOOLS.map((t) => t.featureKey));
    for (const [child, parent] of Object.entries(SUPPORTING)) {
      expect(paged.has(parent!), `${child} points at ${parent}, which has no page`).toBe(true);
    }
  });

  it("never lists a feature as both an instrument and a supporting capability", () => {
    for (const t of TOOLS) expect(t.featureKey in SUPPORTING).toBe(false);
  });

  it("only maps real feature keys", () => {
    const known = new Set<string>(FEATURE_KEYS);
    for (const t of TOOLS) expect(known.has(t.featureKey)).toBe(true);
    for (const k of Object.keys(SUPPORTING)) expect(known.has(k)).toBe(true);
  });
});

describe("the register renders cleanly", () => {
  it("puts every instrument in a declared category", () => {
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const t of TOOLS) expect(ids.has(t.category)).toBe(true);
  });

  it("leaves no category empty, since an empty row would open onto nothing", () => {
    for (const c of CATEGORIES) expect(toolsInCategory(c.id).length).toBeGreaterThan(0);
  });

  it("keeps slugs unique, so /platform/:slug resolves one page", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps instrument numbers unique", () => {
    const ns = TOOLS.map((t) => t.n);
    expect(new Set(ns).size).toBe(ns.length);
  });
});

describe("claims discipline", () => {
  it("resolves every relatedResearch slug to a real study", () => {
    const known = new Set(RESEARCH.map((r) => r.slug));
    for (const t of TOOLS) {
      for (const slug of t.relatedResearch) {
        expect(known.has(slug), `${t.slug} cites missing study ${slug}`).toBe(true);
      }
    }
  });

  it("keeps the retired overclaims out of the copy", () => {
    // Each of these shipped on the public site describing behaviour the code
    // does not have. See the audit findings B1-B10.
    const banned = [
      /\bClaude\b/,
      /employer reviews/i,
      /hundreds of comparable/i,
      /the only post-close/i,
      /ten years of precedent/i,
    ];
    const corpus = JSON.stringify(TOOLS);
    for (const re of banned) expect(corpus).not.toMatch(re);
  });

  it("labels sample chart data as sample or illustrative", () => {
    // A chart of product output must never read as a sourced benchmark.
    for (const t of TOOLS) {
      expect(t.chartCaption, `${t.slug} chart caption`).toMatch(/sample|illustrative|fictional|your own|firm's own/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The four movements.
//
// The Refraction rework replaced a categorised accordion with a flat list and
// kept only ROUTE parity — eleven links survived, the information architecture
// did not. These assert the structure itself, so "all the links still work"
// can never again be mistaken for "the grouping is intact".
// ─────────────────────────────────────────────────────────────────────────────
describe("movements", () => {
  it("assigns every instrument to exactly one existing category", () => {
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const t of TOOLS) {
      expect(ids.has(t.category), `${t.slug} has category "${t.category}"`).toBe(true);
    }
  });

  it("distributes the eleven instruments 2/4/2/3 across the four movements", () => {
    const counts = CATEGORIES.map((c) => TOOLS.filter((t) => t.category === c.id).length);
    expect(counts).toEqual([2, 4, 2, 3]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(TOOLS.length);
  });

  it("leaves no movement empty, so no group renders as a bare heading", () => {
    for (const c of CATEGORIES) {
      expect(TOOLS.some((t) => t.category === c.id), `${c.id} has instruments`).toBe(true);
    }
  });

  it("gives every movement the label and thesis the grouped list renders", () => {
    for (const c of CATEGORIES) {
      expect(c.label?.length, `${c.id} label`).toBeGreaterThan(0);
      expect(c.thesis?.length, `${c.id} thesis`).toBeGreaterThan(0);
    }
  });

  it("keeps all eleven /platform/:slug routes reachable and unique", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(11);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The landing shows four studies. It does not DELETE two.
//
// The distinction is the whole point: `RESEARCH` still drives six
// `/research/:slug` pages, and the landing merely picks which to feature. If
// someone "simplifies" this by trimming RESEARCH itself, two article pages
// disappear silently — these assertions are what makes that fail loudly.
// ─────────────────────────────────────────────────────────────────────────────
describe("featured research", () => {
  it("replaces the library and preserves every previous bookmark with a valid redirect", () => {
    expect(RESEARCH).toHaveLength(4);
    expect(Object.keys(RESEARCH_REDIRECTS)).toHaveLength(6);
    for (const slug of Object.values(RESEARCH_REDIRECTS)) expect(RESEARCH.some((r) => r.slug === slug)).toBe(true);
  });

  it("features exactly four on the landing", () => {
    expect(FEATURED_RESEARCH).toHaveLength(4);
  });

  it("features only studies that carry a real four-digit year", () => {
    for (const r of FEATURED_RESEARCH) {
      expect(r.year, `${r.slug} year "${r.year}"`).toMatch(/^\d{4}$/);
    }
  });

  it("features real entries drawn from RESEARCH, not copies", () => {
    for (const r of FEATURED_RESEARCH) {
      expect(RESEARCH).toContain(r);
    }
  });

  it("orders them most recent first", () => {
    const years = FEATURED_RESEARCH.map((r) => Number(r.year));
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });
});
