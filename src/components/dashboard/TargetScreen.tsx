import { useCurrency } from "./currency";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { useAuth } from "@/hooks/useAuth";
import { hasFeature } from "@/lib/rbac";
import { Card } from "./parchment/Card";
import { EmptyState } from "./parchment/EmptyState";
import { Field, Modal, SelectInput, TextInput, Textarea } from "./DealPipeline";
import { TargetDiscovery } from "./TargetDiscovery";
import { FIT_SCORE_EXPLANATION, INDUSTRY_OPTIONS } from "@/lib/form-options";

interface Target {
  id: number;
  name: string;
  sector: string;
  ebitda: string | null;
  revenue: string | null;
  fitScore: number;
  description: string | null;
  status: string;
  createdAt: Date;
}

const STATUS_OPTIONS = ["new", "screened", "contacted", "offer", "declined", "acquired"] as const;

const EMPTY_FORM = { name: "", sector: "", ebitda: "", revenue: "", fitScore: "80", description: "", status: "new" };

export function TargetScreen({ targets }: { targets: Target[] }) {
  const fx = useCurrency();
  const { user } = useAuth();
  const canDiscover = hasFeature(user, "target_discovery");
  const [mode, setMode] = useState<"targets" | "discovery">("targets");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Target | null>(null);
  const [filter, setFilter] = useState("");
  const [t, setT] = useState(EMPTY_FORM);
  const utils = trpc.useUtils();

  const refresh = () => {
    utils.targets.list.invalidate();
    utils.activity.list.invalidate();
  };
  const create = trpc.targets.create.useMutation(withToast({ done: "Target added", failed: "Could not add that target" }, {
    onSuccess: () => {
      refresh();
      setShowNew(false);
      setT(EMPTY_FORM);
    },
  }));
  const update = trpc.targets.update.useMutation(withToast({ done: "Target updated", failed: "Could not save those changes", silentOnSuccess: true }, {
    onSuccess: () => {
      refresh();
      setEditing(null);
    },
  }));
  const remove = trpc.targets.delete.useMutation(withToast({ done: "Target removed", failed: "Could not remove that target" }, {
    onSuccess: () => {
      refresh();
      setConfirmDelete(null);
    },
  }));

  const filtered = targets.filter(
    (x) => x.name.toLowerCase().includes(filter.toLowerCase()) || x.sector.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      {/* Mode switch — Discovery only appears with the target_discovery grant.
          The sidebar hiding is cosmetic; the router enforces the real gate. */}
      {canDiscover && (
        <div className="mb-6 inline-flex rounded-full border p-0.5" style={{ borderColor: "var(--fg-rule)" }}>
          {([
            { id: "targets", label: "My Targets" },
            { id: "discovery", label: "AI Discovery" },
          ] as const).map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              data-testid={`targets-mode-${m.id}`}
              className="rounded-full px-4 py-1.5 font-sans text-[13px]"
              style={{
                background: mode === m.id ? "var(--sev-grounded)" : "transparent",
                color: mode === m.id ? "var(--clear)" : "var(--fg-2)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {mode === "discovery" && canDiscover ? (
        <TargetDiscovery />
      ) : (
        <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <TextInput value={filter} onChange={setFilter} placeholder="Search targets by name or sector…" />
        <button onClick={() => setShowNew(true)} data-testid="new-target-btn" className="rounded-full px-5 py-2 font-sans text-[13px]" style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}>
          + Add Target
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tg) => (
          <Card key={tg.id} data-testid={`target-card-${tg.id}`} className="group">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl leading-tight" style={{ color: "var(--fg)" }}>{tg.name}</h3>
                <p className="mt-0.5 ansyra-label" style={{ color: "var(--fg-2)" }}>{tg.sector}</p>
              </div>
              <div className="text-right">
                <p className="font-serif text-3xl leading-none" style={{ color: "var(--fg)" }}>{tg.fitScore}</p>
                <p className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
                  / 100 fit
                  <span
                    tabIndex={0}
                    title={FIT_SCORE_EXPLANATION}
                    data-testid="fit-score-info"
                    className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border text-[length:var(--step-xs)]"
                    style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
                  >
                    i
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: "var(--fg-rule)" }}>
              <div>
                <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>EBITDA</p>
                <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>{fx.text(tg.ebitda)}</p>
              </div>
              <div>
                <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Revenue</p>
                <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>{fx.text(tg.revenue)}</p>
              </div>
            </div>
            {tg.description && (
              <p className="mt-3 line-clamp-3 font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{tg.description}</p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span
                className="inline-block rounded-full border px-2 py-0.5 ansyra-label"
                style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
              >
                {tg.status || "new"}
              </span>
              <div className="flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                <button
                  onClick={() => setEditing(tg)}
                  data-testid={`edit-target-${tg.id}`}
                  className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)]"
                  style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(tg)}
                  data-testid={`delete-target-${tg.id}`}
                  className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)]"
                  style={{ borderColor: "var(--fg-rule)", color: "var(--sev-flag-text)", background: "var(--fg-surface)" }}
                >
                  Delete
                </button>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="col-span-full">
            {targets.length === 0 ? (
              <EmptyState
                title="No targets yet"
                body="Screen an acquisition target against your thesis and it gets a fit score you can compare against every other candidate."
                action={{ label: "Add a target", onClick: () => setShowNew(true) }}
              />
            ) : (
              /* A filtered-to-nothing list is NOT an empty state: the panel has
                 data, the query is just too narrow. Offering "add a target"
                 here would answer a question nobody asked. */
              <EmptyState
                title="No targets match your search"
                body="Every target you have is still here. Clear the search to see them."
              />
            )}
          </Card>
        )}
      </div>

      {showNew && (
        <Modal title="Add Target" onClose={() => setShowNew(false)}>
          <TargetForm
            value={t}
            onChange={setT}
            submitting={create.isPending}
            submitLabel={create.isPending ? "Adding…" : "Add Target"}
            onSubmit={() => create.mutate({
              name: t.name,
              sector: t.sector,
              ebitda: t.ebitda || undefined,
              revenue: t.revenue || undefined,
              fitScore: clampScore(t.fitScore),
              description: t.description || undefined,
              status: t.status as (typeof STATUS_OPTIONS)[number],
            })}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <EditTargetForm
            target={editing}
            submitting={update.isPending}
            onSubmit={(form) => update.mutate({
              id: editing.id,
              name: form.name,
              sector: form.sector,
              ebitda: form.ebitda || undefined,
              revenue: form.revenue || undefined,
              fitScore: clampScore(form.fitScore),
              description: form.description || undefined,
              status: form.status as (typeof STATUS_OPTIONS)[number],
            })}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete target" onClose={() => setConfirmDelete(null)}>
          <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
            Permanently delete <strong>{confirmDelete.name}</strong>? This cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded-full border px-5 py-2 font-sans text-[13px]"
              style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => remove.mutate({ id: confirmDelete.id })}
              disabled={remove.isPending}
              data-testid="confirm-delete-target"
              className="rounded-full px-5 py-2 font-sans text-[13px]"
              style={{ background: "var(--sev-flag)", color: "var(--clear)" }}
            >
              {remove.isPending ? "Deleting…" : "Delete target"}
            </button>
          </div>
        </Modal>
      )}
        </>
      )}
    </div>
  );
}

