// ─────────────────────────────────────────────────────────────────────────────
// Browser end-to-end tests.
//
//   npm run test:e2e
//
// Deliberately NOT wired into .github/workflows/ci.yml: that job runs with no
// database and no keys, and these need both. CI keeps testing what it can test
// without secrets, which is a property worth protecting.
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig, devices } from "@playwright/test";
// The Playwright runner is its own process and does not inherit the dev
// server's environment, so the seeded-account passwords have to be loaded here.
import { localTestEnvironment } from "./tests/support/local-environment";
import { loadLocalCredentials } from "./tests/fixtures/thornevale/credentials";

// Refuse hosted credentials before the browser suite can launch a server or
// write any scratch data. The local runner also isolates dotenv and passwords.
if (process.env.ANSYRA_LOCAL_TEST !== "true") {
  throw new Error("Use npm run test:local:e2e with the isolated local Supabase stack.");
}
Object.assign(process.env, localTestEnvironment(process.env));
loadLocalCredentials();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  // A document analysis is a storage download, an extraction and a mock AI call
  // with a hard 600ms sleep, behind a dev server that compiles on demand.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // ONE worker, deliberately. The login rate limiter is in-memory and
  // per-process (5/min per IP+email), and every worker shares one database.
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"]] : [["list"], ["html", { open: "never" }]],
  use: {
    // MUST be `localhost`, never `127.0.0.1`. api/lib/cookies.ts decides the
    // Secure/SameSite flags from the request, and on any non-localhost host over
    // plain HTTP the session cookie is issued as SameSite=None; Secure — which
    // the browser then refuses to store, and login fails silently with no error
    // anywhere. This one line is the difference between a working suite and an
    // afternoon of debugging phantom auth failures.
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    // Runs first and logs each seeded account in once, saving the session for
    // the specs to reuse. See tests/e2e/auth.setup.ts for why this is load-
    // bearing rather than a performance tweak.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    // Mock AI for the same reason the vitest configs force it: `.env` carries a
    // live Gemini key, and a browser suite that makes billable, non-deterministic
    // calls is not a regression baseline.
    command: "AI_PROVIDER=mock npm run dev -- --strictPort",
    url: "http://localhost:3000/api/trpc/ping",
    // Never reuse a server whose database and provider settings we did not set.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
