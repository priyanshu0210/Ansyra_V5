// ─────────────────────────────────────────────────────────────────────────────
// Forecast vs actual (Phase 15.20) — did the case call it right?
//
// THE WHOLE POINT: this needs no new storage. A scenario driver already states
// a forecast about one assumption — `holds` / `breaks` / `exceeds` — and since
// 15.15 that assumption has an append-only ledger saying what actually happened.
// Those two facts sat one join apart and were never compared.
//
// So a "post-close actuals model" is not what was missing. Synergy plans have
// carried planned-vs-actual per category and per quarter since 15.6,
// deal_economics.realized carries the exit, and the two outcome ledgers carry
// the narrative. What was missing is the COMPARISON, and it is derivable.
//
// The comparison is deliberately scoped to what the data can support. A driver
// direction is an ordinal claim about one assumption, so the verdicts here are
// ordinal too: was the case right, too optimistic, or too pessimistic. There is
// no "delayed" verdict, because nothing in a ScenarioCase carries a date to be
// late against — inventing one would be exactly the fabricated column that
// contracts/scenarios.ts refuses.
//
// Pure. Unit-tested in contracts/forecast-actual.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { DriverDirection, Scenario } from "./scenarios";
import { SCENARIO_CASE_LABELS, type ScenarioCaseName } from "./scenarios";

/**
 * How a forecast turned out.
 *
 * Chosen to sit BESIDE the outcome vocabulary rather than compete with it:
 * OUTCOME_TYPES says what happened to a claim, this says whether the forecast
 * about it was right. The brief's "missed high / missed low" map onto
 * optimistic / pessimistic, which is the direction language a partner uses.
 */
export const FORECAST_VERDICTS = [
  "matched", // the case called this driver correctly
  "too_optimistic", // the case expected better than reality delivered
  "too_pessimistic", // the case expected worse than reality delivered
  "partial", // right in direction, wrong in degree
  "inconclusive", // read, but it cannot yet be judged (too_early / moot)
  "unread", // nobody has looked, so there is nothing to compare
] as const;
export type ForecastVerdict = (typeof FORECAST_VERDICTS)[number];

export const FORECAST_VERDICT_LABELS: Record<ForecastVerdict, string> = {
  matched: "Called it",
  too_optimistic: "Too optimistic",
  too_pessimistic: "Too pessimistic",
  partial: "Partly right",
  inconclusive: "Not yet judgeable",
  unread: "Not read back",
};

/** Only the first four are evidence about forecast quality. `inconclusive` and
 *  `unread` are excluded from every rate below — counting "nobody looked" as a
 *  hit or a miss is how a scoreboard starts lying. */
export function isJudgeable(v: ForecastVerdict): boolean {
  return v === "matched" || v === "too_optimistic" || v === "too_pessimistic" || v === "partial";
}

/**
 * One driver's forecast against one recorded outcome.
 *
 * The matrix, stated rather than inferred:
 *
 *   forecast   actual=held        actual=contradicted   actual=partially_held
 *   holds      matched            too_optimistic        partial
 *   breaks     too_pessimistic    matched               partial
 *   exceeds    too_optimistic*    too_optimistic        too_optimistic
 *
 * (*) `exceeds` claims BETTER than merely holding. An assumption that merely
 * held did not exceed, so the case was optimistic about it — right about the
 * direction, wrong about the degree, and the honest word for that is optimistic
 * rather than matched. This is the one cell worth arguing about, and it is
 * settled toward not flattering the forecast.
 */
export function verdictFor(
  direction: DriverDirection,
  outcomeType: string | null | undefined,
): ForecastVerdict {
  if (!outcomeType) return "unread";
  if (outcomeType === "too_early" || outcomeType === "moot") return "inconclusive";

  if (outcomeType === "partially_held") {
    // Right in direction, wrong in degree — except for `exceeds`, which was
    // already claiming more than "held" and got less than it.
    return direction === "exceeds" ? "too_optimistic" : "partial";
  }

  if (outcomeType === "held") {
    if (direction === "holds") return "matched";
    if (direction === "breaks") return "too_pessimistic";
    return "too_optimistic"; // exceeds, but it only held
  }

  if (outcomeType === "contradicted") {
    if (direction === "breaks") return "matched";
    return "too_optimistic"; // holds or exceeds, and it broke
  }

  // An outcome type outside the shipped vocabulary: judge nothing.
  return "inconclusive";
}

