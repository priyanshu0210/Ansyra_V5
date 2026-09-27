import { Component, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError } from "@/lib/chunk-error";

// ─────────────────────────────────────────────────────────────────────────────
// The app had NO error boundary at all, anywhere.
//
// That is not a nice-to-have gap. Every route except the landing sits under a
// `lazy()` import, and a lazy import that REJECTS throws during render. With no
// boundary above it, React unmounts the entire tree — `#root` measured 0
// children and 0 bytes — and the reader gets a blank ground with no message, no
// control, and no indication that reloading would fix it.
//
// The reproduction is ordinary, not exotic:
//
//   • **A deploy.** Chunk filenames carry a content hash. Ship a new build and
//     the old `DataLayout-<hash>.js` stops existing. Any tab opened before the
//     deploy that then navigates to /login, /dashboard or anything else asks
//     for a file that is gone, and blanks.
//   • **A dev-server restart**, which is how this was found.
//   • **A flaky network** on the one request that happens to be a chunk.
//
// `App.tsx` already had a Suspense fallback, and a Suspense fallback handles
// PENDING, not REJECTED — those are different outcomes of the same promise, and
// only the first was covered.
//
// WHY A CLASS COMPONENT. There is still no hook equivalent of
// `componentDidCatch`; error boundaries are the one thing React has never moved
// off classes.
//
// WHY THIS SITS ABOVE THE PROVIDERS. It must catch a failure of `DataLayout`
// itself, which is the module that OWNS the tRPC provider. So it cannot use
// anything that depends on that provider, and it paints from `index.css` role
// tokens only — those are plain CSS custom properties on `:root`, present as
// soon as the stylesheet is, with no JS involved.
// ─────────────────────────────────────────────────────────────────────────────

// THIS IS THE ROUTE-LEVEL NET, and it should stay that. A lazy LEAF — the
// request-access modal, the nav CTA, the WebGL field — wraps itself in
// `LazyBoundary` instead, so one optional component failing degrades that
// component rather than replacing the page around it.

// One reload, not a loop.
//
// A stale chunk is fixed by fetching a fresh document, so recovering
// automatically is right — the reader did nothing wrong and should not have to
// diagnose a deploy. But if the reload does NOT fix it (the server is actually
// down, as in a dev restart), reloading again just blanks the page forever in a
// tighter cycle. `sessionStorage` remembers that we already tried, scoped to
// this tab and cleared when it closes.
const RELOAD_KEY = "ansyra:chunk-reload";
const RELOAD_WINDOW_MS = 20_000;

function alreadyTriedReload(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    // Time-boxed, so a recovery an hour ago does not stop a genuine one now.
    return Number.isFinite(at) && Date.now() - at < RELOAD_WINDOW_MS;
  } catch {
    // Private mode: no memory, so do not auto-reload at all. Showing the
    // message is the safe failure — a reload loop is worse than a button.
    return true;
  }
}

function markReloadAttempt() {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* private mode: `alreadyTriedReload` has already refused to auto-reload */
  }
}

interface State {
  error: Error | null;
  /** True while the automatic recovery reload is in flight. */
  recovering: boolean;
}

export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, recovering: false };

  static getDerivedStateFromError(error: Error): State {
    // A stale chunk gets one silent reload rather than a message about a
    // deploy, which is our problem and not the reader's.
    if (isChunkLoadError(error) && !alreadyTriedReload()) {
      markReloadAttempt();
      window.location.reload();
      return { error, recovering: true };
    }
    return { error, recovering: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Sentry picks this up through the global handler when a DSN is set
    // (see main.tsx). The console line is what makes it debuggable without one.
    console.error("Route failed to render:", error, info.componentStack);
  }

  render() {
    const { error, recovering } = this.state;
    if (!error) return this.props.children;

    // Mid-reload: paint the ground, not a message that will vanish in a frame.
    if (recovering) {
      return <div style={{ minHeight: "100vh", background: "var(--desk)" }} aria-busy="true" />;
    }

    const stale = isChunkLoadError(error);
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          background: "var(--desk)",
          color: "var(--fg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "48ch" }}>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--step-xs)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--fg-2)",
            }}
          >
            Ansyra
          </p>
          <h1
            style={{
              marginTop: "12px",
              fontFamily: "var(--font-display, var(--font-serif))",
              fontSize: "var(--step-lead)",
              fontWeight: 400,
              lineHeight: 1.15,
            }}
          >
            {stale ? "This page needs a refresh." : "Something went wrong on this page."}
          </h1>
          <p
            style={{
              marginTop: "12px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--step-sm)",
              lineHeight: 1.55,
              color: "var(--fg-2)",
            }}
          >
            {stale
              ? // Named plainly. "Unexpected error" would be a worse sentence and a less true one.
                "Ansyra was updated while this tab was open, so part of it could no longer be found. Reloading picks up the new version. If it keeps happening, your connection may be dropping requests."
              : "The rest of the app is fine — it is this view that failed to render. Reloading usually clears it."}
          </p>

          <div style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                borderRadius: "999px",
                background: "var(--fg)",
                color: "var(--clear)",
                border: "none",
                padding: "10px 22px",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--step-sm)",
                minHeight: "44px",
                cursor: "pointer",
              }}
            >
              Reload the page
            </button>
            {/* A plain anchor, not a react-router Link: the router is part of
                what may have failed, and a full document load is the recovery. */}
            <a
              href="/login"
              style={{
                borderRadius: "999px",
                border: "1px solid var(--fg-rule)",
                color: "var(--fg)",
                padding: "10px 22px",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--step-sm)",
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              Go to sign in
            </a>
          </div>
        </div>
      </div>
    );
  }
}
