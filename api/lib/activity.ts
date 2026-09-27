// ─────────────────────────────────────────────────────────────────────────────
// Activity logging — one call per meaningful user action.
// Fire-and-forget: an activity write must never fail the action it describes.
// ─────────────────────────────────────────────────────────────────────────────
import { getDb } from "../queries/connection";
import { activityLog } from "@db/schema";
import type { User } from "@db/schema";

export function logActivity(
  user: User,
  entry: {
    type: "deal" | "target" | "ai" | "admin";
    action: string;
    detail?: string;
    dealId?: number;
    targetId?: number;
  },
): void {
  getDb()
    .insert(activityLog)
    .values({
      type: entry.type,
      action: entry.action,
      detail: entry.detail,
      dealId: entry.dealId,
      targetId: entry.targetId,
      userId: user.id,
      organizationId: user.organizationId ?? null,
    })
    .catch((err: unknown) => {
      console.warn("[activity] failed to log:", err instanceof Error ? err.message : err);
    });
}
