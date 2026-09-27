#!/usr/bin/env node
/**
 * Refraction contrast gate.
 *
 * The point of this script is one specific mistake: measuring a text token
 * against the BARE GROUND. On this design no text sits on a bare ground. It
 * sits on L2 glass, which is a translucent panel composited over a drifting L1
 * layer. Measuring the ground measures a surface the reader never sees, and
 * doing exactly that already produced two failures on paper (3.72:1 on light,
 * 3.83:1 on dark) that both looked fine in the token table.
 *
 * So every role is measured three ways:
 *   1. bare ground                      — the easy case
 *   2. L2 glass composited over L1      — the case the reader actually gets
 *   3. unresolved state at its floor    — the dimmed case
 *
 * Run: node scripts/contrast.mjs
 * Exits non-zero if any role fails, which is what makes the Phase 0 gate real.
 */

import { loadCss, resolve, resolveNumber, resolvePercent, rgb, themeScopes } from "./css-tokens.mjs";

// ── tokens, READ OUT OF THE CSS ─────────────────────────────────────────────
//
// This block used to be a hand-written object described as a "mirror of :root in
// src/index.css". Three of its values had silently diverged (`--caustic`,
// `--prism`, `--settle`), so every row using them measured a colour the product
// does not ship — the third recorded instance of that exact failure here, and
// the second where the fix was to correct the copy. The copy is gone. Values and
// `color-mix()` formulas both come from the stylesheet now; see
// scripts/css-tokens.mjs.
const { text: cssText, from: cssFrom, built: cssBuilt, stale: cssStale } = loadCss();
// CHECKED FIRST, before a single token is read.
//
// This guard used to live at the bottom, next to the failure count — and a
// stale `dist` therefore blew up on `undefined token: --l1-opacity-max` from
// three call frames deep instead of saying "your build is old". A precondition
// that reports itself only after the work it was meant to gate is not a
// precondition.
if (cssStale) {
  console.error(
    `\nThe built CSS is older than src/index.css.\n` +
      `Run \`npm run build\`, or delete dist/ to gate the source instead.\n`,
  );
  process.exit(1);
}

const S = themeScopes(cssText);

/** A token, resolved in a theme, as `[r,g,b]`. */
const tok = (name, theme = "light") => rgb(resolve(name, S[theme]));
const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
/** A token as a hex string, for rows that pass a colour rather than a surface. */
const tokHex = (name, theme = "light") => toHex(tok(name, theme));

const T = {
  // Light theme: TWO pastel grounds, both carrying dark text.
  clear: tokHex("--ground-a"),
  groundB: tokHex("--ground-b"),
  groundDeep: tokHex("--ground-deep"),
  float: tokHex("--float"),
  surfaceB: tokHex("--surface-b"),
  // Dark theme: two greens, dark to darker. No second hue.
  medium: tokHex("--ground-a", "dark"),
  mediumB: tokHex("--ground-b", "dark"),
  mediumDeep: tokHex("--ground-deep", "dark"), // terminus only, never a surface
  inkNext: tokHex("--ink-next"),
  hazeInk: tokHex("--haze-ink"),
  inkInv: tokHex("--ink-inv"),
  haze: tokHex("--haze"),
  caustic: tokHex("--caustic"),
  prism: tokHex("--prism"),
  flare: tokHex("--flare"),
  settle: tokHex("--settle"),
  flagTextDark: tokHex("--sev-flag-text", "dark"),
  flagTextLight: tokHex("--sev-flag-text"),
  watchTextLight: tokHex("--sev-watch-text"),
  watchTextDark: tokHex("--sev-watch-text", "dark"),
  groundedTextLight: tokHex("--sev-grounded-text"),
  groundedTextDark: tokHex("--sev-grounded-text", "dark"),
  // Was a pasted `#8a6a3c`, then a pasted `#83612c` after the rail moved —
  // a derived value copied by hand, twice, which is the pattern this file is
  // meant to have stopped.
  railAccentLight: tokHex("--rail-accent", "light"),
  sevFlagLight: tokHex("--sev-flag"),
  sevWatchLight: tokHex("--sev-watch"),
  sevGroundedLight: tokHex("--sev-grounded"),
  // --on-accent: the label on an amber fill. Fixed, NOT theme-varied.
  onAccent: tokHex("--on-accent"),
  // The one value that is deliberately a LITERAL: it appears in the BANNED rows
  // precisely because no token has it. `color: "#fff"` written by hand is the
  // bug those rows exist to keep out, so it must not be resolved from anything.
  white: "#ffffff",
};

