import { Link } from "react-router";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import {
  PATTERN_SEVERITY_LABELS,
  type FailurePattern,
  type PatternSeverity,
} from "@contracts/failure-patterns";

// One recorded failure pattern (Phase 15.10) — a sentence about how this firm
// has been wrong before, with the count behind it and somewhere to go and look.
//
// Every figure here is deterministic SQL aggregation folded by a pure function,
// never AI. The card states the count in the sentence itself precisely so no
// reader has to take the rate on trust.

type PatternExample =
  inferRouterOutputs<AppRouter>["patterns"]["list"]["examples"][number];

const SEVERITY_COLOR: Record<PatternSeverity, string> = {
  acute: "var(--sev-flag)",
  elevated: "var(--sev-watch)",
  noted: "var(--fg-2)",
};

export function FailurePatternCard({
  pattern,
  examples = [],
}: {
  pattern: FailurePattern;
  /** Already filtered to this pattern's example ids by the panel. */
  examples?: readonly PatternExample[];
}) {
  const color = SEVERITY_COLOR[pattern.severity];
  // De-duplicate by deal: three example recommendations on one deal should not
  // render as the same link three times.
  const deals = [...new Map(examples.map((e) => [e.dealId, e])).values()].slice(0, 3);

  return (
    <div
      data-testid={`pattern-card-${pattern.patternId}`}
      className="rounded-sm border p-4"
      style={{
        borderColor: "var(--fg-rule)",
        background: "var(--fg-surface)",
        borderLeft: `1px solid ${color}`,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 ansyra-label"
          style={{
            color,
            border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
            background: `color-mix(in srgb, ${color} 8%, transparent)`,
          }}
        >
          {PATTERN_SEVERITY_LABELS[pattern.severity]}
        </span>
        <span
          className="ml-auto shrink-0 font-mono text-[length:var(--step-xs)]"
          style={{ color: "var(--fg-2)" }}
        >
          {pattern.highSignalCount} of {pattern.supportingCount}
        </span>
      </div>

      <p
        className="mt-2.5 text-pretty font-serif text-[15px] leading-snug"
        style={{ color: "var(--fg)", maxWidth: "72ch" }}
      >
        {pattern.description}
      </p>

      {pattern.lowSample && (
        // The comps low-sample formula verbatim, so the two surfaces hedge in
        // the same voice.
        <p
          className="mt-2 font-mono text-[length:var(--step-xs)]"
          style={{ color: "var(--fg-2)" }}
        >
          Low sample — {pattern.supportingCount} read
          {pattern.supportingCount === 1 ? "" : "s"}. Treat this as indicative only.
        </p>
      )}

      {deals.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="ansyra-label" style={{ color: "var(--fg-2)" }}>
            Where this showed up
          </span>
          {deals.map((e) => (
            <Link
              key={e.dealId}
              to={`/dashboard/deals/${e.dealId}`}
              data-testid={`pattern-example-${pattern.patternId}-${e.dealId}`}
              className="inline-flex items-center font-sans text-[12px] underline underline-offset-2"
              style={{ color: "var(--fg)", minHeight: 44, marginBlock: -14 }}
            >
              {e.dealName}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
