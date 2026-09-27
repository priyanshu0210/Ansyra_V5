import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { DEAL_STAGES, stageOrdinal, type DealStage } from "@contracts/stages";
import { ASSUMPTION_GATE_CODE } from "@contracts/assumption-gate";
import { RECOMMENDATION_GATE_CODE } from "@contracts/recommendation-gate";
import { Card } from "./parchment/Card";
import { Modal, Field, Textarea, TextInput } from "./DealPipeline";
import { RecommendationCard } from "./RecommendationCard";

// The three machine-readable prefixes the server puts on gate rejections.
// DECISION_REQUIRED is a literal because deals-router still writes it inline;
// if that ever moves to a constant, take it from there too.
const GATE_PREFIX = new RegExp(
  `^(DECISION_REQUIRED|${ASSUMPTION_GATE_CODE}|${RECOMMENDATION_GATE_CODE}):\\s*`,
);

// Decision Log (Phase 15.1) — the decision timeline, the record modal (which is
// also how a deal advances a stage), and the AI-generated IC memo. Mounted in
// the deal dossier. The stage-gate is enforced server-side; this is the UI that
// feeds it. Kept self-contained so the dossier just drops it in.

type DecisionType =
  | "advance" | "hold" | "pass" | "approve_loi" | "approve_binding" | "kill" | "other";

const DECISION_LABELS: Record<DecisionType, string> = {
  advance: "Advance to next stage",
  approve_loi: "Approve LOI",
  approve_binding: "Approve binding offer",
  hold: "Hold",
  pass: "Pass (decline)",
  kill: "Kill",
  other: "Other",
};

// Accent per decision type — matcha for go, amber for hold, persimmon/danger for stop.
const ACCENT: Record<DecisionType, string> = {
  advance: "var(--sev-grounded)",
  approve_loi: "var(--sev-grounded)",
  approve_binding: "var(--sev-grounded)",
  hold: "var(--sev-watch)",
  pass: "var(--fg)",
  kill: "var(--sev-flag)",
  other: "var(--fg-2)",
};

const VERDICT_LABEL: Record<string, string> = {
  proceed: "Proceed",
  proceed_with_conditions: "Proceed with conditions",
  hold: "Hold",
  decline: "Decline",
};

