// ─────────────────────────────────────────────────────────────────────────────
// READ THE DESIGN TOKENS OUT OF THE CSS, INSTEAD OF COPYING THEM BY HAND.
//
// `scripts/contrast.mjs` used to open with an object described as a "mirror of
// :root in src/index.css". It was a mirror the way a photograph is a mirror —
// accurate on the day it was taken. Three tokens had silently diverged
// (`--caustic`, `--prism`, `--settle`), so every row using them measured a
// colour the product does not ship. That is the third time this repo has
// recorded the same failure, and each previous time the fix was to correct the
// copy. This removes the copy.
//
// Two kinds of drift existed and both are closed here:
//
//   1. VALUES — `caustic: "#e0a15c"` against a stylesheet saying `#f2a23c`.
//   2. FORMULAS — the script re-implemented `color-mix()` with its own `over()`
//      helper and a literal percentage, so `--rail` was computed twice, in two
//      languages, and only one of them was the product.
//
// The resolver below evaluates `var()` and `color-mix()` the way a browser
// does, so a token is now looked up rather than restated. Verified against
// Chrome's own computed values — see css-tokens.test.mjs, which pins the exact
// numbers the browser returned for the mixes this design actually uses.
//
// DELIBERATELY NOT A CSS PARSER. It understands the subset this stylesheet
// writes: custom properties at the top level of a handful of known selectors,
// hex / rgb() / rgba() / named / var() / color-mix(in srgb, …). Anything else
// THROWS rather than guessing, because a gate that silently substitutes a
// default for a colour it failed to parse is the exact class of bug this file
// exists to end.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const BUILT_DIR = "dist/public/assets";
const SOURCE = "src/index.css";

/**
 * The stylesheet to measure, preferring the BUILT one.
 *
 * Built is what ships, so it is what should be gated. The source is a correct
 * fallback rather than a silent one — the caller prints which was used, because
 * "the gate passed" means less if nobody can tell what it read.
 */
export function loadCss(root = ".") {
  const source = join(root, SOURCE);
  const builtDir = join(root, BUILT_DIR);
  if (existsSync(builtDir)) {
    const css = readdirSync(builtDir)
      .filter((f) => f.endsWith(".css"))
      .map((f) => join(builtDir, f))
      // More than one stylesheet would mean a code-split; the tokens live in
      // whichever is largest, and picking deterministically beats picking first.
      .sort((a, b) => readFileSync(b).length - readFileSync(a).length)[0];
    if (css) {
      // A STALE `dist` is the trap this whole file exists to avoid, wearing a
      // different hat: reading a built stylesheet from three commits ago is
      // every bit as much "measuring a colour the product does not ship" as the
      // hand-copied table was, and it would report itself as authoritative
      // while doing it.
      const stale = statSync(source).mtimeMs > statSync(css).mtimeMs;
      return { text: readFileSync(css, "utf8"), from: css, built: true, stale };
    }
  }
  return {
    text: readFileSync(source, "utf8"),
    from: SOURCE,
    built: false,
    stale: false,
  };
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Put a selector into one form so source and built CSS compare equal.
 *
 * The minifier drops the quotes in attribute values — the source writes
 * `[data-theme="dark"]`, the shipped stylesheet writes `[data-theme=dark]`. An
 * exact string match therefore found the dark block in `src/index.css` and
 * missed it in `dist`, which is the worst possible failure for this file: it
 * silently returned the LIGHT value for every dark token, and every dark row
 * would have been measured against the wrong colour while the gate stayed
 * green. Caught only because a smoke test printed both themes side by side and
 * they were identical.
 */
export const normalizeSelector = (s) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s*([>+~,])\s*/g, "$1")
    .replace(/\[\s*([\w-]+)\s*=\s*["']?([^\]"']*)["']?\s*\]/g, "[$1=$2]")
    .trim();

/**
 * Every top-level `selector { … }` rule, in document order.
 *
 * At-rules come back whole (selector `@media …`) with their nested rules still
 * inside the body. That is fine for this stylesheet and NOT assumed to be —
 * `collectScope` refuses to run if a custom property is hiding in one.
 */
export function topLevelRules(cssText) {
  const css = stripComments(cssText);
  const out = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = 0;
  let selector = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) {
        selector = css.slice(selectorStart, i).trim();
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        out.push({ selector: normalizeSelector(selector), body: css.slice(bodyStart, i) });
        selectorStart = i + 1;
      }
    }
  }
  return out;
}

