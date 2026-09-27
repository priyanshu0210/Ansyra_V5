import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Card } from "./parchment/Card";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import { ScenarioCards } from "./ScenarioCards";
import { Field, Textarea, TextInput } from "./DealPipeline";
import { assumptionInputStore, useTabStore } from "@/lib/tab-stores";
import { AiDisclaimer } from "@/components/AiDisclaimer";
import { RED_FLAG_OPTIMISM, blockingAssumptions } from "@contracts/assumption-gate";
import { severityFor } from "@/lib/severity";
import { DealSelector } from "./DealSelector";

interface Deal { id: number; name: string; targetCompany: string; stage: string }

// D3. Was a local copy of the same mapping the landing rendered, with the
// thresholds typed out a second time. It now reads the shared module, so a
// score is lit identically in the product and in the marketing claim about the
// product. That parity is the point: the landing says the ledger works this
// way, and this is the ledger.
//
// It reads `textColor`, NOT `color`. The base tokens are tuned for the landing's
// backlit rows; on this dark card they measure 3.06:1 (flag) and 3.30:1
// (grounded), and the band label is 12px type owing 4.5:1. The `-text` cuts are
// the same roles solved for text.
function scoreTone(score: number) {
  const s = severityFor(score);
  return { color: s.textColor, label: s.label };
}

