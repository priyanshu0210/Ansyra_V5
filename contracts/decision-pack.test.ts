import { describe, it, expect } from "vitest";
import {
  buildDecisionPack,
  packVerdictLine,
  type BuildPackInput,
  type PackRecommendationInput,
} from "./decision-pack";
import { RED_FLAG_OPTIMISM } from "./assumption-gate";

const NOW = new Date("2026-08-12T00:00:00.000Z");

function rec(over: Partial<PackRecommendationInput> = {}): PackRecommendationInput {
  return {
    id: 1,
    claim: "Proceed to negotiation at the current price.",
    rationale: "The retention thesis survives a bottom-up rebuild.",
    stage: "diligence",
    status: "accepted",
    confidence: 78,
    owner: "human",
    decidedAt: "2026-06-01T00:00:00.000Z",
    counterarguments: [],
    supportingEvidence: [{ kind: "assumption", id: 11, label: "NRR > 108%" }],
    ...over,
  };
}

function pack(over: Partial<BuildPackInput> = {}) {
  return buildDecisionPack({
    dealId: 7,
    dealName: "Project Kestrel",
    targetCompany: "Kestrel Ltd",
    fromStage: "diligence",
    recommendations: [rec()],
    assumptions: [],
    now: NOW,
    ...over,
  });
}

describe("what the pack argues for", () => {
  it("defaults to the next stage in the pipeline", () => {
    expect(pack().toStage).toBe("negotiation");
  });

  it("says so plainly at the end of the pipeline", () => {
    const p = pack({ fromStage: "integration", recommendations: [rec({ stage: "integration" })] });
    expect(p.toStage).toBeNull();
    expect(packVerdictLine(p)).toMatch(/final stage/);
  });

  it("reads the verdict off the SHIPPED gate rather than re-deriving it", () => {
    expect(pack().verdict).toBe("clear");
    expect(pack({ recommendations: [rec({ status: "draft", decidedAt: null })] }).verdict).toBe(
      "blocked",
    );
    // sourcing -> evaluation is not gated at all.
    expect(pack({ fromStage: "sourcing", recommendations: [] }).verdict).toBe("not_gated");
  });
});

describe("standsOn — only what the gate would actually accept", () => {
  it("takes accepted, live claims at the stage being left", () => {
    const p = pack();
    expect(p.standsOn.map((c) => c.id)).toEqual([1]);
    expect(p.standsOn[0].evidenceCount).toBe(1);
  });

  it("excludes a claim accepted at a DIFFERENT stage", () => {
    // Otherwise the pack argues for the move using conclusions the gate does
    // not accept as support for it.
    const p = pack({ recommendations: [rec({ stage: "evaluation" })] });
    expect(p.standsOn).toEqual([]);
  });

  it("excludes an expired claim", () => {
    const p = pack({
      recommendations: [rec({ expiresAt: "2026-01-01T00:00:00.000Z" })],
    });
    expect(p.standsOn).toEqual([]);
  });

  it("excludes drafts and superseded rows", () => {
    for (const status of ["draft", "rejected", "superseded"]) {
      expect(pack({ recommendations: [rec({ status })] }).standsOn, status).toEqual([]);
    }
  });
});

describe("uncertain vs unresolved never say the same thing", () => {
  const withObjections = rec({
    counterarguments: [
      { point: "The regulatory read assumes Phase 1 with no remedy.", weight: "material" },
      { point: "No independent quality-of-earnings has been run.", weight: "fatal" },
      { point: "Answered already.", weight: "material", response: "Rebuilt bottom-up." },
    ],
  });

  it("puts an unanswered FATAL in unresolved, not in uncertain", () => {
    const p = pack({ recommendations: [withObjections] });
    expect(p.unresolved.filter((u) => u.source === "fatal_objection").map((u) => u.text)).toEqual([
      "No independent quality-of-earnings has been run.",
    ]);
    expect(p.uncertain.map((u) => u.text)).not.toContain(
      "No independent quality-of-earnings has been run.",
    );
  });

  it("puts an unanswered non-fatal in uncertain", () => {
    const p = pack({ recommendations: [withObjections] });
    const points = p.uncertain.filter((u) => u.source === "counterargument").map((u) => u.text);
    expect(points).toEqual(["The regulatory read assumes Phase 1 with no remedy."]);
  });

  it("ignores an ANSWERED objection entirely", () => {
    const p = pack({ recommendations: [withObjections] });
    const all = [...p.uncertain, ...p.unresolved].map((x) => x.text);
    expect(all).not.toContain("Answered already.");
  });
});

