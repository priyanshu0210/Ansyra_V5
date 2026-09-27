import { Icon } from "@/components/ansyra/Icon";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useInView } from "framer-motion";
import { useMotionPref } from "@/hooks/useMotionPref";
import { RequestAccessModalLazy } from "@/components/ansyra/modals/RequestAccessModalLazy";
import { Footer } from "@/components/ansyra/Footer";
import { ANSWERED_CLEARS } from "@/lib/ledger-sample";
import { Reveal, ResolveType } from "./Reveal";

const SHELL = "mx-auto w-full max-w-7xl px-6";

/** Three slow shapes. Transform only; the blur is rasterized once and never
 *  re-computed, which is what keeps an always-on effect off the paint path. */
const CAUSTICS = [
  { hue: "var(--caustic)", w: "58%", h: "62%", left: "-6%", top: "18%", dur: "19s", delay: "0s" },
  { hue: "var(--prism)", w: "46%", h: "54%", left: "38%", top: "34%", dur: "23s", delay: "-7s" },
  { hue: "var(--caustic)", w: "40%", h: "48%", left: "68%", top: "10%", dur: "17s", delay: "-11s" },
];

// A fictional decision record, read from top to bottom one line at a time.
const ENTRIES = [
  "A deal enters the record.",
  "An assumption takes shape.",
  "The evidence is attached.",
  "The reasoning is challenged.",
  "A concern holds the decision.",
  "A reviewer traces the source.",
  "The assumption is revised.",
  "The response stays on record.",
  "The sample concern is answered.",
];

function TheRecord({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced || !inView || paused || active === ENTRIES.length - 1) return;
    const timer = window.setTimeout(() => setActive((line) => line + 1), 2400);
    return () => window.clearTimeout(timer);
  }, [active, inView, paused, reduced]);

  return (
    <div ref={ref} data-testid="closing-record" className="closing-lines">
      <ol aria-label="A fictional decision record">
        {ENTRIES.map((text, i) => (
          <li key={text}>
            <button
              type="button"
              className="closing-lines__line"
              data-active={active === i}
              aria-pressed={active === i}
              onClick={() => { setActive(i); setPaused(true); }}
              onFocus={() => { setActive(i); setPaused(true); }}
            >
              <span>{text}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="closing-lines__controls">
        <span>Fictional decision record</span>
        {!reduced && <button type="button" onClick={() => {
          if (active === ENTRIES.length - 1) { setActive(0); setPaused(false); }
          else setPaused((value) => !value);
        }}>{active === ENTRIES.length - 1 ? "Replay" : paused ? "Play" : "Pause"}</button>}
      </div>
      {ANSWERED_CLEARS && (
        <p data-testid="closing-cleared" className="mt-7 text-pretty font-sans"
          style={{ color: "var(--fg-2)", fontSize: "var(--step-sm)", lineHeight: 1.6, maxWidth: "34ch" }}>
          <span style={{ color: "var(--sev-grounded)", fontWeight: 500 }}>Sample concern resolved. </span>
          An attributed review is on the record. Other advancement checks still apply.
        </p>
      )}
    </div>
  );
}

export function Closing() {
  const [showAccess, setShowAccess] = useState(false);
  const reduced = useMotionPref();

  return (
    <section
      id="close"
      data-testid="section-close"
      // GROUND B, not ground A. The closing used to reset to the opening ground,
      // which under the old light-to-dark arc read as "back to where we
      // started". With two grounds inside one theme it read as a single
      // periwinkle block dropped into the green half of the page — the arc
      // arriving somewhere and then un-arriving for one section.
      // The arc is one-way: once it lands on ground B, the page stays there.
      data-ground="dark"
      className="relative w-full overflow-hidden pt-28 md:pt-36"
      // Opaque, so it lays over the arc's fixed layer rather than reversing it.
      style={{ background: "var(--medium)" }}
    >
      {/* THE CAUSTIC FLOOR. Lower half, full width, behind everything. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-1/4 overflow-hidden">
        {CAUSTICS.map((c, i) => (
          <span
            key={i}
            className={reduced ? undefined : "ansyra-caustic-drift"}
            style={{
              position: "absolute",
              left: c.left,
              top: c.top,
              width: c.w,
              height: c.h,
              background: `radial-gradient(50% 50% at 50% 50%, ${c.hue}, transparent 72%)`,
              filter: "blur(64px)",
              opacity: 0.1,
              animationDuration: c.dur,
              animationDelay: c.delay,
            }}
          />
        ))}
      </div>

      <div className={`relative ${SHELL}`}>
        {/* Asymmetric on purpose: the artifact sits high right, the headline
            low left. Nothing is centred, and the two do not share a baseline. */}
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5 lg:col-start-8 lg:pt-0">
            <TheRecord reduced={reduced} />
          </div>

          <div className="lg:col-span-7 lg:col-start-1 lg:row-start-1 lg:pt-24">
            <ResolveType>
              <h2
                className="text-balance font-display font-normal"
                style={{
                  color: "var(--fg)",
                  fontSize: "var(--step-display)",
                  lineHeight: 1.02,
                  letterSpacing: "-0.03em",
                  maxWidth: "12ch",
                }}
              >
                Keep the record.
              </h2>
            </ResolveType>
            <Reveal variant="lift" delay={0.1}>
              <p
                className="mt-7 text-pretty font-sans"
                style={{
                  color: "var(--fg-2)",
                  fontSize: "var(--step-body)",
                  lineHeight: 1.65,
                  maxWidth: "44ch",
                }}
              >
                Request workspace access to explore how evidence, assumptions, and decisions stay connected.
              </p>
            </Reveal>
            <Reveal variant="lift" delay={0.16}>
              <div className="mt-10 flex flex-wrap items-center gap-5">
                {/* One of --caustic's three sanctioned fill sites. Its label is
                    --ink-next on both grounds: amber is a light surface either
                    way, so the text does not flip with the ground. */}
                <button
                  data-testid="close-request-access"
                  onClick={() => setShowAccess(true)}
                  className="ansyra-cta ansyra-cta--primary px-8 py-4"
                  style={{ fontSize: "var(--step-sm)", minHeight: 52 }}
                >
                  Request Access
                  <Icon name="arrow" size={16} />
                </button>
                <span className="font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
                  Already provisioned?{" "}
                  <Link to="/login" className="ansyra-navlink" style={{ color: "var(--fg)" }}>
                    Sign in
                  </Link>
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* No gap. The caustic floor runs straight into the footer, which is what
          closes the dead band that used to sit above it: the old mt-24/mt-32
          existed to separate two light blocks, and there are no longer two. */}
      <div className="relative mt-20 md:mt-28">
        <Footer />
      </div>
      <RequestAccessModalLazy open={showAccess} onClose={() => setShowAccess(false)} />
    </section>
  );
}

// Motion note: this is the page's one continuously-moving element. It is
// allowed because it is ambient rather than stateful, it is transform-only, and
// it is capped at the ambient amplitude the constitution sets. Under reduced
// motion the class is simply not applied and the shapes hold a still frame,
// which is the same composition at rest.