export interface DriverForecast {
  assumption: string;
  assumptionId: number | null;
  direction: DriverDirection;
  outcomeType: string | null;
  verdict: ForecastVerdict;
  verdictLabel: string;
}

export interface ScenarioAccuracy {
  scenarioId: string;
  caseName: ScenarioCaseName;
  caseLabel: string;
  drivers: DriverForecast[];
  /** Drivers that could actually be judged. The denominator of every rate. */
  judgeable: number;
  matched: number;
  tooOptimistic: number;
  tooPessimistic: number;
  partial: number;
  /** matched / judgeable, to 3dp. Null when nothing is judgeable — NEVER 0,
   *  which would read as "this case was wrong about everything". */
  hitRate: number | null;
}

export interface AssumptionOutcomeRef {
  assumptionId: number;
  outcomeType: string;
  recordedAt: Date | string;
}

/**
 * Score one case against the assumption ledger.
 *
 * Uses the LATEST read per assumption, for the reason latestGlimpse gives: a
 * claim that held at 30 days and broke at 90 is contradicted, and scoring the
 * first read would flatter every forecast that was briefly right.
 *
 * A driver with no resolved assumptionId scores `unread` and leaves the
 * denominator — the generator named something the ledger does not hold, so
 * there is nothing to have been right or wrong about.
 */
export function scoreScenario(
  scenario: Scenario,
  outcomes: readonly AssumptionOutcomeRef[],
): ScenarioAccuracy {
  const latest = new Map<number, AssumptionOutcomeRef>();
  for (const o of outcomes) {
    const prev = latest.get(o.assumptionId);
    if (!prev || new Date(o.recordedAt).getTime() >= new Date(prev.recordedAt).getTime()) {
      latest.set(o.assumptionId, o);
    }
  }

  const drivers: DriverForecast[] = scenario.drivers.map((d) => {
    const actual = d.assumptionId === null ? null : (latest.get(d.assumptionId)?.outcomeType ?? null);
    const verdict = verdictFor(d.direction, actual);
    return {
      assumption: d.assumption,
      assumptionId: d.assumptionId,
      direction: d.direction,
      outcomeType: actual,
      verdict,
      verdictLabel: FORECAST_VERDICT_LABELS[verdict],
    };
  });

  const judgeable = drivers.filter((d) => isJudgeable(d.verdict)).length;
  const count = (v: ForecastVerdict) => drivers.filter((d) => d.verdict === v).length;
  const matched = count("matched");

  return {
    scenarioId: scenario.id,
    caseName: scenario.caseName,
    caseLabel: SCENARIO_CASE_LABELS[scenario.caseName],
    drivers,
    judgeable,
    matched,
    tooOptimistic: count("too_optimistic"),
    tooPessimistic: count("too_pessimistic"),
    partial: count("partial"),
    hitRate: judgeable === 0 ? null : Math.round((matched / judgeable) * 1000) / 1000,
  };
}

/** The one line a reader wants. Null when nothing is judgeable, so the UI stays
 *  quiet rather than printing "0 of 0". */
export function accuracyLabel(a: ScenarioAccuracy): string | null {
  if (a.judgeable === 0) return null;
  return `${a.caseLabel} called ${a.matched} of ${a.judgeable} drivers right.`;
}

// ─── Cross-deal: which case class is most reliable (Part 3) ──────────────────
//
// Third sibling of foldPatterns (15.10) and foldAssumptionFindings (15.15), and
// the same conservatism for the same reason: a rate does not degrade gracefully
// at small N. "Downside cases called it 100% right (1 of 1)" is not a weak
// claim, it is a false one, so clusters below the floors are SUPPRESSED rather
// than caveated.

