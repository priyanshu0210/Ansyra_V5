import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { hasFeature } from "@/lib/rbac";
import type { AuthUser } from "@/hooks/useAuth";
import { Card } from "./parchment/Card";
import { Skeleton, LoadingAnnounce } from "./parchment/Skeleton";
import { Figure } from "./parchment/Figure";
import { Stagger, StaggerItem } from "@/components/motion";

// D3. What is waiting on you.
//
// THE PROBLEM THIS FIXES IS INFORMATION DESIGN, NOT DECORATION.
//
// Home opened with four KPIs, a directory of instruments, and a feed of what
// already happened. Every one of those is a report on the past or a map of the
// building. Nothing on the first screen of an Operate surface answered the only
// question someone opens a deal tool to ask: **what needs me?**
//
// The signals already existed and were all somewhere else:
//   • red-flag assumptions with no reviewer response — the exact predicate the
//     SERVER rejects a stage advance with (`blocksAdvancement`), previously
//     visible only after opening a deal's ledger;
//   • outcomes owed past their horizon — rendered only on the Analytics tab;
//
// so this band invents nothing. It reads rules that already exist, in the same
// order of urgency the product already enforces, and links to the surface that
// resolves each one. No new server logic, no new claim, no new copy about what
// the product does.
//
// WHY BLOCKED WORK RANKS ABOVE OWED WORK: a blocked gate is stopping a deal from
// moving right now; an owed outcome is a debt to the firm's own record. Both
// matter, only one is in the way.
//
// EMPTY IS A GOOD STATE AND SAYS SO. A band that vanishes when there is nothing
// to do teaches the reader nothing about whether it ran; one that says "nothing
// is waiting" is an answer.

interface Row {
  key: string;
  /** Ranked: lower sorts first. Blocking beats owed. */
  rank: number;
  dealId: number | null;
  headline: string;
  detail: string;
  actionLabel: string;
  onAct: () => void;
  tone: "flag" | "watch";
  count?: number;
}

