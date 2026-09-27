import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { DialogShell } from "./DialogShell";
import { FieldGroup } from "@/components/forms/FieldGroup";
import { useFieldControlId } from "@/components/forms/field-control";
import { DEFAULT_MEMBER_FEATURES, FEATURE_LABELS, type FeatureKey } from "@contracts/constants";


type Tab = "individual" | "organization";

export function RequestAccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("individual");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setName(""); setEmail(""); setReason("");
    setFeatures([]); setWebsite(""); setError(null);
  };

  const submit = trpc.access.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => { setSubmitted(false); reset(); onClose(); }, 2800);
    },
    onError: (e) => setError(e.message),
  });

  if (!open) return null;

  const toggleFeature = (k: FeatureKey) =>
    setFeatures((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <DialogShell title="Request Access" onClose={onClose} maxWidth="max-w-lg" testId="request-access-modal">
        <div>
          <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Ansyra · request access</p>

          {/* Tabs */}
          <div className="mt-5 inline-flex rounded-full border p-0.5" style={{ borderColor: "var(--fg-rule)" }}>
            {(["individual", "organization"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); }}
                data-testid={`request-tab-${t}`}
                className="rounded-full px-4 py-1.5 font-sans text-[13px] capitalize transition-colors"
                style={{
                  background: tab === t ? "var(--fg)" : "transparent",
                  color: tab === t ? "var(--clear)" : "var(--fg-2)",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {submitted ? (
            <div className="mt-6 rounded-sm border p-6 text-center" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }} data-testid="request-submitted">
              <p className="font-serif text-2xl" style={{ color: "var(--fg)" }}>Thank you.</p>
              <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>
                Your request is in. An administrator will review it and be in touch.
              </p>
            </div>
          ) : tab === "individual" ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                if (!name || !email) return;
                if (reason.trim().length < 30) return setError("Please tell us a little more about why you need access (at least 30 characters).");
                submit.mutate({
                  // Deliberately just three fields. Company, role and phone were
                  // dropped: this is a prototype, none of them was needed to
                  // decide on a request, and the least risky personal data is the
                  // kind that was never collected.
                  name, email, reason,
                  requestedFeatures: features,
                  website,
                });
              }}
            >
              {/* honeypot */}
              <input
                type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1} autoComplete="off" aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full name"><Input value={name} onChange={setName} required placeholder="Jordan Reeves" testId="access-name" /></Field>
                <Field label="Email"><Input type="email" value={email} onChange={setEmail} required placeholder="you@firm.com" testId="access-email" /></Field>
              </div>
              <Field label="Why do you need access?">
                <Textarea
                  value={reason}
                  onChange={setReason}
                  required
                  rows={3}
                  placeholder="Tell us how you'll use Ansyra…"
                  data-testid="access-reason"
                />
                <p className="mt-1 font-mono text-[length:var(--step-xs)]" style={{ color: reason.trim().length >= 30 ? "var(--sev-grounded)" : "var(--fg-2)" }}>
                  {reason.trim().length}/30
                </p>
              </Field>

              <fieldset>
                <legend className="mb-1.5 block ansyra-label" style={{ color: "var(--fg-2)" }}>Features you&apos;re interested in</legend>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {DEFAULT_MEMBER_FEATURES.map((k) => (
                    <label key={k} className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
                      <input
                        type="checkbox"
                        checked={features.includes(k)}
                        onChange={() => toggleFeature(k)}
                        data-testid={`access-feature-${k}`}
                      />
                      {FEATURE_LABELS[k]}
                    </label>
                  ))}
                </div>
              </fieldset>

              {error && <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }} data-testid="access-error">{error}</p>}

              <button
                type="submit"
                disabled={submit.isPending}
                data-testid="access-submit"
                className="w-full rounded-full py-3 font-sans text-sm disabled:opacity-50"
                style={{ background: "var(--fg)", color: "var(--clear)" }}
              >
                {submit.isPending ? "Submitting…" : "Submit request"}
              </button>
            </form>
          ) : (
            <div className="mt-6 rounded-sm border p-6" style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }} data-testid="request-org-card">
              <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>This is a portfolio project. To request access for several people, use the access form and include your organisation and intended use. Access is reviewed by the administrator.</p>
              <button onClick={() => setTab("individual")} className="mt-5 rounded-full px-5 py-2.5 font-sans text-sm" style={{ background: "var(--fg)", color: "var(--clear)" }}>Open access form</button>
            </div>
          )}
        </div>
    </DialogShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <FieldGroup label={label}>{children}</FieldGroup>;
}
function Input({ value, onChange, required, placeholder, type = "text", testId }: { value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string; type?: string; testId?: string }) {
  const id = useFieldControlId();
  return (
    <input
      id={id}
      type={type}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none transition-colors focus:border-[var(--fg)]"
      style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
    />
  );
}

function Textarea({ value, onChange, required, rows, placeholder, testId }: { value: string; onChange: (v: string) => void; required?: boolean; rows: number; placeholder?: string; testId?: string }) {
  const id = useFieldControlId();
  return (
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      rows={rows}
      placeholder={placeholder}
      data-testid={testId}
      className="w-full resize-none rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]"
      style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
    />
  );
}
