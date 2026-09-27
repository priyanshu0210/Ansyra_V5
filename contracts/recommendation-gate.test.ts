import { describe, expect, it } from "vitest";
import { DEAL_STAGES } from "./stages";
import {
  GATE_EXPIRY_WARNING_DAYS,
  RECOMMENDATION_GATED_STAGES,
  RECOMMENDATION_GATE_CODE,
  gateState,
  gateStateHeadline,
  isExpired,
  isGatedTransition,
  isLiveRecommendation,
  recommendationGateMessage,
  recommendationGateReason,
  satisfyingRecommendations,
} from "./recommendation-gate";

const NOW = new Date("2026-08-05T12:00:00Z");
const PAST = new Date("2026-07-01T12:00:00Z");
const FUTURE = new Date("2026-09-01T12:00:00Z");

const rec = (
  stage: string,
  status: string,
  expiresAt?: Date | string | null,
) => ({ stage, status, expiresAt });

describe("RECOMMENDATION_GATED_STAGES", () => {
  // Guards the "no new stage vocabulary" constraint at test time, not just at
  // type time — a string typo in the array would still compile against DealStage
  // only if it happened to be a valid stage, but a future rename would not.
  it("is a strict subset of DEAL_STAGES", () => {
    for (const s of RECOMMENDATION_GATED_STAGES) {
      expect(DEAL_STAGES).toContain(s);
    }
    expect(RECOMMENDATION_GATED_STAGES.length).toBeLessThan(DEAL_STAGES.length);
  });

  it("leaves the cheap end of the lifecycle ungated", () => {
    expect(RECOMMENDATION_GATED_STAGES).not.toContain("sourcing");
    expect(RECOMMENDATION_GATED_STAGES).not.toContain("evaluation");
  });
});

describe("isGatedTransition", () => {
  it("gates the moves where the deal starts costing money", () => {
    expect(isGatedTransition("evaluation", "diligence")).toBe(true);
    expect(isGatedTransition("diligence", "negotiation")).toBe(true);
    expect(isGatedTransition("negotiation", "closing")).toBe(true);
    expect(isGatedTransition("closing", "integration")).toBe(true);
  });

  it("does not gate sourcing → evaluation", () => {
    expect(isGatedTransition("sourcing", "evaluation")).toBe(false);
  });

  it("never gates a backward or same-stage move", () => {
    expect(isGatedTransition("negotiation", "diligence")).toBe(false);
    expect(isGatedTransition("diligence", "diligence")).toBe(false);
  });

  it("returns false for stages outside the lifecycle", () => {
    expect(isGatedTransition("evaluation", "post_close")).toBe(false);
    expect(isGatedTransition("ic", "diligence")).toBe(false);
  });
});

describe("isExpired", () => {
  it("treats a missing expiry as never going stale", () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
  });

  it("compares against the supplied clock, in both directions", () => {
    expect(isExpired(FUTURE, NOW)).toBe(false);
    expect(isExpired(PAST, NOW)).toBe(true);
    expect(isExpired(FUTURE.toISOString(), NOW)).toBe(false);
  });

  it("treats an unparseable date as expired rather than as never-expiring", () => {
    // Failing open here would let a corrupt row satisfy the gate forever.
    expect(isExpired("not a date", NOW)).toBe(true);
  });
});

describe("isLiveRecommendation", () => {
  it("counts an accepted recommendation that never expires", () => {
    expect(isLiveRecommendation(rec("evaluation", "accepted", null), NOW)).toBe(true);
    expect(isLiveRecommendation(rec("evaluation", "accepted"), NOW)).toBe(true);
  });

  it("counts an accepted recommendation whose expiry is still ahead", () => {
    expect(isLiveRecommendation(rec("evaluation", "accepted", FUTURE), NOW)).toBe(true);
    expect(isLiveRecommendation(rec("evaluation", "accepted", FUTURE.toISOString()), NOW)).toBe(true);
  });

  it("stops counting once it has expired", () => {
    expect(isLiveRecommendation(rec("evaluation", "accepted", PAST), NOW)).toBe(false);
  });

  it("ignores every non-accepted status, expiry or not", () => {
    for (const status of ["draft", "rejected", "superseded"]) {
      expect(isLiveRecommendation(rec("evaluation", status, null), NOW)).toBe(false);
      expect(isLiveRecommendation(rec("evaluation", status, FUTURE), NOW)).toBe(false);
    }
  });

  it("does not count a row with an unparseable expiry", () => {
    expect(isLiveRecommendation(rec("evaluation", "accepted", "not a date"), NOW)).toBe(false);
  });
});

