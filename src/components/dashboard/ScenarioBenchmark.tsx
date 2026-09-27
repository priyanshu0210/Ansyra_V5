import { trpc } from "@/providers/trpc";
import { benchmarkLowSampleNote } from "@contracts/forecast-actual";
import { Card, SectionTitle } from "./parchment/Card";

// Decision-superiority proof (Phase 15.20) — a self-querying sibling of
// FailurePatterns and OutcomesOwed, rendered on the Analytics tab.
//
// This is product truth, not a claim surface. Every line is a count of the
// firm's own scenarios scored against its own assumption ledger, and the fold
// suppresses anything under its floors rather than hedging it, so a thin
// record produces silence instead of a flattering number.
//
// Deliberately NOT a dashboard. Three case classes at most, one line each,
// and a headline only when the gap between best and worst is wide enough to
// mean something.

const SEVERITY_COLOR = (hitRate: number) =>
  hitRate >= 0.6 ? "var(--sev-grounded)" : hitRate >= 0.35 ? "var(--fg-2)" : "var(--sev-flag)";

export function ScenarioBenchmark() {
  const q = trpc.patterns.scenarioBenchmark.useQuery();

  // Nothing to say yet. The Analytics tab already carries two other folds; a
  // third empty state explaining how to earn this one is noise.
  if (q.isLoading || q.isError || !q.data || q.data.findings.length === 0) return null;

  return (
    <Card id="scenario-benchmark">
      <SectionTitle>How well the ranges have held up</SectionTitle>

      <p
        className="font-sans"
        style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", maxWidth: "62ch" }}
      >
        Each scenario case forecast a direction for the assumptions underneath it.
        These are those forecasts scored against what the assumption ledger
        actually recorded — the firm&rsquo;s own history, not a benchmark.
      </p>

      {q.data.headline && (
        <p
          className="mt-3 font-serif"
          style={{ color: "var(--fg)", fontSize: "var(--step-0)", maxWidth: "62ch" }}
        >
          {q.data.headline}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {q.data.findings.map((f) => (
          <li key={f.caseName} style={{ borderTop: "1px solid var(--fg-rule)", paddingTop: "0.75rem" }}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono" style={{ color: SEVERITY_COLOR(f.hitRate) }}>
                {f.matched} of {f.judged}
              </span>
              <span className="font-sans" style={{ color: "var(--fg)", fontSize: "var(--step-sm)" }}>
                {f.description}
              </span>
            </div>
            {benchmarkLowSampleNote(f) && (
              <p
                className="mt-1 font-sans"
                style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", maxWidth: "62ch" }}
              >
                {benchmarkLowSampleNote(f)}
              </p>
            )}
          </li>
        ))}
      </ul>

      <p
        className="mt-4 font-sans"
        style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", maxWidth: "62ch" }}
      >
        Only drivers with a recorded read are counted. Cases nobody has read back,
        and reads that were too early to call, are left out of every figure above
        rather than counted as hits or misses.
      </p>
    </Card>
  );
}
