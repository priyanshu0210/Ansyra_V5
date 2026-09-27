// A render harness for hooks that talk to tRPC.
//
// The transport is stubbed; EVERYTHING ELSE IS REAL — the same
// `createTRPCReact` client, the same superjson transformer, the same
// QueryClient, the same react-query cache machinery. That is deliberate and it
// is the whole point of the harness.
//
// The alternative — `vi.mock("@/providers/trpc")` returning a fake `useQuery` —
// would be far less code and would prove nothing. useAuth's sticky behaviour is
// a question ABOUT react-query: does `query.data` survive a failed background
// refetch, and what does `isFetched` do across it. A mocked hook answers that
// question by assumption, which is exactly the assumption under test.
//
// Only used by `.test.tsx` files, which opt into jsdom with a docblock.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { retryQuery } from "@/providers/query-retry";
import { trpc } from "@/providers/trpc";

/** One canned reply for a tRPC procedure call. */
export type StubReply =
  | { ok: unknown }
  | { error: { code: string; httpStatus: number; message?: string } };

/**
 * Sequenced replies per procedure path.
 *
 * A list rather than a single value because the behaviour under test is a
 * TRANSITION: succeed, then fail on refetch. The last entry repeats once the
 * list is exhausted, so a test only has to describe the changes it cares about.
 */
export class TrpcStub {
  private queues = new Map<string, StubReply[]>();
  /** Every path the client actually called, in order. */
  readonly calls: string[] = [];

  on(path: string, ...replies: StubReply[]): this {
    this.queues.set(path, [...replies]);
    return this;
  }

  private next(path: string): StubReply {
    const q = this.queues.get(path);
    if (!q || q.length === 0) {
      return { error: { code: "NOT_FOUND", httpStatus: 404, message: `no stub for ${path}` } };
    }
    // Keep the last reply in place once exhausted — "and it stays like that".
    return q.length === 1 ? q[0] : q.shift()!;
  }

  /** The fetch the tRPC client is built on. Speaks the batched wire format. */
  readonly fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://test.local");
    // `/api/trpc/auth.me?batch=1&input=…` — the path segment carries the
    // comma-separated procedure names when batching.
    const paths = url.pathname.replace(/^\/api\/trpc\//, "").split(",");
    const body = paths.map((p) => {
      this.calls.push(p);
      const reply = this.next(p);
      if ("ok" in reply) return { result: { data: { json: reply.ok } } };
      return {
        error: {
          json: {
            message: reply.error.message ?? reply.error.code,
            code: -32001,
            data: { code: reply.error.code, httpStatus: reply.error.httpStatus },
          },
        },
      };
    });
    const worst = Math.max(
      200,
      ...paths.map((_, i) => {
        const b = body[i] as { error?: { json: { data: { httpStatus: number } } } };
        return b.error ? b.error.json.data.httpStatus : 200;
      }),
    );
    return new Response(JSON.stringify(body), {
      status: worst,
      headers: { "content-type": "application/json" },
    });
  };
}

export function createHarness(stub: TrpcStub) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Mirrors src/providers/TRPCProvider.tsx, `retry` included — it is the
        // real policy, and a harness that quietly used react-query's own
        // default of THREE retries would let a test pass on retry behaviour the
        // app does not have. useAuth sets the same function on its own query.
        staleTime: 5 * 60 * 1000,
        retry: retryQuery,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        // Without this a jsdom test that never reports "online" leaves fetches
        // parked in `paused` forever — the exact wedge documented in
        // contracts/auth-resolution.ts.
        networkMode: "always",
      },
      mutations: { retry: 0, networkMode: "always" },
    },
  });

  const trpcClient = trpc.createClient({
    links: [httpBatchLink({ url: "/api/trpc", transformer: superjson, fetch: stub.fetch })],
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </trpc.Provider>
      </MemoryRouter>
    );
  }

  return { Wrapper, queryClient };
}

/** A minimal `auth.me` payload. Only the fields useAuth's callers read. */
export const A_USER = {
  id: "u-1",
  email: "member@ansyra.dev",
  name: "Member",
  userKind: "member",
  organizationId: null,
  mustChangePassword: false,
  features: ["pipeline", "recommendations"],
};
