import { useState } from "react";
import { Link } from "react-router";
import { Icon } from "@/components/ansyra/Icon";
import { RequestAccessModalLazy } from "@/components/ansyra/modals/RequestAccessModalLazy";

// The nav CTA's markup, deliberately free of any tRPC dependency.
//
// This module exists so `experience.tsx` can render the signed-out CTA as a
// Suspense fallback WITHOUT statically importing `AuthCta.tsx`. Rollup will not
// move a module into a lazy chunk if anything also imports it statically ("dynamic
// import will not move module into another chunk"), so importing the fallback
// from AuthCta.tsx pulled the whole data stack back into the landing bundle.
// Keep this module dependency-free.
//
// `RequestAccessModalLazy` is safe to import here for exactly that reason: the
// wrapper itself has no tRPC dependency, and the modal + provider arrive
// through the dynamic import inside it, only once someone opens the form. Hero,
// Closing, DocShell and ToolDetail already import it on the same terms.

export type NavCtaProps = { variant: "desktop" | "drawer"; onNavigate?: () => void };

// Kept in one place so the fallback and the resolved CTA cannot drift apart.
// The drawer's label colour must come from `--fg`, never a hardcoded white,
// because the ground flips.
export const VARIANT = {
  desktop: {
    testId: "nav-dashboard",
    className: "ansyra-cta px-5 py-2.5 font-sans text-[length:var(--step-sm)]",
    minHeight: 44,
  },
  drawer: {
    testId: "nav-menu-dashboard",
    className: "ansyra-cta mt-6 justify-center px-6 py-3.5 font-sans text-sm",
    minHeight: 48,
  },
} as const;

export function Cta({
  variant,
  onNavigate,
  to,
  label,
}: NavCtaProps & { to: string; label: string }) {
  const v = VARIANT[variant];
  return (
    <Link
      to={to}
      onClick={onNavigate}
      data-testid={v.testId}
      className={v.className}
      style={{ minHeight: v.minHeight }}
    >
      {label}
      <Icon name="arrow" size={16} />
    </Link>
  );
}

/** Rendered while the auth chunk is in flight, and for signed-out visitors.
 *
 *  ACCESS-REQUEST LED. Accounts here are provisioned by an administrator, so
 *  "Sign in" served returning members and told a first-time visitor nothing to
 *  do. The primary action is now the one a new visitor can actually take, and
 *  sign-in stays as a quiet text link for the people who already have an
 *  account — a demotion, not a removal. Same modal the hero and the closing
 *  section open, so there is one access form on the page, not three. */
export function AnonCta({ variant, onNavigate }: NavCtaProps) {
  const [open, setOpen] = useState(false);
  const drawer = variant === "drawer";
  return (
    <>
      {/* No margin on the drawer wrapper: the drawer button carries its own
          `mt-6` in VARIANT, which the signed-in Dashboard link relies on too. */}
      <div className={drawer ? "flex flex-col items-stretch" : "flex items-center gap-5"}>
        {/* Order is DOM order, and it is deliberate: the primary action comes
            first for a keyboard or screen-reader visitor, and `order` puts the
            quiet link on the left of the bar where a nav link belongs. */}
        <button
          onClick={() => setOpen(true)}
          data-testid={drawer ? "nav-menu-request-access" : "nav-request-access"}
          className={`${VARIANT[variant].className} ${drawer ? "" : "order-2"}`}
          style={{ minHeight: VARIANT[variant].minHeight }}
        >
          {/* "Request Access", cased exactly as the hero, the closing panel,
              DocShell and ToolDetail set it — constitution §9, one label per
              intent. The brief wrote it in sentence case; four other CTAs on
              the same page did not. */}
          Request Access
          <Icon name="arrow" size={16} />
        </button>
        <Link
          to="/login"
          onClick={onNavigate}
          data-testid={drawer ? "nav-menu-sign-in" : "nav-sign-in"}
          className={`ansyra-navlink font-sans ${drawer ? "mt-4 flex items-center justify-center" : "order-1"}`}
          style={{
            fontSize: "var(--step-sm)",
            ...(drawer ? { minHeight: 44 } : null),
          }}
        >
          Sign in
        </Link>
      </div>
      <RequestAccessModalLazy
        open={open}
        onClose={() => {
          setOpen(false);
          onNavigate?.();
        }}
      />
    </>
  );
}
