import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import {
  ASSUMPTION_CATEGORIES,
  ASSUMPTION_CATEGORY_LABELS,
  ledgerHeadline,
  type LedgerAssumption,
} from "@contracts/assumption-ledger";
import {
  OUTCOME_TYPES,
  OUTCOME_TYPE_LABELS,
  OUTCOME_SIGNAL,
  type OutcomeType,
} from "@contracts/outcomes";
import {
  SCHEDULED_HORIZON_PHRASE,
  type HorizonStatus,
  type ScheduledHorizon,
} from "@contracts/outcome-schedule";
import { countdownLabel } from "@contracts/milestones";
import { Card, SectionTitle } from "./parchment/Card";

// Assumption-to-outcome ledger (Phase 15.15).
//
// A sibling of the Recommendations panel, not a new design language. The chain
// it exists to make legible reads top-down on every row:
//
//   assumption  ->  the recommendations that cite it  ->  what actually happened
//
// The reads form is the same append-only shape as the recommendation outcome
// form: type, horizon, one sentence. It is deliberately not generalised into a
// shared component — the two write to different tables through different
// procedures, and the only thing they share is a vocabulary, which they already
// import from the same contract.

const SIGNAL_COLOR: Record<string, string> = {
  positive: "var(--sev-grounded)",
  negative: "var(--sev-flag)",
  neutral: "var(--fg-2)",
};

function HorizonChips({ horizons }: { horizons: readonly HorizonStatus[] }) {
  if (horizons.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {horizons.map((h) => {
        const label = SCHEDULED_HORIZON_PHRASE[h.horizon];
        const done = h.state === "completed";
        return (
          <span
            key={h.horizon}
            className="font-sans"
            style={{
              fontSize: "var(--step-xs)",
              color: h.state === "due" ? "var(--sev-flag)" : "var(--fg-2)",
            }}
          >
            {label}:{" "}
            {done
              ? h.closedAsMoot
                ? "closed — moot"
                : "read recorded"
              : h.state === "unanchored"
                ? "not scheduled"
                : h.state === "due"
                  ? "owed"
                  : h.dueDate
                    ? countdownLabel(h.dueDate)
                    : "upcoming"}
          </span>
        );
      })}
    </div>
  );
}