function clampScore(v: string): number {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

interface TargetFormState {
  name: string;
  sector: string;
  ebitda: string;
  revenue: string;
  fitScore: string;
  description: string;
  status: string;
}

function TargetForm({
  value: t,
  onChange: setT,
  onSubmit,
  submitting,
  submitLabel,
}: {
  value: TargetFormState;
  onChange: (v: TargetFormState) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!submitting) onSubmit(); }}>
      <Field label="Company"><TextInput value={t.name} onChange={(v) => setT({ ...t, name: v })} required placeholder="TechFlow Inc" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sector">
          <SelectInput
            value={t.sector}
            onChange={(v) => setT({ ...t, sector: v })}
            // Keep legacy sector values (from before the dropdown) selectable
            options={t.sector && !(INDUSTRY_OPTIONS as readonly string[]).includes(t.sector)
              ? [t.sector, ...INDUSTRY_OPTIONS]
              : INDUSTRY_OPTIONS}
            placeholder="Select sector…"
          />
        </Field>
        <Field label="Fit score (0–100)">
          <div className="flex items-center gap-1.5">
            <TextInput type="number" value={t.fitScore} onChange={(v) => setT({ ...t, fitScore: v })} />
            <span
              tabIndex={0}
              title={FIT_SCORE_EXPLANATION}
              className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border text-[length:var(--step-xs)]"
              style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}
            >
              i
            </span>
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="EBITDA"><TextInput value={t.ebitda} onChange={(v) => setT({ ...t, ebitda: v })} placeholder="$15M" /></Field>
        <Field label="Revenue"><TextInput value={t.revenue} onChange={(v) => setT({ ...t, revenue: v })} placeholder="$50M" /></Field>
      </div>
      <Field label="Status">
        <SelectInput value={t.status} onChange={(v) => setT({ ...t, status: v })} options={STATUS_OPTIONS} />
      </Field>
      <Field label="Description"><Textarea value={t.description} onChange={(v) => setT({ ...t, description: v })} placeholder="What makes this a fit…" /></Field>
      <button type="submit" disabled={submitting} className="w-full rounded-full py-3 font-sans text-sm" style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}>
        {submitLabel}
      </button>
    </form>
  );
}

function EditTargetForm({
  target,
  onSubmit,
  submitting,
}: {
  target: Target;
  onSubmit: (form: TargetFormState) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<TargetFormState>({
    name: target.name,
    sector: target.sector,
    ebitda: target.ebitda ?? "",
    revenue: target.revenue ?? "",
    fitScore: String(target.fitScore),
    description: target.description ?? "",
    status: target.status,
  });
  return (
    <TargetForm
      value={form}
      onChange={setForm}
      onSubmit={() => onSubmit(form)}
      submitting={submitting}
      submitLabel={submitting ? "Saving…" : "Save changes"}
    />
  );
}
