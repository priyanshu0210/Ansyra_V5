// ─────────────────────────────────────────────────────────────────────────────
// The golden regression suite — release-critical scenarios, each named with a
// stable REG-<AREA>-<NNN> id so a future run can be diffed against this one.
//
// Separate from the integration config because the two answer different
// questions: integration asks "does this wiring work", regression asks "does
// this still behave the way it behaved when we signed off". Same machinery,
// different contract with the reader.
//
//   npm run test:regression
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig } from "vitest/config";
import path from "path";

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "@contracts": path.resolve(root, "contracts"),
      "@db": path.resolve(root, "db"),
      db: path.resolve(root, "db"),
      "@fixtures": path.resolve(root, "tests/fixtures"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/regression/**/*.rtest.ts"],
    setupFiles: ["tests/support/env.ts"],
    // Absorbs the cold-pooler connection cost once per run rather than
    // charging it to whichever test queries first. See the file for the
    // failure it prevents.
    globalSetup: ["tests/support/global-setup.ts"],
    // Supabase's transaction pooler and the in-memory rate limiters are both
    // per-process and shared, and these tests write to one database. Running
    // files in parallel produced pooler contention and tripped the 20/min AI
    // limiter; serial is slower and correct.
    fileParallelism: false,
    // A document analysis is a storage download plus an extraction plus a mock
    // AI call with a hard 600ms sleep. The 5s default is not enough.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      // The single most important line in this file. `.env` has a live Gemini
      // key; without this the suite would make real billable calls and stop
      // being a deterministic baseline.
      AI_PROVIDER: "mock",
    },
  },
});
