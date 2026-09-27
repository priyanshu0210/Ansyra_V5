import { useIsFetching } from "@tanstack/react-query";
import { usePreloadPanel } from "@/hooks/usePreloadPanel";
import { panelLoaders } from "@/components/dashboard/panel-loaders";
import { PageHelp } from "@/components/dashboard/PageHelp";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { type DashTabId, DASH_TAB_IDS, visibleTabIds } from "@/components/dashboard/dashboard-tabs";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Card } from "@/components/dashboard/parchment/Card";
import { Skeleton, SkeletonRows, LoadingAnnounce } from "@/components/dashboard/parchment/Skeleton";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { AIChatWidget } from "@/components/ansyra/chat/AIChatWidget";
import { PortfolioNotice } from "@/components/PortfolioNotice";
import { hasFeature } from "@/lib/rbac";

const DealPipeline = lazy(panelLoaders["pipeline"]);
const TargetScreen = lazy(panelLoaders["targets"]);
const CompsTable = lazy(panelLoaders["comps"]);
const Analytics = lazy(panelLoaders["analytics"]);
const RecentActivity = lazy(panelLoaders["activity"]);
const DealGenome = lazy(panelLoaders["genome"]);
const AssumptionLedger = lazy(panelLoaders["assumptions"]);
const CulturalCompatibility = lazy(panelLoaders["cultural"]);
const RegulatoryRadar = lazy(panelLoaders["regulatory"]);
const SynergyEngine = lazy(panelLoaders["synergy"]);
const AdminPanel = lazy(panelLoaders["admin"]);
const AccessRequests = lazy(panelLoaders["access-requests"]);
const BugReports = lazy(panelLoaders["bugs"]);

