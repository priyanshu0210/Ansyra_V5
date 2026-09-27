// Geometry and thresholds for the luminance arc.
//
// Separate from Ground.tsx so that file only exports components (Fast Refresh
// degrades to a full reload otherwise), and so the values can be asserted
// without pulling React in.
//
// THE DEAD BAND IS GONE, and with it the reason this zone was 78vh tall.
//
// It used to crossfade a LIGHT ground to a DARK one, passing through a mid
// teal-grey where NEITHER text role cleared 4.5:1 (dark bottomed out at 4.02,
// light at 4.05). Nothing could be written there, so ~700px of the page — most
// of a viewport — had to stay deliberately empty.
//
// Both grounds in a theme now sit on the same side of the luminance divide:
// two pastels in light, two greens in dark. The text role never inverts, every
// point of the crossfade clears 4.5:1, and `scripts/contrast.mjs` sweeps the
// whole range to prove it. So the zone no longer protects anything; it is just
// the breath the ground change needs to read as a change. 78 -> 34.
//
// 34 -> 14 (second pass). 34vh still read as a hole: a third of a screen of
// gradient between the evidence index and the platform section, with the
// heading of the next section not yet visible. The ground change is a
// crossfade, not a journey — it needs enough scroll to register as deliberate
// and no more. At 14vh the next section's heading is already entering as the
// ground finishes turning, which is what makes it read as one movement instead
// of an interruption.

/** Last crossfade value at which dark text is still legible. */
export const ARC_TEXT_OUT = 0.6;
/** First crossfade value at which light text is legible. */
export const ARC_TEXT_IN = 0.7;
/** Zone progress at which text roles swap. Sits inside the empty band. */
export const ARC_FLIP_AT = 0.5;
/** Height of the empty passage, in viewport units. */
export const ARC_ZONE_VH = 14;

/**
 * Crossfade curve, as useTransform input/output pairs.
 *
 * Deliberately not linear: the middle is the unreadable band, so the mapping
 * accelerates through it. The ground spends about a tenth of the zone's scroll
 * crossing the band and the rest easing in and out of the two worlds.
 */
export const ARC_CURVE_IN = [0, ARC_FLIP_AT - 0.05, ARC_FLIP_AT, ARC_FLIP_AT + 0.05, 1];
export const ARC_CURVE_OUT = [0, ARC_TEXT_OUT, (ARC_TEXT_OUT + ARC_TEXT_IN) / 2, ARC_TEXT_IN, 1];

/** Which side of the arc a given zone progress puts us on. */
export function shouldBeDark(progress: number) {
  return progress >= ARC_FLIP_AT;
}
