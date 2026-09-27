import { httpBatchLink, httpLink, splitLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";
import { apiFetch } from "./api-fetch";

/** The dossier's critical record must not wait for slower analysis queries. */
export function createApiLinks() {
  const options = { url: "/api/trpc", transformer: superjson, fetch: apiFetch };
  return [splitLink<AppRouter>({
    condition: (op) => op.type === "query" && op.path === "deals.get",
    true: httpLink(options),
    false: splitLink<AppRouter>({
      condition: (op) => op.type === "query" && ["ai.listAssumptions", "recommendations.list"].includes(op.path),
      true: httpBatchLink(options),
      false: httpBatchLink(options),
    }),
  })];
}
