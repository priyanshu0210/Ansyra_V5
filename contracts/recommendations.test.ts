import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_HIGH_MIN,
  CONFIDENCE_MEDIUM_MIN,
  acceptBlockedMessage,
  canAccept,
  confidenceBand,
  dedupeEvidence,
  evidenceCounts,
  evidenceSummary,
  unansweredCounterarguments,
  type Counterargument,
  type CounterargumentWeight,
  type EvidenceKind,
  type RecommendationEvidence,
} from "./recommendations";

const ev = (kind: EvidenceKind, id: number): RecommendationEvidence => ({ kind, id });
const against = (
  weight: CounterargumentWeight,
  response?: string | null,
): Counterargument => ({ point: "No independent quality-of-earnings has been run.", weight, response });

describe("confidenceBand", () => {
  it("bands at the documented floors", () => {
    expect(confidenceBand(CONFIDENCE_HIGH_MIN)).toBe("high");
    expect(confidenceBand(CONFIDENCE_HIGH_MIN - 1)).toBe("medium");
    expect(confidenceBand(CONFIDENCE_MEDIUM_MIN)).toBe("medium");
    expect(confidenceBand(CONFIDENCE_MEDIUM_MIN - 1)).toBe("low");
  });

  it("covers the ends of the range", () => {
    expect(confidenceBand(0)).toBe("low");
    expect(confidenceBand(100)).toBe("high");
  });

  it("clamps out-of-range scores rather than returning undefined", () => {
    expect(confidenceBand(-5)).toBe("low");
    expect(confidenceBand(150)).toBe("high");
  });

  it("rounds before banding, so a model's 69.6 is high", () => {
    expect(confidenceBand(69.6)).toBe("high");
    expect(confidenceBand(69.4)).toBe("medium");
  });

  it("treats non-finite scores as low rather than throwing", () => {
    expect(confidenceBand(Number.NaN)).toBe("low");
    expect(confidenceBand(Number.POSITIVE_INFINITY)).toBe("low");
  });
});

describe("evidenceCounts", () => {
  it("counts per kind and returns them in EVIDENCE_KINDS order", () => {
    const counts = evidenceCounts([
      ev("scenario", 7),
      ev("assumption", 1),
      ev("assumption", 2),
      ev("regulatory", 3),
    ]);
    expect(counts).toEqual([
      { kind: "assumption", count: 2 },
      { kind: "regulatory", count: 1 },
      { kind: "scenario", count: 1 },
    ]);
  });

  it("drops kinds with no citations", () => {
    expect(evidenceCounts([ev("economics", 1)])).toEqual([{ kind: "economics", count: 1 }]);
    expect(evidenceCounts([])).toEqual([]);
  });
});

describe("evidenceSummary", () => {
  it("agrees with itself on singular and plural", () => {
    expect(evidenceSummary([ev("assumption", 1)])).toBe("1 analysis across 1 source");
    expect(evidenceSummary([ev("assumption", 1), ev("scenario", 2)])).toBe(
      "2 analyses across 2 sources",
    );
  });

  it("counts analyses and sources separately", () => {
    expect(evidenceSummary([ev("assumption", 1), ev("assumption", 2)])).toBe(
      "2 analyses across 1 source",
    );
  });

  it("says so when nothing is cited", () => {
    expect(evidenceSummary([])).toBe("No linked analyses");
  });
});

describe("dedupeEvidence", () => {
  it("collapses repeated kind:id pairs", () => {
    expect(dedupeEvidence([ev("assumption", 1), ev("assumption", 1)])).toHaveLength(1);
  });

  it("keeps the same id across different kinds", () => {
    expect(dedupeEvidence([ev("assumption", 1), ev("scenario", 1)])).toHaveLength(2);
  });

  it("preserves first-seen order, so the recommender's ordering survives", () => {
    const out = dedupeEvidence([ev("scenario", 9), ev("assumption", 1), ev("scenario", 9)]);
    expect(out.map((e) => `${e.kind}:${e.id}`)).toEqual(["scenario:9", "assumption:1"]);
  });

  it("keeps the label captured at link time", () => {
    const out = dedupeEvidence([{ kind: "assumption", id: 1, label: "optimism 91/100" }]);
    expect(out[0].label).toBe("optimism 91/100");
  });
});

describe("unansweredCounterarguments", () => {
  it("treats a whitespace-only response as no response", () => {
    expect(unansweredCounterarguments([against("minor", "   ")])).toHaveLength(1);
  });

  it("clears once an answer is written", () => {
    expect(unansweredCounterarguments([against("fatal", "QoE engaged; report due 12 Mar.")])).toEqual([]);
  });
});

describe("canAccept (the acceptance-integrity rule)", () => {
  it("blocks only on an unanswered fatal objection", () => {
    expect(canAccept([against("fatal")])).toBe(false);
    expect(canAccept([against("fatal", "   ")])).toBe(false);
  });

  it("allows acceptance once the fatal objection is answered", () => {
    expect(canAccept([against("fatal", "QoE engaged; report due 12 Mar.")])).toBe(true);
  });

  it("allows acceptance over unanswered minor and material objections — that is a judgement call, and it is on the record", () => {
    expect(canAccept([against("minor"), against("material")])).toBe(true);
  });

  it("allows acceptance when nothing argues against it", () => {
    expect(canAccept([])).toBe(true);
  });
});

describe("acceptBlockedMessage", () => {
  it("counts only the unanswered fatal objections", () => {
    expect(acceptBlockedMessage([against("fatal"), against("material"), against("fatal")])).toContain(
      "2 fatal counterarguments",
    );
  });

  it("agrees with itself on singular and plural", () => {
    expect(acceptBlockedMessage([against("fatal")])).toContain("1 fatal counterargument has");
    expect(acceptBlockedMessage([against("fatal"), against("fatal")])).toContain(
      "2 fatal counterarguments have",
    );
  });
});
