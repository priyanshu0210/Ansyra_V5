import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "./Logo";
import { Footer } from "./Footer";
import { RequestAccessModalLazy } from "./modals/RequestAccessModalLazy";

// ─────────────────────────────────────────────────────────────────────────────
// DocShell — shared chrome for the research-library and instrument pages: the
// paper ground, grain, a slim nav back to the register, and the site footer.
//
// The nav used to offer a bare "Dashboard →" to everyone, including visitors
// who have no account and cannot get one without asking. PRODUCT.md is explicit
// that Request Access and Sign in are two different doors that must not blur,
// and these are the pages the landing sends people to — so both doors belong
// here. Signed-in members still get Dashboard.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * E1. Shared chrome for the instrument and research pages.
 *
 * GROUNDS ARE SPLIT, and the split is the arc's own vocabulary applied off the
 * landing rather than a compromise. An instrument page IS the machine working,
 * so it is dark. A research article is long-form reading whose charts were
 * drawn for light, and light is what the arc means by "the world before
 * clarity", so it stays light. Grain is gone with the document concept.
 */
export function DocShell({
  children,
  ground = "light",
}: {
  children: ReactNode;
  ground?: "light" | "dark";
}) {
  const { isAuthenticated } = useAuth();
  const [showAccess, setShowAccess] = useState(false);

  return (
    <main
      data-ground={ground}
      className="relative min-h-screen w-full overflow-x-hidden"
      style={{ background: ground === "dark" ? "var(--medium)" : "var(--clear)" }}
    >
      <nav className="relative z-10 flex items-center justify-between gap-4 px-6 py-5 md:px-12">
        <Link to="/" className="flex items-center gap-2.5 font-display text-2xl" style={{ color: "var(--fg)" }}>
          <Logo size={30} />
          <span className="hidden sm:inline">Ansyra</span>
        </Link>
        <div className="flex items-center gap-5">
          <Link to="/#platform" className="ansyra-navlink font-sans" style={{ fontSize: "var(--step-xs)" }}>
            ← Back
          </Link>
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="ansyra-cta px-5 py-2.5 font-sans"
              style={{ fontSize: "var(--step-xs)", minHeight: 44 }}
            >
              Dashboard
              <span aria-hidden>→</span>
            </Link>
          ) : (
            <>
              <Link to="/login" className="ansyra-navlink hidden font-sans sm:inline" style={{ fontSize: "var(--step-xs)" }}>
                Sign in
              </Link>
              <button
                onClick={() => setShowAccess(true)}
                data-testid="docshell-request-access"
                className="ansyra-cta px-5 py-2.5 font-sans"
                style={{ fontSize: "var(--step-xs)", minHeight: 44 }}
              >
                Request Access
                <span aria-hidden>→</span>
              </button>
            </>
          )}
        </div>
      </nav>
      <div className="relative z-10">{children}</div>
      <Footer />
      <RequestAccessModalLazy open={showAccess} onClose={() => setShowAccess(false)} />
    </main>
  );
}
