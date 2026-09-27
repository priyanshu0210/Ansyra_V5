import { shouldRetryQuery } from "@contracts/auth-resolution";

// The client-side adapter for `shouldRetryQuery` — the policy lives in
// contracts/auth-resolution.ts, where it is pure and unit-tested; this file only
// knows how to find an error code on the thing react-query hands us.
//
// It has to read the code defensively. The QueryClient's `defaultOptions.queries
// .retry` is typed against plain `Error`, not `TRPCClientErrorLike`, because the
// default applies to every query regardless of who issued it — and the errors
// that actually arrive here are a mix: a tRPC error carrying `data.code`, a
// `TypeError` from a refused connection, and the sentence `api-fetch.ts`
// synthesises when a proxy answers with HTML. Only the first has a code, and the
// other two must retry, so an unreadable shape has to come back `undefined`
// rather than throw.

/** The tRPC error code, if this error is a tRPC error at all. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return undefined;
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Drop-in for react-query's `retry` option. */
export function retryQuery(failureCount: number, error: unknown): boolean {
  return shouldRetryQuery(failureCount, errorCode(error));
}
