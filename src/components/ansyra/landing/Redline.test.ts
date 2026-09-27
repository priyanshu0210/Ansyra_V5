import { describe, expect, it } from "vitest";
import { BEAT, derive, type Phase } from "./redline-score";

const PHASES: Phase[] = [0, 1, 2, 3];

describe("the redline sequence", () => {
  it("reveals in order: strike, then degrade, then insert", () => {
    // Nothing is revealed before it should be. Reading the phases as a table is
    // the only way to see that the score is actually a score and not three
    // things happening at once.
    expect(derive(0, false)).toEqual({ ruled: false, degraded: false, settled: false });
    expect(derive(1, false)).toEqual({ ruled: true, degraded: false, settled: false });
    expect(derive(2, false)).toEqual({ ruled: true, degraded: true, settled: false });
    expect(derive(3, false)).toEqual({ ruled: true, degraded: true, settled: true });
  });

  it("never un-reveals as it advances", () => {
    const keys = ["ruled", "degraded", "settled"] as const;
    for (const k of keys) {
      let seen = false;
      for (const p of PHASES) {
        const v = derive(p, false)[k];
        if (v) seen = true;
        // A redline that could strike and then un-strike would read as a
        // glitch rather than an edit.
        if (seen) expect(v).toBe(true);
      }
    }
  });

  it("puts reduced motion on the SAME final composition, not a lesser one", () => {
    // The load-bearing rule from DESIGN.md, and the one that is genuinely
    // invisible in review: a fallback showing less than the animated version
    // looks entirely fine on its own. It is only wrong next to the thing it is
    // standing in for. This is why the struck clause degrades rather than
    // fading to zero, and why it never dims below the text opacity floor.
    expect(derive(0, true)).toEqual(derive(3, false));
    for (const p of PHASES) {
      expect(derive(p, true)).toEqual(derive(3, false));
    }
  });
});

describe("the beat schedule", () => {
  it("gives the strike time to land before the clause breaks up", () => {
    // The hold is the whole point: struck-but-intact has to be legible for a
    // beat, or the reader never sees what was claimed before it was revised.
    expect(BEAT.hold).toBeGreaterThanOrEqual(200);
    expect(BEAT.rule).toBeGreaterThan(BEAT.hold);
  });

  it("starts the insertion after the degrade, and overlaps it", () => {
    const degradeAt = BEAT.rule + BEAT.hold;
    const insertAt = degradeAt + BEAT.degrade;
    expect(insertAt).toBeGreaterThan(degradeAt);
    // Overlapping is deliberate: the revision writes in while the old clause is
    // still breaking up, so the two read as one edit rather than two events.
    expect(BEAT.degrade).toBeLessThan(BEAT.insert);
  });

  it("stays inside the attention budget for an on-arrival moment", () => {
    const total = BEAT.rule + BEAT.hold + BEAT.degrade + BEAT.insert;
    // Past about two seconds an arrival animation stops being a moment and
    // starts being a wait.
    expect(total).toBeLessThanOrEqual(2000);
  });
});
