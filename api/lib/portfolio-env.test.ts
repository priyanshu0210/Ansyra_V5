import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("allows a portfolio to use the configured live provider", async () => {
  vi.stubEnv("PORTFOLIO_DEMO", "true");
  vi.stubEnv("APP_MODE", "demo");
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
  const { env } = await import("./env");
  expect(env.portfolioDemo).toBe(true);
  expect(env.aiDataProcessingApproved).toBe(true);
});

it("does not let a portfolio flag bypass real-data production gates", async () => {
  vi.stubEnv("PORTFOLIO_DEMO", "true");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_MODE", "production");
  vi.stubEnv("SITE_URL", "https://portfolio.example");
  vi.stubEnv("DATABASE_URL", "postgres://local:local@127.0.0.1/example");
  vi.stubEnv("SUPABASE_URL", "https://project.example");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-placeholder");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-placeholder");
  vi.stubEnv("TRUST_PROXY_HEADERS", "true");
  vi.stubEnv("RESEND_API_KEY", "test-placeholder");
  vi.stubEnv("EMAIL_FROM", "test@example.com");
  vi.stubEnv("CRON_SECRET", "test-placeholder");
  vi.stubEnv("SENTRY_DSN", "test-placeholder");
  vi.stubEnv("LEGAL_REVIEW_COMPLETE", "false");
  await expect(import("./env")).rejects.toThrow(/LEGAL_REVIEW_COMPLETE=true is required/);
});

it("permits a hosted portfolio without falsely setting business acknowledgements", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PORTFOLIO_DEMO", "true");
  vi.stubEnv("APP_MODE", "demo");
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("SITE_URL", "https://portfolio.example");
  vi.stubEnv("DATABASE_URL", "postgres://local:local@127.0.0.1/example");
  vi.stubEnv("SUPABASE_URL", "https://project.example");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-placeholder");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-placeholder");
  vi.stubEnv("TRUST_PROXY_HEADERS", "true");
  for (const key of ["LEGAL_REVIEW_COMPLETE", "AI_DATA_PROCESSING_APPROVED", "BACKUP_RESTORE_TESTED"]) vi.stubEnv(key, "false");
  const { env } = await import("./env");
  expect(env.portfolioDemo).toBe(true);
  expect(env.aiDataProcessingApproved).toBe(false);
});

it("uses Render's assigned origin when SITE_URL is empty", async () => {
  vi.stubEnv("SITE_URL", "");
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://assigned-demo.onrender.com");
  const { env } = await import("./env");
  expect(env.siteUrl).toBe("https://assigned-demo.onrender.com");
});

it("prefers an explicit custom origin over Render's assigned origin", async () => {
  vi.stubEnv("SITE_URL", "https://portfolio.example");
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://assigned-demo.onrender.com");
  const { env } = await import("./env");
  expect(env.siteUrl).toBe("https://portfolio.example");
});

it("validates the fallback origin with the same origin-only restriction", async () => {
  vi.stubEnv("SITE_URL", "");
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://assigned-demo.onrender.com/path");
  await expect(import("./env")).rejects.toThrow(/canonical origin/);
});