/** Custom-property declarations at the top level of one rule body. */
export function declarations(body) {
  const out = new Map();
  let depth = 0;
  let buf = "";
  const flush = () => {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(buf);
    if (m) out.set(m[1], m[2].trim());
    buf = "";
  };
  for (const ch of body) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (ch === ";" && depth === 0) flush();
    else buf += ch;
  }
  flush();
  return out;
}

/**
 * Merge the declarations of the given selectors, later ones winning.
 *
 * Order is the caller's, and it is the cascade: every selector this stylesheet
 * uses for tokens is a single attribute or `:root`, so they tie on specificity
 * and document order decides. Repeated blocks of the same selector merge in the
 * order they appear, which is why `--rail` (defined in the second `:root`, far
 * below the first) resolves at all.
 */
export function collectScope(cssText, selectors) {
  const rules = topLevelRules(cssText);
  const wantedSet = selectors.map(normalizeSelector);

  // A TOKEN SCOPE nested inside an at-rule would be invisible to the loop
  // below. Rather than quietly measure a stale value — the whole point of this
  // file — stop.
  //
  // Scoped to the selectors being collected, deliberately. The first version
  // flagged any `--x:` inside any at-rule and produced two false alarms on the
  // built stylesheet: `.ansyra-cta--primary:hover` is a SELECTOR that happens to
  // contain `--primary:`, and Tailwind emits its own `--tw-shadow` internals
  // inside media queries. Neither is a design token, and a guard that cries
  // wolf on the real stylesheet gets deleted by the next person.
  for (const r of rules) {
    if (!r.selector.startsWith("@")) continue;
    for (const nested of topLevelRules(r.body)) {
      if (wantedSet.includes(nested.selector)) {
        throw new Error(
          `${nested.selector} is nested inside ${r.selector.slice(0, 40)} — ` +
            `css-tokens.mjs only reads top-level rules and would miss its tokens`,
        );
      }
    }
  }

  const scope = new Map();
  for (const wanted of wantedSet) {
    for (const r of rules) {
      if (r.selector !== wanted) continue;
      for (const [k, v] of declarations(r.body)) scope.set(k, v);
    }
  }
  return scope;
}

// ── colour values ────────────────────────────────────────────────────────────

const NAMED = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
};

/** Split on commas that are not inside parentheses. */
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf.trim());
      buf = "";
    } else buf += ch;
  }
  parts.push(buf.trim());
  return parts;
}

function parseHex(h) {
  const s = h.slice(1);
  const wide = s.length > 4;
  const step = wide ? 2 : 1;
  const chunk = (i) => {
    const raw = s.substr(i * step, step);
    const v = parseInt(wide ? raw : raw + raw, 16);
    return v;
  };
  const n = s.length / step;
  return [chunk(0), chunk(1), chunk(2), n > 3 ? chunk(3) / 255 : 1];
}

/**
 * `color-mix(in srgb, A p%, B q%)`, mixed in PREMULTIPLIED sRGB.
 *
 * Premultiplied is not a detail: `color-mix(… var(--caustic) 30%, transparent)`
 * appears in this stylesheet, and mixing it un-premultiplied would drag the
 * result toward black — transparent's nominal rgb — instead of leaving the
 * colour alone at 30% alpha, which is what a browser paints.
 */
function mix(args, resolveOne) {
  const parsed = args.map((arg) => {
    const m = /^([\s\S]+?)\s+([\d.]+)%$/.exec(arg);
    return m
      ? { colour: resolveOne(m[1].trim()), weight: parseFloat(m[2]) }
      : { colour: resolveOne(arg), weight: null };
  });
  const [x, y] = parsed;
  let w1 = x.weight;
  let w2 = y.weight;
  if (w1 === null && w2 === null) w1 = w2 = 50;
  else if (w1 === null) w1 = 100 - w2;
  else if (w2 === null) w2 = 100 - w1;

  const sum = w1 + w2;
  if (sum === 0) throw new Error("color-mix with zero total weight");
  // Per spec the weights normalise, and when they were both given and total
  // under 100% the result's alpha is scaled by that total.
  const scale = x.weight !== null && y.weight !== null && sum < 100 ? sum / 100 : 1;
  const p1 = w1 / sum;
  const p2 = w2 / sum;

  const a1 = x.colour[3];
  const a2 = y.colour[3];
  const a = p1 * a1 + p2 * a2;
  const channel = (i) => (a === 0 ? 0 : (p1 * a1 * x.colour[i] + p2 * a2 * y.colour[i]) / a);
  return [channel(0), channel(1), channel(2), a * scale];
}

