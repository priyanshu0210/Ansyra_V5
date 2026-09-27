import { Icon } from "@/components/ansyra/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useMotionPref } from "@/hooks/useMotionPref";
import { CATEGORIES, toolsInCategory, type CategoryId } from "@/lib/landing-content";
import { MovementPlate } from "./MovementPlate";

// ─────────────────────────────────────────────────────────────────────────────
// The platform section: one page per movement, scrolled through vertically.
//
// This replaces a pinned card stack AND the flat list that used to sit under
// it. Those two were the same eleven instruments told twice — the stack showed
// five of them properly, the list reached all eleven, and the section read as
// two unrelated things on top of each other.
//
// PAGED PARALLAX, HORIZONTAL, DRIVEN BY VERTICAL SCROLL.
//
// The reference carousel advances when you drag sideways. That is the wrong
// input for a page you are already reading top to bottom: it asks the reader to
// change hands mid-argument, and on a trackpad it fights the page scroll. So
// the CARDS are horizontal, as the reference has them, and the INPUT stays the
// scroll wheel. Scrolling down carries the next panel in from the right; the
// current one leaves to the left.
//
// EACH PANEL HOLDS STILL FOR MOST OF ITS SEGMENT. A linear map from scroll to
// x means nothing is ever at rest, and these panels carry seven instrument
// links between them — a list that never stops moving is a list nobody reads.
// `hold()` below spends ~40% of each segment travelling and the rest parked.
//
// Within a panel the layers travel at different speeds, so they converge as it
// arrives and separate as it leaves, which is what gives a flat page depth.
//
// ONE SOURCE OF CONTENT, TWO PRESENTATIONS.
// `MovementPage` is rendered by both paths. That is deliberate and it is the
// thing most likely to be "simplified" later: rendering the animated and static
// versions as separate markup is how this section previously shipped every
// instrument link TWICE in one state and once in the other. Route parity is
// non-negotiable, so there is exactly one place the links are written.
// ─────────────────────────────────────────────────────────────────────────────

/** Reactive `min-width` test. The parallax pins ~400vh, which is a hostage
 *  situation on a phone, so small screens get the static reading instead. */
function useMinWidth(px: number) {
  const [ok, setOk] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia(`(min-width:${px}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width:${px}px)`);
    const on = () => setOk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [px]);
  return ok;
}

/** Layer speeds. 1 travels with the panel; below recedes, above leads.
 *
 *  DAMPED FOR THE HORIZONTAL AXIS. These were 0.72 / 1.22, tuned when the
 *  panels travelled vertically — where a 22% divergence is 22% of a column's
 *  height and stays on screen. Horizontally it is 22% of the VIEWPORT WIDTH,
 *  which threw the instrument column clean off the right edge mid-transition
 *  and clipped four live links. Same depth cue, an amount the frame can hold. */
const SPEED = { numeral: 0.9, prose: 1, instruments: 1.1 } as const;

/** Fraction of each segment spent moving. The rest is dwell.
 *  0.6 travelling / 0.4 parked: low enough that a panel visibly settles,
 *  high enough that the reader never feels the scroll has stopped working. */
const TRAVEL = 0.6;

/**
 * Segment-wise ease: linear progress in, held-then-moved progress out.
 *
 * Splits the travel into `pages - 1` segments and, inside each one, keeps the
 * value pinned to the segment start for the first `1 - TRAVEL` of it before
 * running to the next integer on a smoothstep. The result is a carousel that
 * arrives, sits still long enough to be read, and then moves on — from ONE
 * scroll value, so every panel and every depth layer stays locked together.
 */
function hold(v: number, segments: number) {
  const scaled = Math.min(Math.max(v, 0), 1) * segments;
  const i = Math.min(Math.floor(scaled), segments - 1);
  const within = scaled - i;
  const dwell = 1 - TRAVEL;
  if (within <= dwell) return i;
  const t = (within - dwell) / TRAVEL;
  return i + t * t * (3 - 2 * t); // smoothstep: no corner at either end
}