// Glass is an rgba() token, so its colour AND its alpha are read rather than
// restated. `--glass-light` is redefined on the dark theme to the dark glass —
// modelled here as the two `:root` tokens, which is what the landing composites.
const glassLightTok = resolve("--glass-light", S.light);
const glassDarkTok = resolve("--glass-dark", S.light);
const GLASS_LIGHT_RGB = rgb(glassLightTok);
const GLASS_LIGHT_A = glassLightTok[3];
const GLASS_DARK_RGB = rgb(glassDarkTok);
const GLASS_DARK_A = glassDarkTok[3];

const UNRESOLVED_FLOOR = resolveNumber("--unresolved-floor", S.light);

// L1 WAS THE LAST HAND-CHOSEN NUMBER HERE, AND IT IS GONE.
//
// The drift layer's opacity used to be a literal 0.4 in this file: harsher than
// the `--l1-opacity` ceiling of 0.25, short of the 0.55 the stylesheet allowed
// in a comment, and chosen by nobody in particular. Both bounds are tokens now
// (`--l1-opacity`, `--l1-opacity-max`), so the gate sweeps the range the DESIGN
// sanctions instead of a point a script invented.
//
// THE TWO BANDS ARE NOT THE SAME SURFACE, and that distinction is the whole
// reason a single number was wrong. Constitution §3: *glass over a live L1
// carries primary text only* — captions, source lines and index markers sit on
// solid surfaces. So:
//
//   0 … --l1-opacity       an ordinary drift. Anything may sit on it, primary
//                          and secondary text alike.
//   … --l1-opacity-max     the refracting-solid exception. PRIMARY TEXT ONLY,
//                          because that is all the constitution permits there.
//
// Measured, this is not academic: at 0.55 `--haze` (secondary) on dark glass
// falls to 4.12:1, while `--ink-inv` (primary) holds 4.69:1. A gate that swept
// the full range for BOTH roles would report a failure the design does not
// actually allow to happen; one that swept neither — the old 0.4 — was simply
// guessing. Each role is now swept over the band it is allowed to occupy.
const L1_CEILING = resolveNumber("--l1-opacity", S.light);
const L1_MAX = resolveNumber("--l1-opacity-max", S.light);
if (L1_MAX < L1_CEILING) {
  throw new Error(`--l1-opacity-max (${L1_MAX}) is below --l1-opacity (${L1_CEILING})`);
}

/** The worst-case glass SURFACE for `ink`, sweeping the drift over 0..max. */
const sweepGlass = (ink, glassTok, driftInk, ground, max) => {
  let worst = { opacity: 0, ratio: Infinity, surface: null };
  for (let i = 0; i <= 20; i++) {
    const opacity = (max * i) / 20;
    const l1 = over(hex(driftInk), hex(ground), opacity);
    const surface = over(rgb(glassTok), l1, glassTok[3]);
    const r = ratio(hex(ink), surface);
    if (r < worst.ratio) worst = { opacity, ratio: r, surface };
  }
  return worst;
};

// ── colour maths (WCAG 2.1) ─────────────────────────────────────────────────
const hex = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const lum = (rgbv) => 0.2126 * lin(rgbv[0]) + 0.7152 * lin(rgbv[1]) + 0.0722 * lin(rgbv[2]);

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Composite `fg` over `bg` at alpha `a`. */
const over = (fg, bg, a) => fg.map((c, i) => Math.round(a * c + (1 - a) * bg[i]));

// ── the surfaces text actually lands on ─────────────────────────────────────
// Light: dark evidence drifting on --clear, then the glass panel over it.
const l1Light = over(hex(T.inkNext), hex(T.clear), L1_CEILING);
const glassLight = over(GLASS_LIGHT_RGB, l1Light, GLASS_LIGHT_A);

// Dark: light evidence drifting on --medium, then the glass panel over it.
const l1Dark = over(hex(T.haze), hex(T.medium), L1_CEILING);
const glassDark = over(GLASS_DARK_RGB, l1Dark, GLASS_DARK_A);

