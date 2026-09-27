import { DossierChapter } from "@/components/dashboard/DossierChapter";
import { useDossierPrint } from "@/hooks/useDossierPrint";
import { Skeleton, SkeletonRows } from "@/components/dashboard/parchment/Skeleton";
import { PageHelp } from "@/components/dashboard/PageHelp";
import { CurrencySelector } from "@/components/dashboard/CurrencySelector";
import { useCurrency } from "@/components/dashboard/currency";
import { groupReviews } from "@/lib/review-history";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { hasFeature } from "@/lib/rbac";
import { trpc } from "@/providers/trpc";
import { Card } from "@/components/dashboard/parchment/Card";
import { DataRoom } from "@/components/dashboard/DataRoom";
import { DecisionLog } from "@/components/dashboard/DecisionLog";
import { DealEconomics } from "@/components/dashboard/DealEconomics";
import { DealTimeline } from "@/components/dashboard/DealTimeline";
import { DdTracker } from "@/components/dashboard/DdTracker";
import { DealComments } from "@/components/dashboard/DealComments";
import { Recommendations } from "@/components/dashboard/Recommendations";
import { DealStanding } from "@/components/dashboard/DealStanding";
import { DecisionPanel } from "@/components/dashboard/DecisionPanel";
import { ScenarioCards } from "@/components/dashboard/ScenarioCards";
import { ScenarioPanel } from "@/components/dashboard/ScenarioPanel";
import { AssumptionLedgerPanel } from "@/components/dashboard/AssumptionLedgerPanel";
import { DecisionPackExport } from "@/components/dashboard/DecisionPackExport";
import { Logo } from "@/components/ansyra/Logo";

