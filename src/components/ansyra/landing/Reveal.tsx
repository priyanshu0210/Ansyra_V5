import { motion, type TargetAndTransition, type Transition } from "framer-motion";
import { useMotionPref } from "@/hooks/useMotionPref";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Scroll-linked entrances for the landing.
//
// The page previously ran ONE gesture (opacity 0->1, y 22->0, 0.8s, one curve)
// roughly thirty times. Motion that never varies stops reading as motion and
// starts reading as latency, so the vocabulary below is deliberately small but
// role-differentiated:
//
//   entrance  arriving content, confident deceleration
//   lift      supporting content, shorter travel, quicker
//   panel     a data panel comes up to brightness; it does not travel
//   resolve   display type arrives in the degraded cut and sharpens
//             (see ResolveType — this is a component, not a variant, because it
//             changes the TYPEFACE rather than animating a wrapper)
//
// `mask` is gone. It wiped display type in behind a clip-path, which was a
// generic entrance standing in for the thing this system actually specifies:
// text arriving in the degraded cut and resolving to the clean one. Two ways to
// reveal a headline is one too many, so the wipe was deleted rather than left
// as an alternative.
//
// Transform + opacity only (compositor-safe). Under reduced motion everything
// collapses to the resting composition.

const EASE_ENTRANCE = [0.16, 1, 0.3, 1] as const;

/** How long to wait for the observer to say ANYTHING before assuming it is
 *  broken and showing the content. A healthy observer answers in one frame. */
const OBSERVER_GRACE_MS = 1200;

/**
 * `whileInView`, but it can never leave content permanently invisible.
 *
 * framer's own `whileInView` pairs an `initial` of opacity 0 with an
 * IntersectionObserver it owns. If that observer never fires, the element stays
 * at opacity 0 forever — headings and CTAs are *invisible* rather than merely
 * unanimated. That is not hypothetical: the preview pane used to build this
 * page has a non-functional IntersectionObserver, and "Keep the record."
 * rendered clipped to two letters (docs/refraction-outstanding.md §1.3).
 *
 * So the observer is owned here instead, with two escape hatches:
 *   1. No IntersectionObserver in the environment at all -> show immediately.
 *   2. Observer exists but never reports -> show after a grace period.
 *
 * A working observer invokes its callback on `observe()` even when the target
 * is off-screen (reporting `isIntersecting: false`), so `reported` flips within
 * a frame in any real browser and the grace timer becomes a no-op. Content
 * below the fold therefore still waits for a real scroll, exactly as before.
 */
function useSafeInView(once: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  // Set when the element was revealed because FOCUS entered it rather than
  // because it scrolled into view. Like `degraded`, it renders at rest: an
  // element the browser has just focused must not then animate underneath the
  // reader who is looking for it.
  const [focused, setFocused] = useState(false);
  // `degraded` means we are showing this because the observer FAILED, not
  // because the element scrolled into view. It matters because the caller must
  // then render at rest instead of animating — see SafeReveal.
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      setDegraded(true);
      return;
    }

    let reported = false;
    const io = new IntersectionObserver(
      (entries) => {
        reported = true;
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            if (once) io.disconnect();
          } else if (!once) {
            setShown(false);
          }
        }
      },
      // Matches the viewport margin the old `whileInView` used.
      { rootMargin: "-12% 0px -12% 0px" },
    );
    io.observe(el);

    // The grace timer only runs while the document is VISIBLE.
    //
    // A hidden document (a link opened in a background tab, most commonly)
    // throttles IntersectionObserver and rAF together. Without this gate the
    // timer would fire during that throttle, mark the section degraded, and
    // permanently drop every entrance animation for anyone who opened the site
    // in a background tab. Waiting until the tab is actually looked at means
    // the observer has resumed and will report normally; the timer stays a last
    // resort for an observer that is genuinely broken in a visible document.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!reported) {
          setShown(true);
          setDegraded(true);
        }
      }, OBSERVER_GRACE_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") startTimer();
    };
    if (document.visibilityState === "visible") startTimer();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
    };
  }, [once]);

  /**
   * THE KEYBOARD ESCAPE HATCH.
   *
   * `rootMargin: -12%` means an element has to be properly inside the viewport
   * before it counts as arrived. Tab navigation does not respect that: the
   * browser scrolls a focused element only just far enough to be visible, which
   * routinely leaves it inside the 12% dead band. The observer says "not
   * intersecting", the wrapper stays at opacity 0, and the reader is now
   * focused on an INVISIBLE BUTTON.
   *
   * Measured, not theorised: tabbing the landing page put focus on the closing
   * "Request Access" CTA while its wrapper sat at opacity 0.
   *
   * Any Reveal reveals itself the moment focus lands inside it.
   */
  const revealForFocus = () => {
    setShown(true);
    setFocused(true);
  };

  return { ref, shown, degraded: degraded || focused, revealForFocus } as const;
}

