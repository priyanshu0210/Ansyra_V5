// The recommendation gate (Phase 15.8). Shared FE/BE for the same reason
// contracts/assumption-gate.ts is: the client decides when to show "advancement
// gate: locked", the server decides whether to reject the move, and if those two
// ever disagree the UI lies.
//
// A HARD gate, but only on the transitions where the deal starts costing real
// money. sourcing → evaluation is deliberately ungated: demanding a formal
// recorded conclusion before you may look harder at a lead would make the
// product hostile at exactly the moment it should be cheap. From diligence
// onwards, a stage move with no recorded conclusion behind it is the failure
// this product exists to prevent.
//
// Pure + unit-tested (see contracts/recommendation-gate.test.ts).

import { isForwardStageMove, type DealStage } from "./stages";

/** Entering any of these requires an accepted recommendation. No new stage
 *  vocabulary — a SUBSET of DEAL_STAGES, enforced by the type and by a test. */
export const RECOMMENDATION_GATED_STAGES: readonly DealStage[] = [
  "diligence",
  "negotiation",
  "closing",
  "integration",
];

/** Prefix on the TRPCError message, so the client can tell this rejection apart
 *  from DECISION_REQUIRED and ASSUMPTION_GATE without parsing prose. */
export const RECOMMENDATION_GATE_CODE = "RECOMMENDATION_GATE";

/** The shape the gate needs. Deliberately structural, so the drizzle row and the
 *  client's query result both satisfy it without a cast. */
export interface GateableRecommendation {
  stage: string;
  status: string;
  expiresAt?: Date | string | null;
}

/** True when this from → to move is one the gate applies to. */
export function isGatedTransition(from: string, to: string): boolean {
  return (
    isForwardStageMove(from, to) &&
    (RECOMMENDATION_GATED_STAGES as readonly string[]).includes(to)
  );
}

/**
 * True when an expiry has passed. Split out from isLiveRecommendation because
 * the card shows "stale" on a rejected or draft row too — expiry is about the
 * date, status is about the decision, and they are different questions.
 *
 * The clock lives here, with an injectable default, the same way
 * contracts/milestones.ts owns todayIso: components read it through this rather
 * than calling Date.now() in a render body.
 */
export function isExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (expiresAt == null) return false;
  const t = new Date(expiresAt).getTime();
  return !Number.isFinite(t) || t <= now.getTime();
}

/**
 * True when this recommendation currently counts. Accepted, and either never
 * expiring or not yet expired. A draft is a thought, not a conclusion; a
 * superseded one has been replaced; an expired one was a conclusion about a
 * world that has since moved on.
 */
export function isLiveRecommendation(
  r: GateableRecommendation,
  now: Date = new Date(),
): boolean {
  if (r.status !== "accepted") return false;
  return !isExpired(r.expiresAt, now);
}

/**
 * The recommendations that satisfy the gate for a move OUT OF `fromStage`.
 *
 * Scoped to fromStage, not toStage: the conclusion that justifies advancing is
 * the one you reached where you are standing. A recommendation filed against a
 * stage the deal has not entered yet is a plan, not a finding.
 */
export function satisfyingRecommendations<T extends GateableRecommendation>(
  rows: readonly T[],
  fromStage: string,
  now: Date = new Date(),
): T[] {
  return rows.filter((r) => r.stage === fromStage && isLiveRecommendation(r, now));
}

/**
 * The gate's rule, in one sentence, with no machine prefix.
 *
 * The banner renders THIS; the server wraps it in the code below. One string,
 * so the sentence a user reads before they try is character-for-character the
 * sentence they get back if they try anyway. The client must never render the
 * prefixed form and strip the prefix off it — that is parsing your own
 * serialisation. (DecisionLog owns the one legitimate strip, where the prefix is
 * genuinely the only discriminator on a *server error*.)
 */
export function recommendationGateReason(fromStage: string, toStage: string): string {
  return (
    `moving into ${toStage} requires at least one accepted, unexpired recommendation ` +
    `recorded at the ${fromStage} stage. Record one in Recommendations before ` +
    `advancing this deal.`
  );
}

/** The one sentence shown to the user, server-side and client-side alike. */
export function recommendationGateMessage(fromStage: string, toStage: string): string {
  return `${RECOMMENDATION_GATE_CODE}: ${recommendationGateReason(fromStage, toStage)}`;
}

