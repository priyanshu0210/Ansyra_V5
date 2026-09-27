import { PageHelp } from "@/components/dashboard/PageHelp";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { uploadToSignedUrl } from "@/lib/upload";
import { FEATURE_KEYS, FEATURE_LABELS } from "@contracts/constants";
import { FieldGroup } from "@/components/forms/FieldGroup";
import { useFieldControlId } from "@/components/forms/field-control";

// Product pages come from the RBAC catalog, never a hand-kept copy. This list
// had drifted to the original eight features, so a bug in Deal Economics, the
// Decision Log, Comps, the Data Room, the DD Tracker, Scenarios, Comments, the
// Timeline, or Target Discovery could only be filed as "Other" — nine shipped
// surfaces invisible to triage. Add a FEATURE_KEY and it appears here.
//
// The surfaces below are not feature-gated, so they are listed by hand. Admin
// pages included deliberately: admins hit the product too, and admin-only bugs
// (see the User Management feature list) are findable nowhere else.
const NON_FEATURE_PAGES = [
  "Dashboard home",
  "Recent Activity",
  "Deal dossier",
  "AI Copilot",
  "User Management",
  "Access Requests",
  "Bug Reports",
  "Profile",
  "Sign in",
  "Landing page",
  "Other",
];

const PAGE_OPTIONS = [...FEATURE_KEYS.map((k) => FEATURE_LABELS[k]), ...NON_FEATURE_PAGES];
const SEVERITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

type Shot = { path: string; preview: string };

export default function ReportBug() {
  const navigate = useNavigate();
  // This page had no guard at all: a signed-out visitor got the whole form,
  // filled it in, uploaded screenshots, and only hit a 401 on submit, losing
  // the lot. Same pattern as Profile.tsx and DealDetail.tsx.
  const { isLoading: authLoading, isAuthenticated, isAuthoritativelyUnauthenticated, isUnresolved } = useAuth();

  useEffect(() => {
    if (isAuthoritativelyUnauthenticated || isUnresolved) navigate("/login", { replace: true });
  }, [isAuthoritativelyUnauthenticated, isUnresolved, navigate]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [page, setPage] = useState(PAGE_OPTIONS[0]);
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [shots, setShots] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const request = trpc.bugs.requestScreenshotUpload.useMutation();
  const submit = trpc.bugs.submit.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (e) => setError(e.message),
  });

  const addFile = async (file: File) => {
    setError(null);
    if (shots.length >= 3) return setError("Up to 3 screenshots.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setError("Images only (PNG, JPEG, WebP).");
    if (file.size > 5 * 1024 * 1024) return setError("Each image must be under 5 MB.");
    setUploading(true);
    try {
      const { path, uploadUrl } = await request.mutateAsync({ mime: file.type, size: file.size });
      await uploadToSignedUrl(uploadUrl, file);
      setShots((p) => [...p, { path, preview: URL.createObjectURL(file) }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // Hold the form back until auth settles, so nobody starts typing into a page
  // that is about to redirect them.
  if (authLoading || !isAuthenticated) {
    return (
      <Shell onBack={() => navigate("/dashboard")}>
        <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
          {isAuthoritativelyUnauthenticated || isUnresolved ? "Redirecting to sign in…" : "Loading…"}
        </p>
      </Shell>
    );
  }

  if (submitted) {
    return (
      <Shell onBack={() => navigate("/dashboard")}>
        <div className="rounded-sm border p-8 text-center" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }} data-testid="bug-submitted">
          <p className="font-serif text-2xl" style={{ color: "var(--fg)" }}>Thanks — the team can see it now.</p>
          <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>We appreciate you flagging it.</p>
          <button onClick={() => { setSubmitted(false); setTitle(""); setDescription(""); setShots([]); }} className="mt-5 rounded-full border px-5 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>
            Report another
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onBack={() => navigate("/dashboard")}>
      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate({ title, description: description || undefined, page, severity, screenshots: shots.map((s) => s.path) }); }}
        className="rounded-sm border p-6 space-y-4"
        style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }}
      >
        <Field label="Title"><Input value={title} onChange={setTitle} required placeholder="Short summary" testId="bug-title" /></Field>
        <Field label="What happened?">
          <Textarea value={description} onChange={setDescription} rows={4} placeholder="Steps, what you expected, what happened…" testId="bug-description" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Which page">
            <Select value={page} onChange={setPage} options={PAGE_OPTIONS.map((p) => ({ value: p, label: p }))} testId="bug-page" />
          </Field>
          <Field label="Severity">
            <Select value={severity} onChange={(v) => setSeverity(v as typeof severity)} options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))} testId="bug-severity" />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 block ansyra-label" style={{ color: "var(--fg-2)" }}>Screenshots ({shots.length}/3)</legend>
          <div className="flex flex-wrap gap-3">
            {shots.map((s, i) => (
              <div key={s.path} className="relative">
                <img src={s.preview} alt="" className="h-20 w-20 rounded-sm object-cover" style={{ border: "1px solid var(--fg-rule)" }} />
                <button type="button" aria-label={`Remove screenshot ${i + 1}`} onClick={() => setShots((p) => p.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-[length:var(--step-xs)]" style={{ background: "var(--fg)", color: "var(--clear)" }}><span aria-hidden>✕</span></button>
              </div>
            ))}
            {shots.length < 3 && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="bug-add-screenshot" className="flex h-20 w-20 items-center justify-center rounded-sm border border-dashed font-sans text-[12px] disabled:opacity-50" style={{ borderColor: "var(--fg-rule)", color: "var(--fg-2)" }}>
                {uploading ? "…" : "+ Add"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f); e.target.value = ""; }} />
          </div>
        </fieldset>

        {error && <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }} data-testid="bug-error">{error}</p>}
        <button type="submit" disabled={submit.isPending || !title} data-testid="bug-submit" className="rounded-full px-6 py-2.5 font-sans text-[13px] disabled:opacity-50" style={{ background: "var(--fg)", color: "var(--clear)" }}>
          {submit.isPending ? "Submitting…" : "Submit report"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div data-surface="page" className="ansyra-page-ground min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Support</p>
            <h1 className="mt-1 font-serif text-4xl font-light" style={{ color: "var(--fg)" }}>Report a Bug</h1>
            <PageHelp page="report" />
          </div>
          <button onClick={onBack} className="rounded-full border px-4 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>← Dashboard</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <FieldGroup label={label}>{children}</FieldGroup>;
}
function Input({ value, onChange, placeholder, required, testId }: { value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; testId?: string }) {
  const id = useFieldControlId();
  return <input id={id} value={value} required={required} placeholder={placeholder} data-testid={testId} onChange={(e) => onChange(e.target.value)} className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }} />;
}
function Select({ value, onChange, options, testId }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; testId?: string }) {
  const id = useFieldControlId();
  return <select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}
function Textarea({ value, onChange, rows, placeholder, testId }: { value: string; onChange: (value: string) => void; rows: number; placeholder?: string; testId?: string }) {
  const id = useFieldControlId();
  return <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} placeholder={placeholder} data-testid={testId} className="w-full resize-none rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }} />;
}
