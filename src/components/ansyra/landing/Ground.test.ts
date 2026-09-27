import { describe, expect, it } from "vitest";
import {
  ARC_CURVE_IN,
  ARC_CURVE_OUT,
  ARC_FLIP_AT,
  ARC_TEXT_IN,
  ARC_TEXT_OUT,
  ARC_ZONE_VH,
  shouldBeDark,
} from "./arc";

// The luminance arc's correctness is not something a screenshot can show: a
// ground stuck on light looks exactly like a ground that has not scrolled yet.
// Every bug this file guards against shipped looking completely fine.

/** Linear interpolation across the curve, matching useTransform's behaviour. */
function crossfadeAt(progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  for (let i = 1; i < ARC_CURVE_IN.length; i++) {
    if (p <= ARC_CURVE_IN[i]) {
      const span = ARC_CURVE_IN[i] - ARC_CURVE_IN[i - 1];
      const t = span === 0 ? 0 : (p - ARC_CURVE_IN[i - 1]) / span;
      return ARC_CURVE_OUT[i - 1] + t * (ARC_CURVE_OUT[i] - ARC_CURVE_OUT[i - 1]);
    }
  }
  return ARC_CURVE_OUT[ARC_CURVE_OUT.length - 1];
}

describe("shouldBeDark", () => {
  it("is light before the flip and dark after", () => {
    expect(shouldBeDark(0)).toBe(false);
    expect(shouldBeDark(ARC_FLIP_AT - 0.001)).toBe(false);
    expect(shouldBeDark(ARC_FLIP_AT)).toBe(true);
    expect(shouldBeDark(1)).toBe(true);
  });

  it("is monotonic: scrolling down never flips back to light", () => {
    let sawDark = false;
    for (let p = 0; p <= 1.0001; p += 0.005) {
      const dark = shouldBeDark(p);
      if (dark) sawDark = true;
      // The arc happens ONCE and in one direction. A non-monotonic result would
      // flicker the page between two worlds mid-scroll.
      if (sawDark) expect(dark).toBe(true);
    }
    expect(sawDark).toBe(true);
  });
});

describe("the crossfade curve", () => {
  it("starts fully light and ends fully dark", () => {
    expect(crossfadeAt(0)).toBeCloseTo(0, 5);
    expect(crossfadeAt(1)).toBeCloseTo(1, 5);
  });

  it("rises monotonically", () => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const v = crossfadeAt(p);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it("crosses the unreadable band only while text is off screen", () => {
    // The band is (ARC_TEXT_OUT, ARC_TEXT_IN). Whatever progress values map
    // into it must sit around the flip point, which is the middle of the empty
    // zone. If the band ever reached the zone's edges, section copy above or
    // below would be on screen while the ground was unreadable.
    const inBand: number[] = [];
    for (let p = 0; p <= 1.0001; p += 0.005) {
      const v = crossfadeAt(p);
      if (v > ARC_TEXT_OUT && v < ARC_TEXT_IN) inBand.push(p);
    }
    expect(inBand.length).toBeGreaterThan(0);
    expect(Math.min(...inBand)).toBeGreaterThan(0.3);
    expect(Math.max(...inBand)).toBeLessThan(0.7);
  });

  it("spends only a small fraction of the zone inside the band", () => {
    // The whole point of the non-linear curve. If this widens, the page sits in
    // an unreadable ground for longer and the empty zone has to grow with it.
    let inBand = 0;
    const steps = 1000;
    for (let i = 0; i <= steps; i++) {
      const v = crossfadeAt(i / steps);
      if (v > ARC_TEXT_OUT && v < ARC_TEXT_IN) inBand++;
    }
    expect(inBand / steps).toBeLessThan(0.15);
  });
});

describe("arc geometry", () => {
  it("keeps the readable boundaries ordered and inside the range", () => {
    expect(ARC_TEXT_OUT).toBeGreaterThan(0);
    expect(ARC_TEXT_OUT).toBeLessThan(ARC_TEXT_IN);
    expect(ARC_TEXT_IN).toBeLessThan(1);
  });

  it("keeps the ground change readable as a change, without a dead band", () => {
    // The original assertion was `>= 70`, guarding an unreadable window that no
    // longer exists: both grounds in a theme now take the same text role, and
    // scripts/contrast.mjs sweeps the whole crossfade to prove every phase
    // clears 4.5:1. What is left is pacing, not safety — long enough that the
    // ground visibly turns, short enough that it is not a blank screen.
    //
    // Lowered again (25..50 -> 8..20) after review: at 34vh the passage still
    // read as a hole on a 900px viewport, because the next section's heading
    // had not entered by the time the ground finished turning. The floor stays
    // non-zero because a crossfade with no scroll behind it is a flicker.
    expect(ARC_ZONE_VH).toBeGreaterThanOrEqual(8);
    expect(ARC_ZONE_VH).toBeLessThanOrEqual(20);
  });

  it("puts the role flip inside the empty zone, not at its edges", () => {
    expect(ARC_FLIP_AT).toBeGreaterThan(0.25);
    expect(ARC_FLIP_AT).toBeLessThan(0.75);
  });
});
