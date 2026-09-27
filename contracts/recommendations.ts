// Recommendations (Phase 15.8) — the vocabulary and the derived logic behind
// Ansyra's decision engine. A recommendation is a conclusion someone reached:
// a claim, why they believe it, what it rests on, what argues against it, and
// how sure they are. Shared FE/BE because the card, the AI drafter, the router
// and the stage-gate banner must all read a row the same way.
//
// Pure + unit-tested (see contracts/recommendations.test.ts). Nothing here
// touches the database or the network.

export const RECOMMENDATION_STATUSES = ["draft", "accepted", "rejected", "superseded"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const RECOMMENDATION_OWNERS = ["ai", "human"] as const;
export type RecommendationOwner = (typeof RECOMMENDATION_OWNERS)[number];

/** The analyses a recommendation may cite. One entry per analysis TABLE, so the
 *  resolver in recommendations.get is O(kinds) queries, never O(refs). */
export const EVIDENCE_KINDS = [
  "assumption",
  "economics",
  "cultural",
  "regulatory",
  "synergy",
  "scenario",
  "document_analysis",
  "ic_memo",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface RecommendationEvidence {
  kind: EvidenceKind;
  /** Primary key in that kind's table. For "economics" this is the
   *  deal_economics row id (one per deal), not the deal id. */
  id: number;
  /** Denormalised one-liner captured at LINK time. The card renders from this
   *  without a round-trip, and a citation still reads sensibly after the source
   *  row is deleted — a live resolve returns `missing: true` instead of a hole. */
  label?: string;
}

export const COUNTERARGUMENT_WEIGHTS = ["minor", "material", "fatal"] as const;
export type CounterargumentWeight = (typeof COUNTERARGUMENT_WEIGHTS)[number];

export interface Counterargument {
  point: string;
  weight: CounterargumentWeight;
  /** How the recommender answers it. Absent/blank = unanswered. A `fatal`
   *  counterargument with no response blocks acceptance (see canAccept). */
  response?: string | null;
}

// ─── Confidence ──────────────────────────────────────────────────────────────
// Stored as an integer 0-100; the band is DERIVED, never stored. Same split as
// assumptions.result.optimismScore + src/lib/severity.ts — one number on the
// row, one pure function deciding what it means, so the card, the filter and
// any future gate cannot drift apart.

export const CONFIDENCE_BANDS = ["low", "medium", "high"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

/** Band floors. Named so nothing hard-codes 40/70 a second time. */
export const CONFIDENCE_MEDIUM_MIN = 40;
export const CONFIDENCE_HIGH_MIN = 70;

/**
 * The band a confidence score falls in. Clamped and rounded, so a hand-typed
 * 105 or a model-returned 72.4 cannot produce an undefined band — every caller
 * renders whatever comes back, so this function may never return undefined.
 */
export function confidenceBand(score: number): ConfidenceBand {
  if (!Number.isFinite(score)) return "low";
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= CONFIDENCE_HIGH_MIN) return "high";
  if (s >= CONFIDENCE_MEDIUM_MIN) return "medium";
  return "low";
}

export const CONFIDENCE_BAND_LABELS: Record<ConfidenceBand, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export const RECOMMENDATION_STATUS_LABELS: Record<RecommendationStatus, string> = {
  draft: "Draft",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded",
};

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  assumption: "Assumption",
  economics: "Economics",
  cultural: "Cultural",
  regulatory: "Regulatory",
  synergy: "Synergy",
  scenario: "Scenario",
  document_analysis: "Document",
  ic_memo: "IC memo",
};

export const COUNTERARGUMENT_WEIGHT_LABELS: Record<CounterargumentWeight, string> = {
  minor: "Minor",
  material: "Material",
  fatal: "Fatal",
};

// ─── Evidence helpers ────────────────────────────────────────────────────────

/** Evidence counts per kind, in EVIDENCE_KINDS order, zero-count kinds dropped.
 *  Drives the card's chip row without the component doing any bookkeeping. */
export function evidenceCounts(
  evidence: readonly RecommendationEvidence[],
): { kind: EvidenceKind; count: number }[] {
  const seen = new Map<EvidenceKind, number>();
  for (const e of evidence) seen.set(e.kind, (seen.get(e.kind) ?? 0) + 1);
  return EVIDENCE_KINDS.filter((k) => seen.has(k)).map((k) => ({ kind: k, count: seen.get(k)! }));
}

/** "3 analyses across 2 sources" — the card's one-line evidence summary. */
export function evidenceSummary(evidence: readonly RecommendationEvidence[]): string {
  const kinds = evidenceCounts(evidence);
  if (kinds.length === 0) return "No linked analyses";
  const n = evidence.length;
  return (
    `${n} analys${n === 1 ? "is" : "es"} across ` +
    `${kinds.length} source${kinds.length === 1 ? "" : "s"}`
  );
}

/** Duplicate citations are a data smell (the AI drafter repeats itself). This is
 *  the canonical de-dupe every write path runs before insert. First one wins, so
 *  the order the recommender chose survives. */
export function dedupeEvidence(
  evidence: readonly RecommendationEvidence[],
): RecommendationEvidence[] {
  const seen = new Set<string>();
  const out: RecommendationEvidence[] = [];
  for (const e of evidence) {
    const key = `${e.kind}:${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// ─── Counterarguments ────────────────────────────────────────────────────────

/** Counterarguments the recommender has not answered. */
export function unansweredCounterarguments(
  rows: readonly Counterargument[],
): Counterargument[] {
  return rows.filter((c) => !c.response?.trim());
}

/**
 * Whether a recommendation may be accepted. This is the integrity rule of the
 * feature, and the reason counterarguments are structured rather than a text
 * blob: you may accept a claim with unanswered MINOR or MATERIAL objections —
 * that is a judgement call and it is on the record — but a FATAL objection you
 * have not answered is not a judgement, it is an omission.
 *
 * Same shape of rule as blocksAdvancement in contracts/assumption-gate.ts:
 * pure, structural, and enforced on BOTH sides so the button and the server
 * cannot disagree about whether Accept is available.
 */
export function canAccept(rows: readonly Counterargument[]): boolean {
  return !unansweredCounterarguments(rows).some((c) => c.weight === "fatal");
}

/** The one sentence shown when acceptance is blocked, server- and client-side. */
export function acceptBlockedMessage(rows: readonly Counterargument[]): string {
  const n = unansweredCounterarguments(rows).filter((c) => c.weight === "fatal").length;
  return (
    `${n} fatal counterargument${n === 1 ? "" : "s"} ${n === 1 ? "has" : "have"} no response. ` +
    `Answer ${n === 1 ? "it" : "them"} before accepting this recommendation.`
  );
}
