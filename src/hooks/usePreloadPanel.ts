import { useCallback } from "react";
import { trpc } from "@/providers/trpc";
import { visibleTabIds, type DashTabId } from "@/components/dashboard/dashboard-tabs";
import { preloadPanel } from "@/components/dashboard/panel-loaders";
import { hasFeature } from "@/lib/rbac";

// Warm the same keys the panels consume; React Query shares in-flight work.
export function usePreloadPanel() {
  const utils = trpc.useUtils();
  return useCallback(async (tab: DashTabId) => {
    const user = utils.auth.me.getData() ?? null;
    if (!user || !visibleTabIds(user).includes(tab)) return;
    preloadPanel(tab);
    try {
      if (tab === "pipeline") await utils.deals.pipelineBoard.prefetch({ query: "", industry: undefined, stage: undefined });
      if (tab === "activity" || tab === "admin-activity") await utils.activity.list.prefetch({ limit: 50 });
      if (tab === "synergy" && hasFeature(user, "pipeline")) {
        const deals = await utils.deals.list.fetch(undefined, { staleTime: 5 * 60 * 1000 });
        const deal = deals.find(row => row.stage === "integration");
        if (deal) await utils.ai.getSynergyPlan.prefetch({ dealId: deal.id });
      }
    } catch {
      // The visible panel owns errors and retry; speculative loading is silent.
    }
  }, [utils]);
}
