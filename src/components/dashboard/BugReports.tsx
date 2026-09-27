import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { Card } from "./parchment/Card";
import { EmptyState } from "./parchment/EmptyState";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";

type Status = "open" | "triaged" | "fixed" | "closed";
const STATUSES: Status[] = ["open", "triaged", "fixed", "closed"];

const severityColor: Record<string, string> = { low: "var(--fg-2)", medium: "var(--sev-watch)", high: "var(--sev-flag)" };
const statusColor: Record<string, string> = { open: "var(--fg)", triaged: "var(--sev-watch)", fixed: "var(--sev-grounded)", closed: "var(--fg-2)" };

export function BugReports() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<Status | "all">("all");
  const list = trpc.bugs.list.useQuery();
  const [lightbox, setLightbox] = useState<string | null>(null);

  const setStatus = trpc.bugs.setStatus.useMutation(withToast({ done: "Status updated", failed: "Could not update that status", silentOnSuccess: true }, { onSuccess: () => utils.bugs.list.invalidate() }));

  if (list.isError) {
    return <Card><p className="font-serif text-lg" style={{ color: "var(--sev-flag-text)" }}>Can&apos;t load reports.</p><p className="mt-1 font-sans text-sm" style={{ color: "var(--fg-2)" }}>{list.error.message}</p></Card>;
  }

  const rows = (list.data ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["all", ...STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className="rounded-full border px-4 py-1.5 font-sans text-[13px] capitalize" style={{ borderColor: "var(--fg-rule)", background: filter === s ? "var(--sev-grounded)" : "transparent", color: filter === s ? "var(--clear)" : "var(--fg-2)" }}>{s}</button>
        ))}
      </div>

      {list.isLoading && (
        <Card>
          <LoadingAnnounce what="bug reports" />
          <SkeletonRows rows={3} />
        </Card>
      )}
      {!list.isLoading && rows.length === 0 && (
        <Card>
          <EmptyState
            title="No bug reports"
            body="Reports members file from the in-app form land here, newest first, with the page they were on and the browser they used."
            hint="Members file them from Help → Report a bug."
          />
        </Card>
      )}

      {rows.map((r) => (
        <Card key={r.id} data-testid={`bug-report-${r.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>{r.title}</p>
              <p className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                {r.page || "—"} · {new Date(r.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip color={severityColor[r.severity ?? "low"]}>{r.severity}</Chip>
              <Chip color={statusColor[r.status]}>{r.status}</Chip>
            </div>
          </div>

          {r.description && (
            <p className="mt-3 whitespace-pre-wrap font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{r.description}</p>
          )}

          {r.screenshots.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.screenshots.map((path) => (
                <Thumb key={path} reportId={r.id} path={path} onOpen={setLightbox} />
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="ansyra-label" style={{ color: "var(--fg-2)" }}>Status</span>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus.mutate({ id: r.id, status: s })}
                disabled={setStatus.isPending || r.status === s}
                data-testid={`bug-status-${r.id}-${s}`}
                className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)] capitalize disabled:opacity-40"
                style={{ borderColor: "var(--fg-rule)", color: r.status === s ? "var(--fg)" : "var(--fg)", background: "var(--fg-surface)" }}
              >
                {s}
              </button>
            ))}
          </div>
        </Card>
      ))}

      {lightbox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ background: "rgba(34,32,27,0.8)" }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Screenshot" className="max-h-[90vh] max-w-full rounded-sm" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--fg-surface)", color: "var(--fg)" }} data-testid="lightbox-close">✕</button>
        </div>
      )}
    </div>
  );
}

// Private-bucket thumbnail: mints its own short-lived signed URL.
function Thumb({ reportId, path, onOpen }: { reportId: number; path: string; onOpen: (url: string) => void }) {
  const url = trpc.bugs.screenshotUrl.useQuery({ id: reportId, path });
  if (!url.data) {
    return <div className="h-16 w-16 rounded-sm" style={{ background: "var(--fg-surface)", border: "1px solid var(--fg-rule)" }} />;
  }
  return (
    <button type="button" onClick={() => onOpen(url.data.url)} data-testid="bug-thumb">
      <img src={url.data.url} alt="" className="h-16 w-16 rounded-sm object-cover" style={{ border: "1px solid var(--fg-rule)" }} />
    </button>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label" style={{ borderColor: "var(--fg-rule)", color }}>{children}</span>;
}
