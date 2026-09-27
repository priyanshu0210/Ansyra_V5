import { ReviewHistory } from "./ReviewHistory";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { Card } from "./parchment/Card";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import { Field, TextInput } from "./DealPipeline";
import { regulatoryStore, useTabStore } from "@/lib/tab-stores";
import { AiDisclaimer } from "@/components/AiDisclaimer";
import { DealSelector } from "./DealSelector";

interface Deal { id: number; name: string; targetCompany: string; industry: string | null }


export function RegulatoryRadar({ deals }: { deals: Deal[] }) {
  // Inputs survive remounts in the module store; results live in Postgres.
  const input = useTabStore(regulatoryStore);
  const { target, sector, geography, share, dealId } = input;
  const staleDeal = dealId != null && !deals.some((d) => d.id === dealId);
  const set = (patch: Partial<typeof input>) => regulatoryStore.set((p) => ({ ...p, ...patch }));

  const [evidenceContext, setEvidenceContext] = useState("");
  const [acquirer, setAcquirer] = useState("");
  const utils = trpc.useUtils();
  const history = trpc.ai.listRegulatoryAnalyses.useQuery();
  const assess = trpc.ai.regulatoryRadar.useMutation(withToast({ done: "Regulatory read complete", failed: "Could not run the regulatory read" }, {
    onSuccess: () => {
      utils.ai.listRegulatoryAnalyses.invalidate();
      utils.activity.list.invalidate();
    },
  }));
  const remove = trpc.ai.deleteRegulatoryAnalysis.useMutation(withToast({ done: "Analysis removed", failed: "Could not remove that analysis" }, {
    onSuccess: () => utils.ai.listRegulatoryAnalyses.invalidate(),
  }));

  const analyses = history.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Assess antitrust exposure</p>
        <div className="mt-3"><DealSelector deals={deals} value={dealId} onChange={(id) => { const d = deals.find((d) => d.id === id); if (d) set({ dealId: d.id, target: d.targetCompany, sector: d.industry ?? "" }); }} /></div>
        {staleDeal && <p role="alert" className="mt-3">The selected deal is no longer available. Choose another deal or <button className="underline" onClick={() => set({ dealId: null })}>continue without a deal</button>.</p>}
        <form
          className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (target && sector && !staleDeal && !assess.isPending) {
              assess.mutate({ evidenceContext, acquirer,  target, sector, geography, combinedMarketShare: share || undefined, dealId });
            }
          }}
        >
          <Field label="Target"><TextInput value={target} onChange={(v) => set({ target: v })} required placeholder="Meridian Health" /></Field>
          <Field label="Sector"><TextInput value={sector} onChange={(v) => set({ sector: v })} required placeholder="Digital health SaaS" /></Field>
          <Field label="Geography"><TextInput value={geography} onChange={(v) => set({ geography: v })} required placeholder="UK & EU" /></Field>
          <Field label="Combined market share"><TextInput value={share} onChange={(v) => set({ share: v })} placeholder="e.g. 34%" /></Field>
          <Field label="Acquirer"><TextInput value={acquirer} onChange={setAcquirer} required placeholder="Acquiring company" /></Field>
          <div className="md:col-span-2"><label className="block font-sans text-sm" style={{ color: "var(--fg-2)" }}>Evidence and context (optional)<textarea value={evidenceContext} onChange={(e) => setEvidenceContext(e.target.value)} maxLength={12000} rows={3} className="mt-2 block w-full rounded-sm border p-3" style={{ borderColor: "var(--fg-rule)", background: "var(--clear)", color: "var(--fg)" }} placeholder="Paste relevant notes and name their sources. Without evidence, the review identifies questions only." /></label></div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={assess.isPending || staleDeal}
              data-testid="regulatory-assess-btn"
              className="rounded-full px-6 py-3 font-sans text-sm"
              style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
            >
              {assess.isPending ? "Running merger control precedent…" : "Assess with AI"}
            </button>
          </div>
        </form>
        {assess.error && <p className="mt-3 font-sans text-[12px]" style={{ color: "var(--sev-flag-text)" }}>{assess.error.message}</p>}
      </Card>

      {history.isError && <p role="alert" className="font-sans text-sm" style={{ color: "var(--sev-flag-text)" }}>Saved reviews could not load. Refresh to retry; this does not mean there are no findings.</p>}
      {history.isLoading && (
        <Card>
          <LoadingAnnounce what="saved analyses" />
          <SkeletonRows rows={3} />
        </Card>
      )}

      <ReviewHistory reviews={analyses} heading={(row) => `${row.target} · ${row.geography}`} onDelete={(id) => remove.mutate({ id })} />

      {!history.isLoading && !history.isError && analyses.length === 0 && (
        <Card>
          <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
            No regulatory analyses yet. Run one above — every assessment is saved so your antitrust thinking builds up deal after deal.
          </p>
        </Card>
      )}
      <AiDisclaimer />
    </div>
  );
}
