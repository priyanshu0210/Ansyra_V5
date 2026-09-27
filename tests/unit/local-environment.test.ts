import { describe, expect, it } from "vitest";
import { localTestEnvironment } from "../support/local-environment";
const config = { TEST_DATABASE_URL: "postgresql://postgres:local-test@127.0.0.1:54322/postgres", TEST_SUPABASE_URL: "http://127.0.0.1:54321", TEST_SUPABASE_ANON_KEY: "local-anon", TEST_SUPABASE_SERVICE_ROLE_KEY: "local-service" };
describe("local test isolation", () => {
  it("refuses ordinary application credentials", () => expect(() => localTestEnvironment({ DATABASE_URL: config.TEST_DATABASE_URL })).toThrow());
  it("refuses a remote database even with local auth", () => expect(() => localTestEnvironment({ ...config, TEST_DATABASE_URL: "postgresql://user:pass@remote.supabase.co/postgres" })).toThrow());
  it("refuses remote auth even with a local database", () => expect(() => localTestEnvironment({ ...config, TEST_SUPABASE_URL: "https://project.supabase.co" })).toThrow());
  it("configures only the explicitly selected local stack", () => expect(localTestEnvironment(config)).toMatchObject({ SUPABASE_URL: config.TEST_SUPABASE_URL, AI_PROVIDER: "mock", DATABASE_SSL: "false" }));
});
