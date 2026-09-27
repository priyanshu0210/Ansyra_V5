import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { useAuth } from "@/hooks/useAuth";
import { hasFeature } from "@/lib/rbac";
import { DEAL_STAGES, stageOrdinal, type DealStage } from "@contracts/stages";
import { gateState } from "@contracts/recommendation-gate";
import { matchesPattern } from "@contracts/failure-patterns";
import { horizonStates, owedCount, type HorizonStatus } from "@contracts/outcome-schedule";
import {
  COUNTERARGUMENT_WEIGHTS,
  RECOMMENDATION_STATUSES,
  RECOMMENDATION_STATUS_LABELS,
  canAccept,
  confidenceBand,
  type Counterargument,
  type CounterargumentWeight,
  type RecommendationStatus,
} from "@contracts/recommendations";
import { Card } from "./parchment/Card";
import { Modal, Field, Textarea, TextInput } from "./DealPipeline";
import { RecommendationCard } from "./RecommendationCard";

// Recommendations (Phase 15.8) — the deal's recorded conclusions. Sits directly
// above the Decision Log in the dossier, because a recommendation is the input
// to a decision and the reading order should say so.
//
// The advancement banner is computed from the SAME shared predicate the server
// enforces (contracts/recommendation-gate.ts). That is the whole reason the
// predicate is shared: a banner that decides for itself when a deal is blocked
// is a banner that eventually lies.

type Filter = "all" | RecommendationStatus;

const FILTERS: Filter[] = ["all", ...RECOMMENDATION_STATUSES];
const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  ...RECOMMENDATION_STATUS_LABELS,
};

// Accepted first — the ones that count. Superseded last: still readable, no
// longer load-bearing.
const STATUS_ORDER: Record<string, number> = {
  accepted: 0,
  draft: 1,
  rejected: 2,
  superseded: 3,
};

/** A blank counterargument row, so the form always offers one to fill. */
const emptyAgainst = (): Counterargument => ({ point: "", weight: "material", response: "" });