// ─── The banner's state machine ──────────────────────────────────────────────
// Why the elaboration lives on the client and not in the gate itself: telling
// "there are drafts waiting" apart from "there was one and it aged out" needs a
// second read, and adding reads to the shipped decisions.record transaction is
// not worth it for a message. So the SERVER states the rule and the CLIENT
// states which flavour of not-met you are in — but every locked variant ends
// with recommendationGateReason(), so the two can never contradict each other.

/** Within this many days of expiry, a satisfied gate warns that it will close. */
export const GATE_EXPIRY_WARNING_DAYS = 14;

export type GateLockReason = "none" | "drafts_pending" | "expired";

export type GateState =
  | { kind: "ungated" }
  | { kind: "clear"; live: number; soonestExpiry: Date | null; expiringSoon: boolean }
  | { kind: "locked"; reason: GateLockReason; drafts: number; expired: number };

const DAY_MS = 86_400_000;

/**
 * Which of the five states this deal's recommendations put the gate in.
 *
 * Locked precedence is expired → drafts_pending → none. Expired outranks drafts
 * because it names a specific stale row the user can supersede in one click,
 * which is a shorter path than deciding a draft.
 *
 * Clock injected, per the react-hooks/purity rule — components must not call
 * Date.now() in a render body.
 */
export function gateState<T extends GateableRecommendation>(
  rows: readonly T[],
  fromStage: string,
  toStage: string | undefined,
  now: Date = new Date(),
): GateState {
  if (!toStage || !isGatedTransition(fromStage, toStage)) return { kind: "ungated" };

  const atStage = rows.filter((r) => r.stage === fromStage);
  const live = atStage.filter((r) => isLiveRecommendation(r, now));

  if (live.length > 0) {
    const expiries = live
      .map((r) => (r.expiresAt == null ? null : new Date(r.expiresAt).getTime()))
      .filter((t): t is number => t !== null && Number.isFinite(t));
    const soonest = expiries.length > 0 ? Math.min(...expiries) : null;
    return {
      kind: "clear",
      live: live.length,
      soonestExpiry: soonest === null ? null : new Date(soonest),
      expiringSoon: soonest !== null && soonest - now.getTime() <= GATE_EXPIRY_WARNING_DAYS * DAY_MS,
    };
  }

  const drafts = atStage.filter((r) => r.status === "draft").length;
  const expired = atStage.filter((r) => r.status === "accepted" && isExpired(r.expiresAt, now)).length;
  const reason: GateLockReason = expired > 0 ? "expired" : drafts > 0 ? "drafts_pending" : "none";
  return { kind: "locked", reason, drafts, expired };
}

/** Whole-number days from `now` until `at`; negative once it has passed. */
function daysBetween(now: Date, at: Date): number {
  return Math.round((at.getTime() - now.getTime()) / DAY_MS);
}

/**
 * The banner sentence for a state. Every locked variant ENDS with
 * recommendationGateReason(...), so the user reads the server's exact wording
 * before they ever trigger it.
 */
export function gateStateHeadline(
  state: GateState,
  fromStage: string,
  toStage: string,
  now: Date = new Date(),
): string | null {
  if (state.kind === "ungated") return null;

  if (state.kind === "clear") {
    const base =
      `Advancement gate: clear — ${state.live} accepted recommendation` +
      `${state.live === 1 ? "" : "s"} at ${fromStage}. ` +
      `${toStage.charAt(0).toUpperCase()}${toStage.slice(1)} is available.`;
    if (!state.expiringSoon || !state.soonestExpiry) return base;
    const d = daysBetween(now, state.soonestExpiry);
    return `${base} Expires in ${d} day${d === 1 ? "" : "s"} — after that this gate closes again.`;
  }

  const reason = recommendationGateReason(fromStage, toStage);
  switch (state.reason) {
    case "expired":
      return (
        `Advancement gate: locked — the accepted recommendation at ${fromStage} has expired. ` +
        `Supersede it with a current one; ${reason}`
      );
    case "drafts_pending":
      return (
        `Advancement gate: locked — ${state.drafts} draft${state.drafts === 1 ? "" : "s"} at ` +
        `${fromStage} ${state.drafts === 1 ? "is" : "are"} waiting on a decision. A draft is a ` +
        `thought, not a conclusion: accept or reject ${state.drafts === 1 ? "it" : "one"}, and ` +
        `${reason}`
      );
    case "none":
      return `Advancement gate: locked — ${reason}`;
  }
}
