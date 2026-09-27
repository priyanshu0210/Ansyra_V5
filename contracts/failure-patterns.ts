// Failure patterns (Phase 15.10) — the pure layer between a SQL aggregate and a
// sentence a partner will read.
//
// 15.9 gave the product a ledger of what actually happened to its conclusions,
// and isHighSignal — the predicate naming the two combinations where the firm's
// judgement was demonstrably wrong. This asks the next question: are those
// mistakes shaped alike?
//
// The topic axis is DERIVED from supporting_evidence[].kind. There is no
// category column and no AI classification: kind and counterargument weight are
// the only machine-readable axes the schema actually has, and a derived axis
// cannot drift from the row it was derived from.
//
// Nothing here knows about the database or the network. Unit-tested in
// contracts/failure-patterns.test.ts, which is where the whole engine is proven
// — the SQL only feeds it cells.

import {
  EVIDENCE_KIND_LABELS,
  type ConfidenceBand,
  type EvidenceKind,
} from "./recommendations";
import { isHighSignal, type OutcomeHorizon } from "./outcomes";

/**
 * A horizon that may be absent on the row.
 *
 * Deliberately NOT folded into "ad_hoc": ad-hoc is a reading someone chose to
 * take outside a schedule; unspecified is a reading nobody labelled. Conflating
 * them would be a lie in a feature whose whole premise is honest counting.
 */
export type PatternHorizon = OutcomeHorizon | "unspecified";

/** One GROUP BY cell as the SQL returns it. The transport shape — so the fold
 *  below is testable over fixtures with no database anywhere near it. */
export interface PatternCell {
  kind: string;
  stage: string;
  band: ConfidenceBand;
  horizon: PatternHorizon;
  recStatus: string;
  outcomeType: string;
  n: number;
  exampleRecommendationIds: number[];
}

export const PATTERN_SEVERITIES = ["noted", "elevated", "acute"] as const;
export type PatternSeverity = (typeof PATTERN_SEVERITIES)[number];

export interface FailurePattern {
  /** "regulatory:diligence:high:6_month" — deterministic, human-readable and
   *  stable across runs. Deliberately not a hash: the axes are short and
   *  enumerable, and a hash makes every debugging session worse. */
  patternId: string;
  kind: EvidenceKind;
  stage: string;
  band: ConfidenceBand;
  horizon: PatternHorizon;
  /** Which side of isHighSignal dominates: "accepted" (accepted, then
   *  contradicted) or "rejected" (rejected, then it held). */
  direction: "accepted" | "rejected";
  /** Reads that went against the firm, out of `supportingCount` total reads. */
  highSignalCount: number;
  supportingCount: number;
  /** highSignalCount / supportingCount, 0-1, rounded to 3dp. */
  rate: number;
  severity: PatternSeverity;
  /** Above MIN_PATTERN_SUPPORT but below LOW_CONFIDENCE_SAMPLE — shown, but
   *  flagged. The comps posture, once a cluster has cleared the floor at all. */
  lowSample: boolean;
  exampleRecommendationIds: number[];
  description: string;
}

// ─── The floors ──────────────────────────────────────────────────────────────
// comps-router.ts shows a median at N=3 with a flag and never suppresses,
// because a median degrades gracefully — it is still the middle number. A
// PATTERN does not: "100% failure rate (1 of 1)" is not a weak claim, it is a
// false one, and a product whose position is that it does not assert what it
// cannot back should not print it. So patterns get the stricter treatment:
// below the floor they do not appear at all.

/** Total reads a cluster needs before it is called a pattern. */
export const MIN_PATTERN_SUPPORT = 3;

/** …and at least this many must actually have gone wrong. "1 of 3" is a
 *  coincidence with a percentage attached. */
export const MIN_HIGH_SIGNAL = 2;

/** Above the floor but below this, the card carries the low-sample line. */
export const LOW_CONFIDENCE_SAMPLE = 6;

export const PATTERN_SEVERITY_ELEVATED_MIN = 0.25;
export const PATTERN_SEVERITY_ACUTE_MIN = 0.5;

