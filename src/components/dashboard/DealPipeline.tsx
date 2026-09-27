import { usePreloadDeal } from "@/hooks/usePreloadDeal";
import { useCurrency } from "./currency";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { withToast, notify } from "./parchment/notify";
import { Card } from "@/components/dashboard/parchment/Card";
import { DialogShell } from "@/components/ansyra/modals/DialogShell";
import { FieldGroup } from "@/components/forms/FieldGroup";
import { useFieldControlId } from "@/components/forms/field-control";
import { CURRENCY_OPTIONS, INDUSTRY_OPTIONS, joinValue, splitValue } from "@/lib/form-options";

interface Deal {
  id: number;
  name: string;
  targetCompany: string;
  status: string;
  stage: string;
  value: string | null;
  industry: string | null;
  isDemo?: boolean;
  createdAt: Date;
}

const STAGES = ["sourcing", "evaluation", "diligence", "negotiation", "closing", "integration"] as const;
const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourcing",
  evaluation: "Evaluation",
  diligence: "Due Diligence",
  negotiation: "Negotiation",
  closing: "Closing",
  integration: "Integration",
};

const EMPTY_FORM = { name: "", targetCompany: "", symbol: "$", amount: "", industry: "", stage: "sourcing" as (typeof STAGES)[number] };
const PIPELINE_PAGE_SIZE = 20;
type Stage = (typeof STAGES)[number];

function emptyStagePages(): Record<Stage, Deal[]> {
  return { sourcing: [], evaluation: [], diligence: [], negotiation: [], closing: [], integration: [] };
}

