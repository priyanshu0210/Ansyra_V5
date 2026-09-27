import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { AuthLayout, AuthField, AuthInput, AuthSubmit } from "@/components/auth/AuthLayout";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  // Always resolves to success (the server never reveals whether the email
  // exists), so we show the same confirmation regardless of outcome.
  const request = trpc.auth.requestPasswordReset.useMutation({
    onSettled: () => setSent(true),
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={sent ? undefined : "Enter your account email and we'll send you a reset link."}
      testId="reset-card"
    >
      {sent ? (
        <div
          className="rounded-sm border p-5"
          style={{ borderColor: "var(--fg-rule)", background: "var(--fg-surface)" }}
          data-testid="reset-sent"
        >
          <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>Check your email.</p>
          <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>
            If an account exists for <strong>{email}</strong>, a password-reset link is on its way.
            The link expires shortly — use it soon.
          </p>
          <Link
            to="/login"
            className="mt-4 inline-block font-sans text-[13px] underline underline-offset-4"
            style={{ color: "var(--fg)" }}
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            request.mutate({ email });
          }}
          className="space-y-4"
        >
          <AuthField label="Email">
            <AuthInput
              type="email"
              value={email}
              onChange={setEmail}
              required
              placeholder="you@firm.com"
              autoComplete="email"
              testId="reset-email"
            />
          </AuthField>
          <AuthSubmit disabled={request.isPending} testId="reset-submit">
            {request.isPending ? "Sending…" : "Send reset link"}
          </AuthSubmit>
          <p className="text-center font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
            Remembered it?{" "}
            <Link to="/login" className="underline underline-offset-4" style={{ color: "var(--fg)" }}>
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
