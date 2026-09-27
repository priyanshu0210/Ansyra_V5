// Shared pipeline aggregation so Analytics and the dashboard Home tab report
// provably identical numbers (Phase 12.8). No FX conversion — mixed-currency
// pipelines produce one total per currency; unparsed values are counted apart.

export const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹", JPY: "¥" };

export interface StatsDeal {
  stage: string;
  value: string | null;
  valueAmount: string | null; // numeric mirror in millions (Phase 11.1)
  valueCurrency: string | null;
}
export interface StatsTarget {
  sector: string;
  fitScore: number;
}

// Compact "in millions" formatting: 45 → 45M, 1200 → 1.2B.
export function fmtMillions(symbol: string, m: number): string {
  return m >= 1000 ? `${symbol}${(m / 1000).toFixed(1)}B` : `${symbol}${Math.round(m)}M`;
}

export interface PipelineStats {
  byStage: { stage: string; count: number }[];
  currencyTotals: [string, number][];
  unparsed: number;
  avgFit: number;
  sectors: { name: string; value: number }[];
}

export const PIPELINE_STAGES = ["sourcing", "evaluation", "diligence", "negotiation", "closing", "integration"] as const;

export function computePipelineStats(deals: StatsDeal[], targets: StatsTarget[]): PipelineStats {
  const byStage = PIPELINE_STAGES.map((s) => ({ stage: s, count: deals.filter((d) => d.stage === s).length }));

  const byCurrency = new Map<string, number>();
  let unparsed = 0;
  for (const d of deals) {
    const amt = d.valueAmount != null ? parseFloat(d.valueAmount) : NaN;
    if (Number.isFinite(amt) && d.valueCurrency) {
      byCurrency.set(d.valueCurrency, (byCurrency.get(d.valueCurrency) ?? 0) + amt);
    } else if (d.value) {
      unparsed++;
    }
  }
  const currencyTotals = [...byCurrency.entries()].sort((a, b) => b[1] - a[1]);

  const avgFit = targets.length ? Math.round(targets.reduce((s, t) => s + t.fitScore, 0) / targets.length) : 0;

  const sectorMap = targets.reduce<Record<string, number>>((acc, t) => {
    acc[t.sector] = (acc[t.sector] || 0) + 1;
    return acc;
  }, {});
  const sectors = Object.entries(sectorMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return { byStage, currencyTotals, unparsed, avgFit, sectors };
}

// The pipeline-value KPI string (per currency), or "—" when nothing is parseable.
export function formatPipelineValue(currencyTotals: [string, number][]): string {
  if (currencyTotals.length === 0) return "—";
  return currencyTotals.map(([code, m]) => fmtMillions(CURRENCY_SYMBOL[code] ?? `${code} `, m)).join(" + ");
}
