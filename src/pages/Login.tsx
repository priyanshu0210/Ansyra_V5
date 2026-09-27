import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { Logo } from "@/components/ansyra/Logo";
import { AuthField, AuthInput } from "@/components/auth/AuthLayout";
import { resetTabStores } from "@/lib/tab-stores";

export default function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      // Wipe ALL cached queries before entering the dashboard so a previous
      // user's data can never flash while the new session loads.
      queryClient.clear();
      resetTabStores();
      navigate("/dashboard", { replace: true });
    },
    onError: (err) => setError(err.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    login.mutate({ email, password });
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "var(--clear)" }}
    >
      <div
        className="w-full max-w-md rounded-sm border p-10"
        style={{
          background: "var(--fg-surface)",
          borderColor: "var(--fg-rule)",
          boxShadow: "0 20px 60px rgba(34,32,27,0.15)",
        }}
        data-testid="auth-card"
      >
        <Link
          to="/"
          className="flex items-center gap-2 ansyra-label underline-offset-4 hover:underline"
          style={{ color: "var(--fg-2)" }}
          data-testid="login-home-link"
        >
          <Logo size={22} />
          ← Ansyra
        </Link>
        <h1 className="mt-3 font-serif text-3xl" style={{ color: "var(--fg)" }}>
          Welcome back.
        </h1>
        <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>
          Sign in to access your intelligence layer.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <AuthField label="Email">
            <AuthInput type="email" value={email} onChange={setEmail} required placeholder="you@firm.com" testId="auth-email" autoComplete="email" />
          </AuthField>
          <AuthField label="Password">
            <AuthInput type="password" value={password} onChange={setPassword} required placeholder="Your password" testId="auth-password" autoComplete="current-password" />
            <Link
              to="/reset-password"
              className="mt-1.5 inline-block font-sans text-[12px] underline-offset-4 hover:underline"
              style={{ color: "var(--fg-2)" }}
              data-testid="forgot-password-link"
            >
              Forgot password?
            </Link>
          </AuthField>

          {error && (
            <p className="font-sans text-[13px]" style={{ color: "var(--sev-flag-text)" }} data-testid="auth-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            data-testid="login-submit"
            className="w-full rounded-full py-3 font-sans text-sm"
            style={{ background: "var(--fg)", color: "var(--clear)" }}
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-8 border-t pt-4" style={{ borderColor: "var(--fg-rule)" }}>
          <p className="font-sans text-[12px] leading-relaxed" style={{ color: "var(--fg-2)" }} data-testid="request-access-note">
            Ansyra accounts are provisioned by your team&apos;s administrator.
            Need access? Ask your admin to add you, or{" "}
            <Link to="/" className="underline underline-offset-4" style={{ color: "var(--fg)" }}>
              request access from our homepage
            </Link>
            .
          </p>
        </div>

        <p
          className="mt-4 flex justify-center gap-4 ansyra-label"
          style={{ color: "var(--fg-2)" }}
        >
          <Link to="/legal/terms" className="whitespace-nowrap underline-offset-4 hover:underline" data-testid="login-terms">Terms of Use</Link>
          <span aria-hidden>·</span>
          <Link to="/legal/privacy" className="whitespace-nowrap underline-offset-4 hover:underline" data-testid="login-privacy">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