// Primary text may sit on glass anywhere in the sanctioned range, including the
// refracting-solid exception. Secondary text may not go past the ordinary
// ceiling — constitution §3 — so it is swept only that far.
const gPrimaryLight = sweepGlass(T.inkNext, glassLightTok, T.inkNext, T.clear, L1_MAX);
const gSecondLight = sweepGlass(T.hazeInk, glassLightTok, T.inkNext, T.clear, L1_CEILING);
const gPrimaryDark = sweepGlass(T.inkInv, glassDarkTok, T.haze, T.medium, L1_MAX);
const gSecondDark = sweepGlass(T.haze, glassDarkTok, T.haze, T.medium, L1_CEILING);
const at = (w) => `L2 glass @L1 ${w.opacity.toFixed(2)}`;

// These four were re-implementations of `color-mix()` with a literal percentage
// — the same formula written twice, in two languages, only one of which was the
// product. `--rail` in particular was cut from the wrong token for a whole pass
// and this script agreed with the mistake because it had been taught the same
// mistake. They are lookups now, so the CSS is the only place the recipe lives.
const surfaceDark = tok("--fg-surface", "dark");
const surfaceBDark = tok("--surface-b", "dark");
const railLight = tok("--rail", "light");
const railDark = tok("--rail", "dark");

// CounselMark's wash on the legal pages: `--sev-watch` over the card the legal
// prose sits on. Measured as COMPOSITED, not as the card alone, because the wash
// is the thing that moves the number — `--sev-watch` is a bright amber and
// `--sev-watch-text` is also light, so on the dark card the tint lightens the
// ground out from under its own label. At the 12% it shipped with, this measured
// 4.45:1: an AA failure that no row existed to catch, because the only `-text`
// rows nearby gate severity MARKS at AA_LARGE as non-text graphics. This one is
// words, at `--step-xs`, so it owes the full 4.5.
const COUNSEL_WASH = 0.08;
const counselMarkDark = over(tok("--sev-watch", "dark"), surfaceDark, COUNSEL_WASH);
const counselMarkLight = over(tok("--sev-watch", "light"), hex(T.float), COUNSEL_WASH);

// ── GRADIENT STACKS ─────────────────────────────────────────────────────────
//
// Everything above this point measures text against ONE surface. The ambient
// light source is three gradient layers stacked over the ground, and that
// difference is not academic: the first version of it was verified by measuring
// the core ALONE at 5.94:1 and shipped with the three layers together putting
// `--fg-2` on the dark ground at 3.48:1. A stack checked one layer at a time is
// not checked.
//
// The alphas come from `--beam-bloom` / `--beam-core` / `--beam-ray`, the same
// tokens LivingField paints with, so this cannot drift from the beam.
//
// ONE composite — ground -> bloom -> core — because the light is a single
// radial with a falloff and nothing else. An earlier version drew a ring of
// rays around it, which needed a second composite AND a rule that the two never
// overlap; deleting the rays deleted both, and deleted the gap between the lamp
// and its own light along with them.
//
// This is gated on the LANDING grounds, which is where the beam renders, and in
// both themes — `Ground` is `fixed`, so the source sits at the middle of the
// screen at every scroll offset and text passes through it all the way down.
const beam = {
  bloom: resolvePercent("--beam-bloom", S.light),
  core: resolvePercent("--beam-core", S.light),
};

/** Composite the beam over a theme's ground. BOTH layers are `--prism` now:
 *  the light was amber, and a hot orange point in the middle of a green ground
 *  read as a different system rather than as this one lit. */
const beamOver = (theme) => {
  const ground = tok("--ground-a", theme);
  const withBloom = over(tok("--prism", theme), ground, beam.bloom);
  return over(tok("--prism", theme), withBloom, beam.core);
};

const beamCoreDark = beamOver("dark");
const beamCoreLight = beamOver("light");

// B2's ledger: a glass panel over a per-row BACKLIGHT, which is the one place
// on the site where glass sits over something other than a drift. The backlight
// is a known colour at a known opacity rather than arbitrary moving content, so
// unlike the drift case it can be measured exactly instead of bounded.
// Worst case for legibility is the brightest backlight (red flag, 100%
// illumination) since it lifts the surface furthest toward the text.
const LEDGER_BACKLIGHT_A = 0.22; // ceiling used by the red-flag row
const ledgerLit = over(hex(T.flare), hex(T.mediumDeep), LEDGER_BACKLIGHT_A);
const ledgerGlass = over(GLASS_DARK_RGB, ledgerLit, GLASS_DARK_A);