export function patternSeverity(rate: number): PatternSeverity {
  if (!Number.isFinite(rate)) return "noted";
  if (rate >= PATTERN_SEVERITY_ACUTE_MIN) return "acute";
  if (rate >= PATTERN_SEVERITY_ELEVATED_MIN) return "elevated";
  return "noted";
}

export const PATTERN_SEVERITY_LABELS: Record<PatternSeverity, string> = {
  noted: "Noted",
  elevated: "Elevated",
  acute: "Acute",
};

export function patternId(
  kind: string,
  stage: string,
  band: string,
  horizon: string,
): string {
  return `${kind}:${stage}:${band}:${horizon}`;
}

// ─── Description ─────────────────────────────────────────────────────────────

/** Sentence-position phrasing. OUTCOME_HORIZON_LABELS are chip labels
 *  ("30-day read") and read badly after a numeral; this is prose, not a second
 *  definition of the enum. */
const HORIZON_PHRASE: Record<PatternHorizon, string> = {
  "30_day": "thirty-day reads",
  "90_day": "ninety-day reads",
  "6_month": "six-month reads",
  post_close: "post-close reads",
  ad_hoc: "ad-hoc reads",
  unspecified: "recorded reads",
};

/** Lowercased kind labels for sentence position, borrowed from the one map that
 *  already exists. "IC memo" keeps its capitals; nothing else has any. */
const KIND_PHRASE: Record<string, string> = Object.fromEntries(
  Object.entries(EVIDENCE_KIND_LABELS).map(([k, v]) => [
    k,
    k === "ic_memo" ? v : v.toLowerCase(),
  ]),
);

/** "Accepted regulatory recommendations at diligence with high confidence were
 *   contradicted in 4 of 6 six-month reads." */
export function describePattern(p: Omit<FailurePattern, "description">): string {
  const subject =
    `${p.direction === "accepted" ? "Accepted" : "Rejected"} ` +
    `${KIND_PHRASE[p.kind] ?? p.kind} recommendations at ${p.stage} ` +
    `with ${p.band} confidence`;
  const verb =
    p.direction === "accepted" ? "were contradicted" : "held after being rejected";
  return `${subject} ${verb} in ${p.highSignalCount} of ${p.supportingCount} ${HORIZON_PHRASE[p.horizon]}.`;
}

// ─── The engine ──────────────────────────────────────────────────────────────

/**
 * Cells → patterns. The whole engine, and the only place the counting rules
 * live. Takes plain cells rather than a db handle, so it is testable without
 * one.
 *
 * A recommendation citing three evidence kinds contributes one outcome to three
 * clusters. That is overlapping LENSES, not a partition — each pattern's claim
 * is scoped to "recommendations that cited <kind>" and is true exactly as
 * stated. The rule that follows: it is NEVER valid to sum supportingCount
 * across patterns and call it a firm total, which is why this function returns
 * no total and the UI shows no such tile.
 */
export function foldPatterns(cells: readonly PatternCell[]): FailurePattern[] {
  const byKey = new Map<
    string,
    {
      kind: string;
      stage: string;
      band: ConfidenceBand;
      horizon: PatternHorizon;
      total: number;
      accepted: number;
      rejected: number;
      ids: number[];
    }
  >();

  for (const c of cells) {
    const key = patternId(c.kind, c.stage, c.band, c.horizon);
    const g = byKey.get(key) ?? {
      kind: c.kind,
      stage: c.stage,
      band: c.band,
      horizon: c.horizon,
      total: 0,
      accepted: 0,
      rejected: 0,
      ids: [],
    };
    g.total += c.n;
    // THE one definition, read rather than restated — see the docblock on
    // isHighSignal, which says in as many words that it exists for this.
    if (isHighSignal(c.recStatus, c.outcomeType)) {
      if (c.recStatus === "accepted") g.accepted += c.n;
      else g.rejected += c.n;
      // Examples come only from cells that actually went wrong: a link labelled
      // "where this showed up" must lead to a misfire, not a success.
      for (const id of c.exampleRecommendationIds) {
        if (!g.ids.includes(id)) g.ids.push(id);
      }
    }
    byKey.set(key, g);
  }

  const out: FailurePattern[] = [];
  for (const [key, g] of byKey) {
    const highSignalCount = g.accepted + g.rejected;
    if (g.total < MIN_PATTERN_SUPPORT) continue; // not enough to say anything
    if (highSignalCount < MIN_HIGH_SIGNAL) continue; // a coincidence, not a pattern
    const rate = Math.round((highSignalCount / g.total) * 1000) / 1000;
    const base = {
      patternId: key,
      kind: g.kind as EvidenceKind,
      stage: g.stage,
      band: g.band,
      horizon: g.horizon,
      direction: (g.accepted >= g.rejected ? "accepted" : "rejected") as
        | "accepted"
        | "rejected",
      highSignalCount,
      supportingCount: g.total,
      rate,
      severity: patternSeverity(rate),
      lowSample: g.total < LOW_CONFIDENCE_SAMPLE,
      exampleRecommendationIds: g.ids.slice(0, 3),
    };
    out.push({ ...base, description: describePattern(base) });
  }
  return sortPatterns(out);
}

