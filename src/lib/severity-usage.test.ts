import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// USE THE `-text` CUT FOR TEXT.
//
// `--sev-flag` / `--sev-watch` / `--sev-grounded` are the GRAPHIC cuts: bars,
// borders, fills, backlights. `--sev-*-text` are the same roles solved for body
// text, and `severity.ts` already hands both out (`color` vs `textColor`).
//
// Eighteen dashboard call sites set `color: var(--sev-watch)` and friends
// anyway. On the dark card that is 3.06:1 for a red flag and 4.38:1 for
// grounded — an unreadable label and a marginal one. It survived review because
// on the LIGHT theme the base token and the `-text` cut are the same value, so
// the mistake is invisible in exactly the theme most people check first.
//
// scripts/contrast.mjs asserts the CONTRAST half of this (and can only assert
// the two that measurably fail — `--sev-watch` happens to clear AA on the dark
// card). This file asserts the RULE, which covers all three uniformly: it is
// about which token you reach for, not about a ratio.
//
// THE LANDING IS DELIBERATELY EXEMPT. `[data-ground="light"|"dark"]` re-points
// the BASE tokens as the arc crosses, and the `-text` cuts are NOT ground-aware.
// A landing component that switched to `-text` would freeze at one ground's
// value and stop tracking the crossfade — so on the landing the base token is
// the correct choice, and this guard must not drag it along.

const ROOT = join(__dirname, "..");
const BASE_AS_TEXT = /(?<![A-Za-z])color:\s*"?var\(--sev-(?:flag|watch|grounded)\)"?/;

/** Every .tsx/.ts under a directory, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("severity tokens: the graphic cut is never used as text", () => {
  // Everything that renders on a surface which does NOT set `data-ground` —
  // i.e. the whole Operate surface plus the standalone pages.
  const guarded = [
    ...sources(join(ROOT, "components/dashboard")),
    join(ROOT, "pages/Profile.tsx"),
    join(ROOT, "pages/DealDetail.tsx"),
    join(ROOT, "pages/Dashboard.tsx"),
  ];

  it("covers a meaningful number of files", () => {
    // A glob that silently matched nothing would make every assertion below
    // vacuously true.
    expect(guarded.length).toBeGreaterThan(20);
  });

  for (const file of guarded) {
    const rel = file.slice(ROOT.length + 1);
    it(`${rel} uses --sev-*-text for text`, () => {
      const offending = readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => BASE_AS_TEXT.test(line));
      expect(
        offending.map(([n, line]) => `${rel}:${n} ${line.trim()}`),
        "use var(--sev-<band>-text) for text; the base cut is for graphics",
      ).toEqual([]);
    });
  }
});

describe("the two cuts stay distinguishable", () => {
  const css = readFileSync(join(ROOT, "index.css"), "utf8");

  it("declares a -text cut for every severity band, in both themes", () => {
    // If a `-text` cut were ever dropped, every call site above would fall back
    // to an undefined variable and render as inherited colour — which looks
    // fine and means nothing.
    for (const band of ["flag", "watch", "grounded"]) {
      const declarations = css.match(new RegExp(`--sev-${band}-text:`, "g")) ?? [];
      expect(declarations.length, `--sev-${band}-text`).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps the graphic cut ground-aware, which is why the landing keeps it", () => {
    // The exemption above is only sound while this is true.
    for (const ground of ["light", "dark"]) {
      const block = new RegExp(`\\[data-ground="${ground}"\\]\\s*\\{[^}]*--sev-flag:`, "s");
      expect(block.test(css), `[data-ground="${ground}"] must re-point --sev-flag`).toBe(true);
    }
  });
});
