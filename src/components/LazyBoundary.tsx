import { Component, type ReactNode } from "react";
import { isChunkLoadError } from "@/lib/chunk-error";

// ─────────────────────────────────────────────────────────────────────────────
// CONTAINMENT for a single lazy leaf.
//
// `RouteErrorBoundary` is the app-wide net and it should stay app-wide: it is
// what stops a missing route chunk blanking the window. But because it was the
// ONLY boundary, it also caught failures that had no business reaching it. A
// real one, observed: the request-access modal's chunk failed to load and the
// entire landing page was replaced by a full-screen error surface — because a
// visitor clicked a nav button.
//
// That is the wrong blast radius. The landing had rendered perfectly; one
// optional leaf could not load. The page should lose the leaf, not itself.
//
// So each lazy leaf gets one of these, and the route boundary goes back to
// meaning what its name says — the ROUTE could not be rendered.
//
// THERE IS NO in-page RETRY, AND THAT IS NOT AN OMISSION.
//
// The obvious feature here is a "try again" that re-runs the import, and it
// cannot be built. Two independent caches defeat it: `React.lazy` memoises the
// REJECTED promise on the component object, and — the one that actually
// settles it — the browser records the failed fetch in its module map, so
// re-importing the same specifier resolves to the same failure without ever
// touching the network again. Both were implemented and both were measured
// against a real missing chunk; the button did nothing, twice.
//
// A fresh document is therefore the only real recovery, so a caller whose leaf
// is worth recovering offers a reload and says so. A button labelled "try
// again" that cannot try again is worse than no button.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  /**
   * What to show in the leaf's place. A render prop rather than a node so a
   * caller can explain the specific failure (the modal does) — and `null` is a
   * legitimate answer for anything decorative, where the honest degraded state
   * is simply absence.
   *
   * `stale` distinguishes "this build moved out from under you", which a reload
   * fixes, from a component that threw for its own reasons, which it will not.
   */
  fallback?: (context: { stale: boolean }) => ReactNode;
  /** Names the leaf in the console line. */
  label?: string;
}

export class LazyBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Contained, but never silent: a leaf that stops appearing without a trace
    // in the console is a bug that gets reported as "the button does nothing".
    console.error(`${this.props.label ?? "Lazy component"} failed to load:`, error);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return this.props.fallback?.({ stale: isChunkLoadError(error) }) ?? null;
    }
    return this.props.children;
  }
}
