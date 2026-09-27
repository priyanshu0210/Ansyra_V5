import { useCurrency } from "./currency";
import { MoneyInput } from "./MoneyInput";
import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { Card } from "./parchment/Card";
import {
  categoryTotals,
  isValidQuarter,
  periodVariances,
  worstQuarter,
  type SynergyPeriod,
} from "@contracts/synergy";
import { AiDisclaimer } from "@/components/AiDisclaimer";
import { StoredSynergyCategories, SynergyAnalysisSchema, LegacySynergyAnalysisSchema } from "@contracts/synergy-data";
import { DealSelector } from "./DealSelector";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import type { PhasedCategory } from "@contracts/synergy";

interface Deal { id: number; name: string; stage: string; targetCompany: string }

function verdictColor(v: string) {
  const s = v.toLowerCase();
  if (s.includes("behind") || s.includes("risk")) return "var(--sev-flag)";
  if (s.includes("track")) return "var(--sev-grounded)";
  if (s.includes("ahead")) return "var(--fg)";
  return "var(--sev-watch)";
}

export function SynergyEngine({ deals }: { deals: Deal[] }) {
  const fx = useCurrency();
  const integrationDeals = useMemo(() => deals.filter((d) => d.stage === "integration"), [deals]);
  const [selectedId, setDealId] = useState<number | null>(null);
  const deal = integrationDeals.find((d) => d.id === selectedId) ?? integrationDeals[0] ?? null;
  const dealId = deal?.id ?? null;

  const utils = trpc.useUtils();
  // The plan (numbers + last analysis) is persisted per deal.
  const plan = trpc.ai.getSynergyPlan.useQuery(
    { dealId: dealId! },
    { enabled: dealId != null },
  );
  // Drafts belong to the exact loaded record. Switching deals or receiving a
  // replacement cannot reuse numbers from the previous plan.
  const [draft, setDraft] = useState<{ source: typeof plan.data; cats: PhasedCategory[] } | null>(null);
  const parsed = StoredSynergyCategories.safeParse(plan.data?.categories);
  const dirty = draft !== null && draft.source === plan.data;
  const cats = dirty ? draft.cats : parsed.success ? parsed.data.map((c) => ({ ...c, ...categoryTotals(c) })) : [];
  const setCats = (update: (current: PhasedCategory[]) => PhasedCategory[]) => setDraft({ source: plan.data, cats: update(cats) });
  const modern = SynergyAnalysisSchema.safeParse(plan.data?.analysis);
  const legacy = LegacySynergyAnalysisSchema.safeParse(plan.data?.analysis);
  const result = modern.success ? modern.data : null;
  const analyze = trpc.ai.synergyAnalysis.useMutation(withToast({ done: "Synergy analysis complete", failed: "Could not run the synergy analysis" }, {
    onSuccess: (row) => {
      utils.ai.getSynergyPlan.setData({ dealId: row.dealId }, row);
      utils.activity.list.invalidate();
      setDraft(null);
    },
  }));
  const savePlan = trpc.ai.saveSynergyPlan.useMutation(withToast({ done: "Synergy plan saved", failed: "Could not save the synergy plan" }, {
    onSuccess: (row) => {
      utils.ai.getSynergyPlan.setData({ dealId: row.dealId }, row);
      setDraft(null);
    },
  }));

  if (integrationDeals.length === 0) {
    return (
      <Card>
        <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>Nothing in integration yet.</p>
        <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>
          The Synergy Reality Engine is only meaningful post-close. Move a deal to the &ldquo;Integration&rdquo; stage in the Deal Pipeline and it will appear here.
        </p>
      </Card>
    );
  }

  const setPlanned = (i: number, v: number) => { if (Number.isFinite(v)) setCats((c) => c.map((x, idx) => (idx === i ? { ...x, planned: v } : x))); };
  const setActual = (i: number, v: number) => { if (Number.isFinite(v)) setCats((c) => c.map((x, idx) => (idx === i ? { ...x, actual: v } : x))); };
  // Quarterly phasing (Phase 15.6). Periods are authoritative, so the category
  // totals shown here are recomputed from them — the same rule the server applies.
  const setPeriods = (i: number, periods: SynergyPeriod[]) => {
    setCats((c) =>
      c.map((x, idx) => {
        if (idx !== i) return x;
        const next = { ...x, periods };
        const t = categoryTotals(next);
        return { ...next, planned: t.planned, actual: t.actual };
      }),
    );
  };
  const runAnalysis = () => { if (deal) analyze.mutate({ dealId: deal.id, categories: cats }); };

  return (
    <div className="space-y-6">
      <p className="font-sans text-sm leading-relaxed" style={{ color: "var(--fg-2)" }}>Synergies are the extra benefits expected from combining businesses. Compare benefits with the cost and timing of achieving them: a saving promised for next year is not money earned today.</p>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Integration deals</p>
          <DealSelector deals={integrationDeals} value={dealId} onChange={(id) => { setDraft(null); setDealId(id); }} disabled={savePlan.isPending || analyze.isPending} />
        </div>
      </Card>

      {plan.isLoading ? <Card><LoadingAnnounce what="synergy plan" /><SkeletonRows rows={4} /></Card> : plan.isError ? (
        <Card><p role="alert">The synergy plan could not load.</p><button onClick={() => plan.refetch()}>Try again</button></Card>
      ) : !parsed.success ? (
        <Card><p role="status">Synergy data is unavailable for this deal.</p>
          {plan.data == null && deal && <NewSynergyCategory key={deal.id} pending={savePlan.isPending} onAdd={(category) => savePlan.mutate({ dealId: deal.id, categories: [category] })} />}
          {savePlan.isError && <p role="alert">The plan could not be saved. Please try again.</p>}
        </Card>
      ) : deal && (
        <Card key={deal.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
              Planned vs actual · {fx.money(cats.reduce((s, c) => s + c.planned, 0))} planned · {fx.money(cats.reduce((s, c) => s + c.actual, 0))} realised · inputs in {fx.currency} millions
            </p>
            {dirty && (
              <button
                onClick={() => deal && savePlan.mutate({ dealId: deal.id, categories: cats })}
                disabled={savePlan.isPending || analyze.isPending}
                className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)]"
                style={{ borderColor: "var(--fg)", color: "var(--fg)", background: "var(--fg-surface)" }}
              >
                {savePlan.isPending ? "Saving…" : "Save numbers"}
              </button>
            )}
          </div>
          <div className="mt-5 space-y-4">
            {cats.map((c, i) => {
              const max = Math.max(c.planned, c.actual, 1);
              const plannedPct = Math.max(0, (c.planned / max) * 100);
              const actualPct = Math.max(0, (c.actual / max) * 100);
              return (
                <div key={c.category}>
                  {/* WRAPS, AND HAS A GAP. This was `flex justify-between` with
                      neither. At 375px the longer category labels ("Revenue",
                      "Headcount") butted straight against the two number inputs
                      and pushed the group 35px past the card, where an ancestor
                      clipped it — so the "Actual" field was off-screen and
                      unreachable on a phone. `justify-between` hides that: it
                      keeps the two children apart right up until there is no
                      room, then silently overflows instead of wrapping. */}
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>{c.category}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
                      <label className="flex items-center gap-1">Planned <MoneyInput readOnly={!!c.periods?.length} title={c.periods?.length ? "Calculated from quarters; edit the phasing below" : undefined} value={c.planned} onValueChange={(v) => setPlanned(i, Number(v))} className="w-28 rounded-sm border px-1.5 text-right" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }} /></label>
                      <label className="flex items-center gap-1">Actual <MoneyInput readOnly={!!c.periods?.length} title={c.periods?.length ? "Calculated from quarters; edit the phasing below" : undefined} value={c.actual} onValueChange={(v) => setActual(i, Number(v))} className="w-28 rounded-sm border px-1.5 text-right" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }} /></label>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-16 font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>Planned</span>
                    <div className="h-2 flex-1 rounded-full" style={{ background: "var(--fg-rule)" }}>
                      <div className="h-2 rounded-full" style={{ width: `${plannedPct}%`, background: "var(--fg-2)" }} />
                    </div>
                    <span className="min-w-20 shrink-0 text-right font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>{fx.money(c.planned)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="w-16 font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>Actual</span>
                    <div className="h-2 flex-1 rounded-full" style={{ background: "var(--fg-rule)" }}>
                      <div className="h-2 rounded-full" style={{ width: `${actualPct}%`, background: "var(--fg)" }} />
                    </div>
                    <span className="min-w-20 shrink-0 text-right font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg)" }}>{fx.money(c.actual)}</span>
                  </div>

                  {!!c.periods?.length && <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>Totals are calculated from the quarters below. Edit a quarter to update them.</p>}

                  <PhasingRow
                    category={c}
                    onChange={(periods) => setPeriods(i, periods)}
                  />
                </div>
              );
            })}
          </div>

          <NewSynergyCategory pending={savePlan.isPending || analyze.isPending} onAdd={(category) => setCats((current) => [...current, category])} />

          <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--fg-rule)" }}>
            <button
              onClick={runAnalysis}
              disabled={analyze.isPending || savePlan.isPending}
              data-testid="synergy-analyze-btn"
              className="rounded-full px-6 py-3 font-sans text-sm"
              style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
            >
              {analyze.isPending ? "Analysing variance…" : "Explain variance with AI"}
            </button>
            {analyze.error && <p className="mt-3 font-sans text-[12px]" style={{ color: "var(--sev-flag-text)" }}>{analyze.error.message}</p>}
          </div>

          {dirty && plan.data?.analysis != null && <p role="status" className="mt-4 font-sans text-sm">Numbers have changed. Save them and run the variance analysis again for an up-to-date explanation.</p>}
          {!dirty && result && (
            <div className="mt-6 space-y-4 border-t pt-6" style={{ borderColor: "var(--fg-rule)" }} data-testid="synergy-result">
              {plan.data?.updatedAt && (
                <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                  Last analysed {new Date(plan.data.updatedAt).toLocaleString()}
                </p>
              )}
              <p className="font-serif text-lg leading-relaxed" style={{ color: "var(--fg)" }}>{result.portfolioSummary}</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {result.analyses.map((a) => (
                  <div key={a.category} className="rounded-sm border p-4" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
                    {/* Same wrap fix as the input row above: a category name
                        and a verdict badge held apart by `justify-between`
                        overflow rather than wrap once the card is narrow. */}
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>{a.category}</p>
                      <span className="ansyra-label" style={{ color: verdictColor(a.verdict) }}>
                        {a.verdict} · {a.variancePct == null ? "No baseline" : `${a.variancePct > 0 ? "+" : ""}${a.variancePct}%`}
                      </span>
                    </div>
                    <p className="mt-2 font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{a.explanation}</p>
                    <p className="mt-3 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
                      <span className="ansyra-label" style={{ color: "var(--fg)" }}>Action · </span>{a.action}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!dirty && legacy.success && !result && <div className="mt-6 space-y-3 border-t pt-6" style={{ borderColor: "var(--fg-rule)" }} data-testid="synergy-result">
            <p>{legacy.data.summary}</p><p>Recommendation: {legacy.data.recommendation}</p>
          </div>}
          {plan.data?.analysis != null && !result && !legacy.success && <p role="status" className="mt-6">Saved synergy analysis is unavailable. Run the analysis again.</p>}
        </Card>
      )}
      <AiDisclaimer />
    </div>
  );
}