export function DealPipeline() {
  const { text: moneyText } = useCurrency();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newDeal, setNewDeal] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [extraStageItems, setExtraStageItems] = useState<Record<Stage, Deal[]>>(emptyStagePages);
  const [loadingStage, setLoadingStage] = useState<Stage | null>(null);
  const [extraArchived, setExtraArchived] = useState<Deal[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const navigate = useNavigate();
  const preloadDeal = usePreloadDeal();
  const utils = trpc.useUtils();
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const boardInput = useMemo(() => ({
    query: debouncedQuery,
    industry: industryFilter === "all" ? undefined : industryFilter,
    stage: stageFilter === "all" ? undefined : stageFilter as Stage,
  }), [debouncedQuery, industryFilter, stageFilter]);
  const filterKey = `${debouncedQuery}\u0000${industryFilter}\u0000${stageFilter}`;
  const filterKeyRef = useRef(filterKey);
  useEffect(() => {
    filterKeyRef.current = filterKey;
  }, [filterKey]);
  // Do not retain a previous filter result as placeholder data: any loaded
  // continuation pages belong to that exact filter tuple, so briefly mixing
  // them with a new result would show stale deals in the wrong board.
  const board = trpc.deals.pipelineBoard.useQuery(boardInput);
  const archived = trpc.deals.archivedPage.useQuery(
    { offset: 0, limit: PIPELINE_PAGE_SIZE },
    { enabled: showArchived },
  );

  const refreshPipeline = () => {
    setExtraStageItems(emptyStagePages());
    setExtraArchived([]);
    utils.deals.pipelineBoard.invalidate();
    utils.deals.archivedPage.invalidate();
    utils.deals.list.invalidate();
    // An intent-prefetched dossier must not retain a record edited here.
    utils.deals.get.invalidate();
  };

  const createDeal = trpc.deals.create.useMutation(withToast({ done: "Deal created", failed: "Could not create that deal" }, {
    onSuccess: () => {
      refreshPipeline();
      utils.activity.list.invalidate();
      setShowNewDeal(false);
      setNewDeal(EMPTY_FORM);
    },
  }));
  const updateDeal = trpc.deals.update.useMutation(withToast({ done: "Deal updated", failed: "Could not update that deal" }, {
    onSuccess: () => { refreshPipeline(); utils.activity.list.invalidate(); },
  }));
  const deleteDeal = trpc.deals.delete.useMutation(withToast({ done: "Deal deleted", failed: "Could not delete that deal" }, {
    onSuccess: () => {
      refreshPipeline();
      utils.activity.list.invalidate();
      setEditing(null);
    },
  }));

  // Sample portfolio (Phase 11.7): offer demo data on an empty pipeline; offer
  // one-click removal while any of the caller's demo rows remain.
  const loadSamples = trpc.deals.loadSamples.useMutation(withToast({ done: "Sample portfolio loaded", failed: "Could not load the sample portfolio" }, {
    onSuccess: () => {
      refreshPipeline();
      utils.targets.list.invalidate();
      utils.activity.list.invalidate();
    },
  }));
  const removeSamples = trpc.deals.removeSamples.useMutation(withToast({ done: "Sample data removed", failed: "Could not remove the sample data" }, {
    onSuccess: () => {
      refreshPipeline();
      utils.targets.list.invalidate();
      utils.activity.list.invalidate();
    },
  }));
  const archivedDeals = [...(archived.data?.items ?? []), ...extraArchived];
  const dealsByStage = (board.data?.stages ?? [])
    .filter(({ stage }) => stageFilter === "all" || stage === stageFilter)
    .map(({ stage, items, total }) => ({ stage, total, items: [...items, ...extraStageItems[stage]] }));

  const loadMoreStage = async (stage: Stage, currentItems: Deal[]) => {
    const requestKey = filterKey;
    const last = currentItems.at(-1);
    setLoadingStage(stage);
    try {
      const page = await utils.deals.pipelineStagePage.fetch({
        ...boardInput,
        stage,
        offset: 0,
        cursor: last ? { createdAt: last.createdAt, id: last.id } : undefined,
        limit: PIPELINE_PAGE_SIZE,
      });
      if (filterKeyRef.current !== requestKey) return;
      setExtraStageItems((current) => {
        const seen = new Set([...currentItems, ...current[stage]].map((item) => item.id));
        return {
          ...current,
          [stage]: [...current[stage], ...page.items.filter((item) => !seen.has(item.id))],
        };
      });
    } catch (error) {
      notify.failed("Could not load more deals", error instanceof Error ? error.message : "Try again.");
    } finally {
      setLoadingStage(null);
    }
  };

  const loadMoreArchived = async () => {
    setLoadingArchived(true);
    try {
      const last = archivedDeals.at(-1);
      const page = await utils.deals.archivedPage.fetch({
        offset: 0,
        cursor: last ? { createdAt: last.createdAt, id: last.id } : undefined,
        limit: PIPELINE_PAGE_SIZE,
      });
      setExtraArchived((current) => {
        const seen = new Set([...(archived.data?.items ?? []), ...current].map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
    } catch (error) {
      notify.failed("Could not load more archived deals", error instanceof Error ? error.message : "Try again.");
    } finally {
      setLoadingArchived(false);
    }
  };

  return (
    <div>
      {board.data?.activeTotal === 0 && (
        <Card className="mb-6">
          <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>Your pipeline is empty.</p>
          <p className="mt-1 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
            Create your first deal, or load a sample portfolio to explore Ansyra with realistic demo data.
          </p>
          <button
            onClick={() => loadSamples.mutate()}
            disabled={loadSamples.isPending}
            data-testid="load-samples"
            className="mt-3 rounded-full border px-5 py-2 font-sans text-[13px] disabled:opacity-50"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}
          >
            {loadSamples.isPending ? "Loading samples…" : "Load sample portfolio"}
          </button>
        </Card>
      )}
      {board.data?.hasDemo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-sm border-l p-3" style={{ borderColor: "var(--sev-watch)", background: "color-mix(in srgb, var(--sev-watch) 8%, var(--fg-surface))" }}>
          <p className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>Sample data is loaded — deals and targets marked as demo.</p>
          <button
            onClick={() => removeSamples.mutate()}
            disabled={removeSamples.isPending}
            data-testid="remove-samples"
            className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)] disabled:opacity-50"
            style={{ borderColor: "var(--fg-rule)", color: "var(--sev-flag-text)", background: "var(--fg-surface)" }}
          >
            {removeSamples.isPending ? "Removing…" : "Remove samples"}
          </button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
          {board.data && (board.data.filteredTotal === board.data.activeTotal
            ? `${board.data.activeTotal} deals in pipeline`
            : `${board.data.filteredTotal} of ${board.data.activeTotal} deals`)}
          {(board.data?.archivedTotal ?? 0) > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              data-testid="toggle-archived"
              className="ml-3 rounded-full border px-3 py-0.5 font-sans text-[length:var(--step-xs)] normal-case tracking-normal"
              style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
            >
              {showArchived ? "Hide" : "Show"} archived ({board.data?.archivedTotal ?? 0})
            </button>
          )}
        </p>
        <div className="flex items-center gap-2">
          {/* CSV export (Phase 15.2) — a plain download link to the Hono route;
              the browser handles the file, auth rides the session cookie. */}
          <a
            href="/api/export/pipeline.csv"
            data-testid="export-csv"
            className="rounded-full border px-4 py-2 font-sans text-[13px]"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}
          >
            Export CSV
          </a>
          <button
            onClick={() => setShowNewDeal(true)}
            data-testid="new-deal-btn"
            className="rounded-full px-5 py-2 font-sans text-[13px]"
            style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
          >
            + New Deal
          </button>
        </div>
      </div>

      <div
        className="mb-6 grid grid-cols-1 gap-3 rounded-sm border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.4fr)_minmax(10rem,0.35fr)]"
        style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}
        role="search"
        aria-label="Filter deal pipeline"
      >
        <div>
          <label htmlFor="pipeline-search" className="sr-only">Search deals</label>
          <input
            id="pipeline-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setExtraStageItems(emptyStagePages());
            }}
            placeholder="Search deal, company, or industry…"
            className="min-h-11 w-full rounded-sm border px-3 font-sans text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)]"
            style={{ background: "var(--clear)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
          />
        </div>
        <div>
          <label htmlFor="pipeline-industry" className="sr-only">Filter by industry</label>
          <select
            id="pipeline-industry"
            value={industryFilter}
            onChange={(event) => {
              setIndustryFilter(event.target.value);
              setExtraStageItems(emptyStagePages());
            }}
            className="min-h-11 w-full rounded-sm border px-3 font-sans text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)]"
            style={{ background: "var(--clear)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
          >
            <option value="all">All industries</option>
            {(board.data?.industries ?? []).map((industry) => <option key={industry} value={industry}>{industry}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pipeline-stage" className="sr-only">Filter by stage</label>
          <select
            id="pipeline-stage"
            value={stageFilter}
            onChange={(event) => {
              setStageFilter(event.target.value);
              setExtraStageItems(emptyStagePages());
            }}
            className="min-h-11 w-full rounded-sm border px-3 font-sans text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)]"
            style={{ background: "var(--clear)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
          >
            <option value="all">All stages</option>
            {STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
          </select>
        </div>
      </div>

      {(board.data?.activeTotal ?? 0) > 0 && board.data?.filteredTotal === 0 && (
        <Card className="mb-6" data-testid="pipeline-no-results">
          <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>No deals match these filters.</p>
          <p className="mt-1 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>Try a broader search, industry, or stage.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setIndustryFilter("all");
              setStageFilter("all");
              setExtraStageItems(emptyStagePages());
            }}
            className="mt-3 min-h-11 rounded-full border px-4 font-sans text-[12px]"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}
          >
            Clear filters
          </button>
        </Card>
      )}

      {showArchived && (
        <Card className="mb-6">
          <p className="mb-3 ansyra-label" style={{ color: "var(--fg-2)" }}>Archived deals</p>
          {archived.isLoading && <p role="status" className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>Loading archived deals…</p>}
          <div className="space-y-2">
            {archivedDeals.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-sm border p-3" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}>
                <div>
                  <p className="font-serif text-[15px]" style={{ color: "var(--fg-2)" }}>{d.name}</p>
                  <p className="font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>{d.targetCompany} · was in {STAGE_LABELS[d.stage]}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateDeal.mutate({ id: d.id, status: "active" })}
                    className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)]"
                    style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => { if (confirm(`Permanently delete "${d.name}"? This also removes its assumptions and synergy plan.`)) deleteDeal.mutate({ id: d.id }); }}
                    className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)]"
                    style={{ borderColor: "var(--fg-rule)", color: "var(--sev-flag-text)", background: "var(--fg-surface)" }}
                  >
                    Delete forever
                  </button>
                </div>
              </div>
            ))}
            {archived.data && archivedDeals.length < archived.data.total && (
              <button type="button" onClick={loadMoreArchived} disabled={loadingArchived} className="min-h-11 w-full rounded-sm border px-3 font-sans text-[length:var(--step-xs)] disabled:opacity-50" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>
                {loadingArchived ? "Loading…" : `Show ${Math.min(PIPELINE_PAGE_SIZE, archived.data.total - archivedDeals.length)} more`}
              </button>
            )}
          </div>
        </Card>
      )}

      {board.isLoading && !board.data && <p role="status" className="mb-4 font-sans text-sm" style={{ color: "var(--fg-2)" }}>Loading pipeline…</p>}
      {board.isError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 font-sans text-sm" style={{ color: "var(--sev-flag-text)" }}>
          <p>Couldn&apos;t load the pipeline. {board.error.message}</p>
          <button
            type="button"
            onClick={() => board.refetch()}
            className="min-h-11 rounded-full border px-4 text-[12px]"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}
          >
            Try again
          </button>
        </div>
      )}
      {board.data && (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] items-start gap-3">
        {dealsByStage.map(({ stage, items, total }) => {
          const remaining = total - items.length;
          return (
          <Card key={stage} className="flex flex-col" data-testid={`pipeline-column-${stage}`}>
            <div className="mb-3 flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--fg-rule)" }}>
              <span className="ansyra-label" style={{ color: "var(--fg-2)" }}>{STAGE_LABELS[stage]}</span>
              <span className="rounded-full border px-2 py-0.5 font-mono text-[length:var(--step-xs)]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}>
                {total}
              </span>
            </div>
            <div className="flex-1 space-y-2">
              {items.map((d) => {
                const idx = STAGES.indexOf(d.stage as (typeof STAGES)[number]);
                const next = idx >= 0 ? STAGES[idx + 1] : undefined;
                const prev = idx > 0 ? STAGES[idx - 1] : undefined;
                return (
                  <div
                    key={d.id}
                    className="group rounded-sm border p-3 transition-colors"
                    style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onPointerEnter={() => preloadDeal(d.id)}
              onFocus={() => preloadDeal(d.id)}
              onClick={() => { preloadDeal(d.id); navigate(`/dashboard/deals/${d.id}`); }}
                        data-testid={`open-deal-${d.id}`}
                        title="Open deal dossier"
                        className="min-w-0 break-words text-left font-serif text-[15px] leading-tight underline-offset-4 hover:underline"
                        style={{ color: "var(--fg)" }}
                      >
                        {d.name}
                      </button>
                      <button
                        onClick={() => setEditing(d)}
                        data-testid={`edit-deal-${d.id}`}
                        title="Edit deal"
                        aria-label={`Edit ${d.name}`}
                        className="rounded-full border px-1.5 font-sans text-[length:var(--step-xs)] transition-colors"
                        style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                      >
                        <span aria-hidden>✎</span>
                      </button>
                    </div>
                    <p className="mt-0.5 font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>{d.targetCompany}</p>
                    <div className="mt-3 space-y-3">
                      <p className="break-words font-sans text-xs" style={{ color: "var(--fg-2)" }}>{d.industry ?? "Industry not specified"}</p>
                      <div className="border-t pt-2" style={{ borderColor: "var(--fg-rule)" }}><p className="font-sans text-xs" style={{ color: "var(--fg-2)" }}>Deal value</p><p className="mt-1 break-words font-serif text-xl tabular-nums" style={{ color: "var(--fg)" }} title={d.value ?? undefined}>{moneyText(d.value)}</p></div>
                    </div>
                    <div className="mt-2 flex gap-1">
                      {prev && (
                        <button
                          onClick={() => updateDeal.mutate({ id: d.id, stage: prev })}
                          data-testid={`move-back-${d.id}`}
                          title={`Move back to ${STAGE_LABELS[prev]}`}
                          aria-label={`Move ${d.name} back to ${STAGE_LABELS[prev]}`}
                          className="rounded-sm border px-2 py-1 font-sans ansyra-label transition-colors"
                          style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                        >
                          <span aria-hidden>←</span>
                        </button>
                      )}
                      {next && (
                        <button
                          // Forward advancement requires a recorded decision
                          // (Phase 15.1 stage-gate). Route to the dossier's
                          // Decision Log, which records the decision and moves
                          // the stage in one transaction. Backward stays inline.
                          onPointerEnter={() => preloadDeal(d.id)}
                          onFocus={() => preloadDeal(d.id)}
                          onClick={() => { preloadDeal(d.id); navigate(`/dashboard/deals/${d.id}?advance=1`); }}
                          data-testid={`advance-deal-${d.id}`}
                          title={`Record a decision to advance to ${STAGE_LABELS[next]}`}
                          className="flex-1 rounded-sm border px-2 py-1 font-sans ansyra-label transition-colors"
                          style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                        >
                          Advance → {STAGE_LABELS[next]}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <div className="flex h-16 items-center justify-center">
                  <span className="font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>Empty</span>
                </div>
              )}
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => loadMoreStage(stage, items)}
                  disabled={loadingStage === stage}
                  className="mt-2 min-h-11 w-full rounded-sm border px-3 font-sans text-[length:var(--step-xs)] disabled:opacity-50"
                  style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--clear)" }}
                >
                  {loadingStage === stage ? "Loading…" : `Show ${Math.min(PIPELINE_PAGE_SIZE, remaining)} more · ${remaining} remaining`}
                </button>
              )}
            </div>
          </Card>
          );
        })}
      </div>
      )}

      {showNewDeal && (
        <Modal title="Create New Deal" onClose={() => setShowNewDeal(false)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createDeal.mutate({
                name: newDeal.name,
                targetCompany: newDeal.targetCompany,
                stage: newDeal.stage,
                value: joinValue(newDeal.symbol, newDeal.amount) || undefined,
                industry: newDeal.industry || undefined,
              });
            }}
          >
            <Field label="Deal name">
              <TextInput value={newDeal.name} onChange={(v) => setNewDeal({ ...newDeal, name: v })} required placeholder="Project Horizon" />
            </Field>
            <Field label="Target company">
              <TextInput value={newDeal.targetCompany} onChange={(v) => setNewDeal({ ...newDeal, targetCompany: v })} required placeholder="Acme Corp" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Value">
                <CurrencyInput
                  symbol={newDeal.symbol}
                  amount={newDeal.amount}
                  onSymbol={(s) => setNewDeal({ ...newDeal, symbol: s })}
                  onAmount={(a) => setNewDeal({ ...newDeal, amount: a })}
                />
              </Field>
              <Field label="Industry">
                <SelectInput
                  value={newDeal.industry}
                  onChange={(v) => setNewDeal({ ...newDeal, industry: v })}
                  options={INDUSTRY_OPTIONS}
                  placeholder="Select industry…"
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={createDeal.isPending}
              className="w-full rounded-full py-3 font-sans text-sm"
              style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
            >
              {createDeal.isPending ? "Creating…" : "Create Deal"}
            </button>
          </form>
        </Modal>
      )}

      {editing && (
        <EditDealModal
          deal={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateDeal.mutate({ id: editing.id, ...patch });
            setEditing(null);
          }}
          onArchive={() => {
            updateDeal.mutate({ id: editing.id, status: "cancelled" });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditDealModal({
  deal,
  onClose,
  onSave,
  onArchive,
}: {
  deal: Deal;
  onClose: () => void;
  onSave: (patch: { name: string; targetCompany: string; value?: string; industry?: string }) => void;
  onArchive: () => void;
}) {
  const initial = splitValue(deal.value);
  const [name, setName] = useState(deal.name);
  const [targetCompany, setTargetCompany] = useState(deal.targetCompany);
  const [symbol, setSymbol] = useState(initial.symbol);
  const [amount, setAmount] = useState(initial.amount);
  const [industry, setIndustry] = useState(deal.industry ?? "");

  return (
    <Modal title="Edit Deal" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name,
            targetCompany,
            value: joinValue(symbol, amount) || undefined,
            industry: industry || undefined,
          });
        }}
      >
        <Field label="Deal name"><TextInput value={name} onChange={setName} required /></Field>
        <Field label="Target company"><TextInput value={targetCompany} onChange={setTargetCompany} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value">
            <CurrencyInput symbol={symbol} amount={amount} onSymbol={setSymbol} onAmount={setAmount} />
          </Field>
          <Field label="Industry">
            <SelectInput
              value={industry}
              onChange={setIndustry}
              // Keep legacy industry values (from before the dropdown) selectable
              options={industry && !(INDUSTRY_OPTIONS as readonly string[]).includes(industry)
                ? [industry, ...INDUSTRY_OPTIONS]
                : INDUSTRY_OPTIONS}
              placeholder="Select industry…"
            />
          </Field>
        </div>
        <button type="submit" className="w-full rounded-full py-3 font-sans text-sm" style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}>
          Save changes
        </button>
        <button
          type="button"
          onClick={onArchive}
          data-testid="archive-deal"
          className="w-full rounded-full border py-2.5 font-sans text-sm"
          style={{ borderColor: "var(--fg-rule)", color: "var(--sev-flag-text)", background: "var(--fg-surface)" }}
        >
          Archive deal
        </button>
        <p className="font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
          Archived deals leave the pipeline but keep their history. You can restore or permanently delete them from the archived list.
        </p>
      </form>
    </Modal>
  );
}

