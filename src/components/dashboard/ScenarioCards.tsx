import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { useAuth } from "@/hooks/useAuth";
import { hasFeature } from "@/lib/rbac";
import { SCENARIO_RELATION_LABELS } from "@contracts/scenario-links";
import { Card } from "./parchment/Card";

// Scenario analysis (Phase 15.6) — base/upside/downside composed from the deal's
// stress-tested assumptions. Mounted inside the Assumption Ledger because that's
// where the inputs live: you stress-test, then you frame the range.

const CASE_ORDER = ["downside", "base", "upside"] as const;
const CASE_ACCENT: Record<string, string> = {
  base: "var(--fg-2)",
  upside: "var(--sev-grounded)",
  downside: "var(--sev-flag)",
};
const DIRECTION_LABEL: Record<string, string> = {
  holds: "holds",
  breaks: "breaks",
  exceeds: "exceeds",
};

export function ScenarioCards({
  dealId,
  testedCount,
}: {
  dealId: number;
  testedCount: number;
}) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const history = trpc.ai.listScenarioAnalyses.useQuery({ dealId });
  // Which recommendations cite these runs (Phase 15.9). Guarded client-side so a
  // scenarios-only member never fires a query that would 403; every render below
  // is behind links.data?.length, so this surface is unchanged without it.
  const links = trpc.recommendations.listScenarioLinks.useQuery(
    { dealId },
    { enabled: hasFeature(user, "recommendations") },
  );
  const generate = trpc.ai.scenarioAnalysis.useMutation(withToast({ done: "Scenarios generated", failed: "Could not generate scenarios" }, {
    onSuccess: () => {
      utils.ai.listScenarioAnalyses.invalidate({ dealId });
      utils.activity.list.invalidate();
    },
  }));

  const latest = history.data?.[0];
  const result = latest?.result;
  const cases = result?.cases ?? [];
  const ordered = CASE_ORDER.map((n) => cases.find((c) => c.name === n)).filter(
    (c): c is NonNullable<typeof c> => !!c,
  );
  // Stale when assumptions have been added since the snapshot was built.
  const stale = latest ? testedCount > latest.assumptionCount : false;
  const canGenerate = testedCount >= 2;

  const allLinks = links.data ?? [];
  // Links against THIS snapshot; "all" cites the whole run, so it shows on every case.
  const linksForCase = (name: string) =>
    allLinks.filter(
      (l) => l.scenarioAnalysisId === latest?.id && (l.caseName === name || l.caseName === "all"),
    );
  const staleLinkCount = allLinks.filter((l) => l.staleness.stale).length;

  return (
    <Card className="p-6" data-testid="scenario-cards">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
            Scenarios
          </h3>
          <p className="mt-1 font-sans text-[12.5px]" style={{ color: "var(--fg-2)" }}>
            Base, upside and downside composed from this deal's stress-tested assumptions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => generate.mutate({ dealId })}
          disabled={generate.isPending || !canGenerate}
          data-testid="generate-scenarios"
          className="rounded-full px-5 py-2.5 font-sans text-[13px] font-medium disabled:opacity-50"
          style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
        >
          {generate.isPending ? "Composing…" : latest ? "Regenerate" : "Generate scenarios"}
        </button>
      </div>

      {!canGenerate && (
        <p className="mt-4 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
          Stress-test at least two assumptions on this deal first — scenarios need a range to work from.
          {testedCount === 1 && " One tested so far."}
        </p>
      )}

      {generate.error && (
        <p className="mt-3 font-sans text-[12.5px]" style={{ color: "var(--sev-flag-text)" }}>
          {generate.error.message}
        </p>
      )}

      {stale && (
        <p className="mt-3 font-mono text-[length:var(--step-xs)]" style={{ color: "var(--sev-watch-text)" }}>
          Built from {latest!.assumptionCount} assumptions — {testedCount} are tested now. Regenerate to refresh.
        </p>
      )}

      {/* Recommendations citing an OLDER run (Phase 15.9). The links never
          re-point; this says so rather than letting a citation quietly go stale. */}
      {staleLinkCount > 0 && (
        <p
          data-testid="scenario-stale-links"
          className="mt-1 font-mono text-[length:var(--step-xs)]"
          style={{ color: "var(--sev-watch-text)" }}
        >
          {staleLinkCount} recommendation{staleLinkCount === 1 ? " cites" : "s cite"} an earlier scenario
          run. {staleLinkCount === 1 ? "Its link" : "Their links"} still point
          {staleLinkCount === 1 ? "s" : ""} at what was actually cited.
        </p>
      )}

      {ordered.length > 0 && (
        <>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {ordered.map((c) => (
              <div
                key={c.name}
                data-testid={`scenario-${c.name}`}
                className="rounded-sm border p-4"
                style={{
                  borderColor: "var(--fg-rule)",
                  borderLeft: `1px solid ${CASE_ACCENT[c.name] ?? "var(--fg-rule)"}`,
                  background: "var(--fg-surface)",
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="font-serif text-lg capitalize" style={{ color: "var(--fg)" }}>
                    {c.name}
                  </h4>
                  <span className="font-mono text-[length:var(--step-xs)]" style={{ color: CASE_ACCENT[c.name] }}>
                    Illustrative
                  </span>
                </div>
                <p className="mt-2 text-pretty font-sans text-[12.5px] leading-relaxed" style={{ color: "var(--fg-2)" }}>
                  {c.narrative}
                </p>
                {c.drivers?.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {c.drivers.slice(0, 3).map((d, i) => (
                      <li
                        key={i}
                        className="font-sans text-[11.5px]"
                        style={{ color: "var(--fg-2)" }}
                        title={d.assumption}
                      >
                        · {d.assumption.length > 60 ? `${d.assumption.slice(0, 60)}…` : d.assumption}{" "}
                        <em style={{ color: CASE_ACCENT[c.name] }}>{DIRECTION_LABEL[d.direction] ?? d.direction}</em>
                      </li>
                    ))}
                  </ul>
                )}
                {c.thesisImpact && (
                  <p className="mt-3 font-sans text-[11.5px] leading-snug" style={{ color: "var(--fg-2)" }}>
                    <strong style={{ color: "var(--fg)" }}>Thesis:</strong> {c.thesisImpact}
                  </p>
                )}
                {/* Which conclusions were drawn against this case — the half of
                    the decision lab that reads from the scenario side. */}
                {linksForCase(c.name).length > 0 && (
                  <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--fg-rule)" }}>
                    <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                      Cited by
                    </p>
                    <ul className="mt-1 space-y-1">
                      {linksForCase(c.name).map((l) => (
                        <li
                          key={l.id}
                          data-testid={`scenario-citedby-${l.id}`}
                          className="font-sans text-[11.5px]"
                          style={{ color: "var(--fg-2)" }}
                          title={l.claim}
                        >
                          <em>{SCENARIO_RELATION_LABELS[l.relation]}</em> —{" "}
                          <span style={{ color: l.recStatus === "accepted" ? "var(--fg)" : "var(--fg-2)" }}>
                            {l.claim.length > 70 ? `${l.claim.slice(0, 70)}…` : l.claim}
                          </span>{" "}
                          ({l.recStatus})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {result?.summary && (
            <p className="mt-4 text-pretty font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)", maxWidth: "72ch" }}>
              {result.summary}
            </p>
          )}
          {result?.watchItems?.length ? (
            <div className="mt-3">
              <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                Watch for
              </p>
              <ul className="mt-1.5 space-y-1">
                {result.watchItems.map((w, i) => (
                  <li key={i} className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                    · {w}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
