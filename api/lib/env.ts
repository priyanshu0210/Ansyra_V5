import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";

function required(name: string): string {
  const value = process.env[name];
  if (!value && isProduction) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function canonicalSiteUrl(): string {
  // Render assigns the public origin only when the service is created.
  // An explicit SITE_URL still takes precedence for custom domains.
  const raw = process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || required("SITE_URL");
  if (!raw) return "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("SITE_URL must be an absolute URL.");
  }
  if (isProduction && parsed.protocol !== "https:" && process.env.ALLOW_INSECURE_SITE_URL !== "true") {
    throw new Error("SITE_URL must use https in production.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("SITE_URL must contain only the canonical origin, without a path, query, or hash.");
  }
  return parsed.origin;
}

const databaseUrl = required("DATABASE_URL");
const databaseHost = (() => {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "";
  }
})();
const databaseIsLocal = databaseHost === "localhost" || databaseHost === "127.0.0.1" || databaseHost === "::1";
const appMode = process.env.APP_MODE === "production" ? "production" : "demo";
const portfolioDemo = process.env.PORTFOLIO_DEMO === "true";

export const env = {
  isProduction,
  appMode,
  portfolioDemo,
  databaseUrl,
  databaseSsl: process.env.DATABASE_SSL
    ? process.env.DATABASE_SSL === "true"
    : Boolean(databaseUrl && !databaseIsLocal),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  siteUrl: canonicalSiteUrl(),
  emailFrom: process.env.EMAIL_FROM ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  trustProxyHeaders: process.env.TRUST_PROXY_HEADERS === "true",
  // Which header carries the client address, and how many proxies we trust to
  // have appended to it. The client IP is the entry TRUSTED_PROXY_HOPS from the
  // RIGHT of that header: anything a client prepends itself is ignored. Only
  // this one header is ever read — never cf-connecting-ip / x-real-ip / other
  // platform headers a client can simply set when that platform is not in use.
  proxyIpHeader: (process.env.PROXY_IP_HEADER || "x-forwarded-for").trim().toLowerCase(),
  trustedProxyHops: positiveInteger("TRUSTED_PROXY_HOPS", 1),
  // Redirect requests that arrive on a non-canonical host (a platform's default
  // hostname) to SITE_URL, so the Origin check on mutations never strands a
  // user who opened the wrong host. Opt out with CANONICAL_HOST_REDIRECT=false.
  canonicalHostRedirect: process.env.CANONICAL_HOST_REDIRECT !== "false",
  allowCrossSiteEmbedding: process.env.ALLOW_CROSS_SITE_EMBEDDING === "true",
  // Operator acknowledgement that the AI provider's data-processing terms have
  // been reviewed. Required for document analysis with a live provider in
  // production regardless of APP_MODE — the full document text leaves the
  // tenant, and a demo flag is not a substitute for that decision.
  aiDataProcessingApproved: process.env.AI_DATA_PROCESSING_APPROVED === "true",
  allowInsecureSiteUrl: process.env.ALLOW_INSECURE_SITE_URL === "true",
  aiUserMinuteLimit: positiveInteger("AI_USER_MINUTE_LIMIT", 20),
  aiUserDayLimit: positiveInteger("AI_USER_DAY_LIMIT", 20),
  aiPlatformMinuteLimit: positiveInteger("AI_PLATFORM_MINUTE_LIMIT", 5),
  aiPlatformDayLimit: positiveInteger("AI_PLATFORM_DAY_LIMIT", 100),
  externalRequestTimeoutMs: positiveInteger("EXTERNAL_REQUEST_TIMEOUT_MS", 45_000),
  databaseConnectionTimeoutMs: positiveInteger("DATABASE_CONNECTION_TIMEOUT_MS", 10_000),
  databaseStatementTimeoutMs: positiveInteger("DATABASE_STATEMENT_TIMEOUT_MS", 30_000),
  // Optional: error reporting is skipped entirely when unset (Phase 13.4).
  sentryDsn: process.env.SENTRY_DSN ?? "",
};

if (isProduction && !env.trustProxyHeaders) {
  console.warn(
    "[env] TRUST_PROXY_HEADERS is false: rate limits will key on the socket peer address. " +
      "Behind a reverse proxy that is the proxy itself, so every visitor shares one bucket. " +
      "Set TRUST_PROXY_HEADERS=true (and PROXY_IP_HEADER / TRUSTED_PROXY_HOPS if needed) when a proxy terminates TLS.",
  );
}

if (isProduction && appMode === "production") {
  for (const name of ["RESEND_API_KEY", "EMAIL_FROM", "CRON_SECRET", "SENTRY_DSN"] as const) {
    if (!process.env[name]) throw new Error(`Missing required production environment variable: ${name}`);
  }
  for (const name of ["LEGAL_REVIEW_COMPLETE", "BACKUP_RESTORE_TESTED", "AI_DATA_PROCESSING_APPROVED"] as const) {
    if (process.env[name] !== "true") {
      throw new Error(`${name}=true is required when APP_MODE=production.`);
    }
  }
}
