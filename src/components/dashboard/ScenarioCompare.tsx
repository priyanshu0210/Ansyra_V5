import { Link } from "react-router";
import { scoreScenario } from "@contracts/forecast-actual";
import {
  DRIVER_DIRECTION_LABELS,
  RECOMMENDATION_STANCE_LABELS,
  compareDrivers,
  inPlaySummary,
  scenarioChain,
  unmatchedDrivers,
  untestedChainNote,
  type ChainInput,
  type OutcomeGlimpse,
  type Scenario,
} from "@contracts/scenarios";

// The compare grid (Phase 15.13). Props-only — the panel owns the queries.
//
// What this shows is constrained by what a case actually carries. There is no
// per-scenario IRR, NPV or payback anywhere in the data: ScenarioCase holds a
// probability, prose, and a free-text metric delta, and deal_economics is
// unique-per-deal. So the numeric row is probability, the prose rows are
// quoted as written, and deal economics are deliberately absent rather than
// repeated identically under every column, which would read as variation.
//
// The driver table is the part that earns the surface. Narratives a reader can
// compare unaided; "which assumption do these cases disagree about" is the
// question a range exists to answer and is tedious to answer by eye.

const DIRECTION_COLOR: Record<string, string> = {
  holds: "var(--sev-grounded)",
  breaks: "var(--sev-flag)",
  exceeds: "var(--fg)",
};

const CASE_ACCENT: Record<string, string> = {
  base: "var(--fg-2)",
  upside: "var(--sev-grounded)",
  downside: "var(--sev-flag)",
};

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="align-top px-3 py-2"
      style={{ borderTop: "1px solid var(--fg-rule)", fontSize: "var(--step-sm)" }}
    >
      {children}
    </td>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="align-top px-3 py-2 font-sans whitespace-nowrap"
      style={{
        borderTop: "1px solid var(--fg-rule)",
        color: "var(--fg-2)",
        fontSize: "var(--step-sm)",
      }}
    >
      {children}
    </td>
  );
}

/** The read that decides, as a chip. Null renders nothing rather than "—":
 *  an em-dash in an outcome column reads as "fine", and it means "nobody looked". */
function OutcomeChip({ glimpse }: { glimpse: OutcomeGlimpse | null }) {
  if (!glimpse) return null;
  return (
    <span
      className="font-sans"
      style={{ color: SIGNAL_COLOR[glimpse.signal], fontSize: "var(--step-xs)" }}
    >
      {" · "}
      {glimpse.label}
      {glimpse.horizon ? ` at ${String(glimpse.horizon).replace("_", "-")}` : ""}
    </span>
  );
}

/** Drill-down into the surface that owns the object. Both anchors already exist
 *  — #recommendations since 15.12, #assumption-ledger since 15.15 — so this adds
 *  no markup elsewhere. `Link`, never <a href="#…">: under BrowserRouter a bare
 *  anchor is a document navigation. */
function DrillLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={{ hash: to }}
      replace
      className="no-print underline"
      style={{
        color: "var(--fg-2)",
        fontSize: "var(--step-xs)",
        textUnderlineOffset: "3px",
        // Padding expands the touch target to ~44px; the matching negative
        // margin gives the space back to the layout, so a dense comparison grid
        // does not gain 29px of row height per link. The text stays 15px.
        display: "inline-block",
        padding: "14px 4px",
        margin: "-14px -4px",
      }}
    >
      {children}
    </Link>
  );
}

const SIGNAL_COLOR: Record<string, string> = {
  positive: "var(--sev-grounded)",
  negative: "var(--sev-flag)",
  neutral: "var(--fg-2)",
};

