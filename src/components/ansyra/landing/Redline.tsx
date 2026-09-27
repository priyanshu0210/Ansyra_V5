import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useMotionPref } from "@/hooks/useMotionPref";
import { BEAT, derive, type Phase } from "./redline-score";

// ─────────────────────────────────────────────────────────────────────────────
// B1. The redline.
//
// The page's focal moment, and the one piece of motion that runs on arrival
// rather than on scroll. A claim is struck and replaced while you watch.
//
// THE DISSOLVE IS TYPOGRAPHIC, NOT ALPHA.
// The brief called for the struck clause to fade to zero. It should not, for
// two reasons that both come from rules already in this system. Fading text out
// entirely leaves the reduced-motion version showing something the animated
// version does not (DESIGN.md: a fallback renders the SAME composition at
// rest), and a redline whose struck half has vanished is not a redline, it is
// just a sentence. Dimming instead of removing is no better: the constitution
// puts a 0.85 opacity floor under any text, and a legible strike at 0.3 is not
// available.
//
// So the clause dissolves by DEGRADING. It swaps from Redaction's clean cut to
// Redaction 50, a cut of the same family drawn with progressive halftone
// break-up. The typeface performs the loss of resolution at full opacity, which
// is the concept executed literally rather than approximated with a filter, and
// it is why this face was kept when the rest of the world changed.
//
// THE RULE IS AN ELEMENT, NOT text-decoration.
// The old strike rendered visibly jagged. `text-decoration: line-through` is
// drawn un-hinted at 1px, and it was being tinted through a color-mix on a
// serif at ~30px, which compounded it. Drawing it as a positioned element gives
// a crisp edge at any size and, unlike text-decoration, can be animated.
//
// FOUR CHANNELS, NOT HUE.
// Struck versus inserted is carried by the rule, the underline, the degraded
// versus clean cut, AND colour. Problem 6.7 (red/green alone) does not apply
// here even before the colours became ground-aware.
// ─────────────────────────────────────────────────────────────────────────────

export function Redline({ struck, inserted }: { struck: string; inserted: string }) {
  const reduced = useMotionPref();
  const [phase, setPhase] = useState<Phase>(0);

  // Runs on MOUNT, not on in-view.
  //
  // This was built with useInView first, which was the wrong instinct twice
  // over. The redline is the first thing in the first viewport: it is on screen
  // before any observer could report it, so the gate never earned its keep, it
  // only added a way for the sequence to never start. (It also cannot fire at
  // all in a headless preview, which is how the mistake surfaced.) An arrival
  // moment should be triggered by arrival.
  //
  // Deps are [reduced] and deliberately NOT [phase]. Including phase made the
  // effect re-run on its own first setState, and the cleanup that ran with it
  // cancelled the timers for the two beats that had not fired yet. The strike
  // drew and the sequence stopped dead, which read as a design choice rather
  // than a bug.
  useEffect(() => {
    if (reduced) return;
    const t = BEAT.rule + BEAT.hold;
    const timers = [
      setTimeout(() => setPhase(1), 0),
      setTimeout(() => setPhase(2), t),
      setTimeout(() => setPhase(3), t + BEAT.degrade),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  // Reduced motion lands on the finished revision immediately: rule drawn,
  // clause degraded, insertion written. The same composition, at rest.
  const { ruled, degraded, settled } = derive(phase, reduced);

  return (
    <div
      data-testid="redline"
      // The sequence is four states over ~1.1s and every one of them looks
      // plausible in a still. Exposing the phase is how it gets verified
      // without guessing from a screenshot.
      data-phase={reduced ? "reduced" : phase}
      // The left change-bar is gone with the centred layout. A margin rule is a
      // manuscript device: it only means anything when there IS a left margin
      // to sit in. Centred, it read as the block having failed to align.
      className="mt-8 text-center font-display"
      style={{
        fontSize: "var(--step-title)",
        lineHeight: 1.18,
        maxWidth: "22ch",
        marginInline: "auto",
      }}
    >
      <span className="relative inline-block" style={{ color: "var(--sev-flag-text)" }}>
        <span
          style={{
            // The degradation IS the dissolve. No filter, no opacity drop.
            fontFamily: degraded ? "var(--font-struck)" : "var(--font-display)",
          }}
        >
          {struck}
        </span>
        {/* The strike. transform-origin left so it draws the way a pen does. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-0"
          style={{
            top: "0.58em",
            height: 1.5,
            width: "100%",
            background: "currentColor",
            transformOrigin: "left center",
          }}
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: ruled ? 1 : 0 }}
          transition={{ duration: BEAT.rule / 1000, ease: [0.65, 0, 0.35, 1] }}
        />
      </span>

      <motion.span
        className="mt-1 block"
        style={{
          color: "var(--sev-grounded)",
          textDecoration: "underline",
          textUnderlineOffset: "0.18em",
          textDecorationThickness: 1,
          paddingBottom: "0.12em",
        }}
        initial={reduced ? false : { clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: settled ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
        transition={{ duration: BEAT.insert / 1000, ease: [0.16, 1, 0.3, 1] }}
      >
        {inserted}
      </motion.span>
    </div>
  );
}
