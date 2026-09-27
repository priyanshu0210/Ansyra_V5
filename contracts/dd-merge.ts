// ─────────────────────────────────────────────────────────────────────────────
// DD tracker: workstreams + the AI-import MERGE RULE (Phase 15.5).
//
// The merge rule is the feature's whole integrity story, so it lives here as a
// pure function: given the tracker's current items and one dd_checklist analysis,
// decide what changes. THE INVARIANT: AI never overwrites a status a human set.
// It fills untouched items and appends an "AI:"-prefixed note; anything a person
// has already ruled on is left exactly as it is and counted as skipped.
// Unit-tested in contracts/dd-merge.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const DD_WORKSTREAMS = [
  "legal",
  "financial",
  "tax",
  "hr",
  "it",
  "commercial",
  "regulatory",
  "other",
] as const;
export type DdWorkstream = (typeof DD_WORKSTREAMS)[number];

export const DD_WORKSTREAM_LABELS: Record<DdWorkstream, string> = {
  legal: "Legal",
  financial: "Financial",
  tax: "Tax",
  hr: "HR & benefits",
  it: "IT & data",
  commercial: "Commercial",
  regulatory: "Regulatory",
  other: "Other",
};

export const DD_STATUSES = ["open", "requested", "received", "reviewed", "issue", "n_a"] as const;
export type DdStatus = (typeof DD_STATUSES)[number];

export const DD_STATUS_LABELS: Record<DdStatus, string> = {
  open: "Open",
  requested: "Requested",
  received: "Received",
  reviewed: "Reviewed",
  issue: "Issue",
  n_a: "N/A",
};

/** Default workstream for each of the 12 standard DD_CHECKLIST_ITEMS. */
export const DD_ITEM_WORKSTREAMS: Record<string, DdWorkstream> = {
  "Corporate structure & cap table": "legal",
  "Material contracts": "commercial",
  "Financial statements (3 years)": "financial",
  "Tax filings & liabilities": "tax",
  "IP ownership & licenses": "legal",
  "Employment agreements & benefits": "hr",
  "Litigation & disputes history": "legal",
  "Regulatory & compliance filings": "regulatory",
  "Real property & leases": "legal",
  "Insurance policies": "other",
  "Environmental liabilities": "regulatory",
  "Change-of-control / consent requirements": "legal",
};

export function workstreamFor(item: string): DdWorkstream {
  return DD_ITEM_WORKSTREAMS[item] ?? "other";
}

/** One row of the AI's dd_checklist analysis output. */
export interface DdAnalysisItem {
  item: string;
  status: string; // "present" | "missing" | "unclear" (AI vocabulary)
  note?: string;
}

/** The tracker rows the merge reads (only the fields it needs). */
export interface DdTrackerItem {
  id: number;
  item: string;
  status: DdStatus;
  note: string | null;
  manuallySet: boolean;
}

export interface DdMergePatch {
  id: number;
  status?: DdStatus;
  note?: string;
}

export interface DdMergeResult {
  patches: DdMergePatch[];
  filled: number;
  skippedManual: number;
  unmatched: string[]; // analysis items with no tracker row
}

/** AI verdict → tracker status. "missing" leaves the item open (nothing arrived). */
function statusFromAnalysis(aiStatus: string): DdStatus | null {
  switch (aiStatus.toLowerCase().trim()) {
    case "present":
      return "received";
    case "unclear":
      return "issue";
    case "missing":
      return null; // stays open — the gap IS the signal
    default:
      return null;
  }
}

/**
 * Merge one dd_checklist analysis into the tracker.
 *
 * Rules, in order:
 *  1. A tracker item whose status a human set (`manuallySet`) is NEVER restatused
 *     — it only gains the appended AI note, and counts as skippedManual.
 *  2. An untouched item takes the mapped status ("present"→received,
 *     "unclear"→issue, "missing"→no change) and the appended note.
 *  3. Notes are APPENDED with an "AI:" prefix, never replaced, so a human's note
 *     and the AI's observation coexist.
 *  4. Analysis rows with no matching tracker item are reported as `unmatched`
 *     (the caller decides whether to add them) — never silently dropped.
 */
export function mergeDdAnalysis(
  items: DdTrackerItem[],
  analysis: DdAnalysisItem[],
  today: string,
): DdMergeResult {
  const byItem = new Map(items.map((i) => [i.item.trim().toLowerCase(), i]));
  const patches: DdMergePatch[] = [];
  const unmatched: string[] = [];
  let filled = 0;
  let skippedManual = 0;

  for (const a of analysis) {
    const key = String(a.item ?? "").trim().toLowerCase();
    if (!key) continue;
    const row = byItem.get(key);
    if (!row) {
      unmatched.push(a.item);
      continue;
    }

    const aiNote = a.note?.trim();
    const appended = aiNote ? `AI (${today}): ${aiNote}` : undefined;
    const note = appended ? (row.note ? `${row.note}\n${appended}` : appended) : undefined;
    const mapped = statusFromAnalysis(a.status);

    if (row.manuallySet) {
      // Rule 1 — human wins. Note only.
      skippedManual++;
      if (note) patches.push({ id: row.id, note });
      continue;
    }

    const patch: DdMergePatch = { id: row.id };
    if (mapped && mapped !== row.status) patch.status = mapped;
    if (note) patch.note = note;
    if (patch.status !== undefined || patch.note !== undefined) {
      patches.push(patch);
      filled++;
    }
  }

  return { patches, filled, skippedManual, unmatched };
}

/** Progress across a set of items: anything not `open` counts as progressed. */
export function ddProgress(items: { status: DdStatus }[]): { done: number; total: number } {
  return {
    done: items.filter((i) => i.status !== "open").length,
    total: items.length,
  };
}
