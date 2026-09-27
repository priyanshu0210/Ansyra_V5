// ─────────────────────────────────────────────────────────────────────────────
// Time-phased synergy math (Phase 15.6). "Did we capture $12M yet?" is
// meaningless without "by when" — a category can be on plan cumulatively while
// a specific quarter has slipped badly. All sums/variances are computed here,
// never by the AI: synergyAnalysis receives these figures as DATA and narrates
// them. Pure + unit-tested (contracts/synergy.test.ts).
//
// BACKWARD COMPATIBILITY: `periods` is optional. A category with no periods keeps
// behaving exactly as it did before 15.6 (flat planned/actual numbers), so every
// synergy plan saved before this phase still loads and analyses unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export interface SynergyPeriod {
  quarter: string; // "2026-Q3"
  planned: number;
  actual: number;
}

export interface PhasedCategory {
  category: string;
  planned: number;
  actual: number;
  periods?: SynergyPeriod[];
}

export const QUARTER_RE = /^\d{4}-Q[1-4]$/;

export function isValidQuarter(q: string): boolean {
  return QUARTER_RE.test(q.trim());
}

/** Sortable key for a quarter label ("2026-Q3" → 20263). */
export function quarterKey(q: string): number {
  const m = /^(\d{4})-Q([1-4])$/.exec(q.trim());
  return m ? Number(m[1]) * 10 + Number(m[2]) : 0;
}

export function sortPeriods(periods: SynergyPeriod[]): SynergyPeriod[] {
  return [...periods].sort((a, b) => quarterKey(a.quarter) - quarterKey(b.quarter));
}

/** True when duplicate quarter labels appear (rejected on save). */
export function hasDuplicateQuarters(periods: SynergyPeriod[]): boolean {
  const seen = new Set<string>();
  for (const p of periods) {
    const k = p.quarter.trim();
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Category totals. When periods exist they are AUTHORITATIVE — the totals are
 * their sums, so the UI can't drift from the phasing. Without periods the
 * category's own flat numbers stand (pre-15.6 behaviour).
 */
export function categoryTotals(c: PhasedCategory): { planned: number; actual: number } {
  const periods = c.periods ?? [];
  if (periods.length === 0) {
    return { planned: round2(c.planned || 0), actual: round2(c.actual || 0) };
  }
  return {
    planned: round2(periods.reduce((s, p) => s + (p.planned || 0), 0)),
    actual: round2(periods.reduce((s, p) => s + (p.actual || 0), 0)),
  };
}

/** Variance % of actual vs planned. Null when planned is 0 (no baseline). */
export function variancePct(planned: number, actual: number): number | null {
  if (!planned) return null;
  const result = Math.round(((actual - planned) / planned) * 1000) / 10;
  return Number.isFinite(result) ? result : null;
}

export interface PeriodVariance extends SynergyPeriod {
  variancePct: number | null;
  cumulativePlanned: number;
  cumulativeActual: number;
  cumulativeVariancePct: number | null;
}

/**
 * Per-quarter variance plus running cumulative totals — this is what makes the
 * engine an early-warning system rather than a scoreboard: a category can be fine
 * cumulatively while one quarter is clearly behind.
 */
export function periodVariances(periods: SynergyPeriod[]): PeriodVariance[] {
  let cp = 0;
  let ca = 0;
  return sortPeriods(periods).map((p) => {
    cp = round2(cp + (p.planned || 0));
    ca = round2(ca + (p.actual || 0));
    return {
      ...p,
      variancePct: variancePct(p.planned || 0, p.actual || 0),
      cumulativePlanned: cp,
      cumulativeActual: ca,
      cumulativeVariancePct: variancePct(cp, ca),
    };
  });
}

/** The single worst-slipping quarter, for the "watch this" callout. */
export function worstQuarter(periods: SynergyPeriod[]): PeriodVariance | null {
  const withVar = periodVariances(periods).filter((p) => p.variancePct != null);
  if (withVar.length === 0) return null;
  return withVar.reduce((worst, p) => (p.variancePct! < worst.variancePct! ? p : worst));
}

/** A compact per-category line the AI prompt can narrate (never re-sum). */
export function phasingSummaryLine(c: PhasedCategory): string {
  const t = categoryTotals(c);
  const v = variancePct(t.planned, t.actual);
  const base = `${c.category}: planned ${t.planned}M, actual ${t.actual}M${v == null ? "" : ` (${v > 0 ? "+" : ""}${v}%)`}`;
  const periods = c.periods ?? [];
  if (periods.length === 0) return `${base} [unphased]`;
  const detail = periodVariances(periods)
    .map((p) => `${p.quarter} ${p.actual}/${p.planned}M${p.variancePct == null ? "" : ` (${p.variancePct > 0 ? "+" : ""}${p.variancePct}%)`}`)
    .join(", ");
  const worst = worstQuarter(periods);
  return `${base} | by quarter: ${detail}${worst ? ` | weakest quarter: ${worst.quarter}` : ""}`;
}
