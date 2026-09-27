import { useCallback, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useMotionPref } from "@/hooks/useMotionPref";
import { Icon, type IconName } from "@/components/ansyra/Icon";
import { severityFor } from "@/lib/severity";
// THE BAND'S THREE LABELS TAKE THE `-text` CUT; ONLY `tint` KEEPS `.color`.
//
// `.color` is the graphic cut and these are WORDS at --step-sm (14px), so they
// owe 4.5:1. Measured on the artifact surface: on the DARK theme the base cut
// is 3.9:1 and the text cut 5.76:1. On light the two resolve to the same value,
// so this is a no-op there — which is exactly why it survived: the landing was
// exempted from the dashboard's "use the -text cut for text" sweep on the
// grounds that only the base cuts are ground-aware, and that exemption was
// right about the TINT and wrong about the labels.
import { StageDiagram } from "./diagrams/StageDiagram";
import { FLAGGED_ROW, GROUNDED_ROW, SAMPLE_BLOCKED, SAMPLE_DEAL } from "@/lib/ledger-sample";

// ─────────────────────────────────────────────────────────────────────────────
// B3. Scope, Ground, Analyze, Verdict.
//
// This was four identical text columns, which was semantically wrong: these are
// not four parallel features, they are one pipeline with a deal moving through
// it. Four equal boxes said "pick any" when the truth is "each one feeds the
// next".
//
// IT SHOWS THE LEDGER'S OWN ROWS. Every artifact here comes from
// lib/ledger-sample.ts, the same module B2 renders. Scope states the mandate,
// Ground shows the citation behind the grounded row, Analyze shows the red flag,
// Verdict shows the blocked sign-off. So the pipeline is not an illustration of
// how a ledger might be produced, it is the account of how THAT ledger, the one
// directly below, was produced. Two set pieces, one deal.
//
// LIGHT TRAVELS THE CONNECTOR, and the stages resolve as it arrives. That is
// the concept's motion language doing the semantic work: the reader watches
// evidence move rather than watching four cards fade up.
//
// UNRESOLVED IS A TYPEFACE, NOT AN OPACITY.
// A stage the light has not reached is set in Redaction 50, the degraded cut, at
// full opacity. The brief asked for opacity 0.3, which the constitution's text
// floor forbids and which would have made the future stages unreadable rather
// than unresolved. Same call as B1, for the same reason: this family degrades,
// so let it.
// ─────────────────────────────────────────────────────────────────────────────

const EASE_OPTICS = [0.16, 1, 0.3, 1] as const;

interface Stage {
  id: string;
  /** What the stage DOES. Four variations of a dot would say nothing. */
  icon: IconName;
  label: string;
  body: string;
  /** Real output from the sample deal, not a description of one. */
  artifact: ReactNode;
}

/**
 * The real output of one stage.
 *
 * IT SAYS WHICH STAGE IT CAME FROM, and it is joined to that stage by a line.
 *
 * Before: four unlabelled panels sitting under four diagrams, at 12px, in a row
 * four columns wide. Read left to right they were four fragments of a deal with
 * nothing tying any of them to the step above it, so the honest reaction was
 * "what am I looking at". The stage name and the connector are not decoration;
 * they are the two things that were missing.
 *
 * The body also steps up from --step-xs to --step-sm. 12px is the caption size
 * in this system, and these are not captions — they are the evidence the whole
 * section exists to show.
 */
