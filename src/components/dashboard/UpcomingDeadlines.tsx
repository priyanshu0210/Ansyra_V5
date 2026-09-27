import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { MILESTONE_LABELS, countdownLabel, urgencyOf, type Urgency } from "@contracts/milestones";
import { Card } from "./parchment/Card";

// Upcoming deadlines (Phase 15.3) — the soonest milestones across the member's
// whole scoped portfolio. Deliberately the most attention-grabbing block on the
// dashboard: "Exclusivity expires in 6 days" is the line that makes someone act.

const URGENCY_COLOR: Record<Urgency, string> = {
  overdue: "var(--sev-flag)",
  imminent: "var(--fg)",
  soon: "var(--sev-watch)",
  later: "var(--fg-2)",
};

export function UpcomingDeadlines({ limit = 5 }: { limit?: number }) {
  const q = trpc.milestones.upcoming.useQuery({ limit });
  const rows = q.data ?? [];

  if (q.isLoading || rows.length === 0) return null;

  return (
    <Card className="p-6" data-testid="upcoming-deadlines">
      <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
        Upcoming deadlines
      </h3>
      <ul className="mt-4 divide-y" style={{ borderColor: "var(--fg-rule)" }}>
        {rows.map((m) => {
          const label = m.customLabel ?? MILESTONE_LABELS[m.kind];
          const u = urgencyOf(m.dueDate) ?? "later";
          return (
            <li key={m.id} className="py-3 first:pt-0 last:pb-0">
              <Link
                to={`/dashboard/deals/${m.dealId}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                data-testid={`deadline-${m.id}`}
              >
                <span className="font-mono text-[length:var(--step-xs)] font-medium tabular-nums" style={{ color: URGENCY_COLOR[u] }}>
                  {countdownLabel(m.dueDate)}
                </span>
                <span className="font-serif text-[15px]" style={{ color: "var(--fg)" }}>
                  {label}
                </span>
                <span className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                  {m.dealName}
                </span>
                <span className="ml-auto font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
                  {m.dueDate}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