describe("satisfyingRecommendations", () => {
  it("only counts recommendations recorded at the stage the deal is leaving", () => {
    const rows = [
      rec("evaluation", "accepted", null),
      rec("diligence", "accepted", null),
    ];
    expect(satisfyingRecommendations(rows, "diligence", NOW)).toHaveLength(1);
    expect(satisfyingRecommendations(rows, "diligence", NOW)[0].stage).toBe("diligence");
  });

  it("does not let a conclusion reached at an earlier stage unlock a later move", () => {
    expect(satisfyingRecommendations([rec("evaluation", "accepted", null)], "diligence", NOW)).toEqual([]);
  });

  it("is empty when every candidate is a draft", () => {
    expect(satisfyingRecommendations([rec("evaluation", "draft", null)], "evaluation", NOW)).toEqual([]);
  });

  it("is empty when the only accepted recommendation has expired", () => {
    expect(satisfyingRecommendations([rec("evaluation", "accepted", PAST)], "evaluation", NOW)).toEqual([]);
  });
});

describe("recommendationGateMessage", () => {
  it("carries the machine-readable prefix", () => {
    expect(recommendationGateMessage("evaluation", "diligence").startsWith("RECOMMENDATION_GATE:")).toBe(true);
  });

  it("names both stages, so the user knows where to record it", () => {
    const msg = recommendationGateMessage("evaluation", "diligence");
    expect(msg).toContain("into diligence");
    expect(msg).toContain("at the evaluation stage");
  });

  // THE assertion that keeps the banner and the server error in sync forever.
  // The client renders the reason; the server renders the prefixed message. If
  // those two ever stop being the same sentence, the UI starts lying about the
  // rule — the exact failure contracts/assumption-gate.ts was written to fix.
  it("is exactly the code plus the reason the client renders", () => {
    for (const [from, to] of [
      ["evaluation", "diligence"],
      ["negotiation", "closing"],
    ]) {
      expect(recommendationGateMessage(from, to)).toBe(
        `${RECOMMENDATION_GATE_CODE}: ${recommendationGateReason(from, to)}`,
      );
    }
  });

  it("keeps the machine prefix out of the reason", () => {
    expect(recommendationGateReason("evaluation", "diligence")).not.toContain(RECOMMENDATION_GATE_CODE);
  });
});

