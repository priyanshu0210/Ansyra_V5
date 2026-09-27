import { FEATURED_RESEARCH } from "@/lib/landing-content";
import { Icon } from "@/components/ansyra/Icon";
import { useEffect, useState } from "react";
import { useMotionPref } from "@/hooks/useMotionPref";
import { RequestAccessModalLazy } from "@/components/ansyra/modals/RequestAccessModalLazy";
import { HeroIntro } from "./HeroIntro";
import { HeroScene } from "./HeroScene";

// ─────────────────────────────────────────────────────────────────────────────
// THESIS: every M&A platform shows you documents; Ansyra keeps the decision
// record. The hero states the claim and gets out of the way.
//
// FIRST VIEWPORT: the claim at display size, a citation row carrying real
// sources, and the primary action directly under the claim.
//
// THE REDLINE IS GONE FROM THIS PAGE (2026-08-13).
// Two display-size statements stacked — the headline and then a struck-and-
// rewritten second claim — read as clutter rather than as a focal moment, and
// the four lines they occupied pushed Request Access and the citation row down
// out of the first screenful, which is the one thing the hero cannot afford.
// The claim now stands alone and the action sits directly under it.
//
// `Redline.tsx`, `redline-score.ts` and their tests are DELIBERATELY LEFT in
// the tree: the component is intact, tested, and reusable; nothing else on the
// site renders it today. Delete or re-place it as one decision, not by
// discovering it looks unused.
//
// THE HEADLINE STAT CHANGED (plan §10.3).
// It led with HBR's "70% of acquisitions fail" for years. That is the single
// most contested number in M&A, it is from 2011, and this audience knows both
// of those things. Leading with it invites the reader to argue with the first
// sentence. Bain's 2026 figure is recent, specific, harder to dispute, and it
// points at Ansyra's own mechanic: the gap is not in the model, it is in
// everything around the model. HBR is not deleted, it moves to the citation
// column and to study 01 in the evidence index, where a contested range is
// honest context rather than the headline claim.
//
//
// THE HEADLINE NAMES THE ARTIFACT (2026-08 copy pass).
// "The reasoning disappears" described the loss accurately but named nothing
// you could buy; "decision record" is the term the title tag, the footer and
// this file's own thesis already use, so the claim and the product now use one
// word. "Decision trail" was considered and rejected for the same reason it
// was proposed — it is a new term, and this page already spends one on the
// "activity trail" in the platform section.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True once the opening wordmark has finished travelling.
 *
 * The boot script in index.html sets `data-intro="running"` on <html> BEFORE
 * first paint, and HeroIntro flips it to "done" (with a 2s failsafe in the boot
 * script itself, so a bundle that never boots cannot leave the hero hidden).
 * Reading the attribute rather than lifting state means the hero reveal is
 * correct in all four cases: intro runs, intro is skipped by a keypress, intro
 * never mounts, and motion is off.
 */
function useIntroDone(): boolean {
  const [done, setDone] = useState(
    () =>
      typeof document === "undefined" ||
      document.documentElement.getAttribute("data-intro") !== "running",
  );
  useEffect(() => {
    if (done) return;
    const el = document.documentElement;
    const check = () => {
      if (el.getAttribute("data-intro") !== "running") setDone(true);
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, { attributes: true, attributeFilter: ["data-intro"] });
    return () => mo.disconnect();
  }, [done]);
  return done;
}

/**
 * One line of the claim, revealing.
 *
 * TWO GESTURES, IN SEQUENCE, AND NEITHER IS A FADE-UP.
 *
 *   1. The line is uncovered from the top down (`clip-path`), rising 16px. That
 *      is under the 24px chrome cap, because a headline entering the viewport
 *      is chrome, not a set piece.
 *   2. Once it is visible it is still set in Redaction 50, the degraded cut,
 *      and only then resolves to the clean face.
 *
 * Step 2 is the reason this page keeps a typeface that dissolves into dots:
 * DESIGN.md says "text arrives set in the degraded cut and resolves to the
 * clean one", and until now the hero, the one place everybody looks, was the
 * only display type on the site that did not do it.
 *
 * The resolve is a CROSSFADE OF TWO SPANS, not a font-family transition, which
 * is not animatable. The struck copy is `aria-hidden` so the line is announced
 * once. Both copies occupy the same box, so nothing reflows between them.
 */
function ClaimLine({ index, children }: { index: number; children: string }) {
  return (
    <span className="ansyra-hero-line" style={{ ["--i" as string]: index }}>
      <span className="ansyra-hero-line-cut" aria-hidden>
        {children}
      </span>
      <span className="ansyra-hero-line-clean">{children}</span>
    </span>
  );
}

/** Real, cited sources. Bain leads because Bain is now the headline claim; a
 *  citation column whose first entry is not the thing being claimed is
 *  decoration. */
