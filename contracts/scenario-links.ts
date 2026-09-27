// Recommendation ↔ scenario links (Phase 15.9).
//
// A recommendation is a claim; a scenario is a range the claim was drawn
// against. Linking them turns the dossier into something you can interrogate:
// "if this conclusion is wrong, which case are we in?"
//
// A link points at a SPECIFIC scenario_analyses snapshot. Those rows are
// immutable and regenerating inserts a new one, so the link pins what the
// recommender actually read. It never re-points at the latest run — a citation
// that follows a regeneration is not a citation. When a newer snapshot exists
// the UI says so instead.
//
// Pure + unit-tested (see contracts/scenario-links.test.ts).

/** Which case of the snapshot the link is about. "all" = the whole run. */
export const SCENARIO_LINK_CASES = ["all", "base", "upside", "downside"] as const;
export type ScenarioLinkCase = (typeof SCENARIO_LINK_CASES)[number];

export const SCENARIO_LINK_CASE_LABELS: Record<ScenarioLinkCase, string> = {
  all: "Whole run",
  base: "Base",
  upside: "Upside",
  downside: "Downside",
};

/** How the case bears on the claim. */
export const SCENARIO_RELATIONS = [
  "supports", // this case is part of why the claim holds
  "assumes", // the claim is underwritten on this case obtaining
  "relevant_if_false", // if the claim is wrong, this is the case you land in
  "stress_case", // the case the claim is meant to survive
  "contradicted_by", // this case argues against the claim
] as const;
export type ScenarioRelation = (typeof SCENARIO_RELATIONS)[number];

export const SCENARIO_RELATION_LABELS: Record<ScenarioRelation, string> = {
  supports: "Supports",
  assumes: "Assumes",
  relevant_if_false: "Relevant if false",
  stress_case: "Stress case",
  contradicted_by: "Contradicted by",
};

/** The vocabulary is only useful if the user knows which word to pick. */
export const SCENARIO_RELATION_HINTS: Record<ScenarioRelation, string> = {
  supports: "This case is part of why the claim holds.",
  assumes: "The claim is underwritten on this case actually obtaining.",
  relevant_if_false: "If this claim turns out wrong, this is the case you land in.",
  stress_case: "The case the claim is meant to survive.",
  contradicted_by: "This case argues against the claim.",
};

export interface SnapshotRef {
  id: number;
}

export interface LinkStaleness {
  /** A newer snapshot exists for this deal than the one cited. */
  stale: boolean;
  newerCount: number;
  latestId: number | null;
  /** The cited snapshot is gone entirely — deleted, or never visible to this
   *  reader. Defensive: the row cascades away, so this only shows up for a list
   *  assembled across a delete. */
  missing: boolean;
}

/**
 * Whether a newer scenario run exists than the one a link cites.
 *
 * Compares ids rather than timestamps deliberately: `scenario_analyses.id` is a
 * serial, so it is monotonic by construction, while two runs created in the same
 * millisecond would need a tie-break that buys nothing. No clock is involved at
 * all — which is also why this can run server-side, where it belongs.
 */
export function linkStaleness(
  linkedSnapshotId: number,
  snapshots: readonly SnapshotRef[],
): LinkStaleness {
  if (snapshots.length === 0) {
    return { stale: false, newerCount: 0, latestId: null, missing: true };
  }
  const ids = snapshots.map((s) => s.id);
  const latestId = Math.max(...ids);
  const missing = !ids.includes(linkedSnapshotId);
  const newerCount = ids.filter((id) => id > linkedSnapshotId).length;
  return { stale: newerCount > 0, newerCount, latestId, missing };
}

/**
 * The one line shown against a stale link. Null when the citation is current.
 *
 * Tone matches the staleness hint ScenarioCards already shows for a snapshot
 * built from fewer assumptions than the deal now has: state the fact, state what
 * it means, do not nag.
 */
export function linkStalenessMessage(s: LinkStaleness): string | null {
  if (s.missing) return "The scenario run this cites is no longer on file.";
  if (!s.stale) return null;
  return (
    `Linked to an earlier scenario run — ${s.newerCount} newer since. ` +
    `The link still points at what was actually cited.`
  );
}
