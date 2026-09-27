import type { CSSProperties } from "react";

// D1. Loading shapes for Operate surfaces.
//
// WHY THIS EXISTS: the dashboard had no loading state at all. Thirty components
// fetch over tRPC and the answer while they wait was the literal string
// "Loading…", or "…" dropped into a KPI slot. That is not a stylistic gap — a
// panel that renders nothing and then renders everything MOVES the page under
// whoever is reading it.
//
// THE RULE THAT MAKES A SKELETON WORTH SHIPPING: it must occupy the same box as
// the thing it stands in for. A skeleton of the wrong height is a layout shift
// with extra steps, and it is worse than the bare text it replaced, because it
// also looks deliberate. Every variant here is sized from the same tokens the
// real content uses, so the swap costs zero CLS.
//
// OPACITY ONLY, AND NEVER A SWEEP. A shimmer travelling across a placeholder is
// decoration: it conveys nothing the dimming does not already convey, it draws
// the eye to the part of the screen with the least information on it, and it
// runs a compositor animation on every panel at once. This breathes, quietly,
// and stops the moment content arrives.
//
// Under Still it does not animate at all — `.ansyra-skel` is gated on
// `data-motion` in index.css, so this follows the same single authority as the
// rest of the app.

/**
 * One placeholder shape. `w` accepts any CSS length or percentage.
 *
 * There was a `variant` prop here — "line" | "block" | "figure" | "row" — that
 * no call site ever passed; all eleven give explicit `w`/`h` instead, so the
 * branch always resolved to the line defaults. `"row"` never had a branch of
 * its own even in the implementation, so it was a shape you could ask for and
 * never get. Removed rather than wired up: sizing a placeholder to the content
 * it stands in for is a per-call-site judgement, which is exactly what `w`/`h`
 * already express.
 */
export function Skeleton({
  w,
  h,
  className,
  style,
}: {
  w?: number | string;
  h?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  // Default is one line of body text: --step-sm at 1.5 is ~21px, of which the
  // ink is ~12.
  const base: CSSProperties = { height: h ?? 12, width: w ?? "100%", borderRadius: 999 };

  return (
    <span
      aria-hidden
      className={`ansyra-skel block ${className ?? ""}`}
      style={{ ...base, ...style }}
    />
  );
}

/**
 * One list row: a label line over a shorter meta line, matching the shape the
 * dashboard's registers actually use (see the activity feed on Home and the
 * instrument lists).
 */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <span className="block divide-y" style={{ borderColor: "var(--fg-rule)" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="block py-3">
          <Skeleton w={i % 2 ? "58%" : "72%"} />
          <Skeleton w="34%" h={10} className="mt-2" style={{ opacity: 0.7 }} />
        </span>
      ))}
    </span>
  );
}

/**
 * The screen-reader half of a loading state.
 *
 * The shapes above are `aria-hidden` — a decorative rectangle announced as
 * "image" is noise. Assistive tech needs the fact, once, politely, which is what
 * this provides. Pair it with any skeleton group.
 */
export function LoadingAnnounce({ what }: { what: string }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      Loading {what}
    </span>
  );
}