// THE DEAD BAND IS GONE, and this is the assertion that keeps it gone.
//
// It existed because the arc crossfaded a LIGHT ground to a DARK one: halfway
// across, the ground was a mid teal-grey where neither text role cleared 4.5:1
// (dark bottomed out at 4.02, light at 4.05), so ~700px of the page had to stay
// empty to avoid putting text in it.
//
// Both grounds in a theme are now on the same side of the luminance divide:
// two pastels in the light theme, two greens in the dark one. So the text role
// never inverts mid-arc, and EVERY point of the crossfade is safe. The rows
// below sweep the whole 0..1 range at both ends of the theme, which is a
// strictly stronger check than the two boundary rows it replaces.
const arcSweep = (from, to, ink) => {
  const worst = [];
  for (let i = 0; i <= 20; i++) {
    const g = over(hex(to), hex(from), i / 20);
    worst.push([i / 20, ratio(hex(ink), g)]);
  }
  return worst.sort((a, b) => a[1] - b[1])[0]; // [phase, ratio] at its worst
};
const arcLight = arcSweep(T.clear, T.groundB, T.inkNext);
const arcDark = arcSweep(T.medium, T.mediumB, T.inkInv);

const AA = 4.5; // normal text
const AA_LARGE = 3.0; // >=24px or >=19px bold

