import { useId } from "react";
import { FieldControlId } from "./field-control";

/**
 * Shared label/control wiring for the small parchment form primitives used
 * throughout the product. Controls nested several components deep can consume
 * the generated id, so visible labels remain programmatic labels without every
 * call site having to coordinate an id manually.
 */
export function FieldGroup({
  label,
  children,
  hint,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  const generatedId = useId();
  const controlId = `field-${generatedId.replace(/:/g, "")}`;

  return (
    <FieldControlId.Provider value={controlId}>
      <div className="ansyra-field" data-required={required || undefined}>
        <label
          htmlFor={controlId}
          className="mb-1.5 block ansyra-label"
          style={{ color: "var(--fg-2)" }}
        >
          {label}
          <span className="ansyra-required-note sr-only"> (required)</span>
        </label>
        {children}
        {hint && (
          <p className="mt-1 font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
            {hint}
          </p>
        )}
      </div>
    </FieldControlId.Provider>
  );
}
