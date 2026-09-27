import { Link } from "react-router";
import { PATTERN_SEVERITY_LABELS, type PatternSeverity } from "@contracts/failure-patterns";
import {
  GATE_CHIP_LABELS,
  coverageLabel,
  type DecisionHealth,
  type GateStatus,
} from "@contracts/decision-health";
import { Card } from "./parchment/Card";

// Decision health (Phase 15.12) — one read-only summary of four layers that
// already have panels of their own.
//
// It leads with what is NOT already on screen: unanswered fatal objections,
// per-horizon read coverage, and matched failure patterns. Gate status appears
// only as a CHIP — the full sentence lives in the Recommendations panel below,
// beside the controls that resolve it, and a second copy would be a second thing
// to keep in sync and a second thing that can lie.
//
// `readsOwed` is on the payload but deliberately not rendered: the panel header
// already shows it, and that number is computed in the browser while this one
// comes from the server, so around a midnight they could differ by one.
// Coverage ratios are timezone-independent.
//
// Props only — no queries. DecisionPanel owns the fetching.

const GATE_COLOR: Record<GateStatus, string> = {
  clear: "var(--sev-grounded)",
  blocked: "var(--sev-watch)",
  ungated: "var(--fg-2)",
};

const SEVERITY_COLOR: Record<PatternSeverity, string> = {
  acute: "var(--sev-flag)",
  elevated: "var(--sev-watch)",
  noted: "var(--fg-2)",
};

/** Why the gate is shut, stated cause-first. Never "N drafts blocking": drafts
 *  do not block, the absence of an accepted recommendation does. */
function blockingLine(h: DecisionHealth): string | null {
  if (h.blockingReason === null) return null;
  const head = `No accepted recommendation stands at ${h.stage}.`;
  if (h.blockingReason === "drafts_pending") {
    return `${head} ${h.draftsPending} draft${h.draftsPending === 1 ? " is" : "s are"} waiting on a decision.`;
  }
  if (h.blockingReason === "expired") {
    return `The accepted recommendation at ${h.stage} has expired. Superseding it with a current one restores the gate.`;
  }
  return head;
}

