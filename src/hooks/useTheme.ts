import { useCallback, useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Theme (light / dark), which is NOT the same axis as ground.
//
//   theme  = the palette. A user preference. Persisted. `[data-theme]` on <html>.
//   ground = where you are in the luminance arc. Scroll position, not a
//            preference. `[data-ground]` on <html>, written by Ground.tsx.
//
// Both grounds exist inside both themes: light theme crosses periwinkle to
// mint, dark theme crosses one green to a darker one. Conflating the two is
// what made a real theme toggle look expensive here — it isn't, because the
// ~850 role-based `--fg` call sites already re-point themselves.
// ─────────────────────────────────────────────────────────────────────────────

export type Theme = "light" | "dark";

const KEY = "ansyra:theme";

/**
 * Read the stored choice, falling back to DARK.
 *
 * Dark is the brand default rather than the OS's: the city, the caustics and
 * the refracting solid all read markedly better against the green ground than
 * against the pastel, so the light theme is the alternative here, not the
 * baseline. A stored choice always wins.
 *
 * Deliberately NOT following `prefers-color-scheme`. Honouring it would hand a
 * light-mode OS the light theme on first visit, which is precisely the default
 * this is overriding. The toggle is one click and it persists.
 */
function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode: fall through to the default */
  }
  return "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => initialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // No `prefers-color-scheme` listener. It used to follow the OS while the user
  // had made no explicit choice, which directly contradicts a dark default:
  // a light-mode machine would be pulled to light on first visit and again on
  // every OS change. Dark until told otherwise, then whatever was chosen.

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* the attribute still applies for this session */
    }
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return { theme, setTheme, toggle };
}
