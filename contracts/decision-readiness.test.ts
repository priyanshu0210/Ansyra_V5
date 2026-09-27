import { describe, it, expect } from "vitest";
import { decisionReadiness } from "./decision-readiness";
import { blocksAdvancement, type AssumptionReview } from "./assumption-gate";
import { buildDecisionPack } from "./decision-pack";
const now = new Date("2026-09-06T10:00:00Z");
const rec = { id: 1, claim: "Proceed to diligence", stage: "evaluation", status: "accepted", confidence: 60 };
const flagged = { id: 1, assumption: "Revenue doubles", result: { optimismScore: 91 }, reviewerNote: "Noted by someone" };
const review: AssumptionReview = { outcome: "resolved", reason: "Forecast revised against the source", evidence: "QoE report p4", reviewedBy: "reviewer-1", reviewedAt: now.toISOString() };
describe("combined decision integrity", () => {
  it("does not clear an assumption because a note exists", () => expect(blocksAdvancement(flagged)).toBe(true));
  it("distinguishes a response from resolution and risk acceptance", () => {
    for (const outcome of ["answered", "resolved", "risk_accepted"] as const) {
      expect(blocksAdvancement({ ...flagged, result: { ...flagged.result, reviewHistory: [{ ...review, outcome }] } })).toBe(outcome === "answered");
    }
  });
  it("uses the latest review and requires attribution and evidence", () => {
    expect(blocksAdvancement({ ...flagged, result: { ...flagged.result, reviewHistory: [review, { ...review, outcome: "answered" }] } })).toBe(true);
    expect(blocksAdvancement({ ...flagged, result: { ...flagged.result, reviewHistory: [{ ...review, reviewedBy: "" }] } })).toBe(true);
  });
  it("blocks a forward move and its export even with an accepted recommendation", () => {
    expect(decisionReadiness([rec], [flagged], "evaluation", "diligence", now).kind).toBe("blocked");
    const pack = buildDecisionPack({ dealId: 1, dealName: "Fictional case", fromStage: "evaluation", recommendations: [rec], assumptions: [flagged], now });
    expect(pack.verdict).toBe("blocked");
    expect(pack.unresolved.some((u) => u.source === "red_flag_assumption")).toBe(true);
  });
  it("distinguishes missing coverage from an assessed empty ledger", () => {
    expect(decisionReadiness([rec], undefined, "evaluation", "diligence", now).kind).toBe("unknown");
    expect(decisionReadiness([rec], [], "evaluation", "diligence", now).kind).toBe("clear");
  });
  it("allows backwards moves without treating them as approval", () => expect(decisionReadiness([], [flagged], "diligence", "evaluation", now).kind).toBe("not_gated"));
});
