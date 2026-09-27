import type { ReactNode } from "react";

// D1. Empty states that teach the interface.
//
// WHAT THIS REPLACES: fourteen variations on `"No assumptions stress-tested
// yet."` — a sentence that tells a first-time user what is absent and nothing
// about what the panel is for, why they would want it filled, or how to fill it.
// On an Operate surface that is the most expensive moment to waste: an empty
// panel is the ONLY time the interface has the user's full attention and no
// data competing for it.
//
// So each one answers three questions in order, and stops:
//   1. what this panel holds          (`title`)
//   2. why that is worth having       (`body`, one sentence)
//   3. the single action that fills it (`action`, wired to the real control)
//
// THE ACTION IS THE POINT. An empty state with advice but no button makes the
// reader go and find the thing themselves, which is the failure this is meant to
// fix. Where a panel genuinely has no local action — it fills as a consequence
// of work done elsewhere — say where that work happens instead of inventing a
// button that navigates somewhere unhelpful. `hint` carries that case.
//
// NOT AN ERROR, AND NOT A WARNING. Empty is the correct state of a new deal.
// It takes the secondary text role and no severity colour: an empty ledger
// tinted amber would be the interface lying about urgency.

export function EmptyState({
  title,
  body,
  action,
  hint,
  icon,
}: {
  title: string;
  /** One sentence. What this holds and why it is worth holding. */
  body: string;
  /** The control that actually fills it. */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** Where the work happens, when it does not happen here. */
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-start px-1 py-8"
      data-testid="empty-state"
      // Left-aligned, not centred. A centred empty state in a left-aligned panel
      // is a different layout for the same box, and the eye has to re-find the
      // margin every time a panel happens to be empty.
    >
      {icon ? (
        <span aria-hidden className="mb-3" style={{ color: "var(--fg-2)", opacity: 0.7 }}>
          {icon}
        </span>
      ) : null}

      <p
        className="font-sans font-medium"
        style={{ color: "var(--fg)", fontSize: "var(--step-sm)" }}
      >
        {title}
      </p>
      <p
        className="mt-1.5 text-pretty font-sans"
        style={{
          color: "var(--fg-2)",
          fontSize: "var(--step-sm)",
          lineHeight: 1.55,
          maxWidth: "52ch",
        }}
      >
        {body}
      </p>

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className="ansyra-cta ansyra-cta--ghost mt-4 px-4 py-2"
          style={{ fontSize: "var(--step-sm)", minHeight: 40 }}
        >
          {action.label}
        </button>
      ) : null}

      {hint ? (
        <p className="mt-3 font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