function LogReadForm({
  dealId,
  assumptionId,
  presetHorizon,
  onDone,
}: {
  dealId: number;
  assumptionId: number;
  /** Prefilled from the horizon that is actually due, so the common case is one
   *  click. Null means an ad-hoc read, which satisfies no scheduled horizon. */
  presetHorizon: ScheduledHorizon | null;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [outcomeType, setOutcomeType] = useState<OutcomeType>("held");
  const [summary, setSummary] = useState("");
  const record = trpc.assumptionLedger.recordOutcome.useMutation(withToast({ done: "Outcome recorded", failed: "Could not record that outcome" }, {
    onSuccess: async () => {
      await utils.assumptionLedger.ledger.invalidate({ dealId });
      onDone();
    },
  }));

  return (
    <form
      className="no-print mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!summary.trim()) return;
        record.mutate({
          dealId,
          assumptionId,
          outcomeType,
          outcomeSummary: summary.trim(),
          horizon: presetHorizon,
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select
          value={outcomeType}
          onChange={(e) => setOutcomeType(e.target.value as OutcomeType)}
          aria-label="What happened"
          className="px-2 font-sans"
          style={{
            minHeight: "44px",
            borderRadius: "var(--r-lens)",
            border: "1px solid var(--fg-rule)",
            background: "transparent",
            color: "var(--fg)",
            fontSize: "var(--step-sm)",
          }}
        >
          {OUTCOME_TYPES.map((t) => (
            <option key={t} value={t}>
              {OUTCOME_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        placeholder="What did you actually see? One or two sentences."
        aria-label="What did you see"
        className="w-full p-2 font-sans"
        style={{
          borderRadius: "var(--r-lens)",
          border: "1px solid var(--fg-rule)",
          background: "transparent",
          color: "var(--fg)",
          fontSize: "var(--step-sm)",
        }}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!summary.trim() || record.isPending}
          className="px-3 font-sans"
          style={{
            minHeight: "44px",
            borderRadius: "var(--r-lens)",
            border: "1px solid var(--fg-rule)",
            background: "transparent",
            color: summary.trim() ? "var(--fg)" : "var(--fg-2)",
            fontSize: "var(--step-sm)",
          }}
        >
          {record.isPending ? "Recording…" : "Record read"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 font-sans"
          style={{ minHeight: "44px", color: "var(--fg-2)", fontSize: "var(--step-sm)" }}
        >
          Cancel
        </button>
      </div>
      {record.isError && (
        <p className="font-sans" style={{ color: "var(--sev-flag-text)", fontSize: "var(--step-xs)" }}>
          {record.error.message}
        </p>
      )}
    </form>
  );
}

function LedgerRow({ dealId, row }: { dealId: number; row: LedgerAssumption }) {
  const utils = trpc.useUtils();
  const [logging, setLogging] = useState(false);
  const setCategory = trpc.assumptionLedger.setCategory.useMutation(withToast({ done: "Category updated", failed: "Could not change the category", silentOnSuccess: true }, {
    onSuccess: async () => {
      await utils.assumptionLedger.ledger.invalidate({ dealId });
    },
  }));

  const dueHorizon = row.horizons.find((h) => h.state === "due")?.horizon ?? null;

  return (
    <div className="py-4" style={{ borderTop: "1px solid var(--fg-rule)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-serif" style={{ color: "var(--fg)", fontSize: "var(--step-0)", maxWidth: "62ch" }}>
          {row.statement}
        </p>
        {row.isRedFlag && (
          <span className="font-sans" style={{ color: "var(--sev-flag-text)", fontSize: "var(--step-xs)" }}>
            Red flag — unanswered
          </span>
        )}
      </div>

      {/* The category is the AI's guess; correcting it is one control, because a
          mis-filed assumption corrupts cross-deal learning silently. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={row.category}
          onChange={(e) =>
            setCategory.mutate({
              dealId,
              assumptionId: row.id,
              category: e.target.value as (typeof ASSUMPTION_CATEGORIES)[number],
            })
          }
          aria-label={`Category for: ${row.statement.slice(0, 60)}`}
          className="no-print px-2 font-sans"
          style={{
            minHeight: "44px",
            borderRadius: "var(--r-lens)",
            border: "1px solid var(--fg-rule)",
            background: "transparent",
            color: "var(--fg-2)",
            fontSize: "var(--step-xs)",
          }}
        >
          {ASSUMPTION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {ASSUMPTION_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        {row.optimismScore !== null && (
          <span className="font-mono" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
            optimism {row.optimismScore}/100
          </span>
        )}
      </div>

      {/* assumption -> recommendation */}
      {row.citedBy.length > 0 ? (
        <p className="mt-2 font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)" }}>
          Relied on by{" "}
          {row.citedBy.map((r, i) => (
            <span key={r.id}>
              {i > 0 && "; "}
              <span style={{ color: "var(--fg)" }}>{r.claim}</span> ({r.status})
            </span>
          ))}
        </p>
      ) : (
        <p className="mt-2 font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)" }}>
          No recommendation cites this yet — so nothing is owed against it.
        </p>
      )}

      <HorizonChips horizons={row.horizons} />

      {/* -> outcome */}
      {row.outcomes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {row.outcomes.map((o) => (
            <li key={o.id} style={{ fontSize: "var(--step-sm)" }}>
              <span
                className="font-sans"
                style={{ color: SIGNAL_COLOR[OUTCOME_SIGNAL[o.outcomeType as OutcomeType]] }}
              >
                {OUTCOME_TYPE_LABELS[o.outcomeType as OutcomeType]}
              </span>
              {o.horizon && (
                <span style={{ color: "var(--fg-2)" }}> · {String(o.horizon).replace("_", "-")}</span>
              )}
              {o.recommendationOutcomeId != null && (
                <span style={{ color: "var(--fg-2)" }}> · filed with a recommendation read</span>
              )}
              <span className="block" style={{ color: "var(--fg-2)" }}>{o.outcomeSummary}</span>
            </li>
          ))}
        </ul>
      )}

      {logging ? (
        <LogReadForm
          dealId={dealId}
          assumptionId={row.id}
          presetHorizon={dueHorizon}
          onDone={() => setLogging(false)}
        />
      ) : (
        row.actedOnAt !== null && (
          <button
            type="button"
            onClick={() => setLogging(true)}
            className="no-print mt-2 px-3 font-sans"
            style={{
              minHeight: "44px",
              borderRadius: "var(--r-lens)",
              border: "1px solid var(--fg-rule)",
              background: "transparent",
              color: "var(--fg)",
              fontSize: "var(--step-sm)",
            }}
          >
            {dueHorizon ? `Log ${SCHEDULED_HORIZON_PHRASE[dueHorizon]} read` : "Record a read"}
          </button>
        )
      )}
    </div>
  );
}

export function AssumptionLedgerPanel({ dealId }: { dealId: number }) {
  const q = trpc.assumptionLedger.ledger.useQuery({ dealId });

  // The Assumption Ledger tab owns the "add one" story; a second empty state
  // pointing at the same place is furniture.
  if (q.isLoading || q.isError || !q.data || q.data.rows.length === 0) return null;

  const headline = ledgerHeadline(q.data.summary);

  return (
    <Card id="assumption-ledger">
      <SectionTitle>Assumptions &amp; what happened</SectionTitle>
      {headline && (
        <p className="font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)" }}>
          {headline}
        </p>
      )}
      <div className="mt-2">
        {q.data.rows.map((row) => (
          <LedgerRow key={row.id} dealId={dealId} row={row} />
        ))}
      </div>
    </Card>
  );
}
