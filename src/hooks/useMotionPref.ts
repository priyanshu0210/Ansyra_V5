import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Motion preference.
//
// MOTION IS ON BY DEFAULT FOR EVERYONE, and this hook deliberately does NOT
// consult `prefers-reduced-motion`. That is a product decision, taken
// explicitly and with the tradeoff named: the OS preference is an accessibility
// signal, and overriding it means a visitor who asked their machine for less
// motion gets a moving page until they say otherwise here.
//
// What makes it defensible rather than careless:
//
//   1. The control is one click away, in the nav, on every page.
//   2. The choice PERSISTS (localStorage, like the theme). It is not a preview
//      that dies with the tab, so a visitor sets it once.
//   3. The still compositions are all still built and still correct. Choosing
//      Still does not degrade the page to a lesser artifact — it renders the
//      same composition at rest, which is the rule DESIGN.md set and which
//      still holds.
//
// `?motion=on` / `?motion=off` still work, and now write the persisted value.
//
// The pre-paint boot script in index.html reads THE SAME KEY with THE SAME
// resolution order. If these two ever disagree, the page arms its opening
// animation and then contradicts itself after hydration, which is visible as a
// flash. Change both or neither.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = "ansyra:motion";

function readOverride(): "on" | "off" | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("motion");
  if (q === "on" || q === "off") {
    try {
      window.localStorage.setItem(KEY, q);
    } catch {
      /* private mode: fall through to the in-memory value for this render */
    }
    return q;
  }
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === "on" || stored === "off" ? stored : null;
  } catch {
    return null;
  }
}

// Subscribers, so the visible toggle updates every consumer at once rather than
// only the component that flipped it.
const listeners = new Set<() => void>();

/** Set the motion preference from UI. Pass null to return to the default (on). */
export function setMotionOverride(next: "on" | "off" | null) {
  try {
    if (next === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, next);
  } catch {
    /* private mode: the in-memory notify below still applies for this session */
  }
  memoryOverride = next;
  // The CSS tier reads `data-motion` on <html>. The boot script sets it before
  // first paint; this keeps it true after the visitor flips the control.
  try {
    document.documentElement.setAttribute("data-motion", next === "off" ? "off" : "on");
  } catch {
    /* no document: nothing to keep in sync */
  }
  listeners.forEach((l) => l());
}

/** Mirrors localStorage so private mode still works within a session. */
let memoryOverride: "on" | "off" | null = null;

/** True when motion should be suppressed. Only an explicit "off" suppresses it. */
export function useMotionPref(): boolean {
  const [override, setOverride] = useState<"on" | "off" | null>(null);

  // Read on mount rather than during render: localStorage and location are
  // browser-only, and this keeps the first server/client render identical.
  useEffect(() => {
    const sync = () => setOverride(memoryOverride ?? readOverride());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return override === "off";
}

/** The current override, for UI that needs to show which mode is active. */
export function useMotionOverride(): "on" | "off" | null {
  const [override, setOverride] = useState<"on" | "off" | null>(null);
  useEffect(() => {
    const sync = () => setOverride(memoryOverride ?? readOverride());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return override;
}