/** Judged drivers in a case class before it may be scored at all. */
export const MIN_BENCHMARK_JUDGED = 6;
/** Distinct scenarios contributing, so one talkative deal cannot make a claim. */
export const MIN_BENCHMARK_SCENARIOS = 3;
/** Above the floors but below this, carries the comps-style hedge. */
export const LOW_BENCHMARK_SAMPLE = 12;

/** One cell as the caller aggregates it: a case class on one deal's run. */
export interface BenchmarkCell {
  caseName: string;
  judged: number;
  matched: number;
  tooOptimistic: number;
  tooPessimistic: number;
}

export interface BenchmarkFinding {
  caseName: ScenarioCaseName;
  caseLabel: string;
  scenarios: number;
  judged: number;
  matched: number;
  hitRate: number;
  /** Which way this class errs when it is wrong. Null when it never was. */
  leans: "optimistic" | "pessimistic" | null;
  lowSample: boolean;
  description: string;
}

export function foldBenchmark(cells: readonly BenchmarkCell[]): BenchmarkFinding[] {
  const groups = new Map<
    string,
    { scenarios: number; judged: number; matched: number; opt: number; pess: number }
  >();

  for (const c of cells) {
    if (!(c.caseName in SCENARIO_CASE_LABELS)) continue;
    if (c.judged <= 0) continue; // a case nobody could judge is not a data point
    const g = groups.get(c.caseName) ?? { scenarios: 0, judged: 0, matched: 0, opt: 0, pess: 0 };
    g.scenarios += 1;
    g.judged += c.judged;
    g.matched += c.matched;
    g.opt += c.tooOptimistic;
    g.pess += c.tooPessimistic;
    groups.set(c.caseName, g);
  }

  const out: BenchmarkFinding[] = [];
  for (const [caseName, g] of groups) {
    if (g.judged < MIN_BENCHMARK_JUDGED) continue;
    if (g.scenarios < MIN_BENCHMARK_SCENARIOS) continue;

    const hitRate = Math.round((g.matched / g.judged) * 1000) / 1000;
    const leans = g.opt === g.pess ? null : g.opt > g.pess ? "optimistic" : "pessimistic";
    const label = SCENARIO_CASE_LABELS[caseName as ScenarioCaseName];
    const finding: BenchmarkFinding = {
      caseName: caseName as ScenarioCaseName,
      caseLabel: label,
      scenarios: g.scenarios,
      judged: g.judged,
      matched: g.matched,
      hitRate,
      leans,
      lowSample: g.judged < LOW_BENCHMARK_SAMPLE,
      description:
        `${label} cases called ${g.matched} of ${g.judged} drivers right ` +
        `across ${g.scenarios} scenario${g.scenarios === 1 ? "" : "s"}` +
        (leans ? `, erring ${leans} when wrong.` : "."),
    };
    out.push(finding);
  }

  // Most reliable first, then most evidence. Total order, so two runs over the
  // same data are byte-identical.
  return out.sort(
    (a, b) => b.hitRate - a.hitRate || b.judged - a.judged || a.caseName.localeCompare(b.caseName),
  );
}

/** Sober, and only when there is something to compare. Deliberately states the
 *  gap rather than declaring a winner from two close numbers. */
export function benchmarkHeadline(findings: readonly BenchmarkFinding[]): string | null {
  if (findings.length < 2) return null;
  const best = findings[0];
  const worst = findings[findings.length - 1];
  if (best.hitRate === worst.hitRate) return null;
  const gap = Math.round((best.hitRate - worst.hitRate) * 100);
  if (gap < 10) return null; // too close to call anything
  return `${best.caseLabel} cases have been closer to what happened than ${worst.caseLabel.toLowerCase()} cases, by ${gap} points.`;
}

/** The comps-style hedge, verbatim in tone. Null when the sample is real. */
export function benchmarkLowSampleNote(f: BenchmarkFinding): string | null {
  if (!f.lowSample) return null;
  return `Based on ${f.judged} judged drivers — directional, not conclusive.`;
}
