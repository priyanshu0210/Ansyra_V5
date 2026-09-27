import { Icon } from "@/components/ansyra/Icon";
import { useState } from "react";
import { Link } from "react-router";
import { useMotionPref } from "@/hooks/useMotionPref";
// The lens indexes the FEATURED four, not all six — see FEATURED_RESEARCH.
import { FEATURED_RESEARCH } from "@/lib/landing-content";
import { Reveal } from "./Reveal";
import { stagger } from "./reveal-stagger";

// ─────────────────────────────────────────────────────────────────────────────
// B6. The lens.
//
// The toggle mechanic, given a job instead of a decoration. It sits on the
// evidence index (which A1 built for exactly this) and demonstrates the product
// thesis rather than illustrating it: the same evidence reads differently
// depending on what you can see through. One study is resolved; the rest are
// there, legible, but not in focus.
//
// IT IS A RANGE INPUT, ON PURPOSE.
// A hand-rolled draggable div would need keyboard handling, ARIA, focus
// management and touch support written from scratch, and would get some of it
// wrong. `input[type=range]` arrives with all of it: arrow keys, Home/End,
// screen-reader announcement, and a real focus ring. The lens is skinned on top
// rather than reimplemented underneath.
//
// UNRESOLVED IS THE DEGRADED CUT, NOT DIMMED TEXT.
// The brief asked for inactive rows at opacity 0.3. That is below the
// constitution's text floor and would make five of six studies unreadable to
// sell a point about clarity. They are set in Redaction 50 instead: visibly out
// of focus, fully legible, no information withheld. Third time this call has
// come up (B1, B3, here) and it resolves the same way each time, which is the
// argument for keeping this typeface.
// ─────────────────────────────────────────────────────────────────────────────

export function EvidenceLens() {
  const reduced = useMotionPref();
  const [focus, setFocus] = useState(0);
  // Reduced motion resolves every row: the lens is an enhancement, and a
  // reader who has asked for less motion should not get less evidence.
  const allResolved = reduced;

  return (
    <div className="mt-14">
      <ul className="border-t" style={{ borderColor: "var(--fg)" }}>
        {FEATURED_RESEARCH.map((r, i) => {
          const resolved = allResolved || i === focus;
          // A study row is a reading, not travelling content: it comes up to
          // brightness rather than sliding in.
          return (
            <Reveal key={r.slug} variant="panel" delay={stagger(i)}>
              <li>
                <Link
                  to={`/research/${r.slug}`}
                  data-testid={`research-card-${r.slug}`}
                  data-resolved={resolved}
                  onMouseEnter={() => !reduced && setFocus(i)}
                  onFocus={() => !reduced && setFocus(i)}
                  className="ansyra-study relative grid grid-cols-[2.5rem_1fr] items-baseline gap-x-5 gap-y-1 border-b py-5 md:grid-cols-[3rem_7rem_1fr_auto] md:gap-x-8"
                  style={{ borderColor: "var(--fg-rule)" }}
                >
                  {/* The backlight. Only the resolved row is lit, and it is
                      light behind the row rather than a fill on it. */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 hidden md:block"
                    style={{
                      width: "34%",
                      background:
                        "radial-gradient(60% 120% at 0% 50%, var(--caustic), transparent 70%)",
                      filter: "blur(22px)",
                      opacity: resolved && !allResolved ? 0.14 : 0,
                      transition: "opacity var(--t-shift) ease",
                    }}
                  />
                  <span className="ansyra-index tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span
                    className="relative tabular-nums"
                    style={{
                      color: "var(--fg)",
                      fontSize: "var(--step-lead)",
                      lineHeight: 1.05,
                      // The clarity channel. Legible either way; the difference
                      // is focus, not visibility.
                      fontFamily: resolved ? "var(--font-display)" : "var(--font-struck)",
                    }}
                  >
                    {r.headline}
                  </span>
                  <span
                    className="relative col-span-2 text-pretty font-sans md:col-span-1"
                    style={{
                      color: "var(--fg-2)",
                      fontSize: "var(--step-sm)",
                      lineHeight: 1.5,
                      maxWidth: "52ch",
                    }}
                  >
                    {r.headlineLabel}
                  </span>
                  <span
                    className="relative col-span-2 flex items-baseline gap-3 font-sans md:col-span-1 md:justify-end"
                    style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}
                  >
                    {r.source}, {r.year}
                    <Icon name="arrow" size={14} style={{ color: "var(--fg)" }} />
                  </span>
                </Link>
              </li>
            </Reveal>
          );
        })}
      </ul>

      {/* THE LENS. Hidden under reduced motion, where every row is already
          resolved and the control would do nothing. */}
      {!reduced && (
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <label
            htmlFor="evidence-lens"
            className="font-sans"
            style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}
          >
            Bring one study into focus
          </label>
          <input
            id="evidence-lens"
            data-testid="evidence-lens"
            type="range"
            min={0}
            max={FEATURED_RESEARCH.length - 1}
            step={1}
            value={focus}
            onChange={(e) => setFocus(Number(e.target.value))}
            className="ansyra-lens"
            aria-valuetext={`${FEATURED_RESEARCH[focus].source}, ${FEATURED_RESEARCH[focus].year}`}
          />
          <span className="ansyra-index tabular-nums">
            {String(focus + 1).padStart(2, "0")} / {String(FEATURED_RESEARCH.length).padStart(2, "0")}
          </span>
        </div>
      )}
    </div>
  );
}
