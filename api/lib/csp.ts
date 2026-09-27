import crypto from "crypto";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// CSP hashes for the inline boot script.
//
// `index.html` carries one inline <script>: the pre-paint boot that reads the
// stored theme and motion preference and stamps `data-theme` / `data-motion` on
// <html> BEFORE the first frame. It has to be inline and it has to be blocking —
// that is the whole point, and an external file would paint the wrong ground
// first and correct it after.
//
// The production CSP sets `script-src 'self'`, which blocks exactly that, so in
// production the browser refused to run it:
//
//     Executing inline script violates the following Content Security Policy
//     directive 'script-src 'self''
//
// The consequence is not subtle and it is not cosmetic-only: nothing sets the
// attributes before paint, so every production load painted the default ground
// and then flipped after hydration, and a visitor who had chosen **Still** got
// the opening animation armed anyway — the exact contradiction useMotionPref's
// docblock warns about.
//
// It survived because the CSP is production-only (`env.isProduction ? … :
// undefined`), so no dev server ever applied it, and the production server had
// never been run locally. Found by finally doing that.
//
// THE HASH IS COMPUTED, NOT PASTED. The browser helpfully prints the sha256 it
// wanted, and hardcoding that value would work exactly until someone edited one
// character of the boot script — at which point it silently breaks again, in
// production only, in the same invisible way. Reading the shipped file and
// hashing it means the policy cannot drift from what is actually served.
// ─────────────────────────────────────────────────────────────────────────────

/** `<script>` with no `src`, i.e. one with a body the CSP must account for. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * sha256 hashes of every inline script in the built index.html, in the
 * `'sha256-…'` form `script-src` expects.
 *
 * Returns [] when the build is not present (dev, tests), where the CSP is not
 * applied anyway.
 */
export function inlineScriptHashes(): string[] {
  const indexPath = path.resolve(import.meta.dirname, "../dist/public/index.html");
  let html: string;
  try {
    html = fs.readFileSync(indexPath, "utf-8");
  } catch {
    return [];
  }
  return [...html.matchAll(INLINE_SCRIPT)].map(
    // The hash covers the script's exact text content, byte for byte —
    // no trimming, which would change the digest and silently not match.
    (m) => `'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`,
  );
}
