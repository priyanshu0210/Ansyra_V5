import { useMotionPref } from "@/hooks/useMotionPref";
import { RESEARCH, TOOLS } from "@/lib/landing-content";
import { SAMPLE_ROWS } from "@/lib/ledger-sample";

// ─────────────────────────────────────────────────────────────────────────────
// B8-still. The hero scene.
//
// A DELIVERABLE, NOT A FALLBACK. The plan gates the WebGL hero behind a
// prototype that has to prove a refractive solid still reads as a lens on a
// LIGHT ground at low roughness. Until that passes, and permanently if it does
// not, this is the hero, and it has to stand on its own rather than look like
// something is missing.
//
// THE REFRACTION IS REAL, IT IS JUST NOT VOLUMETRIC.
// L1 carries a slow drift of actual product strings: instrument names, study
// figures, sample assumptions. Over them sits a genuine glass slab with the
// real --l2-blur backdrop-filter. Text passing under its edge is blurred and
// displaced by the browser's own compositor. That IS refraction; CSS does it
// natively, at zero JS cost, with no second canvas and no LCP risk.
//
// This is sanctioned glass site #2, and it earns it the same way the ledger
// does: there is genuinely something behind it to see through to.
//
// L1 IS NEVER READABLE, and it does not need to be. The strings are real
// because inventing lorem for a page about evidence would be its own kind of
// lie, but they are evidence-as-texture, not content. Everything a reader must
// actually read sits on L2 above.
// ─────────────────────────────────────────────────────────────────────────────

/** Real strings, drawn from the same modules the rest of the page renders.
 *  Never lorem: this is a page about not making things up. */
const DRIFT: string[] = [
  ...TOOLS.slice(0, 6).map((t) => t.name.replace("™", "")),
  ...RESEARCH.map((r) => `${r.headline}  ${r.source}`),
  ...SAMPLE_ROWS.map((r) => r.assumption),
  "Sign-off blocked",
  "Grounded 38",
  "Red flag 91",
  "Project Harrow",
];

/** Three columns at different speeds. Uneven, so the field never pulses. */
const COLUMNS = [
  { left: "2%", dur: "48s", delay: "0s", slice: [0, 7] as const },
  { left: "38%", dur: "63s", delay: "-21s", slice: [7, 14] as const },
  { left: "72%", dur: "55s", delay: "-9s", slice: [14, 22] as const },
];