export function NeedsYou({ user }: { user: AuthUser | null }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const assumptionsOn = hasFeature(user, "assumptions");
  const analyticsOn = hasFeature(user, "analytics");

  // Each source is gated on the feature that owns it, so a member without the
  // instrument never fires a query the server would refuse.
  //
  // BOTH SOURCES FOLD SERVER-SIDE. This panel needs one integer per deal from
  // each. It used to get the assumption half by listing every assumption the
  // caller could see — each row carrying its whole `result` payload — and
  // counting them here, which put an unbounded download on the app's most
  // visited route to produce a number. `ai.blockingByDeal` returns the counts
  // and the deal names, exactly as `patterns.outcomesOwed` already did, which
  // is also why the separate `deals.list` call for names is gone.
  const blocking = trpc.ai.blockingByDeal.useQuery(undefined, { enabled: assumptionsOn });
  const owed = trpc.patterns.outcomesOwed.useQuery(undefined, { enabled: analyticsOn });

  const loading = (assumptionsOn && blocking.isLoading) || (analyticsOn && owed.isLoading);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    // 1. Unanswered red flags, grouped by deal. The fold runs on the server and
    //    still goes through `blockingAssumptions` there — the same function
    //    `api/decisions-router.ts` calls before it will let a deal advance — so
    //    this cannot drift from what the server actually enforces.
    if (assumptionsOn && blocking.data) {
      for (const { dealId, dealName, count } of blocking.data) {
        out.push({
          key: `gate-${dealId}`,
          rank: 0,
          dealId,
          headline: dealName,
          detail:
            count === 1
              ? "One red-flag assumption has no second-reviewer response. The deal cannot advance until it is answered."
              : `${count} red-flag assumptions have no second-reviewer response. The deal cannot advance until they are answered.`,
          actionLabel: "Answer it",
          onAct: () => navigate(`/dashboard/deals/${dealId}`),
          tone: "flag",
          count,
        });
      }
    }

    // 2. Outcomes owed. A debt to the record rather than a blockage, so it
    //    ranks second and takes the watch tone, not the flag.
    if (analyticsOn && owed.data) {
      for (const d of owed.data.deals ?? []) {
        if (!d.owed) continue;
        out.push({
          key: `owed-${d.dealId}`,
          rank: 1,
          dealId: d.dealId,
          headline: d.dealName,
          detail:
            d.owed === 1
              ? "One decided recommendation is past its read date and has no outcome logged."
              : `${d.owed} decided recommendations are past their read dates with no outcome logged.`,
          actionLabel: "Log the outcome",
          onAct: () => navigate(`/dashboard/deals/${d.dealId}`),
          tone: "watch",
          count: d.owed,
        });
      }
    }

    return out.sort((a, b) => a.rank - b.rank || (b.count ?? 0) - (a.count ?? 0));
  }, [assumptionsOn, analyticsOn, blocking.data, owed.data, navigate]);

  // Nothing to show and nothing to say: a member with neither instrument should
  // not be told about work they cannot see.
  if (!assumptionsOn && !analyticsOn) return null;

  const visibleRows = showAll ? rows : rows.slice(0, 5);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <section data-testid="needs-you" aria-labelledby="needs-you-heading">
      <div className="mb-3 flex items-baseline justify-between">
        <p id="needs-you-heading" className="ansyra-label" style={{ color: "var(--fg-2)" }}>
          Needs you
        </p>
        {rows.length > 0 && (
          <span className="font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
            <Figure value={rows.length} /> {rows.length === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      <Card>
        {loading ? (
          <>
            <LoadingAnnounce what="what needs you" />
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton w={3} h={34} style={{ borderRadius: 999 }} />
                  <div className="min-w-0 flex-1">
                    <Skeleton w="42%" />
                    <Skeleton w="78%" h={10} className="mt-2" style={{ opacity: 0.7 }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : rows.length === 0 ? (
          <div data-testid="needs-you-clear">
            <p className="font-sans font-medium" style={{ color: "var(--fg)", fontSize: "var(--step-sm)" }}>
              Nothing is waiting on you.
            </p>
            <p
              className="mt-1.5 text-pretty font-sans"
              style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.55, maxWidth: "58ch" }}
            >
              No deal is held up by an unanswered red flag, and every decided
              recommendation has had its outcome logged or is not due one yet.
            </p>
          </div>
        ) : (
          <Stagger className="divide-y" style={{ borderColor: "var(--fg-rule)" }} step={0.04}>
            {visibleRows.map((r) => (
              <StaggerItem key={r.key}>
                <div className="flex items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                  {/* Severity as a bar, not a dot: it has to be findable in
                      peripheral vision down a list, and it carries a second
                      channel (position + height) so it does not rely on hue. */}
                  <span
                    aria-hidden
                    className="mt-1 block shrink-0"
                    style={{
                      width: 3,
                      height: 34,
                      borderRadius: 999,
                      // The `-text` cuts, not the base severity tokens: those
                      // are light-ground values used in both themes and measure
                      // 1.4-2.0:1 on the dark panel. These bars convey state, so
                      // they owe 3:1 (WCAG 1.4.11).
                      background:
                        r.tone === "flag" ? "var(--sev-flag-text)" : "var(--sev-watch-text)",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate font-sans font-medium"
                      style={{ color: "var(--fg)", fontSize: "var(--step-sm)" }}
                    >
                      {r.headline}
                    </p>
                    <p
                      className="mt-1 text-pretty font-sans"
                      style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.5 }}
                    >
                      {r.detail}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={r.onAct}
                    className="ansyra-cta ansyra-cta--ghost shrink-0 px-3.5 py-1.5"
                    style={{ fontSize: "var(--step-xs)", minHeight: 36 }}
                    data-testid={`needs-you-act-${r.key}`}
                  >
                    {r.actionLabel}
                  </button>
                </div>
              </StaggerItem>
            ))}
            {rows.length > 5 && (
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setShowAll((current) => !current)}
                  className="min-h-11 rounded-full border px-4 font-sans text-[length:var(--step-xs)]"
                  style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}
                  aria-expanded={showAll}
                >
                  {showAll ? "Show highest-priority items only" : `Show all · ${hiddenCount} more`}
                </button>
              </div>
            )}
          </Stagger>
        )}
      </Card>
    </section>
  );
}
