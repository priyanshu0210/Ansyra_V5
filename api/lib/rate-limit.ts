import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { env } from "./env";
import { getDb } from "../queries/connection";

/**
 * Shared fixed-window limiter backed by Postgres. Keys are hashed before they
 * leave the process so email addresses, IPs and user ids are not stored in the
 * limiter table. The upsert is atomic across processes and deployments.
 */
export async function enforceRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
  message = "Too many requests — try again later.",
): Promise<void> {
  if (!/^[a-z0-9-]{1,40}$/.test(bucket)) throw new Error("Invalid rate-limit bucket.");
  const keyHash = createHash("sha256").update(`${bucket}:${key}`).digest("hex");
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const result = await getDb().execute<{ hits: number }>(sql`
    INSERT INTO public.rate_limits (bucket, key_hash, hits, reset_at)
    VALUES (${bucket}, ${keyHash}, 1, now() + (${windowSeconds} * interval '1 second'))
    ON CONFLICT (bucket, key_hash) DO UPDATE SET
      hits = CASE
        WHEN public.rate_limits.reset_at <= now() THEN 1
        ELSE public.rate_limits.hits + 1
      END,
      reset_at = CASE
        WHEN public.rate_limits.reset_at <= now()
          THEN now() + (${windowSeconds} * interval '1 second')
        ELSE public.rate_limits.reset_at
      END
    RETURNING hits
  `);
  if (Number(result.rows[0]?.hits ?? 0) > limit) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
  }
}

/**
 * The client's address for rate-limit keys.
 *
 * With proxy trust on, read ONE configured header (`PROXY_IP_HEADER`, default
 * `x-forwarded-for`) and take the entry `TRUSTED_PROXY_HOPS` from the right —
 * the one the trusted proxy appended. Entries to its left were supplied by the
 * client and are ignored, so a spoofed header cannot mint fresh buckets.
 * Platform-specific headers (`cf-connecting-ip`, `x-real-ip`, …) are never
 * consulted unless explicitly configured as the header, because a client can
 * set them freely whenever that platform is not actually in front of us.
 *
 * Without proxy trust, or when the header is absent, the socket peer address
 * is used. Directly exposed that is the real client; behind a proxy it is the
 * proxy, which env.ts warns about at boot.
 */
export function getClientIp(req: Request, remoteAddress?: string): string {
  if (env.trustProxyHeaders) {
    const raw = req.headers.get(env.proxyIpHeader);
    if (raw) {
      const hops = raw.split(",").map((s) => s.trim()).filter(Boolean);
      const pick = hops[Math.max(0, hops.length - env.trustedProxyHops)];
      if (pick) return pick;
    }
  }
  const peer = remoteAddress?.trim();
  return peer || "unknown";
}

/** App counters only: these are not a measurement of the provider's quota. */
export async function readAllowance(bucket: string, key: string, limit: number) {
  const hash = createHash("sha256").update(`${bucket}:${key}`).digest("hex");
  const result = await getDb().execute<{ hits: number; reset_at: string }>(sql`SELECT hits, reset_at FROM public.rate_limits WHERE bucket = ${bucket} AND key_hash = ${hash} AND reset_at > now()`);
  const row = result.rows[0];
  const used = Math.min(limit, Number(row?.hits ?? 0));
  return { limit, used, remaining: Math.max(0, limit - used), resetsAt: row?.reset_at ?? null, nearLimit: used >= limit * 0.8 };
}
