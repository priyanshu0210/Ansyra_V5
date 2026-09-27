import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { useMotionPref } from "@/hooks/useMotionPref";
import { backlightOpacity, severityFor } from "@/lib/severity";
import { blocksAdvancement, latestReview } from "@contracts/assumption-gate";
import { SAMPLE_DEAL, SAMPLE_ROWS, type SampleRow } from "@/lib/ledger-sample";

// ─────────────────────────────────────────────────────────────────────────────
// B2. The assumption ledger, as a carousel of real rows.
//
// THE HISTORY, BECAUSE IT EXPLAINS THE SHAPE:
//   1. A three-row panel with 91 / 74 / 38, a bar per row and a gate bar under
//      them. Everything true, nothing legible at a glance: three severities and
//      a verdict at once is a dashboard, and a landing page is not where anyone
//      learns to read one.
//   2. ONE row, at the page's widest. Legible, but a single assumption on a
//      1100px slab is an enormous amount of surface spent on one sentence, and
//      it threw away the two rows that made the point that severity VARIES.
//   3. Three rows again, one at a time, in a carousel.
//   4. THIS: six rows, THREE ON SCREEN AT ONCE, advancing on their own.
//
// Why (3) was not enough. Showing one card at a time meant the comparison the
// ledger exists to make — a 91 that blocks sitting beside a 38 that cleared —
// happened in MEMORY, across five seconds, rather than on screen. Three at once
// puts the varying severities side by side, which is the whole argument, and
// the rotation means the reader sees all six without being handed a dashboard.
//
// Six rows, and only ONE of them blocks. The 84 carries a reviewer response, so
// it is a red flag that does NOT hold the deal up — severity and blocking are
// different things, and the ledger can now show that without copy explaining it.
//
// IT IS NOT A SCREENSHOT, and not a div dressed as one. The band comes from
// lib/severity.ts and the blocking behaviour from contracts/assumption-gate.ts,
// which is the same predicate the SERVER rejects an advance with. That coupling
// is the point: this cannot drift from the product, because changing the
// product's thresholds changes this. Only the rows are sample data, and the
// panel says so on screen.
//
// SEVERITY IS LIGHT, NOT COLOUR. The backlight's brightness and blur radius are
// set by the band. Both channels are hue-independent, which is what makes this
// readable to the ~8% of this audience with a red-green deficiency: it reads as
// sharp-and-hot versus soft-and-dim before it reads as red. Text is never
// blurred; the light behind it is.
// ─────────────────────────────────────────────────────────────────────────────

const EASE = [0.16, 1, 0.3, 1] as const;
/** Seconds for one card to travel one card-width. The whole loop is this times
 *  the number of rows, so six cards make an ~11s cycle. Slow enough to read a
 *  card as it crosses, fast enough that the track is visibly turning. */
const SECONDS_PER_CARD = 1.9;
/** Gutter between cards, px. Also part of the stride, so it is measured not guessed. */
const GAP = 20;

/** How many cards are fully visible. Never a fraction — a sliced card at the
 *  edge reads as a rendering fault rather than as an invitation to scroll. */
function visibleCount(width: number): number {
  if (width < 680) return 1;
  if (width < 1040) return 2;
  return 3;
}

