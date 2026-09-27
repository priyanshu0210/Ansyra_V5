import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { hasFeature } from "@/lib/rbac";
import { DecisionCard } from "./DecisionCard";

// The one query behind the decision-health card (Phase 15.12).
//
// Every non-success state renders NOTHING, and that is the design rather than
// laziness: this card summarises the Recommendations panel directly below it,
// which renders its own loading state, surfaces its own errors next to the
// controls that fix them, and already has a strong empty state. A second
// spinner, a second error box, or a summary of nothing would each be noise
// stacked on top of something that already says the same thing better.

export function DecisionPanel({ dealId }: { dealId: number }) {
  const { user } = useAuth();
  const q = trpc.recommendations.decisionHealth.useQuery({ dealId });

  if (q.isError) return <p role="alert" className="font-sans text-sm" style={{ color: "var(--sev-flag-text)" }}>Decision health could not load. Readiness is unknown; refresh to retry.</p>;
  if (q.isLoading || !q.data) return <p className="font-sans text-sm" style={{ color: "var(--fg-2)" }}>Checking decision health…</p>;
  // Nothing concluded yet — Recommendations.tsx says so, with the buttons to fix it.
  if (q.data.totalRecommendations === 0) return null;

  return (
    <DecisionCard
      health={q.data}
      canOpenMemo={hasFeature(user, "decisions")}
      canSeeFirmQueue={hasFeature(user, "analytics")}
    />
  );
}