export function AssumptionLedger({ deals }: { deals: Deal[] }) {
  // Results live in Postgres (ai.listAssumptions) — a refresh or remount can
  // never lose them. Only the in-progress *input* stays in a module store.
  const input = useTabStore(assumptionInputStore);
  const utils = trpc.useUtils();
  const history = trpc.ai.listAssumptions.useQuery();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Default the picker to the first available deal on first ever mount.
  useEffect(() => {
    if (!deals.some((d) => d.id === input.dealId)) {
      assumptionInputStore.set((p) => p.dealId === (deals[0]?.id ?? null) ? p : ({ ...p, dealId: deals[0]?.id ?? null }));
    }
  }, [deals, input.dealId]);

  const setDealId = (id: number) => assumptionInputStore.set((p) => ({ ...p, dealId: id }));
  const setText   = (v: string) => assumptionInputStore.set((p) => ({ ...p, text: v }));
  const setReviewer = (v: string) => assumptionInputStore.set((p) => ({ ...p, reviewer: v }));

  const stressTest = trpc.ai.stressTestAssumption.useMutation({
    onSuccess: (row) => {
      assumptionInputStore.set((p) => ({ ...p, text: "" }));
      utils.ai.listAssumptions.invalidate();
      utils.activity.list.invalidate();
      // The toast carries the VERDICT, not "saved". The score is the whole
      // reason the reader pressed the button, and a red flag has a consequence
      // they need to know about even if they have already scrolled away.
      const score = row?.result?.optimismScore;
      const blocks = typeof score === "number" && score > RED_FLAG_OPTIMISM;
      toast[blocks ? "warning" : "success"](
        typeof score === "number" ? `Scored ${score}` : "Assumption stress-tested",
        {
          description: blocks
            ? "Red flag. This deal cannot advance until a second reviewer answers it."
            : "Added to the ledger.",
        },
      );
    },
    // Inline only. `submitError` renders directly under the form the reader is
    // still looking at, which is the better place for it; adding a toast made
    // one rejection say the same thing twice.
    onError: (e) => setSubmitError(e.message),
  });
  const deal = useMemo(() => deals.find((d) => d.id === input.dealId) ?? null, [deals, input.dealId]);
  const rows = useMemo(
    () => (history.data ?? []).filter((r) => r.dealId === input.dealId),
    [history.data, input.dealId],
  );

  // UNDO IS A RE-CREATE, AND IT IS HONEST ABOUT WHAT IT RESTORES.
  //
  // `deleteAssumption` is a hard delete with no server-side restore, so undo
  // re-runs the stress test rather than pretending to resurrect the row. That
  // means a NEW score, which is why the toast says so: offering "Undo" and
  // silently producing a different number would be worse than offering nothing.
  const deleteAssumption = trpc.ai.deleteAssumption.useMutation({
    onSuccess: (_res, vars) => {
      utils.ai.listAssumptions.invalidate();
      const removed = (history.data ?? []).find((r) => r.id === vars.id);
      toast.success("Assumption removed", {
        description: removed?.assumption?.slice(0, 80),
        action: removed && deal
          ? {
              label: "Undo",
              onClick: () =>
                stressTest.mutate({
                  dealId: deal.id,
                  assumption: removed.assumption,
                  reviewer: removed.reviewer ?? undefined,
                }),
            }
          : undefined,
      });
    },
    onError: (e) =>
      toast.error("Could not remove that assumption", {
        description: e.message || "It may already be gone. Reload to check.",
      }),
  });

  // Same predicate the server enforces in decisions.record — imported, not
  // reimplemented, so this banner can never claim a gate the server won't hold.
  const blocking = useMemo(() => blockingAssumptions(rows), [rows]);
  const gateBlocked = blocking.length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deal || !input.text.trim() || stressTest.isPending) return;
    setSubmitError(null);
    stressTest.mutate({
      dealId: deal.id,
      assumption: input.text.trim(),
      reviewer: input.reviewer || undefined,
    });
  };

  const { dealId, text, reviewer } = input;

  if (deals.length === 0) {
    return (
      <Card>
        <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
          No deals to test yet. Create one from the Deal Pipeline tab and every thesis you write will be stress-tested here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="font-sans text-sm leading-relaxed" style={{ color: "var(--fg-2)" }}>The optimism indicator is an AI assessment, not a probability of failure. Above 80 triggers a human review under this app’s rules. A written answer keeps the issue open until someone resolves it or explicitly accepts the risk with a reason and evidence.</p>
      <Card>
        <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Select deal</p>
        <div className="mt-2"><DealSelector deals={deals} value={dealId} onChange={setDealId} /></div>
      </Card>

      {deal && (
        <>
          <Card>
            <form onSubmit={submit} className="space-y-4">
              <Field required label="Write an assumption to stress-test">
                <Textarea value={text} onChange={setText} placeholder="e.g. Post-close, we can lift EBITDA margin from 18% to 26% within 24 months by consolidating procurement." rows={3} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Author"><TextInput value={reviewer} onChange={setReviewer} placeholder="Your name" /></Field>
                <div className="flex items-end justify-end">
                  <button
                    type="submit"
                    disabled={stressTest.isPending}
                    data-testid="stress-test-btn"
                    className="rounded-full px-6 py-3 font-sans text-sm"
                    style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
                  >
                    {stressTest.isPending ? "Analysing…" : "Stress-test with AI"}
                  </button>
                </div>
              </div>
              {submitError && (
                <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }}>{submitError}</p>
              )}
            </form>
          </Card>

          {gateBlocked && (
            <div
              className="rounded-sm border-l p-4"
              style={{ borderColor: "var(--sev-flag)", background: "color-mix(in srgb, var(--sev-flag) 8%, var(--fg-surface))", color: "var(--sev-flag-text)" }}
              data-testid="gate-warning"
            >
              <p className="font-serif text-lg">Advancement gate: locked.</p>
              <p className="mt-1 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
                {blocking.length === 1 ? "One assumption scored" : `${blocking.length} assumptions scored`} above{" "}
                {RED_FLAG_OPTIMISM} with no written response from a second reviewer.{" "}
                {deal ? `${deal.name} cannot advance to a later stage` : "This deal cannot advance to a later stage"}{" "}
                until {blocking.length === 1 ? "it is" : "they are"} answered below.
              </p>
            </div>
          )}

          {history.isLoading && (
            <>
              <LoadingAnnounce what="the assumption ledger" />
              <SkeletonRows rows={3} />
            </>
          )}

          {stressTest.isPending && (
            <Card>
              <p className="font-serif text-lg leading-snug" style={{ color: "var(--fg)" }}>&ldquo;{stressTest.variables?.assumption}&rdquo;</p>
              <p className="mt-3 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>Stress-testing the assumption…</p>
            </Card>
          )}

          <div className="space-y-3">
            {rows.map((row) => (
              <Card key={row.id} data-testid={`assumption-${row.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                      {row.reviewer || "You"} · {new Date(row.createdAt).toLocaleDateString()}
                    </p>
                    <p className="mt-1 font-serif text-lg leading-snug" style={{ color: "var(--fg)" }}>&ldquo;{row.assumption}&rdquo;</p>
                  </div>
                  <div className="flex items-start gap-3">
                    {row.result && (
                      <div className="flex flex-col items-end">
                        <p className="font-serif text-4xl leading-none" style={{ color: scoreTone(row.result.optimismScore).color }}>{row.result.optimismScore}</p>
                        <p className="ansyra-label" style={{ color: scoreTone(row.result.optimismScore).color }}>{scoreTone(row.result.optimismScore).label}</p>
                      </div>
                    )}
                    <button
                      onClick={() => deleteAssumption.mutate({ id: row.id })}
                      title="Delete this entry"
                      className="rounded-full border px-2 py-0.5 font-sans text-[length:var(--step-xs)]"
                      style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {row.result && (
                  <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "var(--fg-rule)" }}>
                    <p className="font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{row.result.reasoning}</p>
                    <p className="font-sans text-[13px]" style={{ color: "var(--fg)" }}>
                      <span className="ansyra-label" style={{ color: "var(--fg)" }}>Recommendation · </span>
                      {row.result.recommendation}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border px-3 py-0.5 ansyra-label" style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}>
                        AI self-assessed confidence · {row.result.confidence}
                      </span>
                      {row.result.comparables?.map((c) => (
                        <span key={c} className="rounded-full border px-3 py-0.5 font-mono text-[length:var(--step-xs)]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}>{c}</span>
                      ))}
                    </div>
                    {row.result.optimismScore > 80 && (
                      <ReviewerNote
                        assumptionId={row.id}
                        existingNote={row.reviewerNote}
                        reviews={row.result.reviewHistory ?? []}
                        onSaved={() => { utils.ai.listAssumptions.invalidate(); utils.ai.blockingByDeal.invalidate(); utils.assumptionLedger.invalidate(); utils.recommendations.invalidate(); }}
                      />
                    )}
                  </div>
                )}
              </Card>
            ))}
            {!history.isLoading && rows.length === 0 && !stressTest.isPending && (
              <Card>
                <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
                  No assumptions logged for {deal.name} yet. Every stress-test is saved here permanently — this is the deal&apos;s institutional memory.
                </p>
              </Card>
            )}
          </div>

          {/* Scenario analysis (Phase 15.6) — composes these assumptions into
              base/upside/downside. Needs >= 2 tested; the component says so. */}
          <div className="mt-6">
            <ScenarioCards
              dealId={deal.id}
              testedCount={rows.filter((r) => !!r.result).length}
            />
          </div>
        </>
      )}
      <AiDisclaimer />
    </div>
  );
}

// Second-reviewer note: local draft, persisted on save. A saved note unlocks
// the advancement gate for that assumption.
function ReviewerNote({
  assumptionId,
  existingNote,
  reviews,
  onSaved,
}: {
  assumptionId: number;
  existingNote: string | null;
  reviews: import("@contracts/assumption-gate").AssumptionReview[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(existingNote ?? "");
  const [editing, setEditing] = useState(!reviews.length);
  const [outcome, setOutcome] = useState<"answered" | "resolved" | "risk_accepted">("answered");
  const [evidence, setEvidence] = useState("");
  const save = trpc.ai.addReviewerNote.useMutation({
    onSuccess: () => {
      setEditing(false);
      onSaved();
      // This is the write that unlocks a stage advance, so the confirmation
      // says what it unlocked rather than that a field was saved.
      toast.success("Response recorded", {
        description: outcome === "answered" ? "Response saved. The concern remains open." : "Review recorded with your identity and supporting evidence.",
      });
    },
    onError: (e) =>
      toast.error("Could not save that response", {
        description: e.message || "Your text is still in the box. Try again.",
      }),
  });

  if (!editing && existingNote) {
    return (
      <div className="mt-2">
        <p className="ansyra-label" style={{ color: "var(--sev-grounded-text)" }}>Review recorded · {reviews.at(-1)?.outcome.replaceAll("_", " ")}</p>
        <p className="mt-1 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>{existingNote}</p>
        <details className="mt-2 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}><summary>Review history ({reviews.length})</summary>{reviews.map((r) => <p key={r.reviewedAt} className="mt-2">{r.outcome.replaceAll("_", " ")} · {new Date(r.reviewedAt).toLocaleString()} · reviewer {r.reviewedBy}<br />{r.reason}<br />Evidence: {r.evidence}</p>)}</details>
        <button
          onClick={() => setEditing(true)}
          className="mt-1 font-sans text-[length:var(--step-xs)] underline underline-offset-2"
          style={{ color: "var(--fg-2)" }}
        >
          Add a review
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="ansyra-label" style={{ color: "var(--sev-flag-text)" }}>Review required</p>
      <Field required label="Review explanation">
      <Textarea required
        value={draft}
        onChange={setDraft}
        placeholder="Why is this assumption defensible despite the flag?"
        rows={2}
      />
      </Field>
      <label className="mt-3 block font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>Review outcome
        <select required value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className="mt-1 block w-full rounded-sm border p-2" style={{ background: "var(--clear)", color: "var(--fg)", borderColor: "var(--fg-rule)" }}>
          <option value="answered">Answered · concern remains open</option><option value="resolved">Resolved with evidence</option><option value="risk_accepted">Risk explicitly accepted</option>
        </select>
      </label>
      <label className="mt-3 block font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>Supporting evidence · document, page, or recorded rationale
        <Textarea required value={evidence} onChange={setEvidence} rows={2} placeholder="Name the source and explain what supports this review." />
      </label>
      <p className="mt-2 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>Your identity and review time are recorded. Earlier reviews are retained.</p>
      <button
        onClick={() => draft.trim() && save.mutate({ id: assumptionId, reviewerNote: draft.trim(), outcome, evidence: evidence.trim() })}
        disabled={save.isPending || draft.trim().length < 10 || evidence.trim().length < 3}
        className="mt-2 rounded-full border px-4 py-1.5 font-sans text-[12px] disabled:opacity-40"
        style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}
      >
        {save.isPending ? "Saving…" : "Record review"}
      </button>
    </div>
  );
}
