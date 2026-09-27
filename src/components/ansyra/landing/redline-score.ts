// The redline's score and its visible state, kept out of Redline.tsx so that
// file only exports components (Fast Refresh degrades to a full reload
// otherwise) and so the sequence can be asserted without pulling React in.

export type Phase = 0 | 1 | 2 | 3;

/** ms. Kept together so the sequence can be read as a score. */
export const BEAT = {
  rule: 720, // the strike draws
  hold: 240, // it sits, struck but intact
  degrade: 120, // then the cut breaks up
  insert: 720, // and the revision writes in
} as const;

/**
 * What is visible at a given phase.
 *
 * Pure and exported so the one rule that matters here can be asserted: the
 * reduced-motion state must equal the finished animated state. DESIGN.md calls
 * that load-bearing, and it is invisible in review, because a fallback that
 * quietly shows less looks completely fine on its own. It is only wrong next to
 * the thing it stands in for.
 */
export function derive(phase: Phase, reduced: boolean) {
  return {
    ruled: reduced || phase >= 1,
    degraded: reduced || phase >= 2,
    settled: reduced || phase >= 3,
  };
}
