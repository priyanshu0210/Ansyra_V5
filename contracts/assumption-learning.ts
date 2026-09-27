// ─────────────────────────────────────────────────────────────────────────────
// Cross-deal assumption learning (Phase 15.15) — failure-patterns' sibling, one
// layer further down the decision engine.
//
// 15.10 asks "are our wrong CONCLUSIONS shaped alike?". This asks the harder
// question underneath it: which of our CLAIMS ABOUT THE WORLD keep turning out
// wrong, regardless of what we concluded from them. A recommendation is a
// judgement and can be wrong for good reasons; an assumption is a bet on the
// world, and a category of assumption that keeps breaking is a bias.
//
// The axis is `category`, not evidence kind. That is the one place this differs
// from foldPatterns, and it is why the column exists: an assumption's statement
// is free text, and free text cannot be grouped. See the migration comment.
//
// SAME CONSERVATISM AS 15.10, for the same reason. A median degrades gracefully
// at N=3 — it is still the middle number. A rate does not: "100% of
// revenue-retention assumptions failed (1 of 1)" is not a weak claim, it is a
// false one. So clusters below the floors are SUPPRESSED ENTIRELY rather than
// shown with a caveat, and "other" never produces a topic claim at all.
//
// Pure. Unit-tested in contracts/assumption-learning.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ASSUMPTION_CATEGORY_LABELS,
  type AssumptionCategory,
} from "./assumption-ledger";
import { SCHEDULED_HORIZON_PHRASE, type ScheduledHorizon } from "./outcome-schedule";

/** Total reads in a cluster before it may be called anything. */
export const MIN_ASSUMPTION_SUPPORT = 4;
/** Contradicted reads before a cluster is a finding rather than a coincidence. */
export const MIN_CONTRADICTED = 2;
/** Above the floors but below this, shown with the comps-style low-sample line. */
export const LOW_ASSUMPTION_SAMPLE = 8;

/**
 * One GROUP BY cell as the SQL returns it: (category, horizon, outcome_type).
 *
 * The transport shape, so the fold is testable over fixtures with no database —
 * exactly the posture PatternCell established.
 */
export interface AssumptionCell {
  category: string;
  horizon: string | null;
  outcomeType: string;
  n: number;
  exampleAssumptionIds?: readonly number[];
}

export interface AssumptionFinding {
  findingId: string;
  category: AssumptionCategory;
  categoryLabel: string;
  horizon: ScheduledHorizon;
  /** Reads that contradicted the assumption outright. Partial misses are NOT
   *  in here — see isAgainstAssumption. */
  contradictedCount: number;
  /** "Right in direction, wrong in degree" — a real miss, but not a
   *  contradiction, so it is reported beside the rate rather than inside it. */
  partiallyHeldCount: number;
  /** Every read in the cluster, including the ones that held. */
  supportingCount: number;
  /** contradicted / supporting, rounded to 3dp. */
  rate: number;
  severity: "acute" | "elevated" | "noted";
  lowSample: boolean;
  description: string;
}

/**
 * `category:horizon` — e.g. "revenue_retention:post_close".
 *
 * Readable rather than hashed, the same call patternId makes: both halves are
 * short, enumerable and meaningful, and a hash makes every debugging session
 * worse.
 */
export function assumptionFindingId(category: string, horizon: string): string {
  return `${category}:${horizon}`;
}

/**
 * Did this read contradict the assumption?
 *
 * ONLY `contradicted`, and the exclusion of `partially_held` is deliberate.
 * OUTCOME_SIGNAL is not the right map to reuse here: its own docblock says it
 * decides "which severity token tints the chip", and it files partially_held as
 * neutral. Borrowing a presentation map as a correctness verdict would make the
 * headline depend on a styling decision.
 *
 * The sentence this fold produces says "contradicted in N of M reads", so N must
 * be reads that were actually contradicted. `partially_held` — "right in
 * direction, wrong in degree" — is a real miss but not that claim, so it stays
 * in the denominator and is carried separately as `partiallyHeldCount` rather
 * than being quietly folded into the number a partner will quote.
 */
export function isAgainstAssumption(outcomeType: string): boolean {
  return outcomeType === "contradicted";
}

/** Right in direction, wrong in degree. Counted, never hidden, never conflated
 *  with a contradiction. */
export function isPartialMiss(outcomeType: string): boolean {
  return outcomeType === "partially_held";
}

/** A read that says nothing about whether the assumption was right. */
export function isInconclusive(outcomeType: string): boolean {
  return outcomeType === "too_early" || outcomeType === "moot";
}

function severityOf(rate: number): AssumptionFinding["severity"] {
  if (rate >= 0.6) return "acute";
  if (rate >= 0.35) return "elevated";
  return "noted";
}

function describe(f: Omit<AssumptionFinding, "description">): string {
  return (
    `${f.categoryLabel} assumptions were contradicted in ` +
    `${f.contradictedCount} of ${f.supportingCount} ${SCHEDULED_HORIZON_PHRASE[f.horizon]} reads.`
  );
}

