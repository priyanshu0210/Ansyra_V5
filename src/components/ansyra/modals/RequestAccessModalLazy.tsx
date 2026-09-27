import { Suspense, lazy } from "react";
import { LazyBoundary } from "@/components/LazyBoundary";

// The request-access modal reaches tRPC to submit, so importing it eagerly put
// the whole data stack on the landing's critical path for a form most visitors
// never open. The early `!open` return is the point: the chunk is not fetched
// until someone actually opens the modal.
//
// This wrapper module IS eagerly imported (by Hero, Closing, DocShell and
// ToolDetail), so it must stay dependency-free — the provider is pulled in
// *inside* the dynamic import below, alongside the modal, not at module scope.
// A static `import { TRPCProvider }` here would silently undo the whole split.
//
// The landing has no TRPCProvider ancestor (App.tsx keeps `/` outside
// DataLayout), so the modal brings its own. On ToolDetail and DocShell, which
// do sit under DataLayout, this nests a second provider; the inner one simply
// wins, and the cost is one extra QueryClient for a single form submission.
//
// Use this everywhere instead of importing RequestAccessModal directly.
const Modal = lazy(() =>
  Promise.all([
    import("./RequestAccessModal"),
    import("@/providers/TRPCProvider"),
  ]).then(([modal, data]) => ({
    default: (props: { open: boolean; onClose: () => void }) => (
      <data.SharedTRPCProvider>
        <modal.RequestAccessModal {...props} />
      </data.SharedTRPCProvider>
    ),
  })),
);

export function RequestAccessModalLazy({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  // CONTAINED. If this chunk cannot be fetched — a deploy moved it, the network
  // dropped one request — the failure belongs to the modal, not to the landing
  // page behind it. Without the boundary it reached the route boundary and
  // replaced the whole page, which is a page-sized punishment for pressing one
  // button. Observed for real; see LazyBoundary.
  //
  // Silence is not an option either: the reader clicked "Request access" and is
  // owed an answer, so the fallback says what happened and keeps the ask
  // possible.
  return (
    <LazyBoundary
      label="Request-access modal"
      fallback={() => <LoadFailed onClose={onClose} />}
    >
      {/* No Suspense fallback: the modal portals over the page, and a
          placeholder would flash an empty overlay for the one frame the chunk
          takes from cache. */}
      <Suspense fallback={null}>
        <Modal open onClose={onClose} />
      </Suspense>
    </LazyBoundary>
  );
}

/**
 * Deliberately plain. It has to render when a dynamic import just failed, so it
 * cannot itself depend on anything that might not have arrived — no tRPC, no
 * modal shell from another chunk, only role tokens from index.css.
 */
function LoadFailed({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Request access could not be opened"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "color-mix(in srgb, #000 55%, transparent)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "44ch",
          background: "var(--fg-surface)",
          color: "var(--fg)",
          border: "1px solid var(--fg-rule)",
          borderRadius: "var(--r-lens)",
          boxShadow: "var(--elev-2)",
          padding: "28px",
        }}
      >
        <p style={{ fontFamily: "var(--font-serif)", fontSize: "var(--step-md)", lineHeight: 1.2 }}>
          This form didn&apos;t load.
        </p>
        <p
          style={{
            marginTop: "10px",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--step-sm)",
            lineHeight: 1.55,
            color: "var(--fg-2)",
          }}
        >
          The rest of the page is fine — it was just this form. Reloading
          usually fixes it, or email us directly and we&apos;ll set you up.
        </p>
        <div style={{ marginTop: "20px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              borderRadius: "999px",
              background: "var(--fg)",
              color: "var(--clear)",
              border: "none",
              padding: "10px 20px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--step-sm)",
              minHeight: "44px",
              cursor: "pointer",
            }}
          >
            Reload the page
          </button>
          <a
            href="mailto:hello@ansyra.com?subject=Request%20access"
            style={{
              borderRadius: "999px",
              border: "1px solid var(--fg-rule)",
              color: "var(--fg)",
              padding: "10px 20px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--step-sm)",
              minHeight: "44px",
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            Email instead
          </a>
          <button
            type="button"
            onClick={onClose}
            style={{
              borderRadius: "999px",
              border: "none",
              background: "transparent",
              color: "var(--fg-2)",
              padding: "10px 16px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--step-sm)",
              minHeight: "44px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
