import type { HTMLAttributes, ReactNode } from "react";

// D1. Operate mode. The leverage point for the whole dashboard: 20 of the 28
// instrument components render through this.
//
// It inherits the MATERIAL, not the THEATRE. Refraction's palette, radius and
// elevation apply; its set pieces do not. Someone is using this at 11pm in week
// three of diligence, and a pinned scroll section or a travelling light in a
// working tool would be actively hostile. Scanability and task completion
// outrank expression here, which is why this is a panel rather than a card that
// wants to be looked at.
//
// The dashboard FOLLOWS THE READER'S THEME. It does not force its own ground.
// This comment used to end "the dashboard also stays LIGHT", which described
// the world before Refraction II: one light ground, one dark one, and the
// landing crossing between them. Dark is the default theme now, every theme
// carries two grounds, and nothing in the dashboard sets `data-theme` or
// `data-ground`. The rule that survived the change is the one that binds — a
// surface may not invert the ground the reader picked.
//
// The 1px ink top rule is gone with the exhibit it echoed. Radius and elevation
// carry the panel now, at --r-lens and --elev-1, lifting to --elev-2 on hover.
//
// `empty` renders in place of children when a query resolved with nothing, so
// the fourteen hand-written variations on "No assumptions yet" have one home.
// There is deliberately no matching `loading` prop: every panel that needed one
// already branches inline, where it can size the skeleton to its own content,
// and a declared version sat unused. Note for anyone adding one back — the
// fallback chain is `??`, which does NOT fall through on `false`, so
// `loading={isLoading && <Skeleton/>}` would blank the card.
export function Card({
  className,
  children,
  empty,
  title,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  /** Rendered instead of children when the query resolved with nothing. */
  empty?: ReactNode;
  /** Optional SectionTitle, so a panel does not repeat the markup. */
  title?: ReactNode;
}) {
  const body = empty ?? children;
  return (
    <div
      {...rest}
      className={`ansyra-alive p-5 ${className ?? ""}`}
      style={{
        background: "var(--fg-surface)",
        color: "var(--fg)",
        borderRadius: "var(--r-lens)",
        border: "1px solid var(--fg-rule)",
        boxShadow: "var(--elev-1)",
        ...(rest.style ?? {}),
      }}
    >
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      {body}
    </div>
  );
}

// A section label, not an eyebrow-on-everything. Sentence-cased, in the text
// face rather than mono: monospace as a costume for "technical" is a tell, and
// the old 10px/0.32em tracked mono caps was unreadable at arm's length.
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 border-b pb-2" style={{ borderColor: "var(--fg-rule)" }}>
      <p
        className="font-sans font-medium"
        style={{ color: "var(--fg)", fontSize: "var(--step-sm)", letterSpacing: "0.01em" }}
      >
        {children}
      </p>
    </div>
  );
}
