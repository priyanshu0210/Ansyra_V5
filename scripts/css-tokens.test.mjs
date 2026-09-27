import { describe, it, expect } from "vitest";
import {
  collectScope,
  declarations,
  loadCss,
  normalizeSelector,
  resolve,
  resolveNumber,
  resolvePercent,
  rgb,
  themeScopes,
  topLevelRules,
} from "./css-tokens.mjs";

// The numbers in the "against a real browser" block are not derived here. They
// were read out of Chrome with getComputedStyle on the running app and pasted
// in. That is the only way this resolver can be shown to agree with the thing it
// is standing in for — a test that recomputes the mix in JS would agree with
// itself no matter how wrong both were.

describe("normalizeSelector", () => {
  it("makes the minified and source forms of a selector equal", () => {
    // The bug this exists for: the source writes `[data-theme="dark"]`, the
    // minifier emits `[data-theme=dark]`, and an exact match silently returned
    // LIGHT values for every dark token while the gate stayed green.
    expect(normalizeSelector('[data-theme="dark"]')).toBe(normalizeSelector("[data-theme=dark]"));
    expect(normalizeSelector("[data-ground='light']")).toBe("[data-ground=light]");
    expect(normalizeSelector(":root")).toBe(":root");
  });

  it("collapses whitespace without merging distinct selectors", () => {
    expect(normalizeSelector(":root ,  html")).toBe(":root,html");
    expect(normalizeSelector("a  >  b")).toBe("a>b");
    expect(normalizeSelector(":root")).not.toBe(normalizeSelector(":root:not([data-theme=light])"));
  });
});

describe("topLevelRules", () => {
  it("keeps at-rules whole rather than flattening them", () => {
    const rules = topLevelRules("@media (min-width:1px){ :root{ --a: 1 } } :root{ --b: 2 }");
    expect(rules.map((r) => r.selector)).toEqual(["@media (min-width:1px)", ":root"]);
  });

  it("ignores comments", () => {
    const rules = topLevelRules("/* :root { --fake: 1 } */ :root{ --real: 2 }");
    expect(rules).toHaveLength(1);
    expect(declarations(rules[0].body).get("--real")).toBe("2");
  });
});

describe("declarations", () => {
  it("does not split a color-mix on its internal commas", () => {
    const d = declarations("--rail: color-mix(in srgb, var(--fg) 12%, var(--clear)); --x: 1");
    expect(d.get("--rail")).toBe("color-mix(in srgb, var(--fg) 12%, var(--clear))");
    expect(d.get("--x")).toBe("1");
  });

  it("reads the last declaration even without a trailing semicolon", () => {
    expect(declarations("--a: #fff").get("--a")).toBe("#fff");
  });
});

describe("collectScope", () => {
  const css = `
    :root { --a: #000000; --b: #111111 }
    [data-theme="dark"] { --a: #222222 }
    :root { --b: #333333 }
  `;

  it("merges repeated blocks of one selector in document order", () => {
    // --rail lives in a SECOND :root block far below the first. Without this it
    // would not resolve at all.
    expect(rgb(resolve("--b", collectScope(css, [":root"])))).toEqual([51, 51, 51]);
  });

  it("overlays the theme on the base scope", () => {
    expect(rgb(resolve("--a", collectScope(css, [":root"])))).toEqual([0, 0, 0]);
    expect(rgb(resolve("--a", collectScope(css, [":root", '[data-theme="dark"]'])))).toEqual([
      34, 34, 34,
    ]);
  });

  it("REFUSES to run when a token scope is nested in an at-rule", () => {
    // It would silently read a stale value otherwise, which is the whole failure
    // mode this module exists to end.
    const nested = '@media (prefers-color-scheme: dark) { [data-theme="dark"] { --a: #fff } }';
    expect(() => collectScope(nested, [":root", '[data-theme="dark"]'])).toThrow(/nested inside/);
  });

  it("does NOT trip on a selector that merely contains `--name:`", () => {
    // `.ansyra-cta--primary:hover` is a selector, not a declaration. An earlier
    // guard flagged it and cried wolf on the real stylesheet.
    const css2 = "@media (hover:hover) { .ansyra-cta--primary:hover { color: red } }";
    expect(() => collectScope(css2, [":root"])).not.toThrow();
  });
});

