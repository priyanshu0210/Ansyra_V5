import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useMotionPref } from "@/hooks/useMotionPref";
import { Logo } from "../Logo";

// ─────────────────────────────────────────────────────────────────────────────
// The opening. "Ansyra" resolves, travels to the nav, and hands the page over.
//
// THE WORDMARK RESOLVES THROUGH THE TYPEFACE, not through a blur or a fade.
// Redaction ships as a family of progressive halftone degradation levels, so
// the name can arrive genuinely out of resolution and sharpen into the clean
// cut. That is the whole design idea performed on the brand itself, and it
// satisfies the rule that text is never blurred (constitution §6): the letters
// are always crisp, they are just drawn at a coarser resolution first.
//
// IT MUST NOT COST LCP. The hero is fully rendered underneath the entire time —
// this is an overlay, never a gate. The largest text is painted on the first
// frame; the overlay merely sits over it for ~640ms. The hero's own content is
// held back by a CSS transition keyed off `data-intro`, not by conditional
// rendering, so nothing is missing from the DOM at any point.
//
// SKIPPABLE. Any scroll, key, or pointer press ends it immediately. An
// unskippable title sequence on a page someone visits twice is a toll booth.
// ─────────────────────────────────────────────────────────────────────────────

const RESOLVE_MS = 260; // degraded -> clean
const TRAVEL_MS = 380; // centre -> nav
const TOTAL_MS = RESOLVE_MS + TRAVEL_MS;

/**
 * Armed by the boot script in index.html, BEFORE first paint — not here.
 * React runs too late: by the time an effect fires, the hero has painted, so
 * hiding it from here produced a visible fade-out of the very thing the
 * sequence introduces. This component's job is only to END the sequence.
 */
function armedByBootScript() {
  return typeof document !== "undefined" && document.documentElement.dataset.intro === "running";
}

export function HeroIntro() {
  const reduced = useMotionPref();
  // Mirrors the pre-paint decision, so the first React render agrees with the
  // DOM the boot script already produced and nothing flips on hydration.
  const [phase, setPhase] = useState<"resolve" | "travel" | "done">(() =>
    armedByBootScript() ? "resolve" : "done",
  );
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase("done");
    document.documentElement.dataset.intro = "done";
  };

  useEffect(() => {
    // Not armed (reduced motion, a non-landing route, or the failsafe already
    // fired): release the page and render nothing.
    if (reduced || !armedByBootScript()) {
      document.documentElement.dataset.intro = "done";
      doneRef.current = true;
      // this is the failsafe that releases the landing when the intro is not armed
      // (reduced motion, a non-landing route, or the boot script already fired).
      // It must run after mount because it reads documentElement state the boot
      // script owns. Deriving it during render would re-couple the two.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("done");
      return;
    }

    const t1 = window.setTimeout(() => setPhase("travel"), RESOLVE_MS);
    const t2 = window.setTimeout(finish, TOTAL_MS);

    const skip = () => finish();
    window.addEventListener("wheel", skip, { passive: true, once: true });
    window.addEventListener("touchstart", skip, { passive: true, once: true });
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      // Never leave the page held back if this unmounts mid-flight.
      document.documentElement.dataset.intro = "done";
    };
  }, [reduced]);

  if (reduced || phase === "done") return null;

  const travelling = phase === "travel";

  return (
    <motion.div
      aria-hidden
      data-testid="hero-intro"
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: travelling ? 0 : 1 }}
      transition={{ duration: TRAVEL_MS / 1000, ease: [0.4, 0, 0.2, 1], delay: travelling ? 0.12 : 0 }}
    >
      <motion.div
        className="flex items-center gap-4"
        initial={{ scale: 1, x: 0, y: 0 }}
        animate={
          travelling
            ? // Lands where the nav lockup sits. Approximate rather than measured:
              // the overlay is already fading as it arrives, so the eye reads the
              // direction of travel, not the exact landing pixel.
              { scale: 0.3, x: "calc(-50vw + 11rem)", y: "calc(-50vh + 2.5rem)" }
            : { scale: 1, x: 0, y: 0 }
        }
        transition={{ duration: TRAVEL_MS / 1000, ease: [0.65, 0, 0.35, 1] }}
      >
        <Logo size={64} />
        <span
          className="font-display leading-none"
          style={{
            color: "var(--fg)",
            fontSize: "clamp(3rem, 9vw, 7rem)",
            fontWeight: 500,
            letterSpacing: "-0.03em",
            // The resolve. Coarse cut first, clean cut once it has landed.
            fontFamily: travelling ? "var(--font-display)" : "var(--font-struck)",
          }}
        >
          Ansyra
        </span>
      </motion.div>
    </motion.div>
  );
}
