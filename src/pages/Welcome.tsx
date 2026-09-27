import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout, AuthField, AuthInput, AuthSubmit } from "@/components/auth/AuthLayout";
import { readAuthToken } from "@/components/auth/read-auth-token";
import { resetTabStores } from "@/lib/tab-stores";

export default function Welcome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const { tokenHash, type } = useMemo(() => readAuthToken(), []);
  const isInvite = !!tokenHash && (type === "invite" || type === null);
  const isChange = !isInvite && searchParams.get("mode") === "change";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    queryClient.clear();
    resetTabStores();
    navigate("/dashboard", { replace: true });
  };

  const confirmInvite = trpc.auth.confirmInvite.useMutation({ onSuccess: finish, onError: (e) => setError(e.message) });
  const changePassword = trpc.auth.changePassword.useMutation({ onSuccess: finish, onError: (e) => setError(e.message) });
  const pending = confirmInvite.isPending || changePassword.isPending;

  const validate = (): string | null => {
    if (password.length < 12) return "Password must be at least 12 characters.";
    if (password !== confirm) return "Passwords don't match.";
    if (isInvite && !name.trim()) return "Please enter your name.";
    return null;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) return setError(v);
    if (isInvite) confirmInvite.mutate({ tokenHash: tokenHash!, name: name.trim(), newPassword: password });
    else changePassword.mutate({ newPassword: password });
  };

  // Neither a valid invite link nor a forced-change session.
  if (!isInvite && !isChange) {
    return (
      <AuthLayout title="Nothing to do here" testId="welcome-card">
        <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
          This link is invalid or has expired. If you were invited, ask your admin to resend the invite.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block font-sans text-[13px] underline underline-offset-4"
          style={{ color: "var(--fg)" }}
        >
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={isInvite ? "Welcome to Ansyra" : "Set a new password"}
      subtitle={
        isInvite
          ? "Confirm your name and choose a password to activate your account."
          : `You're using a temporary password${user?.email ? ` for ${user.email}` : ""}. Set a permanent one to continue.`
      }
      testId="welcome-card"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {isInvite && (
          <AuthField label="Full name">
            <AuthInput value={name} onChange={setName} required placeholder="Jordan Reeves" autoComplete="name" testId="welcome-name" />
          </AuthField>
        )}
        <AuthField label={isInvite ? "Password" : "New password"}>
          <AuthInput
            type="password"
            value={password}
            onChange={setPassword}
            required
            placeholder="At least 12 characters"
            autoComplete="new-password"
            testId="welcome-password"
          />
        </AuthField>
        <AuthField label="Confirm password">
          <AuthInput
            type="password"
            value={confirm}
            onChange={setConfirm}
            required
            placeholder="Re-enter your password"
            autoComplete="new-password"
            testId="welcome-password2"
          />
        </AuthField>
        {error && (
          <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }} data-testid="welcome-error">
            {error}
          </p>
        )}
        <AuthSubmit disabled={pending} testId="welcome-submit">
          {pending ? "Saving…" : isInvite ? "Activate account" : "Save and continue"}
        </AuthSubmit>
      </form>
    </AuthLayout>
  );
}