/**
 * Resolve a token (or a raw value) to `[r, g, b, a]` with 0-255 channels.
 *
 * @param nameOrValue `--token` to look up, or a literal value to evaluate.
 * @param scope       a Map from `collectScope`.
 */
export function resolve(nameOrValue, scope, seen = new Set()) {
  let chain = seen;
  const raw = nameOrValue.startsWith("--")
    ? (() => {
        if (seen.has(nameOrValue)) throw new Error(`circular var: ${nameOrValue}`);
        // A COPY, not the caller's set. `seen` guards one resolution PATH, and
        // sharing it sideways would make the second argument of a color-mix
        // report a cycle merely because the first argument had already visited
        // the same token — legal, common, and not a cycle.
        chain = new Set(seen).add(nameOrValue);
        const v = scope.get(nameOrValue);
        if (v === undefined) throw new Error(`undefined token: ${nameOrValue}`);
        return v;
      })()
    : nameOrValue;

  const value = raw.trim();
  const one = (v) => resolve(v, scope, new Set(chain));

  if (Object.hasOwn(NAMED, value)) return [...NAMED[value]];
  if (value.startsWith("#")) return parseHex(value);

  if (value.startsWith("var(")) {
    const inner = splitTop(value.slice(4, -1));
    const name = inner[0].trim();
    // `chain`, not `seen` — this is the same resolution path continuing, so it
    // must carry the tokens already visited. Passing the caller's set meant
    // nothing ever accumulated and a cycle recursed until the stack blew.
    if (scope.has(name)) return resolve(name, scope, chain);
    if (inner.length > 1) return one(inner.slice(1).join(",").trim());
    throw new Error(`undefined token: ${name}`);
  }

  if (value.startsWith("color-mix(")) {
    const parts = splitTop(value.slice(10, -1));
    if (!/^in\s+srgb$/.test(parts[0].trim())) {
      // Other interpolation spaces are legal CSS and would need different maths;
      // refuse rather than silently measure the wrong colour.
      throw new Error(`unsupported color-mix space: ${parts[0]}`);
    }
    return mix(parts.slice(1), one);
  }

  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgbMatch) {
    const n = rgbMatch[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((v) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v)));
    return [n[0], n[1], n[2], n.length > 3 ? (n[3] > 1 ? n[3] / 255 : n[3]) : 1];
  }

  throw new Error(`cannot resolve colour: ${value}`);
}

/**
 * A token written as a percentage, returned as 0..1.
 *
 * The beam alphas are declared with a `%` because that is what `color-mix()`
 * needs at the call site; the contrast maths needs a fraction. Converting here
 * rather than at each caller keeps the two representations from drifting.
 */
export function resolvePercent(name, scope) {
  const v = scope.get(name);
  if (v === undefined) throw new Error(`undefined token: ${name}`);
  const m = /^\s*([\d.]+)\s*%\s*$/.exec(v);
  if (!m) throw new Error(`not a percentage: ${name} = ${v}`);
  return parseFloat(m[1]) / 100;
}

/** A plain numeric token, e.g. `--unresolved-floor: 0.85`. */
export function resolveNumber(name, scope) {
  const v = scope.get(name);
  if (v === undefined) throw new Error(`undefined token: ${name}`);
  const n = parseFloat(v);
  if (Number.isNaN(n)) throw new Error(`not a number: ${name} = ${v}`);
  return n;
}

/** `[r, g, b]` rounded, which is what the contrast maths wants. */
export const rgb = (c) => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];

/**
 * The two token scopes the application actually renders in.
 *
 * `data-ground` is deliberately NOT applied: it is set by the LANDING's scroll
 * progress alone, so every dashboard and standalone-page surface resolves
 * against bare `:root` (+ the theme). Modelling a ground here would measure
 * pairs those pages never show — and getting this backwards is exactly how the
 * severity tokens came to be light-ground values painted on a dark card.
 */
export function themeScopes(cssText) {
  return {
    light: collectScope(cssText, [":root"]),
    dark: collectScope(cssText, [":root", '[data-theme="dark"]']),
  };
}

/** Scopes including a landing ground, for rows that model the arc. */
export function groundScope(cssText, theme, ground) {
  const selectors = [":root"];
  if (ground) selectors.push(`[data-ground="${ground}"]`);
  if (theme === "dark") selectors.push('[data-theme="dark"]');
  return collectScope(cssText, selectors);
}
