import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { relativeTime } from "@/lib/relative-time";
import { todayIso } from "@contracts/milestones";
import { isExpired } from "@contracts/recommendation-gate";
import {
  OUTCOME_HORIZONS,
  OUTCOME_HORIZON_LABELS,
  OUTCOME_SIGNAL,
  OUTCOME_TYPES,
  OUTCOME_TYPE_LABELS,
  canRecordOutcome,
  highSignalLabel,
  isHighSignal,
  latestOutcome,
  outcomeBlockedMessage,
  outcomeTrajectory,
  reviewStatus,
  reviewStatusMessage,
  type NewOutcome,
  type OutcomeHorizon,
  type OutcomeType,
} from "@contracts/outcomes";
import type { FailurePattern } from "@contracts/failure-patterns";
import { countdownLabel } from "@contracts/milestones";
import {
  SCHEDULED_HORIZON_PHRASE,
  type HorizonStatus,
  type ScheduledHorizon,
} from "@contracts/outcome-schedule";
import {
  SCENARIO_LINK_CASES,
  SCENARIO_LINK_CASE_LABELS,
  SCENARIO_RELATIONS,
  SCENARIO_RELATION_HINTS,
  SCENARIO_RELATION_LABELS,
  linkStalenessMessage,
  type ScenarioLinkCase,
  type ScenarioRelation,
} from "@contracts/scenario-links";
import { Field, SelectInput, Textarea, TextInput } from "./DealPipeline";
import {
  CONFIDENCE_BAND_LABELS,
  EVIDENCE_KIND_LABELS,
  RECOMMENDATION_STATUS_LABELS,
  acceptBlockedMessage,
  canAccept,
  confidenceBand,
  evidenceCounts,
  evidenceSummary,
  type ConfidenceBand,
  type CounterargumentWeight,
  type RecommendationStatus,
} from "@contracts/recommendations";

// The recommendation, as a card (Phase 15.8). Deliberately lighter than the
// dossier panels around it: this is the summary layer over analyses that each
// have their own dense module, not another one of those.
//
// Detail expands IN PLACE rather than opening a modal. The dossier's Export PDF
// is window.print(), and modal content does not print — detail behind one would
// be silently absent from the artifact people actually take to committee.

type Rec = inferRouterOutputs<AppRouter>["recommendations"]["list"][number];

const STATUS_COLOR: Record<RecommendationStatus, string> = {
  draft: "var(--fg-2)",
  accepted: "var(--sev-grounded)",
  rejected: "var(--sev-flag)",
  superseded: "var(--fg-2)",
};

const BAND_COLOR: Record<ConfidenceBand, string> = {
  high: "var(--sev-grounded)",
  medium: "var(--sev-watch)",
  low: "var(--sev-flag)",
};

const WEIGHT_COLOR: Record<CounterargumentWeight, string> = {
  minor: "var(--fg-2)",
  material: "var(--sev-watch)",
  fatal: "var(--sev-flag)",
};

const SIGNAL_COLOR: Record<"positive" | "negative" | "neutral", string> = {
  positive: "var(--sev-grounded)",
  negative: "var(--sev-flag)",
  neutral: "var(--fg-2)",
};

type Outcome = inferRouterOutputs<AppRouter>["recommendations"]["listOutcomes"][number];
type ScenarioLink = inferRouterOutputs<AppRouter>["recommendations"]["listScenarioLinks"][number];
type Snapshot = inferRouterOutputs<AppRouter>["ai"]["listScenarioAnalyses"][number];

