import { execFileSync } from "node:child_process";
import { writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { localTestEnvironment } from "../tests/support/local-environment";

// Read only the running local CLI stack. Never use a linked hosted project.
let status: Record<string, string>;
try {
  status = JSON.parse(execFileSync(resolve("node_modules/.bin/supabase"), ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
} catch {
  throw new Error("Start local Supabase first and ensure DOCKER_HOST points to its container runtime.");
}
const settings = {
  TEST_DATABASE_URL: status.DB_URL,
  TEST_SUPABASE_URL: status.API_URL,
  TEST_SUPABASE_ANON_KEY: status.ANON_KEY,
  TEST_SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
};
localTestEnvironment(settings);
const file = resolve(".env.test.local");
writeFileSync(file, Object.entries(settings).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
chmodSync(file, 0o600);
console.log("Local test configuration saved. Credentials were not printed.");