/** Most consequential first, and TOTAL-ordered so two runs over the same data
 *  produce byte-identical output — the drafter's prompt block depends on that,
 *  and a prompt that reshuffles between calls is a prompt you cannot debug. */
export function sortPatterns(
  patterns: readonly FailurePattern[],
): FailurePattern[] {
  return patterns
    .slice()
    .sort(
      (a, b) =>
        b.highSignalCount - a.highSignalCount ||
        b.rate - a.rate ||
        b.supportingCount - a.supportingCount ||
        a.patternId.localeCompare(b.patternId),
    );
}

/** The patterns worth putting in front of the drafter for a given stage. */
export function relevantPatterns(
  patterns: readonly FailurePattern[],
  stage: string,
  limit = 5,
): FailurePattern[] {
  return patterns.filter((p) => p.stage === stage).slice(0, limit);
}

/**
 * Does this recommendation sit inside a known pattern?
 *
 * HORIZON IS DELIBERATELY NOT MATCHED. A live recommendation has not been read
 * at any horizon yet — that is exactly why the advisory is worth showing at
 * all. Matching on it would make every advisory unreachable.
 *
 * `bandOf` is injected rather than imported so this module does not open a
 * second import edge for a value the caller already has — the same instinct as
 * injecting `now` into reviewStatus. Callers pass `confidenceBand`.
 */
export function matchesPattern(
  rec: {
    stage: string;
    confidence: number;
    supportingEvidence: readonly { kind: string }[];
  },
  pattern: Pick<FailurePattern, "kind" | "stage" | "band">,
  bandOf: (score: number) => ConfidenceBand,
): boolean {
  return (
    rec.stage === pattern.stage &&
    bandOf(rec.confidence) === pattern.band &&
    rec.supportingEvidence.some((e) => e.kind === pattern.kind)
  );
}

// ─── The drafter's prompt block ──────────────────────────────────────────────

/**
 * The block header the drafter puts above the pattern list.
 *
 * MUST NOT contain the substring `cite as {"kind":"…","id":<id>}`. ai-mock.ts
 * scans the prompt for exactly that shape to discover which ids it may cite, so
 * a header in that form followed by "  - " lines would inject a phantom
 * citation offer. A test asserts this.
 */
export const PATTERN_BLOCK_LABEL =
  "Where this firm's own recommendations have gone wrong before (its recorded outcome ledger, not general knowledge)";

/**
 * The drafter's pattern block, byte for byte.
 *
 * Reproduces ai-router's local `block()` shape — `${label}:\n${items}` with
 * "  (none on file)" when empty — because that shape is the contract both the
 * prompt and the mock read. Extracted here so the prompt is assertable without
 * a database or a tRPC context, which is the only way the repo's test posture
 * can cover it at all.
 */
export function patternHintBlock(patterns: readonly FailurePattern[]): string {
  const items = patterns.map(
    (p) =>
      `  - ${p.description}${p.lowSample ? " [low sample — indicative only]" : ""}`,
  );
  return `${PATTERN_BLOCK_LABEL}:\n${items.length ? items.join("\n") : "  (none on file)"}`;
}
