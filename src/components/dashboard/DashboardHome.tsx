import { useCurrency } from "./currency";
import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { type AuthUser } from "@/hooks/useAuth";
import { hasFeature } from "@/lib/rbac";
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from "@contracts/constants";
import { computePipelineStats } from "@/lib/pipeline-stats";
import { relativeTime } from "@/lib/relative-time";
import { toast } from "sonner";
import { Card } from "./parchment/Card";
import { NeedsYou } from "./NeedsYou";
import { Figure } from "./parchment/Figure";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import { UpcomingDeadlines } from "./UpcomingDeadlines";
import { Stagger, StaggerItem, Reveal } from "@/components/motion";
import { type DashTabId } from "./DashboardSidebar";

// Home is the post-login command surface (Phase 12.8): pipeline health at a
// glance, a launcher for every feature (granted or locked), and a peek at what
// happened last. It renders its own loading/locked states so a member missing
// pipeline/targets never hits the page-level data-error gate.

interface HomeDeal {
  stage: string;
  value: string | null;
  valueAmount: string | null;
  valueCurrency: string | null;
  isDemo?: boolean;
}
interface HomeTarget { sector: string; fitScore: number }

// Where each feature's card points, plus a one-liner. The two reserved
// features (target_discovery, documents) have no tab of their own — they live
// inside other surfaces, so we route to the nearest home and say where.
const FEATURE_NAV: Record<FeatureKey, { tab: DashTabId; blurb: string; where?: string }> = {
  pipeline:         { tab: "pipeline",    blurb: "Track and manage active deals across every stage." },
  targets:          { tab: "targets",     blurb: "Screen and score potential acquisition targets." },
  genome:           { tab: "genome",      blurb: "Search your institutional memory across every deal." },
  assumptions:      { tab: "assumptions", blurb: "Stress-test every thesis for hidden bias." },
  cultural:         { tab: "cultural",    blurb: "Prepare questions about leadership, retention, and integration." },
  regulatory:       { tab: "regulatory",  blurb: "Gauge antitrust risk, jurisdictions, and precedent." },
  synergy:          { tab: "synergy",     blurb: "Compare planned vs. actual post-close synergies." },
  analytics:        { tab: "analytics",   blurb: "See pipeline value, stage funnel, and sector mix." },
  target_discovery: { tab: "targets",     blurb: "AI-source new targets from public signals.", where: "Inside Target Screening" },
  documents:        { tab: "pipeline",    blurb: "Analyze diligence documents for risks and terms.", where: "Open a deal → Data Room" },
  decisions:        { tab: "pipeline",    blurb: "Record investment decisions and request draft committee memos.", where: "Open a deal → Decision Log" },
  economics:        { tab: "pipeline",    blurb: "Enter deal economics and read entry multiples.", where: "Open a deal → Economics" },
  timeline:         { tab: "pipeline",    blurb: "Track exclusivity, filings, signing and closing dates.", where: "Open a deal → Timeline" },
  comps:            { tab: "comps",       blurb: "Benchmark against what your firm has actually paid." },
  dd_tracker:       { tab: "pipeline",    blurb: "Run diligence as a live checklist with owners and statuses.", where: "Open a deal → Diligence" },
  scenarios:        { tab: "assumptions", blurb: "Compose assumptions into base, upside and downside cases.", where: "Inside Assumption Ledger" },
  comments:         { tab: "pipeline",    blurb: "Discuss a deal with your team, right on the dossier.", where: "Open a deal → Discussion" },
  recommendations:  { tab: "pipeline",    blurb: "Turn analysis into recorded conclusions that gate the deal.", where: "Open a deal → Recommendations" },
};

