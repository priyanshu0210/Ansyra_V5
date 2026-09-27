import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { localTestEnvironment } from "../tests/support/local-environment";
const settings = parse(readFileSync(resolve(".env.test.local")));
const local = localTestEnvironment(settings);
const runtime: NodeJS.ProcessEnv = { ...process.env, ...settings, ...local, DOTENV_CONFIG_PATH: resolve(".env.test.local") };
for (const key of ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "RESEND_API_KEY", "SENTRY_DSN"]) delete runtime[key];
for (const key of Object.keys(runtime)) if (/^SEED_.*_PASSWORD$/.test(key)) delete runtime[key];
const mode = process.argv[2] ?? "integration";
if (!["seed", "integration", "regression", "e2e", "preflight"].includes(mode)) throw new Error("Choose seed, integration, regression, e2e or preflight.");
const args = mode === "seed"
  ? ["node_modules/tsx/dist/cli.mjs", "--tsconfig", "tsconfig.server.json", "scripts/seed-thornevale.ts"]
  : mode === "preflight"
  ? ["node_modules/tsx/dist/cli.mjs", "--tsconfig", "tsconfig.server.json", "scripts/release-preflight.ts"]
  : mode === "e2e"
  ? ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(3)]
  : ["node_modules/vitest/vitest.mjs", "run", "--config", mode === "regression" ? "vitest.regression.config.ts" : "vitest.integration.config.ts", ...process.argv.slice(3)];
const child = spawn(process.execPath, args, { env: runtime, stdio: "inherit" });
// Let Playwright stop its web server when the wrapper is interrupted.
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => child.kill(signal));
child.once("error", () => { console.error("Could not start the isolated test runner."); process.exitCode = 1; });
child.once("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1); });
