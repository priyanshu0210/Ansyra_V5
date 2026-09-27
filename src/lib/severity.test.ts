import { describe, expect, it } from "vitest";
import { RED_FLAG_OPTIMISM, blocksAdvancement } from "@contracts/assumption-gate";
import { BACKLIGHT_CEILING, backlightOpacity, severityFor } from "./severity";

// The landing tells visitors the product lights an assumption by how badly it
// needs challenging, and that a red flag with no reviewer response blocks
// sign-off. Both are claims about software that exists. These assert the
// marketing surface cannot quietly drift from it.

describe("severity bands follow the gate contract", () => {
  it("puts the flag boundary exactly where the server puts it", () => {
    expect(severityFor(RED_FLAG_OPTIMISM).key).toBe("watch");
    expect(severityFor(RED_FLAG_OPTIMISM + 1).key).toBe("flag");
  });

  it("bands the whole 0-100 range without a gap", () => {
    for (let s = 0; s <= 100; s++) {
      expect(["flag", "watch", "grounded"]).toContain(severityFor(s).key);
    }
  });

  it("uses the wording the dashboard uses", () => {
    expect(severityFor(91).label).toBe("Red flag");
    expect(severityFor(74).label).toBe("Watch");
    expect(severityFor(38).label).toBe("Grounded");
  });
});

describe("illumination is a real second channel", () => {
  it("is monotonic with severity, so brightness alone ranks the rows", () => {
    const flag = severityFor(91);
    const watch = severityFor(74);
    const grounded = severityFor(38);
    expect(flag.illumination).toBeGreaterThan(watch.illumination);
    expect(watch.illumination).toBeGreaterThan(grounded.illumination);
  });

  it("tightens the backlight as severity rises, so blur alone ranks them too", () => {
    // The point of two hue-independent channels: a reader who cannot separate
    // the colours still sees the red flag as the SHARP BRIGHT one and the
    // grounded row as the SOFT DIM one.
    expect(severityFor(91).backlightBlur).toBeLessThan(severityFor(74).backlightBlur);
    expect(severityFor(74).backlightBlur).toBeLessThan(severityFor(38).backlightBlur);
  });

  it("never drives a backlight past the measured contrast ceiling", () => {
    // scripts/contrast.mjs asserts text on glass over a backlight at
    // BACKLIGHT_CEILING. Exceeding it here would invalidate that measurement.
    for (const s of [0, 38, 50, 74, 80, 81, 91, 100]) {
      expect(backlightOpacity(severityFor(s))).toBeLessThanOrEqual(BACKLIGHT_CEILING);
      expect(backlightOpacity(severityFor(s))).toBeGreaterThan(0);
    }
  });

  it("keeps severity a role token rather than a fixed hue", () => {
    // A hardcoded hex here would break the moment the ground flips: the
    // dark-tuned trio reads 2.45:1 on light and vice versa.
    for (const s of [91, 74, 38]) {
      expect(severityFor(s).color).toMatch(/^var\(--sev-/);
    }
  });
});

describe("the ledger's sample rows really do trigger the gate", () => {
  // If these ever stopped blocking, the panel would still SAY "Sign-off
  // blocked" while the contract disagreed, which is the exact failure the
  // shared module exists to prevent.
  const rows = [
    { assumption: "Sales headcount transfers at 95% retention.", result: { optimismScore: 91 }, reviewerNote: null },
    { assumption: "Procurement synergies land inside 12 months.", result: { optimismScore: 74 }, reviewerNote: null },
    {
      assumption: "Target's EBITDA margin is sustainable post-close.",
      result: { optimismScore: 38 },
      reviewerNote: "Verified against 3 comparable roll-ups.",
    },
  ];

  it("blocks on exactly one row", () => {
    expect(rows.filter(blocksAdvancement)).toHaveLength(1);
    expect(blocksAdvancement(rows[0])).toBe(true);
  });

  it("does not block a watch but keeps an un-attributed red-flag note open", () => {
    expect(blocksAdvancement(rows[1])).toBe(false);
    expect(blocksAdvancement({ ...rows[0], reviewerNote: "Checked with the CFO." })).toBe(true);
  });
});
