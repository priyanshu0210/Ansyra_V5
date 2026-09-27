// Deal-stage ordering + the stage-gate predicate. Shared FE/BE so the client
// can decide when to open the Decision modal and the server can enforce the
// gate with identical logic. Pure + unit-tested (see contracts/stages.test.ts).

export const DEAL_STAGES = [
  "sourcing",
  "evaluation",
  "diligence",
  "negotiation",
  "closing",
  "integration",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

/** Index of a stage in the lifecycle order, or -1 if unknown. */
export function stageOrdinal(stage: string): number {
  return (DEAL_STAGES as readonly string[]).indexOf(stage);
}

/**
 * True when moving `from` → `to` advances the deal to a LATER stage. Backward
 * moves, same-stage, and unknown stages return false. A forward move is the
 * only transition that requires a recorded decision (the stage-gate).
 */
export function isForwardStageMove(from: string, to: string): boolean {
  const f = stageOrdinal(from);
  const t = stageOrdinal(to);
  return f >= 0 && t >= 0 && t > f;
}