// Shared parchment form primitives kept local — smaller, tuned to this palette
export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <FieldGroup label={label} required={required}>{children}</FieldGroup>;
}
export function TextInput({ value, onChange, placeholder, required, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; type?: string }) {
  const controlId = useFieldControlId();
  return (
    <input
      id={controlId}
      type={type}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none transition-colors focus:border-[var(--fg)]"
      style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
    />
  );
}
export function Textarea({ value, onChange, placeholder, rows = 3, required }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; required?: boolean }) {
  const controlId = useFieldControlId();
  return (
    <textarea
      id={controlId}
      value={value}
      rows={rows}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none transition-colors focus:border-[var(--fg)]"
      style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
    />
  );
}
export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  const controlId = useFieldControlId();
  return (
    <select
      id={controlId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none transition-colors focus:border-[var(--fg)]"
      style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: value ? "var(--fg)" : "var(--fg-2)" }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
export function CurrencyInput({
  symbol,
  amount,
  onSymbol,
  onAmount,
}: {
  symbol: string;
  amount: string;
  onSymbol: (s: string) => void;
  onAmount: (a: string) => void;
}) {
  const controlId = useFieldControlId();
  return (
    <div className="flex gap-1">
      <select
        value={symbol}
        onChange={(e) => onSymbol(e.target.value)}
        aria-label="Currency"
        className="rounded-sm border px-1.5 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]"
        style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
      >
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c.code} value={c.symbol}>{c.symbol} {c.code}</option>
        ))}
      </select>
      <input
        id={controlId}
        type="text"
        value={amount}
        onChange={(e) => onAmount(e.target.value)}
        placeholder="50M"
        className="w-full min-w-0 rounded-sm border px-3 py-2 font-sans text-sm outline-none transition-colors focus:border-[var(--fg)]"
        style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
      />
    </div>
  );
}
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <DialogShell title={title} onClose={onClose}>{children}</DialogShell>;
}