/** ── THE BENTO ───────────────────────────────────────────────────────────────
 *  Tile sizes for the launcher. Everything unlisted is 1x1.
 *
 *  THE SIZES ARE AN ARGUMENT, NOT DECORATION. The four listed here are the
 *  product's own thesis: Deal Genome is the institutional memory the whole
 *  wedge rests on, the Assumption Ledger is the only instrument that can STOP a
 *  deal advancing, Cultural Compatibility is the one nobody else scores before
 *  an NDA, and the Synergy Reality Engine is the only one that keeps measuring
 *  after close. A launcher where every tile is the same size says every tool
 *  matters equally, which is the opposite of what this product claims.
 *
 *  THE ARITHMETIC MATTERS, because a bento that does not divide leaves holes.
 *  18 tiles, 3 columns. The spans add 6 extra cells (genome +3, assumptions +1,
 *  cultural +1, synergy +1) for 24 total — exactly 8 rows. `grid-auto-flow:
 *  dense` then backfills anything auto-placement would otherwise skip, which is
 *  what keeps it gapless when a member has a different set granted and the
 *  count changes underneath it. */
const TILE: Partial<Record<FeatureKey, string>> = {
  genome: "sm:col-span-2 sm:row-span-2",
  pipeline: "sm:row-span-2",
  targets: "sm:col-span-2",
  assumptions: "sm:col-span-2",
  cultural: "sm:row-span-2",
  regulatory: "sm:row-span-2",
  synergy: "sm:col-span-2",
  analytics: "sm:col-span-2",
  documents: "sm:row-span-2",
  decisions: "sm:col-span-2",
  economics: "sm:row-span-2",
  timeline: "sm:col-span-2",
  comps: "sm:row-span-2",
  dd_tracker: "sm:col-span-2",
  scenarios: "sm:row-span-2",
  recommendations: "sm:col-span-2",
};

/** The four the launcher is arguing for. They get the big TYPE as well as a big
 *  footprint; the other spans exist for TILING, and giving sixteen tiles the
 *  display setting would flatten the emphasis it is there to create. */
const LEAD = new Set<FeatureKey>(["genome", "assumptions", "cultural", "synergy"]);

/** Cells each tile occupies. Only used by the arithmetic guard below. */
const TILE_CELLS: Partial<Record<FeatureKey, number>> = {
  genome: 4,
  pipeline: 2, targets: 2, assumptions: 2, cultural: 2, regulatory: 2,
  synergy: 2, analytics: 2, documents: 2, decisions: 2, economics: 2,
  timeline: 2, comps: 2, dd_tracker: 2, scenarios: 2, recommendations: 2,
};

/**
 * THE BENTO ONLY TILES IF THE CELLS DIVIDE, AT EVERY COLUMN COUNT.
 *
 * The grid is 2 columns, then 3, then 4 as the viewport grows, so the cell
 * total has to be a multiple of all three — a multiple of 12. 18 tiles with the
 * spans above come to 36: nine rows at four columns, twelve at three, eighteen
 * at two, each exact. An earlier draft came to 29, which divides by none of
 * them and left a ragged last row at every width.
 *
 * Asserted rather than commented, because the tempting change here — giving one
 * more tile a wider span — silently breaks it. `grid-auto-flow: dense` hides
 * small mistakes by backfilling, which is precisely why the arithmetic needs to
 * be checked somewhere that cannot be fooled by the result looking fine.
 */
export const BENTO_CELLS = FEATURE_KEYS.reduce((n, k) => n + (TILE_CELLS[k] ?? 1), 0);

/** The four the launcher is arguing for. They get the big type as well as the
 *  big footprint; the other spans are for TILING, and giving nine tiles the
 *  display setting would flatten the emphasis it exists to create. */
const TAG: Record<string, string> = { deal: "Deal", target: "Target", ai: "AI", admin: "Admin" };