export function InstrumentPages() {
  const reduced = useMotionPref();
  const desktop = useMinWidth(768);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackEl, setTrackEl] = useState<HTMLDivElement | null>(null);
  // Mount-late: useScroll({target}) measures once and never re-measures a ref
  // that was null on the first render.
  const attach = useCallback((node: HTMLDivElement | null) => {
    trackRef.current = node;
    setTrackEl(node);
  }, []);

  const animated = !reduced && desktop;

  if (!animated) {
    return (
      <div className="w-full">
        {CATEGORIES.map((c) => (
          <section key={c.id} data-testid={`instrument-group-${c.id}`} className="mt-16 first:mt-0">
            <MovementPage id={c.id} n={c.n} label={c.label} thesis={c.thesis} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={attach}
      className="relative w-full"
      style={{ height: `${CATEGORIES.length * 100}vh` }}
    >
      <div className="sticky top-0 h-[100dvh] overflow-hidden">
        {trackEl ? <Pages trackRef={trackRef} /> : null}
      </div>
    </div>
  );
}

function Pages({ trackRef }: { trackRef: React.RefObject<HTMLDivElement | null> }) {
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  /**
   * Put panel `index` on screen by moving the SCROLL, not the panel.
   *
   * The panels have no position of their own: they are a pure function of
   * scroll. So "show me panel 3" can only mean "scroll to where panel 3 is
   * centred", and computing that is the inverse of `hold()`. Panel `i` holds
   * still while `v * segments` is inside `[i, i + dwell]`, so the middle of its
   * dwell is `(i + dwell/2) / segments`. The last panel is the exception: it is
   * centred at the very end of the travel.
   *
   * Instant, not smooth. `scroll-behavior: smooth` is set globally, and a
   * focus-driven smooth scroll means the element the browser just focused
   * travels across the screen while the reader is looking for it.
   */
  const revealPanel = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      const segments = CATEGORIES.length - 1;
      const dwell = 1 - TRAVEL;
      const p = index >= segments ? 1 : (index + dwell / 2) / segments;
      const top = track.getBoundingClientRect().top + window.scrollY;
      const range = Math.max(0, track.offsetHeight - window.innerHeight);
      window.scrollTo({ top: top + p * range, behavior: "instant" });
    },
    [trackRef],
  );

  return (
    <>
      {CATEGORIES.map((c, i) => (
        <ParallaxPage key={c.id} index={i} progress={scrollYProgress} onReveal={revealPanel}>
          {(offset: MotionValue<number>) => (
            <MovementPage id={c.id} n={c.n} label={c.label} thesis={c.thesis} offset={offset} />
          )}
        </ParallaxPage>
      ))}
    </>
  );
}

/**
 * One page, positioned by scroll.
 *
 * `y = (index - page) * 100%` puts page `i` dead centre exactly when the track
 * has scrolled `i` pages, and one viewport away per page either side. Because
 * every layer multiplies the SAME expression by its own speed, they all reach
 * zero together at centre and only diverge off-centre — which is the difference
 * between parallax and layers that drift apart and never line up.
 */
function ParallaxPage({
  index,
  progress,
  onReveal,
  children,
}: {
  index: number;
  progress: MotionValue<number>;
  onReveal: (index: number) => void;
  children: React.ReactNode | ((offset: MotionValue<number>) => React.ReactNode);
}) {
  const pages = CATEGORIES.length;
  // How many panels away this one is, signed. Everything else derives from it.
  // `hold` is applied HERE, once, rather than per layer: every derived value
  // reads the same eased position, so the panels can never drift apart.
  const offset = useTransform(progress, (v) => index - hold(v, pages - 1));
  const x = useTransform(offset, (v) => `${v * 100}%`);
  // The outgoing panel recedes rather than sliding flatly off. Symmetric in
  // `offset`, so arriving and leaving are the same gesture reversed.
  const scale = useTransform(offset, [-1, 0, 1], [0.94, 1, 0.94], { clamp: true });
  // Only the page near centre is readable; the rest fade rather than stack up
  // as ghosts behind the live one.
  //
  // Derived from `offset` (pages from centre), NOT from raw progress. Mapping
  // progress directly produced an input range of [-0.28, 0, 0.28] for the first
  // page and [0.72, 1, 1.28] for the last — framer hands those to the Web
  // Animations API, which rejects offsets outside [0,1], and the whole section
  // threw on mount and rendered nothing. Offset is symmetric around zero for
  // every page, so one range works for all of them.
  const opacity = useTransform(offset, [-0.75, 0, 0.75], [0, 1, 0], { clamp: true });

  // FOCUS MOVES THE SCROLL, RATHER THAN THE PANELS LEAVING THE TAB ORDER.
  //
  // These panels carry seven `/platform/:slug` links between them, and they are
  // a pure function of scroll position. Two wrong answers were tried first:
  //
  //   1. Leave them focusable. A keyboard user tabs into a link inside a panel
  //      that is off-screen at opacity 0, and focus vanishes with no way to
  //      tell where it went.
  //   2. Mark off-centre panels `inert`. That fixes (1) and creates a worse
  //      problem: tabbing out of the visible panel jumps clean past the pinned
  //      section, so three quarters of the instrument links become unreachable
  //      by keyboard entirely. Route parity counts links in the DOM, so every
  //      test still passed while the section quietly became pointer-only.
  //
  // So the panels stay in the tab order and focus DRIVES THE SCROLL: tab into a
  // panel that is not centred and the page moves to it, which is the same thing
  // the pointer user's scroll wheel does. Focus always lands somewhere visible,
  // and every link stays reachable.
  //
  // `pointerEvents` still goes off when the panel is not centred, because a
  // MOUSE landing on an invisible link is a different bug with no such excuse.
  const [live, setLive] = useState(() => index === 0);
  useMotionValueEvent(offset, "change", (v) => {
    const next = Math.abs(v) < 0.5;
    setLive((was) => (was === next ? was : next));
  });

  return (
    <motion.div
      className="absolute inset-0"
      style={{ x, scale, opacity, pointerEvents: live ? "auto" : "none" }}
      onFocusCapture={() => {
        if (!live) onReveal(index);
      }}
    >
      {typeof children === "function" ? (children as (o: MotionValue<number>) => React.ReactNode)(offset) : children}
    </motion.div>
  );
}

/**
 * The content of one movement. The ONLY place instrument links are written.
 * Both the parallax and the static path render this, so the eleven
 * `/platform/:slug` routes appear exactly once in either state.
 */
function MovementPage({
  id,
  n,
  label,
  thesis,
  offset,
}: {
  id: CategoryId;
  n: string;
  label: string;
  thesis: string;
  /** Pages away from centre. Absent on the static path. */
  offset?: MotionValue<number>;
}) {
  const tools = toolsInCategory(id);

  // Hooks run unconditionally — the static path simply ignores the result.
  // Same pattern as Movements.tsx; a conditional hook here would change hook
  // order between the two render paths and crash on the first resize.
  const fallback = useMotionValue(0);
  const src = offset ?? fallback;
  // RELATIVE to the page's own travel, so a speed of 1 means "no extra
  // movement". Layers converge at centre and separate either side, which is
  // what reads as depth rather than as drift.
  const xNumeral = useTransform(src, (v) => `${v * 100 * (SPEED.numeral - 1)}%`);
  const xTools = useTransform(src, (v) => `${v * 100 * (SPEED.instruments - 1)}%`);
  const depth = offset ? { numeral: { x: xNumeral }, tools: { x: xTools } } : { numeral: {}, tools: {} };
  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col justify-center px-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-14">
        <motion.div className="lg:col-span-5" style={depth.numeral}>
          <span
            className="block font-display tabular-nums"
            style={{
              color: "var(--fg-2)",
              fontSize: "var(--step-display)",
              lineHeight: 0.9,
              opacity: 0.35,
            }}
          >
            {n}
          </span>
          <h3
            className="mt-4 text-balance font-display"
            style={{ color: "var(--fg)", fontSize: "var(--step-title)", lineHeight: 1.08 }}
          >
            {label}
          </h3>
          <p
            className="mt-5 text-pretty font-sans"
            style={{
              color: "var(--fg-2)",
              fontSize: "var(--step-body)",
              lineHeight: 1.6,
              maxWidth: "46ch",
            }}
          >
            {thesis}
          </p>

          {/* The plate closes the left column. Placed AFTER the prose, not
              between the numeral and its label — inserted there it split the
              two apart and pushed the heading down a third of the viewport.
              It rides the numeral layer, so it recedes at the same rate; an
              image travelling at the text's speed would read as a sticker. */}
          <div className="mt-8 max-w-[190px] opacity-90">
            <MovementPlate id={id} />
          </div>
        </motion.div>

        <motion.ul className="flex flex-col gap-3 lg:col-span-7" style={depth.tools}>
          {tools.map((t) => (
            <li key={t.slug}>
              <Link
                to={`/platform/${t.slug}`}
                data-testid={`instrument-${t.slug}`}
                className="ansyra-instrument group flex items-baseline gap-4 border-b py-4"
                style={{ borderColor: "var(--fg-rule)" }}
              >
                <span className="ansyra-index tabular-nums">{t.n}</span>
                <span className="flex-1">
                  <span
                    className="block font-display"
                    style={{ color: "var(--fg)", fontSize: "var(--step-md)", lineHeight: 1.2 }}
                  >
                    {t.name.replace("™", "")}
                  </span>
                  <span
                    className="mt-1 block text-pretty font-sans"
                    style={{
                      color: "var(--fg-2)",
                      fontSize: "var(--step-sm)",
                      lineHeight: 1.5,
                      maxWidth: "52ch",
                    }}
                  >
                    {t.tagline}
                  </span>
                </span>
                <Icon name="arrow" size={15} />
              </Link>
            </li>
          ))}
        </motion.ul>
      </div>
    </div>
  );
}
