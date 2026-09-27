import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SUB-1 LEADING IS ONLY SAFE ON A SINGLE LINE.
//
// The hero claim shipped at `lineHeight: 0.98` against `font-size: 72px`, which
// makes the line box SMALLER than the type in it. Measured at 1440 the two
// lines' boxes were exactly contiguous: line one ends on a full stop with no
// descender, line two opens "The decision" — four ascenders and an apostrophe —
// so the second line's tallest marks ran into the first line's baseline. It
// read, correctly, as "the two lines are awfully close".
//
// The other `--step-display` call sites are NOT this bug and must stay tight:
// InstrumentPages and Ledger set 0.9 on a lone `tabular-nums` numeral, and
// Closing's 1.02 sits under a single-line claim. A numeral has no neighbour to
// collide with, which is exactly what earns it the tighter box.
//
// This guard is deliberately narrow — it pins the one headline that WRAPS,
// rather than trying to infer line counts from source, which it cannot do.

const HERO = join(__dirname, "Hero.tsx");

describe("the hero claim's leading", () => {
  const source = readFileSync(HERO, "utf8");

  it("sets a lineHeight of at least 1 on the display headline", () => {
    // The h1 is the only `--step-display` element in this file.
    const block = source.slice(source.indexOf("<h1"), source.indexOf("</h1>"));
    const match = /lineHeight:\s*([\d.]+)/.exec(block);
    expect(match, "hero h1 must declare a lineHeight").not.toBeNull();
    const leading = parseFloat(match![1]);
    expect(
      leading,
      "the claim is two wrapped lines; a ratio under 1 collides them",
    ).toBeGreaterThanOrEqual(1);
  });

  it("still sets the claim as two explicit blocks", () => {
    // The leading only matters because the claim is two lines by construction.
    // If this ever becomes one line the guard above is free to relax — but it
    // should be a decision, not a silent consequence.
    expect(source.match(/<ClaimLine index=\{\d\}>/g) ?? []).toHaveLength(2);
  });
});