export function DashboardHome({
  user,
  deals,
  dealsLoading,
  targets,
  targetsLoading,
  onNavigate,
}: {
  user: AuthUser;
  deals: HomeDeal[];
  dealsLoading: boolean;
  targets: HomeTarget[];
  targetsLoading: boolean;
  onNavigate: (tab: DashTabId) => void;
}) {
  const pipelineOn = hasFeature(user, "pipeline");
  const targetsOn = hasFeature(user, "targets");
  const [showAllTools, setShowAllTools] = useState(false);
  const orderedFeatureKeys = useMemo(
    () => [...FEATURE_KEYS].sort((a, b) => {
      const score = (key: FeatureKey) => (hasFeature(user, key) ? 2 : 0) + (LEAD.has(key) ? 1 : 0);
      return score(b) - score(a) || FEATURE_KEYS.indexOf(a) - FEATURE_KEYS.indexOf(b);
    }),
    [user],
  );
  const visibleFeatureKeys = showAllTools ? orderedFeatureKeys : orderedFeatureKeys.slice(0, 8);

  const fx = useCurrency();
  const stats = useMemo(() => computePipelineStats(deals, targets), [deals, targets]);
  const activity = trpc.activity.list.useQuery({ limit: 8 });
  const utils = trpc.useUtils();
  const loadSamples = trpc.deals.loadSamples.useMutation({
    onSuccess: () => {
      utils.deals.list.invalidate();
      utils.targets.list.invalidate();
      utils.activity.list.invalidate();
      // Confirmation names what changed and where it went. "Success" would be
      // the interface congratulating itself.
      toast.success("Sample portfolio loaded", {
        description: "Three deals and their targets are on your pipeline.",
      });
    },
    // Failure names the problem and the recovery, never just the exception.
    onError: (e) =>
      toast.error("Could not load the sample portfolio", {
        description: e.message || "Try again, or reload the page if it keeps failing.",
      }),
  });

  const dealValue = (v: string) => (pipelineOn ? (dealsLoading ? "…" : v) : "—");
  const targetValue = (v: string) => (targetsOn ? (targetsLoading ? "…" : v) : "—");

  const KPIs = [
    { label: "Recorded deals", value: dealValue(deals.length.toString()), sub: pipelineOn ? "including completed and archived" : "Not enabled" },
    { label: "Recorded deal value", value: dealValue(fx.totals(stats.currencyTotals)), sub: pipelineOn ? (stats.unparsed > 0 ? `+ ${stats.unparsed} with unparsed value` : "reference FX conversion") : "Not enabled" },
    { label: "Targets tracked", value: targetValue(targets.length.toString()), sub: targetsOn ? "on the watchlist" : "Not enabled" },
    { label: "Average fit", value: targetValue(`${stats.avgFit}`), sub: targetsOn ? "of 100" : "Not enabled" },
  ];

  const showEmptyCta = pipelineOn && !dealsLoading && deals.length === 0;

  return (
    <div className="space-y-6">
      {/* The standing position, as a ruled register rather than four floating
          metric tiles. The stat-tile row (big number, small label, supporting
          text, repeated four times) is the category's default opening and it
          spends the most valuable strip of an Operate surface on chrome.
          A single ruled band reads faster and takes a quarter of the height. */}
      <Stagger
        className="grid grid-cols-2 border-t lg:grid-cols-4"
        style={{ borderColor: "var(--fg)" }}
        data-testid="home-kpis"
      >
        {KPIs.map((k) => (
          <StaggerItem key={k.label}>
            <div
              className="h-full border-b px-4 py-3 lg:border-b-0 lg:border-r lg:last:border-r-0"
              style={{ borderColor: "var(--fg-rule)" }}
            >
              <p className="font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
                {k.label}
              </p>
              <Figure
                value={k.value}
                format="raw"
                className="mt-1 block break-words font-display"
                style={{
                  color: "var(--fg)",
                  fontSize: k.value.length > 10 ? "var(--step-md)" : "var(--step-lead)",
                  lineHeight: 1.1,
                }}
              />
              <p className="mt-0.5 font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
                {k.sub}
              </p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      {/* WHAT NEEDS YOU, directly under the standing position and above the
          directory. The order is the argument: where the firm is, then what is
          waiting on you, then where to go. A tool that opens on a map of itself
          has answered the least useful question first. */}
      <NeedsYou user={user} />

      {/* Empty-pipeline onboarding */}
      {showEmptyCta && (
        <Reveal delay={0.1}>
        <Card>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>Your pipeline is empty.</p>
              <p className="mt-1 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
                Load a sample portfolio to explore every feature with realistic deals and targets.
              </p>
            </div>
            <button
              onClick={() => loadSamples.mutate()}
              disabled={loadSamples.isPending}
              data-testid="home-load-samples"
              className="ansyra-cta shrink-0 px-5 py-2.5 font-sans disabled:opacity-50"
              style={{ fontSize: "var(--step-sm)" }}
            >
              {loadSamples.isPending ? "Loading samples…" : "Load sample portfolio"}
            </button>
          </div>
        </Card>
        </Reveal>
      )}

      {/* THE LAUNCHER OWNS THE FULL WIDTH.
          It used to be two of three outer columns with a rail beside it, and
          the rail's content is SHORT — a deadlines card and an activity list —
          while the launcher is eighteen tiles deep. So below the activity card
          the entire third column was empty ground for most of the page's
          height: measured, the launcher ran 1208px and the rail about 420.
          A column that is empty for two thirds of its length is not a column.

          The rail is a band underneath now. Nothing sits beside eighteen tiles;
          the launcher gets the width, and four columns instead of three. */}
      <div>
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Your tools</p>
            <button
              type="button"
              onClick={() => setShowAllTools((current) => !current)}
              aria-expanded={showAllTools}
              className="min-h-11 rounded-full border px-4 font-sans text-[12px]"
              style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", background: "var(--fg-surface)" }}
            >
              {showAllTools ? "Show priority tools" : `Show all ${FEATURE_KEYS.length} tools`}
            </button>
          </div>
          {/* FOUR across at xl. At full width that is ~262px a tile, wider than
              the 235px three-in-two-thirds gave, so the longest label still
              sits on two lines and the grid holds one more column. */}
          <Stagger
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            /* `minmax`, not a fixed height: every tile in a row shares that
               row's height and each card stretches into it, so the row can grow
               for a long blurb without leaving anyone short. A fixed value
               would clip; `auto` alone would let a two-row tile dictate a
               height no single tile needs. */
            style={{ gridAutoRows: "minmax(136px, auto)", gridAutoFlow: "dense" }}
            step={0.05}
          >
            {visibleFeatureKeys.map((key) => {
              const granted = hasFeature(user, key);
              const nav = FEATURE_NAV[key];
              if (granted) {
                return (
                  <StaggerItem
                    key={key}
                    className={`h-full ${TILE[key] ?? ""}`}
                    whileHover={{ y: -3, boxShadow: "0 8px 28px rgba(46,43,35,0.12)" }}
                    whileTap={{ y: -1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  >
                    <button
                      onClick={() => onNavigate(nav.tab)}
                      data-testid={`home-feature-${key}`}
                      className="flex h-full min-h-[92px] w-full flex-col rounded-sm border p-4 text-left"
                      style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", boxShadow: "0 1px 6px rgba(46,43,35,0.06)" }}
                    >
                      {/* Emphasis is SIZE plus TYPE. A 2x2 tile still set at
                          15px reads as an empty box rather than as important,
                          so the four that carry a bigger footprint carry a
                          bigger setting to match it. */}
                      <p
                        className={LEAD.has(key) ? "font-serif text-[19px]" : "font-serif text-[15px]"}
                        style={{ color: "var(--fg)" }}
                      >
                        {FEATURE_LABELS[key]}
                      </p>
                      <p
                        className={
                          LEAD.has(key)
                            ? "mt-1.5 max-w-[42ch] font-sans text-[13px] leading-relaxed"
                            : "mt-1 font-sans text-[12px] leading-relaxed"
                        }
                        style={{ color: "var(--fg-2)" }}
                      >
                        {nav.blurb}
                      </p>
                      {nav.where && (
                        <p className="mt-auto pt-2 ansyra-label" style={{ color: "var(--fg)" }}>{nav.where}</p>
                      )}
                    </button>
                  </StaggerItem>
                );
              }
              return (
                /* Same footprint as the granted card. A locked tile that
                   collapsed to 1x1 would move every tile after it and put a
                   hole where the emphasis was meant to be. */
                <StaggerItem key={key} className={`h-full ${TILE[key] ?? ""}`}>
                  <div
                    data-testid={`home-feature-${key}`}
                    className="flex h-full min-h-[92px] w-full flex-col rounded-sm border p-4"
                    style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", opacity: 0.6 }}
                  >
                    <div className="flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-2)" strokeWidth="2" aria-hidden>
                        <rect x="5" y="11" width="14" height="9" rx="1" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                      <p className="font-serif text-[15px]" style={{ color: "var(--fg-2)" }}>{FEATURE_LABELS[key]}</p>
                    </div>
                    <p className="mt-1 font-sans text-[12px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{nav.blurb}</p>
                    <p className="mt-auto pt-2 ansyra-label" style={{ color: "var(--fg-2)" }}>Locked · ask your admin</p>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>

        {/* THE RAIL, AS A BAND BELOW. Deadlines and activity used to be
            two SIBLINGS of the tools block in a three-column grid, and the tools
            span two of those columns — so only one of them could sit in row 1.
            Measured at 1440: deadlines took column 3, and Recent activity was
            auto-placed into ROW 2, COLUMN 1, a 357px card stranded under a
            739px block. Wrapping them makes the rail a single child that owns
            column 3, which is what the layout always looked like it meant.

            It also fixes the empty right column: `UpcomingDeadlines` renders
            nothing when the member has no milestones, and as a bare grid child
            its wrapper still claimed the full row height — 357px wide and 1076
            tall of nothing. Inside the rail it collapses and the activity card
            moves up to fill it. */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {hasFeature(user, "timeline") && (
          <Reveal delay={0.12} inView>
            <div className="mb-6">
              <UpcomingDeadlines />
            </div>
          </Reveal>
        )}

        {/* Recent activity preview */}
        <Reveal delay={0.15} inView>
          <div className="mb-3 flex items-center justify-between">
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Recent activity</p>
            <button onClick={() => onNavigate("activity")} data-testid="home-view-activity" className="font-sans text-[12px] underline-offset-4 hover:underline" style={{ color: "var(--fg)" }}>
              View all →
            </button>
          </div>
          <Card>
            {activity.isLoading && (
              <>
                <LoadingAnnounce what="recent activity" />
                <SkeletonRows rows={4} />
              </>
            )}
            {activity.isError && <p className="font-sans text-sm" style={{ color: "var(--sev-flag-text)" }}>{activity.error.message}</p>}
            {activity.data && activity.data.length === 0 && (
              <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
                Nothing here yet. Your actions will show up as you work.
              </p>
            )}
            {activity.data && activity.data.length > 0 && (
              <ul className="divide-y" style={{ borderColor: "var(--fg-rule)" }} data-testid="home-activity-feed">
                {activity.data.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-3" style={{ borderColor: "var(--fg-rule)" }}>
                    <span className="mt-0.5 inline-flex h-5 items-center justify-center rounded-sm border px-1.5 ansyra-label" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>
                      {TAG[a.type] ?? a.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-[14px]" style={{ color: "var(--fg)" }}>{a.action}</p>
                      {a.detail && <p className="truncate font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>{a.detail}</p>}
                    </div>
                    <span className="shrink-0 font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>{relativeTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
        </div>
      </div>
    </div>
  );
}
