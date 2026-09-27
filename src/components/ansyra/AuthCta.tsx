import { SharedTRPCProvider } from "@/providers/TRPCProvider";
import { useAuth } from "@/hooks/useAuth";
import { AnonCta, Cta, type NavCtaProps } from "./NavCta";

// The nav's one call-to-action, resolved against the session.
//
// This module is ONLY ever reached through `lazy(() => import("./AuthCta"))`.
// Nothing may import it statically — `useAuth` reaches tRPC + react-query +
// superjson (~30 kB gzip), and the landing was pulling that entire stack into
// its critical path to decide whether a single link reads "Dashboard" or
// "Sign in". The markup and the signed-out fallback live in ./NavCta so the
// eager side of the split has no tRPC dependency at all.
//
// See docs/refraction-outstanding.md §1.1.

function Resolved(props: NavCtaProps) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? (
    <Cta {...props} to="/dashboard" label="Dashboard" />
  ) : (
    <AnonCta {...props} />
  );
}

// The landing is the one route with no TRPCProvider ancestor (App.tsx keeps `/`
// outside DataLayout on purpose), so this brings its own. It must be the SHARED
// provider: this component renders twice per page (desktop bar + mobile drawer),
// and per-instance clients made each mount fire its own `auth.me`.
export default function AuthCta(props: NavCtaProps) {
  return (
    <SharedTRPCProvider>
      <Resolved {...props} />
    </SharedTRPCProvider>
  );
}
