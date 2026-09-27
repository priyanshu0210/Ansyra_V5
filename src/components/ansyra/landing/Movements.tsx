import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useMotionPref } from "@/hooks/useMotionPref";
import { CATEGORIES, toolsInCategory, type CategoryId } from "@/lib/landing-content";
import { MovementLoop } from "./loops/MovementLoop";

// ─────────────────────────────────────────────────────────────────────────────
// B5. The four movements, at the scale they were always meant to be.
//
// WHAT THIS REPLACES: a `lg:grid-cols-4` row of ~300px cards inside a section
// that was mostly air. Four small cards in a big empty band is the layout that
// says "these are minor" about the four things the whole product is organised
// around. They now own the viewport.
//
// THE EXPANSION IS A CLIP, NOT A WIDTH.
//
// The reference (Flora) widens the hovered card and squeezes its neighbours.
// Done literally that is `width` or `flex-basis` animating on four siblings —
// a layout pass every frame, which DESIGN.md and constitution §6 forbid
// outright, and which is exactly the kind of thing that looks fine on this
// machine and stutters on the reader's.
//
// So every card is laid out ONCE at its EXPANDED width and then clipped back
// to its allotted slice. Widening is `clip-path` opening; the neighbours moving
// aside is `translate3d`. Both are compositor-only, both are on the permitted
// list, and the effect is indistinguishable from the layout version.
//
// It also buys something the layout version does not: because the card is
// really that wide, the loop behind it is really that wide too. Hovering does
// not stretch an image, it UNCOVERS more of one. That is what the reference
// actually looks like, and it is only possible because the box never resized.
//
// NOT PINNED, and not clickable. Two pins already exist further down and a
// third this close to the top would teach the reader that scrolling is
// unreliable before they have read anything. The cards are presentational: the
// instruments each movement names are real links in the platform section, and
// a card-shaped thing whose entire payload is "scroll down a bit" spends an
// affordance on nothing.
// ─────────────────────────────────────────────────────────────────────────────

/** Gap between cards, px. */
const GAP = 18;
/** How much wider the hovered card gets, as a multiple of its resting width. */
const EXPAND = 2.05;

/** Depth layer per card for the scroll entrance: how far back it starts and how
 *  much it travels. Deliberately uneven, so the deal reads as a hand fanning
 *  rather than four things doing the same thing at slightly different times. */
const DEPTH = [
  { lift: 120, scale: 0.86, rotate: -3, delay: 0 },
  { lift: 76, scale: 0.9, rotate: 1.5, delay: 0.06 },
  { lift: 104, scale: 0.88, rotate: -1, delay: 0.12 },
  { lift: 64, scale: 0.92, rotate: 3, delay: 0.18 },
];

/** Reactive `min-width` test. The expansion is hover-only, and a hover-only
 *  affordance on a touch screen is a control nobody can reach, so small
 *  screens get the stacked reading instead. */
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

/** The track's inner width, measured. Everything else derives from this one
 *  number, which is why it is measured rather than assumed: a resting width
 *  computed from a stale viewport puts every card in the wrong place. */
function useTrackWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => {
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function Movements() {
  const wide = useMinWidth(900);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [sectionEl, setSectionEl] = useState<HTMLElement | null>(null);
  // Mount-late, same as the arc and the pipeline: useScroll({target}) measures
  // once and never re-measures a ref that was null on the first render.
  const attach = useCallback((node: HTMLElement | null) => {
    sectionRef.current = node;
    setSectionEl(node);
  }, []);

  return (
    <section
      ref={attach}
      id="movements"
      data-testid="section-movements"
      className="relative w-full px-6 pb-16 pt-16 md:pb-24 md:pt-20"
    >
      {/* ITS OWN GROUND. The four cards sat on the same drifting green field as
          everything else, so a row of dark glass panels on a dark glass page
          had nothing to sit against and the whole band read as unfinished.
          This is a deeper cut of the SAME hue, not a new colour: `--medium-deep`
          is already the palette's depth terminus, and using it as a surface
          here is the one sanctioned place it appears as one. Hairlines top and
          bottom so the band is a deliberate stage rather than a gradient that
          drifted darker. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 inset-y-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--medium-deep) 62%, transparent) 12%, color-mix(in srgb, var(--medium-deep) 62%, transparent) 88%, transparent 100%)",
          borderTop: "1px solid var(--fg-rule)",
          borderBottom: "1px solid var(--fg-rule)",
        }}
      />
      <div className="relative mx-auto w-full max-w-[1560px]">
        {wide ? (
          sectionEl ? (
            <ExpandingRow sectionRef={sectionRef} />
          ) : (
            <ExpandingRow sectionRef={sectionRef} settled />
          )
        ) : (
          <StackedCards />
        )}
      </div>
    </section>
  );
}

/* ── The wide composition ─────────────────────────────────────────────────── */

function ExpandingRow({
  sectionRef,
  settled,
}: {
  sectionRef: React.RefObject<HTMLElement | null>;
  settled?: boolean;
}) {
  const reduced = useMotionPref();
  const { ref: trackRef, width } = useTrackWidth<HTMLUListElement>();
  const [hovered, setHovered] = useState<number | null>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "center center"],
  });
  // Settled well before the section leaves, so the cards are at rest while the
  // reader is actually reading them.
  const dealt = useTransform(scrollYProgress, [0, 0.75], [0, 1], { clamp: true });
  const fallback = useMotionValue(1);
  const deal = settled || reduced ? fallback : dealt;

  const n = CATEGORIES.length;
  const resting = width > 0 ? (width - GAP * (n - 1)) / n : 0;
  const expanded = resting * EXPAND;
  // What the three unhovered cards share once one has taken its extra width.
  const squeezed = width > 0 ? (width - GAP * (n - 1) - expanded) / (n - 1) : 0;

  /** Visible width of card `i` given the current hover. */
  const widthOf = (i: number) =>
    hovered === null ? resting : i === hovered ? expanded : squeezed;

  /** Left edge of card `i`: the sum of everything before it, plus the gaps. */
  const offsetOf = (i: number) => {
    let x = 0;
    for (let k = 0; k < i; k++) x += widthOf(k) + GAP;
    return x;
  };

  return (
    <ul
      ref={trackRef}
      className="relative w-full list-none"
      style={{ height: "clamp(400px, 68vh, 660px)" }}
      // Leaving the row, not the card: moving between two adjacent cards must
      // not collapse the row and re-expand it in the same frame.
      onMouseLeave={() => setHovered(null)}
    >
      {width > 0 &&
        CATEGORIES.map((c, i) => (
          <MovementCard
            key={c.id}
            index={i}
            id={c.id as CategoryId}
            n={c.n}
            label={c.label}
            thesis={c.thesis}
            tools={toolsInCategory(c.id).map((t) => t.name.replace("™", ""))}
            resting={resting}
            expanded={expanded}
            visible={widthOf(i)}
            x={offsetOf(i)}
            open={hovered === i}
            reduced={reduced}
            deal={deal}
            onEnter={() => setHovered(i)}
          />
        ))}
    </ul>
  );
}

function MovementCard({
  index,
  id,
  n,
  label,
  thesis,
  tools,
  resting,
  expanded,
  visible,
  x,
  open,
  reduced,
  deal,
  onEnter,
}: {
  index: number;
  id: CategoryId;
  n: string;
  label: string;
  thesis: string;
  tools: string[];
  resting: number;
  expanded: number;
  visible: number;
  x: number;
  open: boolean;
  reduced: boolean;
  deal: MotionValue<number>;
  onEnter: () => void;
}) {
  const d = DEPTH[index % DEPTH.length];
  // Each card resolves across its own slice of the travel, so they land in
  // sequence rather than together.
  const start = d.delay;
  const end = Math.min(1, start + 0.6);
  const y = useTransform(deal, [start, end], [d.lift, 0], { clamp: true });
  const scale = useTransform(deal, [start, end], [d.scale, 1], { clamp: true });
  const rotate = useTransform(deal, [start, end], [d.rotate, 0], { clamp: true });
  const opacity = useTransform(deal, [start, Math.min(1, start + 0.3)], [0, 1], { clamp: true });

  // How much of the card is clipped off its right edge. The card is laid out at
  // `expanded`; this is what hides the rest of it.
  const clipRight = Math.max(0, expanded - visible);
  const spring = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 210, damping: 28, mass: 0.8 };

  return (
    <motion.li
      className="absolute left-0 top-0 h-full"
      style={{ width: expanded, transformOrigin: "0% 50%" }}
      animate={{
        x,
        clipPath: `inset(0px ${clipRight}px 0px 0px round var(--r-lens))`,
      }}
      transition={spring}
      onMouseEnter={onEnter}
      onFocus={onEnter}
    >
      {/* The scroll entrance lives on its own layer. Two behaviours on one
          element means the hover spring and the scroll scrub fight over the
          same transform, and the loser is whichever wrote last. */}
      <motion.div
        className="h-full w-full"
        style={{ y, scale, rotate, opacity, transformOrigin: "50% 100%" }}
      >
        <div
          data-testid={`movement-${id}`}
          className="relative h-full w-full overflow-hidden"
          style={{
            borderRadius: "var(--r-lens)",
            background: "var(--fg-surface)",
            boxShadow: "var(--elev-2)",
          }}
        >
          {/* FULL BLEED. The loop is the card, not a thumbnail on it, and it is
              laid out at the expanded width — so opening the clip uncovers
              more of the loop rather than stretching a small one. */}
          <MovementLoop id={id} stage />

          {/* THE CLIP EDGE FADES.
              The loop is laid out at the EXPANDED width and the card clips it
              back, which is what makes hovering uncover more of it rather than
              stretch a small one. The cost is that the clip lands wherever it
              lands — and at some viewport widths that was straight through the
              middle of a column heading ("DILIGENC"), which reads as breakage
              rather than as a reveal.
              This tracks the live clip position, so content dissolves just
              before the cut instead of being guillotined by it. When the card
              is open it sits at the far edge and does nothing. */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0"
            style={{
              left: Math.max(0, visible - 56),
              width: 56,
              height: "100%",
              background:
                "linear-gradient(to right, transparent, var(--fg-surface) 88%)",
            }}
          />

          {/* The scrim. Without it the copy sits on live animation and the
              contrast floor is whatever the loop happens to be doing. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{
              height: "72%",
              background:
                "linear-gradient(to top, var(--fg-surface) 12%, color-mix(in srgb, var(--fg-surface) 82%, transparent) 46%, transparent 100%)",
            }}
          />

          {/* THE COPY IS AS WIDE AS THE CARD CURRENTLY IS, never wider.
              Fixing it at the resting width meant a squeezed neighbour clipped
              its own title mid-word ("Origination an", "The decision re"),
              which reads as broken rather than as de-emphasised. This is the
              one width in the component that changes, it is set instantly
              rather than interpolated, and it changes once per hover — one
              layout pass on a pointer event, not one per frame. The animated
              properties are still transform and clip-path only. */}
          <div
            className="absolute bottom-0 left-0 flex flex-col p-7"
            style={{ width: Math.max(0, Math.min(resting, visible)) }}
          >
            <span className="ansyra-index tabular-nums">{n}</span>
            {/* Two lines' worth of box whether the title needs one or two, so
                the four numerals sit on one line across the row. Bottom-
                anchoring a variable-height title staircases them otherwise. */}
            <motion.span
              className="mt-3 flex items-end origin-left font-display"
              style={{ color: "var(--fg)", lineHeight: 1.1, minHeight: "2.2em" }}
              animate={{ fontSize: open ? "var(--step-title)" : "var(--step-lead)" }}
              transition={{ duration: reduced ? 0 : 0.34, ease: [0.16, 1, 0.3, 1] }}
            >
              {label}
            </motion.span>
            {/* Reserved to the longest thesis at the narrowest width. The block
                is bottom-anchored, so without a floor here a four-line thesis
                and a five-line one put their numerals on different lines and
                the row staircases. Reserving the space costs nothing visible
                and makes the four numerals one horizontal reading. */}
            <span
              className="mt-3 block text-pretty font-sans"
              style={{
                color: "var(--fg-2)",
                fontSize: "var(--step-sm)",
                lineHeight: 1.55,
                minHeight: "7.75em",
              }}
            >
              {thesis}
            </span>
          </div>

          {/* THE EARNED CONTENT. It lives in the region that only exists when
              the card is open, so it is not "hidden then shown" — it is
              genuinely off the edge of the resting card. Naming the actual
              instruments, from the same source the platform section reads, so
              there is no second copy of this list to keep in step. */}
          <div
            className="absolute bottom-0 p-7"
            style={{ left: resting, width: Math.max(0, expanded - resting) }}
          >
            <motion.div
              initial={false}
              animate={{ opacity: open ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1], delay: open ? 0.12 : 0 }}
            >
              <span
                className="ansyra-label block"
                style={{ color: "var(--fg-2)" }}
              >
                {tools.length === 1 ? "One instrument" : `${tools.length} instruments`}
              </span>
              <ul className="mt-3 flex flex-col gap-1.5">
                {tools.map((t) => (
                  <li
                    key={t}
                    className="font-display"
                    style={{ color: "var(--fg)", fontSize: "var(--step-md)", lineHeight: 1.25 }}
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.li>
  );
}

/* ── The narrow composition ───────────────────────────────────────────────── */

/** Below 900px: the same four cards, stacked, everything visible at rest. The
 *  expansion is not degraded here, it is simply absent — there is no hover to
 *  drive it and no horizontal room to spend. */
function StackedCards() {
  return (
    <ul className="flex flex-col gap-4">
      {CATEGORIES.map((c) => {
        const tools = toolsInCategory(c.id).map((t) => t.name.replace("™", ""));
        return (
          <li key={c.id}>
            <div
              data-testid={`movement-${c.id}`}
              className="relative overflow-hidden"
              style={{
                borderRadius: "var(--r-lens)",
                background: "var(--fg-surface)",
                boxShadow: "var(--elev-2)",
              }}
            >
              {/* STACKED CARDS DO NOT FULL-BLEED THE LOOP.
                  On the wide row the loop is absolutely positioned behind the
                  copy, because opening a card has to uncover more of it. There
                  is no opening here, and an absolute loop behind flowing text
                  on a 390px card put the document's own lines straight through
                  the heading. So the loop gets a band of its own and the copy
                  starts under it. */}
              <div className="relative" style={{ height: 200 }}>
                <MovementLoop id={c.id as CategoryId} stage />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0"
                  style={{
                    height: "45%",
                    background:
                      "linear-gradient(to top, var(--fg-surface) 8%, transparent 100%)",
                  }}
                />
              </div>
              <div className="relative flex flex-col p-6 pt-2">
                <span className="ansyra-index tabular-nums">{c.n}</span>
                <span
                  className="mt-3 block font-display"
                  style={{ color: "var(--fg)", fontSize: "var(--step-lead)", lineHeight: 1.1 }}
                >
                  {c.label}
                </span>
                <span
                  className="mt-3 block text-pretty font-sans"
                  style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.55 }}
                >
                  {c.thesis}
                </span>
                <span className="ansyra-label mt-5 block" style={{ color: "var(--fg-2)" }}>
                  {tools.join(" · ")}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
