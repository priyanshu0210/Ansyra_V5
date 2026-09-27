import { PageHelp } from "@/components/dashboard/PageHelp";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { uploadToSignedUrl } from "@/lib/upload";
import { Avatar } from "@/components/dashboard/Avatar";
import { DialogShell } from "@/components/ansyra/modals/DialogShell";
import { FieldGroup } from "@/components/forms/FieldGroup";
import { useFieldControlId } from "@/components/forms/field-control";
import { SessionControls } from "@/components/SessionControls";

const KIND_LABEL: Record<string, string> = { main_admin: "Main Admin", admin: "Admin", member: "Member" };
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY"] as const;
type Currency = (typeof CURRENCIES)[number];
const isCurrency = (value: unknown): value is Currency => (CURRENCIES as readonly unknown[]).includes(value);
const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "D MMM YYYY"] as const;

function timezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Singapore"];
  }
}

export default function Profile() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { user, isLoading, isAuthoritativelyUnauthenticated, isUnresolved } = useAuth();

  useEffect(() => {
    if (isAuthoritativelyUnauthenticated || isUnresolved) navigate("/login", { replace: true });
  }, [isAuthoritativelyUnauthenticated, isUnresolved, navigate]);

  // A full-page auth gate, not a panel — so it takes Dashboard's LoadingScreen
  // shape rather than a skeleton. A skeleton stands in for content whose box is
  // known; nothing here is placed yet, and the thing being waited on is the
  // session, not the profile.
  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--clear)" }}>
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <span
            aria-hidden
            className="ansyra-spin h-8 w-8 rounded-full border-2"
            style={{ borderColor: "var(--fg-rule)", borderTopColor: "var(--fg)" }}
          />
          <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>Loading your profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div data-surface="page" className="ansyra-page-ground min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Account</p>
            <h1 className="mt-1 font-serif text-4xl font-light" style={{ color: "var(--fg)" }}>Profile Settings</h1>
            <PageHelp page="profile" />
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-full border px-4 py-2 font-sans text-[13px]"
            style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}
          >
            ← Dashboard
          </button>
        </div>

        <AvatarCard user={user} onSaved={() => utils.auth.me.invalidate()} />
        <IdentityCard user={user} onSaved={() => utils.auth.me.invalidate()} />
        <AccountCard user={user} />
        <PreferencesCard user={user} onSaved={() => utils.auth.me.invalidate()} />
        <ChangePasswordCard />
        <SessionControls sessionId={user.browserSessionId} />
        <DataRightsCard />
      </div>
    </div>
  );
}

type U = NonNullable<ReturnType<typeof useAuth>["user"]>;