function NewSynergyCategory({ pending, onAdd }: { pending: boolean; onAdd: (category: PhasedCategory) => void }) {
  const fx = useCurrency();
  const [category, setCategory] = useState("");
  const [planned, setPlanned] = useState("");
  const [actual, setActual] = useState("");
  return <form style={{ color: "var(--fg)" }} className="mt-5 flex flex-wrap items-end gap-3" onSubmit={(e) => {
    e.preventDefault();
    const parsed = StoredSynergyCategories.safeParse([{ category, planned, actual }]);
    if (!pending && parsed.success) { onAdd(parsed.data[0]); setCategory(""); setPlanned(""); setActual(""); }
  }}>
    <label className="font-sans text-sm">New category<input required value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 block w-40 rounded-sm border bg-transparent p-2" /></label>
    <label className="font-sans text-sm">Planned ({fx.currency} millions)<MoneyInput required min={-1e12} max={1e12} value={planned} onValueChange={setPlanned} className="mt-1 block w-32 rounded-sm border bg-transparent p-2" /></label>
    <label className="font-sans text-sm">Actual ({fx.currency} millions)<MoneyInput required min={-1e12} max={1e12} value={actual} onValueChange={setActual} className="mt-1 block w-32 rounded-sm border bg-transparent p-2" /></label>
    <button disabled={pending} className="min-h-11 rounded-full border px-4 py-2 font-sans text-sm disabled:opacity-50">Add category</button>
  </form>;
}