export function DecisionCard({
  health,
  canOpenMemo = false,
  canSeeFirmQueue = false,
}: {
  health: DecisionHealth;
  /** DecisionLog is only mounted with the `decisions` grant, so without it the
   *  #decision-log anchor does not exist and the link would strand the reader. */
  canOpenMemo?: boolean;
  /** The firm-wide queue lives on the Analytics tab. Suppressed, never 403'd. */
  canSeeFirmQueue?: boolean;
}) {
  const gateColor = GATE_COLOR[health.gateStatus];
  const blocking = blockingLine(health);
  const coverage = health.coverage
    .map((c) => ({ horizon: c.horizon, label: coverageLabel(c) }))
    .filter((c): c is { horizon: typeof c.horizon; label: string } => c.label !== null);

  return (
    <Card className="p-6" data-testid="decision-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
            Decision health
          </h3>
          <p className="mt-1 font-sans text-[12.5px]" style={{ color: "var(--fg-2)" }}>
            What stands behind this deal, and what it still owes.
          </p>
        </div>
        <span
          data-testid="decision-gate-chip"
          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 ansyra-label"
          style={{
            color: gateColor,
            border: `1px solid color-mix(in srgb, ${gateColor} 40%, transparent)`,
            background: `color-mix(in srgb, ${gateColor} 8%, transparent)`,
          }}
        >
          {GATE_CHIP_LABELS[health.gateStatus]}
        </span>
      </div>

      {/* Unanswered fatal objections — the one thing here that is actionable
          right now, so it leads. */}
      {health.unansweredFatal.onDrafts > 0 && (
        <p
          data-testid="decision-fatal"
          className="mt-4 font-sans text-[13px]"
          style={{ color: "var(--sev-watch-text)", maxWidth: "72ch" }}
        >
          {health.unansweredFatal.onDrafts} fatal objection
          {health.unansweredFatal.onDrafts === 1 ? "" : "s"} unanswered on draft
          {health.unansweredFatal.onDrafts === 1 ? "" : "s"}. Answer or downgrade{" "}
          {health.unansweredFatal.onDrafts === 1 ? "it" : "them"} before accepting.
        </p>
      )}

      {/* Should be structurally impossible — accept checks canAccept, update
          refuses non-drafts, supersede re-checks. A quiet note, not a siren. */}
      {health.unansweredFatal.onAccepted > 0 && (
        <p
          data-testid="decision-fatal-accepted"
          className="mt-2 font-sans text-[11.5px]"
          style={{ color: "var(--fg-2)", maxWidth: "72ch" }}
        >
          {health.unansweredFatal.onAccepted} accepted recommendation
          {health.unansweredFatal.onAccepted === 1 ? " carries" : "s carry"} an unanswered fatal
          objection — those rows predate the rule that blocks it, or arrived by import.
        </p>
      )}

      {blocking && (
        <p
          data-testid="decision-blocking"
          className="mt-3 font-sans text-[13px]"
          style={{ color: "var(--fg-2)", maxWidth: "72ch" }}
        >
          {blocking}
        </p>
      )}

      <p className="mt-4 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
        <span style={{ color: "var(--fg)" }}>{health.acceptedRecommendations}</span> accepted
        {health.expiredAccepted > 0 && `, ${health.expiredAccepted} expired`}
        {health.draftsPending > 0 && ` · ${health.draftsPending} draft${health.draftsPending === 1 ? "" : "s"} at ${health.stage}`}
      </p>

      {coverage.length > 0 && (
        <div className="mt-4">
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            Reads on file
          </p>
          <ul className="mt-1.5 space-y-1">
            {coverage.map((c) => (
              <li
                key={c.horizon}
                data-testid={`decision-coverage-${c.horizon}`}
                className="font-sans text-[12.5px]"
                style={{ color: "var(--fg-2)" }}
              >
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {health.patternsMatched.length > 0 && (
        <div className="mt-4">
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            Matches the firm's own history
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {health.patternsMatched.map((p) => (
              <li
                key={p.patternId}
                data-testid={`decision-pattern-${p.patternId}`}
                className="font-sans text-[12.5px]"
                style={{ color: "var(--fg-2)", maxWidth: "72ch" }}
              >
                <span
                  className="mr-2 inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label"
                  style={{
                    borderColor: "var(--fg-rule)",
                    color: SEVERITY_COLOR[p.severity],
                  }}
                >
                  {PATTERN_SEVERITY_LABELS[p.severity]}
                </span>
                {p.description}
                {p.lowSample && " Low sample — indicative only."}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigation only. Every mutation this card describes lives in the panels
          it points at. `replace` keeps the back button meaning "the previous
          page" rather than "the previous scroll position". */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 no-print">
        <Link
          to={{ hash: "#recommendations" }}
          replace
          data-testid="decision-link-recommendations"
          className="inline-flex items-center font-sans text-[12.5px] underline underline-offset-4"
          style={{ color: "var(--fg)", minHeight: 44 }}
        >
          Record the reads
        </Link>
        {canOpenMemo && (
          <Link
            to={{ hash: "#decision-log" }}
            replace
            data-testid="decision-link-memo"
            className="inline-flex items-center font-sans text-[12.5px] underline underline-offset-4"
            style={{ color: "var(--fg-2)", minHeight: 44 }}
          >
            Open IC memo
          </Link>
        )}
        {canSeeFirmQueue && (
          <Link
            to="/dashboard?tab=analytics"
            data-testid="decision-link-queue"
            className="inline-flex items-center font-sans text-[12.5px] underline underline-offset-4"
            style={{ color: "var(--fg-2)", minHeight: 44 }}
          >
            The firm's whole queue
          </Link>
        )}
      </div>
    </Card>
  );
}
