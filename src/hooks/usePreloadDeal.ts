import { hasFeature } from "@/lib/rbac";
import { useCallback } from "react";
import { trpc } from "@/providers/trpc";
import { loadDealDetail } from "@/routes/preload";

export function usePreloadDeal() {
  const utils = trpc.useUtils();
  return useCallback((id: number) => {
    if (!Number.isFinite(id)) return;
    void loadDealDetail().catch(() => undefined);
    // Shares the route's query key, freshness policy and in-flight request.
    void utils.deals.get.prefetch({ id }).catch(() => undefined);
    const user = utils.auth.me.getData() ?? null;
    if (hasFeature(user, "assumptions")) void utils.ai.listAssumptions.prefetch({ dealId: id }).catch(() => undefined);
    if (hasFeature(user, "recommendations")) void utils.recommendations.list.prefetch({ dealId: id }).catch(() => undefined);
  }, [utils]);
}