// Per-category quarterly phasing: "did we capture it, and by when?". Collapsed
// until a category has periods, so an unphased plan looks exactly as it did
// before Phase 15.6.
function PhasingRow({
  category,
  onChange,
}: {
  category: { category: string; planned: number; actual: number; periods?: SynergyPeriod[] };
  onChange: (periods: SynergyPeriod[]) => void;
}) {
  const fx = useCurrency();
  const periods = category.periods ?? [];
  const [open, setOpen] = useState(periods.length > 0);
  const [quarter, setQuarter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const rows = periodVariances(periods);
  const worst = worstQuarter(periods);

  function addQuarter() {
    const q = quarter.trim();
    if (!isValidQuarter(q)) return setErr("Use a YYYY-Qn quarter, e.g. 2026-Q3.");
    if (periods.some((p) => p.quarter === q)) return setErr("That quarter is already listed.");
    setErr(null);
    setQuarter("");
    onChange([...periods, { quarter: q, planned: 0, actual: 0 }]);
  }

  function patch(q: string, field: "planned" | "actual", v: number) {
    onChange(periods.map((p) => (p.quarter === q ? { ...p, [field]: v } : p)));
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={`phase-toggle-${category.category}`}
        className="font-sans text-[11.5px] underline-offset-4 hover:underline"
        style={{ color: "var(--fg)" }}
      >
        {open ? "Hide phasing" : periods.length > 0 ? `Phasing (${periods.length} quarters)` : "Phase it"}
      </button>

      {open && (
        <div className="mt-2 rounded-sm border p-3" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr>
                    {["Quarter", `Planned (${fx.currency}M)`, `Actual (${fx.currency}M)`, "Var", "Cum. var"].map((h) => (
                      <th key={h} className="px-2 py-1 text-left font-mono text-[9.5px] uppercase tracking-[0.24em]" style={{ color: "var(--fg-2)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.quarter}>
                      <td className="px-2 py-1 font-mono text-[11.5px]" style={{ color: p.quarter === worst?.quarter ? "var(--sev-flag)" : "var(--fg-2)" }}>
                        {p.quarter}
                      </td>
                      <td className="px-2 py-1">
                        <MoneyInput
                          aria-label={`${category.category} ${p.quarter} planned`}
                          value={p.planned}
                          onValueChange={(v) => patch(p.quarter, "planned", Number(v))}
                          className="w-28 rounded-sm border px-1.5 text-right font-mono text-[length:var(--step-xs)]"
                          style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <MoneyInput
                          aria-label={`${category.category} ${p.quarter} actual`}
                          value={p.actual}
                          onValueChange={(v) => patch(p.quarter, "actual", Number(v))}
                          className="w-28 rounded-sm border px-1.5 text-right font-mono text-[length:var(--step-xs)]"
                          style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
                        />
                      </td>
                      <td className="px-2 py-1 font-mono text-[length:var(--step-xs)]" style={{ color: (p.variancePct ?? 0) < 0 ? "var(--sev-flag)" : "var(--sev-grounded)" }}>
                        {p.variancePct == null ? "—" : `${p.variancePct > 0 ? "+" : ""}${p.variancePct}%`}
                      </td>
                      <td className="px-2 py-1 font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
                        {p.cumulativeVariancePct == null ? "—" : `${p.cumulativeVariancePct > 0 ? "+" : ""}${p.cumulativeVariancePct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              placeholder="2026-Q3"
              className="w-24 rounded-sm border px-2 py-1 font-mono text-[length:var(--step-xs)]"
              style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
            />
            <button
              type="button"
              onClick={addQuarter}
              data-testid={`phase-add-${category.category}`}
              className="rounded-full border px-3 py-1 font-sans text-[11.5px]"
              style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}
            >
              Add quarter
            </button>
            {periods.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-sans text-[11.5px] underline-offset-4 hover:underline"
                style={{ color: "var(--fg-2)" }}
              >
                Clear phasing
              </button>
            )}
            {err && <span className="font-sans text-[11.5px]" style={{ color: "var(--sev-flag-text)" }}>{err}</span>}
          </div>
          {worst && (
            <p className="mt-2 font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
              Weakest quarter: <strong style={{ color: "var(--sev-flag-text)" }}>{worst.quarter}</strong> ({worst.variancePct}%) — cumulative can look fine while a quarter slips.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
