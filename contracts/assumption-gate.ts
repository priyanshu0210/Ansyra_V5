export const RED_FLAG_OPTIMISM = 80;

export interface AssumptionReview {
  outcome: "answered" | "resolved" | "risk_accepted";
  reason: string;
  evidence: string;
  reviewedBy: string;
  reviewedAt: string;
}
export interface GateableAssumption {
  assumption: string;
  reviewerNote?: string | null;
  result?: { optimismScore?: number | null; reviewHistory?: AssumptionReview[] } | null;
}
export function latestReview(a: GateableAssumption): AssumptionReview | undefined {
  return a.result?.reviewHistory?.at(-1);
}
export function blocksAdvancement(a: GateableAssumption): boolean {
  const score = a.result?.optimismScore;
  if (typeof score !== "number" || !Number.isFinite(score) || score <= RED_FLAG_OPTIMISM) return false;
  const r = latestReview(a);
  // Legacy notes remain readable but cannot masquerade as an attributed decision.
  return !(r && (r.outcome === "resolved" || r.outcome === "risk_accepted") &&
    r.reason.trim().length >= 10 && r.evidence.trim().length >= 3 &&
    r.reviewedBy.trim() && Number.isFinite(Date.parse(r.reviewedAt)));
}
export function blockingAssumptions<T extends GateableAssumption>(rows: readonly T[]): T[] {
  return rows.filter(blocksAdvancement);
}
export const ASSUMPTION_GATE_CODE = "ASSUMPTION_GATE";
export function assumptionGateMessage(count: number): string {
  return `${ASSUMPTION_GATE_CODE}: ${count} high-risk assumption${count === 1 ? "" : "s"} need an attributed review. Record the evidence and resolve the concern or explicitly accept the risk in the Assumption Ledger before advancing.`;
}
