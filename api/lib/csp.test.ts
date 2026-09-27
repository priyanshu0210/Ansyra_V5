import { describe, it, expect } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { inlineScriptHashes } from "./csp";

// REGRESSION TESTS for a production-only breakage nothing could see.
//
// `index.html` carries one inline <script>: the pre-paint boot that stamps
// `data-theme` and `data-motion` on <html> before the first frame. The
// production CSP set `script-src 'self'`, which blocks it outright:
//
//     Executing inline script violates the following Content Security Policy
//     directive 'script-src 'self''
//
// So every production load painted the default ground and flipped after
// hydration, and a visitor who had chosen Still got the opening animation armed
// anyway. Invisible for as long as it existed, because the CSP is applied only
// when `env.isProduction` and the production server had never been run locally.
//
// The hash is computed from the shipped file rather than pasted from the
// browser's error, so editing the boot script cannot silently re-break it.

const SOURCE_INDEX = path.resolve(import.meta.dirname, "../../index.html");
const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

describe("inline script hashes", () => {
  // If this fails, the boot script was removed or given a `src` — at which
  // point the CSP entry is dead weight and the pre-paint guarantee is gone.
  it("index.html still has exactly one inline script to account for", () => {
    const html = fs.readFileSync(SOURCE_INDEX, "utf-8");
    expect([...html.matchAll(INLINE)]).toHaveLength(1);
  });

  it("the inline script is the pre-paint theme/motion boot", () => {
    const html = fs.readFileSync(SOURCE_INDEX, "utf-8");
    const body = [...html.matchAll(INLINE)][0][1];
    expect(body).toContain("ansyra:theme");
    expect(body).toContain("ansyra:motion");
    expect(body).toContain("data-motion");
  });

  it("hashes are emitted in the 'sha256-…' form script-src requires", () => {
    // Computed against the SOURCE index.html, so this runs without a build.
    const html = fs.readFileSync(SOURCE_INDEX, "utf-8");
    const expected = [...html.matchAll(INLINE)].map(
      (m) => `'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`,
    );
    expect(expected[0]).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
  });

  // The digest covers the script's exact bytes. Trimming or re-indenting it
  // changes the hash, and a mismatched hash fails exactly like no hash at all —
  // silently, in production only.
  it("hashing is byte-exact, so whitespace changes the digest", () => {
    const a = crypto.createHash("sha256").update("var x = 1;", "utf8").digest("base64");
    const b = crypto.createHash("sha256").update(" var x = 1;", "utf8").digest("base64");
    expect(a).not.toBe(b);
  });

  // Dev and test runs have no dist/; the CSP is not applied there either, so
  // returning nothing is correct rather than a failure.
  it("returns an array, and never throws when the build is absent", () => {
    expect(Array.isArray(inlineScriptHashes())).toBe(true);
  });
});
