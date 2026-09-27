import { Link } from "react-router";
import { Logo } from "./Logo";
import { TOOLS, RESEARCH } from "@/lib/landing-content";

/** The five instruments the brand is built on. Others reach the footer through
 *  "All instruments", not by lengthening this column every time one ships. */
const SIGNATURE = new Set([
  "deal-genome",
  "assumption-ledger",
  "cultural-compatibility",
  "regulatory-radar",
  "synergy-reality-engine",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Site footer (2026-07 revamp) — mounted on the landing's final act and on
// every research/tool page. Every link resolves to a real route.
// ─────────────────────────────────────────────────────────────────────────────

const COLS: { heading: string; links: { label: string; to: string }[] }[] = [
  {
    // The five signature instruments, not all eleven: a footer column is an
    // index, and eleven entries next to six studies is a wall. The full set
    // lives in the landing's platform register.
    heading: "Platform",
    links: [
      ...TOOLS.filter((t) => SIGNATURE.has(t.slug)).map((t) => ({
        label: t.name.replace("™", ""),
        to: `/platform/${t.slug}`,
      })),
      { label: "All instruments", to: "/#platform" },
    ],
  },
  {
    // All six studies. This used to slice to five, which quietly made one
    // unreachable from every page the footer appears on.
    heading: "Research",
    links: RESEARCH.map((r) => ({ label: `${r.source} · ${r.headline}`, to: `/research/${r.slug}` })),
  },
  {
    // "Company" was a catch-all over three links that are not about the
    // company. This names what is actually in the column. It is NOT "About":
    // there is no about page to link, and a heading that promises one is worse
    // than a vague one.
    heading: "Access & legal",
    links: [
      { label: "Sign in", to: "/login" },
      // "Dashboard" is gone from the public footer. It only ever worked for a
      // visitor who was already signed in, and that visitor already has the nav
      // CTA, which reads "Dashboard" for exactly them. Making the footer itself
      // session-aware is not an option worth its cost: `useAuth` would drag
      // tRPC + react-query into the landing bundle this footer sits on — the
      // precise dependency AuthCta.tsx exists to keep out.
      //
      // "Help & FAQ" pointed at /dashboard/help, which is member support copy
      // ("ask your administrator to enable it") with a Back-to-dashboard button.
      // A prospect reading the public footer is not the audience for that page.
      { label: "Terms of Use", to: "/legal/terms" },
      { label: "FAQ", to: "/faq" },
      { label: "Privacy Policy", to: "/legal/privacy" },
    ],
  },
];

export function Footer() {
  return (
    <footer
      data-ground="dark"
      className="relative z-10 mt-20 w-full border-t"
      style={{ borderColor: "var(--fg-rule)", background: "var(--medium-deep)" }}
      data-testid="site-footer"
    >
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="flex items-center gap-2.5 font-serif text-2xl" style={{ color: "var(--fg)" }}>
            <Logo size={26} />
            Ansyra
          </span>
          <p className="mt-4 max-w-[26ch] font-sans text-[13px] leading-relaxed" style={{ color: "var(--fg-2)" }}>
            The decision record for M&amp;A. What was assumed, by whom, when, and whether it held.
          </p>
          <p className="mt-6 font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
            Personal portfolio project. Use fictional deal data and sample documents only.
          </p>
        </div>
        {COLS.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <p className="font-sans text-[length:var(--step-xs)] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--fg-2)" }}>
              {col.heading}
            </p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.to + l.label}>
                  <Link
                    to={l.to}
                    className="font-sans text-[13px] underline-offset-4 transition-colors hover:underline"
                    style={{ color: "var(--fg-2)" }}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-5 sm:px-10"
        style={{ borderColor: "var(--fg-rule)" }}
      >
        <p className="font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
          © {new Date().getFullYear()} Ansyra. All rights reserved.
        </p>
        <p className="font-sans text-[length:var(--step-xs)]" style={{ color: "var(--fg-2)" }}>
          Research and commentary cited from PwC, McKinsey, and Bain.
        </p>
      </div>
    </footer>
  );
}
