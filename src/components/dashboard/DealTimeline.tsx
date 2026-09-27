import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import {
  MILESTONE_KINDS,
  MILESTONE_LABELS,
  countdownLabel,
  urgencyOf,
  type MilestoneKind,
  type Urgency,
} from "@contracts/milestones";
import { Card } from "./parchment/Card";
import { Field, SelectInput, TextInput } from "./DealPipeline";

// Deal Timeline (Phase 15.3) — the deal's real clock. Exclusivity windows,
// regulatory deadlines, signing, closing. Countdown/urgency come from
// contracts/milestones.ts so chips here, the dashboard widget and the reminder
// emails can never disagree about what "6d" or "overdue" means.

const URGENCY_COLOR: Record<Urgency, string> = {
  overdue: "var(--sev-flag)",
  imminent: "var(--fg)",
  soon: "var(--sev-watch)",
  later: "var(--fg-2)",
};

/** Countdown chip — also used in the dossier header. */
export function CountdownChip({ dueDate, label }: { dueDate: string; label: string }) {
  const u = urgencyOf(dueDate) ?? "later";
  const color = URGENCY_COLOR[u];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      <span className="font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>{label}</span>
      <span className="font-mono text-[length:var(--step-xs)] font-medium" style={{ color }}>
        {countdownLabel(dueDate)}
      </span>
    </span>
  );
}

export function DealTimeline({ dealId }: { dealId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.milestones.list.useQuery({ dealId });

  const [kind, setKind] = useState<MilestoneKind>("exclusivity_expiry");
  const [customLabel, setCustomLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const invalidate = () => {
    utils.milestones.list.invalidate({ dealId });
    utils.milestones.upcoming.invalidate();
    utils.activity.list.invalidate();
  };

  const create = trpc.milestones.create.useMutation(withToast({ done: "Milestone added", failed: "Could not add that milestone" }, {
    onSuccess: () => {
      invalidate();
      setDueDate("");
      setNote("");
      setCustomLabel("");
      setErr(null);
    },
    onError: (e) => setErr((e as { message?: string })?.message ?? null),
  }));
  const update = trpc.milestones.update.useMutation(withToast({ done: "Milestone updated", failed: "Could not save that change", silentOnSuccess: true }, { onSuccess: invalidate }));
  const remove = trpc.milestones.delete.useMutation(withToast({ done: "Milestone removed", failed: "Could not remove that milestone" }, { onSuccess: invalidate }));

  const rows = list.data ?? [];
  const open = rows.filter((r) => !r.completed);
  const done = rows.filter((r) => r.completed);

  function onAdd() {
    if (!dueDate) return setErr("Pick a due date.");
    if (kind === "custom" && !customLabel.trim()) return setErr("Give the custom milestone a label.");
    create.mutate({
      dealId,
      kind,
      dueDate,
      ...(kind === "custom" ? { customLabel: customLabel.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  }

  return (
    <Card className="p-6" data-testid="deal-timeline">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
          Timeline
        </h3>
        {open.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {open.slice(0, 2).map((m) => (
              <CountdownChip
                key={m.id}
                dueDate={m.dueDate}
                label={m.customLabel ?? MILESTONE_LABELS[m.kind]}
              />
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 && !list.isLoading && (
        <p className="mt-4 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
          No dates tracked yet. Add exclusivity expiry, regulatory deadlines, signing and closing —
          you'll get a reminder a week and a day before each.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="mt-5 space-y-2">
          {[...open, ...done].map((m) => {
            const label = m.customLabel ?? MILESTONE_LABELS[m.kind];
            const u = urgencyOf(m.dueDate) ?? "later";
            return (
              <li
                key={m.id}
                data-testid={`milestone-${m.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border p-3"
                style={{
                  borderColor: "var(--fg-rule)",
                  background: !m.completed && u === "overdue"
                    ? "color-mix(in srgb, var(--sev-flag) 5%, var(--fg-surface))"
                    : "var(--fg-surface)",
                }}
              >
                <input
                  type="checkbox"
                  checked={m.completed}
                  onChange={(e) => update.mutate({ id: m.id, completed: e.target.checked })}
                  aria-label={`Mark ${label} complete`}
                  className="h-4 w-4 shrink-0"
                  style={{ accentColor: "var(--sev-grounded)" }}
                />
                <span
                  className="font-mono text-[12px] tabular-nums"
                  style={{ color: "var(--fg-2)" }}
                >
                  {m.dueDate}
                </span>
                <span
                  className="font-serif text-[15px]"
                  style={{
                    color: "var(--fg)",
                    textDecoration: m.completed ? "line-through" : undefined,
                    opacity: m.completed ? 0.55 : 1,
                  }}
                >
                  {label}
                </span>
                {!m.completed && (
                  <span className="font-mono text-[length:var(--step-xs)] font-medium" style={{ color: URGENCY_COLOR[u] }}>
                    {countdownLabel(m.dueDate)}
                  </span>
                )}
                {m.note && (
                  <span className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                    {m.note}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove.mutate({ id: m.id })}
                  className="ml-auto font-sans text-[12px] underline-offset-4 hover:underline"
                  style={{ color: "var(--fg-2)" }}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field required label="Milestone">
          <SelectInput
            value={kind}
            onChange={(v) => setKind(v as MilestoneKind)}
            options={MILESTONE_KINDS as unknown as string[]}
          />
        </Field>
        {kind === "custom" && (
          <Field required label="Label">
            <TextInput value={customLabel} onChange={setCustomLabel} placeholder="Board approval" />
          </Field>
        )}
        <Field required label="Due date">
          <TextInput value={dueDate} onChange={setDueDate} type="date" />
        </Field>
        <Field label="Note (optional)">
          <TextInput value={note} onChange={setNote} placeholder="30-day no-shop" />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={onAdd}
          disabled={create.isPending}
          data-testid="add-milestone"
          className="rounded-full px-6 py-2.5 font-sans text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
        >
          {create.isPending ? "Adding…" : "Add milestone"}
        </button>
        {err && (
          <span className="font-sans text-[12.5px]" style={{ color: "var(--sev-flag-text)" }}>
            {err}
          </span>
        )}
      </div>
    </Card>
  );
}
