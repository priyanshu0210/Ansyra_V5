import { useMemo, useState } from "react";
import { resetTabStores } from "@/lib/tab-stores";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { AuthLayout, AuthField, AuthInput, AuthSubmit } from "@/components/auth/AuthLayout";
import { readAuthToken } from "@/components/auth/read-auth-token";

export default function ResetPasswordConfirm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Read once — the token is a stable URL param for this page load.
  const { tokenHash, type } = useMemo(() => readAuthToken(), []);
  const validLink = !!tokenHash && (type === "recovery" || type === null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const confirmReset = trpc.auth.confirmPasswordReset.useMutation({
    onSuccess: () => {
      // Wipe any stale cache before entering the dashboard as the new session.
      queryClient.clear();
      resetTabStores();
      navigate("/dashboard", { replace: true });
    },
    onError: (e) => setError(e.message),
  });

  if (!validLink) {
    return (
      <AuthLayout title="Link expired" testId="reset-confirm-card">
        <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
          This reset link is invalid or has already been used.
        </p>
        <Link
          to="/reset-password"
          className="mt-4 inline-block font-sans text-[13px] underline underline-offset-4"
          style={{ color: "var(--fg)" }}
        >
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a password you haven't used here before." testId="reset-confirm-card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (password.length < 12) return setError("Password must be at least 12 characters.");
          if (password !== confirm) return setError("Passwords don't match.");
          confirmReset.mutate({ tokenHash: tokenHash!, newPassword: password });
        }}
        className="space-y-4"
      >
        <AuthField label="New password">
          <AuthInput
            type="password"
            value={password}
            onChange={setPassword}
            required
            placeholder="At least 12 characters"
            autoComplete="new-password"
            testId="reset-confirm-password"
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
            testId="reset-confirm-password2"
          />
        </AuthField>
        {error && (
          <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }} data-testid="reset-confirm-error">
            {error}
          </p>
        )}
        <AuthSubmit disabled={confirmReset.isPending} testId="reset-confirm-submit">
          {confirmReset.isPending ? "Saving…" : "Save and sign in"}
        </AuthSubmit>
      </form>
    </AuthLayout>
  );
}
