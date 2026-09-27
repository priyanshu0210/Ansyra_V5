import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";
import { LazyBoundary } from "@/components/LazyBoundary";
// Static import MUST come from ./NavCta, not ./AuthCta — see the note in
// AuthCta.tsx. Importing the fallback from the lazy module defeats the split.
import { AnonCta } from "./NavCta";
import { ViewControls } from "./ViewControls";
import { Logo } from "./Logo";
// Grain is rendered by Home.tsx as a fixed sibling layer, not from here — it
// must never sit inside a scrolling container (DESIGN.md).
import { Hero } from "./landing/Hero";
import { LuminanceArc } from "./landing/Ground";

// ─────────────────────────────────────────────────────────────────────────────
// The Ansyra landing (2026-07 cinematic redesign).
//
// ONE continuous scroll. The act state machine, the wheel/touch/key
// scroll-hijack and the page-turn transitions are gone — they made the site
// feel paginated. Sections flow, and motion leads the eye down the page.
//
// The nav is a small set of in-page anchors (not the old segmented pager) plus
// one CTA; below md it collapses into a hamburger drawer.
// ─────────────────────────────────────────────────────────────────────────────

// Order matches the order of the sections on the page. It previously did not:
// "Research" sat last in the nav while pointing at #problem, which is the
// FIRST section, so the nav implied an order the page did not have.
const LINKS = [
  { label: "The problem", href: "#problem" },
  { label: "Platform", href: "#platform" },
  { label: "The AI", href: "#ai" },
  { label: "Who it's for", href: "#roles" },
] as const;

// Split out so tRPC/react-query stay off the landing's critical path — see the
// note at the top of AuthCta.tsx.
const AuthCta = lazy(() => import("./AuthCta"));
const LandingBody = lazy(() => import("./landing/LandingBody"));

