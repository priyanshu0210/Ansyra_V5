import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";

/** Call only AFTER Supabase has verified this access token. Decoding is not verification. */
export function verifiedSessionId(verifiedToken: string, userId: string): string {
  let sessionId: unknown;
  try {
    const claims = JSON.parse(Buffer.from(verifiedToken.split(".")[1] ?? "", "base64url").toString());
    if (claims.sub === userId) sessionId = claims.session_id;
  } catch { /* rejected below */ }
  if (typeof sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Your session is no longer active. Please sign in again." });
  }
  return sessionId;
}

export async function assertActiveSession(verifiedToken: string, userId: string) {
  const sessionId = verifiedSessionId(verifiedToken, userId);
  const result = await getDb().execute(sql`
    SELECT id FROM auth.sessions
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}::uuid
      AND (not_after IS NULL OR not_after > now())
    LIMIT 1
  `);
  if (!result.rows.length) throw new TRPCError({ code: "UNAUTHORIZED", message: "Your session is no longer active. Please sign in again." });
}