export function DecisionLog({
  dealId,
  currentStage,
  autoAdvance = false,
}: {
  dealId: number;
  currentStage: string;
  autoAdvance?: boolean;
}) {
  const utils = trpc.useUtils();
  const decisions = trpc.decisions.list.useQuery({ dealId });
  const memos = trpc.ai.listIcMemos.useQuery({ dealId });

  const nextStage = DEAL_STAGES[stageOrdinal(currentStage) + 1] as DealStage | undefined;

  const [open, setOpen] = useState(autoAdvance && !!nextStage);
  const [type, setType] = useState<DecisionType>("advance");
  const [toStage, setToStage] = useState<"" | DealStage>(nextStage ?? "");
  const [rationale, setRationale] = useState("");
  const [votesFor, setVotesFor] = useState("");
  const [votesAgainst, setVotesAgainst] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setRationale(""); setVotesFor(""); setVotesAgainst(""); setErr(null);
    setType("advance"); setToStage(nextStage ?? "");
  };

  const record = trpc.decisions.record.useMutation(withToast({ done: "Decision recorded", failed: "Could not record that decision" }, {
    onSuccess: () => {
      utils.decisions.list.invalidate({ dealId });
      utils.deals.get.invalidate({ id: dealId });
      utils.activity.list.invalidate();
      setOpen(false);
      reset();
    },
    // Both server gates prefix their message so we can tell them apart; neither
    // prefix belongs in front of the user. Built from the exported constant, so
    // renaming it cannot leave this regex silently stripping the wrong token.
    onError: (e) => setErr(e.message.replace(GATE_PREFIX, "")),
  }));

  const genMemo = trpc.ai.generateIcMemo.useMutation(withToast({ done: "IC memo drafted", failed: "Could not draft the IC memo" }, {
    onSuccess: () => utils.ai.listIcMemos.invalidate({ dealId }),
  }));

  const submit = () => {
    if (rationale.trim().length < 20) {
      setErr("Give at least a sentence of rationale (20+ characters).");
      return;
    }
    const hasVotes = votesFor !== "" || votesAgainst !== "";
    record.mutate({
      dealId,
      decisionType: type,
      toStage: toStage || undefined,
      rationale: rationale.trim(),
      outcome: hasVotes
        ? { votesFor: Number(votesFor) || 0, votesAgainst: Number(votesAgainst) || 0 }
        : undefined,
    });
  };

  const latestMemo = memos.data?.[0]?.result;
  const rows = decisions.data ?? [];

  // The recommendations this memo was composed FROM (Phase 15.8). The ids are on
  // the memo row rather than inside `result`, so this reads the row, not the
  // model's output. Not fetched at all when the memo cites none — an older memo
  // predating the column, or a deal with no accepted conclusions.
  const memoRecIds = memos.data?.[0]?.recommendationIds ?? [];
  const recs = trpc.recommendations.list.useQuery(
    { dealId },
    { enabled: memoRecIds.length > 0 },
  );
  const memoRecs = (recs.data ?? []).filter((r) => memoRecIds.includes(r.id));

  return (
    // `id` is the anchor DecisionCard's "Open IC memo" link targets — the memo
    // has no route of its own, so the Decision Log is where it lives.
    <Card id="decision-log">
      <div className="mb-3 flex items-center justify-between">
        <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
          Decision log ({rows.length})
        </p>
        <button
          onClick={() => { reset(); setOpen(true); }}
          data-testid="record-decision"
          className="rounded-full border px-4 py-1.5 font-sans text-[12px]"
          style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}
        >
          Record decision
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
          No decisions recorded yet. Advancing this deal requires a recorded decision.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-sm border p-4"
              style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", borderLeft: `1px solid ${ACCENT[r.decisionType as DecisionType] ?? "var(--fg-rule)"}` }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="ansyra-label" style={{ color: ACCENT[r.decisionType as DecisionType] ?? "var(--fg-2)" }}>
                  {DECISION_LABELS[r.decisionType as DecisionType] ?? r.decisionType}
                  {r.toStage && r.fromStage ? ` · ${r.fromStage} → ${r.toStage}` : ""}
                </p>
                <span className="shrink-0 font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1.5 font-serif text-[15px] leading-snug" style={{ color: "var(--fg)" }}>{r.rationale}</p>
              {r.outcome && (r.outcome.votesFor != null || r.outcome.votesAgainst != null) && (
                <p className="mt-1 font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
                  Vote: {r.outcome.votesFor ?? 0} for · {r.outcome.votesAgainst ?? 0} against
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── IC memo ── */}
      <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--fg-rule)" }}>
        <div className="flex items-center justify-between">
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            Investment committee memo
          </p>
          <button
            onClick={() => genMemo.mutate({ dealId })}
            disabled={genMemo.isPending}
            data-testid="generate-ic-memo"
            className="rounded-full px-4 py-1.5 font-sans text-[12px] disabled:opacity-60"
            style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
          >
            {genMemo.isPending ? "Generating…" : latestMemo ? "Regenerate memo" : "Generate IC memo"}
          </button>
        </div>

        {genMemo.isError && (
          <p className="mt-2 font-sans text-[12px]" style={{ color: "var(--sev-flag-text)" }}>{genMemo.error.message}</p>
        )}

        {latestMemo ? (
          <div className="mt-3 rounded-sm border p-4" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
            <p className="font-serif text-[15px] leading-snug" style={{ color: "var(--fg)" }}>{latestMemo.thesis}</p>
            <p className="mt-2 font-sans text-[12px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{latestMemo.dealSummary}</p>

            {latestMemo.risks?.length > 0 && (
              <div className="mt-3">
                <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Key risks</p>
                <ul className="mt-1 space-y-1">
                  {latestMemo.risks.map((rk, i) => (
                    <li key={i} className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                      <span style={{ color: rk.severity === "high" ? "var(--sev-flag)" : rk.severity === "medium" ? "var(--sev-watch)" : "var(--sev-grounded)" }}>●</span>{" "}
                      {rk.risk} <span style={{ color: "var(--fg-2)" }}>({rk.source})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {latestMemo.openItems?.length > 0 && (
              <div className="mt-3">
                <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Open items</p>
                <ul className="mt-1 list-disc pl-4">
                  {latestMemo.openItems.map((o, i) => (
                    <li key={i} className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{o}</li>
                  ))}
                </ul>
              </div>
            )}

            {memoRecs.length > 0 && (
              <div className="mt-3">
                <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                  Composed from {memoRecs.length} accepted recommendation{memoRecs.length === 1 ? "" : "s"}
                </p>
                {/* Compact: inside a memo these are citations, not decisions to
                    make. Offering Accept/Reject on the very recommendations the
                    memo was composed from would be incoherent. */}
                <div className="mt-2 space-y-2">
                  {memoRecs.map((r) => (
                    <RecommendationCard key={r.id} rec={r} compact />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--fg-rule)" }}>
              <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Recommendation</p>
              <p className="mt-1 font-serif text-[16px]" style={{ color: "var(--fg)" }}>
                {VERDICT_LABEL[latestMemo.recommendation?.verdict] ?? latestMemo.recommendation?.verdict}
              </p>
              <p className="mt-1 font-sans text-[12px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{latestMemo.recommendation?.reasoning}</p>
              {latestMemo.recommendation?.conditions?.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {latestMemo.recommendation.conditions.map((c, i) => (
                    <li key={i} className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
            Compose a committee-ready memo from everything on this deal — assumptions, cultural,
            regulatory, synergy, documents, and the decision history.
          </p>
        )}
      </div>

      {open && (
        <Modal title="Record a decision" onClose={() => { setOpen(false); reset(); }}>
          <div className="space-y-4">
            <Field required label="Decision">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DecisionType)}
                data-testid="decision-type"
                className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none transition-colors focus:border-[var(--fg)]"
                style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
              >
                {(Object.keys(DECISION_LABELS) as DecisionType[]).map((k) => (
                  <option key={k} value={k}>{DECISION_LABELS[k]}</option>
                ))}
              </select>
            </Field>

            <Field label="Move to stage (optional)">
              <select
                value={toStage}
                onChange={(e) => setToStage(e.target.value as "" | DealStage)}
                data-testid="decision-to-stage"
                className="w-full rounded-sm border px-3 py-2 font-sans text-sm capitalize outline-none transition-colors focus:border-[var(--fg)]"
                style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: toStage ? "var(--fg)" : "var(--fg-2)" }}
              >
                <option value="">No stage change</option>
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>{s}{s === nextStage ? " (next)" : ""}</option>
                ))}
              </select>
            </Field>

            <Field required label="Rationale">
              <Textarea value={rationale} onChange={setRationale} rows={4} placeholder="Why this decision? The reasoning is the institutional-memory artifact." />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Votes for (optional)">
                <TextInput value={votesFor} onChange={setVotesFor} placeholder="0" type="number" />
              </Field>
              <Field label="Votes against (optional)">
                <TextInput value={votesAgainst} onChange={setVotesAgainst} placeholder="0" type="number" />
              </Field>
            </div>

            {err && <p className="font-sans text-[12px]" style={{ color: "var(--sev-flag-text)" }}>{err}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setOpen(false); reset(); }}
                className="rounded-full border px-4 py-2 font-sans text-[13px]"
                style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={record.isPending}
                data-testid="submit-decision"
                className="rounded-full px-5 py-2 font-sans text-[13px] disabled:opacity-60"
                style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
              >
                {record.isPending ? "Recording…" : "Record decision"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
