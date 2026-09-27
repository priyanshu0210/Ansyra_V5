import { blocksAdvancement, type GateableAssumption } from "@contracts/assumption-gate";

// ─────────────────────────────────────────────────────────────────────────────
// The one sample deal the landing demonstrates with.
//
// B2 (the ledger) and B3 (the pipeline) MUST show the same rows. The pipeline's
// whole claim is that these four stages produced this ledger; if the two were
// fed from separate literals they would drift the first time someone edited one
// of them, and the page would be illustrating a deal that does not exist even
// as sample data.
//
// Shaped as contracts/assumption-gate.ts wants, so the blocked state is
// computed by the same predicate the server enforces rather than written down.
// ─────────────────────────────────────────────────────────────────────────────

export const SAMPLE_DEAL = {
  name: "Project Harrow",
  /** Shown wherever the sample appears. Claims discipline, not fine print. */
  disclaimer: "sample data",
  mandate: "Mid-market roll-up, industrial services. 4 targets screened, 1 in diligence.",
} as const;

export interface SampleRow extends GateableAssumption {
  /** The reviewer's written response, when there is one. */
  note?: string;
  /** Where the grounding came from. Only set where the model actually cited. */
  citation?: string;
}

export const SAMPLE_ROWS: SampleRow[] = [
  {
    assumption: "Sales headcount transfers at 95% retention.",
    result: { optimismScore: 91 },
    reviewerNote: null,
  },
  {
    assumption: "Procurement synergies land inside 12 months.",
    result: { optimismScore: 74 },
    reviewerNote: null,
  },
  {
    assumption: "Target's EBITDA margin is sustainable post-close.",
    result: { optimismScore: 38 },
    reviewerNote: "Reviewer checked the supplied earnings reconciliation.",
    note: "Reviewer checked the supplied earnings reconciliation.",
    citation: "Reviewer-supplied example: earnings reconciliation, page 3.",
  },
  // ── APPENDED, NEVER PREPENDED ───────────────────────────────────────────────
  // `GROUNDED_ROW` is `find(score < 50)` and `FLAGGED_ROW` is `SAMPLE_BLOCKED[0]`,
  // so both resolve to the FIRST match. Inserting above either one silently
  // re-points the pipeline's evidence panels at a different assumption — the
  // tests below would catch the grounded/flag mismatch but not the loss of the
  // citation, which is why this note is here rather than in a commit message.
  //
  // Exactly ONE row blocks, still. The closing answers "the" flagged assumption,
  // and a second blocker would make that sentence ambiguous. The 84 below is a
  // red flag that ALREADY carries a reviewer response, which is the more
  // interesting half of the mechanic: severity and blocking are not the same
  // thing, and one row can now show that without any copy explaining it.
  {
    assumption: "Two founder-led sites keep their key accounts through transition.",
    result: { optimismScore: 84, reviewHistory: [{ outcome: "risk_accepted", reason: "Both founders signed 24-month earn-outs. Accounts contracted to the entity.", evidence: "Fictional retention review, page 2", reviewedBy: "sample-reviewer", reviewedAt: "2026-09-01T09:00:00Z" }] },
    reviewerNote: "Both founders signed 24-month earn-outs. Accounts contracted to the entity.",
    note: "Both founders signed 24-month earn-outs. Accounts contracted to the entity.",
  },
  {
    assumption: "Customer concentration stays below 20% of revenue.",
    result: { optimismScore: 62 },
    reviewerNote: null,
  },
  {
    assumption: "Working capital normalises within two quarters of close.",
    result: { optimismScore: 45 },
    reviewerNote: "Matches the seller's own quarterly cycle for the last three years.",
    note: "Matches the seller's own quarterly cycle for the last three years.",
    citation: "Seller's audited working-capital cycle, FY2022 to FY2024.",
  },
];

/** Every row currently holding the sample deal back. Computed, never asserted. */
export const SAMPLE_BLOCKED = SAMPLE_ROWS.filter(blocksAdvancement);

/** The row each pipeline stage points at, so B3 shows B2's actual evidence. */
export const GROUNDED_ROW = SAMPLE_ROWS.find((r) => (r.result?.optimismScore ?? 0) < 50)!;
export const FLAGGED_ROW = SAMPLE_BLOCKED[0];

/**
 * The same red-flag row, once a second reviewer has actually answered it.
 *
 * This is the closing's artifact (B9), and it is deliberately the SAME
 * assumption the ledger blocks on rather than a new one. The page opens by
 * striking a claim, spends its middle showing an assumption that stops a deal,
 * and ends on that exact assumption answered. "Keep the record" is the argument;
 * this is the argument finishing.
 *
 * The score does not change, because answering a challenge does not make an
 * optimistic assumption less optimistic. What changes is that somebody wrote
 * down a response, which is the entire mechanic.
 */
export const ANSWERED_ROW: SampleRow = {
  ...FLAGGED_ROW,
  result: { ...FLAGGED_ROW.result, reviewHistory: [{ outcome: "resolved", reason: "Retention model revised using the two fictional carve-outs.", evidence: "Fictional underwriting memo, page 4", reviewedBy: "sample-reviewer", reviewedAt: "2026-09-01T09:00:00Z" }] },
  reviewerNote:
    "Retention modelled at 78% against the last two carve-outs. Underwriting revised.",
  note: "Retention modelled at 78% against the last two carve-outs. Underwriting revised.",
};

/** Computed, never asserted: the closing cannot claim a resolution the gate
 *  contract would not actually grant. */
export const ANSWERED_CLEARS = !blocksAdvancement(ANSWERED_ROW);
