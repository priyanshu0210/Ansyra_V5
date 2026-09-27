/** Fail before importing application clients. Test credentials must be explicit and local. */
export function localTestEnvironment(source: Record<string, string | undefined>) {
  const required = ["TEST_DATABASE_URL", "TEST_SUPABASE_URL", "TEST_SUPABASE_ANON_KEY", "TEST_SUPABASE_SERVICE_ROLE_KEY"] as const;
  for (const key of required) if (!source[key]) throw new Error(`${key} is required. Use the isolated local Supabase test environment.`);
  const db = new URL(source.TEST_DATABASE_URL!);
  const api = new URL(source.TEST_SUPABASE_URL!);
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!loopback.has(db.hostname) || !loopback.has(api.hostname) || !["postgres:", "postgresql:"].includes(db.protocol) || api.protocol !== "http:") {
    throw new Error("Database-backed tests require loopback Supabase URLs. Hosted projects are refused.");
  }
  return {
    ANSYRA_LOCAL_TEST: "true", NODE_ENV: "test", PORT: "3000", DATABASE_URL: db.toString(), DATABASE_SSL: "false", SUPABASE_URL: api.origin,
    SUPABASE_ANON_KEY: source.TEST_SUPABASE_ANON_KEY!, SUPABASE_SERVICE_ROLE_KEY: source.TEST_SUPABASE_SERVICE_ROLE_KEY!,
    AI_PROVIDER: "mock", AI_MODEL: "mock", APP_MODE: "demo", SITE_URL: "http://localhost:3000",
    // Large isolated-suite limits let functional tests exercise many calls.
    // Dedicated rate-limit tests independently verify the actual boundaries.
    AI_USER_MINUTE_LIMIT: "10000", AI_USER_DAY_LIMIT: "10000", AI_PLATFORM_MINUTE_LIMIT: "10000", AI_PLATFORM_DAY_LIMIT: "10000",
  };
}
