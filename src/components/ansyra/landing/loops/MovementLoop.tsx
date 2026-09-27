import { useEffect, useRef, useState } from "react";
import { useMotionPref } from "@/hooks/useMotionPref";
import type { CategoryId } from "@/lib/landing-content";

// ─────────────────────────────────────────────────────────────────────────────
// The loops that play inside the movement cards.
//
// DOM AND CSS, NOT VIDEO. Four short screen captures would be several megabytes
// on the one page with a hard weight budget, would need a still poster for
// reduced motion, and would go stale the moment the product's UI moves. These
// are built from the same tokens the real interface uses, so they cost nothing
// to download, stay sharp at any resolution, follow the light/dark toggle, and
// cannot drift out of date in the way a recording does.
//
// They are EVIDENCE, not content (constitution §2): `aria-hidden`, never
// readable, and nothing here is the only place a fact appears.
//
// THEY PAUSE OFF-SCREEN. Four continuous animations for a section that is
// usually out of view is a battery cost with no viewer. One observer per loop
// flips `data-play`, and the CSS keys `animation-play-state` off it.
// ─────────────────────────────────────────────────────────────────────────────

/** Shared shell: owns the observer and the reduced-motion decision.
 *
 *  `stage` is the full-bleed mode the movement cards use: the loop IS the card
 *  rather than a thumbnail sitting on it, so opening a card uncovers more of
 *  the loop instead of stretching a small one. The bordered 148px box is kept
 *  for any surface that wants the loop as an inset figure. */
function LoopFrame({
  kind,
  stage,
  children,
}: {
  kind: string;
  stage?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useMotionPref();
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPlay(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => setPlay(entries.some((e) => e.isIntersecting)),
      { rootMargin: "10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      aria-hidden
      data-loop={kind}
      // Reduced motion holds frame one rather than removing the loop: the card
      // still shows what the movement does, it simply does not move.
      data-play={!reduced && play ? "1" : "0"}
      className={stage ? "ansyra-loop ansyra-loop--stage" : "ansyra-loop"}
    >
      {children}
    </div>
  );
}

/** A row of the fake interface. Width is the only thing that varies. */
function Bar({ w, tone = "rule", i }: { w: number; tone?: "rule" | "ink" | "flag" | "ok"; i: number }) {
  const bg =
    tone === "ink"
      ? "var(--fg-2)"
      : tone === "flag"
        ? "var(--sev-flag)"
        : tone === "ok"
          ? "var(--sev-grounded)"
          : "var(--fg-rule)";
  return (
    <span
      className="ansyra-loop-bar"
      style={{ width: `${w}%`, background: bg, ["--i" as string]: i }}
    />
  );
}

/** A column of the fake interface, with a heading rule and rows under it. */
function Column({
  label,
  rows,
  tone = "rule",
  from = 0,
}: {
  label: string;
  rows: number[];
  tone?: "rule" | "ink" | "flag" | "ok";
  from?: number;
}) {
  return (
    <div className="ansyra-loop-col">
      <span className="ansyra-loop-colhead">{label}</span>
      {rows.map((w, i) => (
        <Bar key={i} w={w} i={from + i} tone={i === 0 ? tone : "rule"} />
      ))}
    </div>
  );
}

/**
 * 01 Origination — deals arriving on the left and sorting into three stages.
 *
 * DENSER ON PURPOSE. This was five bars in a column, which at card scale read
 * as a loading skeleton rather than as a pipeline. A pipeline needs at least
 * the shape of a pipeline: named columns with unequal counts in them, because
 * the whole point is that most of what arrives does not survive the sort.
 */
function Origination({ stage }: LoopProps) {
  return (
    <LoopFrame kind="origination" stage={stage}>
      <div className="ansyra-loop-cols">
        <Column label="Screened" rows={[92, 74, 88, 61, 80, 55]} tone="ink" />
        <Column label="Diligence" rows={[86, 66, 72]} tone="ink" from={6} />
        <Column label="Passed" rows={[78]} tone="ok" from={9} />
      </div>
    </LoopFrame>
  );
}

/** 02 Diligence — a document read top to bottom, two lines flagged. */
function Diligence({ stage }: LoopProps) {
  return (
    <LoopFrame kind="diligence" stage={stage}>
      <div className="ansyra-loop-doc">
        {[96, 88, 74, 92, 66, 84, 58, 90, 71, 86].map((w, i) => (
          <Bar key={i} w={w} i={i} tone={i === 2 || i === 6 ? "flag" : "rule"} />
        ))}
        <span className="ansyra-loop-scan" />
      </div>
    </LoopFrame>
  );
}

/** 03 The decision record — written, challenged, answered, filed. */
function Decision({ stage }: LoopProps) {
  return (
    <LoopFrame kind="decision" stage={stage}>
      <div className="ansyra-loop-rows">
        <span className="ansyra-loop-type" />
        <div className="ansyra-loop-chiprow">
          <span className="ansyra-loop-chip ansyra-loop-chip--flag">Challenged</span>
          <span className="ansyra-loop-chip ansyra-loop-chip--ok">On the record</span>
        </div>
        {/* The entries the decision joins. They are what "on the record"
            actually means, and without them the chips floated in space. */}
        <div className="ansyra-loop-filed">
          {[88, 72, 94, 63, 81].map((w, i) => (
            <Bar key={i} w={w} i={i} tone="rule" />
          ))}
        </div>
      </div>
    </LoopFrame>
  );
}

/** 04 Memory — past deals surfacing against the one on the desk. */
function Memory({ stage }: LoopProps) {
  return (
    <LoopFrame kind="memory" stage={stage}>
      <div className="ansyra-loop-stack">
        <span className="ansyra-loop-card ansyra-loop-card--back3" />
        <span className="ansyra-loop-card ansyra-loop-card--back2" />
        <span className="ansyra-loop-card ansyra-loop-card--back" />
        <span className="ansyra-loop-card ansyra-loop-card--front">
          <span className="ansyra-loop-score">91</span>
          <span className="ansyra-loop-cardrows">
            {[84, 62, 74].map((w, i) => (
              <Bar key={i} w={w} i={i} tone="rule" />
            ))}
          </span>
        </span>
      </div>
    </LoopFrame>
  );
}

interface LoopProps {
  stage?: boolean;
}

const LOOPS: Record<CategoryId, (p: LoopProps) => React.ReactElement> = {
  origination: Origination,
  diligence: Diligence,
  decision: Decision,
  memory: Memory,
};

export function MovementLoop({ id, stage }: { id: CategoryId; stage?: boolean }) {
  const Loop = LOOPS[id];
  return Loop ? <Loop stage={stage} /> : null;
}
