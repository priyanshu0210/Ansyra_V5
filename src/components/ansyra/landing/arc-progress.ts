// ─────────────────────────────────────────────────────────────────────────────
// The arc's progress, published for the WebGL field to read.
//
// WHY A MODULE-LEVEL NUMBER AND NOT CONTEXT OR A PROP.
//
// The reader is `GlassField`'s rAF loop, which is not a React render — it runs
// sixty times a second outside the component tree and already reads
// `window.scrollY` the same way. Routing this through context would mean a React
// re-render per frame to move a value that no component displays.
//
// It is also why this is not a second scroll listener: `Ground` is ALREADY
// subscribed to this scroll range for the ground crossfade, so this is a
// publication of work being done anyway. `docs/constitution.md` §6 bans
// `addEventListener("scroll")` and nothing here adds one.
//
// The default of 0 matters: if `Ground` never mounts (any route that is not the
// landing), the field simply behaves as though the arc has not started, which
// is its resting composition.
// ─────────────────────────────────────────────────────────────────────────────

let progress = 0;

/** Called by Ground's existing arc subscription. 0 before the zone, 1 after. */
export function setArcProgress(v: number) {
  progress = v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Read from the render loop. Never triggers a React update. */
export function getArcProgress(): number {
  return progress;
}