export function Experience() {
  const [lifted, setLifted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // The arc mounts one render late, once the zone element actually exists.
  // useScroll({target}) measures on first render and never re-measures a ref
  // that was null at that moment, so mounting the arc alongside the zone pins
  // progress at 0 and the ground never leaves light. A ref CALLBACK (rather
  // than a mount effect) is what schedules that second render: it fires during
  // commit with the real node, so there is no setState-in-effect and no
  // cascading render.
  const arcRef = useRef<HTMLDivElement | null>(null);
  const [arcEl, setArcEl] = useState<HTMLDivElement | null>(null);
  const attachArc = useCallback((node: HTMLDivElement | null) => {
    arcRef.current = node;
    setArcEl(node);
  }, []);

  // The bar earns its glass only once you've left the top.
  //
  // This used to be a `scroll` listener calling setState. That fires on every
  // scroll frame and re-renders the entire landing tree with it, for a boolean
  // that flips exactly once per direction. An IntersectionObserver on a 24px
  // sentinel at the top of the document gives the same answer, costs nothing
  // while scrolling, and only re-renders on the actual transition.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setLifted(!e.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The drawer must not leave the page scrolling underneath it, Escape must
  // always get you out, and Tab must not walk focus into the page behind the
  // overlay (it previously did: scroll-lock and Escape were handled, focus was
  // not, so a keyboard user tabbed straight out of the open drawer into
  // links they could not see).
  useEffect(() => {
    if (!menuOpen) return;
    const restoreFocusTo = document.activeElement as HTMLElement | null;
    const SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = drawerRef.current?.querySelectorAll<HTMLElement>(SELECTOR);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    drawerRef.current?.querySelector<HTMLElement>(SELECTOR)?.focus();

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      restoreFocusTo?.focus?.();
    };
  }, [menuOpen]);

  return (
    // The sheet-on-desk conceit is gone with the document concept: the page no
    // longer sits ON something, it moves THROUGH something. Ground is the fixed
    // two-layer arc; every section below is transparent and lets it show.
    <div className="relative w-full">
      {arcEl && <LuminanceArc zoneRef={arcRef} />}

      <a
        href="#problem"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:px-4 focus:py-2"
        style={{ background: "var(--fg)", color: "var(--clear)" }}
      >
        Skip to content
      </a>

      {/* 24px sentinel: while it is on screen the page is at the top and the
          nav stays transparent. Replaces a per-frame scroll listener. */}
      <div ref={sentinelRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-6" />

      <header
        data-testid="site-nav"
        className="fixed inset-x-0 top-0 z-50 transition-all duration-500"
        /* Sanctioned glass surface #1. It earns the blur: the whole page moves
           behind it, which is the test the other four have to pass too. */
        style={{
          background: lifted ? "var(--fg-glass)" : "transparent",
          backdropFilter: lifted ? "var(--l2-blur)" : "none",
          WebkitBackdropFilter: lifted ? "var(--l2-blur)" : "none",
          borderBottom: `1px solid ${lifted ? "var(--fg-rule)" : "transparent"}`,
          paddingTop: "env(safe-area-inset-top)",
          transitionProperty: "background-color, border-color, backdrop-filter",
        }}
      >
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 md:py-5">
          <Link
            to="/"
            data-testid="nav-brand"
            className="flex items-center gap-2.5 font-display text-2xl md:text-[28px]"
            style={{ color: "var(--fg)", letterSpacing: "-0.01em" }}
          >
            <Logo size={28} />
            <span>Ansyra</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-9 md:flex">
            {LINKS.map((l) => (
              /* Hover was previously applied by mutating style on mouse events,
                 so keyboard users got no equivalent. Now a real CSS class with
                 :hover AND :focus-visible. */
              <a
                key={l.href}
                href={l.href}
                data-testid={`nav-${l.href.slice(1)}`}
                className="ansyra-navlink font-sans"
                style={{ fontSize: "var(--step-sm)" }}
              >
                {l.label}
              </a>
            ))}
            <ViewControls />
            {/* Contained. `AnonCta` is already the correct degraded CTA — it is
                what shows while the chunk is in flight — so a chunk that never
                arrives simply keeps it. Before this, a failed nav CTA took the
                whole landing page down with it. */}
            <LazyBoundary
              label="Nav auth CTA"
              fallback={() => <AnonCta variant="desktop" />}
            >
              <Suspense fallback={<AnonCta variant="desktop" />}>
                <AuthCta variant="desktop" />
              </Suspense>
            </LazyBoundary>
          </div>

          {/* Hamburger — below md */}
          <button
            onClick={() => setMenuOpen(true)}
            data-testid="nav-menu-toggle"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="ansyra-cta ansyra-cta--ghost flex items-center justify-center md:hidden"
            style={{ height: 44, width: 44 }}
          >
            <Menu size={20} strokeWidth={1.6} />
          </button>
        </nav>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" data-testid="nav-menu-panel">
          <button
            aria-label="Close menu"
            data-testid="nav-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 h-full w-full"
            style={{ background: "rgba(28,26,23,0.35)", backdropFilter: "blur(2px)" }}
          />
          <div
            ref={drawerRef}
            className="absolute inset-x-0 top-0 flex flex-col px-6 pb-8"
            style={{
              background: "var(--fg-surface)",
              borderBottom: "1px solid var(--fg-rule)",
              boxShadow: "var(--elev-3)",
              paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
            }}
          >
            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2.5 font-display text-2xl" style={{ color: "var(--fg)" }}>
                <Logo size={26} />
                Ansyra
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                data-testid="nav-menu-close"
                aria-label="Close menu"
                className="ansyra-cta ansyra-cta--ghost flex items-center justify-center"
                style={{ borderColor: "var(--fg-rule)", color: "var(--fg)", height: 44, width: 44 }}
              >
                <X size={20} strokeWidth={1.6} />
              </button>
            </div>

            <div className="mt-4 flex flex-col">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  data-testid={`nav-menu-${l.href.slice(1)}`}
                  onClick={() => setMenuOpen(false)}
                  className="border-b py-4 font-display text-[length:var(--step-md)]"
                  style={{ color: "var(--fg)", borderColor: "var(--fg-rule)", minHeight: 48 }}
                >
                  {l.label}
                </a>
              ))}
            </div>

            {/* The controls live in the desktop bar too, but that block is
                `hidden md:flex`, so without this they are simply unreachable
                on a phone. */}
            <div className="mt-6 flex justify-start border-t pt-6" style={{ borderColor: "var(--fg-rule)" }}>
              <ViewControls />
            </div>

            <LazyBoundary
              label="Drawer auth CTA"
              fallback={() => <AnonCta variant="drawer" onNavigate={() => setMenuOpen(false)} />}
            >
              <Suspense
                fallback={<AnonCta variant="drawer" onNavigate={() => setMenuOpen(false)} />}
              >
                <AuthCta variant="drawer" onNavigate={() => setMenuOpen(false)} />
              </Suspense>
            </LazyBoundary>
          </div>
        </div>
      )}

      {/* Transparent: the arc behind it is the ground now. */}
      <main id="top" className="relative z-[2] w-full">
        <Hero />
        <Suspense
          fallback={<div aria-busy="true" aria-label="Loading the rest of the page" className="min-h-[240vh]" />}
        >
          <LandingBody attachArc={attachArc} />
        </Suspense>
      </main>
    </div>
  );
}
