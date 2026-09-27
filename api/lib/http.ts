import { env } from "./env";

// Where email links (password reset, invite) should send the user back to.
// Prefer an explicit SITE_URL (production), else derive from the request Origin
// so localhost and preview hosts work without config. Whatever this resolves to
// must be on the Supabase Auth redirect allow-list (Phase 6 dashboard checklist).
export function requestOrigin(req: Request): string {
  const configured = env.siteUrl || process.env.SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (env.isProduction) {
    throw new Error("SITE_URL is required in production.");
  }
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* fall through */
    }
  }
  return "http://localhost:3000";
}
