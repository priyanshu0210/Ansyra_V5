import { describe, expect, it } from "vitest";
import {
  RED_FLAG_OPTIMISM,
  assumptionGateMessage,
  blockingAssumptions,
  blocksAdvancement,
} from "./assumption-gate";

const row = (score: number | null | undefined, reviewerNote?: string | null) => ({
  assumption: "Sales headcount transfers at 95% retention.",
  reviewerNote,
  result: score === undefined ? undefined : { optimismScore: score },
});

describe("blocksAdvancement (the assumption-gate predicate)", () => {
  it("blocks a red-flag assumption with no reviewer response", () => {
    expect(blocksAdvancement(row(91))).toBe(true);
    expect(blocksAdvancement(row(81))).toBe(true);
  });

  it("keeps a legacy note open until an attributed decision is recorded", () => {
    expect(blocksAdvancement(row(91, "Repriced to 70% retention; see model v4."))).toBe(true);
  });

  it("treats a whitespace-only note as no response, so it still blocks", () => {
    expect(blocksAdvancement(row(91, "   "))).toBe(true);
  });

  it("does not block at or below the threshold", () => {
    expect(blocksAdvancement(row(RED_FLAG_OPTIMISM))).toBe(false);
    expect(blocksAdvancement(row(38))).toBe(false);
  });

  it("does not block when the assumption was never scored", () => {
    expect(blocksAdvancement(row(undefined))).toBe(false);
    expect(blocksAdvancement(row(null))).toBe(false);
  });
});

describe("blockingAssumptions", () => {
  it("returns only the rows holding the deal back", () => {
    const rows = [row(91), row(74), row(38, "Verified against 3 comparable roll-ups."), row(88)];
    expect(blockingAssumptions(rows)).toHaveLength(2);
  });

  it("is empty for a clean ledger", () => {
    expect(blockingAssumptions([row(38), row(74)])).toEqual([]);
  });
});

describe("assumptionGateMessage", () => {
  it("carries the machine-readable prefix", () => {
    expect(assumptionGateMessage(1).startsWith("ASSUMPTION_GATE:")).toBe(true);
  });

  it("agrees with itself on singular and plural", () => {
    expect(assumptionGateMessage(1)).toContain("1 high-risk assumption");
    expect(assumptionGateMessage(3)).toContain("3 high-risk assumptions");
  });
});