function AvatarCard({ user, onSaved }: { user: U; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = trpc.auth.requestAvatarUpload.useMutation();
  const confirm = trpc.auth.confirmAvatar.useMutation();

  const onPick = async (file: File) => {
    setError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setError("Use a PNG, JPEG, or WebP image.");
    if (file.size > 2 * 1024 * 1024) return setError("Image must be under 2 MB.");
    setBusy(true);
    try {
      const { path, uploadUrl } = await request.mutateAsync({ mime: file.type, size: file.size });
      await uploadToSignedUrl(uploadUrl, file);
      await confirm.mutateAsync({ path });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Avatar">
      <div className="flex items-center gap-5">
        <Avatar name={user.name} url={user.avatarUrl} size={72} />
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            data-testid="avatar-upload-btn"
            className="rounded-full px-5 py-2 font-sans text-[13px] disabled:opacity-50"
            style={{ background: "var(--fg)", color: "var(--clear)" }}
          >
            {busy ? "Uploading…" : "Upload new"}
          </button>
          <p className="mt-2 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>PNG, JPEG, or WebP · up to 2 MB.</p>
          {error && <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--sev-flag-text)" }} data-testid="avatar-error">{error}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
          />
        </div>
      </div>
    </Card>
  );
}

function IdentityCard({ user, onSaved }: { user: U; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: user.name ?? "",
    title: user.title ?? "",
    firm: user.firm ?? "",
    location: user.location ?? "",
    timezone: user.timezone ?? "",
    phone: user.phone ?? "",
    bio: user.bio ?? "",
  });
  const [saved, setSaved] = useState(false);
  const save = trpc.auth.updateProfile.useMutation({
    onSuccess: () => { setSaved(true); onSaved(); setTimeout(() => setSaved(false), 2500); },
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Card title="Identity">
      <form
        onSubmit={(e) => { e.preventDefault(); save.mutate({ ...form }); }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={form.name} onChange={set("name")} required testId="profile-name" /></Field>
          <Field label="Title"><Input value={form.title} onChange={set("title")} placeholder="Partner" testId="profile-title" /></Field>
          <Field label="Firm"><Input value={form.firm} onChange={set("firm")} placeholder="Ansyra Capital" /></Field>
          <Field label="Location"><Input value={form.location} onChange={set("location")} placeholder="London, UK" /></Field>
        <Field label="Timezone">
            <Input list="tz-list" value={form.timezone} onChange={set("timezone")} placeholder="Europe/London" />
            <datalist id="tz-list">{timezones().map((z) => <option key={z} value={z} />)}</datalist>
          </Field>
          <Field label="Phone"><Input value={form.phone} onChange={set("phone")} placeholder="+44 20 0000 0000" /></Field>
        </div>
        <Field label="Bio">
          <Textarea value={form.bio} onChange={set("bio")} rows={3} placeholder="A line about you…" />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={save.isPending} data-testid="profile-save" className="rounded-full px-5 py-2 font-sans text-[13px] disabled:opacity-50" style={{ background: "var(--fg)", color: "var(--clear)" }}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
          {saved && <span className="font-sans text-[13px]" style={{ color: "var(--sev-grounded-text)" }} data-testid="profile-saved">Saved ✓</span>}
        </div>
      </form>
    </Card>
  );
}

function AccountCard({ user }: { user: U }) {
  return (
    <Card title="Account">
      <div className="space-y-3">
        <Field label="Email">
          <div className="flex items-center gap-2">
            <Input value={user.email ?? ""} onChange={() => {}} disabled />
          </div>
          <p className="mt-1 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>Email is managed by your administrator — ask them to change it.</p>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Badge>{KIND_LABEL[user.userKind] ?? user.userKind}</Badge>
          {user.organizationId && <Badge>Organization member</Badge>}
        </div>
      </div>
    </Card>
  );
}

function PreferencesCard({ user, onSaved }: { user: U; onSaved: () => void }) {
  const prefs = (user.preferences ?? {}) as { default_currency?: string; date_format?: string; email_notifications?: boolean };
  const [currency, setCurrency] = useState<Currency>(isCurrency(prefs.default_currency) ? prefs.default_currency : "USD");
  const [dateFormat, setDateFormat] = useState(prefs.date_format ?? "YYYY-MM-DD");
  const [notify, setNotify] = useState(prefs.email_notifications ?? true);
  const [saved, setSaved] = useState(false);
  const save = trpc.auth.updateProfile.useMutation({ onSuccess: () => { setSaved(true); onSaved(); setTimeout(() => setSaved(false), 2500); } });

  return (
    <Card title="Preferences">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Default currency">
          <Select value={currency} onChange={(v) => { if (isCurrency(v)) setCurrency(v); }} options={CURRENCIES.map((c) => ({ value: c, label: c }))} testId="pref-currency" />
        </Field>
        <Field label="Date format">
          <Select value={dateFormat} onChange={setDateFormat} options={DATE_FORMATS.map((d) => ({ value: d, label: d }))} />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} data-testid="pref-notify" />
        Email me product notifications
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => save.mutate({ preferences: { default_currency: currency, date_format: dateFormat, email_notifications: notify } })}
          disabled={save.isPending}
          data-testid="pref-save"
          className="rounded-full px-5 py-2 font-sans text-[13px] disabled:opacity-50"
          style={{ background: "var(--fg)", color: "var(--clear)" }}
        >
          {save.isPending ? "Saving…" : "Save preferences"}
        </button>
        {saved && <span className="font-sans text-[13px]" style={{ color: "var(--sev-grounded-text)" }}>Saved ✓</span>}
      </div>
    </Card>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => { setDone(true); setPw(""); setConfirm(""); setCurrentPassword(""); },
    onError: (e) => setError(e.message),
  });

  return (
    <Card title="Change password">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (pw.length < 12) return setError("Password must be at least 12 characters.");
          if (pw !== confirm) return setError("Passwords don't match.");
          change.mutate({ newPassword: pw, currentPassword });
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Current password"><Input type="password" value={currentPassword} onChange={setCurrentPassword} required testId="pw-current" /></Field>
          <Field label="New password"><Input type="password" value={pw} onChange={setPw} required testId="pw-new" /></Field>
          <Field label="Confirm password"><Input type="password" value={confirm} onChange={setConfirm} required testId="pw-confirm" /></Field>
        </div>
        {error && <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }} data-testid="pw-error">{error}</p>}
        {done && <p className="font-sans text-[13px]" style={{ color: "var(--sev-grounded-text)" }} data-testid="pw-done">Password changed. Other sessions have been signed out.</p>}
        <button type="submit" disabled={change.isPending} data-testid="pw-save" className="rounded-full px-5 py-2 font-sans text-[13px] disabled:opacity-50" style={{ background: "var(--fg)", color: "var(--clear)" }}>
          {change.isPending ? "Saving…" : "Update password"}
        </button>
      </form>
    </Card>
  );
}

