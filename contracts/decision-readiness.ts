import { blockingAssumptions, assumptionGateMessage, type GateableAssumption } from "./assumption-gate";
import { gateState, recommendationGateMessage, type GateableRecommendation } from "./recommendation-gate";
import { isForwardStageMove } from "./stages";
export function decisionReadiness(recommendations: readonly GateableRecommendation[] | undefined, assumptions: readonly GateableAssumption[] | undefined, from: string, to?: string, now = new Date()) {
  if (!recommendations || !assumptions) return { kind: "unknown" as const, message: "Readiness unavailable: the decision record is incomplete." };
  const gate = gateState(recommendations, from, to, now);
  if (to && isForwardStageMove(from, to)) {
    const count = blockingAssumptions(assumptions).length;
    if (count) return { kind: "blocked" as const, message: assumptionGateMessage(count) };
  }
  if (gate.kind === "locked") return { kind: "blocked" as const, message: recommendationGateMessage(from, to!) };
  return { kind: gate.kind === "ungated" ? "not_gated" as const : "clear" as const,
    message: "Recorded advancement checks are satisfied. This is not an approval to acquire." };
}
