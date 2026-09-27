import { createApiLinks } from "./links";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { trpc } from "./trpc";
import { retryQuery } from "./query-retry";

// One QueryClient per Provider (kept out of module scope). Aggressive refetch
// behaviour was causing the UI to remount on every window focus — see the note
// on refetchOnWindowFocus below.
export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is considered fresh for 5 minutes — no background refetch
            // just because the user Alt-Tabbed.
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            // Tab/window focus MUST NOT refetch. Otherwise `auth.me` blips
            // through an error state whenever the network hiccups, which the
            // Dashboard was interpreting as "log out and redirect", wiping
            // every AI mutation's local state along the way.
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
            // One retry, EXCEPT on a 401/403 — the server answered, and asking
            // the identical question again gets the identical answer. See
            // contracts/auth-resolution.ts.
            retry: retryQuery,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: createApiLinks(),
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared-client variant.
//
// `TRPCProvider` deliberately builds a fresh QueryClient per instance, which is
// right when exactly one instance wraps the tree. The landing is the exception:
// it has no provider ancestor (App.tsx keeps `/` outside DataLayout for bundle
// reasons), so the nav CTA carries its own provider — and that CTA renders
// TWICE, once in the desktop bar and once in the mobile drawer. With per-instance
// clients each mount fired its own `auth.me`.
//
// These singletons let every landing-side provider share one cache, so
// react-query dedupes the call back down to one.
// ─────────────────────────────────────────────────────────────────────────────

let sharedQueryClient: QueryClient | null = null;
let sharedTrpcClient: ReturnType<typeof trpc.createClient> | null = null;

function getSharedClients() {
  if (!sharedQueryClient) {
    sharedQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          refetchOnMount: false,
          // This is the client that matters most for the retry narrowing: it is
          // the LANDING's, and the landing's one query is `auth.me` against a
          // visitor who is usually anonymous.
          retry: retryQuery,
        },
        mutations: { retry: 0 },
      },
    });
  }
  if (!sharedTrpcClient) {
    sharedTrpcClient = trpc.createClient({
      links: createApiLinks(),
    });
  }
  return { queryClient: sharedQueryClient, trpcClient: sharedTrpcClient };
}

export function SharedTRPCProvider({ children }: { children: ReactNode }) {
  const { queryClient, trpcClient } = getSharedClients();
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
