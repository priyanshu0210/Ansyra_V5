import { useCurrency } from "../currency";
import { useEffect, useRef, useState } from "react";
import { useMotionPref } from "@/hooks/useMotionPref";

// D1. One numeric component for the whole dashboard.
//
// THE PROBLEM IT SOLVES IS WIDTH, NOT STYLE. Proportional digits have different
// advances — in most faces `1` is markedly narrower than `0` — so a figure that
// updates from 11 to 80 gets WIDER, and everything after it on the line moves.
// Across a dashboard that refetches, this reads as the layout being unstable.
// Only seven places in ~9,400 lines set `tabular-nums` today; every number that
// can change should, and routing them through one component is the only way that
// stays true.
//
// IT ALSO OWNS FORMATTING. Currency, percentage and score formatting was being
// done inline at each call site with different rounding and different separators
// for the same kind of quantity. `Intl` does it correctly for the locale, once.
//
// THE CHANGE FLASH IS STATE, NOT DECORATION. When a value actually changes the
// figure crossfades rather than swapping, which is the difference between "this
// number updated" and "was that always 82?". It fires only on a real change —
// never on mount, so a panel loading eight figures does not strobe — and it is
// opacity over --t-shift, nothing else. Under Still it is a straight swap.

type Format = "number" | "currency" | "percent" | "score" | "raw";

function useFormatted(value: number | string | null | undefined, format: Format, currency?: string) {
  const fx = useCurrency();
  if (value === null || value === undefined) return "—";
  if (format === "raw" || typeof value === "string") return String(value);
  switch (format) {
    case "currency":
      return fx.money(value, currency ?? "USD", false);
    case "percent":
      // THE INPUT IS ALWAYS 0..100, AND IT IS NOT GUESSED.
      //
      // This used to sniff the scale with `value > 1 ? value / 100 : value`,
      // which cannot tell 1 meaning "one percent" from 1 meaning "all of it" —
      // and resolved that ambiguity the wrong way for every real percentage at
      // or below 1%. A genuine 1% rendered as "100%", 0.5% as "50%": a
      // hundredfold error on a financial figure, from a heuristic the caller
      // had no way to override.
      //
      // Every percentage in this product is already a 0..100 quantity (fit
      // scores, optimism scores, synergy attainment), so the convention is
      // declared rather than inferred. A caller holding a 0..1 fraction
      // multiplies before it gets here.
      return new Intl.NumberFormat(undefined, {
        style: "percent",
        maximumFractionDigits: 0,
      }).format(value / 100);
    case "score":
      // Scores are integers on a fixed scale; a decimal here implies a precision
      // the model does not have.
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
    default:
      return new Intl.NumberFormat(undefined).format(value);
  }
}

export function Figure({
  value,
  format = "number",
  currency,
  loading,
  className,
  style,
  "data-testid": testId,
}: {
  value: number | string | null | undefined;
  format?: Format;
  currency?: string;
  /** Renders an em dash rather than a stale number while the query is in flight. */
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
  "data-testid"?: string;
}) {
  const reduced = useMotionPref();
  const text = useFormatted(value, format, currency);
  const [flash, setFlash] = useState(false);
  const previous = useRef<string | null>(null);

  // THE EFFECT KEYS ON `text` ALONE, AND STILL IS APPLIED AT RENDER.
  //
  // `reduced` used to be both a dependency here and a condition inside, and the
  // combination could strand the figure dimmed forever: flipping Still during a
  // flash re-ran the effect, React fired the previous cleanup (clearing the
  // pending `setFlash(false)`), and the guard then took the early return
  // because `previous.current` already equalled `text` — so no new timer was
  // ever scheduled and `flash` stayed true at opacity 0.55.
  //
  // The fix is to stop encoding a render decision in state. `flash` now means
  // only "this value changed within the last 260ms", which depends on nothing
  // but `text`, so the timer's lifetime is tied to the change that started it
  // and nothing can orphan it. Whether that reads as a dim is decided below, at
  // render, where Still is just another input.
  useEffect(() => {
    // Skip the first render: arriving is not changing, and a dashboard that
    // flashes every figure on mount is exactly the noise this is meant to avoid.
    const changed = previous.current !== null && previous.current !== text;
    previous.current = text;
    if (!changed) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 260);
    return () => clearTimeout(t);
  }, [text]);

  // Under Still the swap is straight: the timer still runs, it simply has
  // nothing to show. Choosing Still mid-flash therefore settles the figure on
  // the very next render rather than leaving it dimmed.
  const dimmed = flash && !reduced;

  return (
    <span
      className={`tabular-nums ${className ?? ""}`}
      data-testid={testId}
      style={{
        // `lining` keeps digits on the cap line; some text faces default to
        // old-style figures, which read as typographic flourish in a data table.
        fontVariantNumeric: "tabular-nums lining-nums",
        opacity: dimmed ? 0.55 : 1,
        transition: reduced ? undefined : "opacity var(--t-shift) ease",
        ...style,
      }}
    >
      {loading ? "—" : text}
    </span>
  );
}
