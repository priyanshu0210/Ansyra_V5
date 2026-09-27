import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card } from "./parchment/Card";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import { EmptyState } from "./parchment/EmptyState";
import { uploadToSignedUrl } from "@/lib/upload";
import { AiDisclaimer } from "@/components/AiDisclaimer";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";

type Doc = inferRouterOutputs<AppRouter>["documents"]["list"][number];
type Analysis = inferRouterOutputs<AppRouter>["ai"]["listAnalyses"][number];

const ACCEPTED: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "text/plain": "TXT",
};
const MAX_BYTES = 20 * 1024 * 1024;

const KINDS = [
  { value: "summary", label: "Summary" },
  { value: "red_flags", label: "Red flags" },
  { value: "key_terms", label: "Key terms" },
  { value: "dd_checklist", label: "DD checklist" },
] as const;
type Kind = (typeof KINDS)[number]["value"];

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DataRoom({ dealId }: { dealId: number }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docs = trpc.documents.list.useQuery({ dealId });
  const requestUpload = trpc.documents.requestUpload.useMutation();
  const confirm = trpc.documents.confirm.useMutation();

  const onFile = async (file: File) => {
    setError(null);
    if (!ACCEPTED[file.type]) return setError("Only PDF, DOCX, or TXT files are supported.");
    if (file.size > MAX_BYTES) return setError("File too large. The limit is 20 MB.");
    setUploading(true);
    try {
      const { path, uploadUrl } = await requestUpload.mutateAsync({
        dealId,
        name: file.name,
        mime: file.type,
        size: file.size,
      });
      await uploadToSignedUrl(uploadUrl, file);
      await confirm.mutateAsync({ dealId, path, name: file.name, mime: file.type, size: file.size });
      utils.documents.list.invalidate({ dealId });
      utils.activity.list.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card data-testid="data-room">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            Data room ({docs.data?.length ?? 0})
          </p>
          <div className="mt-2 h-px w-10" style={{ background: "var(--fg-rule)" }} />
        </div>
        <p className="font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
          AI outputs are analytical aids, not legal advice.
        </p>
      </div>

      {/* Dropzone */}
      <button
        type="button"
        disabled={uploading}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        data-testid="doc-dropzone"
        className="no-print w-full cursor-pointer rounded-sm border border-dashed p-6 text-center transition-colors disabled:cursor-wait disabled:opacity-70"
        style={{
          borderColor: dragOver ? "var(--fg)" : "var(--fg-rule)",
          background: dragOver ? "var(--fg-surface)" : "var(--fg-surface)",
        }}
      >
        <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
          {uploading ? "Uploading…" : "Drop a document here, or click to choose"}
        </p>
        <p className="mt-1 font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>PDF, DOCX, or TXT · up to 20 MB</p>
        {/* The warning belongs HERE, not only in the privacy policy. Nobody reads
            a policy before dragging a file in, and in this domain "a document"
            means somebody's confidential deal material. Telling people at the
            moment of the action is the control that actually works. */}
        <p
          className="mx-auto mt-2 max-w-sm font-sans text-[length:var(--step-xs)] leading-relaxed"
          style={{ color: "var(--sev-watch-text)" }}
          data-testid="doc-prototype-notice"
        >
          Prototype — do not upload confidential, client, or real transaction documents.
        </p>
      </button>
      <input
        ref={fileRef}
        type="file"
        aria-label="Choose a document to upload"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />

      {error && <p role="alert" className="mt-3 font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }} data-testid="doc-error">{error}</p>}

      {/* Document list */}
      <div className="mt-4 space-y-3">
        {docs.isLoading && (
          <>
            <LoadingAnnounce what="documents" />
            <SkeletonRows rows={3} />
          </>
        )}
        {docs.data?.length === 0 && (
          <EmptyState
            title="No documents yet"
            body="Upload diligence material — CIMs, contracts, financials — and each one is scanned for the clauses that carry risk."
            action={{ label: "Upload a document", onClick: () => fileRef.current?.click() }}
          />
        )}
        {(docs.data ?? []).map((doc) => (
          <DocumentRow key={doc.id} doc={doc} dealId={dealId} />
        ))}
      </div>
      <AiDisclaimer />
    </Card>
  );
}

function DocumentRow({ doc, dealId }: { doc: Doc; dealId: number }) {
  const utils = trpc.useUtils();
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const analyses = trpc.ai.listAnalyses.useQuery({ documentId: doc.id });
  const download = trpc.documents.getDownloadUrl.useQuery(
    { documentId: doc.id },
    { enabled: false },
  );
  const analyze = trpc.ai.analyzeDocument.useMutation({
    onSuccess: () => {
      utils.ai.listAnalyses.invalidate({ documentId: doc.id });
      utils.activity.list.invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const remove = trpc.documents.delete.useMutation({
    onSuccess: () => utils.documents.list.invalidate({ dealId }),
    onError: (e) => setError(e.message),
  });

  const openDownload = async () => {
    const res = await download.refetch();
    if (res.data?.url) window.open(res.data.url, "_blank", "noopener");
  };

  return (
    <div className="rounded-sm border p-4" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }} data-testid={`doc-row-${doc.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-serif text-[15px]" style={{ color: "var(--fg)" }}>{doc.name}</p>
          <p className="font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
            {ACCEPTED[doc.mime] ?? doc.mime} · {fmtSize(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="no-print relative flex items-center gap-2">
          <button onClick={openDownload} className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }} data-testid={`doc-download-${doc.id}`}>
            Download
          </button>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            disabled={analyze.isPending}
            data-testid={`doc-analyze-${doc.id}`}
            className="rounded-full px-3 py-1 font-sans text-[length:var(--step-xs)] disabled:opacity-50"
            style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
          >
            {analyze.isPending ? "Analyzing… (10-30s)" : "Analyze ▾"}
          </button>
          <button aria-label={`Delete ${doc.name}`} onClick={() => setConfirmDelete(true)} className="flex min-h-11 min-w-11 items-center justify-center rounded-full border font-sans text-[length:var(--step-xs)]" style={{ borderColor: "var(--fg-rule)", color: "var(--sev-flag-text)" }} data-testid={`doc-delete-${doc.id}`}>
            <span aria-hidden>✕</span>
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-sm border" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", boxShadow: "0 12px 30px rgba(34,32,27,0.2)" }}>
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setError(null); analyze.mutate({ documentId: doc.id, kind: k.value }); }}
                  data-testid={`doc-analyze-${doc.id}-${k.value}`}
                  className="block w-full px-3 py-2 text-left font-sans text-[12px] hover:bg-[var(--fg-surface)]"
                  style={{ color: "var(--fg)" }}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-2 font-sans text-[12px]" style={{ color: "var(--sev-flag-text)" }}>{error}</p>}

      {(analyses.data ?? []).length > 0 && (
        <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--fg-rule)" }}>
          {(analyses.data ?? []).map((a) => (
            <AnalysisCard key={a.id} analysis={a} dealId={dealId} />
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border p-3" style={{ borderColor: "var(--sev-flag)", background: "color-mix(in srgb, var(--sev-flag) 8%, var(--fg-surface))" }}>
          <p className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>Delete this document and its analyses?</p>
          <button onClick={() => remove.mutate({ documentId: doc.id })} disabled={remove.isPending} className="rounded-full px-3 py-1 font-sans text-[length:var(--step-xs)]" style={{ background: "var(--sev-flag)", color: "var(--clear)" }} data-testid={`doc-confirm-delete-${doc.id}`}>
            {remove.isPending ? "Deleting…" : "Delete"}
          </button>
          <button onClick={() => setConfirmDelete(false)} className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<Kind, string> = {
  summary: "Summary",
  red_flags: "Red flags",
  key_terms: "Key terms",
  dd_checklist: "DD checklist",
};
const SEV_COLOR: Record<string, string> = { High: "var(--sev-flag)", Medium: "var(--sev-watch)", Low: "var(--fg-2)" };
const STATUS_COLOR: Record<string, string> = { present: "var(--sev-grounded)", missing: "var(--sev-flag)", unclear: "var(--sev-watch)" };

function AnalysisCard({ analysis, dealId }: { analysis: Analysis; dealId: number }) {
  const [open, setOpen] = useState(true);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const r = analysis.result as Record<string, unknown>;
  const coverage = r._evidence as { truncated?: boolean; coverage?: string; sha256?: string } | undefined;
  const kind = analysis.kind as Kind;

  // DD checklist analyses can be merged into the deal's live tracker (Phase 15.5).
  // The merge never overwrites a status a human already set — the toast reports
  // how many items it filled vs. kept, so that guarantee is visible.
  const utils = trpc.useUtils();
  const importToTracker = trpc.dd.importAnalysis.useMutation({
    onSuccess: (res) => {
      utils.dd.list.invalidate({ dealId });
      utils.activity.list.invalidate();
      setImportMsg(
        `Imported: ${res.filled} filled${res.skippedManual ? `, ${res.skippedManual} kept (already set by hand)` : ""}` +
          (res.unmatched.length ? `, ${res.unmatched.length} not on the checklist` : ""),
      );
    },
    onError: (e) => setImportMsg(e.message),
  });

  return (
    <div className="rounded-sm border p-3" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }} data-testid={`analysis-${analysis.id}`}>
      <p className="mb-3 font-sans text-xs" style={{ color: "var(--fg-2)" }}>{coverage ? `${coverage.truncated ? "Partial review. " : ""}${coverage.coverage}. Source version: ${coverage.sha256?.slice(0, 12)}.` : "Legacy analysis: extraction coverage and quotations have not been independently verified. Regenerate to verify."}</p>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <p className="ansyra-label" style={{ color: "var(--fg)" }}>
          {KIND_LABEL[kind]} · {new Date(analysis.createdAt).toLocaleString()}
        </p>
        <span className="font-mono text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {kind === "dd_checklist" && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => importToTracker.mutate({ dealId, analysisId: analysis.id })}
            disabled={importToTracker.isPending}
            data-testid={`dd-import-${analysis.id}`}
            className="rounded-full border px-4 py-1.5 font-sans text-[12px] disabled:opacity-50"
            style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)", color: "var(--fg)" }}
          >
            {importToTracker.isPending ? "Importing…" : "Import into tracker"}
          </button>
          {importMsg && (
            <span className="font-sans text-[11.5px]" style={{ color: "var(--fg-2)" }}>
              {importMsg}
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          {kind === "summary" && (
            <>
              <p className="font-serif text-[15px]" style={{ color: "var(--fg)" }}>{String(r.headline ?? "")}</p>
              <ul className="ml-4 list-disc space-y-0.5">
                {((r.keyPoints as string[]) ?? []).map((p, i) => (
                  <li key={i} className="font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>{p}</li>
                ))}
              </ul>
              <p className="font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)" }}>{String(r.summary ?? "")}</p>
            </>
          )}

          {kind === "red_flags" && (
            <div className="space-y-2">
              {(((r.flags as unknown[]) ?? []) as { clause: string; quote: string; severity: string; concern: string; source?: { page: number | null; characterStart: number } }[]).map((f, i) => (
                <div key={i} className="rounded-sm border-l p-2 pl-3" style={{ borderColor: SEV_COLOR[f.severity] ?? "var(--fg-rule)", background: "var(--fg-surface)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-serif text-[14px]" style={{ color: "var(--fg)" }}>{f.clause}</p>
                    <span className="font-mono text-[length:var(--step-xs)] uppercase" style={{ color: SEV_COLOR[f.severity] ?? "var(--fg-2)" }}>{f.severity}</span>
                  </div>
                  <p className="mt-1 border-l-2 pl-2 font-sans text-[12px] italic" style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}>&ldquo;{f.quote}&rdquo;</p>{f.source && <p className="mt-1 font-sans text-xs" style={{ color: "var(--fg-2)" }}>Verified in source · {f.source.page ? `page ${f.source.page}` : `extracted text character ${f.source.characterStart + 1}`}</p>}
                  <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{f.concern}</p>
                </div>
              ))}
              {((r.flags as unknown[]) ?? []).length === 0 && (
                <p className="font-sans text-[13px]" style={{ color: "var(--sev-grounded-text)" }}>No red flags found in this document.</p>
              )}
            </div>
          )}

          {kind === "key_terms" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries({
                Parties: Array.isArray(r.parties) ? (r.parties as string[]).join("; ") : null,
                "Effective date": r.effectiveDate as string | null,
                Consideration: r.consideration as string | null,
                Conditions: Array.isArray(r.conditions) ? (r.conditions as string[]).join("; ") : null,
                Indemnities: r.indemnities as string | null,
                "Change of control": r.changeOfControl as string | null,
                "Non-compete": r.nonCompete as string | null,
              }).map(([k, v]) => (
                <div key={k}>
                  <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>{k}</p>
                  <p className="font-sans text-[13px]" style={{ color: v ? "var(--fg-2)" : "var(--fg-2)" }}>{v ?? "Not found in document"}</p>
                </div>
              ))}
            </div>
          )}

          {kind === "dd_checklist" && (
            <div className="space-y-1">
              {(((r.items as unknown[]) ?? []) as { item: string; status: string; note: string }[]).map((it, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[length:var(--step-xs)] uppercase" style={{ color: STATUS_COLOR[it.status] ?? "var(--fg-2)" }}>
                    {it.status}
                  </span>
                  <span className="font-sans text-[13px]" style={{ color: "var(--fg)" }}>{it.item}</span>
                  <span className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>— {it.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