/** Soft-tinted pill, the DdTracker status-chip formula. */
function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 ansyra-label"
      style={{
        color,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function RecommendationCard({
  rec,
  compact = false,
  busy = false,
  outcomes = [],
  scenarioLinks = [],
  snapshots = [],
  advisories = [],
  schedule = [],
  onAccept,
  onReject,
  onEdit,
  onSupersede,
  onRecordOutcome,
  onLinkScenario,
  onUnlinkScenario,
}: {
  rec: Rec;
  /** Inside an IC memo these are citations, not decisions to make: no actions. */
  compact?: boolean;
  busy?: boolean;
  /** This recommendation's slice of the deal's single outcomes query. */
  outcomes?: readonly Outcome[];
  /** This recommendation's slice of the deal's single links query. */
  scenarioLinks?: readonly ScenarioLink[];
  /** Scenario runs available to link. Empty when the reader lacks `scenarios`,
   *  which is exactly when the create affordance should not render. */
  snapshots?: readonly Snapshot[];
  /**
   * Firm-wide failure patterns this recommendation falls inside (Phase 15.10).
   *
   * ADVISORY ONLY. This never touches canAccept, gateState, or anything the
   * server enforces — the gate is a rule, this is a memory. Optional with a
   * default because DecisionLog renders this card with only `rec` and `compact`.
   */
  advisories?: readonly FailurePattern[];
  /**
   * This recommendation's slice of the deal's read schedule (Phase 15.11),
   * computed by the panel from one close anchor. The card never resolves its own
   * anchor — milestones are `timeline`-gated, and reaching for them here would
   * 403 the dossier for anyone without that grant.
   *
   * Optional with a default because DecisionLog renders this card with only
   * `rec` and `compact`.
   */
  schedule?: readonly HorizonStatus[];
  onAccept?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onSupersede?: () => void;
  onRecordOutcome?: (o: NewOutcome) => void;
  onLinkScenario?: (l: {
    scenarioAnalysisId: number;
    caseName: ScenarioLinkCase;
    relation: ScenarioRelation;
  }) => void;
  onUnlinkScenario?: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [oType, setOType] = useState<OutcomeType>("held");
  const [oHorizon, setOHorizon] = useState<OutcomeHorizon>("30_day");
  const [oDate, setODate] = useState(todayIso());
  const [oSummary, setOSummary] = useState("");
  const [linking, setLinking] = useState(false);
  const [lSnapshot, setLSnapshot] = useState("");
  const [lCase, setLCase] = useState<ScenarioLinkCase>("all");
  const [lRelation, setLRelation] = useState<ScenarioRelation>("relevant_if_false");

  const band = confidenceBand(rec.confidence);
  const statusColor = STATUS_COLOR[rec.status] ?? "var(--fg-2)";
  const counts = evidenceCounts(rec.supportingEvidence);
  const unanswered = rec.counterarguments.filter((c) => !c.response?.trim()).length;
  const expired = isExpired(rec.expiresAt);
  const isSuperseded = rec.status === "superseded";
  // The same predicate the server enforces. Computed here so Accept is DISABLED
  // rather than clickable-then-rejected, with the reason next to the button
  // instead of in a panel-level error line at the bottom of a long list.
  const acceptBlocked = rec.status === "draft" && !canAccept(rec.counterarguments);

  const trajectory = outcomeTrajectory(outcomes);
  const newest = latestOutcome(outcomes);
  const review = reviewStatus(rec, outcomes);
  const reviewLine = reviewStatusMessage(review, newest?.outcomeType);
  const highSignal = !!newest && isHighSignal(rec.status, newest.outcomeType);
  const canRecord = canRecordOutcome(rec.status);

  const submitOutcome = () => {
    if (oSummary.trim().length < 10) return;
    onRecordOutcome?.({
      outcomeType: oType,
      outcomeSummary: oSummary.trim(),
      horizon: oHorizon,
      // Read as UTC noon so a date-only input cannot land on the previous day
      // for anyone west of Greenwich.
      recordedAt: new Date(`${oDate}T12:00:00Z`),
    });
    setOSummary("");
    setAdding(false);
  };

  const submitLink = () => {
    const id = Number(lSnapshot || snapshots[0]?.id);
    if (!Number.isFinite(id) || id <= 0) return;
    onLinkScenario?.({ scenarioAnalysisId: id, caseName: lCase, relation: lRelation });
    setLinking(false);
  };

  /** "12 Jul · 5 assumptions · latest" — enough to tell two runs apart. */
  const snapshotLabel = (s: Snapshot) => {
    const latestId = snapshots.length ? Math.max(...snapshots.map((x) => x.id)) : -1;
    const date = new Date(s.createdAt).toLocaleDateString();
    return `${date} · ${s.assumptionCount} assumptions${s.id === latestId ? " · latest" : ""}`;
  };

  return (
    <div
      data-testid={`rec-card-${rec.id}`}
      className="rounded-sm border p-4"
      style={{
        borderColor: "var(--fg-rule)",
        background: "var(--fg-surface)",
        borderLeft: `1px solid ${statusColor}`,
        opacity: isSuperseded ? 0.55 : 1,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={statusColor}>{RECOMMENDATION_STATUS_LABELS[rec.status] ?? rec.status}</Chip>
        <Chip color={BAND_COLOR[band]}>
          {CONFIDENCE_BAND_LABELS[band]} · {rec.confidence}
        </Chip>
        <span className="ansyra-label" style={{ color: "var(--fg-2)" }}>
          {rec.stage} · {rec.owner === "ai" ? "AI draft" : "Human"}
        </span>
        <span
          className="ml-auto shrink-0 font-mono text-[length:var(--step-xs)]"
          style={{ color: "var(--fg-2)" }}
        >
          {relativeTime(rec.createdAt)}
        </span>
      </div>

      <p className="mt-2.5 text-pretty font-serif text-[15px] leading-snug" style={{ color: "var(--fg)" }}>
        {rec.claim}
      </p>

      <p
        className="mt-1.5 text-pretty font-sans text-[12px] leading-relaxed"
        style={{ color: "var(--fg-2)", maxWidth: "72ch" }}
      >
        {open || rec.rationale.length <= 220 ? rec.rationale : `${rec.rationale.slice(0, 220)}…`}
      </p>

      {/* Evidence — counts first, because "what does this rest on" is the
          question a reader has before they have any others. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {counts.map(({ kind, count }) => (
          <span
            key={kind}
            className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
          >
            {count} {EVIDENCE_KIND_LABELS[kind]}
          </span>
        ))}
        <span className="font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
          {evidenceSummary(rec.supportingEvidence)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {rec.counterarguments.length > 0 && (
          <span className="font-sans text-[11.5px]" style={{ color: unanswered > 0 ? "var(--sev-watch)" : "var(--fg-2)" }}>
            {rec.counterarguments.length} counterargument{rec.counterarguments.length === 1 ? "" : "s"}
            {unanswered > 0 ? ` · ${unanswered} unanswered` : " · all answered"}
          </span>
        )}
        {rec.expiresAt && (
          <span
            className="font-sans text-[11.5px]"
            style={{ color: expired ? "var(--sev-flag)" : "var(--sev-watch)" }}
          >
            {expired ? "Stale — expired" : "Expires"} {relativeTime(rec.expiresAt)}
            {/* An accepted-but-expired row still reads as accepted at a glance,
                which is exactly the state the gate refuses. Say so on the row. */}
            {expired && rec.status === "accepted" && " · no longer satisfies the advancement gate"}
          </span>
        )}
        {/* Outside the expand, deliberately: whether anyone ever went back and
            checked is the fact that must survive a collapsed card and a printed
            dossier. It is also the only place the highest-signal rows announce
            themselves. */}
        {reviewLine && (
          <span
            data-testid={`rec-review-${rec.id}`}
            className="font-sans text-[11.5px]"
            style={{
              color: highSignal
                ? "var(--sev-flag)"
                : review.state === "never_reviewed"
                  ? "var(--sev-watch)"
                  : "var(--fg-2)",
            }}
          >
            {reviewLine}
            {highSignal && (
              <strong style={{ marginLeft: 6 }}>{highSignalLabel(rec.status)}</strong>
            )}
          </span>
        )}
        {/* A memory, not a rule (Phase 15.10). Only on a draft — a decided
            recommendation is not one anyone can still revise, so the line would
            be noise. --sev-watch, never --sev-flag: this card reserves the flag
            colour for expiry and high-signal, the two things that DO have
            consequences. The wording avoids "cannot", "blocked", "before" and
            "required", every one of which belongs to the gate. */}
        {rec.status === "draft" && advisories[0] && (
          <span
            data-testid={`rec-pattern-${rec.id}`}
            className="font-sans text-[11.5px]"
            style={{ color: "var(--sev-watch-text)" }}
          >
            Pattern note — {advisories[0].highSignalCount} of{" "}
            {advisories[0].supportingCount} comparable calls the firm has recorded went the
            other way{advisories[0].lowSample ? " (low sample)" : ""}. Worth a look; it does
            not affect acceptance.
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          data-testid={`rec-expand-${rec.id}`}
          // inline-flex + minHeight gives the 44px touch target; the negative
          // block margin absorbs it again so the metadata row keeps its rhythm.
          className="inline-flex items-center font-sans text-[11.5px] underline-offset-4 hover:underline"
          style={{ color: "var(--fg-2)", minHeight: 44, marginBlock: -14 }}
          aria-expanded={open}
        >
          {open ? "Less" : "Evidence & counterarguments"}
        </button>
      </div>

      {/* `hidden print:…` rather than `{open && …}`: Export PDF is window.print(),
          and the detail — the evidence, the case against, and what actually
          happened — is exactly the part a committee needs on paper. Screen
          behaviour is unchanged; .print-expand in index.css overrides `hidden`. */}
      <div
        className={`mt-3 border-t pt-3 ${open ? "" : "hidden print-expand"}`}
        style={{ borderColor: "var(--fg-rule)" }}
      >
          {rec.supportingEvidence.length > 0 && (
            <div>
              <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                Evidence
              </p>
              <ul className="mt-1 space-y-1">
                {rec.supportingEvidence.map((e, i) => (
                  <li key={`${e.kind}-${e.id}-${i}`} className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                    <span style={{ color: "var(--fg)" }}>{EVIDENCE_KIND_LABELS[e.kind]}</span>{" "}
                    {e.label ?? `#${e.id}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rec.counterarguments.length > 0 && (
            <div className="mt-3">
              <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                Counterarguments
              </p>
              <ul className="mt-1 space-y-1.5">
                {rec.counterarguments.map((c, i) => (
                  <li key={i} className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                    <span style={{ color: WEIGHT_COLOR[c.weight] ?? "var(--fg-2)" }}>●</span> {c.point}{" "}
                    <span style={{ color: WEIGHT_COLOR[c.weight] ?? "var(--fg-2)" }}>({c.weight})</span>
                    <br />
                    {c.response?.trim() ? (
                      <span style={{ color: "var(--fg)" }}>↳ {c.response}</span>
                    ) : (
                      <span style={{ color: "var(--sev-watch-text)" }}>↳ unanswered</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Scenario links (Phase 15.9) ──
              Ordered evidence → counterarguments → scenarios → outcomes: what it
              rests on, what argues against it, what it was hedged against, and
              what happened. */}
          {(scenarioLinks.length > 0 || (!compact && onLinkScenario && snapshots.length > 0)) && (
            <div className="mt-3">
              <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                Scenarios
              </p>

              {scenarioLinks.length > 0 && (
                <ul className="mt-1.5 space-y-2">
                  {scenarioLinks.map((l) => {
                    const staleMsg = linkStalenessMessage(l.staleness);
                    return (
                      <li key={l.id} data-testid={`rec-scenario-${l.id}`} className="font-sans text-[12px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label"
                            style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}
                          >
                            {SCENARIO_LINK_CASE_LABELS[l.caseName]}
                          </span>
                          <span
                            className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label"
                            style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                          >
                            {SCENARIO_RELATION_LABELS[l.relation]}
                          </span>
                          <span className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
                            run of {new Date(l.snapshotCreatedAt).toLocaleDateString()} ·{" "}
                            {l.snapshotAssumptionCount} assumptions
                          </span>
                          {!compact && onUnlinkScenario && (
                            <button
                              type="button"
                              onClick={() => onUnlinkScenario(l.id)}
                              disabled={busy}
                              data-testid={`rec-unlink-${l.id}`}
                              // Same 44px-without-changing-the-row trick as the
                              // expand toggle: inline-flex + minHeight, negative
                              // block margin to absorb it.
                              className="ml-auto inline-flex items-center font-sans text-[11.5px] underline-offset-4 hover:underline no-print"
                              style={{ color: "var(--fg-2)", minHeight: 44, marginBlock: -14 }}
                            >
                              Unlink
                            </button>
                          )}
                        </div>
                        {l.note && (
                          <p className="mt-1" style={{ color: "var(--fg-2)" }}>
                            {l.note}
                          </p>
                        )}
                        {staleMsg && (
                          // Same treatment ScenarioCards uses for its own
                          // staleness hint, so the two surfaces read as one idea.
                          <p
                            className="mt-1 font-mono text-[length:var(--step-xs)]"
                            style={{ color: "var(--sev-watch-text)" }}
                          >
                            {staleMsg}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {!compact && onLinkScenario && snapshots.length > 0 && !linking && (
                <button
                  type="button"
                  onClick={() => { setLSnapshot(String(snapshots[0].id)); setLinking(true); }}
                  data-testid={`rec-link-scenario-${rec.id}`}
                  className="mt-2 rounded-full border px-4 py-2 font-sans text-[12.5px] no-print"
                  style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", minHeight: 44 }}
                >
                  Link a scenario
                </button>
              )}

              {!compact && onLinkScenario && snapshots.length > 0 && linking && (
                <div className="mt-3 rounded-sm border p-3 no-print" style={{ borderColor: "var(--fg-rule)" }}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="Scenario run">
                      <select
                        value={lSnapshot}
                        onChange={(e) => setLSnapshot(e.target.value)}
                        data-testid={`rec-link-snapshot-${rec.id}`}
                        className="w-full rounded-sm border px-3 py-2 font-sans text-sm"
                        style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
                      >
                        {snapshots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {snapshotLabel(s)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Which case">
                      <SelectInput
                        value={lCase}
                        onChange={(v) => setLCase(v as ScenarioLinkCase)}
                        options={SCENARIO_LINK_CASES as unknown as string[]}
                      />
                    </Field>
                    <Field label="How it bears">
                      <SelectInput
                        value={lRelation}
                        onChange={(v) => setLRelation(v as ScenarioRelation)}
                        options={SCENARIO_RELATIONS as unknown as string[]}
                      />
                    </Field>
                  </div>
                  <p className="mt-2 font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
                    {SCENARIO_RELATION_HINTS[lRelation]}
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setLinking(false)}
                      className="rounded-full border px-4 py-2 font-sans text-[12.5px]"
                      style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)", minHeight: 44 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitLink}
                      disabled={busy}
                      data-testid={`rec-link-save-${rec.id}`}
                      className="rounded-full px-5 py-2 font-sans text-[12.5px] font-medium disabled:opacity-50"
                      style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
                    >
                      Link
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Outcome ledger (Phase 15.9) ── */}
          {(trajectory.length > 0 ||
            schedule.length > 0 ||
            (!compact && canRecord && onRecordOutcome)) && (
            <div className="mt-3">
              <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                Outcome ledger
              </p>

              {/* The read schedule (Phase 15.11). Inside print-expand with the
                  rest of the detail, so an exported dossier shows what is owed;
                  the buttons are no-print, because a PDF cannot be clicked. */}
              {schedule.length > 0 && (
                <div
                  data-testid={`rec-schedule-${rec.id}`}
                  className="mt-1.5 flex flex-wrap items-center gap-1.5"
                >
                  {schedule.map((s) => {
                    const phrase = SCHEDULED_HORIZON_PHRASE[s.horizon as ScheduledHorizon];
                    if (s.state === "completed") {
                      return (
                        <span
                          key={s.horizon}
                          className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label"
                          style={{ borderColor: "var(--fg-rule)", color: "var(--sev-grounded-text)" }}
                        >
                          {phrase} {s.closedAsMoot ? "· closed, moot" : "✓"}
                        </span>
                      );
                    }
                    if (s.state === "unanchored") {
                      return (
                        <span
                          key={s.horizon}
                          title="No closing milestone on file, so this read is not scheduled."
                          className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label"
                          style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                        >
                          {phrase} · not scheduled
                        </span>
                      );
                    }
                    if (s.state === "upcoming") {
                      return (
                        <span
                          key={s.horizon}
                          className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label"
                          style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                        >
                          {phrase} · {s.dueDate ? countdownLabel(s.dueDate) : "—"}
                        </span>
                      );
                    }
                    // Due. The button IS the prefill: oHorizon is already the
                    // select's value below, so setting it opens the existing form
                    // on the right horizon rather than duplicating the form.
                    return !compact && canRecord && onRecordOutcome ? (
                      <button
                        key={s.horizon}
                        type="button"
                        onClick={() => {
                          setOHorizon(s.horizon as OutcomeHorizon);
                          setAdding(true);
                        }}
                        data-testid={`rec-log-${s.horizon}-${rec.id}`}
                        className="inline-flex items-center rounded-full border px-3 py-1 ansyra-label no-print"
                        style={{
                          borderColor: "color-mix(in srgb, var(--sev-watch) 40%, transparent)",
                          background: "color-mix(in srgb, var(--sev-watch) 8%, transparent)",
                          color: "var(--sev-watch-text)",
                          minHeight: 44,
                        }}
                      >
                        Log {phrase} read
                      </button>
                    ) : (
                      <span
                        key={s.horizon}
                        className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label"
                        style={{ borderColor: "var(--fg-rule)", color: "var(--sev-watch-text)" }}
                      >
                        {phrase} · owed
                      </span>
                    );
                  })}
                </div>
              )}

              {trajectory.length > 0 ? (
                <ul className="mt-1.5 space-y-2">
                  {trajectory.map((o) => (
                    <li key={o.id} data-testid={`rec-outcome-${o.id}`} className="font-sans text-[12px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="font-mono text-[length:var(--step-xs)]"
                          style={{ color: "var(--fg-2)" }}
                        >
                          {new Date(o.recordedAt).toLocaleDateString()}
                        </span>
                        {o.horizon && (
                          <span className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                            {OUTCOME_HORIZON_LABELS[o.horizon]}
                          </span>
                        )}
                        <Chip color={SIGNAL_COLOR[OUTCOME_SIGNAL[o.outcomeType]]}>
                          {OUTCOME_TYPE_LABELS[o.outcomeType]}
                        </Chip>
                      </div>
                      <p className="mt-1 text-pretty" style={{ color: "var(--fg-2)", maxWidth: "72ch" }}>
                        {o.outcomeSummary}
                      </p>
                      {o.metricLinks.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {o.metricLinks.map((m, i) => (
                            <span
                              key={`${m.kind}-${m.id}-${i}`}
                              className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label"
                              style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                            >
                              {EVIDENCE_KIND_LABELS[m.kind]} {m.label ?? `#${m.id}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                  Nothing recorded yet. A conclusion nobody went back to check is a conclusion the
                  firm learns nothing from.
                </p>
              )}

              {!compact && onRecordOutcome && !canRecord && (
                <p className="mt-2 font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
                  {outcomeBlockedMessage()}
                </p>
              )}

              {!compact && canRecord && onRecordOutcome && !adding && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  data-testid={`rec-add-outcome-${rec.id}`}
                  className="mt-2 rounded-full border px-4 py-2 font-sans text-[12.5px] no-print"
                  style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", minHeight: 44 }}
                >
                  Record outcome
                </button>
              )}

              {/* In place, never a modal — same reason the detail is. Behind
                  `adding` so a half-filled form never reaches the PDF. */}
              {!compact && canRecord && onRecordOutcome && adding && (
                <div
                  className="mt-3 rounded-sm border p-3 no-print"
                  style={{ borderColor: "var(--fg-rule)" }}
                >
                  <p className="mb-2 font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
                    Outcomes are permanent. If a read turns out wrong, record another — the ledger is
                    the trajectory, not a verdict.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="What happened">
                      <SelectInput
                        value={oType}
                        onChange={(v) => setOType(v as OutcomeType)}
                        options={OUTCOME_TYPES as unknown as string[]}
                      />
                    </Field>
                    <Field label="Which read">
                      <SelectInput
                        value={oHorizon}
                        onChange={(v) => setOHorizon(v as OutcomeHorizon)}
                        options={OUTCOME_HORIZONS as unknown as string[]}
                      />
                    </Field>
                    <Field label="Date of the reading">
                      <TextInput value={oDate} onChange={setODate} type="date" />
                    </Field>
                  </div>
                  <div className="mt-3">
                    <Field label="What you observed">
                      <Textarea
                        value={oSummary}
                        onChange={setOSummary}
                        rows={3}
                        placeholder="What actually happened, and how you know."
                      />
                    </Field>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setAdding(false); setOSummary(""); }}
                      className="rounded-full border px-4 py-2 font-sans text-[12.5px]"
                      style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)", minHeight: 44 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitOutcome}
                      disabled={busy || oSummary.trim().length < 10}
                      data-testid={`rec-outcome-save-${rec.id}`}
                      className="rounded-full px-5 py-2 font-sans text-[12.5px] font-medium disabled:opacity-50"
                      style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
                    >
                      Record
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      {!compact && acceptBlocked && (
        <p
          id={`rec-block-${rec.id}`}
          data-testid={`rec-blocked-${rec.id}`}
          className="mt-3 font-sans text-[12px] leading-relaxed"
          style={{ color: "var(--sev-flag-text)", maxWidth: "62ch" }}
        >
          {/* The server's own string, so the user is never told two versions. */}
          {acceptBlockedMessage(rec.counterarguments)}{" "}
          <span style={{ color: "var(--fg-2)" }}>
            Answer it in the draft, or — if it is not actually fatal — downgrade its weight to
            material. Both are edits, and a draft can still be edited.
          </span>
        </p>
      )}

      {!compact && (onAccept || onReject || onEdit || onSupersede) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {rec.status === "draft" && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              data-testid={`rec-edit-${rec.id}`}
              className="mr-auto rounded-full border px-4 py-2 font-sans text-[12.5px] disabled:opacity-50"
              style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)", minHeight: 44 }}
            >
              Edit draft
            </button>
          )}
          {rec.status === "draft" && onReject && (
            <button
              type="button"
              onClick={onReject}
              disabled={busy}
              data-testid={`rec-reject-${rec.id}`}
              className="rounded-full border px-4 py-2 font-sans text-[12.5px] disabled:opacity-50"
              style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)", minHeight: 44 }}
            >
              Reject
            </button>
          )}
          {rec.status === "draft" && onAccept && (
            <button
              type="button"
              onClick={onAccept}
              disabled={busy || acceptBlocked}
              aria-describedby={acceptBlocked ? `rec-block-${rec.id}` : undefined}
              data-testid={`rec-accept-${rec.id}`}
              className="rounded-full px-5 py-2 font-sans text-[12.5px] font-medium disabled:opacity-50"
              style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
            >
              Accept
            </button>
          )}
          {rec.status === "accepted" && onSupersede && (
            <button
              type="button"
              onClick={onSupersede}
              disabled={busy}
              data-testid={`rec-supersede-${rec.id}`}
              className="rounded-full border px-4 py-2 font-sans text-[12.5px] disabled:opacity-50"
              style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", minHeight: 44 }}
            >
              Supersede
            </button>
          )}
        </div>
      )}
    </div>
  );
}
