import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { Card } from "./parchment/Card";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import { DEFAULT_MEMBER_FEATURES, FEATURE_LABELS, type FeatureKey } from "@contracts/constants";

type RequestRow = inferRouterOutputs<AppRouter>["access"]["list"][number];

type StatusFilter = "pending" | "approved" | "declined";

export function AccessRequests() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const requests = trpc.access.list.useQuery();
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (requests.isError) {
    return (
      <Card>
        <p className="font-serif text-lg" style={{ color: "var(--sev-flag-text)" }}>Can&apos;t load access requests.</p>
        <p className="mt-1 font-sans text-sm" style={{ color: "var(--fg-2)" }}>{requests.error.message}</p>
      </Card>
    );
  }

  const all = requests.data ?? [];
  const rows = all.filter((r) => r.status === filter);
  const pendingCount = all.filter((r) => r.status === "pending").length;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["pending", "approved", "declined"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            data-testid={`access-filter-${s}`}
            className="rounded-full border px-4 py-1.5 font-sans text-[13px] capitalize"
            style={{
              borderColor: "var(--fg-rule)",
              background: filter === s ? "var(--sev-grounded)" : "transparent",
              color: filter === s ? "var(--clear)" : "var(--fg-2)",
            }}
          >
            {s}{s === "pending" && pendingCount > 0 ? ` · ${pendingCount}` : ""}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="rounded-sm border-l p-4" style={{ borderColor: "var(--sev-flag)", background: "color-mix(in srgb, var(--sev-flag) 8%, var(--fg-surface))" }}>
          <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }}>{actionError}</p>
        </div>
      )}
      {notice && (
        <div className="rounded-sm border-l p-4" style={{ borderColor: "var(--sev-grounded)", background: "color-mix(in srgb, var(--sev-grounded) 8%, var(--fg-surface))" }} data-testid="access-invite-notice">
          <p className="font-sans text-[13px]" style={{ color: "var(--fg)" }}>{notice}</p>
        </div>
      )}
      {credential && (
        <div className="rounded-sm border-l p-5" style={{ borderColor: "var(--fg)", background: "var(--fg-surface)" }} data-testid="access-credential">
          <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>Temporary password for {credential.email}</p>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--fg)" }}>{credential.password}</p>
          <p className="mt-2 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
            Copy it now — shown only once. The user must change it on first sign-in.
          </p>
          <button onClick={() => setCredential(null)} className="mt-3 rounded-full border px-4 py-1.5 font-sans text-[12px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Dismiss</button>
        </div>
      )}

      {requests.isLoading && (
        <Card>
          <LoadingAnnounce what="access requests" />
          <SkeletonRows rows={3} />
        </Card>
      )}
      {!requests.isLoading && rows.length === 0 && (
        <Card>
          <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>No {filter} requests.</p>
        </Card>
      )}

      {rows.map((r) => (
        <RequestCard
          key={r.id}
          request={r}
          onDone={(cred, msg) => {
            if (cred) setCredential(cred);
            if (msg) setNotice(msg);
            setActionError(null);
            utils.access.list.invalidate();
          }}
          onError={setActionError}
        />
      ))}
    </div>
  );
}

function RequestCard({
  request,
  onDone,
  onError,
}: {
  request: RequestRow;
  onDone: (cred: { email: string; password: string } | null, msg: string | null) => void;
  onError: (m: string) => void;
}) {
  const initial = (request.requestedFeatures ?? []).filter((f: string): f is FeatureKey =>
    (DEFAULT_MEMBER_FEATURES as string[]).includes(f),
  );
  const [features, setFeatures] = useState<FeatureKey[]>(initial);
  const [sendInvite, setSendInvite] = useState(true);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  const approve = trpc.access.approve.useMutation(withToast({ done: "Access approved", failed: "Could not approve that request", silentOnError: true }, {
    onSuccess: (r) => onDone(r.temporaryPassword ? { email: request.email, password: r.temporaryPassword } : null, r.invited ? `Invite sent to ${request.email}.` : null),
    onError: (e) => onError(e.message),
  }));
  const decline = trpc.access.decline.useMutation(withToast({ done: "Request declined", failed: "Could not decline that request", silentOnError: true }, {
    onSuccess: () => { setDeclining(false); onDone(null, `Declined ${request.email}.`); },
    onError: (e) => onError(e.message),
  }));

  const pending = request.status === "pending";
  const toggle = (k: FeatureKey) => setFeatures((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>{request.name}</p>
          <p className="font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>{request.email}</p>
          <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
            {/* Requests submitted since these fields stopped being collected have
                none of them, and that is the expected state rather than missing
                data — hence a neutral dash rather than an empty-looking cell. */}
            {[request.company, request.role, request.phone].filter(Boolean).join(" · ") || "Not collected"}
          </p>
        </div>
        <span
          className="rounded-sm border px-2 py-0.5 ansyra-label"
          style={{ borderColor: "var(--fg-rule)", color: request.status === "approved" ? "var(--sev-grounded)" : request.status === "declined" ? "var(--sev-flag)" : "var(--fg)" }}
        >
          {request.status}
        </span>
      </div>

      {request.reason && (
        <p className="mt-3 rounded-sm border p-3 font-sans text-[13px] leading-relaxed" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg-2)" }}>
          {request.reason}
        </p>
      )}

      {pending && (
        <>
          <p className="mt-4 ansyra-label" style={{ color: "var(--fg-2)" }}>Grant features</p>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {DEFAULT_MEMBER_FEATURES.map((k) => (
              <label key={k} className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
                <input type="checkbox" checked={features.includes(k)} onChange={() => toggle(k)} data-testid={`approve-feature-${k}`} />
                {FEATURE_LABELS[k]}
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
            <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
            Send invite email (falls back to a temp password if email isn&apos;t set up)
          </label>

          {declining ? (
            <div className="mt-4 space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Reason (optional, not emailed)"
                className="w-full resize-none rounded-sm border px-3 py-2 font-sans text-[13px] outline-none focus:border-[var(--fg)]"
                style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
              />
              <div className="flex gap-2">
                <button onClick={() => decline.mutate({ id: request.id, note: note || undefined })} disabled={decline.isPending} className="rounded-full px-4 py-1.5 font-sans text-[13px]" style={{ background: "var(--sev-flag)", color: "var(--clear)" }} data-testid="access-confirm-decline">
                  {decline.isPending ? "Declining…" : "Confirm decline"}
                </button>
                <button onClick={() => setDeclining(false)} className="rounded-full border px-4 py-1.5 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button onClick={() => approve.mutate({ id: request.id, features, sendInvite })} disabled={approve.isPending} data-testid="access-approve" className="rounded-full px-5 py-2 font-sans text-[13px]" style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}>
                {approve.isPending ? "Approving…" : "Approve & create user"}
              </button>
              <button onClick={() => setDeclining(true)} data-testid="access-decline" className="rounded-full border px-5 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--sev-flag-text)" }}>Decline</button>
            </div>
          )}
        </>
      )}

      {!pending && request.decisionNote && (
        <p className="mt-3 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>Note: {request.decisionNote}</p>
      )}
    </Card>
  );
}