/**
 * Fold cells into findings.
 *
 * Two exclusions are load-bearing and neither is cosmetic:
 *
 *   - `other` is dropped. It is the catch-all for anything the six real
 *     categories would misfile plus every row written before 15.15, so a claim
 *     about "other assumptions" would be a claim about an incoherent set.
 *   - unscheduled/absent horizons are dropped. "Contradicted in 4 of 7 reads"
 *     only means something if the reads are comparable, and an ad-hoc read
 *     taken whenever someone felt like it is not comparable to a 6-month one.
 *
 * Inconclusive reads (too_early, moot) leave the denominator too — see
 * isInconclusive.
 */
export function foldAssumptionFindings(cells: readonly AssumptionCell[]): AssumptionFinding[] {
  const groups = new Map<string, { contradicted: number; partial: number; total: number }>();

  for (const c of cells) {
    if (c.category === "other") continue;
    if (!(c.category in ASSUMPTION_CATEGORY_LABELS)) continue;
    if (!c.horizon || !(c.horizon in SCHEDULED_HORIZON_PHRASE)) continue;
    if (isInconclusive(c.outcomeType)) continue;

    const key = assumptionFindingId(c.category, c.horizon);
    const g = groups.get(key) ?? { contradicted: 0, partial: 0, total: 0 };
    g.total += c.n;
    if (isAgainstAssumption(c.outcomeType)) g.contradicted += c.n;
    if (isPartialMiss(c.outcomeType)) g.partial += c.n;
    groups.set(key, g);
  }

  const out: AssumptionFinding[] = [];
  for (const [key, g] of groups) {
    if (g.total < MIN_ASSUMPTION_SUPPORT) continue; // too little to say anything
    if (g.contradicted < MIN_CONTRADICTED) continue; // a coincidence, not a finding

    const [category, horizon] = key.split(":") as [AssumptionCategory, ScheduledHorizon];
    const rate = Math.round((g.contradicted / g.total) * 1000) / 1000;
    const base = {
      findingId: key,
      category,
      categoryLabel: ASSUMPTION_CATEGORY_LABELS[category],
      horizon,
      contradictedCount: g.contradicted,
      partiallyHeldCount: g.partial,
      supportingCount: g.total,
      rate,
      severity: severityOf(rate),
      lowSample: g.total < LOW_ASSUMPTION_SAMPLE,
    };
    out.push({ ...base, description: describe(base) });
  }

  // Total order, so two runs over the same data are byte-identical.
  return out.sort(
    (a, b) =>
      b.contradictedCount - a.contradictedCount ||
      b.rate - a.rate ||
      b.supportingCount - a.supportingCount ||
      a.findingId.localeCompare(b.findingId),
  );
}

/**
 * The line under a finding when the sample is thin. Null when it is not.
 *
 * Same formula and same tone as CompsTable's low-sample note: state the fact,
 * say what it means for reading the number, do not nag.
 */
export function lowSampleNote(f: AssumptionFinding): string | null {
  if (!f.lowSample) return null;
  return `Based on ${f.supportingCount} reads — directional, not conclusive.`;
}

// ─── The drafter's block (Phase 15.16) ───────────────────────────────────────

/**
 * The label is deliberately NOT of the form `cite as {"kind":…}`.
 *
 * ai-mock scans the prompt for citable ids with `\}:\n  - \[id=(\d+)\]`, so a
 * header in that shape followed by `  - ` lines would inject a phantom citation
 * offer and let the mock "cite" an analysis that was never supplied. Same
 * constraint PATTERN_BLOCK_LABEL documents, for the same reason.
 *
 * It also says whose ledger this is. The model has general knowledge about
 * M&A assumptions failing; this block is specifically the firm's own recorded
 * history, and conflating the two would let a general prior be reported back as
 * evidence about this firm.
 */
export const ASSUMPTION_BLOCK_LABEL =
  "Where this firm's own ASSUMPTIONS have failed before (its recorded assumption ledger, not general knowledge) — limited to categories this deal actually relies on";

/**
 * The drafter's assumption block, byte for byte.
 *
 * Reproduces ai-router's local `block()` shape — `${label}:\n${items}` with
 * "  (none on file)" when empty — because that shape is the contract both the
 * prompt and the mock read. Extracted here so the prompt is assertable without
 * a database or a tRPC context.
 */
export function assumptionHintBlock(findings: readonly AssumptionFinding[]): string {
  const items = findings.map(
    (f) => `  - ${f.description}${f.lowSample ? " [low sample — indicative only]" : ""}`,
  );
  return `${ASSUMPTION_BLOCK_LABEL}:\n${items.length ? items.join("\n") : "  (none on file)"}`;
}

/**
 * Narrow firm-wide findings to the ones this deal can actually act on.
 *
 * A finding about financing assumptions is noise on a deal that has none, and
 * noise in a prompt is not free: it dilutes the block the model is meant to
 * weigh and invites it to invent a financing angle to match. Mirrors
 * relevantPatterns(patterns, stage), which narrows by stage for the same reason.
 *
 * Input is already in total order from foldAssumptionFindings, so this only
 * filters and caps — never re-sorts, which would break the byte-stability that
 * makes the prompt assertable.
 */
export function relevantFindings(
  findings: readonly AssumptionFinding[],
  dealCategories: readonly string[],
  limit = 5,
): AssumptionFinding[] {
  if (dealCategories.length === 0) return [];
  const present = new Set(dealCategories);
  return findings.filter((f) => present.has(f.category)).slice(0, limit);
}