const checks = [
  // role, colour, surface, surface label, threshold
  ["--ink-next", T.inkNext, hex(T.clear), "bare --clear", AA],
  ["--ink-next on glass / light", T.inkNext, gPrimaryLight.surface, at(gPrimaryLight), AA],
  ["--haze-ink", T.hazeInk, hex(T.clear), "bare --clear", AA],
  ["--haze-ink on glass / light", T.hazeInk, gSecondLight.surface, at(gSecondLight), AA],
  ["--haze-ink", T.hazeInk, hex(T.float), "--float (solid card)", AA],
  ["--ink-inv", T.inkInv, hex(T.medium), "bare --medium", AA],
  ["--ink-inv", T.inkInv, hex(T.mediumDeep), "bare --medium-deep", AA],
  ["--ink-inv on glass / dark", T.inkInv, gPrimaryDark.surface, at(gPrimaryDark), AA],
  ["--ink-inv", T.inkInv, surfaceDark, "--fg-surface / dark", AA],
  ["--haze", T.haze, hex(T.medium), "bare --medium", AA],
  ["--haze on glass / dark", T.haze, gSecondDark.surface, at(gSecondDark), AA],
  ["--haze", T.haze, hex(T.mediumDeep), "bare --medium-deep", AA],
  ["--haze", T.haze, surfaceDark, "--fg-surface / dark", AA],
  // The arc, swept end to end. If either of these fails, a dead band is back.
  [
    "--ink-next across arc / light",
    null,
    over(hex(T.groundB), hex(T.clear), arcLight[0]),
    `worst phase ${arcLight[0].toFixed(2)}`,
    AA,
    hex(T.inkNext),
  ],
  [
    "--ink-inv across arc / dark",
    null,
    over(hex(T.mediumB), hex(T.medium), arcDark[0]),
    `worst phase ${arcDark[0].toFixed(2)}`,
    AA,
    hex(T.inkInv),
  ],
  // Ground B carries text in its own right now, so it is measured directly.
  ["--ink-next on ground B", T.inkNext, hex(T.groundB), "--ground-b (mint)", AA],
  ["--haze-ink on ground B", T.hazeInk, hex(T.groundB), "--ground-b (mint)", AA],
  ["--haze-ink on B surface", T.hazeInk, hex(T.surfaceB), "--surface-b", AA],
  ["--ink-inv on dark ground B", T.inkInv, hex(T.mediumB), "--ground-b (dark)", AA],
  ["--haze on dark ground B", T.haze, hex(T.mediumB), "--ground-b (dark)", AA],
  // The unresolved state: token composited at its own floor, then measured.
  [
    "--haze @0.85 (unresolved)",
    null,
    hex(T.medium),
    "bare --medium",
    AA,
    over(hex(T.haze), hex(T.medium), UNRESOLVED_FLOOR),
  ],
  [
    "--haze-ink @0.85 (unresolved)",
    null,
    hex(T.clear),
    "bare --clear",
    AA,
    over(hex(T.hazeInk), hex(T.clear), UNRESOLVED_FLOOR),
  ],
  // The CTA. White on amber is the bug this row exists to keep out.
  ["--ink-next on --caustic", T.inkNext, hex(T.caustic), "--caustic fill", AA],
  ["#fff on --caustic (BANNED)", T.white, hex(T.caustic), "--caustic fill", AA],
  // Severity labels sit on the dark ground at >=19px semibold, so AA-large.
  ["--prism", T.prism, hex(T.mediumDeep), "--medium-deep", AA_LARGE],
  // Severity is a ROLE, not a fixed hue: the dark-ground trio fails on light
  // (--flare is 2.92:1 on --clear) and the light-ground trio fails on dark
  // (#a8301b is 2.45:1 on --medium-deep). Both halves are asserted, because
  // the ledger moved from one ground to the other in A2 and would otherwise
  // have shipped unreadable. These carry text, so AA, not AA-large.
  ["--sev-flag / light", T.sevFlagLight, hex(T.clear), "--clear", AA],
  ["--sev-watch / light", T.sevWatchLight, hex(T.clear), "--clear", AA],
  ["--sev-grounded / light", T.sevGroundedLight, hex(T.clear), "--clear", AA],
  ["--sev-flag / dark", tokHex("--sev-flag", "dark"), hex(T.mediumDeep), "--medium-deep", AA_LARGE],
  ["--sev-watch / dark", tokHex("--sev-watch", "dark"), hex(T.mediumDeep), "--medium-deep", AA_LARGE],
  ["--sev-grounded / dark", tokHex("--sev-grounded", "dark"), hex(T.mediumDeep), "--medium-deep", AA_LARGE],
  // Severity text sits on --fg-surface (a SOLID panel), never on glass over a
  // live drift. That is not a dodge, it is constitution §3: glass over live L1
  // carries primary text only, and severity labels are caption-scale. Measuring
  // them on glass is how that rule got discovered the hard way (--flare read
  // 2.16:1 there), so these rows assert the surface they actually land on.
  ["--sev-flag / dark panel", tokHex("--sev-flag", "dark"), surfaceDark, "--fg-surface / dark", AA_LARGE],
  ["--sev-watch / dark panel", tokHex("--sev-watch", "dark"), surfaceDark, "--fg-surface / dark", AA_LARGE],
  ["--sev-grounded / dark panel", tokHex("--sev-grounded", "dark"), surfaceDark, "--fg-surface / dark", AA_LARGE],
  // DANGER AT SMALL SIZES. The rows above check --sev-flag at AA-large, which
  // is right for a >=19px severity label and wrong for an 11px row action like
  // "Delete". That gap shipped: on the dark panel the button measured 3.06:1
  // and read as disabled. --sev-flag-text is the same role solved for body text.
  ["--sev-flag-text / dark panel", T.flagTextDark, surfaceDark, "--fg-surface / dark", AA],
  ["--sev-flag-text / dark ground B", T.flagTextDark, surfaceBDark, "--surface-b / dark", AA],
  ["--sev-flag-text / light card", T.flagTextLight, hex(T.float), "--float", AA],
  ["--sev-flag-text / light B", T.flagTextLight, hex(T.surfaceB), "--surface-b", AA],
  // THE RAIL (Operate's second neutral layer, D2). Three roles land on it, and
  // the accent one is NOT text: the current-instrument marker is a graphic that
  // conveys state, so it owes 3:1 under WCAG 1.4.11. The base `--caustic`
  // measured 1.75:1 on the light rail, which is why `--rail-accent` exists.
  ["--fg on rail / dark", T.inkInv, railDark, "--rail / dark", AA],
  ["--fg-2 on rail / dark", T.haze, railDark, "--rail / dark", AA],
  ["--rail-accent on rail / dark", tokHex("--rail-accent", "dark"), railDark, "--rail / dark", AA_LARGE],
  ["--fg on rail / light", T.inkNext, railLight, "--rail / light", AA],
  ["--fg-2 on rail / light", T.hazeInk, railLight, "--rail / light", AA],
  ["--rail-accent on rail / light", T.railAccentLight, railLight, "--rail / light", AA_LARGE],
  // SEVERITY ON A PANEL: THE `-text` CUTS ARE FOR TEXT, SO THEY OWE AA.
  //
  // These rows used to sit at AA_LARGE, described as "marks" — graphics that
  // convey state, owing 3:1 under WCAG 1.4.11. That reading was wrong about its
  // own tokens. `--sev-flag-text` is NAMED for body text and `severity.ts`
  // hands it out as `textColor`; gating the text cut as if it were a graphic
  // set the bar 1.5 points below the thing it exists to guarantee, and left the
  // watch and grounded cuts with no AA row at all.
  //
  // Promoted to AA, which is strictly stronger and which every one of them
  // already cleared (4.52-6.59). A genuine mark drawn in a `-text` cut still
  // passes; it just is not what these rows are asserting any more.
  ["--sev-flag-text / dark card", T.flagTextDark, surfaceDark, "--fg-surface / dark", AA],
  ["--sev-watch-text / dark card", T.watchTextDark, surfaceDark, "--fg-surface / dark", AA],
  ["--sev-grounded-text / dark card", T.groundedTextDark, surfaceDark, "--fg-surface / dark", AA],
  ["--sev-flag-text / light card", T.flagTextLight, hex(T.float), "--float", AA],
  ["--sev-watch-text / light card", T.watchTextLight, hex(T.float), "--float", AA],
  ["--sev-grounded-text / light card", T.groundedTextLight, hex(T.float), "--float", AA],
  // AND THE BASE TOKENS, ASSERTED AS FAILURES FOR TEXT ON A CARD.
  //
  // Not hypothetical. Eighteen call sites across the dashboard were setting
  // `color: var(--sev-watch)` and friends directly — the BASE token, which is
  // the graphic cut — on `--fg-surface`. On dark that is 3.06:1 for a red flag
  // and 4.38:1 for grounded: an unreadable label and a marginal one, on a
  // surface where the correct token was one word away. They read fine on light
  // only because the base and the `-text` cut are the same value there, which
  // is exactly how it survived review.
  //
  // These rows encode the rule in the gate rather than in a comment: if someone
  // "fixes" the base tokens so they pass as text, the `-text` cuts have lost
  // their reason to exist and this row goes red to say so.
  ["--sev-flag as text / dark card (BANNED)", tokHex("--sev-flag", "dark"), surfaceDark, "--fg-surface / dark", AA],
  ["--sev-grounded as text / dark card (BANNED)", tokHex("--sev-grounded", "dark"), surfaceDark, "--fg-surface / dark", AA],
  // The counsel placeholder on /legal/terms and /legal/privacy — TEXT, so AA,
  // and measured on the wash rather than on the bare card. See COUNSEL_WASH.
  ["CounselMark / dark", T.watchTextDark, counselMarkDark, "--sev-watch 8% on card / dark", AA],
  ["CounselMark / light", T.watchTextLight, counselMarkLight, "--sev-watch 8% on card / light", AA],
  // THE AMBER CTA, CHECKED ON THE TOKEN THE CSS ACTUALLY USES.
  //
  // There was already a `#fff on --caustic (BANNED)` row here, and the landing
  // still shipped light-on-amber at 1.85:1 — because the banned row measured a
  // LITERAL nobody writes, while the stylesheet said `color: var(--ink-next)`,
  // which the dark theme flips to #eaf2f1. A gate that checks a colour the code
  // does not use cannot catch the colour it does.
  ["--on-accent on --caustic (primary CTA)", T.onAccent, hex(T.caustic), "--caustic fill", AA],
  ["--ink-next/dark on --caustic (BANNED)", T.inkInv, hex(T.caustic), "--caustic fill", AA],
  // THE PRIMARY BUTTON, WHICH NOTHING WAS CHECKING.
  //
  // The dashboard's primary CTA is `background: var(--fg)` with the label in
  // `var(--clear)` — a filled pill in the ink colour, label in the ground. It
  // is the most-used control in the product and there was no row for it, which
  // is how fourteen of them shipped with `color: "#fff"` hardcoded instead.
  //
  // That was correct exactly once: when the dashboard was light-only, `--fg`
  // was dark ink and white sat on it fine. Refraction II made dark the default,
  // `--fg` became #eaf2f1, and every one of those buttons turned into white on
  // near-white — measured live at **1.14:1**, an invisible label on Draft with
  // AI, Generate IC memo, Add milestone, Post, Save and the rest.
  //
  // Same root cause as the `--sev-*` cuts above and the "the dashboard also
  // stays light" comment: a light-only assumption that outlived the theme
  // change. These two rows are what stop the next one.
  ["--clear on --fg / dark (primary button)", T.medium, hex(T.inkInv), "--fg / dark", AA],
  ["--clear on --fg / light (primary button)", T.clear, hex(T.inkNext), "--fg / light", AA],
  // And the banned alternative, asserted as a FAILURE so the row itself
  // documents why the label is not simply white.
  ["#fff on --fg / dark (BANNED)", T.white, hex(T.inkInv), "--fg / dark", AA],
  // THE AMBIENT BEAM, COMPOSITED. Four surfaces x two text roles. `--fg-2` on
  // the dark ground is the binding pair and the reason the core stops at 32%.
  ["--fg on beam core / dark", T.inkInv, beamCoreDark, "bloom+core / dark", AA],
  ["--fg-2 on beam core / dark", T.haze, beamCoreDark, "bloom+core / dark", AA],
  ["--fg on beam core / light", T.inkNext, beamCoreLight, "bloom+core / light", AA],
  ["--fg-2 on beam core / light", T.hazeInk, beamCoreLight, "bloom+core / light", AA],
  // B2 ledger rows: primary text on glass over the brightest backlight.
  ["--ink-inv / lit ledger row", T.inkInv, ledgerGlass, "glass over backlight", AA],
  ["--haze / lit ledger row", T.haze, ledgerGlass, "glass over backlight", AA],
  // The backlight itself is a graphic: 3:1.
  ["--sev-flag backlight / lit row", T.flare, ledgerGlass, "glass over backlight", AA_LARGE],
  // THE LABEL ON THAT ROW IS WORDS, AND IT IS 19px AT WEIGHT 400.
  //
  // WCAG's large-text allowance needs >=18.66px BOLD or >=24px regular; 19/400
  // is neither, so it owes the full 4.5. This row used to be the AA_LARGE one
  // above, which was true while the label was `--step-lead` (20-26px) and
  // stopped being true the moment the 3-up carousel rebuild set it to a flat
  // 19px — a size change silently moving a threshold, with the gate still
  // green because the row it had was the graphic's.
  // The base cut measures 3.96 here. The `-text` cut, which is what a label
  // should have been using all along, measures 5.83.
  ["--sev-flag-text label / lit row", T.flagTextDark, ledgerGlass, "glass over backlight", AA],
  ["--sev-flag base as label (BANNED)", T.flare, ledgerGlass, "glass over backlight", AA],
];