export function HeroScene() {
  const reduced = useMotionPref();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* L1. Evidence, drifting.
          Opacity 0.16, not 0.4. At 0.4 the strings were legible above the
          slab's edge and collided with the header, which breaks the one rule
          this layer has: evidence is texture here, and anything a reader can
          actually read belongs on L2. At 0.16 a string composites to roughly
          1.15:1 against the ground, which is presence without content.
          Inset from the top so it clears the fixed header entirely. */}
      {/* Desktop only (`hidden md:block`). Below md the three columns are 26% of
          a 375px viewport — about 97px — while every string is
          `whitespace-nowrap`, so they overrun their columns and cross each
          other. Overlapping translucent text COMPOUNDS: two strings at 0.16
          composite far above the 1.15:1 this layer is allowed, and the top of
          the hero turned into a legible jumble behind the logo and hamburger.
          That breaks both of this layer's rules at once — never readable, and
          clear of the fixed header. There is no room for a texture field at
          that width, so it does not render; the slab and its chromatic edge
          still do, and they are what the hero is actually made of. */}
      <div
        className="absolute inset-x-0 bottom-0 hidden md:block"
        /* `overflow: hidden` is load-bearing, not tidiness. The columns animate
           to translate3d(0, -50%, 0), so without clipping they ride straight up
           out of this box and paint behind the fixed header — the outer wrapper
           only clips at inset-0, which INCLUDES the header strip. The `top: 9%`
           inset alone therefore never held once the drift was moving; at 768 the
           strings were crossing the nav links outright. Clipping here is what
           actually makes the comment above true. */
        /* A FIXED inset, not a percentage. `top: 9%` was 9% of the hero, which
           has nothing to do with how tall the header is: it measured ~77px at
           1440 but left strings under the nav at 768. The header is a fixed
           ~85px plus the safe-area inset, so the clearance is expressed in the
           same terms. */
        style={{
          top: "calc(env(safe-area-inset-top) + 104px)",
          opacity: 0.16,
          overflow: "hidden",
        }}
      >
        {COLUMNS.map((col, i) => (
          <div
            key={i}
            className={reduced ? undefined : "ansyra-hero-drift"}
            style={{
              position: "absolute",
              left: col.left,
              top: 0,
              width: "26%",
              animationDuration: col.dur,
              animationDelay: col.delay,
            }}
          >
            {DRIFT.slice(...col.slice)
              .concat(DRIFT.slice(...col.slice))
              .map((s, j) => (
                <p
                  key={j}
                  className="whitespace-nowrap font-sans"
                  style={{
                    color: "var(--fg-2)",
                    fontSize: "var(--step-sm)",
                    lineHeight: 2.6,
                  }}
                >
                  {s}
                </p>
              ))}
          </div>
        ))}
      </div>

      {/* L2. The slab. Real backdrop-filter, so the drift genuinely bends and
          offsets under its edge rather than being faked with a gradient.

          NO TINT AND NO ELEVATION, and no hard rectangle.
          It used to carry `--glass-light` plus `--elev-3`, which made the hero
          a visibly lighter panel with a shadowed edge — so the first screenful
          read as a different colour from the section immediately below it and
          the scroll had a seam across it. A pane of glass lying ON the ground
          does not lighten the ground; it bends what is behind it. So the tint
          and the drop shadow are gone and only the refraction remains, feathered
          at every edge by a mask so the effect has no boundary to notice. */}
      <div
        className="absolute"
        style={{
          left: "-6%",
          right: "-6%",
          top: "12%",
          bottom: "8%",
          backdropFilter: "var(--l2-blur)",
          WebkitBackdropFilter: "var(--l2-blur)",
          // VERTICAL fade, not radial. The slab's left and right edges are
          // already off-screen at -6%, so the only edges a reader can see are
          // the top and the bottom — and a radial mask barely feathers those,
          // which left a visible horizontal seam across the page where the
          // backdrop-filter stopped. Fading on the axis that actually has an
          // edge is what removes it.
          maskImage:
            "linear-gradient(to bottom, transparent 0%, #000 22%, #000 66%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, #000 22%, #000 66%, transparent 100%)",
        }}
      />

      {/* The chromatic edge: prism above, caustic below, which is what a real
          glass edge does.

          As a BLOOM, not a hairline. The 1px inset rules this replaces drew two
          hard horizontal lines across the page — the top one landed just under
          the header and was the most visible seam of the lot. Dispersion at a
          glass edge is a soft falloff, so it is drawn as one, and feathered on
          the same mask as the slab so it ends where the slab ends. */}
      <div
        className="absolute"
        style={{
          left: "-6%",
          right: "-6%",
          top: "12%",
          bottom: "8%",
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--prism) 22%, transparent) 0%, transparent 16%, transparent 84%, color-mix(in srgb, var(--caustic) 18%, transparent) 100%)",
          // VERTICAL fade, not radial. The slab's left and right edges are
          // already off-screen at -6%, so the only edges a reader can see are
          // the top and the bottom — and a radial mask barely feathers those,
          // which left a visible horizontal seam across the page where the
          // backdrop-filter stopped. Fading on the axis that actually has an
          // edge is what removes it.
          maskImage:
            "linear-gradient(to bottom, transparent 0%, #000 22%, #000 66%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, #000 22%, #000 66%, transparent 100%)",
        }}
      />
    </div>
  );
}
