import { useEffect, useState, type RefObject } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useMotionPref } from "@/hooks/useMotionPref";
import { ARC_CURVE_IN, ARC_CURVE_OUT, ARC_ZONE_VH, shouldBeDark } from "./arc";
import { LivingField } from "./LivingField";
import { setArcProgress } from "./arc-progress";

// ─────────────────────────────────────────────────────────────────────────────
// The luminance arc.
//
// Light is the world before clarity. Dark is the instrument working. The page
// crosses from one to the other ONCE, on scroll, and never crosses back: the
// closing section sits on its own opaque light block layered over this, so the
// arc itself stays a single one-way movement.
//
// WHY TWO FIXED LAYERS AND NOT AN ANIMATED background-color:
// animating a colour on a full-viewport element is a full-screen repaint every
// scroll frame. Two stacked fixed layers crossfaded on `opacity` is
// compositor-only and costs nothing. It is also the same technique the card
// resolves and the hero recede use, so it is one pattern used three times
// rather than a special case.
//
// THE DEAD BAND (the reason the transition zone is empty):
// sweeping the crossfade shows that between roughly 0.62 and 0.68 the ground is
// a mid teal-grey where NEITHER text role clears 4.5:1 (dark text bottoms out
// at 4.02, light at 4.05). That is inherent to crossfading a light ground to a
// dark one and cannot be tuned away. So the transition zone carries no text at
// all, and the curve below spends as little scroll as possible inside the band.
// `scripts/contrast.mjs` asserts the two boundaries; if this file's numbers
// change, that gate fails.
//
// WHY ONE SCROLL PROGRESS AND NOT AN IntersectionObserver:
// the switch was first built on IO and was wrong twice, for the same underlying
// reason both times. IO reports *changes in intersection*, and "has this point
// passed the viewport centre" is a continuous question. Observing the whole
// zone against a collapsed root reports it as intersecting for the entire
// crossing, so the callback fires on enter and exit but never in the middle;
// shrinking the target to a 1px mark fixes that but then a jump-scroll skips
// past the line inside one frame and never intersects at all. The crossfade
// already needs continuous progress, so the switch reads the same value. One
// source of truth, and it cannot disagree with the layer it is supposed to
// describe.
// ─────────────────────────────────────────────────────────────────────────────

export function LuminanceArc({ zoneRef }: { zoneRef: RefObject<HTMLElement | null> }) {
  const reduced = useMotionPref();
  const [dark, setDark] = useState(false);

  const { scrollYProgress } = useScroll({
    target: zoneRef,
    offset: ["start end", "end start"],
  });

  const darkness = useTransform(scrollYProgress, ARC_CURVE_IN, ARC_CURVE_OUT);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setDark((was) => (shouldBeDark(p) === was ? was : !was));
    // Published for the WebGL field, which uses this stretch as the moment the
    // Möbius closes. Same subscription, no second scroll listener, and no React
    // render: see arc-progress.ts.
    setArcProgress(p);
  });

  // Written in an effect, not during render: this mutates the DOM outside
  // React's tree, and the cleanup has to remove it, or every other route
  // inherits whichever ground the landing happened to end on.
  useEffect(() => {
    document.documentElement.dataset.ground = dark ? "dark" : "light";
  }, [dark]);

  useEffect(
    () => () => {
      delete document.documentElement.dataset.ground;
    },
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      {/* L0 light. Always painted; the dark layer rides over it. */}
      <div className="absolute inset-0" style={{ background: "var(--clear)" }} />
      {/* L0 dark. Depth falloff is a gradient so the ground has a floor rather
          than reading as a flat swatch: --medium at the top, --medium-deep at
          the bottom, which is what looking further into glass actually does.

          REDUCED MOTION: the arc still HAPPENS, it just stops scrubbing. An
          earlier version pinned this to 0, which left the whole page light and
          quietly shipped a different composition to anyone with the setting on.
          DESIGN.md is explicit that a reduced-motion fallback is the same
          composition at rest, never a lesser artifact, and a luminance arc is
          composition, not motion. So it cuts on the same boundary instead. */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, var(--medium) 0%, var(--medium) 38%, var(--medium-deep) 100%)",
          // Reduced motion CUTS. It does not fade, and the missing transition
          // here is deliberate twice over. It is what "the same composition at
          // rest" means. And a fade re-creates the dead band in TIME: on an
          // instant jump (an anchor link, a back-nav scroll restore, skip-to-
          // content) the text is already on screen in its final colour while
          // the ground is still mid-crossfade, which is the exact unreadable
          // pairing the empty zone exists to prevent. Caught in verification,
          // where a jump-scroll left light text sitting on a mid teal-grey.
          ...(reduced ? { opacity: dark ? 1 : 0 } : { opacity: darkness }),
        }}
      />
      {/* The living field sits ON the ground, above both colour layers and
          below every section. It is the answer to a page whose background only
          ever changed because the reader scrolled: the ground colour is still
          the arc, but the light moving across it is not tied to scroll at all.
          Ambient light belongs to the ground and never to an element
          (constitution §4), which is exactly where it is. */}
      <LivingField />
    </div>
  );
}

/**
 * `data-ground` on `<html>` is what the roles key off: components name a ROLE
 * (`--fg`, `--fg-2`, `--fg-rule`, `--sev-*`) and the role re-points under
 * `[data-ground="dark"]`. That is why the arc is one attribute flip rather than
 * 200 animated colour properties.
 *
 * The flip is instant, which is required rather than merely tolerated: it
 * happens inside the empty transition zone, where no text is on screen to be
 * caught mid-change. It is set on `<html>` so the fixed header, a sibling of
 * `<main>`, inherits it too.
 */

/**
 * The empty passage between the two worlds.
 *
 * This is not spacing. It is the only stretch of the page allowed to carry
 * nothing, and it carries nothing for a measured reason: the ground is
 * unreadable while it crosses. Shortening it puts section copy back inside the
 * dead band, which is why the height is asserted in Ground.test.ts.
 */
export function ArcZone({ zoneRef }: { zoneRef: (node: HTMLDivElement | null) => void }) {
  return (
    <div
      ref={zoneRef}
      aria-hidden
      data-testid="arc-zone"
      className="pointer-events-none w-full"
      /* Inline, not a Tailwind arbitrary value. This height is load-bearing
         rather than cosmetic, so it should not silently become 0 if a JIT scan
         misses the file. It did exactly that once. */
      style={{ height: `${ARC_ZONE_VH}vh` }}
    />
  );
}
