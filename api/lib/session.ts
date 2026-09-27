// ─────────────────────────────────────────────────────────────────────────────
// Session cookie — one httpOnly cookie carrying both Supabase tokens as JSON.
// The access_token expires after ~1 hour; the refresh_token gets us a new one
// silently in authenticateRequest(). 30-day maxAge means the login survives
// browser restarts until the user hits Logout.
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionPayload {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
}

export function encodeSession(session: SessionPayload): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function decodeSession(raw: string): SessionPayload | null {
  if (raw.length > 8192) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as SessionPayload;
    if (typeof parsed?.access_token !== "string" || typeof parsed?.refresh_token !== "string") return null;
    if (!parsed.access_token || !parsed.refresh_token || parsed.access_token.length > 6000 || parsed.refresh_token.length > 2000) return null;
    if (parsed.expires_at != null && (typeof parsed.expires_at !== "number" || !Number.isFinite(parsed.expires_at))) return null;
    return { access_token: parsed.access_token, refresh_token: parsed.refresh_token, ...(parsed.expires_at !== undefined ? { expires_at: parsed.expires_at } : {}) };
  } catch {
    return null;
  }
}
