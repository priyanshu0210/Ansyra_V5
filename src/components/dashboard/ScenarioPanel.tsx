import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { hasFeature } from "@/lib/rbac";
import {
  MAX_COMPARE,
  canCompare,
  compareBlockedMessage,
  resolveCompareSelection,
  type Scenario,
} from "@contracts/scenarios";
import { Card, SectionTitle } from "./parchment/Card";
import { ScenarioCompare } from "./ScenarioCompare";

// Compare scenarios (Phase 15.13).
//
// ScenarioCards (15.6) already renders each RUN in full, inside the Assumption
// Ledger, where you generate them. This panel answers the different question a
// partner asks on the dossier: given the ranges on file, how do two cases
// actually differ, and which conclusions move if one of them lands.
//
// It owns both queries. The links query is guarded by the same client-side
// `enabled` that ScenarioCards has used since 15.9, so a member holding
// `scenarios` without `recommendations` never fires a request that would 403 —
// the recommendation row simply does not render.

const CASE_ACCENT: Record<string, string> = {
  base: "var(--fg-2)",
  upside: "var(--sev-grounded)",
  downside: "var(--sev-flag)",
};

function ScenarioChip({
  scenario,
  selected,
  disabled,
  onToggle,
}: {
  scenario: Scenario;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className="text-left px-3 py-2 font-sans transition-colors"
      style={{
        minHeight: "44px",
        borderRadius: "var(--r-lens)",
        border: `1px solid ${selected ? "var(--sev-grounded)" : "var(--fg-rule)"}`,
        background: selected ? "var(--fg-surface-2, transparent)" : "transparent",
        color: disabled ? "var(--fg-2)" : "var(--fg)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: "var(--step-sm)",
      }}
    >
      <span style={{ color: CASE_ACCENT[scenario.caseName] ?? "var(--fg)" }}>{scenario.label}</span>
      <span style={{ color: "var(--fg-2)" }}> · run #{scenario.snapshotId}</span>
      <span className="block font-mono" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
        Illustrative
      </span>
    </button>
  );
}

export function ScenarioPanel({ dealId }: { dealId: number }) {
  const { user } = useAuth();
  const canSeeRecommendations = hasFeature(user, "recommendations");

  const canSeeAssumptions = hasFeature(user, "assumptions");

  const q = trpc.scenarios.listByDeal.useQuery({ dealId });
  const links = trpc.recommendations.listScenarioLinks.useQuery(
    { dealId },
    { enabled: canSeeRecommendations },
  );
  // The two outcome ledgers, each behind the grant that already owns it, with
  // the same client-side `enabled` guard ScenarioCards has used since 15.9 — a
  // member without the grant never fires a request that would 403, and the
  // chain simply ends earlier for them.
  const recOutcomes = trpc.recommendations.listOutcomes.useQuery(
    { dealId },
    { enabled: canSeeRecommendations },
  );
  const assumptionLedger = trpc.assumptionLedger.ledger.useQuery(
    { dealId },
    { enabled: canSeeAssumptions },
  );

  const [ids, setIds] = useState<string[]>([]);
  const scenarios = useMemo(() => q.data ?? [], [q.data]);

  // listScenarioLinks names the recommendation's status `recStatus` (it joins
  // two tables and `status` would be ambiguous). Mapped here rather than
  // widening the contract's input shape to know about that join's aliases.
  const linkRows = useMemo(
    () => (links.data ?? []).map((l) => ({ ...l, status: l.recStatus })),
    [links.data],
  );

  // Flattened out of the ledger rows: the chain wants reads keyed by
  // assumption, and the ledger already nests them under the assumption they
  // belong to.
  const chainData = useMemo(
    () => ({
      recommendationOutcomes: recOutcomes.data ?? [],
      assumptionOutcomes: (assumptionLedger.data?.rows ?? []).flatMap((a) =>
        a.outcomes.map((o) => ({
          assumptionId: a.id,
          outcomeType: o.outcomeType,
          horizon: o.horizon,
          recordedAt: o.recordedAt,
        })),
      ),
    }),
    [recOutcomes.data, assumptionLedger.data],
  );

  // Default to the newest run's downside vs base — the comparison a reader
  // almost always wants first, and the one that makes the panel legible on
  // arrival instead of showing an empty grid behind a prompt.
  const effectiveIds = useMemo(() => {
    if (ids.length > 0) return ids;
    const newest = scenarios[0]?.snapshotId;
    if (newest === undefined) return [];
    return scenarios
      .filter((s) => s.snapshotId === newest && s.caseName !== "upside")
      .map((s) => s.id);
  }, [ids, scenarios]);

  const selected = useMemo(
    () => resolveCompareSelection(scenarios, effectiveIds),
    [scenarios, effectiveIds],
  );

  // Nothing to compare against — ScenarioCards owns the "generate one" story,
  // and a second empty state pointing at the same button is noise.
  if (q.isLoading || q.isError || scenarios.length < 2) return null;

  const toggle = (id: string) => {
    setIds((prev) => {
      const base = prev.length > 0 ? prev : effectiveIds;
      if (base.includes(id)) return base.filter((x) => x !== id);
      if (base.length >= MAX_COMPARE) return base;
      return [...base, id];
    });
  };

  const blocked = compareBlockedMessage(selected.length);

  return (
    <Card id="scenario-compare">
      <SectionTitle>Compare scenarios</SectionTitle>

      <p
        className="mb-4 font-sans"
        style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", maxWidth: "62ch" }}
      >
        Pick two or three cases. The table below shows what each says, and which
        assumptions they disagree about.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {scenarios.map((s) => {
          const isSelected = selected.some((x) => x.id === s.id);
          return (
            <ScenarioChip
              key={s.id}
              scenario={s}
              selected={isSelected}
              disabled={!isSelected && selected.length >= MAX_COMPARE}
              onToggle={() => toggle(s.id)}
            />
          );
        })}
      </div>

      {blocked !== null ? (
        <p className="font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)" }}>
          {blocked}
        </p>
      ) : (
        canCompare(selected) && (
          <ScenarioCompare
            selected={selected}
            links={linkRows}
            chainData={chainData}
            canSeeRecommendations={canSeeRecommendations}
            canSeeAssumptions={canSeeAssumptions}
          />
        )
      )}
    </Card>
  );
}
