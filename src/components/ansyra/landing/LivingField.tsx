import { Suspense, lazy, useEffect, useState } from "react";
import { useMotionPref } from "@/hooks/useMotionPref";
import { LazyBoundary } from "@/components/LazyBoundary";
import { CityField } from "./CityField";

// ─────────────────────────────────────────────────────────────────────────────
// The living field. The page-wide background, in two tiers.
//
// TIER 1 (this file, always on, no JS payload): drifting radial-gradient orbs
// and a slowly turning caustic sheet. Costs one paint and then animates purely
// on `transform`.
//
// TIER 2 (lazy): a WebGL canvas carrying a real refracting solid. It fades in
// OVER tier 1 once it has actually rendered a frame, so a slow or failed load
// is invisible rather than a blank rectangle. It never blocks first paint and
// never enters the landing's critical path — the bundle budget explicitly
// excludes a lazy WebGL chunk, and that is the only reason this is affordable.
//
// Why tiered at all: the reference this is modelled on ships a single WebGL
// canvas and nothing else, so on a machine that cannot run it the page has no
// background. Here the CSS tier IS the design; WebGL upgrades it.
// ─────────────────────────────────────────────────────────────────────────────

const GlassField = lazy(() => import("./webgl/GlassField"));

/** Cheap, honest capability probe. Deliberately conservative. */
function canRunWebGL(): boolean {
  if (typeof window === "undefined") return false;
  // Respect an explicit data-saving request before spending ~150kB and a GPU.
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return false;
  // deviceMemory is Chromium-only; absence is not evidence of a weak machine,
  // so only a REPORTED low value disqualifies.
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (typeof mem === "number" && mem < 4) return false;
  if (window.matchMedia?.("(max-width: 767px)").matches) return false;
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

export function LivingField() {
  const reduced = useMotionPref();
  const [wantsGl, setWantsGl] = useState(false);

  // Deferred to an idle callback: the point of the tier split is that first
  // paint never waits on this decision, let alone on the chunk it triggers.
  useEffect(() => {
    if (reduced) return; // the still composition is the CSS field alone
    let cancelled = false;
    const start = () => {
      if (!cancelled && canRunWebGL()) setWantsGl(true);
    };
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: object) => number })
      .requestIdleCallback;
    const id = ric ? ric(start, { timeout: 2500 }) : window.setTimeout(start, 1200);
    return () => {
      cancelled = true;
      if (!ric) window.clearTimeout(id as number);
    };
  }, [reduced]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* THE THREE DRIFTING ORBS ARE GONE (2026-08-18).
          They were tier 1's whole content before the beam existed: three big
          low-alpha radial gradients in prism, caustic and settle, drifting on
          long unequal cycles. With a single light source at the centre of the
          screen they stopped being ambience and started being contradictions —
          three more glows, each with its own colour, its own position and its
          own period, none of them agreeing with the beam about where the light
          in this scene comes from. On screen they read as smudges rather than
          as light.

          One source. The caustic sheet below still carries its banding across
          the whole page, and the beam is what the banding comes FROM, which is
          the relationship the orbs never had with anything.

          The local `drift()` helper went with them — it had no other caller and
          lint says so, which is the correct outcome: a helper kept alive for a
          hypothetical future user is dead code with a story attached.

          What is LEFT IN PLACE, deliberately, is the CSS: `--drift-opacity`,
          `--drift-ceiling`, `--drift-period` and the `ansyra-orb-*` keyframes.
          Those are the design system's vocabulary for ambient drift, they are
          documented in index.css as one of the four depth layers, and deleting
          a documented tier as a side effect of a visual change is how a token
          set quietly loses a concept. Retiring them is a separate decision from
          removing these three elements, and should be taken as one. */}

      {/* The caustic sheet. A wide, very low-alpha conic sweep: the banding a
          thick edge throws. Rotation only. Its origin is the same point the
          light comes from, so the banding and the source agree. */}
      <div
        className={reduced ? undefined : "ansyra-caustic-sheet"}
        style={{
          position: "absolute",
          inset: "-120%",
          background:
            "conic-gradient(from 210deg at 50% 50%, transparent 0deg, color-mix(in srgb, var(--prism) 12%, transparent) 42deg, transparent 96deg, color-mix(in srgb, var(--caustic) 10%, transparent) 190deg, transparent 250deg, color-mix(in srgb, var(--prism) 9%, transparent) 318deg, transparent 360deg)",
          opacity: 0.7,
        }}
      />

      {/* ── THE LIGHT ────────────────────────────────────────────────────────
          ONE radial, at the centre, fading out. That is the whole thing.

          It took three passes to get here and each one was the same mistake in
          a different costume: a separate RAY FAN drawn around the source. It
          was masked into a ring, which put a visible GAP between the light and
          its own rays — light does not restart 80px from the lamp — and out at
          that radius a conic's bands are too wide to read as rays at all. They
          read as drifting amber cloud, and they were what was still smudging
          the page after the orbs were deleted. Isolating each ground layer and
          screenshotting with it hidden is what finally pinned it on this.

          So there is no fan. A single smooth falloff has no gap to explain,
          because there is nothing to bridge.

          AND IT IS TEAL, NOT AMBER. `--caustic` is the warm half of the
          dispersion pair and it fought everything: the ground is green, the
          city is green, and a hot orange point in the middle of it read as a
          different system rather than as this one lit. `--prism` is the cool
          half and it is what the ground already is, one step brighter.
          `--caustic` still exists in the sheet's banding above, which is where
          a warm cast belongs — spread thin and off-centre, not as the source.

          SUBTLE, and the numbers are in `--beam-bloom` / `--beam-core`, gated
          by scripts/contrast.mjs against text that scrolls over them. At 8% and
          12% prism the worst pairing measures 6.25:1, so this is nowhere near
          the floor — it is quiet because it should be, not because it has to
          be. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: [
            // The centre, and the only part with any weight.
            "radial-gradient(circle 260px at 50% 50%, color-mix(in srgb, var(--prism) var(--beam-core), transparent), transparent 72%)",
            // The falloff, wide and faint, so the light has no edge anywhere.
            "radial-gradient(circle 760px at 50% 50%, color-mix(in srgb, var(--prism) var(--beam-bloom), transparent), transparent 78%)",
          ].join(", "),
        }}
      />

      {/* The city sits ABOVE the orbs and BELOW the glass solid: it is what the
          light falls on, and what the solid passes in front of. */}
      <CityField />

      {/* `!reduced` as well as `wantsGl`: the capability probe only runs once,
          so without it, switching to Still AFTER the chunk had loaded left the
          canvas mounted and still animating. Unmounting hands the composition
          back to the CSS field, which is already the designed still state.

          Note the deliberate deviation: a reduced-motion visitor does NOT get a
          statically-rendered strip. Downloading 127 kB of WebGL to draw one
          motionless frame spends the most bandwidth on the people who asked for
          the least, and the field beneath is a real composition, not a gap. */}
      {wantsGl && !reduced && (
        // Contained, and the degraded state is already the design: the CSS tier
        // below IS the field, and WebGL only upgrades it. So a chunk that never
        // arrives costs the page nothing — which is precisely why it must not be
        // allowed to reach the route boundary and blank it.
        <LazyBoundary label="WebGL glass field">
          <Suspense fallback={null}>
            <GlassField />
          </Suspense>
        </LazyBoundary>
      )}
    </div>
  );
}