function DataRightsCard() {
  const [confirming, setConfirming] = useState(false);
  const [requested, setRequested] = useState(false);
  const exportData = trpc.auth.exportMyData.useQuery(undefined, { enabled: false });
  const del = trpc.auth.requestAccountDeletion.useMutation({ onSuccess: () => { setRequested(true); setConfirming(false); } });

  const download = async () => {
    const res = await exportData.refetch();
    if (!res.data) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ansyra-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card title="Data & privacy">
      <p className="font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
        Download everything Ansyra holds about you, or request account deletion.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={download} disabled={exportData.isFetching} data-testid="export-data" className="rounded-full border px-5 py-2 font-sans text-[13px] disabled:opacity-50" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>
          {exportData.isFetching ? "Preparing…" : "Download my data"}
        </button>
        {requested ? (
          <span className="self-center font-sans text-[13px]" style={{ color: "var(--fg-2)" }} data-testid="deletion-requested">Deletion requested — an admin will follow up.</span>
        ) : (
          <button onClick={() => setConfirming(true)} data-testid="delete-account" className="rounded-full border px-5 py-2 font-sans text-[13px]" style={{ borderColor: "var(--sev-flag)", color: "var(--sev-flag-text)" }}>
            Delete my account
          </button>
        )}
      </div>

      {confirming && (
        <DialogShell title="Delete your account?" onClose={() => setConfirming(false)}>
            <p className="mt-3 font-sans text-sm" style={{ color: "var(--fg-2)" }}>
              This sends a deletion request to your administrator. Your data is not destroyed immediately — an admin completes the removal.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setConfirming(false)} className="rounded-full border px-5 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Cancel</button>
              <button onClick={() => del.mutate()} disabled={del.isPending} data-testid="confirm-delete-account" className="rounded-full px-5 py-2 font-sans text-[13px]" style={{ background: "var(--sev-flag)", color: "var(--clear)" }}>
                {del.isPending ? "Requesting…" : "Request deletion"}
              </button>
            </div>
        </DialogShell>
      )}
    </Card>
  );
}

// ─── Local primitives ───────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border p-6" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", boxShadow: "0 2px 24px rgba(46,43,35,0.06)" }}>
      <p className="mb-4 ansyra-label" style={{ color: "var(--fg-2)" }}>{title}</p>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <FieldGroup label={label}>{children}</FieldGroup>;
}
function Input({ value, onChange, placeholder, required, type = "text", disabled, testId, list }: { value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; type?: string; disabled?: boolean; testId?: string; list?: string }) {
  const id = useFieldControlId();
  return (
    <input
      id={id} list={list} type={type} value={value} required={required} disabled={disabled} placeholder={placeholder} data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)] disabled:opacity-60"
      style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
    />
  );
}
function Select({ value, onChange, options, testId }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; testId?: string }) {
  const id = useFieldControlId();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function Textarea({ value, onChange, rows, placeholder }: { value: string; onChange: (value: string) => void; rows: number; placeholder?: string }) {
  const id = useFieldControlId();
  return <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} placeholder={placeholder} className="w-full resize-none rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }} />;
}
function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>{children}</span>;
}
