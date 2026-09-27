import { describe, expect, it } from "vitest";
import { BENTO_CELLS } from "./DashboardHome";
import { FEATURE_KEYS } from "@contracts/constants";

// THE ONE THING ABOUT A BENTO THAT CANNOT BE JUDGED BY LOOKING AT IT.
//
// The launcher is 2 columns, then 3, then 4 as the viewport grows. A tile grid
// only tessellates when the cell total divides by the column count, so it has
// to divide by all three — a multiple of 12.
//
// `grid-auto-flow: dense` backfills gaps, which means a wrong total usually
// still LOOKS fine at one width and goes ragged at another. That is exactly the
// kind of thing a screenshot review passes and a number catches.

describe("the launcher's cell arithmetic", () => {
  it("divides evenly at 2, 3 and 4 columns", () => {
    for (const cols of [2, 3, 4]) {
      expect(BENTO_CELLS % cols, `${BENTO_CELLS} cells at ${cols} columns`).toBe(0);
    }
  });

  it("gives every feature at least one cell", () => {
    // A key added to FEATURE_KEYS but missing from the span map still occupies
    // 1x1, so the total must never fall below the number of tiles.
    expect(BENTO_CELLS).toBeGreaterThanOrEqual(FEATURE_KEYS.length);
  });

  it("is the multiple of 12 the breakpoints require", () => {
    // Stated as its own assertion so the failure message names the rule rather
    // than leaving the next person to infer it from a modulo.
    expect(BENTO_CELLS % 12).toBe(0);
  });
});