describe("assumptions split by the shipped gate", () => {
  const flagged = {
    id: 20,
    assumption: "No Phase 2 regulatory review",
    result: { optimismScore: RED_FLAG_OPTIMISM + 1 },
  };
  const ordinary = {
    id: 21,
    assumption: "Cost synergies land within twelve months",
    result: { optimismScore: 40 },
  };

  it("a red flag is unresolved; an ordinary scored assumption is uncertain", () => {
    const p = pack({ assumptions: [flagged, ordinary] });
    expect(p.unresolved.filter((u) => u.source === "red_flag_assumption").map((u) => u.text)).toEqual([
      "No Phase 2 regulatory review",
    ]);
    expect(p.uncertain.filter((u) => u.source === "assumption").map((u) => u.text)).toEqual([
      "Cost synergies land within twelve months",
    ]);
  });

  it("a legacy note does not clear a red flag", () => {
    const answered = { ...flagged, reviewerNote: "Counsel confirmed Phase 1." };
    const p = pack({ assumptions: [answered] });
    expect(p.unresolved.filter((u) => u.source === "red_flag_assumption")).toHaveLength(1);
  });

  it("an UNSCORED assumption is neither — the AI never got to it", () => {
    const p = pack({ assumptions: [{ id: 22, assumption: "Never stress-tested" }] });
    expect(p.uncertain.filter((u) => u.source === "assumption")).toEqual([]);
    expect(p.unresolved.filter((u) => u.source === "red_flag_assumption")).toEqual([]);
  });

  it("lists owed reads as unresolved work", () => {
    const p = pack({ assumptions: [{ ...ordinary, readsOwed: 2 }] });
    expect(p.unresolved.find((u) => u.source === "reads_owed")!.text).toBe(
      "2 reads owed on: Cost synergies land within twelve months",
    );
  });
});

describe("evidence is a bill of materials, not a repeated list", () => {
  it("dedupes a source cited by several claims into ONE line", () => {
    // A document cited by three recommendations reads as more support than it
    // is if it appears three times.
    const shared = { kind: "document_analysis" as const, id: 5, label: "SPA key terms" };
    const p = pack({
      recommendations: [
        rec({ id: 1, supportingEvidence: [shared] }),
        rec({ id: 2, supportingEvidence: [shared] }),
        rec({ id: 3, supportingEvidence: [shared, { kind: "economics", id: 9, label: "EV/EBITDA" }] }),
      ],
    });
    const doc = p.evidence.filter((e) => e.kind === "document_analysis");
    expect(doc).toHaveLength(1);
    expect(doc[0].citedBy).toEqual([1, 2, 3]);
    expect(p.evidence).toHaveLength(2);
  });

  it("keys on kind AND id — economics #5 is not document #5", () => {
    const p = pack({
      recommendations: [
        rec({ supportingEvidence: [
          { kind: "economics", id: 5, label: "a" },
          { kind: "document_analysis", id: 5, label: "b" },
        ] }),
      ],
    });
    expect(p.evidence).toHaveLength(2);
  });

  it("sorts MISSING citations first", () => {
    // Support that has gone is what a reader most needs to see.
    const p = pack({
      recommendations: [rec({ supportingEvidence: [
        { kind: "assumption", id: 1, label: "fine" },
        { kind: "assumption", id: 2, label: "gone" },
      ] })],
      evidenceByRecommendation: {
        1: [
          { kind: "assumption", id: 1, label: "fine", summary: "still here", missing: false },
          { kind: "assumption", id: 2, label: "gone", summary: "", missing: true },
        ],
      },
    });
    expect(p.evidence[0].missing).toBe(true);
    expect(p.evidence[0].id).toBe(2);
  });

  it("prefers the server-resolved evidence over the link-time snapshot", () => {
    const p = pack({
      recommendations: [rec({ supportingEvidence: [{ kind: "assumption", id: 11, label: "stale" }] })],
      evidenceByRecommendation: {
        1: [{ kind: "assumption", id: 11, label: "stale", summary: "as it stands now", missing: false }],
      },
    });
    expect(p.evidence[0].summary).toBe("as it stands now");
  });

  it("still names a citation whose label was never captured", () => {
    const p = pack({
      recommendations: [rec({ supportingEvidence: [{ kind: "scenario", id: 47 }] })],
    });
    expect(p.evidence[0].label).toContain("47");
  });

  it("draws evidence only from claims that STAND", () => {
    const p = pack({
      recommendations: [rec({ status: "draft", decidedAt: null, supportingEvidence: [
        { kind: "economics", id: 3, label: "draft-only source" },
      ] })],
    });
    expect(p.evidence).toEqual([]);
  });
});

describe("the empty pack", () => {
  it("knows when there is nothing to take into the room", () => {
    const p = pack({ recommendations: [], assumptions: [], scenarios: [] });
    expect(p.isEmpty).toBe(true);
    expect(packVerdictLine(p)).toMatch(/Advancement is blocked/);
  });

  it("is not empty when only unresolved items exist", () => {
    const p = pack({
      recommendations: [],
      assumptions: [{ id: 1, assumption: "x", result: { optimismScore: 95 } }],
    });
    expect(p.isEmpty).toBe(false);
  });
});

describe("clock injection", () => {
  it("expiry is the only thing the clock moves", () => {
    const expiring = rec({ expiresAt: "2026-09-01T00:00:00.000Z" });
    const before = buildDecisionPack({
      dealId: 7, dealName: "d", fromStage: "diligence",
      recommendations: [expiring], now: new Date("2026-08-01T00:00:00.000Z"),
    });
    const after = buildDecisionPack({
      dealId: 7, dealName: "d", fromStage: "diligence",
      recommendations: [expiring], now: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(before.standsOn).toHaveLength(1);
    expect(after.standsOn).toHaveLength(0);
    expect(before.toStage).toBe(after.toStage);
  });
});