export function Reveal({
  children,
  className,
  delay = 0,
  y = 22,
  variant = "entrance",
  once = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  variant?: "entrance" | "lift" | "panel";
  once?: boolean;
  style?: React.CSSProperties;
}) {
  const reduced = useMotionPref();

  // Under reduced motion the content renders AT REST, not faded out waiting for
  // a scroll trigger. Two reasons: DESIGN.md requires the reduced-motion page to
  // be the same composition at rest, and an initial opacity of 0 hides the whole
  // page if JS never runs. Content must be visible by default.
  if (reduced) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  // ENTRANCE BY ROLE, not one gesture repeated.
  //
  // The rework's own diagnosis of the previous design was that it "ran ONE
  // gesture roughly thirty times", and three variants were written to fix it —
  // then the default was used almost everywhere anyway. What a thing IS should
  // decide how it arrives:
  //
  //   entrance  arriving content, confident deceleration
  //   lift      supporting content, shorter travel, quicker
  //   panel     a DATA panel. It does not travel; it comes up to brightness,
  //             because the thing it contains is a reading, and a reading
  //             appearing is illumination rather than movement. This is the
  //             same grammar the ledger and the pipeline already use.
  //
  // Display type does not appear here at all: it resolves through the
  // typeface's degradation cuts (see SectionHeading), which is what DESIGN.md
  // specifies and what a clip-path wipe was standing in for.
  const isPanel = variant === "panel";
  const travel = isPanel ? 0 : variant === "lift" ? Math.round(y * 0.5) : y;
  const duration = isPanel ? 0.62 : variant === "lift" ? 0.5 : 0.7;

  return (
    <SafeReveal
      className={className}
      style={style}
      once={once}
      hidden={isPanel ? { opacity: 0, scale: 0.985 } : { opacity: 0, y: travel }}
      visible={isPanel ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration, ease: EASE_ENTRANCE, delay }}
    >
      {children}
    </SafeReveal>
  );
}

/** Shared shell: owns the safe observer and drives `animate` explicitly rather
 *  than handing visibility to `whileInView`. */
function SafeReveal({
  children,
  className,
  style,
  once,
  hidden,
  visible,
  transition,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  once: boolean;
  hidden: TargetAndTransition;
  visible: TargetAndTransition;
  transition: Transition;
}) {
  const { ref, shown, degraded, revealForFocus } = useSafeInView(once);

  // Degraded: the observer never reported (or focus arrived first), so we are
  // revealing defensively.
  // This MUST NOT go through framer, because reaching the visible state via
  // `animate` would make visibility depend on the animation loop actually
  // running — and the environments where the observer is dead are usually the
  // same ones where rAF is starved (a backgrounded or hidden document throttles
  // both). A plain div at rest is visible with no engine involved.
  if (degraded) {
    return (
      <div ref={ref} className={className} style={style} onFocusCapture={revealForFocus}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      onFocusCapture={revealForFocus}
      className={className}
      style={style}
      initial={hidden}
      animate={shown ? visible : hidden}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

/** Section heading. The headline carries the section; no eyebrows or kickers. */
export function SectionHeading({
  title,
  lede,
  align = "center",
}: {
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
}) {
  const reduced = useMotionPref();
  const { ref, shown, revealForFocus } = useSafeInView(true);
  // DISPLAY TYPE RESOLVES, IT DOES NOT WIPE.
  //
  // This used to be a clip-path reveal. DESIGN.md is explicit that "text arrives
  // set in the degraded cut and resolves to the clean one" — that is the whole
  // argument for keeping this typeface, and a wipe was a generic stand-in for
  // it. Redaction 50 is a real halftone-degraded cut of the same face, so the
  // letters are never blurred (constitution §6) and never move; they come into
  // resolution. It is also the same gesture the Redline, the Pipeline and the
  // EvidenceLens already use, so the page has one idea about arriving instead
  // of four.
  const resolved = reduced || shown;

  return (
    <div
      ref={ref}
      className={align === "center" ? "text-center" : undefined}
      onFocusCapture={revealForFocus}
    >
      <h2
        className="text-balance font-display font-light leading-[1.08]"
        style={{
          color: "var(--fg)",
          fontSize: "var(--step-title)",
          letterSpacing: "-0.018em",
          maxWidth: "20ch",
          marginInline: align === "center" ? "auto" : undefined,
          fontFamily: resolved ? "var(--font-display)" : "var(--font-struck)",
          // A tiny settle so resolving reads as arriving rather than as a
          // font swapping. Opacity only; the glyphs hold their position.
          opacity: resolved ? 1 : 0.9,
          transition: reduced ? undefined : "opacity 420ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {title}
      </h2>
      {lede && (
        <Reveal variant="lift" delay={0.12}>
          <p
            className="mt-5 text-pretty font-sans leading-[1.7]"
            style={{
              color: "var(--fg-2)",
              fontSize: "var(--step-sm)",
              // 62ch of 15px sans is ~95 visual characters, which is a wall.
              // 54ch is a comfortable editorial measure at this size.
              maxWidth: "54ch",
              marginInline: align === "center" ? "auto" : undefined,
            }}
          >
            {lede}
          </p>
        </Reveal>
      )}
    </div>
  );
}

/**
 * Display type arriving through the typeface's own degradation cuts.
 *
 * Replaces `MaskReveal`, which wiped the headline in behind a clip-path. The
 * wipe was a generic entrance standing in for the thing this design system
 * actually specifies: "text arrives set in the degraded cut and resolves to the
 * clean one". Redaction 50 is a real halftone-degraded cut of the same family,
 * so the glyphs never blur (constitution §6 forbids blurring text) and never
 * move — they come into resolution, which is the concept performed rather than
 * illustrated.
 *
 * It sets `fontFamily` on a wrapper, so the child must NOT hard-set its own
 * font-family or it will win. Every call site uses `font-display`, which is a
 * class on the child, so the inline style here is applied to the child through
 * the `[data-resolve]` rule in index.css instead of relying on inheritance.
 */
export function ResolveType({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useMotionPref();
  const { ref, shown, revealForFocus } = useSafeInView(true);
  const resolved = reduced || shown;
  return (
    <div
      ref={ref}
      className={className}
      onFocusCapture={revealForFocus}
      data-resolve={resolved ? "1" : "0"}
      style={{
        opacity: resolved ? 1 : 0.9,
        transition: reduced ? undefined : "opacity 420ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {children}
    </div>
  );
}
