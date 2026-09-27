import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./auth/verify";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  /** The TCP peer address, when the adapter can supply it. Rate limiting falls
   *  back to it whenever proxy headers are not trusted (api/lib/rate-limit.ts). */
  remoteAddress?: string;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
  remoteAddress?: string,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders, remoteAddress };
  try {
    ctx.user = await authenticateRequest(opts.req.headers, opts.resHeaders);
  } catch {
    // Unauthenticated is fine here — authedQuery will reject as needed.
  }
  return ctx;
}
