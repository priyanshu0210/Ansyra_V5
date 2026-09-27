import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "./parchment/Card";
import { DialogShell } from "@/components/ansyra/modals/DialogShell";
import { FieldGroup } from "@/components/forms/FieldGroup";
import { useFieldControlId } from "@/components/forms/field-control";
import { SkeletonRows, LoadingAnnounce } from "./parchment/Skeleton";
import { isAdminKind, isMainAdmin, hasAdminPerm } from "@/lib/rbac";
import {
  // Two lists with two different jobs, and conflating them is a real bug we
  // already shipped once: FEATURE_KEYS is the CATALOG (everything an admin may
  // grant), DEFAULT_MEMBER_FEATURES is only the set pre-checked for a NEW
  // member. Rendering the default list as the catalog made target_discovery and
  // documents ungrantable by anyone, and silently revoked them on save.
  FEATURE_KEYS,
  DEFAULT_MEMBER_FEATURES,
  FEATURE_LABELS,
  ADMIN_PERMISSION_KEYS,
  ADMIN_PERMISSION_LABELS,
  type FeatureKey,
  type AdminPermission,
} from "@contracts/constants";

const ROLE_OPTIONS = [
  { value: "private_equity", label: "Private Equity" },
  { value: "corporate_development", label: "Corporate Development" },
  { value: "ma_advisor", label: "M&A Advisor" },
  { value: "freelancer", label: "Freelancer" },
  { value: "other", label: "Other" },
] as const;
type Role = (typeof ROLE_OPTIONS)[number]["value"];

const KIND_LABEL: Record<string, string> = { main_admin: "Main Admin", admin: "Admin", member: "Member" };

type UserRow = inferRouterOutputs<AppRouter>["admin"]["listUserSummaries"][number];

