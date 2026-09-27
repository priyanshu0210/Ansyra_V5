// ─────────────────────────────────────────────────────────────────────────────
// The decision pack (Phase 15.21) — the artefact you take into the room.
//
// This is deliberately an EXPORT and not a fifth on-screen panel. Every input
// below already renders somewhere on the dossier: the gate and unanswered
// fatals on DecisionCard, the claims and their evidence on Recommendations, red
// flags on AssumptionLedgerPanel, the range on ScenarioPanel. A panel that
// restated them would be the collision 15.12 §16d exists to avoid.
//
// What does NOT exist anywhere is the same material arranged as one argument,
// on paper, at the moment someone advances a deal. So this module ORDERS rather
// than computes: four sections answering the four questions a committee asks.
//
//   1. What do we believe is true?      -> standsOn      (live accepted claims)
//   2. What is still uncertain?         -> uncertain
//   3. What is that belief resting on?  -> evidence
//   4. What is unresolved?              -> unresolved
//
// It reuses every shipped predicate rather than restating one: gateState decides
// the gate, isLiveRecommendation decides what still stands, blocksAdvancement
// decides a red flag, unansweredCounterarguments decides what is unanswered.
//
// Pure. Clock-injected. Unit-tested in contracts/decision-pack.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { decisionReadiness } from "./decision-readiness";
import { DEAL_STAGES, stageOrdinal } from "./stages";
import {
  gateState,
  isLiveRecommendation,
  type GateState,
} from "./recommendation-gate";
import {
  EVIDENCE_KIND_LABELS,
  unansweredCounterarguments,
  type Counterargument,
  type EvidenceKind,
  type RecommendationEvidence,
} from "./recommendations";
import { blocksAdvancement, type GateableAssumption } from "./assumption-gate";

// ─── Structural inputs ───────────────────────────────────────────────────────

export interface PackRecommendationInput {
  id: number;
  claim: string;
  rationale?: string | null;
  stage: string;
  status: string;
  confidence: number;
  owner?: string | null;
  expiresAt?: Date | string | null;
  decidedAt?: Date | string | null;
  counterarguments?: readonly Counterargument[] | null;
  supportingEvidence?: readonly RecommendationEvidence[] | null;
}

export interface PackAssumptionInput extends GateableAssumption {
  id: number;
  assumption: string;
  category?: string | null;
  /** Reads owed against it, from the ledger's own summary. */
  readsOwed?: number;
}

export interface PackScenarioInput {
  id: string;
  caseName: string;
  label: string;
  probabilityPct: number;
  thesisImpact: string;
}

/** A resolved evidence line, as recommendations-router already returns it. */
export interface PackEvidenceInput extends RecommendationEvidence {
  summary?: string;
  missing?: boolean;
}

export interface BuildPackInput {
  dealId: number;
  dealName: string;
  targetCompany?: string | null;
  fromStage: string;
  /** Defaults to the next stage in DEAL_STAGES — the move being argued for. */
  toStage?: string;
  recommendations: readonly PackRecommendationInput[];
  assumptions?: readonly PackAssumptionInput[];
  scenarios?: readonly PackScenarioInput[];
  /** Evidence already resolved by the server, keyed by recommendation id. */
  evidenceByRecommendation?: Readonly<Record<number, readonly PackEvidenceInput[]>>;
  now?: Date;
}

// ─── The pack ────────────────────────────────────────────────────────────────

export interface PackClaim {
  id: number;
  claim: string;
  rationale: string | null;
  confidence: number;
  owner: string | null;
  evidenceCount: number;
}

export interface PackUncertainty {
  /** Where the doubt comes from, so a reader can go to the right panel. */
  source: "counterargument" | "assumption" | "range";
  text: string;
  /** Only set for a counterargument. */
  weight?: string;
  recommendationId?: number;
  assumptionId?: number;
}

export interface PackUnresolved {
  source: "fatal_objection" | "red_flag_assumption" | "reads_owed";
  text: string;
  recommendationId?: number;
  assumptionId?: number;
}

export interface PackEvidenceLine {
  kind: EvidenceKind;
  kindLabel: string;
  id: number;
  label: string;
  summary: string | null;
  missing: boolean;
  /** Which claims rest on it. Repeated evidence is listed once, not per claim. */
  citedBy: number[];
}

export interface DecisionPack {
  dealId: number;
  dealName: string;
  targetCompany: string | null;
  fromStage: string;
  toStage: string | null;
  gate: GateState;
  /** The one-word answer, from the shipped gate rather than re-derived. */
  verdict: "clear" | "blocked" | "not_gated" | "unknown";
  readinessMessage: string;
  standsOn: PackClaim[];
  uncertain: PackUncertainty[];
  evidence: PackEvidenceLine[];
  unresolved: PackUnresolved[];
  ranges: PackScenarioInput[];
  /** True when there is genuinely nothing to take into the room. */
  isEmpty: boolean;
}

function nextStage(from: string): string | null {
  const i = stageOrdinal(from);
  if (i < 0 || i + 1 >= DEAL_STAGES.length) return null;
  return DEAL_STAGES[i + 1];
}

/**
 * Assemble the pack.
 *
 * `standsOn` is deliberately narrow: recommendations that are ACCEPTED, LIVE
 * (not expired) and AT THE STAGE BEING LEFT — which is exactly what the gate
 * checks. A pack that listed every accepted claim on the deal would argue for
 * the move using conclusions the gate does not accept as support for it.
 */