function Artifact({
  children,
  tint,
  stage,
}: {
  children: ReactNode;
  tint?: string;
  stage: string;
}) {
  return (
    <div className="mt-5">
      {/* The connector. A hairline from the stage above down into the panel, so
          the panel reads as hanging off its step rather than floating under it.
          Tinted when the stage produced a severity, neutral otherwise. */}
      <span
        aria-hidden
        className="block"
        style={{ width: 1, height: 18, marginLeft: 11, background: tint ?? "var(--fg-rule)" }}
      />
      <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>
        {stage} produced
      </p>
      <div
        className="mt-2 px-4 py-3.5"
        style={{
          borderRadius: "var(--r-node)",
          background: "var(--fg-surface)",
          boxShadow: tint ? `inset 2px 0 0 0 ${tint}` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Line({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <p
      className="font-sans"
      style={{
        color: muted ? "var(--fg-2)" : "var(--fg)",
        fontSize: "var(--step-sm)",
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

const flagged = severityFor(FLAGGED_ROW.result?.optimismScore ?? 0);

const STAGES: Stage[] = [
  {
    id: "scope",
    icon: "scope",
    label: "Scope",
    body: "Choose the deal and write the assumption you want to test. The example below is fictional.",
    artifact: (
      <Artifact stage="Scope">
        <Line muted>{SAMPLE_DEAL.name}</Line>
        <Line>{SAMPLE_DEAL.mandate}</Line>
      </Artifact>
    ),
  },
  {
    id: "ground",
    icon: "ground",
    label: "Ground",
    body: "Supply supporting context. This assumption test does not automatically read documents or retrieve comparable deals.",
    artifact: (
      <Artifact stage="Ground">
        <Line muted>{GROUNDED_ROW.citation}</Line>
        <Line>Supporting context provided by the reviewer, not automatically retrieved.</Line>
      </Artifact>
    ),
  },
  {
    id: "analyze",
    icon: "analyze",
    label: "Analyse",
    body: "AI returns an optimism score, reasoning, and a suggested action. The score expresses model judgement; it does not verify the evidence.",
    artifact: (
      <Artifact stage="Analyse" tint={flagged.color}>
        <Line>{FLAGGED_ROW.assumption}</Line>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="font-sans" style={{ color: flagged.textColor, fontSize: "var(--step-sm)" }}>
            {flagged.label}
          </span>
          <span
            className="font-display tabular-nums"
            style={{ color: "var(--fg)", fontSize: "var(--step-md)", lineHeight: 1 }}
          >
            {FLAGGED_ROW.result?.optimismScore}
          </span>
        </div>
      </Artifact>
    ),
  },
  {
    id: "verdict",
    icon: "verdict",
    label: "Verdict",
    body: "A person reviews the concern and records evidence and a reason to resolve it or accept the risk. Server checks can block advancement; AI cannot approve it.",
    artifact: (
      <Artifact stage="Verdict" tint={flagged.color}>
        <Line>
          <span style={{ color: flagged.textColor, fontWeight: 500 }}>Stage advancement blocked. </span>
          {SAMPLE_BLOCKED.length === 1
            ? "One red-flag assumption still needs a resolved or risk-accepted review."
            : `${SAMPLE_BLOCKED.length} red-flag assumptions still need resolved or risk-accepted reviews.`}
        </Line>
      </Artifact>
    ),
  },
];

/** Progress at which each stage lights. Evenly spaced across the travel. */
const LIT_AT = STAGES.map((_, i) => i / STAGES.length);

export function Pipeline() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackEl, setTrackEl] = useState<HTMLDivElement | null>(null);
  // Same mount-late pattern as the arc: useScroll({target}) measures on first
  // render and never re-measures a ref that was null then, which pins progress
  // at 0 for the life of the page.
  const attach = useCallback((node: HTMLDivElement | null) => {
    trackRef.current = node;
    setTrackEl(node);
  }, []);

  return (
    <div ref={attach} className="relative w-full">
      {/* Before the track element exists there is nothing to measure against,
          so render the finished state rather than an empty one. If scroll
          measurement never starts, the reader still gets the whole pipeline. */}
      {trackEl ? (
        <PipelineTrack trackRef={trackRef} />
      ) : (
        <PipelineStages active={STAGES.length - 1} width="100%" />
      )}
    </div>
  );
}

function PipelineTrack({ trackRef }: { trackRef: React.RefObject<HTMLDivElement | null> }) {
  const reduced = useMotionPref();
  const [active, setActive] = useState(0);

  // MEASURED AGAINST THE ROW, ENDING WHILE THE ROW IS STILL ON SCREEN.
  //
  // The old range ran `start end` to `end start`: progress 0 when the row's top
  // touched the bottom of the window, 1 when its bottom left the top. Verdict
  // lights at 0.75 of `lit`, which under the old mapping fell at 60% of that
  // full travel, by which point the row had already scrolled about a fifth of a
  // screen ABOVE the top of the window. The light was arriving after the thing
  // it was lighting had left, which is why the last stage was never seen.
  //
  // Now the travel ENDS with the row's bottom at 40% of the window height, so
  // every progress value in the range describes a row that is still in front of
  // the reader.
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start 85%", "end 40%"],
  });

  // Compressed into the first 45%. Verdict now lights at ~35% of the row's own
  // travel, with the row centred, and stays lit for the rest of the way past.
  const lit = useTransform(scrollYProgress, [0.05, 0.45], [0, 1], { clamp: true });
  const width = useTransform(lit, (p) => `${Math.max(0, Math.min(1, p)) * 100}%`);

  useMotionValueEvent(lit, "change", (p) => {
    let next = 0;
    for (let i = 0; i < LIT_AT.length; i++) if (p >= LIT_AT[i]) next = i;
    setActive((was) => (was === next ? was : next));
  });

  // Reduced motion gets the finished pipeline: every stage resolved, every
  // artifact visible, the connector fully lit. The same composition at rest.
  if (reduced) return <PipelineStages active={STAGES.length - 1} width="100%" />;
  return <PipelineStages active={active} width={width} />;
}

function PipelineStages({
  active,
  width,
}: {
  active: number;
  width: MotionValue<string> | string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-6">
      {/* THE CONNECTOR. Horizontal on desktop, down the left gutter on mobile:
          a horizontal rail under a vertical stack would connect nothing. */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute left-0 top-3 hidden h-px w-full md:block"
          style={{ background: "var(--fg-rule)" }}
        />
        <motion.div
          aria-hidden
          className="absolute left-0 top-3 hidden h-px md:block"
          style={{
            background: "var(--caustic)",
            boxShadow: "0 0 12px 0 var(--caustic)",
            width,
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-0 left-[7px] top-3 w-px md:hidden"
          style={{ background: "var(--fg-rule)" }}
        />

        <ol className="grid grid-cols-1 gap-y-10 md:grid-cols-4 md:gap-x-8 md:gap-y-0">
          {STAGES.map((s, i) => {
            const reached = i <= active;
            const isActive = i === active;
            return (
              <li key={s.id} className="relative pl-8 md:pl-0">
                {/* The node. Filled once the light has arrived. */}
                <span
                  aria-hidden
                  className="absolute left-0 top-1 block h-4 w-4 md:left-0 md:top-1"
                  style={{
                    borderRadius: 999,
                    background: reached ? "var(--caustic)" : "var(--fg-surface)",
                    boxShadow: isActive
                      ? "0 0 0 4px color-mix(in srgb, var(--caustic) 22%, transparent), 0 0 22px 0 var(--caustic)"
                      : `0 0 0 1px var(--fg-rule)`,
                    transition: "background 260ms ease, box-shadow 260ms ease",
                  }}
                />
                <div className="md:pt-10">
                  <span className="flex items-center gap-3">
                    <span className="ansyra-index tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {/* Meaning, not decoration: the mark says what the stage
                        does. Always beside the label, never instead of it. */}
                    <Icon
                      name={s.icon}
                      size={18}
                      style={{ color: reached ? "var(--caustic)" : "var(--fg-2)" }}
                    />
                  </span>
                  <p
                    className="mt-2 font-display"
                    style={{
                      color: "var(--fg)",
                      fontSize: "var(--step-md)",
                      // The stage is UNRESOLVED, not dimmed: a text opacity
                      // drop is forbidden by the constitution's floor and would
                      // make the future unreadable rather than unarrived.
                      fontFamily: reached ? "var(--font-display)" : "var(--font-struck)",
                      transition: "font-family 0ms",
                    }}
                  >
                    {s.label}
                  </p>
                  <p
                    className="mt-2 font-sans"
                    style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.55 }}
                  >
                    {s.body}
                  </p>
                  {/* WHAT THE STAGE DOES, before what it produced.
                      The artifact below is the output; this is the mechanism.
                      It is the answer to the question this section previously
                      left unanswered — not "it produced a number" but "here is
                      what it ran against, and what stops it inventing one". */}
                  {/* FIXED HEIGHT, so the four artifact panels below start on
                      one line. The diagrams are different shapes (a document, a
                      graph, a validator, a gavel) and letting each set its own
                      height staggered the four "produced" labels down the row,
                      which made a set of parallel outputs look like a sequence
                      of unrelated blocks. */}
                  <div
                    className="mt-5 flex items-center"
                    style={{ color: "var(--fg-2)", height: 132 }}
                  >
                    <StageDiagram id={s.id} lit={reached} />
                  </div>

                  {/* The artifact resolves in when the light reaches the stage.
                      clip-path + opacity only: no layout property animates, so
                      the four columns never reflow as the reader scrolls. */}
                  <motion.div
                    initial={false}
                    animate={{ opacity: reached ? 1 : 0, y: reached ? 0 : 8 }}
                    transition={{ duration: 0.72, ease: EASE_OPTICS }}
                  >
                    {s.artifact}
                  </motion.div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