export function AdminPanel() {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const usersQuery = trpc.admin.listUserSummaries.useQuery(undefined, {
    enabled: !!me && isAdminKind(me.userKind),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; email: string } | null>(null);
  const [featureEdit, setFeatureEdit] = useState<UserRow | null>(null);
  const [permEdit, setPermEdit] = useState<UserRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => utils.admin.listUserSummaries.invalidate();

  const setUserKind = trpc.admin.setUserKind.useMutation(withToast({ done: "Role updated", failed: "Could not change that role", silentOnError: true }, {
    onSuccess: () => { setActionError(null); invalidate(); },
    onError: (e) => setActionError(e.message),
  }));
  const resetPassword = trpc.admin.resetPassword.useMutation(withToast({ done: "Password reset", failed: "Could not reset that password", silentOnError: true }, { onError: (e) => setActionError(e.message) }));
  const removeUser = trpc.admin.removeUser.useMutation(withToast({ done: "Account removed", failed: "Could not remove that account", silentOnError: true }, {
    onSuccess: (r, vars) => {
      const who = confirmDelete?.email || vars.userId;
      setActionNotice(
        r.mode === "deactivated"
          ? `${who} was deactivated: sign-in is blocked and every session was revoked. Their ${r.retained.deals} deal(s), ${r.retained.targets} target(s), ${r.retained.decisions} decision(s) and ${r.retained.documents} document(s) stay attributed to them. Use "Reactivate" to reverse this.`
          : `${who} was deleted.`,
      );
      setConfirmDelete(null);
      invalidate();
    },
    onError: (e) => setActionError(e.message),
  }));
  const reactivateUser = trpc.admin.reactivateUser.useMutation(withToast({ done: "Account reactivated", failed: "Could not reactivate that account", silentOnError: true }, {
    onSuccess: () => { setActionError(null); invalidate(); },
    onError: (e) => setActionError(e.message),
  }));

  if (!me || !isAdminKind(me.userKind)) {
    return (
      <Card>
        <p className="font-serif text-lg" style={{ color: "var(--sev-flag-text)" }}>403 — Admins only.</p>
        <p className="mt-1 font-sans text-sm" style={{ color: "var(--fg-2)" }}>You need administrator access to manage users.</p>
      </Card>
    );
  }

  const canManageUsers = hasAdminPerm(me, "manage_users");
  const canManageFeatures = hasAdminPerm(me, "manage_features");
  const mainAdmin = isMainAdmin(me);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
          {usersQuery.data?.length ?? "…"} accounts
        </p>
        {canManageUsers && (mainAdmin || !!me.organizationId) && (
          <button
            onClick={() => { setActionError(null); setShowCreate(true); }}
            data-testid="admin-create-user"
            className="rounded-full px-5 py-2 font-sans text-[13px]"
            style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
          >
            + Add user
          </button>
        )}
      </div>

      {actionError && (
        <div className="rounded-sm border-l p-4" style={{ borderColor: "var(--sev-flag)", background: "color-mix(in srgb, var(--sev-flag) 8%, var(--fg-surface))" }}>
          <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }}>{actionError}</p>
        </div>
      )}
      {actionNotice && (
        <div className="rounded-sm border-l p-5" style={{ borderColor: "var(--fg)", background: "var(--fg-surface)" }} data-testid="admin-action-notice">
          <p className="font-sans text-[13px]" style={{ color: "var(--fg)" }}>{actionNotice}</p>
          <button onClick={() => setActionNotice(null)} className="mt-3 rounded-full border px-4 py-1.5 font-sans text-[12px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Dismiss</button>
        </div>
      )}
      {inviteNotice && (
        <div className="rounded-sm border-l p-5" style={{ borderColor: "var(--sev-grounded)", background: "color-mix(in srgb, var(--sev-grounded) 8%, var(--fg-surface))" }} data-testid="admin-invite-banner">
          <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>Invite sent to {inviteNotice}</p>
          <p className="mt-2 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>They&apos;ll get an email to set their own password.</p>
          <button onClick={() => setInviteNotice(null)} className="mt-3 rounded-full border px-4 py-1.5 font-sans text-[12px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Dismiss</button>
        </div>
      )}
      {credential && (
        <div className="rounded-sm border-l p-5" style={{ borderColor: "var(--fg)", background: "var(--fg-surface)" }} data-testid="admin-credential-banner">
          <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>Temporary password for {credential.email}</p>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--fg)" }}>{credential.password}</p>
          <p className="mt-2 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>Copy it now — shown only once. The user must change it on first sign-in.</p>
          <button onClick={() => setCredential(null)} className="mt-3 rounded-full border px-4 py-1.5 font-sans text-[12px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Dismiss</button>
        </div>
      )}

      <Card>
        {usersQuery.isLoading && (
          <>
            <LoadingAnnounce what="users" />
            <SkeletonRows rows={5} />
          </>
        )}
        {usersQuery.isError && <p className="font-sans text-sm" style={{ color: "var(--sev-flag-text)" }}>{usersQuery.error.message}</p>}
        {usersQuery.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]" data-testid="admin-user-table">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "var(--fg-rule)" }}>
                  {["User", "Kind", "Organization", "Activity", "Features", ""].map((h) => (
                    <th key={h} className="pb-2 pr-4 ansyra-label" style={{ color: "var(--fg-2)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--fg-rule)" }}>
                {usersQuery.data.map((u) => {
                  const isMe = u.id === me.id;
                  const isTargetMainAdmin = u.userKind === "main_admin";
                  const canManageTarget = canManageUsers && (u.userKind === "member" || mainAdmin);
                  const deactivated = !!u.deactivatedAt;
                  return (
                    <tr key={u.id} data-testid={`admin-user-row-${u.email}`} style={deactivated ? { opacity: 0.6 } : undefined}>
                      <td className="py-3 pr-4">
                        <p className="font-serif text-[15px]" style={{ color: "var(--fg)" }}>{u.name || "—"}</p>
                        <p className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>{u.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label" style={{ borderColor: "var(--fg-rule)", color: u.userKind === "member" ? "var(--fg-2)" : "var(--fg)" }}>
                          {KIND_LABEL[u.userKind] ?? u.userKind}
                        </span>
                        {deactivated && (
                          <span className="ml-2 inline-flex items-center rounded-sm border px-2 py-0.5 ansyra-label" style={{ borderColor: "var(--sev-flag)", color: "var(--sev-flag-text)" }} data-testid="admin-deactivated-chip">
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>{u.organizationName ?? "—"}</td>
                      <td className="py-3 pr-4 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                        {u.userKind === "member" ? `${u.dealCount}D · ${u.targetCount}T · ${u.aiRunCount}AI` : "—"}
                      </td>
                      <td className="py-3 pr-4 font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
                        {u.userKind === "member" ? `${u.features.length}/${FEATURE_KEYS.length}` : "—"}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {deactivated && canManageTarget && (
                            <RowAction label="Reactivate" disabled={reactivateUser.isPending} onClick={() => { setActionError(null); reactivateUser.mutate({ userId: u.id }); }} />
                          )}
                          {!deactivated && u.userKind === "member" && canManageFeatures && (
                            <RowAction label="Features" onClick={() => { setActionError(null); setFeatureEdit(u); }} />
                          )}
                          {!deactivated && u.userKind === "admin" && mainAdmin && (
                            <RowAction label="Permissions" onClick={() => { setActionError(null); setPermEdit(u); }} />
                          )}
                          {!deactivated && mainAdmin && !isTargetMainAdmin && u.userKind === "member" && (
                            <RowAction label="Make admin" disabled={setUserKind.isPending} onClick={() => { setActionError(null); setUserKind.mutate({ userId: u.id, kind: "admin" }); }} />
                          )}
                          {!deactivated && mainAdmin && !isTargetMainAdmin && u.userKind === "admin" && (
                            <RowAction label="Make member" disabled={setUserKind.isPending} onClick={() => { setActionError(null); setUserKind.mutate({ userId: u.id, kind: "member" }); }} />
                          )}
                          {!deactivated && canManageTarget && !isTargetMainAdmin && (
                            <RowAction label="Reset password" disabled={resetPassword.isPending} onClick={async () => {
                              setActionError(null);
                              const r = await resetPassword.mutateAsync({ userId: u.id }).catch(() => null);
                              if (r) setCredential({ email: u.email ?? "", password: r.temporaryPassword });
                            }} />
                          )}
                          {!deactivated && canManageTarget && !isTargetMainAdmin && !isMe && (
                            <RowAction label="Remove" danger disabled={removeUser.isPending} onClick={() => { setActionError(null); setConfirmDelete({ id: u.id, email: u.email ?? "" }); }} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showCreate && (
        <CreateUserModal
          canCreateAdmin={mainAdmin}
          companyId={me.organizationId ?? null}
          onClose={() => setShowCreate(false)}
          onCreated={(email, tempPassword, invited) => {
            setShowCreate(false);
            setInviteNotice(null);
            if (tempPassword) setCredential({ email, password: tempPassword });
            else if (invited) setInviteNotice(email);
            invalidate();
          }}
        />
      )}

      {featureEdit && (
        <FeatureModal user={featureEdit} onClose={() => setFeatureEdit(null)} onSaved={() => { setFeatureEdit(null); invalidate(); }} onError={setActionError} />
      )}
      {permEdit && (
        <PermissionModal user={permEdit} onClose={() => setPermEdit(null)} onSaved={() => { setPermEdit(null); invalidate(); }} onError={setActionError} />
      )}

      {confirmDelete && (
        <ModalShell title="Remove account" onClose={() => setConfirmDelete(null)}>
          <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
            Remove <strong>{confirmDelete.email}</strong>? They can no longer sign in and every session ends now.
          </p>
          <p className="mt-2 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
            An account that has recorded decisions, created deals or targets, or uploaded documents is <strong>deactivated</strong> rather than deleted, so those records stay attributed to them — you can reactivate it later. An account that authored nothing is deleted outright, which cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setConfirmDelete(null)} className="rounded-full border px-5 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Cancel</button>
            <button onClick={() => removeUser.mutate({ userId: confirmDelete.id })} disabled={removeUser.isPending} data-testid="admin-confirm-delete" className="rounded-full px-5 py-2 font-sans text-[13px]" style={{ background: "var(--sev-flag)", color: "var(--clear)" }}>
              {removeUser.isPending ? "Removing…" : "Remove account"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function CreateUserModal({
  canCreateAdmin,
  companyId,
  onClose,
  onCreated,
}: {
  canCreateAdmin: boolean;
  companyId: string | null;
  onClose: () => void;
  onCreated: (email: string, tempPassword: string | null, invited: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("private_equity");
  // "" = no organisation, "new" = create one from `newOrgName`, otherwise an
  // existing organisation's id. Membership is never resolved from a typed name
  // — an exact match would silently join another firm's tenant.
  const [orgChoice, setOrgChoice] = useState<string>("");
  const [newOrgName, setNewOrgName] = useState("");
  const organizations = trpc.admin.listOrganizations.useQuery();
  const [isAdmin, setIsAdmin] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);
  const [features, setFeatures] = useState<FeatureKey[]>([...DEFAULT_MEMBER_FEATURES]);
  const [error, setError] = useState<string | null>(null);

  const createUser = trpc.admin.createUser.useMutation(withToast({ done: "Member created", failed: "Could not create that member", silentOnError: true }, {
    onSuccess: (r, vars) => onCreated(vars.email, r.temporaryPassword, r.invited),
    onError: (e) => setError(e.message),
  }));
  const toggle = (k: FeatureKey) => setFeatures((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <ModalShell title="Add user" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          createUser.mutate({
            name, email, role,
            organizationId: canCreateAdmin ? (orgChoice && orgChoice !== "new" ? orgChoice : null) : companyId,
            organizationName: orgChoice === "new" ? newOrgName.trim() || null : null,
            isAdmin,
            sendInvite,
            features: isAdmin ? [] : features,
          });
        }}
        className="space-y-4"
      >
        <Field label="Full name"><ModalInput value={name} onChange={setName} required placeholder="Jordan Reeves" testId="admin-new-name" /></Field>
        <Field label="Email"><ModalInput type="email" value={email} onChange={setEmail} required placeholder="jordan@firm.com" testId="admin-new-email" /></Field>
        <Field label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </Field>
        {canCreateAdmin ? <Field label="Organization (optional: shares deals with teammates)">
          <OrgSelect
            value={orgChoice}
            onChange={setOrgChoice}
            organizations={organizations.data ?? []}
          />
        </Field>
        : <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>New members belong to your company.</p>}
        {canCreateAdmin && orgChoice === "new" && (
          <Field label="New organization name">
            <ModalInput value={newOrgName} onChange={setNewOrgName} required placeholder="e.g. Ansyra Capital" testId="admin-new-org" />
          </Field>
        )}

        {canCreateAdmin && (
          <label className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} data-testid="admin-new-isadmin" />
            Grant administrator access (no product features)
          </label>
        )}

        {!isAdmin && (
          /* Catalog = every feature. The opt-in ones (AI Target Discovery,
             Document Intelligence) start unchecked because they are not in
             DEFAULT_MEMBER_FEATURES, which is exactly the intended behaviour. */
          <fieldset>
            <legend className="mb-1.5 block ansyra-label" style={{ color: "var(--fg-2)" }}>Features</legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {FEATURE_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
                  <input type="checkbox" checked={features.includes(k)} onChange={() => toggle(k)} data-testid={`admin-new-feature-${k}`} />
                  {FEATURE_LABELS[k]}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
          <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} data-testid="admin-new-sendinvite" />
          Send invite email (let them set their own password)
        </label>
        <p className="font-sans text-[12px]" style={{ color: "var(--fg-2)" }}>
          {sendInvite
            ? "We email an invite. If email isn't configured yet, we fall back to a temporary password shown here once."
            : "A temporary password is generated and shown once. The user must change it on first sign-in."}
        </p>

        {error && <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }}>{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border px-5 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Cancel</button>
          <button type="submit" disabled={createUser.isPending} data-testid="admin-new-submit" className="rounded-full px-5 py-2 font-sans text-[13px]" style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}>
            {createUser.isPending ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function FeatureModal({ user, onClose, onSaved, onError }: { user: UserRow; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  // Filter against the full catalog, not the default set — filtering against
  // the defaults dropped a member's opt-in grants from state on open, so
  // saving revoked them without the admin ever touching the checkbox.
  const [features, setFeatures] = useState<FeatureKey[]>(
    (user.features ?? []).filter((f: string): f is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(f)),
  );
  const save = trpc.admin.setUserFeatures.useMutation(withToast({ done: "Instruments updated", failed: "Could not save those instruments", silentOnError: true }, { onSuccess: onSaved, onError: (e) => onError(e.message) }));
  const toggle = (k: FeatureKey) => setFeatures((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <ModalShell title={`Features · ${user.name || user.email}`} onClose={onClose}>
      <div className="space-y-2">
        {FEATURE_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
            <input type="checkbox" checked={features.includes(k)} onChange={() => toggle(k)} data-testid={`feature-${k}`} />
            {FEATURE_LABELS[k]}
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-full border px-5 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Cancel</button>
        <button onClick={() => save.mutate({ userId: user.id, features })} disabled={save.isPending} data-testid="feature-save" className="rounded-full px-5 py-2 font-sans text-[13px]" style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}>
          {save.isPending ? "Saving…" : "Save features"}
        </button>
      </div>
    </ModalShell>
  );
}

function PermissionModal({ user, onClose, onSaved, onError }: { user: UserRow; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const initial = (user.adminPermissions ?? {}) as Record<string, boolean>;
  const [perms, setPerms] = useState<Record<AdminPermission, boolean>>(
    Object.fromEntries(ADMIN_PERMISSION_KEYS.map((k) => [k, !!initial[k]])) as Record<AdminPermission, boolean>,
  );
  const save = trpc.admin.setAdminPermissions.useMutation(withToast({ done: "Permissions updated", failed: "Could not save those permissions", silentOnError: true }, { onSuccess: onSaved, onError: (e) => onError(e.message) }));

  return (
    <ModalShell title={`Permissions · ${user.name || user.email}`} onClose={onClose}>
      <div className="space-y-2">
        {ADMIN_PERMISSION_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-2 font-sans text-[13px]" style={{ color: "var(--fg)" }}>
            <input type="checkbox" checked={perms[k]} onChange={(e) => setPerms((p) => ({ ...p, [k]: e.target.checked }))} data-testid={`perm-${k}`} />
            {ADMIN_PERMISSION_LABELS[k]}
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-full border px-5 py-2 font-sans text-[13px]" style={{ borderColor: "var(--fg-rule)", color: "var(--fg)" }}>Cancel</button>
        <button onClick={() => save.mutate({ userId: user.id, permissions: perms })} disabled={save.isPending} data-testid="perm-save" className="rounded-full px-5 py-2 font-sans text-[13px]" style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}>
          {save.isPending ? "Saving…" : "Save permissions"}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Local UI primitives (match parchment style) ────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <DialogShell title={title} onClose={onClose}>{children}</DialogShell>;
}

function RowAction({ label, onClick, disabled, danger }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-full border px-3 py-1 font-sans text-[length:var(--step-xs)] disabled:opacity-40" style={{ borderColor: "var(--fg-rule)", color: danger ? "var(--sev-flag-text)" : "var(--fg)", background: "var(--fg-surface)" }}>
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <FieldGroup label={label}>{children}</FieldGroup>;
}

function ModalInput({ value, onChange, placeholder, required, type = "text", testId }: { value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; type?: string; testId?: string }) {
  const id = useFieldControlId();
  return (
    <input id={id} type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testId} className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }} />
  );
}

function OrgSelect({ value, onChange, organizations }: { value: string; onChange: (value: string) => void; organizations: { id: string; name: string }[] }) {
  const id = useFieldControlId();
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} data-testid="admin-new-org-select" className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}>
      <option value="">No organization — sees only their own rows</option>
      {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      <option value="new">+ Create a new organization…</option>
    </select>
  );
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (value: Role) => void }) {
  const id = useFieldControlId();
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value as Role)} data-testid="admin-new-role" className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]" style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}>
      {ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
    </select>
  );
}