// ── SURFACE SEPARATION ──────────────────────────────────────────────────────
//
// Everything above measures TEXT ON a colour. That is a different question from
// whether two ADJACENT SURFACES can be told apart, and this gate could not ask
// the second one — which is how the sidebar came to be the same value as the
// working area it sits against (1.009:1) while every row here stayed green.
//
// Contrast ratio is a poor instrument for this and it is used anyway, because
// it is the one already in the file and the failure it has to catch is not
// subtle: two surfaces at 1.0 are THE SAME COLOUR. The floor is set at 1.15 —
// well under the ~1.25 the working pairs measure, so ordinary retuning does not
// trip it, and well over the 1.0-1.02 that means a layer has vanished. It is a
// smoke alarm, not a design tool.
//
// Not a WCAG rule. 1.4.11 governs meaningful graphics against their
// backgrounds; a panel edge that also carries a 1px border is not that. This
// exists because the repo has now shipped this exact defect twice.
const SEPARATION_FLOOR = 1.15;

const surfacePairs = [
  // [label, surface A, surface B]
  // The dashboard's three layers. `<main>` paints --clear; cards paint
  // --fg-surface; the sidebar paints --rail.
  ["sidebar vs working ground / dark", railDark, hex(T.medium)],
  ["sidebar vs working ground / light", railLight, hex(T.clear)],
  ["card vs working ground / dark", surfaceDark, hex(T.medium)],
  ["card vs working ground / light", hex(T.float), hex(T.clear)],
  ["sidebar vs card / dark", railDark, surfaceDark],
  ["sidebar vs card / light", railLight, hex(T.float)],
  // The standalone pages: `.ansyra-page-ground` is --rail, the card is
  // --fg-surface. Same pair as "sidebar vs card", named for where it is seen.
  ["page ground vs card / dark", railDark, surfaceDark],
  ["page ground vs card / light", railLight, hex(T.float)],
];

