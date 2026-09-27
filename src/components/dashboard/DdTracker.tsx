import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import {
  DD_STATUSES,
  DD_STATUS_LABELS,
  DD_WORKSTREAMS,
  DD_WORKSTREAM_LABELS,
  ddProgress,
  type DdStatus,
  type DdWorkstream,
} from "@contracts/dd-merge";
import { Card } from "./parchment/Card";
import { Field, SelectInput, TextInput } from "./DealPipeline";

// DD Tracker (Phase 15.5) — diligence as a living checklist. The AI's
// dd_checklist analysis feeds INTO this (Data Room → "Import into tracker");
// it never replaces a status a human set.

const STATUS_COLOR: Record<DdStatus, string> = {
  open: "var(--fg-2)",
  requested: "var(--sev-watch)",
  received: "var(--fg-2)",
  reviewed: "var(--sev-grounded)",
  issue: "var(--sev-flag)",
  n_a: "var(--fg-2)",
};

export function DdTracker({ dealId }: { dealId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.dd.list.useQuery({ dealId });
  const [newItem, setNewItem] = useState("");
  const [newWorkstream, setNewWorkstream] = useState<DdWorkstream>("legal");
  const [err, setErr] = useState<string | null>(null);

  const invalidate = () => {
    utils.dd.list.invalidate({ dealId });
    utils.activity.list.invalidate();
  };
  const seed = trpc.dd.seed.useMutation(withToast({ done: "Diligence checklist created", failed: "Could not start the checklist" }, { onSuccess: invalidate }));
  const addItem = trpc.dd.addItem.useMutation(withToast({ done: "Item added", failed: "Could not add that item" }, {
    onSuccess: () => {
      invalidate();
      setNewItem("");
      setErr(null);
    },
    onError: (e) => setErr(e.message),
  }));
  const updateItem = trpc.dd.updateItem.useMutation(withToast({ done: "Item updated", failed: "Could not save that change", silentOnSuccess: true }, { onSuccess: invalidate, onError: (e) => setErr(e.message) }));
  const deleteItem = trpc.dd.deleteItem.useMutation(withToast({ done: "Item removed", failed: "Could not remove that item" }, { onSuccess: invalidate, onError: (e) => setErr(e.message) }));

  // Memoised so the `?? []` fallback does not hand `groups` a fresh array
  // identity on every render while the query is still loading. Same value.
  const rows = useMemo(() => list.data ?? [], [list.data]);
  const groups = useMemo(() => {
    const byWs = new Map<DdWorkstream, typeof rows>();
    for (const r of rows) {
      const ws = r.workstream as DdWorkstream;
      byWs.set(ws, [...(byWs.get(ws) ?? []), r]);
    }
    return DD_WORKSTREAMS.filter((ws) => byWs.has(ws)).map((ws) => ({
      ws,
      items: byWs.get(ws)!,
      progress: ddProgress(byWs.get(ws)!.map((i) => ({ status: i.status as DdStatus }))),
    }));
  }, [rows]);

  const overall = ddProgress(rows.map((r) => ({ status: r.status as DdStatus })));

  return (
    <Card className="p-6" data-testid="dd-tracker">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
          Diligence
        </h3>
        {rows.length > 0 && (
          <span className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
            {overall.done}/{overall.total} progressed
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <p className="font-sans text-[13px]" style={{ color: "var(--fg-2)", maxWidth: "62ch" }}>
            Start diligence to track the standard 12-item checklist — request status, owners and notes
            per workstream. Document analyses from the Data Room can be imported straight into it.
          </p>
          <button
            type="button"
            onClick={() => seed.mutate({ dealId })}
            disabled={seed.isPending}
            data-testid="dd-seed"
            className="mt-4 rounded-full px-6 py-2.5 font-sans text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
          >
            {seed.isPending ? "Starting…" : "Start diligence"}
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map(({ ws, items, progress }) => (
            <div key={ws}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                  {DD_WORKSTREAM_LABELS[ws]}
                </p>
                <span className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
                  {progress.done}/{progress.total}
                </span>
              </div>
              <ul className="mt-2 space-y-2">
                {items.map((r) => (
                  <li
                    key={r.id}
                    data-testid={`dd-item-${r.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border p-3"
                    style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}
                  >
                    <span
                      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 ansyra-label"
                      style={{
                        color: STATUS_COLOR[r.status as DdStatus],
                        border: `1px solid color-mix(in srgb, ${STATUS_COLOR[r.status as DdStatus]} 40%, transparent)`,
                        background: `color-mix(in srgb, ${STATUS_COLOR[r.status as DdStatus]} 8%, transparent)`,
                      }}
                    >
                      {DD_STATUS_LABELS[r.status as DdStatus]}
                    </span>
                    <span
                      className="font-serif text-[15px]"
                      style={{
                        color: "var(--fg)",
                        textDecoration: r.status === "n_a" ? "line-through" : undefined,
                        opacity: r.status === "n_a" ? 0.55 : 1,
                      }}
                    >
                      {r.item}
                    </span>
                    {r.note && (
                      <span
                        className="w-full whitespace-pre-line font-sans text-[11.5px]"
                        style={{ color: "var(--fg-2)" }}
                      >
                        {r.note}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <select
                        value={r.status}
                        onChange={(e) => updateItem.mutate({ id: r.id, status: e.target.value as DdStatus })}
                        aria-label={`Status for ${r.item}`}
                        className="rounded-sm border px-2 py-1 font-sans text-[12px]"
                        style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}
                      >
                        {DD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {DD_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      {!r.isStandard && (
                        <button
                          type="button"
                          onClick={() => deleteItem.mutate({ id: r.id })}
                          className="font-sans text-[12px] underline-offset-4 hover:underline"
                          style={{ color: "var(--fg-2)" }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field required label="Add item">
              <TextInput value={newItem} onChange={setNewItem} placeholder="Board minutes 2024" />
            </Field>
            <Field required label="Workstream">
              <SelectInput
                value={newWorkstream}
                onChange={(v) => setNewWorkstream(v as DdWorkstream)}
                options={DD_WORKSTREAMS as unknown as string[]}
              />
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  if (newItem.trim().length < 2) return setErr("Give the item a name.");
                  addItem.mutate({ dealId, item: newItem.trim(), workstream: newWorkstream });
                }}
                disabled={addItem.isPending}
                data-testid="dd-add-item"
                className="rounded-full border px-5 py-2.5 font-sans text-[13px] disabled:opacity-50"
                style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)", minHeight: 44 }}
              >
                {addItem.isPending ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {err && (
        <p className="mt-3 font-sans text-[12.5px]" style={{ color: "var(--sev-flag-text)" }}>
          {err}
        </p>
      )}
    </Card>
  );
}
