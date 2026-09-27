import { describe, expect, it } from "vitest";
import { DEAL_STAGES, isForwardStageMove, stageOrdinal } from "./stages";

describe("stageOrdinal", () => {
  it("orders the lifecycle stages", () => {
    expect(stageOrdinal("sourcing")).toBe(0);
    expect(stageOrdinal("integration")).toBe(DEAL_STAGES.length - 1);
  });
  it("returns -1 for unknown stages", () => {
    expect(stageOrdinal("bogus")).toBe(-1);
    expect(stageOrdinal("")).toBe(-1);
  });
});

describe("isForwardStageMove (the stage-gate predicate)", () => {
  it("is true only for moves to a LATER stage", () => {
    expect(isForwardStageMove("sourcing", "evaluation")).toBe(true);
    expect(isForwardStageMove("evaluation", "integration")).toBe(true);
    expect(isForwardStageMove("negotiation", "closing")).toBe(true);
  });
  it("is false for backward moves", () => {
    expect(isForwardStageMove("closing", "diligence")).toBe(false);
    expect(isForwardStageMove("integration", "sourcing")).toBe(false);
  });
  it("is false for same-stage (no move)", () => {
    expect(isForwardStageMove("diligence", "diligence")).toBe(false);
  });
  it("is false when either stage is unknown", () => {
    expect(isForwardStageMove("bogus", "closing")).toBe(false);
    expect(isForwardStageMove("sourcing", "bogus")).toBe(false);
  });
});
