import { Outlet, useLocation } from "react-router";
import { TRPCProvider } from "@/providers/TRPCProvider";
import { Toaster } from "@/components/ui/sonner";
import { PortfolioNotice } from "@/components/PortfolioNotice";
import { SessionGuard } from "@/components/SessionGuard";

// A PATHLESS layout route. It contributes nothing to the URL, so every child
// route keeps the exact absolute path it had when these routes were flat —
// that is the whole reason this shape was chosen over nesting under `path="*"`,
// which would have forced all 15 paths to become relative.
//
// It exists to own the tRPC provider. One provider for the whole authenticated
// app means one QueryClient, so navigating dashboard -> deal detail keeps the
// react-query cache (and `useAuth`'s sticky session) instead of remounting a
// fresh client on every route change. Putting the provider on each route
// element individually would have thrown that cache away.
//
// Because this module is only reached through a lazy route, importing the
// provider here keeps the data stack out of the landing bundle.
export default function DataLayout() {
  const { pathname } = useLocation();
  return (
    <TRPCProvider>
      {pathname !== "/dashboard" && pathname !== "/dashboard/" && <PortfolioNotice />}
      <SessionGuard><Outlet /></SessionGuard>
      {/* ONE toast host, here, for the same reason the tRPC provider is here:
          this layout wraps every route that can write, and nothing else can.
          It was briefly mounted inside `Dashboard.tsx` instead, which meant
          `/dashboard/deals/:id` — a sibling route, not a child — had no host at
          all, so every confirmation on the busiest page in the product went
          nowhere. Caught by deleting a comment and watching for a toast that
          could not arrive.
          Still off the landing: `/` sits outside this layout. */}
      <Toaster position="bottom-right" closeButton richColors={false} />
    </TRPCProvider>
  );
}