describe("gateState", () => {
  const at = (stage: string, status: string, expiresAt?: Date | string | null) =>
    rec(stage, status, expiresAt);

  it("is ungated with no next stage, or on an ungated transition", () => {
    expect(gateState([], "evaluation", undefined, NOW).kind).toBe("ungated");
    expect(gateState([], "sourcing", "evaluation", NOW).kind).toBe("ungated");
    expect(gateState([], "integration", undefined, NOW).kind).toBe("ungated");
  });

  it("locks with reason 'none' when the deal has nothing at this stage", () => {
    const s = gateState([at("diligence", "accepted")], "evaluation", "diligence", NOW);
    expect(s).toEqual({ kind: "locked", reason: "none", drafts: 0, expired: 0 });
  });

  it("locks with reason 'drafts_pending' when drafts are waiting on a decision", () => {
    const s = gateState(
      [at("evaluation", "draft"), at("evaluation", "draft")],
      "evaluation",
      "diligence",
      NOW,
    );
    expect(s).toEqual({ kind: "locked", reason: "drafts_pending", drafts: 2, expired: 0 });
  });

  it("locks with reason 'expired' when an acceptance aged out", () => {
    const s = gateState([at("evaluation", "accepted", PAST)], "evaluation", "diligence", NOW);
    expect(s).toEqual({ kind: "locked", reason: "expired", drafts: 0, expired: 1 });
  });

  it("prefers 'expired' over 'drafts_pending' — superseding a stale row is the shorter path", () => {
    const s = gateState(
      [at("evaluation", "accepted", PAST), at("evaluation", "draft")],
      "evaluation",
      "diligence",
      NOW,
    );
    expect(s).toMatchObject({ kind: "locked", reason: "expired", drafts: 1, expired: 1 });
  });

  it("is clear when a live acceptance exists at the stage being left", () => {
    const s = gateState([at("evaluation", "accepted", null)], "evaluation", "diligence", NOW);
    expect(s).toMatchObject({ kind: "clear", live: 1, soonestExpiry: null, expiringSoon: false });
  });

  it("does not count an acceptance recorded at a different stage", () => {
    const s = gateState([at("diligence", "accepted", null)], "evaluation", "diligence", NOW);
    expect(s.kind).toBe("locked");
  });

  it("reports the soonest expiry among the live rows, not just any", () => {
    const soon = new Date(NOW.getTime() + 3 * 86_400_000);
    const s = gateState(
      [at("evaluation", "accepted", FUTURE), at("evaluation", "accepted", soon)],
      "evaluation",
      "diligence",
      NOW,
    );
    expect(s).toMatchObject({ kind: "clear", live: 2, expiringSoon: true });
    expect((s as { soonestExpiry: Date }).soonestExpiry.getTime()).toBe(soon.getTime());
  });

  it("warns exactly at the boundary and not a day beyond it", () => {
    const onBoundary = new Date(NOW.getTime() + GATE_EXPIRY_WARNING_DAYS * 86_400_000);
    const dayAfter = new Date(onBoundary.getTime() + 86_400_000);
    expect(gateState([at("evaluation", "accepted", onBoundary)], "evaluation", "diligence", NOW))
      .toMatchObject({ expiringSoon: true });
    expect(gateState([at("evaluation", "accepted", dayAfter)], "evaluation", "diligence", NOW))
      .toMatchObject({ expiringSoon: false });
  });

  it("treats a never-expiring acceptance as clear with no warning", () => {
    expect(gateState([at("evaluation", "accepted", null)], "evaluation", "diligence", NOW))
      .toMatchObject({ expiringSoon: false, soonestExpiry: null });
  });
});

describe("gateStateHeadline", () => {
  const headline = (rows: Parameters<typeof gateState>[0]) =>
    gateStateHeadline(gateState(rows, "evaluation", "diligence", NOW), "evaluation", "diligence", NOW)!;

  it("renders nothing when the transition is ungated", () => {
    expect(gateStateHeadline({ kind: "ungated" }, "sourcing", "evaluation", NOW)).toBeNull();
  });

  // The point of the whole refactor: what the banner says and what the server
  // returns are the same sentence, so a user is never told two different rules.
  it("ends every locked variant with the server's exact reason", () => {
    const reason = recommendationGateReason("evaluation", "diligence");
    expect(headline([])).toContain(reason);
    expect(headline([rec("evaluation", "draft")])).toContain(reason);
    expect(headline([rec("evaluation", "accepted", PAST)])).toContain(reason);
  });

  it("never leaks the machine prefix into the banner", () => {
    expect(headline([])).not.toContain(RECOMMENDATION_GATE_CODE);
  });

  it("names the flavour of not-met, which the server deliberately cannot", () => {
    expect(headline([rec("evaluation", "draft")])).toContain("waiting on a decision");
    expect(headline([rec("evaluation", "accepted", PAST)])).toContain("Supersede it");
  });

  it("agrees with itself on singular and plural drafts", () => {
    expect(headline([rec("evaluation", "draft")])).toContain("1 draft at evaluation is waiting");
    expect(headline([rec("evaluation", "draft"), rec("evaluation", "draft")])).toContain(
      "2 drafts at evaluation are waiting",
    );
  });

  it("says the next stage is available when clear", () => {
    const h = headline([rec("evaluation", "accepted", null)]);
    expect(h).toContain("Advancement gate: clear");
    expect(h).toContain("Diligence is available");
  });

  it("warns on the way out when the satisfying row expires soon", () => {
    const soon = new Date(NOW.getTime() + 9 * 86_400_000);
    expect(headline([rec("evaluation", "accepted", soon)])).toContain("Expires in 9 days");
  });
});
