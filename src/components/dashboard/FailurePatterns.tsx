import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { MIN_PATTERN_SUPPORT } from "@contracts/failure-patterns";
import { Card } from "./parchment/Card";
import { FailurePatternCard } from "./FailurePatternCard";

// Failure patterns (Phase 15.10) — where this firm's own recommendations have
// gone wrong before, clustered by the kind of evidence they rested on, the stage
// they were reached at, and how sure the author was.
//
// Owns its own query rather than taking props from Analytics: Analytics is a
// pure presentational component whose mount sits inside the dashboard's shared
// deals/targets loading contract, and a third async source underneath that
// contract would be invisible to it.
//
// Deliberately shows NO firm-wide total. A recommendation citing three kinds of
// evidence belongs to three clusters, so the counts overlap by design — see the
// note on foldPatterns. Summing them would invent a number.

const TOP_N = 6;

export function FailurePatterns() {
  const q = trpc.patterns.list.useQuery();
  const [showAll, setShowAll] = useState(false);

  const patterns = useMemo(() => q.data?.patterns ?? [], [q.data]);
  const examples = useMemo(() => q.data?.examples ?? [], [q.data]);

  const visible = showAll ? patterns : patterns.slice(0, TOP_N);

  if (q.isLoading) {
    return (
      <Card className="p-6">
        <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>
          Reading the outcome ledger…
        </p>
      </Card>
    );
  }

  if (patterns.length === 0) {
    return (
      <Card className="p-6" data-testid="failure-patterns-empty">
        <p className="font-serif text-lg" style={{ color: "var(--fg)" }}>
          No patterns yet.
        </p>
        <p
          className="mt-1 font-sans text-[13px]"
          style={{ color: "var(--fg-2)", maxWidth: "62ch" }}
        >
          A pattern needs at least {MIN_PATTERN_SUPPORT} recorded outcomes on decided
          recommendations resting on the same kind of evidence — fewer than that is a
          coincidence, not a lesson, and this panel will not print one. Open a deal →
          Recommendations, accept or reject a draft, and record what actually happened at
          thirty days, ninety days and post-close. Sample-portfolio deals are excluded on
          purpose.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6" data-testid="failure-patterns">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
            Failure patterns
          </h3>
          <p className="mt-1 font-sans text-[12.5px]" style={{ color: "var(--fg-2)", maxWidth: "72ch" }}>
            Where this firm's recorded conclusions went the other way — accepted claims that
            were contradicted, and rejected ones that held. Counts overlap: a recommendation
            citing three kinds of evidence appears under all three.
          </p>
        </div>
        <span
          className="font-mono text-[length:var(--step-xs)]"
          style={{ color: "var(--fg-2)" }}
        >
          {patterns.length} pattern{patterns.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {visible.map((p) => (
          <FailurePatternCard
            key={p.patternId}
            pattern={p}
            examples={examples.filter((e) =>
              p.exampleRecommendationIds.includes(e.recommendationId),
            )}
          />
        ))}
      </div>

      {patterns.length > TOP_N && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          data-testid="patterns-show-all"
          className="mt-3 rounded-full border px-4 py-2 font-sans text-[12.5px]"
          style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", minHeight: 44 }}
        >
          {showAll ? `Show top ${TOP_N}` : `Show all ${patterns.length}`}
        </button>
      )}
    </Card>
  );
}
