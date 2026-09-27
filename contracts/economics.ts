// ─────────────────────────────────────────────────────────────────────────────
// Deterministic deal-economics math (Phase 15.2). NEVER routed through AI —
// hallucinated arithmetic is a credibility kill. Shared FE/BE so the dossier
// previews exactly the numbers the server persists (one implementation, two
// consumers — the point of contracts/). Amounts are in MILLIONS of the record
// currency; the ratios/returns are currency-agnostic. Unit-tested in
// contracts/economics.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface Multiples {
  /** EV / EBITDA, or null ("n.m.") when EBITDA is missing or ≤ 0. */
  evEbitda: number | null;
  /** EV / Revenue, or null ("n.m.") when Revenue is missing or ≤ 0. */
  evRevenue: number | null;
}

/**
 * EV/EBITDA and EV/Revenue. Null (rendered "n.m." — not meaningful) when the
 * denominator is missing or ≤ 0 — never Infinity, NaN, or a negative multiple.
 */
export function computeMultiples(input: {
  ev?: number | null;
  ebitda?: number | null;
  revenue?: number | null;
}): Multiples {
  const ev = num(input.ev);
  const ebitda = num(input.ebitda);
  const revenue = num(input.revenue);
  return {
    evEbitda: ev != null && ebitda != null && ebitda > 0 ? round2(ev / ebitda) : null,
    evRevenue: ev != null && revenue != null && revenue > 0 ? round2(ev / revenue) : null,
  };
}

/**
 * Enterprise value = equity value + net debt. Returns null when equity is
 * absent — we never solve backwards from a given EV silently (see edge cases).
 */
export function deriveEv(input: {
  equityValue?: number | null;
  netDebt?: number | null;
}): number | null {
  const eq = num(input.equityValue);
  if (eq == null) return null;
  const nd = num(input.netDebt) ?? 0;
  return round2(eq + nd);
}

export interface QuickReturn {
  moic: number | null;
  irr: number | null; // as a fraction, e.g. 0.185 = 18.5%
}

/**
 * A deliberately SIMPLE PE return estimate. Simplifications (documented so no
 * one mistakes it for a model): no interim cash flows, no fees, no debt-paydown
 * schedule (entry debt held flat to exit).
 *   entryEquity = EV × equityPct
 *   entryDebt   = EV × (1 − equityPct)
 *   exitEV      = exitMultiple × EBITDA
 *   exitEquity  = exitEV − entryDebt
 *   MOIC        = exitEquity / entryEquity
 *   IRR         = MOIC^(1/years) − 1
 * Returns nulls when inputs are insufficient or non-sensical (years ≤ 0,
 * equityPct outside (0,100], EBITDA ≤ 0). If equity is wiped out (MOIC ≤ 0),
 * MOIC is returned but IRR is null (undefined for a total loss).
 */
export function quickIrrMoic(input: {
  ev?: number | null;
  ebitda?: number | null;
  equityPct?: number | null;
  holdYears?: number | null;
  exitMultiple?: number | null;
}): QuickReturn {
  const ev = num(input.ev);
  const ebitda = num(input.ebitda);
  const equityPct = num(input.equityPct);
  const years = num(input.holdYears);
  const exitMultiple = num(input.exitMultiple);
  const none: QuickReturn = { moic: null, irr: null };
  if (ev == null || ebitda == null || equityPct == null || years == null || exitMultiple == null) return none;
  if (equityPct <= 0 || equityPct > 100 || years <= 0 || ebitda <= 0 || ev <= 0) return none;

  const eqFrac = equityPct / 100;
  const entryEquity = ev * eqFrac;
  const entryDebt = ev * (1 - eqFrac);
  const exitEv = exitMultiple * ebitda;
  const exitEquity = exitEv - entryDebt;
  if (entryEquity <= 0) return none;
  const moic = exitEquity / entryEquity;
  if (moic <= 0) return { moic: round2(moic), irr: null };
  const irr = Math.pow(moic, 1 / years) - 1;
  return { moic: round2(moic), irr: round4(irr) };
}

export type SourcesUsesSide = "source" | "use";
export interface SourcesUsesRow {
  label: string;
  side: SourcesUsesSide;
  amount: number;
}
export interface SourcesUsesBalanceResult {
  sources: number;
  uses: number;
  delta: number; // sources − uses
  balanced: boolean;
}

/** Sum sources vs uses and report the imbalance. Balanced within 0.001M. */
export function sourcesUsesBalance(rows: SourcesUsesRow[]): SourcesUsesBalanceResult {
  let sources = 0;
  let uses = 0;
  for (const r of rows) {
    const a = num(r.amount) ?? 0;
    if (r.side === "source") sources += a;
    else uses += a;
  }
  sources = round2(sources);
  uses = round2(uses);
  const delta = round2(sources - uses);
  return { sources, uses, delta, balanced: Math.abs(delta) < 0.001 };
}

/** Format a multiple for display: "8.5×" or "n.m." when null. */
export function fmtMultiple(m: number | null): string {
  return m == null ? "n.m." : `${m}×`;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
