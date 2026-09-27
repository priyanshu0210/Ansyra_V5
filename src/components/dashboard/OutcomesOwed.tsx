import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  SCHEDULED_HORIZONS,
  SCHEDULED_HORIZON_PHRASE,
  type ScheduledHorizon,
} from "@contracts/outcome-schedule";
import { Card } from "./parchment/Card";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";

// Outcomes owed (Phase 15.11) — the reads this firm still owes itself.
//
// Owns its own query, for the same reason FailurePatterns does: everything else
// on the Analytics tab is computed from props, and its mount sits inside the
// dashboard's shared deals/targets loading contract, which knows nothing about a
// third async source.
//
// Nothing here is stored. The queue is derived from recommendations + outcomes +
// milestones on every read, so it cannot go stale and there is no reminder state
// to reconcile.

export function OutcomesOwed() {
  const q = trpc.patterns.outcomesOwed.useQuery();

  if (q.isLoading) {
    return (
      <Card className="p-6">
        <LoadingAnnounce what="what is owed" />
        <SkeletonRows rows={3} />
      </Card>
    );
  }

  const data = q.data;
  const totalOwed = data?.totalOwed ?? 0;
  const deals = data?.deals ?? [];
  const unanchoredDeals = data?.unanchoredDeals ?? 0;
  const owedDeals = deals.filter((d) => d.owed > 0);

  if (totalOwed === 0) {
    return (
      <Card className="p-6" data-testid="outcomes-owed-empty">
        <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>
          Nothing owed.
        </p>
        <p
          className="mt-1 font-sans text-[13px]"
          style={{ color: "var(--fg-2)", maxWidth: "62ch" }}
        >
          Every decided recommendation has had its reads logged, or is not due one yet. Reads
          are scheduled at thirty days, ninety days and six months from the decision, and
          post-close from the deal's closing milestone.
          {unanchoredDeals > 0 && (
            <>
              {" "}
              {unanchoredDeals} deal{unanchoredDeals === 1 ? " has" : "s have"} no closing
              milestone, so {unanchoredDeals === 1 ? "its" : "their"} post-close read
              {unanchoredDeals === 1 ? " is" : "s are"} not scheduled.
            </>
          )}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6" data-testid="outcomes-owed">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
            Outcomes owed
          </h3>
          <p
            className="mt-1 font-sans text-[12.5px]"
            style={{ color: "var(--fg-2)", maxWidth: "72ch" }}
          >
            Reads this firm has scheduled for itself and not yet logged. A conclusion nobody
            goes back to check is one the firm learns nothing from.
          </p>
        </div>
        <span
          className="font-mono text-[length:var(--step-xs)]"
          style={{ color: "var(--sev-watch-text)" }}
        >
          {totalOwed} owed across {owedDeals.length} deal{owedDeals.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="mt-4 space-y-1">
        {SCHEDULED_HORIZONS.map((h) => {
          const n = data?.byHorizon?.[h as ScheduledHorizon] ?? 0;
          if (n === 0) return null;
          return (
            <li
              key={h}
              data-testid={`owed-horizon-${h}`}
              className="font-sans text-[13px]"
              style={{ color: "var(--fg-2)" }}
            >
              <span style={{ color: "var(--fg)" }}>{n}</span> recommendation{n === 1 ? "" : "s"}{" "}
              with {SCHEDULED_HORIZON_PHRASE[h]} outcome{n === 1 ? "" : "s"} owed
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
          Where they are
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {owedDeals.map((d) => (
            <Link
              key={d.dealId}
              to={`/dashboard/deals/${d.dealId}`}
              data-testid={`owed-deal-${d.dealId}`}
              className="inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 font-sans text-[12.5px]"
              style={{
                borderColor: "var(--fg-rule)",
                background: "var(--fg-surface)",
                color: "var(--fg)",
                minHeight: 44,
              }}
            >
              {d.dealName}
              <span className="font-mono" style={{ color: "var(--sev-watch-text)" }}>
                {d.owed}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Reported, never counted. A post-close read with no close date to count
          from is not overdue — it is unscheduled, and saying so is the honest
          version of leaving it out. */}
      {unanchoredDeals > 0 && (
        <p
          data-testid="owed-unanchored"
          className="mt-3 font-mono text-[length:var(--step-xs)]"
          style={{ color: "var(--fg-2)" }}
        >
          {unanchoredDeals} deal{unanchoredDeals === 1 ? "" : "s"} ha
          {unanchoredDeals === 1 ? "s" : "ve"} no closing milestone, so their post-close reads
          are not scheduled.
        </p>
      )}
    </Card>
  );
}