describe("resolve", () => {
  const scope = collectScope(
    `:root {
       --hex3: #abc;
       --hex8: #11223344;
       --rgb: rgb(1, 2, 3);
       --rgba: rgba(4, 5, 6, 0.5);
       --alias: var(--rgb);
       --chain: var(--alias);
       --fallback: var(--nope, #ffffff);
       --half: color-mix(in srgb, #000000 50%, #ffffff);
       --wash: color-mix(in srgb, #f2a23c 30%, transparent);
       --twice: color-mix(in srgb, var(--hex3) 50%, var(--hex3));
     }`,
    [":root"],
  );

  it("parses hex, rgb and rgba", () => {
    expect(rgb(resolve("--hex3", scope))).toEqual([170, 187, 204]);
    expect(resolve("--hex8", scope)[3]).toBeCloseTo(0x44 / 255, 5);
    expect(rgb(resolve("--rgb", scope))).toEqual([1, 2, 3]);
    expect(resolve("--rgba", scope)[3]).toBe(0.5);
  });

  it("follows a var chain and a var fallback", () => {
    expect(rgb(resolve("--chain", scope))).toEqual([1, 2, 3]);
    expect(rgb(resolve("--fallback", scope))).toEqual([255, 255, 255]);
  });

  it("mixes in premultiplied sRGB, so a transparent partner does not pull to black", () => {
    // The trap: mixing un-premultiplied would drag this toward transparent's
    // nominal rgb (black) instead of leaving the amber alone at 30% alpha,
    // which is what a browser actually paints.
    const wash = resolve("--wash", scope);
    expect(rgb(wash)).toEqual([242, 162, 60]);
    expect(wash[3]).toBeCloseTo(0.3, 5);
  });

  it("defaults the missing weight to the remainder", () => {
    expect(rgb(resolve("--half", scope))).toEqual([128, 128, 128]);
  });

  it("does not mistake a token used in BOTH arms of a mix for a cycle", () => {
    expect(rgb(resolve("--twice", scope))).toEqual([170, 187, 204]);
  });

  it("THROWS rather than guessing", () => {
    // A gate that substitutes a default for a colour it could not parse is the
    // bug, not the safety net.
    expect(() => resolve("--missing", scope)).toThrow(/undefined token/);
    expect(() => resolve("color-mix(in oklab, #000 50%, #fff)", scope)).toThrow(/unsupported/);
    expect(() => resolve("hsl(1 2% 3%)", scope)).toThrow(/cannot resolve/);
  });

  it("detects a genuine cycle", () => {
    const loop = collectScope(":root { --a: var(--b); --b: var(--a) }", [":root"]);
    expect(() => resolve("--a", loop)).toThrow(/circular/);
  });
});

describe("against a real browser", () => {
  // Values read from Chrome's getComputedStyle on the running app. If the
  // resolver and the browser ever disagree, this is what says so.
  const { text } = loadCss();
  const S = themeScopes(text);
  const at = (name, theme) => rgb(resolve(name, S[theme]));

  it("agrees on the plain tokens that had drifted", () => {
    expect(at("--caustic", "light")).toEqual([242, 162, 60]);
    expect(at("--prism", "light")).toEqual([110, 212, 224]);
    expect(at("--settle", "light")).toEqual([95, 191, 163]);
  });

  it("agrees on the color-mix tokens, which the old gate re-implemented by hand", () => {
    expect(at("--rail", "light")).toEqual([198, 202, 215]);
    expect(at("--rail", "dark")).toEqual([13, 41, 42]);
    expect(at("--rail-accent", "light")).toEqual([131, 97, 44]);
    expect(at("--fg-surface", "dark")).toEqual([37, 74, 76]);
  });

  it("resolves the theme-dependent roles to DIFFERENT values per theme", () => {
    // The selector-quoting bug made every one of these identical across themes.
    for (const token of ["--fg", "--fg-2", "--fg-surface", "--clear", "--sev-watch-text"]) {
      expect(at(token, "light"), token).not.toEqual(at(token, "dark"));
    }
  });

  it("reads the scalar tokens the gate used to hardcode", () => {
    expect(resolveNumber("--unresolved-floor", S.light)).toBe(0.85);
    expect(resolveNumber("--l1-opacity", S.light)).toBeGreaterThan(0);
  });

  it("reads the beam alphas as fractions, and they stay inside AA", () => {
    // These three are the ONLY alphas in the ambient light stack, so reading
    // them is the same as reading the stack — which is what lets
    // scripts/contrast.mjs composite the beam instead of trusting a comment.
    const bloom = resolvePercent("--beam-bloom", S.light);
    const core = resolvePercent("--beam-core", S.light);
    for (const [name, v] of [["bloom", bloom], ["core", core]]) {
      expect(v, name).toBeGreaterThan(0);
      expect(v, name).toBeLessThan(1);
    }
    // The beam is deliberately far below its AA ceiling — quiet by design, not
    // by constraint. This guard is about the DESIGN intent (a subtle light),
    // which is a tighter bound than the accessibility one; contrast.mjs still
    // proves the accessibility side by compositing.
    expect(core).toBeLessThanOrEqual(0.2);
  });

  it("rejects a percentage token that is not a percentage", () => {
    const scope = collectScope(":root { --a: 0.5; --b: 40% }", [":root"]);
    expect(() => resolvePercent("--a", scope)).toThrow(/not a percentage/);
    expect(resolvePercent("--b", scope)).toBeCloseTo(0.4, 5);
  });

  it("states BOTH drift bounds, so the gate has no reason to invent one", () => {
    // `--l1-opacity-max` was a sentence in a CSS comment, which is why
    // contrast.mjs carried a hand-picked 0.4 for the worst case. Two tokens
    // now, and the exception must not sit below the ordinary ceiling.
    const ceiling = resolveNumber("--l1-opacity", S.light);
    const max = resolveNumber("--l1-opacity-max", S.light);
    expect(max).toBeGreaterThanOrEqual(ceiling);
    expect(max).toBeLessThanOrEqual(1);
  });

  it("gives glass its per-theme alpha", () => {
    expect(resolve("--glass-light", S.light)[3]).toBeCloseTo(0.62, 5);
    expect(resolve("--glass-dark", S.dark)[3]).toBeCloseTo(0.42, 5);
  });
});