const TAB_META: Record<DashTabId, { label: string; sub: string }> = {
  home:              { label: "Home",                   sub: "Pipeline health, your instruments, and what happened last." },
  pipeline:          { label: "Deal Pipeline",          sub: "Track and manage your active M&A deals" },
  targets:           { label: "Target Screening",       sub: "Screen and evaluate potential acquisition targets" },
  genome:            { label: "Deal Genome",            sub: "Institutional memory. Searchable across every deal you've ever run." },
  assumptions:       { label: "Assumption Ledger",      sub: "Challenge recorded assumptions and identify missing evidence." },
  cultural:          { label: "People & Integration Review", sub: "Prepare questions about leadership, retention, and integration." },
  regulatory:        { label: "Regulatory Review",       sub: "Prepare regulatory questions and evidence gaps for specialist review." },
  synergy:           { label: "Synergy Reality Engine", sub: "Planned vs. actual synergies, with a corrective action for every variance." },
  analytics:         { label: "Analytics",              sub: "Insights and performance metrics for your deal flow" },
  comps:             { label: "Precedent Comps",        sub: "Recorded deal valuations and multiples, filterable to closed transactions." },
  activity:          { label: "Recent Activity",        sub: "Recent actions and updates across your deals" },
  admin:             { label: "User Management",        sub: "Provision accounts and manage members, admins, and feature access" },
  "access-requests": { label: "Access Requests",        sub: "Review and approve people asking to join Ansyra" },
  bugs:              { label: "Bug Reports",            sub: "Triage bugs reported from inside the product" },
  "admin-activity":  { label: "Admin Activity",         sub: "Administrative actions across the platform" },
};

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--clear)" }}>
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div aria-hidden className="ansyra-spin h-8 w-8 rounded-full border-2" style={{ borderColor: "var(--fg-rule)", borderTopColor: "var(--fg)" }} />
        <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>Loading Ansyra…</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isAuthenticated, isLoading: authLoading, isAuthoritativelyUnauthenticated, isUnresolved } = useAuth();
  const navigate = useNavigate();
  const preloadPanel = usePreloadPanel();
  const fetching = useIsFetching();
  const warmedFor = useRef<string | null>(null);

  // Section persists in the URL (?tab=xxx) — survives ANY remount / hard
  // reload, so users don't lose their place if the app briefly re-hydrates.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: DashTabId = (DASH_TAB_IDS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as DashTabId)
    : "home";
  const setActiveTab = useCallback(
    (t: DashTabId) => {
      void preloadPanel(t);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          // Home is the default landing tab, so it owns the clean/no-param URL.
          if (t === "home") next.delete("tab");
          else next.set("tab", t);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, preloadPanel],
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // <md: the sidebar is an overlay drawer opened from the header hamburger.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Only route away on an EXPLICIT 401/403 from auth.me. Transient network
  // errors do not unmount the dashboard anymore.
  // `isUnresolved` covers the other way out: auth.me never answered at all, so
  // there is nothing to route on. Without it this screen waits forever.
  useEffect(() => {
    if (isAuthoritativelyUnauthenticated || isUnresolved) {
      navigate("/login", { replace: true });
    }
  }, [isAuthoritativelyUnauthenticated, isUnresolved, navigate]);

  // A user still holding an admin-issued temporary password is forced through
  // the change-password screen before they can use the product.
  useEffect(() => {
    if (user?.mustChangePassword) {
      navigate("/welcome?mode=change", { replace: true });
    }
  }, [user?.mustChangePassword, navigate]);

  // Route-guard: the tab we actually render is always one this user may see.
  // If the URL points at a forbidden/unknown tab, fall back to their first
  // allowed tab (server still enforces on every data call regardless).
  const allowedTabs = visibleTabIds(user);
  const effectiveTab: DashTabId = allowedTabs.includes(activeTab)
    ? activeTab
    : (allowedTabs[0] ?? activeTab);
  useEffect(() => {
    if (effectiveTab !== activeTab) setActiveTab(effectiveTab);
  }, [effectiveTab, activeTab, setActiveTab]);

  // Land at the top when the instrument changes.
  //
  // THE DOCUMENT IS THE SCROLLER, NOT <main>. `main` carries `overflow-auto`,
  // which makes it look like the scroll container and it is not one: it is a
  // `flex-1` child with no height bound, so it grows to its content and
  // `scrollHeight === clientHeight` — measured at 3099 = 3099, `scrollTop`
  // pinned at 0 while `window.scrollY` moves. An earlier version of this
  // scrolled `mainRef` and was therefore a no-op that read as a fix.
  //
  // Both are scrolled anyway. If the layout ever does bound `main`'s height the
  // reset keeps working, and on today's layout the second call costs nothing.
  //
  // `instant` because the panel is crossfading — a smooth scroll under a fade
  // reads as two things happening at once.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [effectiveTab]);

  // Start code loading while the queries below fetch data, not after they finish.
  useEffect(() => { void preloadPanel(effectiveTab); }, [effectiveTab, preloadPanel, user?.id]);

  // Wait for Home to settle, then warm only these frequently used panels.
  // Sequential requests avoid competing with the initial dashboard load.
  useEffect(() => {
    if (!user || effectiveTab !== "home" || fetching || warmedFor.current === user.id) return;
    const timer = window.setTimeout(() => {
      warmedFor.current = user.id;
      void (async () => {
        for (const tab of ["pipeline", "synergy", "activity"] as const) {
          await preloadPanel(tab);
        }
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [user, effectiveTab, fetching, preloadPanel]);

  const isMember = user?.userKind === "member";
  const dealListTabs: DashTabId[] = ["home", "genome", "assumptions", "cultural", "regulatory", "synergy", "analytics"];
  const targetListTabs: DashTabId[] = ["home", "targets", "analytics"];
  // No `retry` here: both restated the provider default as the literal `1`,
  // which is how a policy change stops reaching the queries it was written for.
  // They inherit `retryQuery` now — one retry, none on a 401/403.
  const deals = trpc.deals.list.useQuery(undefined, {
    enabled: isAuthenticated && isMember && hasFeature(user, "pipeline") && dealListTabs.includes(effectiveTab),
    staleTime: 5 * 60 * 1000,
  });
  const targets = trpc.targets.list.useQuery(undefined, {
    enabled: isAuthenticated && isMember && hasFeature(user, "targets") && targetListTabs.includes(effectiveTab),
    staleTime: 5 * 60 * 1000,
  });

  if (authLoading || (!isAuthenticated && !isAuthoritativelyUnauthenticated) || !user) {
    return <LoadingScreen />;
  }

  const meta = TAB_META[effectiveTab];
  const dealList = deals.data ?? [];
  const targetList = targets.data ?? [];
  const productTabsNeedingData = ["targets", "genome", "assumptions", "cultural", "regulatory", "synergy", "analytics"];
  const dealsReady = !deals.isLoading && !deals.isError;
  const targetsReady = !targets.isLoading && !targets.isError;

  // The shell takes `--clear`, matching the <main> that covers it, NOT
  // `--fg-surface`. This is dead paint in practice — the sidebar, the header and
  // <main> tile over all of it — but it was painted the CARD colour, so on any
  // frame where it did show through it showed the one value that must never be
  // a ground. It costs nothing to make the fallback the ground it stands in for.
  return (
    <div data-surface="operate" className="flex min-h-screen" style={{ background: "var(--clear)", color: "var(--fg)" }}>
      <DashboardSidebar
        activeTab={effectiveTab}
        onTabChange={(t) => { setMobileNavOpen(false); setActiveTab(t); }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        user={user}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ml-0 ${sidebarCollapsed ? "md:ml-16" : "md:ml-64"}`}>
        <PortfolioNotice />
        <DashboardHeader user={user} onMenu={() => setMobileNavOpen(true)} />

        {/* THE SCROLL CONTAINER IS STABLE; ONLY THE PANEL INSIDE IT IS KEYED.
            The key has to sit on the animated element for the crossfade to
            restart — React reuses a DOM node otherwise and the animation never
            replays. It was on <main> itself, which threw away the scroll
            container and everything under it on every tab change, to restart a
            120ms fade. The instrument components already differ by type, so
            React swaps those regardless; keying the inner panel keeps the cost
            to what it would have been anyway and leaves <main> alone. */}
        <main
          ref={mainRef}
          className="flex-1 overflow-auto p-4 md:p-8"
          style={{ background: "var(--clear)" }}
          data-testid={`dashboard-tab-${effectiveTab}`}
        >
        <div key={effectiveTab} className="ansyra-tab-panel">
          <div className="mb-8">
            <h1 className="mt-1 font-serif text-4xl font-light" style={{ color: "var(--fg)" }}>{meta.label}</h1>
            <div className="mt-3 h-px w-16" style={{ background: "var(--fg-rule)" }} />
            <p className="mt-3 font-sans text-sm" style={{ color: "var(--fg-2)" }}>{meta.sub}</p>
            <PageHelp page={effectiveTab} />
          </div>

          {productTabsNeedingData.includes(effectiveTab) && (
            <>
              {(deals.isError || targets.isError) && (
                <DataError
                  message={
                    deals.error?.message || targets.error?.message || "Failed to load deals or targets."
                  }
                  onRetry={() => {
                    deals.refetch();
                    targets.refetch();
                  }}
                />
              )}
              {/* A shape the width of the panel that is coming, not the word
                  "Loading". The skeleton holds the layout open so nothing jumps
                  when the query lands. */}
              {(deals.isLoading || targets.isLoading) && !deals.data && !targets.data && (
                <div data-testid="shell-loading">
                  <LoadingAnnounce what={meta.label.toLowerCase()} />
                  <Card>
                    <Skeleton w="38%" h={14} />
                    <div className="mt-5">
                      <SkeletonRows rows={4} />
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}

          {effectiveTab === "home"        && (
            <DashboardHome
              user={user}
              deals={dealList}
              dealsLoading={deals.isLoading}
              targets={targetList}
              targetsLoading={targets.isLoading}
              onNavigate={setActiveTab}
            />
          )}
          <Suspense fallback={<PanelFallback label={meta.label} />}>
            {effectiveTab === "pipeline"                                  && <DealPipeline />}
            {effectiveTab === "targets"     && targetsReady              && <TargetScreen          targets={targetList} />}
            {effectiveTab === "genome"      && dealsReady                && <DealGenome            deals={dealList} />}
            {effectiveTab === "assumptions" && dealsReady                && <AssumptionLedger      deals={dealList} />}
            {effectiveTab === "cultural"    && dealsReady                && <CulturalCompatibility deals={dealList} />}
            {effectiveTab === "regulatory"  && dealsReady                && <RegulatoryRadar       deals={dealList} />}
            {effectiveTab === "synergy"     && dealsReady                && <SynergyEngine         deals={dealList} />}
            {effectiveTab === "analytics"   && dealsReady && targetsReady && <Analytics deals={dealList} targets={targetList} />}
            {effectiveTab === "comps"       && <CompsTable />}
            {effectiveTab === "activity"         && <RecentActivity />}
            {effectiveTab === "admin"            && <AdminPanel />}
            {effectiveTab === "access-requests"  && <AccessRequests />}
            {effectiveTab === "bugs"             && <BugReports />}
            {effectiveTab === "admin-activity"   && <RecentActivity />}
          </Suspense>
        </div>
        </main>
      </div>

      {/* The copilot is a member product feature — never show it to admins. */}
      {isMember && <AIChatWidget surface={effectiveTab} />}
    </div>
  );
}

function PanelFallback({ label }: { label: string }) {
  return (
    <Card>
      <LoadingAnnounce what={label.toLowerCase()} />
      <SkeletonRows rows={4} />
    </Card>
  );
}

function DataError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="data-error"
      // 1px, not 4. A thick coloured side border is the callout tell the
      // craft floor names; the tinted fill already carries the severity.
      className="mb-6 rounded-sm border-l p-5"
      style={{ borderColor: "var(--sev-flag)", background: "color-mix(in srgb, var(--sev-flag) 8%, var(--fg-surface))" }}
    >
      <p className="font-serif text-lg" style={{ color: "var(--sev-flag-text)" }}>Couldn&apos;t load your data.</p>
      <p className="mt-1 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>{message}</p>
      <button
        onClick={onRetry}
        data-testid="data-error-retry"
        className="mt-3 rounded-full border px-4 py-1.5 font-sans text-[12px]"
        style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}
      >
        Try again
      </button>
    </div>
  );
}