// Full dossier for one deal: everything Ansyra knows about it in one place —
// the "genome page" the Deal Genome tab links into.
export default function DealDetail() {
  const fx = useCurrency();
  const { id } = useParams();
  const dealId = Number(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoAdvance = searchParams.get("advance") === "1";
  const { user, isAuthenticated, isLoading: authLoading, isAuthoritativelyUnauthenticated, isUnresolved } = useAuth();

  useEffect(() => {
    if (isAuthoritativelyUnauthenticated || isUnresolved) navigate("/login", { replace: true });
  }, [isAuthoritativelyUnauthenticated, isUnresolved, navigate]);

  const printing = useDossierPrint(dealId);
  const [loadedChapters, setLoadedChapters] = useState<Set<string>>(() => new Set(["decision"]));
  const activateChapter = useCallback((id: string) => {
    setLoadedChapters(previous => previous.has(id) ? previous : new Set([...previous, id]));
  }, []);
  const analysisReady = loadedChapters.has("analysis") || printing.preparing;
  const activityReady = loadedChapters.has("activity") || printing.preparing;
  const enabled = isAuthenticated && Number.isFinite(dealId);
  // `retry` inherited, not restated — see the note in Dashboard.tsx.
  const deal = trpc.deals.get.useQuery({ id: dealId }, { enabled });
  trpc.recommendations.list.useQuery({ dealId }, { enabled: enabled && hasFeature(user, "recommendations") });
  const assumptions = trpc.ai.listAssumptions.useQuery({ dealId }, { enabled: enabled && hasFeature(user, "assumptions") });
  const cultural = trpc.ai.listCulturalScores.useQuery({ dealId }, { enabled: enabled && analysisReady && hasFeature(user, "cultural") });
  const regulatory = trpc.ai.listRegulatoryAnalyses.useQuery({ dealId }, { enabled: enabled && analysisReady && hasFeature(user, "regulatory") });
  const synergy = trpc.ai.getSynergyPlan.useQuery({ dealId }, { enabled: enabled && analysisReady && hasFeature(user, "synergy") });
  const activity = trpc.activity.list.useQuery({ dealId, limit: 20 }, { enabled: enabled && activityReady });

  if (authLoading || (!isAuthenticated && !isAuthoritativelyUnauthenticated)) {
    return <Shell><p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>Loading…</p></Shell>;
  }

  if (!Number.isFinite(dealId)) {
    return <ErrorShell title="Invalid deal" message="That deal URL doesn't look right." />;
  }

  if (deal.isError) {
    const code = deal.error.data?.code;
    return (
      <ErrorShell
        title={code === "FORBIDDEN" ? "403 — No access" : code === "NOT_FOUND" ? "Deal not found" : "Couldn't load deal"}
        message={
          code === "FORBIDDEN"
            ? "This deal belongs to another user or organization."
            : code === "NOT_FOUND"
              ? "This deal doesn't exist — it may have been deleted."
              : deal.error.message
        }
      />
    );
  }

  const d = deal.data;
  const dealCultural = (cultural.data ?? []).filter((c) => c.dealId === dealId);
  const dealRegulatory = (regulatory.data ?? []).filter((r) => r.dealId === dealId);
  const dossierChapters = [
    { id: "decision", label: "Decision case", visible: (["recommendations", "scenarios", "assumptions", "decisions"] as const).some((key) => hasFeature(user, key)) },
    { id: "execution", label: "Execution", visible: (["economics", "timeline", "dd_tracker", "comments"] as const).some((key) => hasFeature(user, key)) },
    { id: "analysis", label: "Analysis", visible: true },
    { id: "documents", label: "Documents", visible: hasFeature(user, "documents") },
    { id: "activity", label: "Activity", visible: true },
  ].filter((chapter) => chapter.visible);

  return (
    <Shell>
      {!d ? (
        <div className="space-y-6" aria-busy="true">
          <p role="status" className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>Loading deal…</p>
          <Skeleton w="60%" h={36} />
          <Skeleton w="38%" h={16} />
          <Card><SkeletonRows rows={4} /></Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Letterhead — print/PDF only. */}
          <div className="print-only border-b pb-4" style={{ borderColor: "var(--fg-rule)" }}>
            <div className="flex items-center gap-3">
              <Logo size={34} />
              <p className="font-serif text-3xl" style={{ color: "var(--fg)" }}>Ansyra</p>
            </div>
            <p className="mt-1 font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
              Deal dossier · exported {new Date().toLocaleDateString()}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Genome page · Deal #{d.id}</p>
              <h1 className="mt-1 font-serif text-4xl font-light" style={{ color: "var(--fg)" }}>{d.name}</h1>
              <p className="mt-1 font-sans text-sm" style={{ color: "var(--fg-2)" }}>{d.targetCompany}</p>
              <PageHelp page="dossier" />
              <div className="mt-3 h-px w-16" style={{ background: "var(--fg-rule)" }} />
            </div>
            <div className="dossier-actions flex w-full flex-wrap items-start gap-2 sm:w-auto">
            <CurrencySelector />
            {/* The focused export (15.21), beside the whole-dossier one. Inside
                the recommendations gate: a decision pack with no recorded
                conclusions in it is not a decision pack. */}
            {hasFeature(user, "recommendations") && (
              <DecisionPackExport
                dealId={dealId}
                dealName={d.name}
                targetCompany={d.targetCompany}
                currentStage={d.stage}
              />
            )}
            <button
              onClick={printing.prepare}
              disabled={printing.preparing}
              data-testid="export-pdf"
              className="no-print rounded-full border px-4 py-2 font-sans text-[13px]"
              style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}
            >
              {printing.preparing ? "Preparing PDF…" : "Export PDF"}
            </button>
            </div>
          </div>

          {printing.error && <p role="alert" className="font-sans text-sm" style={{ color: "var(--sev-flag-text)" }}>{printing.error}</p>}

          {/* Where this deal stands, and what is holding it. The four facts
              plus the gate, because the facts alone never answered the question
              the page exists for. */}
          <DealStanding
            user={user}
            dealId={dealId}
            stage={d.stage}
            industry={d.industry}
            value={fx.text(d.value)}
            status={d.status}
          />

          <nav
            aria-label="Deal dossier sections"
            className="no-print flex flex-wrap gap-2 border-y py-3"
            style={{ borderColor: "var(--fg-rule)", background: "color-mix(in srgb, var(--clear) 94%, transparent)" }}
          >
            {dossierChapters.map((chapter) => (
              <a key={chapter.id} href={`#${chapter.id}`} className="min-h-11 shrink-0 rounded-full border px-4 py-3 font-sans text-[12px]" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}>
                {chapter.label}
              </a>
            ))}
          </nav>

          {(["recommendations", "scenarios", "assumptions", "decisions"] as const).some((key) => hasFeature(user, key)) && (
          <DossierChapter forceMount={printing.preparing} onActivate={activateChapter} id="decision" title="Decision case" summary="Recommendations, scenarios, assumptions, and recorded decisions" defaultOpen>

          {/* Recommendations (Phase 15.8) — the deal's recorded conclusions.
              Placed above the Decision Log deliberately: a recommendation is the
              input to a decision, and accepted ones are what the stage-gate in
              decisions.record checks before it will advance the deal. */}
          {hasFeature(user, "recommendations") && (
            <>
              {/* Decision health (Phase 15.12) — a read-only summary of the
                  panel below it. Inside the SAME gate, because a summary of a
                  panel must never appear without the panel. */}
              <DecisionPanel dealId={dealId} />
              <Recommendations dealId={dealId} currentStage={d.stage} />
            </>
          )}

          {/* Scenarios (Phase 15.6, mounted here in 15.9) — also lives inside the
              Assumption Ledger, where the inputs are. Here because a conclusion
              and the range it was hedged against should be readable in one
              place, and because this is the page that gets printed. */}
          {hasFeature(user, "scenarios") && (
            <>
              <ScenarioCards
                dealId={dealId}
                testedCount={(assumptions.data ?? []).filter((a) => !!a.result).length}
              />
              {/* Compare (Phase 15.13) — below the runs it reads, inside the
                  SAME gate. It renders nothing until two cases exist, so a deal
                  with one run shows no empty second panel. */}
              <ScenarioPanel dealId={dealId} />
            </>
          )}

          {/* Assumption-to-outcome ledger (Phase 15.15) — the chain
              assumption -> recommendation -> outcome, on its own feature key.
              Below the scenario range it feeds and above the Decision Log, in
              the order the reasoning actually flows. */}
          {hasFeature(user, "assumptions") && <AssumptionLedgerPanel dealId={dealId} />}

          {/* Decision Log & IC Memo (Phase 15.1) — feature-gated; server enforces
              via featureQuery('decisions'). The stage-gate advances deals here. */}
          {hasFeature(user, "decisions") && (
            <DecisionLog dealId={dealId} currentStage={d.stage} autoAdvance={autoAdvance} />
          )}
          </DossierChapter>
          )}

          {(["economics", "timeline", "dd_tracker", "comments"] as const).some((key) => hasFeature(user, key)) && (
          <DossierChapter forceMount={printing.preparing} onActivate={activateChapter} id="execution" title="Execution" summary="Economics, milestones, diligence, and collaboration">

          {/* Deal Economics (Phase 15.2) — deterministic multiples/returns; the
              server recomputes every derived figure from contracts/economics.ts. */}
          {hasFeature(user, "economics") && <DealEconomics dealId={dealId} />}

          {/* Deal Timeline (Phase 15.3) — milestones, countdown chips, reminders. */}
          {hasFeature(user, "timeline") && <DealTimeline dealId={dealId} />}

          {/* DD Tracker (Phase 15.5) — living diligence checklist. */}
          {hasFeature(user, "dd_tracker") && <DdTracker dealId={dealId} />}

          {/* Deal Comments (Phase 15.7) — discussion thread. */}
          {hasFeature(user, "comments") && <DealComments dealId={dealId} />}
          </DossierChapter>
          )}

          <DossierChapter forceMount={printing.preparing} onActivate={activateChapter} id="analysis" title="Analysis" summary="Cross-functional evidence linked to this deal">

          <Section
            title="Assumption ledger"
            empty={!hasFeature(user, "assumptions") ? "Assumptions are outside your access." : assumptions.isError ? "Assumptions could not load. Refresh to retry." : assumptions.isPending ? "Loading assumptions…" : assumptions.data?.length === 0 ? "No assumptions stress-tested yet." : undefined}
            actionLabel="Open Assumption Ledger"
            actionHref="/dashboard?tab=assumptions"
          >
            {(assumptions.data ?? []).map((a) => (
              <div key={a.id} className="rounded-sm border p-4" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
                <div className="flex items-start justify-between gap-4">
                  <p className="font-serif text-[15px] leading-snug" style={{ color: "var(--fg)" }}>&ldquo;{a.assumption}&rdquo;</p>
                  {a.result && (
                    <p className="shrink-0 whitespace-nowrap font-serif text-2xl leading-none" style={{ color: (a.result.optimismScore ?? 0) > 80 ? "var(--sev-flag)" : (a.result.optimismScore ?? 0) >= 50 ? "var(--sev-watch)" : "var(--sev-grounded)" }}>
                      {a.result.optimismScore}
                    </p>
                  )}
                </div>
                {a.result?.recommendation && (
                  <p className="mt-2 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{a.result.recommendation}</p>
                )}
              </div>
            ))}
          </Section>

          <Section
            title={`Cultural compatibility (${dealCultural.length})`}
            empty={!hasFeature(user, "cultural") ? "People reviews are outside your access." : cultural.isError ? "People reviews could not load. Refresh to retry." : cultural.isPending ? "Loading people reviews…" : dealCultural.length === 0 ? "No people reviews linked to this deal yet." : undefined}
            actionLabel="Open People Review"
            actionHref="/dashboard?tab=cultural"
          >
            {groupReviews(dealCultural).map(([c, ...earlier]) => {
              const r = c.result as { overallScore?: number; summary?: string };
              return (
                <div key={c.id} className="flex flex-col items-start justify-between gap-3 rounded-sm border p-4 sm:flex-row" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
                  <div>
                    <p className="font-serif text-[15px]" style={{ color: "var(--fg)" }}>{c.acquirer} × {c.target}</p>
                    {r.summary && <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{r.summary}</p>}
                  </div>
                  <p className="font-sans text-xs" style={{ color: "var(--fg-2)" }}>Review required{earlier.length > 0 && <span className="mt-1 block">{earlier.length} earlier identical {earlier.length === 1 ? "copy" : "copies"} in review history</span>}</p>
                </div>
              );
            })}
          </Section>

          <Section
            title="Regulatory reviews"
            empty={!hasFeature(user, "regulatory") ? "Regulatory reviews are outside your access." : regulatory.isError ? "Regulatory reviews could not load. Refresh to retry." : regulatory.isPending ? "Loading regulatory reviews…" : dealRegulatory.length === 0 ? "No regulatory reviews linked to this deal yet." : undefined}
            actionLabel="Open Regulatory Radar"
            actionHref="/dashboard?tab=regulatory"
          >
            {groupReviews(dealRegulatory).map(([r, ...earlier]) => {
              const res = r.result as { challengeProbability?: number; summary?: string };
              return (
                <div key={r.id} className="flex flex-col items-start justify-between gap-3 rounded-sm border p-4 sm:flex-row" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
                  <div>
                    <p className="font-serif text-[15px]" style={{ color: "var(--fg)" }}>{r.target} · {r.geography}</p>
                    {res.summary && <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{res.summary}</p>}
                  </div>
                  <p className="font-sans text-xs" style={{ color: "var(--fg-2)" }}>Review required{earlier.length > 0 && <span className="mt-1 block">{earlier.length} earlier identical {earlier.length === 1 ? "copy" : "copies"} in review history</span>}</p>
                </div>
              );
            })}
          </Section>

          <Section
            title="Synergy plan"
            empty={!hasFeature(user, "synergy") ? "Synergy plans are outside your access." : synergy.isError ? "Synergy plan could not load. Refresh to retry." : synergy.isPending ? "Loading synergy plan…" : !synergy.data ? "No synergy plan recorded." : undefined}
            actionLabel="Open Synergy Engine"
            actionHref="/dashboard?tab=synergy"
          >
            {synergy.data && (
              <div className="rounded-sm border p-4" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
                <div className="flex flex-wrap gap-4">
                  {synergy.data.categories.map((c) => (
                    <div key={c.category}>
                      <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>{c.category}</p>
                      <p className="font-sans text-[13px]" style={{ color: "var(--fg)" }}>
                        {fx.money(c.actual)} <span style={{ color: "var(--fg-2)" }}>/ {fx.money(c.planned)} planned</span>
                      </p>
                    </div>
                  ))}
                </div>
                {(synergy.data.analysis as { portfolioSummary?: string } | null)?.portfolioSummary && (
                  <p className="mt-3 border-t pt-3 font-serif text-[14px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>
                    {(synergy.data.analysis as { portfolioSummary?: string }).portfolioSummary}
                  </p>
                )}
              </div>
            )}
          </Section>
          </DossierChapter>

          {/* Data Room — feature-gated; server enforces via featureQuery('documents') */}
          {hasFeature(user, "documents") && (
            <DossierChapter forceMount={printing.preparing} onActivate={activateChapter} id="documents" title="Documents" summary="Deal files and document intelligence">
              <DataRoom dealId={dealId} />
            </DossierChapter>
          )}

          <DossierChapter forceMount={printing.preparing} onActivate={activateChapter} id="activity" title="Activity" summary="Recent actions recorded for this deal">
          <Section
            title="Activity trail"
            empty={activity.isPending ? "Loading activity…" : activity.isError ? "Activity could not load. Refresh to retry." : activity.data?.length === 0 ? "No activity recorded for this deal yet." : undefined}
          >
            {(activity.data ?? []).map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4 py-2">
                <p className="font-sans text-[13px]" style={{ color: "var(--fg)" }}>
                  {a.action}
                  {a.detail && <span style={{ color: "var(--fg-2)" }}> — {a.detail}</span>}
                </p>
                <span className="shrink-0 font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </Section>
          </DossierChapter>

          {/* Disclaimer footer — print/PDF only (interim text until Phase 12.7). */}
          <div className="print-only border-t pt-4" style={{ borderColor: "var(--fg-rule)" }}>
            <p className="font-sans text-[length:var(--step-xs)] leading-relaxed" style={{ color: "var(--fg-2)" }}>
              AI-generated content in this dossier (assumption stress-tests, compatibility scores,
              regulatory analyses, document reviews) consists of analytical aids, not legal, financial,
              or investment advice. Figures may be estimates — verify independently before acting.
              © Ansyra {new Date().getFullYear()}.
            </p>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="operate" className="min-h-screen" style={{ background: "var(--clear)", color: "var(--fg)" }}>
      <header className="no-print flex h-16 items-center border-b px-4 sm:px-6 lg:px-8" style={{ borderColor: "var(--fg-rule)", background: "var(--clear)" }}>
        <Link
          to="/dashboard?tab=genome"
          data-testid="deal-detail-back"
          className="font-sans text-[13px] underline-offset-4 hover:underline"
          style={{ color: "var(--fg-2)" }}
        >
          ← Back to Deal Genome
        </Link>
      </header>
      <main className="dossier-content mx-auto min-w-0 max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

function ErrorShell({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <Card data-testid="deal-detail-error">
        <p className="font-serif text-2xl" style={{ color: "var(--sev-flag-text)" }}>{title}</p>
        <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>{message}</p>
        <Link
          to="/dashboard"
          className="mt-4 inline-block rounded-full border px-4 py-1.5 font-sans text-[12px]"
          style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}
        >
          Back to dashboard
        </Link>
      </Card>
    </Shell>
  );
}

function Section({
  title,
  empty,
  actionLabel,
  actionHref,
  children,
}: {
  title: string;
  empty?: string;
  actionLabel?: string;
  actionHref?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 className="ansyra-label" style={{ color: "var(--fg-2)" }}>{title}</h3>
        {actionLabel && actionHref && (
          <Link to={actionHref} className="font-sans text-[length:var(--step-xs)] underline underline-offset-2" style={{ color: "var(--fg)" }}>
            {actionLabel} →
          </Link>
        )}
      </div>
      {empty ? (
        <p className="font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </Card>
  );
}
