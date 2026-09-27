import { Link } from "react-router";
import { FieldGroup } from "@/components/forms/FieldGroup";
import { useFieldControlId } from "@/components/forms/field-control";

// Shared parchment shell for the standalone auth pages (reset, invite, welcome)
// so they match the Login card without cross-importing dashboard code.
export function AuthLayout({
  title,
  subtitle,
  children,
  testId,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "var(--clear)" }}
    >
      <div
        className="w-full max-w-md rounded-sm border p-8 sm:p-10"
        style={{
          background: "var(--fg-surface)",
          borderColor: "var(--fg-rule)",
          boxShadow: "0 20px 60px rgba(34,32,27,0.15)",
        }}
        data-testid={testId ?? "auth-card"}
      >
        <Link
          to="/"
          className="ansyra-label underline-offset-4 hover:underline"
          style={{ color: "var(--fg-2)" }}
        >
          ← Ansyra
        </Link>
        <h1 className="mt-3 font-serif text-3xl" style={{ color: "var(--fg)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>
            {subtitle}
          </p>
        )}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

export function AuthField({ label, children }: { label: string; children: React.ReactNode }) {
  return <FieldGroup label={label}>{children}</FieldGroup>;
}

export function AuthInput({
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  testId,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  testId?: string;
  autoComplete?: string;
}) {
  const controlId = useFieldControlId();
  return (
    <input
      id={controlId}
      type={type}
      value={value}
      required={required}
      autoComplete={autoComplete}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className="w-full rounded-sm border px-3 py-2 font-sans text-sm outline-none focus:border-[var(--fg)]"
      style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)", color: "var(--fg)" }}
    />
  );
}

export function AuthSubmit({
  children,
  disabled,
  testId,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      data-testid={testId}
      className="w-full rounded-full py-3 font-sans text-sm disabled:opacity-50"
      style={{ background: "var(--fg)", color: "var(--clear)" }}
    >
      {children}
    </button>
  );
}