export function Ledger() {
  const ref = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useMotionPref();
  const inView = useInView(ref, { once: false, margin: "-15% 0px -15% 0px" });
  const play = reduced || inView;

  const N = SAMPLE_ROWS.length;

  // MEASURED, NOT COMPUTED IN CSS. The stride is one card plus one gutter, and
  // the card width itself depends on how many are visible — so the honest way
  // to move the track by exactly one card is to read the box and translate by
  // pixels. A percentage stride would be wrong the moment the gutter exists.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const visible = visibleCount(width || 1200);
  const cardWidth = width > 0 ? (width - (visible - 1) * GAP) / visible : 0;
  const stride = cardWidth + GAP;

  // ── CONTINUOUS, NOT STEPPED ──────────────────────────────────────────────
  //
  // It used to advance one card and rest, and the rest is what kept reading as
  // "stopped": with three cards on screen the eye finishes a short assumption
  // long before the track moves again, so most of the time it was motionless
  // and the motion looked like a reaction to something rather than a state.
  // Shortening the dwell only shortened the pause.
  //
  // So there is no dwell. The track travels at a constant rate and never
  // stops, which is what a carousel that is genuinely turning looks like. One
  // linear tween from 0 to exactly one full set of cards, repeating: because
  // the track carries TWO copies, the end frame is pixel-identical to the start
  // frame, so the repeat is invisible and there is no seam to hide.
  //
  // Linear on purpose. Any easing puts an acceleration at the loop point, which
  // is precisely where the repeat would become visible.
  const running = !reduced && inView && stride > 0;

  return (
    <div ref={ref} data-testid="ledger" className="mx-auto w-full max-w-[1100px] px-6">
      {/* One sentence saying what the reader is looking at. An earlier version
          explained itself nowhere and assumed the visitor already knew what an
          assumption ledger was. */}
      <div className="ledger-introduction">
      <p
        className="text-pretty font-sans"
        style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.6, maxWidth: "56ch" }}
      >
        Your team writes down assumptions and requests an AI assessment. A score above 80 blocks forward stage changes
        until an attributed review resolves the concern or accepts the risk with evidence and a reason. This illustration uses the same blocking rule as the dashboard.
      </p>
      <p className="ledger-introduction__note">The optimism indicator is an AI assessment, not a probability of failure. Above 80 triggers a human review under this app’s rules. This example uses fictional data.</p>
      </div>

      <div
        className="ansyra-ledger-carousel relative mt-8"
        role="group"
        aria-roledescription="carousel"
        aria-label="Assumptions in the sample deal"
      >
        {/* THE TRACK. Clipped to the visible cards; the row travels on `x` only,
            so the whole carousel is a compositor transform and never a layout.
            No border radius on the clip: the cards carry their own, and a
            rounded clip on a multi-card track shaves the corners off the two at
            the edges. */}
        <div ref={trackRef} className={reduced ? "" : "overflow-hidden"}>
          <div
            className={reduced ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3" : "ansyra-ledger-track flex"}
            style={reduced ? undefined : { gap: GAP, "--ledger-distance": `${-N * stride}px`, "--ledger-duration": `${N * SECONDS_PER_CARD}s`, animationPlayState: running ? "running" : "paused" } as React.CSSProperties}
          >
            {/* Two full copies, which is what makes the loop seamless: the last
                frame of the tween shows copy two exactly where copy one started. */}
            {(reduced ? SAMPLE_ROWS : [...SAMPLE_ROWS, ...SAMPLE_ROWS]).map((row, i) => (
              <LedgerCard
                key={`${row.assumption}-${i}`}
                row={row}
                play={play}
                reduced={reduced}
                width={reduced ? 0 : cardWidth}
                /* Duplicates are announced once. The second copy exists only so
                   the loop does not jump, and a screen reader hearing all six
                   assumptions twice would be reading a rendering trick. */
                duplicate={i >= N}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Claims discipline: sample data, said in the same breath as the thing it
          qualifies rather than in fine print elsewhere. */}
      <p className="ansyra-index mt-6">
        {SAMPLE_DEAL.name}, {SAMPLE_DEAL.disclaimer}
      </p>
    </div>
  );
}

function LedgerCard({
  row,
  play,
  reduced,
  width,
  duplicate,
}: {
  row: SampleRow;
  play: boolean;
  reduced: boolean;
  width: number;
  duplicate: boolean;
}) {
  const score = row.result?.optimismScore ?? 0;
  const sev = severityFor(score);
  // Computed by the same predicate the server enforces, never asserted here.
  const blocked = blocksAdvancement(row);
  // Every card on the track is lit. When one card was on screen at a time,
  // lighting only the active one was the point; with three visible the whole
  // argument is that their severities differ SIDE BY SIDE, and an unlit
  // neighbour would read as disabled rather than as less severe.
  const lit = play;

  return (
    <div
      className="relative flex shrink-0 grow-0 flex-col overflow-hidden"
      style={{
        /* Fixed by the track, never by the content. Cards that size themselves
           to their own text give a row of panels three different widths, which
           is the tell of a layout rather than a design. `flexBasis` because the
           parent is a flex row: `width` alone still lets flex resolve it. */
        flexBasis: width || undefined,
        width: width || undefined,
        borderRadius: "var(--r-lens)",
        background: "var(--glass-dark)",
        backdropFilter: "var(--l2-blur)",
        WebkitBackdropFilter: "var(--l2-blur)",
        boxShadow: "var(--glass-edge-dark)",
      }}
      aria-roledescription="slide"
      aria-hidden={duplicate || undefined}
    >
      {/* THE BACKLIGHT. Behind the row, blurred, never touching text. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 hidden sm:block"
        style={{
          width: "52%",
          background: `radial-gradient(58% 120% at 0% 50%, ${sev.color}, transparent 70%)`,
          filter: `blur(${sev.backlightBlur}px)`,
        }}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: lit ? backlightOpacity(sev) : 0 }}
        transition={{ duration: 0.8, ease: EASE }}
      />
      {/* Mobile collapses the pool to an edge bar: a pool behind a narrow column
          just tints the whole card and severity stops reading. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 block sm:hidden"
        style={{ width: 3, background: sev.color, filter: `blur(${Math.min(sev.backlightBlur, 6)}px)` }}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: lit ? Math.min(1, sev.illumination + 0.35) : 0 }}
        transition={{ duration: 0.8, ease: EASE }}
      />

      {/* `flex-1` + `justify-between` so the gate panel sits on the card's
          floor. Three cards of differing copy length otherwise put their
          verdicts at three different heights, which is the thing that reads as
          unfinished even when every card is the same size. */}
      <div className="relative flex flex-1 flex-col px-6 py-7 md:px-7 md:py-8">
        <span className="ansyra-label" style={{ color: "var(--fg-2)" }}>
          The assumption
        </span>
        <p
          className="mt-3 text-balance font-display"
          style={{
            color: "var(--fg)",
            // A step DOWN again now that three of these share the width a
            // single card used to have. At --step-title the longest assumption
            // ran to five lines in a third of the space.
            fontSize: "var(--step-lead)",
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
            // Three lines of headroom, reserved whether or not this row needs
            // it, so every card's Optimism indicator block starts on one line.
            minHeight: "3.6em",
          }}
        >
          {row.assumption}
        </p>

        <div className="mt-5 flex flex-1 flex-wrap items-end gap-x-8 gap-y-5">
          <div>
            <span className="ansyra-label block" style={{ color: "var(--fg-2)" }}>
              Optimism indicator
            </span>
            <span
              className="mt-1 block font-display tabular-nums"
              style={{ color: "var(--fg)", fontSize: "var(--step-title)", lineHeight: 0.9 }}
            >
              {score}
            </span>
          </div>
          <div>
            <span className="ansyra-label block" style={{ color: "var(--fg-2)" }}>
              Status
            </span>
            {/* The band's own label, from lib/severity.ts. Colour AND the
                backlight above carry it, never colour alone. */}
            <span
              className="mt-1 block font-sans"
              /* `textColor`, NOT `color`. This is the one place on the card
                 where a severity token carries WORDS, and the two cuts exist
                 for exactly that split — `color` is the backlight above, a
                 graphic; this is a label.
                 It became wrong when this card was rebuilt for the 3-up
                 carousel: the label went from `--step-lead` (20-26px, which
                 clears WCAG's large-text bar at the top of that range) to
                 `--step-md`, a flat 19px at weight 400. 19/400 is NORMAL text,
                 so it owes 4.5:1 rather than 3:1 — and `--sev-flag` measures
                 3.96 on the lit ledger row. The `-text` cut measures 5.83. */
              style={{ color: sev.textColor, fontSize: "var(--step-md)", lineHeight: 1.2 }}
            >
              {sev.label}
            </span>
          </div>
        </div>

        {/* THE CONSEQUENCE. The only verdict on the card, so the only thing that
            gets the chromatic edge. A single pulse, never a loop. */}
        <motion.div
          data-testid="ledger-gate"
          className="relative mt-6 flex flex-col gap-1 px-4 py-3"
          style={{
            borderRadius: "var(--r-node)",
            background: blocked
              ? "color-mix(in srgb, var(--sev-flag) 12%, transparent)"
              : "color-mix(in srgb, var(--settle) 12%, transparent)",
            boxShadow: "inset 0 1px 0 rgba(110,212,224,0.16), inset 0 -1px 0 rgba(242,162,60,0.18)",
          }}
          initial={reduced ? false : { opacity: 0 }}
          animate={lit ? { opacity: 1 } : { opacity: reduced ? 1 : 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.35 }}
        >
          {!reduced && blocked && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ borderRadius: "var(--r-node)", boxShadow: "0 0 44px -6px var(--sev-flag)" }}
              initial={{ opacity: 0 }}
              animate={lit ? { opacity: [0, 0.75, 0] } : { opacity: 0 }}
              transition={{ duration: 1.4, ease: EASE, delay: 0.45, times: [0, 0.45, 1] }}
            />
          )}
          <span
            className="relative font-sans"
            style={{
              color: blocked ? "var(--sev-flag-text)" : "var(--settle)",
              fontSize: "var(--step-sm)",
              fontWeight: 500,
            }}
          >
            {blocked ? "Sign-off blocked" : "This assumption does not block"}
          </span>
          <span
            className="relative font-sans"
            style={{
              color: "var(--fg-2)",
              fontSize: "var(--step-xs)",
              lineHeight: 1.45,
              /* TWO LINES, RESERVED. Without this the panel is as tall as its
                 own sentence, and since the panel sits on the card's floor a
                 taller one pushes the Optimism indicator row UP — so three cards of
                 identical size still showed their scores at three different
                 heights. The card being uniform is not the same as the card
                 READING uniform. */
              minHeight: "2.9em",
            }}
          >
            {blocked
              ? "until an attributed review resolves or accepts the risk."
              : row.reviewerNote
                ? `${latestReview(row)?.outcome === "risk_accepted" ? "Risk accepted" : latestReview(row)?.outcome === "resolved" ? "Resolved" : "Reviewer note"}: ${row.reviewerNote}`
                : "This one is not holding the deal up."}
          </span>
        </motion.div>
      </div>
    </div>
  );
}
