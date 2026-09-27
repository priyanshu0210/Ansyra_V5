import { trpc } from "@/providers/trpc";
import { Card } from "./parchment/Card";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import { relativeTime } from "@/lib/relative-time";

const TAG: Record<string, string> = { deal: "Deal", target: "Target", ai: "AI", admin: "Admin" };

export function RecentActivity() {
  const activity = trpc.activity.list.useQuery({ limit: 50 });

  return (
    <div className="max-w-3xl">
      <Card>
        {activity.isLoading && (
          <>
            <LoadingAnnounce what="recent activity" />
            <SkeletonRows rows={4} />
          </>
        )}
        {activity.isError && (
          <p className="font-sans text-sm" style={{ color: "var(--sev-flag-text)" }}>{activity.error.message}</p>
        )}
        {activity.data && activity.data.length === 0 && (
          <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
            Nothing here yet. Create a deal, screen a target, or run an AI analysis — every action shows up in this feed.
          </p>
        )}
        {activity.data && activity.data.length > 0 && (
          <ul className="divide-y" style={{ borderColor: "var(--fg-rule)" }} data-testid="activity-feed">
            {activity.data.map((a) => (
              <li key={a.id} className="flex items-start gap-4 py-4" style={{ borderColor: "var(--fg-rule)" }}>
                <span
                  className="mt-0.5 inline-flex h-6 items-center justify-center rounded-sm border px-2 ansyra-label"
                  style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}
                >
                  {TAG[a.type] ?? a.type}
                </span>
                <div className="flex-1">
                  <p className="font-serif text-[15px]" style={{ color: "var(--fg)" }}>{a.action}</p>
                  {a.detail && (
                    <p className="mt-0.5 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{a.detail}</p>
                  )}
                </div>
                <span className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>{relativeTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
