import { describe, expect, it } from "vitest";
import { blocksAdvancement } from "@contracts/assumption-gate";
import { severityFor } from "./severity";
import {
  ANSWERED_CLEARS,
  ANSWERED_ROW,
  FLAGGED_ROW,
  GROUNDED_ROW,
  SAMPLE_BLOCKED,
  SAMPLE_DEAL,
  SAMPLE_ROWS,
} from "./ledger-sample";

// B3's entire claim is that its four stages produced the ledger sitting
// directly below it. That claim is only true while both read the same rows, and
// nothing on screen would look wrong if they stopped: the pipeline would simply
// narrate a deal the ledger does not contain.

describe("the pipeline and the ledger describe one deal", () => {
  it("draws every stage artifact from the shared rows", () => {
    expect(SAMPLE_ROWS).toContain(GROUNDED_ROW);
    expect(SAMPLE_ROWS).toContain(FLAGGED_ROW);
  });

  it("points Ground at a row that is actually grounded", () => {
    // If this drifted, the "Ground" stage would show a red flag as evidence of
    // successful grounding.
    expect(severityFor(GROUNDED_ROW.result?.optimismScore ?? 0).key).toBe("grounded");
  });

  it("points Analyze at a row that is actually flagged and blocking", () => {
    expect(severityFor(FLAGGED_ROW.result?.optimismScore ?? 0).key).toBe("flag");
    expect(SAMPLE_BLOCKED).toContain(FLAGGED_ROW);
  });

  it("gives Ground a real citation to show", () => {
    // The stage's whole point is that the answer names its source. An empty
    // citation would render an empty evidence panel that still looked designed.
    expect(GROUNDED_ROW.citation).toBeTruthy();
    expect(GROUNDED_ROW.citation!.length).toBeGreaterThan(20);
  });

  it("keeps Verdict's count in step with the gate", () => {
    // Verdict prints "One red-flag assumption..." from this length. If a second
    // blocking row were added, the copy has to follow, and it does.
    expect(SAMPLE_BLOCKED.length).toBeGreaterThan(0);
    expect(SAMPLE_BLOCKED.every((r) => severityFor(r.result?.optimismScore ?? 0).key === "flag")).toBe(true);
  });
});

describe("the closing resolves the ledger's own row", () => {
  it("answers the very assumption that blocks the deal", () => {
    // Not a different, easier row. The page opens by striking a claim, spends
    // its middle on an assumption that stops a deal, and ends on THAT
    // assumption answered. A fresh row here would be a different argument.
    expect(ANSWERED_ROW.assumption).toBe(FLAGGED_ROW.assumption);
    expect(ANSWERED_ROW.result?.optimismScore).toBe(FLAGGED_ROW.result?.optimismScore);
  });

  it("clears only because a reviewer wrote something down", () => {
    // The score is deliberately unchanged: answering a challenge does not make
    // an optimistic assumption less optimistic. The mechanic is the response.
    expect(FLAGGED_ROW.reviewerNote ?? "").toBe("");
    expect(ANSWERED_ROW.reviewerNote?.trim()).toBeTruthy();
    expect(blocksAdvancement(FLAGGED_ROW)).toBe(true);
    expect(blocksAdvancement(ANSWERED_ROW)).toBe(false);
  });

  it("only claims a clearance the gate contract actually grants", () => {
    // ANSWERED_CLEARS gates whether the "Sign-off cleared" panel renders at
    // all, so the closing cannot promise a resolution the product would refuse.
    expect(ANSWERED_CLEARS).toBe(true);
  });
});

describe("claims discipline", () => {
  it("labels the deal as sample data", () => {
    // PRODUCT.md: no invented customers. The disclaimer rides with the name so
    // it cannot be dropped by styling one and not the other.
    expect(SAMPLE_DEAL.disclaimer).toMatch(/sample/i);
    expect(SAMPLE_DEAL.name).toBeTruthy();
  });

  it("keeps every row scored inside a real range", () => {
    for (const r of SAMPLE_ROWS) {
      const s = r.result?.optimismScore ?? -1;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});