const EXPECT_FAIL = new Set([
  "#fff on --caustic (BANNED)",
  "#fff on --fg / dark (BANNED)",
  "--ink-next/dark on --caustic (BANNED)",
  // Only flag and grounded. `--sev-watch` as text on the dark card measures
  // 4.63 and would NOT fail, so asserting it here would be a lie about the
  // contrast. The rule that covers all three uniformly — use the `-text` cut
  // for text — is enforced as a source guard in
  // src/lib/severity-usage.test.ts, because it is a rule about which token you
  // reach for, not a fact about a ratio.
  "--sev-flag as text / dark card (BANNED)",
  "--sev-grounded as text / dark card (BANNED)",
  "--sev-flag base as label (BANNED)",
]);

let failed = 0;
const rows = [];

for (const [role, colour, surface, surfaceLabel, threshold, override] of checks) {
  const fg = override ?? hex(colour);
  const r = ratio(fg, surface);
  const banned = EXPECT_FAIL.has(role);
  const ok = banned ? r < threshold : r >= threshold;
  if (!ok) failed++;
  rows.push({
    role,
    on: surfaceLabel,
    ratio: r.toFixed(2),
    need: threshold.toFixed(1),
    status: banned ? (r < threshold ? "ok (correctly fails)" : "REGRESSION") : ok ? "ok" : "FAIL",
  });
}