export function ScenarioCompare({
  selected,
  links,
  chainData,
  canSeeRecommendations,
  canSeeAssumptions,
}: {
  selected: readonly Scenario[];
  links: ChainInput["links"];
  /** The two outcome ledgers, already deal-scoped by their own procedures. */
  chainData: Omit<ChainInput, "links">;
  canSeeRecommendations: boolean;
  canSeeAssumptions: boolean;
}) {
  const drivers = compareDrivers(selected);
  const chains = selected.map((s) => scenarioChain(s, { links, ...chainData }));

  // Forecast vs actual (15.20), computed from data this panel already holds:
  // the driver directions are the forecast, the assumption ledger is the actual.
  const accuracy = selected.map((s) =>
    scoreScenario(s, chainData.assumptionOutcomes ?? []),
  );

  // An assumption's read is a property of the ASSUMPTION, not of a case, so it
  // is looked up once rather than recomputed per column.
  const outcomeByAssumption = new Map(
    chains
      .flatMap((c) => c.drivers)
      .filter((d) => d.assumptionId !== null && d.latestOutcome !== null)
      .map((d) => [d.assumptionId!, d.latestOutcome!]),
  );
  const driverOutcome = (id: number) => outcomeByAssumption.get(id) ?? null;

  // Said once, at the foot, when NO case has been read back. Per-column it
  // would repeat the same sentence three times.
  const untested = chains.every((c) => untestedChainNote(c) !== null)
    ? untestedChainNote(chains[0])
    : null;

  return (
    // Wide content scrolls inside its own container so the dossier never
    // scrolls horizontally at 375px.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: `${180 + selected.length * 200}px` }}>
        <thead>
          <tr>
            <th />
            {selected.map((s) => (
              <th key={s.id} className="px-3 pb-2 text-left align-bottom">
                <span
                  className="font-serif block"
                  style={{ color: CASE_ACCENT[s.caseName] ?? "var(--fg)", fontSize: "var(--step-0)" }}
                >
                  {s.label}
                </span>
                <span className="font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
                  Run #{s.snapshotId}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          <tr>
            <RowLabel>Likelihood</RowLabel>
            {selected.map((s) => (
              <Cell key={s.id}>
                <span className="font-mono" style={{ color: "var(--fg)" }}>
                  Illustrative
                </span>
              </Cell>
            ))}
          </tr>

          {/* Only once something has actually been read back. Before that the
              row would be a column of blanks implying the cases were wrong. */}
          {accuracy.some((a) => a.judgeable > 0) && (
            <tr>
              <RowLabel>Called it right</RowLabel>
              {selected.map((s, col) => {
                const a = accuracy[col];
                return (
                  <Cell key={s.id}>
                    {a.judgeable === 0 ? (
                      <span style={{ color: "var(--fg-2)" }}>Nothing read back yet</span>
                    ) : (
                      <>
                        <span className="font-mono" style={{ color: "var(--fg)" }}>
                          {a.matched} of {a.judgeable}
                        </span>
                        {a.tooOptimistic > 0 && (
                          <span
                            className="block font-sans"
                            style={{ color: "var(--sev-flag-text)", fontSize: "var(--step-xs)" }}
                          >
                            {a.tooOptimistic} too optimistic
                          </span>
                        )}
                        {a.tooPessimistic > 0 && (
                          <span
                            className="block font-sans"
                            style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}
                          >
                            {a.tooPessimistic} too pessimistic
                          </span>
                        )}
                      </>
                    )}
                  </Cell>
                );
              })}
            </tr>
          )}

          <tr>
            <RowLabel>Thesis impact</RowLabel>
            {selected.map((s) => (
              <Cell key={s.id}>{s.thesisImpact}</Cell>
            ))}
          </tr>

          {/* Only rendered when at least one case supplied it — an empty row of
              em-dashes is furniture. */}
          {selected.some((s) => s.keyMetricDelta) && (
            <tr>
              <RowLabel>Key metric</RowLabel>
              {selected.map((s) => (
                <Cell key={s.id}>
                  {s.keyMetricDelta ? (
                    <span className="font-mono">{s.keyMetricDelta}</span>
                  ) : (
                    <span style={{ color: "var(--fg-2)" }}>Not stated</span>
                  )}
                </Cell>
              ))}
            </tr>
          )}

          <tr>
            <RowLabel>Narrative</RowLabel>
            {selected.map((s) => (
              <Cell key={s.id}>{s.narrative}</Cell>
            ))}
          </tr>

          {canSeeRecommendations && (
            <tr>
              <RowLabel>Recommendations</RowLabel>
              {selected.map((s, col) => {
                const inPlay = chains[col].recommendations;
                const summary = inPlaySummary(inPlay);
                return (
                  <Cell key={s.id}>
                    {summary === null ? (
                      <span style={{ color: "var(--fg-2)" }}>None linked</span>
                    ) : (
                      <>
                        <p style={{ color: "var(--fg-2)" }}>{summary}</p>
                        <ul className="mt-1 space-y-1">
                          {inPlay.map((r) => (
                            <li key={r.recommendationId}>
                              <span
                                className="font-sans"
                                style={{
                                  color:
                                    r.stance === "at_risk" ? "var(--sev-flag)" : "var(--fg-2)",
                                  fontSize: "var(--step-xs)",
                                }}
                              >
                                {RECOMMENDATION_STANCE_LABELS[r.stance]}
                              </span>
                              <OutcomeChip glimpse={r.latestOutcome} />
                              {r.claim && <span className="block">{r.claim}</span>}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1">
                          <DrillLink to="#recommendations">Open the recommendation</DrillLink>
                        </p>
                      </>
                    )}
                  </Cell>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>

      {/* Drivers: the disagreements sort first, which is the whole point. */}
      {drivers.length > 0 && (
        <table
          className="w-full border-collapse mt-6"
          style={{ minWidth: `${180 + selected.length * 200}px` }}
        >
          <thead>
            <tr>
              <th className="px-3 pb-2 text-left">
                <span
                  className="font-sans font-medium"
                  style={{ color: "var(--fg)", fontSize: "var(--step-sm)" }}
                >
                  Where these cases part ways
                </span>
              </th>
              {selected.map((s) => (
                <th
                  key={s.id}
                  className="px-3 pb-2 text-left font-sans"
                  style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.assumption}>
                <RowLabel>
                  <span style={{ color: d.agrees ? "var(--fg-2)" : "var(--fg)" }}>
                    {d.assumption}
                  </span>
                  {d.assumptionId === null ? (
                    // Honest about the gap: the generator named something the
                    // assumption ledger does not carry.
                    <span
                      className="block font-sans"
                      style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}
                    >
                      Not in the assumption ledger
                    </span>
                  ) : (
                    <span className="block">
                      {/* What actually happened to the assumption itself — the
                          far end of the chain, on the row that names it. */}
                      <OutcomeChip glimpse={driverOutcome(d.assumptionId)} />
                      {canSeeAssumptions && (
                        <>
                          {" "}
                          <DrillLink to="#assumption-ledger">Open the assumption</DrillLink>
                        </>
                      )}
                    </span>
                  )}
                </RowLabel>
                {d.directions.map((dir, i) => (
                  <Cell key={selected[i].id}>
                    {dir === null ? (
                      <span style={{ color: "var(--fg-2)" }}>—</span>
                    ) : (
                      <span className="font-sans" style={{ color: DIRECTION_COLOR[dir] }}>
                        {DRIVER_DIRECTION_LABELS[dir]}
                      </span>
                    )}
                  </Cell>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {untested && (
        <p
          className="mt-4 font-sans"
          style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", maxWidth: "62ch" }}
        >
          {untested} Reads are recorded against the assumptions and recommendations
          themselves, on the panels below.
        </p>
      )}

      {selected.some((s) => unmatchedDrivers(s).length > 0) && (
        <p
          className="mt-4 font-sans"
          style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", maxWidth: "62ch" }}
        >
          Drivers marked as missing from the ledger are named in the scenario but
          not logged as assumptions on this deal. That is usually a gap worth
          closing, not a fault in the scenario.
        </p>
      )}
    </div>
  );
}
