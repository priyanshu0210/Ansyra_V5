import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { hasFeature } from "@/lib/rbac";
import { buildDecisionPack, packVerdictLine } from "@contracts/decision-pack";
import { Logo } from "@/components/ansyra/Logo";

// The decision pack (Phase 15.21) — an EXPORT, not a fifth panel.
//
// Everything here already renders on the dossier: the gate on DecisionCard, the
// claims and their evidence on Recommendations, red flags on
// AssumptionLedgerPanel, the range on ScenarioPanel. What did not exist is the
// same material arranged as one argument, on paper, at the moment someone
// advances a deal.
//
// So on screen this is ONE BUTTON. The pack itself is `print-only` and is
// materialised into the print view by adding `printing-pack` to <body>, which
// the print stylesheet uses to hide the rest of the dossier. That reuses the
// export path shipped in 11.3 rather than adding a PDF library, and it means
// the pack inherits the letterhead, the page-break rules and the .no-print
// discipline already in place.

// Hoisted to module scope rather than defined in the render body: a component
// created during render is a NEW type every time, so React remounts its whole
// subtree on each keystroke. react-hooks/component-hooks catches it, and it is
// a real defect rather than a lint opinion.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2
        className="font-sans font-medium mb-2 pb-1 border-b"
        style={{ color: "#000", fontSize: "12pt", borderColor: "#999" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans" style={{ color: "#555", fontSize: "10pt" }}>
      {children}
    </p>
  );
}