const w = (s, n) => String(s).padEnd(n);
console.log("\nRefraction contrast gate");
// Say what was measured. "The gate passed" means less if nobody can tell
// whether it read the shipped stylesheet or the source it was built from.
console.log(
  cssBuilt
    ? `tokens read from ${cssFrom} (built)${cssStale ? " — STALE, src/index.css is newer; run `npm run build`" : ""}\n`
    : `tokens read from ${cssFrom} (SOURCE — run \`npm run build\` to gate the shipped CSS)\n`,
);
console.log(
  w("role", 30) + w("on", 24) + w("ratio", 8) + w("need", 7) + "status",
);
console.log("-".repeat(90));
for (const r of rows) {
  console.log(w(r.role, 30) + w(r.on, 24) + w(r.ratio, 8) + w(r.need, 7) + r.status);
}

console.log("\nsurface separation (can two adjacent layers be told apart?)\n");
console.log(w("pair", 40) + w("ratio", 8) + w("need", 7) + "status");
console.log("-".repeat(90));
for (const [label, a, b] of surfacePairs) {
  const r = ratio(a, b);
  const ok = r >= SEPARATION_FLOOR;
  if (!ok) failed++;
  console.log(w(label, 40) + w(r.toFixed(3), 8) + w(SEPARATION_FLOOR.toFixed(2), 7) + (ok ? "ok" : "COLLISION"));
}

console.log("\ncomposited surfaces actually measured against:");
console.log(`  L2 glass / light  rgb(${glassLight.join(", ")}) at the --l1-opacity ceiling`);
console.log(`  L2 glass / dark   rgb(${glassDark.join(", ")}) at the --l1-opacity ceiling`);
console.log(
  `  drift swept 0..${L1_MAX} for primary text, 0..${L1_CEILING} for secondary ` +
    `(constitution §3: glass over a live L1 carries primary text only)`,
);
console.log(`  beam core / dark  rgb(${beamCoreDark.join(", ")}) (bloom ${beam.bloom} + core ${beam.core}, both --prism)`);
console.log(`  --rail / light    rgb(${railLight.join(", ")})`);
console.log(`  --rail / dark     rgb(${railDark.join(", ")})`);

if (failed > 0) {
  console.error(`\n${failed} role(s) failed. Phase 0 gate is blocked.\n`);
  process.exit(1);
}
console.log("\nAll roles pass on bare ground, on composited L2 glass, and at the unresolved floor.\n");