export function Recommendations({ dealId, currentStage }: { dealId: number; currentStage: string }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.recommendations.list.useQuery({ dealId });
  const readiness = trpc.recommendations.readiness.useQuery({ dealId });

  const [filter, setFilter] = useState<Filter | null>(null);
  const [formFor, setFormFor] = useState<
    null | { mode: "create" } | { mode: "edit"; id: number } | { mode: "supersede"; id: number }
  >(null);
  const [claim, setClaim] = useState("");
  const [rationale, setRationale] = useState("");
  const [confidence, setConfidence] = useState("60");
  const [stage, setStage] = useState<DealStage>((currentStage as DealStage) ?? "sourcing");
  const [expiresAt, setExpiresAt] = useState("");
  const [against, setAgainst] = useState<Counterargument[]>([emptyAgainst()]);
  const [err, setErr] = useState<string | null>(null);

  // One query for every card's outcomes — a card never queries for itself.
  const outcomes = trpc.recommendations.listOutcomes.useQuery({ dealId });
  const links = trpc.recommendations.listScenarioLinks.useQuery({ dealId });
  // The snapshot picker needs the scenarios feature; staleness does not (the
  // server computes it), so a recommendations-only member reads every link and
  // simply has no create affordance — no 403, no dead button.
  const snapshots = trpc.ai.listScenarioAnalyses.useQuery(
    { dealId },
    { enabled: hasFeature(user, "scenarios") },
  );
  // Firm-wide, not deal-scoped, so it is fetched once per panel and sliced per
  // card — the same "a card never queries for itself" rule as outcomes and
  // links. Gated on `analytics`, so a recommendations-only member simply sees
  // no advisory: no 403, no dead affordance, exactly like the snapshot picker.
  const patterns = trpc.patterns.list.useQuery(undefined, {
    enabled: hasFeature(user, "analytics"),
  });
  // The deal's close anchor — the ONE fact this panel lacks for the read
  // schedule. Resolved server-side inside a recommendations-gated procedure,
  // because milestones-router gates everything on `timeline` and fetching the
  // closing milestone here would 403 the dossier for anyone without it.
  const anchor = trpc.recommendations.outcomeSchedule.useQuery({ dealId });

  const invalidate = () => {
    utils.recommendations.readiness.invalidate({ dealId });
    utils.recommendations.decisionHealth.invalidate({ dealId });
    utils.recommendations.packEvidence.invalidate({ dealId });
    utils.recommendations.list.invalidate({ dealId });
    utils.recommendations.listOutcomes.invalidate({ dealId });
    utils.recommendations.listScenarioLinks.invalidate({ dealId });
    utils.decisions.list.invalidate({ dealId });
    utils.activity.list.invalidate();
  };
  const closeForm = () => {
    setFormFor(null);
    setClaim("");
    setRationale("");
    setConfidence("60");
    setExpiresAt("");
    setAgainst([emptyAgainst()]);
    setErr(null);
  };
  const onDone = () => {
    invalidate();
    closeForm();
  };
  const onFail = (e: { message: string }) => setErr(e.message);

  const create = trpc.recommendations.create.useMutation(withToast({ done: "Recommendation recorded", failed: "Could not record that recommendation" }, { onSuccess: onDone, onError: onFail }));
  const update = trpc.recommendations.update.useMutation(withToast({ done: "Recommendation updated", failed: "Could not save those changes", silentOnSuccess: true }, { onSuccess: onDone, onError: onFail }));
  const supersede = trpc.recommendations.supersede.useMutation(withToast({ done: "Recommendation superseded", failed: "Could not supersede that recommendation" }, { onSuccess: onDone, onError: onFail }));
  const accept = trpc.recommendations.accept.useMutation(withToast({ done: "Recommendation accepted", failed: "Could not accept that recommendation" }, { onSuccess: invalidate, onError: onFail }));
  const reject = trpc.recommendations.reject.useMutation(withToast({ done: "Recommendation rejected", failed: "Could not reject that recommendation" }, { onSuccess: invalidate, onError: onFail }));
  const draft = trpc.ai.draftRecommendations.useMutation(withToast({ done: "Draft ready", failed: "Could not draft a recommendation" }, { onSuccess: invalidate, onError: onFail }));
  const recordOutcome = trpc.recommendations.recordOutcome.useMutation(withToast({ done: "Outcome recorded", failed: "Could not record that outcome" }, {
    onSuccess: invalidate,
    onError: onFail,
  }));
  const linkScenario = trpc.recommendations.linkScenario.useMutation(withToast({ done: "Scenario linked", failed: "Could not link that scenario", silentOnSuccess: true }, {
    onSuccess: invalidate,
    onError: onFail,
  }));
  const unlinkScenario = trpc.recommendations.unlinkScenario.useMutation(withToast({ done: "Scenario unlinked", failed: "Could not unlink that scenario", silentOnSuccess: true }, {
    onSuccess: invalidate,
    onError: onFail,
  }));

  const rows = useMemo(() => list.data ?? [], [list.data]);

  /** The deal's outcomes, split per recommendation once rather than per card. */
  const outcomeRows = useMemo(() => outcomes.data ?? [], [outcomes.data]);
  const outcomesByRec = useMemo(() => {
    const m = new Map<number, typeof outcomeRows>();
    for (const o of outcomeRows) {
      m.set(o.recommendationId, [...(m.get(o.recommendationId) ?? []), o]);
    }
    return m;
  }, [outcomeRows]);

  // sortPatterns already put the most consequential first, so the head of the
  // match list is the worst one — and one line is all a card should carry.
  const patternRows = useMemo(() => patterns.data?.patterns ?? [], [patterns.data]);
  const advisoriesByRec = useMemo(() => {
    const m = new Map<number, typeof patternRows>();
    if (patternRows.length === 0) return m;
    for (const r of rows) {
      const hit = patternRows.find((p) => matchesPattern(r, p, confidenceBand));
      if (hit) m.set(r.id, [hit]);
    }
    return m;
  }, [patternRows, rows]);

  // The read schedule, per card, from one anchor — a card never resolves its own.
  const closeDate = anchor.data?.closeDate ?? null;
  const scheduleByRec = useMemo(() => {
    const m = new Map<number, HorizonStatus[]>();
    for (const r of rows) {
      const states = horizonStates(r, outcomesByRec.get(r.id) ?? [], closeDate);
      if (states.length > 0) m.set(r.id, states);
    }
    return m;
  }, [rows, outcomesByRec, closeDate]);

  const owedTotal = useMemo(
    () => [...scheduleByRec.values()].reduce((n, s) => n + owedCount(s), 0),
    [scheduleByRec],
  );

  const linkRows = useMemo(() => links.data ?? [], [links.data]);
  const linksByRec = useMemo(() => {
    const m = new Map<number, typeof linkRows>();
    for (const l of linkRows) {
      m.set(l.recommendationId, [...(m.get(l.recommendationId) ?? []), l]);
    }
    return m;
  }, [linkRows]);

  const nextStage = DEAL_STAGES[stageOrdinal(currentStage) + 1] as DealStage | undefined;
  // The banner's whole state, from the same module the server enforces with.
  const gate = useMemo(() => gateState(rows, currentStage, nextStage), [rows, currentStage, nextStage]);
  const gateHeadline = nextStage ? (readiness.isError ? "Readiness unavailable. Refresh to retry." : readiness.data?.message ?? "Checking advancement readiness…").replace(/^[A-Z_]+: /, "") : null;
  const gateLocked = readiness.data?.kind !== "clear" && readiness.data?.kind !== "not_gated";

  // When drafts are the only thing standing between this deal and its next
  // stage, open on them — the user should land on what is blocking them rather
  // than hunt for it. An explicit click always wins.
  const effectiveFilter: Filter =
    filter ?? (gate.kind === "locked" && gate.reason === "drafts_pending" ? "draft" : "all");

  const visible = rows
    .filter((r) => effectiveFilter === "all" || r.status === effectiveFilter)
    .slice()
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const acceptedCount = rows.filter((r) => r.status === "accepted").length;
  const busy = accept.isPending || reject.isPending || supersede.isPending;

  const submit = () => {
    const cleaned = against
      .filter((c) => c.point.trim().length >= 3)
      .map((c) => ({
        point: c.point.trim(),
        weight: c.weight,
        response: c.response?.trim() ? c.response.trim() : null,
      }));
    if (claim.trim().length < 10) return setErr("A claim needs to be a sentence someone could argue with.");
    if (rationale.trim().length < 20) return setErr("Give at least a sentence of reasoning.");
    // Mirrors the server's rule, so Accept never fails for a reason the form
    // could have told you about first. Deliberately NOT applied to the edit
    // path: saving a draft with an unanswered fatal is legal — only accepting
    // it isn't, and answering it is exactly what the edit is for.
    if (formFor?.mode === "supersede" && !canAccept(cleaned)) {
      return setErr("Answer the fatal counterargument — a superseding recommendation is accepted immediately.");
    }
    const payload = {
      claim: claim.trim(),
      rationale: rationale.trim(),
      counterarguments: cleaned,
      confidence: Math.max(0, Math.min(100, Math.round(Number(confidence) || 50))),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    };
    if (formFor?.mode === "supersede") supersede.mutate({ id: formFor.id, ...payload });
    else if (formFor?.mode === "edit") update.mutate({ id: formFor.id, ...payload });
    else create.mutate({ dealId, stage, ...payload });
  };

  /** Load a row into the form. Shared by Edit draft and Supersede. */
  const loadForm = (r: (typeof rows)[number], mode: "edit" | "supersede") => {
    setErr(null);
    setClaim(r.claim);
    setRationale(r.rationale);
    setConfidence(String(r.confidence));
    setExpiresAt(r.expiresAt ? new Date(r.expiresAt).toISOString().slice(0, 10) : "");
    setAgainst(r.counterarguments.length ? r.counterarguments.map((c) => ({ ...c })) : [emptyAgainst()]);
    setFormFor({ mode, id: r.id });
  };

  return (
    // `id` is the anchor DecisionCard's "Record the reads" link targets.
    // Card spreads ...rest, so this needs no component change.
    <Card className="p-6" id="recommendations" data-testid="recommendations">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
            Recommendations
          </h3>
          <p className="mt-1 font-sans text-[12.5px]" style={{ color: "var(--fg-2)" }}>
            What this deal's analysis adds up to — claim, evidence, and what argues against it.
          </p>
        </div>
        {rows.length > 0 && (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
              {acceptedCount}/{rows.length} accepted
            </span>
            {/* Sits beside the gate banner, where a reader is already asking
                "what does this deal need from me". */}
            {owedTotal > 0 && (
              <span
                data-testid="rec-owed-badge"
                className="font-mono text-[length:var(--step-xs)]"
                style={{ color: "var(--sev-watch-text)" }}
              >
                {owedTotal} read{owedTotal === 1 ? "" : "s"} owed
              </span>
            )}
          </div>
        )}
      </div>

      {gateHeadline && (
        <div className="mt-4">
          <p
            data-testid="rec-gate-banner"
            className="rounded-sm border px-3 py-2 font-sans text-[12.5px]"
            // The LABEL takes the `-text` cut, the border and tint keep the
            // base token. This is 12.5px prose, so it owes 4.5:1, and the base
            // severity colours are tuned to be a fill and an edge rather than
            // body text — `--sev-watch` measures 3.3:1 on this card even after
            // the theme was taught its own base values. The border and the 8%
            // wash are graphics and stay where they were.
            style={{
              color: gateLocked ? "var(--sev-watch-text)" : "var(--sev-grounded-text)",
              borderColor: `color-mix(in srgb, ${gateLocked ? "var(--sev-watch)" : "var(--sev-grounded)"} 40%, transparent)`,
              background: `color-mix(in srgb, ${gateLocked ? "var(--sev-watch)" : "var(--sev-grounded)"} 8%, transparent)`,
            }}
          >
            {/* Rendered from the shared module, so this is character-for-character
                the sentence decisions.record returns if the move is attempted. */}
            {gateHeadline}
          </p>
          {gate.kind === "locked" && gate.reason === "drafts_pending" && (
            <p className="mt-1.5 font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
              AI proposed these. Only a human concludes.
            </p>
          )}
          {gate.kind === "locked" && gate.reason === "none" && (
            <p className="mt-1.5 font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
              Review the evidence and objections before accepting a recommendation. Other advancement checks may still apply.
            </p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-4">
          <p className="font-sans text-[13px]" style={{ color: "var(--fg-2)", maxWidth: "62ch" }}>
            Nothing concluded yet. A recommendation turns the analysis on this deal into a claim someone
            is accountable for — with the evidence it rests on, the case against it, and a date it stops
            being current. Draft one from what is already on file, or write your own.
            {gateLocked && nextStage && (
              <>
                {" "}
                Until one exists, this deal cannot move into {nextStage}.
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => draft.mutate({ dealId })}
              disabled={draft.isPending}
              data-testid="rec-draft-ai"
              className="rounded-full px-5 py-2.5 font-sans text-[13px] font-medium disabled:opacity-50"
              style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
            >
              {draft.isPending ? "Drafting…" : "Draft with AI"}
            </button>
            <button
              type="button"
              onClick={() => { setErr(null); setFormFor({ mode: "create" }); }}
              data-testid="rec-write"
              className="rounded-full border px-5 py-2.5 font-sans text-[13px] disabled:opacity-50"
              style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)", minHeight: 44 }}
            >
              Write one
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => {
              const on = effectiveFilter === f;
              const n = f === "all" ? rows.length : rows.filter((r) => r.status === f).length;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  data-testid={`rec-filter-${f}`}
                  aria-pressed={on}
                  className="rounded-full border px-3 py-1.5 ansyra-label"
                  style={{
                    borderColor: on ? "var(--fg)" : "var(--fg-rule)",
                    background: on ? "var(--sev-grounded)" : "var(--fg-surface)",
                    color: on ? "#fff" : "var(--fg-2)",
                    minHeight: 44,
                  }}
                >
                  {FILTER_LABELS[f]} {n}
                </button>
              );
            })}
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => draft.mutate({ dealId })}
                disabled={draft.isPending}
                data-testid="rec-draft-ai"
                className="rounded-full border px-4 py-2 font-sans text-[12.5px] disabled:opacity-50"
                style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)", minHeight: 44 }}
              >
                {draft.isPending ? "Drafting…" : "Draft with AI"}
              </button>
              <button
                type="button"
                onClick={() => { setErr(null); setFormFor({ mode: "create" }); }}
                data-testid="rec-write"
                className="rounded-full px-4 py-2 font-sans text-[12.5px] font-medium"
                style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
              >
                Write one
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {visible.length === 0 ? (
              <p className="font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
                None {effectiveFilter === "all" ? "" : `${FILTER_LABELS[effectiveFilter].toLowerCase()} `}on this deal.
              </p>
            ) : (
              visible.map((r) => (
                <RecommendationCard
                  key={r.id}
                  rec={r}
                  busy={busy}
                  outcomes={outcomesByRec.get(r.id)}
                  scenarioLinks={linksByRec.get(r.id)}
                  snapshots={snapshots.data ?? []}
                  advisories={advisoriesByRec.get(r.id)}
                  schedule={scheduleByRec.get(r.id)}
                  onAccept={() => { setErr(null); accept.mutate({ id: r.id }); }}
                  onReject={() => { setErr(null); reject.mutate({ id: r.id }); }}
                  onEdit={() => loadForm(r, "edit")}
                  onSupersede={() => loadForm(r, "supersede")}
                  onRecordOutcome={(o) => {
                    setErr(null);
                    recordOutcome.mutate({ recommendationId: r.id, ...o });
                  }}
                  onLinkScenario={(l) => {
                    setErr(null);
                    linkScenario.mutate({ recommendationId: r.id, ...l });
                  }}
                  onUnlinkScenario={(id) => { setErr(null); unlinkScenario.mutate({ id }); }}
                />
              ))
            )}
          </div>
        </>
      )}

      {err && (
        <p className="mt-3 font-sans text-[12.5px]" style={{ color: "var(--sev-flag-text)" }}>
          {err}
        </p>
      )}

      {formFor && (
        <Modal
          title={
            formFor.mode === "supersede"
              ? "Supersede this recommendation"
              : formFor.mode === "edit"
                ? "Edit this draft"
                : "Write a recommendation"
          }
          onClose={closeForm}
        >
          <div className="space-y-4">
            {formFor.mode === "supersede" && (
              <p className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                The original stays on the record, marked superseded. The replacement is accepted
                immediately and keeps its stage.
              </p>
            )}
            {formFor.mode === "edit" && (
              <p className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                A draft can still be changed freely — nobody has claimed it yet. Once it is accepted
                or rejected it becomes part of the record and can only be superseded.
              </p>
            )}

            <Field required label="Claim">
              <Textarea
                value={claim}
                onChange={setClaim}
                rows={2}
                placeholder="Proceed with an LOI at 12x EBITDA, structured 60% cash / 40% stock."
              />
            </Field>

            <Field required label="Rationale">
              <Textarea
                value={rationale}
                onChange={setRationale}
                rows={4}
                placeholder="Why you believe it, and what in the analysis carries the weight."
              />
            </Field>

            {formFor.mode === "create" && (
              <Field required label="Stage this conclusion was reached at">
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as DealStage)}
                  data-testid="rec-stage"
                  className="w-full rounded-sm border px-3 py-2 font-sans text-sm capitalize outline-none transition-colors focus:border-[var(--fg)]"
                  style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
                >
                  {DEAL_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}{s === currentStage ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Confidence (0-100)">
                <TextInput value={confidence} onChange={setConfidence} placeholder="60" type="number" />
              </Field>
              <Field label="Expires (optional)">
                <TextInput value={expiresAt} onChange={setExpiresAt} placeholder="" type="date" />
              </Field>
            </div>

            <div>
              <p className="mb-1.5 ansyra-label" style={{ color: "var(--fg-2)" }}>
                Counterarguments
              </p>
              <p className="mb-2 font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
                The strongest case against, and your answer to it. A fatal objection with no answer
                blocks acceptance.
              </p>
              <div className="space-y-3">
                {against.map((c, i) => (
                  <div key={i} className="rounded-sm border p-3" style={{ borderColor: "var(--fg-rule)" }}>
                    <Textarea
                      value={c.point}
                      onChange={(v) => setAgainst((prev) => prev.map((x, j) => (j === i ? { ...x, point: v } : x)))}
                      rows={2}
                      placeholder="No independent quality-of-earnings has been run."
                    />
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr]">
                      <select
                        value={c.weight}
                        onChange={(e) =>
                          setAgainst((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, weight: e.target.value as CounterargumentWeight } : x)),
                          )
                        }
                        aria-label={`Weight of counterargument ${i + 1}`}
                        data-testid={`rec-weight-${i}`}
                        className="rounded-sm border px-2 py-2 font-sans text-[12px] capitalize"
                        style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}
                      >
                        {COUNTERARGUMENT_WEIGHTS.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                      <TextInput
                        value={c.response ?? ""}
                        onChange={(v) => setAgainst((prev) => prev.map((x, j) => (j === i ? { ...x, response: v } : x)))}
                        placeholder="Your answer — leave blank if you have none."
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAgainst((prev) => [...prev, emptyAgainst()])}
                data-testid="rec-add-counter"
                className="mt-2 font-sans text-[12px] underline-offset-4 hover:underline"
                style={{ color: "var(--fg-2)" }}
              >
                Add another
              </button>
            </div>

            {err && (
              <p className="font-sans text-[12px]" style={{ color: "var(--sev-flag-text)" }}>
                {err}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full border px-4 py-2 font-sans text-[13px]"
                style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)", minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={create.isPending || supersede.isPending || update.isPending}
                data-testid="rec-submit"
                className="rounded-full px-5 py-2 font-sans text-[13px] disabled:opacity-60"
                style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
              >
                {create.isPending || supersede.isPending || update.isPending
                  ? "Saving…"
                  : formFor.mode === "supersede"
                    ? "Supersede"
                    : "Save draft"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