export function buildDecisionPack(input: BuildPackInput): DecisionPack {
  const now = input.now ?? new Date();
  const toStage = input.toStage ?? nextStage(input.fromStage);
  const gate = gateState(input.recommendations, input.fromStage, toStage ?? undefined, now);

  const standing = input.recommendations.filter(
    (r) => r.stage === input.fromStage && isLiveRecommendation(r, now),
  );

  const standsOn: PackClaim[] = standing.map((r) => ({
    id: r.id,
    claim: r.claim,
    rationale: r.rationale ?? null,
    confidence: r.confidence,
    owner: r.owner ?? null,
    evidenceCount: (r.supportingEvidence ?? []).length,
  }));

  // ── What is uncertain ─────────────────────────────────────────────────────
  const uncertain: PackUncertainty[] = [];
  for (const r of standing) {
    for (const c of unansweredCounterarguments(r.counterarguments ?? [])) {
      // A fatal on a standing claim is unresolved, not merely uncertain — it is
      // listed below instead, so the two sections never say the same thing.
      if (c.weight === "fatal") continue;
      uncertain.push({
        source: "counterargument",
        text: c.point,
        weight: c.weight,
        recommendationId: r.id,
      });
    }
  }
  for (const a of input.assumptions ?? []) {
    // A scored-but-not-red-flag assumption is the everyday kind of uncertainty.
    if (!blocksAdvancement(a) && typeof a.result?.optimismScore === "number") {
      uncertain.push({ source: "assumption", text: a.assumption, assumptionId: a.id });
    }
  }
  for (const s of input.scenarios ?? []) {
    if (s.caseName === "downside") {
      uncertain.push({ source: "range", text: `If the downside lands: ${s.thesisImpact}` });
    }
  }

  // ── What is unresolved ────────────────────────────────────────────────────
  const unresolved: PackUnresolved[] = [];
  for (const r of standing) {
    for (const c of unansweredCounterarguments(r.counterarguments ?? [])) {
      if (c.weight !== "fatal") continue;
      unresolved.push({
        source: "fatal_objection",
        text: c.point,
        recommendationId: r.id,
      });
    }
  }
  for (const a of input.assumptions ?? []) {
    if (blocksAdvancement(a)) {
      unresolved.push({
        source: "red_flag_assumption",
        text: a.assumption,
        assumptionId: a.id,
      });
    }
    if ((a.readsOwed ?? 0) > 0) {
      unresolved.push({
        source: "reads_owed",
        text: `${a.readsOwed} read${a.readsOwed === 1 ? "" : "s"} owed on: ${a.assumption}`,
        assumptionId: a.id,
      });
    }
  }

  // ── What it rests on ──────────────────────────────────────────────────────
  // Deduped across claims: a document cited by three recommendations is ONE
  // line with three citations, not three lines. The pack is read as a bill of
  // materials, and a repeated item reads as more support than it is.
  const byRef = new Map<string, PackEvidenceLine>();
  for (const r of standing) {
    const resolved = input.evidenceByRecommendation?.[r.id];
    const refs: readonly PackEvidenceInput[] = resolved ?? (r.supportingEvidence ?? []);
    for (const e of refs) {
      const key = `${e.kind}:${e.id}`;
      const existing = byRef.get(key);
      if (existing) {
        if (!existing.citedBy.includes(r.id)) existing.citedBy.push(r.id);
        continue;
      }
      byRef.set(key, {
        kind: e.kind,
        kindLabel: EVIDENCE_KIND_LABELS[e.kind] ?? e.kind,
        id: e.id,
        // `label` is the link-time one-liner and is optional. Falling back to
        // the live summary, then to a stable identifier, keeps the documented
        // promise that a citation still reads sensibly after its source is gone.
        label: e.label ?? e.summary ?? `${EVIDENCE_KIND_LABELS[e.kind] ?? e.kind} #${e.id}`,
        summary: e.summary ?? null,
        missing: e.missing ?? false,
        citedBy: [r.id],
      });
    }
  }
  // Missing citations first — a pack whose support has gone is the thing a
  // reader most needs to see, and burying it mid-list hides it.
  const evidence = [...byRef.values()].sort(
    (a, b) =>
      Number(b.missing) - Number(a.missing) ||
      a.kind.localeCompare(b.kind) ||
      a.id - b.id,
  );

  const readiness = decisionReadiness(input.recommendations, input.assumptions, input.fromStage, toStage ?? undefined, now);
  const verdict = readiness.kind;

  return {
    dealId: input.dealId,
    dealName: input.dealName,
    targetCompany: input.targetCompany ?? null,
    fromStage: input.fromStage,
    toStage,
    gate,
    verdict,
    readinessMessage: readiness.message,
    standsOn,
    uncertain,
    evidence,
    unresolved,
    ranges: [...(input.scenarios ?? [])],
    isEmpty:
      standsOn.length === 0 &&
      uncertain.length === 0 &&
      unresolved.length === 0 &&
      evidence.length === 0,
  };
}

/** The pack's one-line verdict, in the language of the move being argued. */
export function packVerdictLine(pack: DecisionPack): string {
  if (pack.toStage === null) return "This deal is at its final stage; no advancement is being argued.";
  if (pack.verdict === "not_gated") {
    return `Moving to ${pack.toStage} is not gated on a recorded recommendation at this stage.`;
  }
  if (pack.verdict === "clear") {
    return `${pack.standsOn.length} recorded conclusion${pack.standsOn.length === 1 ? "" : "s"} stand${pack.standsOn.length === 1 ? "s" : ""} behind moving to ${pack.toStage}.`;
  }
  return pack.verdict === "unknown" ? "Readiness unknown: some of the record is unavailable." : `Advancement is blocked. Review the unresolved items before moving to ${pack.toStage}.`;
}
