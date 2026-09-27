import { RED_FLAG_OPTIMISM, blocksAdvancement, type GateableAssumption } from "@contracts/assumption-gate";

// ─────────────────────────────────────────────────────────────────────────────
// Severity, as ILLUMINATION.
//
// The landing claims the product lights an assumption by how badly it needs
// challenging. This module is what makes that claim literally true rather than
// a mockup: the thresholds come from contracts/assumption-gate.ts, the same
// module the server enforces the gate with, so the marketing surface cannot
// drift from the thing it is describing. The dashboard's own scoreTone() is
// still a separate copy; Phase D3 points it here and deletes it.
//
// WHY ILLUMINATION AND NOT JUST HUE.
// The audience skews heavily male finance, where red-green colour deficiency
// runs around 8%. Encoding severity in hue alone means roughly one reader in
// twelve cannot tell a red flag from a grounded assumption. So each band also
// carries a brightness and a backlight blur radius, both of which are
// hue-independent: a red flag is the SHARP BRIGHT one and a grounded assumption
// is the SOFT DIM one, whether or not you can separate the colours.
//
// That is the constitution's severity rule, and it is the reason the ledger's
// glow is not decoration. Text is never blurred; the light behind the row is.
// ─────────────────────────────────────────────────────────────────────────────

export type SeverityKey = "flag" | "watch" | "grounded";

export interface SeverityRead {
  key: SeverityKey;
  /** Shown next to the score. Matches the dashboard's wording exactly. */
  label: string;
  /** Ground-aware role token, not a fixed hue. See index.css. */
  color: string;
  /**
   * The same role solved for TEXT. `color` is tuned for the landing's backlit
   * ledger rows, where the contrast is asserted against the glow rather than
   * the panel; used as body text on the dashboard's dark card the three base
   * tokens measure 3.1-4.4:1 and two of them miss the 4.5:1 that 12px type
   * owes. These are the theme-varied cuts. Read this for any text or graphic
   * sitting directly on a surface.
   */
  textColor: string;
  /** 0..1. Drives backlight opacity and how lit the row reads. */
  illumination: number;
  /** px. Tight and hot for a flag, wide and soft for a grounded row. */
  backlightBlur: number;
}

/** Ceiling for backlight opacity. Asserted in scripts/contrast.mjs: text on
 *  glass over a backlight at this strength still clears AA. */
export const BACKLIGHT_CEILING = 0.22;

const READS: Record<SeverityKey, SeverityRead> = {
  flag: {
    key: "flag",
    label: "Red flag",
    color: "var(--sev-flag)",
    textColor: "var(--sev-flag-text)",
    illumination: 1,
    backlightBlur: 4,
  },
  watch: {
    key: "watch",
    label: "Watch",
    color: "var(--sev-watch)",
    textColor: "var(--sev-watch-text)",
    illumination: 0.55,
    backlightBlur: 14,
  },
  grounded: {
    key: "grounded",
    label: "Grounded",
    color: "var(--sev-grounded)",
    textColor: "var(--sev-grounded-text)",
    illumination: 0.25,
    backlightBlur: 28,
  },
};

/**
 * The band a score falls in.
 *
 * Thresholds mirror the gate contract rather than restating it: above
 * RED_FLAG_OPTIMISM is a flag, 50 and up is a watch, below that it is grounded.
 */
export function severityFor(score: number): SeverityRead {
  if (score > RED_FLAG_OPTIMISM) return READS.flag;
  if (score >= 50) return READS.watch;
  return READS.grounded;
}

/** Backlight opacity for a band, derived rather than hand-tuned per row. */
export function backlightOpacity(read: SeverityRead): number {
  return +(read.illumination * BACKLIGHT_CEILING).toFixed(3);
}

/** Re-exported so a caller needs one import to render a ledger and its gate. */
export { RED_FLAG_OPTIMISM, blocksAdvancement };
export type { GateableAssumption };