const CITATIONS = FEATURED_RESEARCH.slice(0, 3).map((r, i) => ({ n: String(i + 1), src: r.source, year: r.year, note: ["Check the financial evidence", "Challenge the acquisition plan", "Track benefits after closing"][i], href: `/research/${r.slug}` }));

export function Hero() {
  const [showAccess, setShowAccess] = useState(false);
  const reduced = useMotionPref();
  const introDone = useIntroDone();

  // TWO GATES, DELIBERATELY, AND THE SPLIT IS A PERFORMANCE DECISION.
  //
  // The claim is the page's largest contentful paint. Holding it until the
  // opening wordmark finished put ~730ms of animation directly into LCP,
  // measured over Slow 4G with a 4x CPU throttle. So the claim no longer waits
  // for the intro: it starts resolving on its own, one frame after mount, and
  // the wordmark travels across it. One opening, not two in sequence.
  //
  // The supporting content still waits for the intro, because it is not on the
  // LCP path and the staging is worth something there.
  const [claimHold, setClaimHold] = useState(!reduced);
  useEffect(() => {
    if (reduced) return;
    // Two frames: one to paint the held state, one to release it. Releasing in
    // the same frame the element first paints means the browser has no "from"
    // to transition out of and the reveal simply does not run.
    const a = requestAnimationFrame(() => {
      const b = requestAnimationFrame(() => setClaimHold(false));
      cleanup = () => cancelAnimationFrame(b);
    });
    let cleanup = () => cancelAnimationFrame(a);
    return () => cleanup();
  }, [reduced]);

  const hold = !reduced && !introDone;

  return (
    <section
      data-testid="hero"
      className="relative flex w-full flex-col justify-center overflow-hidden"
      /* A FULL VIEWPORT, DISTRIBUTED — not a block of content parked in the
         top third with a screenful of gradient under it.
         `svh`, not `vh`: on mobile Safari `100vh` is the height with the URL
         bar HIDDEN, so a `vh`-tall hero is always taller than the screen you
         are actually looking at and the sources sit below the fold on the one
         device where the fold matters most. */
      style={{ minHeight: "100svh" }}
      /* TRANSPARENT. It used to paint an opaque `--clear`, which is the same
         colour the fixed ground layer already paints — so it changed nothing
         visually except to cover the living field, leaving the first screenful
         flat while every section below it had drifting light. That is most of
         why the hero looked like a different colour from its neighbour. The
         ground belongs to the ground layer; sections sit on it. */
    >
      <HeroScene />

      <div
        data-intro-target
        data-hero={hold ? "hold" : "in"}
        data-claim={claimHold ? "hold" : "in"}
        className="ansyra-hero-content relative z-[1] mx-auto w-full max-w-7xl px-6"
        /* PADDING THAT KNOWS HOW TALL THE SCREEN IS.
           `pt-32 pb-24` is 224px of padding, fixed, inside a content block that
           measured 804px — so on a 700-730px laptop the sources row fell past
           the fold and got clipped mid-line. `svh` units make the padding scale
           with the viewport the way the section's own `100svh` already does.
           The top FLOOR is 96px and not lower: the header is fixed and overlays
           the hero, so anything less puts the claim under the nav. */
        style={{
          paddingTop: "clamp(88px, 10svh, 112px)",
          paddingBottom: "clamp(20px, 3svh, 40px)",
        }}
      >


        {/* The claim runs the FULL measure so the display size can actually be
            display size. Boxed into a half-width column it could never exceed
            ~60px, which is what made the first build read as timid. */}
        {/* Centred. The measure still caps at 26ch so the display size stays
            display size; `mx-auto` is what moves it to the middle rather than
            letting it stretch, which would drop the size to fit the column. */}
        {/* ONE SENTENCE PER LINE, set explicitly.
            The break is the joke: the first line closes, the second takes it
            away. Left to wrap it does not land — `text-balance` evens the two
            lines and breaks after "The", and a 22ch measure breaks in the same
            place, because both are optimising line length rather than meaning.
            Two blocks is the only way the pause falls on the full stop. */}
        <h1
          className="text-center font-display font-normal"
          style={{
            color: "var(--fg)",
            fontSize: "clamp(2.3rem, min(6.3vw, 10svh), 6rem)",
            /* 1.08, not 0.98. A ratio below 1 makes the line box SMALLER than
               the type in it, and measured at 1440 the two lines' boxes were
               touching exactly: `gapBetweenLines: 0`. Line one ends on a full
               stop with no descender and line two opens with "The decision" —
               four ascenders and an apostrophe — so the second line's tallest
               marks ran straight into the first line's baseline.
               Sub-1 leading is a legitimate display trick for a SINGLE line,
               where there is no neighbour to collide with. This headline is
               deliberately two blocks (see the note below on where the pause
               falls), so it never had that licence. 1.08 separated them; 1.16
               is where the two lines read as a couplet with a beat between,
               which is what the break is for.
               The other three `--step-display` call sites were checked and are
               NOT the same bug: InstrumentPages and Ledger set 0.9 on a lone
               `tabular-nums` numeral, and Closing's 1.02 sits under a
               single-line claim. Leave them tight. */
            lineHeight: 1.16,
            letterSpacing: "-0.035em",
            /* Measured against the LONGER line, not against a round number.
               "The decision record shouldn't." is 30 characters and it has to
               hold on ONE line, because the whole point of the two blocks is
               that the pause lands on the first full stop. At 24ch it wrapped
               to three lines in Bespoke Slab, which is wider per character than
               the face this replaced. Size, face and measure are one decision,
               and changing any of the three means re-checking the other two. */
            maxWidth: "31ch",
            marginInline: "auto",
          }}
        >
          <ClaimLine index={0}>The deal closes.</ClaimLine>
          <ClaimLine index={1}>The decision record shouldn&rsquo;t.</ClaimLine>
        </h1>

        {/* Lede, action, and sources share one ruled band. */}
        {/* Centred column. The 7/5 split is gone: an asymmetric grid under a
            centred headline reads as a layout that changed its mind halfway. */}
        {/* Pulled up from `mt-24 pt-16`. Measured at 1440 there were 96px from
            the claim to the rule and another 85px from the rule to the lede —
            181px of nothing through the MIDDLE of the composition, which is
            what read as "the rest of the screen is empty". The hero is a full
            `100svh` on purpose and the air is the point; it just belongs at the
            edges, holding the block, rather than splitting the claim from the
            thing that explains it. */}
        <div className="mt-6 border-t pt-5 md:mt-7 md:pt-6" style={{ borderColor: "var(--fg-rule)" }}>
          <p
            data-hero-item
            className="text-pretty text-center font-sans"
            style={
              {
                color: "var(--fg-2)",
                fontSize: "var(--step-body)",
                lineHeight: 1.65,
                maxWidth: "62ch",
                marginInline: "auto",
                "--i": 2,
              } as React.CSSProperties
            }
          >
            A workspace for mergers and acquisitions (M&amp;A). Find potential acquisitions,
            challenge assumptions, organise evidence, and track results after closing.
            AI helps with research and analysis; your team reviews the evidence and records the decision.
          </p>
          {/* Stacked, not side by side. Centring a button and a note as one ROW
              centres the pair, which leaves the button itself off the page's
              axis — the one element that most needs to sit on it. */}
          <div
            data-hero-item
            className="mt-6 flex flex-col items-center gap-3"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <button
              data-testid="hero-request-access"
              onClick={() => setShowAccess(true)}
              className="ansyra-cta px-7 py-3.5"
              style={{ fontSize: "var(--step-sm)", minHeight: 48 }}
            >
              Request M&amp;A workspace access
              <Icon name="arrow" size={16} />
            </button>
            <span className="font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)" }}>
              Workspace access is reviewed by the administrator.
            </span>
          </div>

          {/* Sources run as one centred row rather than a right-hand column.
              They stay in the hero because the claims rule requires every
              statistic to carry its source, not because they need prominence. */}
          {/* `mt-24` here was 96px of air between the action and the sources —
              the largest single gap left in the hero, and the cheapest to spend.
              It is NOT one of the gaps between the claim and the sentence that
              explains it; those are untouched. */}
          <aside
            data-hero-item
            className="mt-6 md:mt-7"
            aria-label="Sources"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            <ul className="ansyra-sources flex flex-wrap items-start justify-center gap-x-10 gap-y-4">
              {/* No per-citation stagger any more. The <aside> is itself one
                  step of the hero's sequence, and staggering three short
                  sources inside an element that is already arriving is a
                  second animation nobody asked for on top of the first. */}
              {CITATIONS.map((c) => (
                <li
                  key={c.n}
                  className="grid grid-cols-[1.25rem_1fr] gap-x-3"
                  style={{ maxWidth: "30ch" }}
                >
                  <span
                    className="font-sans tabular-nums"
                    style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", lineHeight: 1.5 }}
                  >
                    {c.n}
                  </span>
                  <span>
                    <span className="block font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", lineHeight: 1.5 }}>
                      <a href={c.href} className="underline-offset-4 hover:underline">{c.note}</a>
                    </span>
                    <span className="mt-0.5 block font-sans" style={{ color: "var(--fg-2)", fontSize: "var(--step-xs)", lineHeight: 1.5 }}>
                      {c.src}, {c.year}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        {/* The movements register moved OUT of the hero (B5). Pinning a 4-up
            nav to the bottom of the opening viewport made it "a hero plus a
            nav bar"; the movements now get their own moment directly below and
            the hero gets to be a hero. */}
      </div>

      <HeroIntro />
      <RequestAccessModalLazy open={showAccess} onClose={() => setShowAccess(false)} />
    </section>
  );
}
