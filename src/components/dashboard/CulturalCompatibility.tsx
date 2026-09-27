import { ReviewHistory } from "./ReviewHistory";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { Card } from "./parchment/Card";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import { Field, TextInput } from "./DealPipeline";
import { culturalStore, useTabStore } from "@/lib/tab-stores";
import { AiDisclaimer } from "@/components/AiDisclaimer";
import { DealSelector } from "./DealSelector";

interface Deal { id: number; name: string; targetCompany: string; industry: string | null }


export function CulturalCompatibility({ deals }: { deals: Deal[] }) {
  // Inputs survive remounts in the module store; results live in Postgres.
  const input = useTabStore(culturalStore);
  const { acquirer, target, sector, dealId } = input;
  const staleDeal = dealId != null && !deals.some((d) => d.id === dealId);
  const set = (patch: Partial<typeof input>) => culturalStore.set((p) => ({ ...p, ...patch }));

  const [evidenceContext, setEvidenceContext] = useState("");
  const utils = trpc.useUtils();
  const history = trpc.ai.listCulturalScores.useQuery();
  const score = trpc.ai.culturalCompatibility.useMutation(withToast({ done: "Cultural read complete", failed: "Could not run the cultural read" }, {
    onSuccess: () => {
      utils.ai.listCulturalScores.invalidate();
      utils.activity.list.invalidate();
    },
  }));
  const remove = trpc.ai.deleteCulturalScore.useMutation(withToast({ done: "Score removed", failed: "Could not remove that score" }, {
    onSuccess: () => utils.ai.listCulturalScores.invalidate(),
  }));

  const pick = (d: Deal) => set({ dealId: d.id, target: d.targetCompany, sector: d.industry ?? "" });

  const scores = history.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
          Pull a deal to prefill, or type any two companies
        </p>
        <div className="mt-3"><DealSelector deals={deals} value={dealId} onChange={(id) => { const d = deals.find((d) => d.id === id); if (d) pick(d); }} /></div>
        {staleDeal && <p role="alert" className="mt-3">The selected deal is no longer available. Choose another deal or <button className="underline" onClick={() => set({ dealId: null })}>continue without a deal</button>.</p>}
        <form
          className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (acquirer && target && !staleDeal && !score.isPending) {
              score.mutate({ evidenceContext,  acquirer, target, sector: sector || undefined, dealId });
            }
          }}
        >
          <Field label="Acquirer"><TextInput value={acquirer} onChange={(v) => set({ acquirer: v })} required placeholder="Ansyra Capital" /></Field>
          <Field label="Target"><TextInput value={target} onChange={(v) => set({ target: v })} required placeholder="Meridian Health" /></Field>
          <Field label="Sector (optional)"><TextInput value={sector} onChange={(v) => set({ sector: v })} placeholder="Healthcare" /></Field>
          <div className="md:col-span-3"><label className="block font-sans text-sm" style={{ color: "var(--fg-2)" }}>Evidence and context (optional)<textarea value={evidenceContext} onChange={(e) => setEvidenceContext(e.target.value)} maxLength={12000} rows={3} className="mt-2 block w-full rounded-sm border p-3" style={{ borderColor: "var(--fg-rule)", background: "var(--clear)", color: "var(--fg)" }} placeholder="Paste relevant notes and name their sources. Without evidence, the review identifies questions only." /></label></div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={score.isPending || staleDeal}
              data-testid="cultural-score-btn"
              className="rounded-full px-6 py-3 font-sans text-sm"
              style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
            >
              {score.isPending ? "Preparing diligence questions…" : "Prepare people review"}
            </button>
          </div>
        </form>
        {score.error && <p className="mt-3 font-sans text-[12px]" style={{ color: "var(--sev-flag-text)" }}>{score.error.message}</p>}
      </Card>

      {history.isError && <p role="alert" className="font-sans text-sm" style={{ color: "var(--sev-flag-text)" }}>Saved reviews could not load. Refresh to retry; this does not mean there are no findings.</p>}
      {history.isLoading && (
        <Card>
          <LoadingAnnounce what="saved scores" />
          <SkeletonRows rows={3} />
        </Card>
      )}

      <ReviewHistory reviews={scores} heading={(row) => `${row.acquirer} × ${row.target}`} onDelete={(id) => remove.mutate({ id })} />

      {!history.isLoading && !history.isError && scores.length === 0 && (
        <Card>
          <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
            No people reviews recorded. Supply context to prepare questions about leadership, retention, and integration.
          </p>
        </Card>
      )}
      <AiDisclaimer />
    </div>
  );
}
