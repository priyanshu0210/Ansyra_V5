import { useCurrency } from "./currency";
import { useMemo } from "react";
import { Card } from "./parchment/Card";
import { EmptyState } from "./parchment/EmptyState";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { computePipelineStats } from "@/lib/pipeline-stats";
import { FailurePatterns } from "./FailurePatterns";
import { ScenarioBenchmark } from "./ScenarioBenchmark";
import { OutcomesOwed } from "./OutcomesOwed";

interface Deal {
  id: number;
  stage: string;
  value: string | null;
  valueAmount: string | null; // numeric mirror in millions (Phase 11.1)
  valueCurrency: string | null;
  industry: string | null;
  createdAt: Date;
}
interface Target { id: number; sector: string; fitScore: number; status: string }

// Categorical series, ink-first: a two-series chart reads as weight, not hue.
const PARCHMENT_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

export function Analytics({ deals, targets }: { deals: Deal[]; targets: Target[] }) {
  const fx = useCurrency();
  const stats = useMemo(() => computePipelineStats(deals, targets), [deals, targets]);

  const pipelineValue = fx.totals(stats.currencyTotals);

  const KPIs = [
    { label: "Recorded deals", value: deals.length.toString(), sub: "including completed and archived" },
    {
      label: "Recorded deal value",
      value: pipelineValue,
      sub: stats.unparsed > 0 ? `+ ${stats.unparsed} deal(s) with unparsed value` : "reference FX conversion",
    },
    { label: "Targets tracked", value: targets.length.toString(), sub: "on the watchlist" },
    { label: "Average fit", value: `${stats.avgFit}`, sub: "of 100" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIs.map((k) => (
          <Card key={k.label}>
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>{k.label}</p>
            <p className={`mt-2 break-words font-serif ${k.value.length > 10 ? "text-2xl leading-snug" : "text-4xl"}`} style={{ color: "var(--fg)" }}>{k.value}</p>
            <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{k.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Deals by stage</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <BarChart data={stats.byStage} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "var(--fg-2)", fontFamily: "var(--font-sans)" }} axisLine={{ stroke: "var(--fg-rule)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "var(--fg-2)", fontFamily: "var(--font-sans)" }} axisLine={{ stroke: "var(--fg-rule)" }} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--fg-surface)", border: "1px solid var(--fg-rule)", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg)" }} cursor={{ fill: "color-mix(in srgb, var(--fg) 6%, transparent)" }} />
                <Bar dataKey="count" fill="var(--fg)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Sector mix</p>
          {stats.sectors.length > 0 ? (
            <div className="mt-4 h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={stats.sectors} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={2}>
                    {stats.sectors.map((_, i) => (<Cell key={i} fill={PARCHMENT_PALETTE[i % PARCHMENT_PALETTE.length]} />))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--fg-surface)", border: "1px solid var(--fg-rule)", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No sector data yet"
              body="This splits your pipeline by the industry on each deal. Set an industry on a deal and it appears here."
              hint="Open a deal → the Industry field."
            />
          )}
        </Card>
      </div>

      {/* Outcomes owed (Phase 15.11) before failure patterns (15.10), and in
          that order deliberately: owed is a queue you act on, patterns are a
          retrospective you learn from. Both own their own queries, because
          everything above this line is computed from props. */}
      <OutcomesOwed />
      <FailurePatterns />
      {/* Decision-superiority proof (15.20) — last, because it is the
          retrospective: the queue is what to do, patterns are what went wrong,
          this is whether the ranges were any good. */}
      <ScenarioBenchmark />
    </div>
  );
}