export function DecisionPackExport({
  dealId,
  dealName,
  targetCompany,
  currentStage,
}: {
  dealId: number;
  dealName: string;
  targetCompany?: string | null;
  currentStage: string;
}) {
  const { user } = useAuth();
  const canSeeAssumptions = hasFeature(user, "assumptions");
  const canSeeScenarios = hasFeature(user, "scenarios");
  const [printing, setPrinting] = useState(false);

  const [requested, setRequested] = useState(false);

  const recs = trpc.recommendations.list.useQuery({ dealId }, { enabled: requested });
  const evidence = trpc.recommendations.packEvidence.useQuery({ dealId }, { enabled: requested });
  const ledger = trpc.assumptionLedger.ledger.useQuery(
    { dealId },
    { enabled: requested && canSeeAssumptions },
  );
  const scenarios = trpc.scenarios.listByDeal.useQuery({ dealId }, { enabled: requested && canSeeScenarios });

  const pack = useMemo(
    () =>
      buildDecisionPack({
        dealId,
        dealName,
        targetCompany,
        fromStage: currentStage,
        recommendations: recs.data ?? [],
        evidenceByRecommendation: evidence.data,
        assumptions: canSeeAssumptions && ledger.data ? ledger.data.rows.map((a) => ({
          id: a.id,
          assumption: a.statement,
          reviewerNote: a.reviewerNote,
          result: { optimismScore: a.optimismScore, reviewHistory: a.reviewHistory },
          readsOwed: a.schedule.owed,
        })) : undefined,
        scenarios: (scenarios.data ?? [])
          // The newest run only. An older run's downside is not the range this
          // decision is being taken against.
          .filter((s) => s.snapshotId === (scenarios.data?.[0]?.snapshotId ?? -1))
          .map((s) => ({
            id: s.id,
            caseName: s.caseName,
            label: s.label,
            probabilityPct: s.probabilityPct,
            thesisImpact: s.thesisImpact,
          })),
      }),
    [dealId, dealName, targetCompany, currentStage, recs.data, ledger.data, scenarios.data, canSeeAssumptions, evidence.data],
  );

  const incomplete = evidence.isPending || evidence.isError || recs.isPending || recs.isError || (canSeeAssumptions && (ledger.isPending || ledger.isError)) || (canSeeScenarios && (scenarios.isPending || scenarios.isError));
  useEffect(() => {
    if (!requested || incomplete || printing) return;
    const frame = requestAnimationFrame(() => {
      document.body.classList.add("printing-pack");
      setPrinting(true);
      requestAnimationFrame(() => {
        try { window.print(); } finally {
          document.body.classList.remove("printing-pack");
          setPrinting(false); setRequested(false);
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [requested, incomplete, printing]);
  const failed = evidence.isError || recs.isError || ledger.isError || scenarios.isError;

  return (
    <>
      <button
        onClick={() => {
          if (failed) { void evidence.refetch(); void recs.refetch(); if (canSeeAssumptions) void ledger.refetch(); if (canSeeScenarios) void scenarios.refetch(); }
          setRequested(true);
        }}
        disabled={printing || (requested && !failed)}
        data-testid="export-decision-pack"
        className="no-print rounded-full border px-4 py-2 font-sans text-[13px]"
        style={{
          minHeight: "44px",
          borderColor: "var(--fg-rule)",
          background: "var(--fg-surface)",
          color: "var(--fg)",
        }}
      >
        {printing || (requested && !failed) ? "Preparing…" : "Decision pack"}
      </button>

      {(evidence.isError || recs.isError || ledger.isError || scenarios.isError) && <p role="alert" className="font-sans text-sm" style={{ color: "var(--sev-flag-text)" }}>Decision pack unavailable: part of the record could not load. Refresh and try again.</p>}
      {/* print-only: invisible on screen, and the ONLY thing visible once
          `printing-pack` is on the body. */}
      <div className="decision-pack print-only" style={{ color: "#000" }}>
        <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: "#999" }}>
          <Logo size={30} />
          <div>
            <p className="font-serif" style={{ fontSize: "18pt" }}>
              Decision pack
            </p>
            <p className="font-sans" style={{ fontSize: "10pt", color: "#555" }}>
              {pack.dealName}
              {pack.targetCompany ? ` · ${pack.targetCompany}` : ""} · prepared{" "}
              {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>

        <p className="mt-4 font-serif" style={{ fontSize: "13pt" }}>
          {packVerdictLine(pack)}
        </p>
        {/* The gate's own sentence, verbatim from the server's vocabulary —
            never a second wording of the same rule. */}
        <p className="mt-1 font-sans" style={{ fontSize: "10pt", color: "#555" }}>
          {pack.readinessMessage.replace(/^[A-Z_]+: /, "")}
        </p>

        <Section title="What we believe is true">
          {pack.standsOn.length === 0 ? (
            <Empty>No accepted conclusion currently stands at this stage.</Empty>
          ) : (
            <ol className="space-y-3">
              {pack.standsOn.map((c) => (
                <li key={c.id} style={{ breakInside: "avoid" }}>
                  <p className="font-serif" style={{ fontSize: "11pt" }}>
                    {c.claim}
                  </p>
                  {c.rationale && (
                    <p className="font-sans" style={{ fontSize: "10pt", color: "#333" }}>
                      {c.rationale}
                    </p>
                  )}
                  <p className="font-sans" style={{ fontSize: "9pt", color: "#555" }}>
                    Recorded confidence {c.confidence}/100 (subjective) · {c.owner ?? "unattributed"} ·{" "}
                    {c.evidenceCount} source{c.evidenceCount === 1 ? "" : "s"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="What is still uncertain">
          {pack.uncertain.length === 0 ? (
            <Empty>Nothing recorded as uncertain — which is itself worth questioning.</Empty>
          ) : (
            <ul className="space-y-1">
              {pack.uncertain.map((u, i) => (
                <li key={i} className="font-sans" style={{ fontSize: "10pt" }}>
                  {u.text}
                  <span style={{ color: "#555" }}>
                    {u.source === "counterargument"
                      ? ` — objection${u.weight ? ` (${u.weight})` : ""}`
                      : u.source === "assumption"
                        ? " — stress-tested assumption"
                        : " — scenario range"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="What that rests on">
          {pack.evidence.length === 0 ? (
            <Empty>No sources are cited by the standing conclusions.</Empty>
          ) : (
            <ul className="space-y-1">
              {pack.evidence.map((e) => (
                <li key={`${e.kind}:${e.id}`} className="font-sans" style={{ fontSize: "10pt" }}>
                  <span style={{ color: "#555" }}>{e.kindLabel}</span> — {e.label}
                  {e.summary && <span> · {e.summary}</span>}
                  {e.missing && (
                    <strong> · this source is no longer on file</strong>
                  )}
                  <span style={{ color: "#555" }}>
                    {" "}
                    (cited by {e.citedBy.length} conclusion{e.citedBy.length === 1 ? "" : "s"})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="What is unresolved">
          {pack.unresolved.length === 0 ? (
            <Empty>Nothing outstanding is recorded against this move.</Empty>
          ) : (
            <ul className="space-y-1">
              {pack.unresolved.map((u, i) => (
                <li key={i} className="font-sans" style={{ fontSize: "10pt" }}>
                  {u.text}
                  <span style={{ color: "#555" }}>
                    {u.source === "fatal_objection"
                      ? " — fatal objection, unanswered"
                      : u.source === "red_flag_assumption"
                        ? " — red-flag assumption, no reviewer response"
                        : " — outstanding reads"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {pack.ranges.length > 0 && (
          <Section title="The range this is taken against">
            <ul className="space-y-1">
              {pack.ranges.map((s) => (
                <li key={s.id} className="font-sans" style={{ fontSize: "10pt" }}>
                  <strong>{s.label}</strong> (illustrative scenario) — {s.thesisImpact}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <p className="mt-8 font-sans" style={{ fontSize: "8pt", color: "#666" }}>
          Assembled from this deal&rsquo;s recorded conclusions, stress-tested
          assumptions and scenario runs. Every line is traceable to a row in
          Ansyra; nothing here is generated for this document.
        </p>
      </div>
    </>
  );
}
