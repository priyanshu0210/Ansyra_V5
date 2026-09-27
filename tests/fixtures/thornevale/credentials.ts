// ─────────────────────────────────────────────────────────────────────────────
// Passwords for the seeded accounts. NEVER committed.
//
// The rest of this fixture is deliberately public — names, ids, financials, the
// whole synthetic company — because a corpus you cannot read is a corpus nobody
// can debug. Passwords are the one exception: the moment the repo is public and
// the app is deployed, a committed password is a working login for a stranger.
//
// So `ids.ts` carries the NAME of an environment variable, and the value is
// resolved here at runtime. Three consequences worth knowing:
//
//   1. Nothing in this module is imported by the unit suite. `index.ts` does not
//      re-export it, so `npm test` still runs in CI with no environment at all.
//   2. On a machine with no passwords set, the seeder GENERATES strong ones and
//      writes them to `.env.seed.local` (gitignored). You never have to invent a
//      password, and the same machine keeps the same ones across runs.
//   3. In a deployment you set the four variables yourself, and they are the
//      only place those passwords exist.
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_USERS, type SeedUser } from "./ids";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..", "..");

/** Gitignored, machine-local, generated on first seed. */
export const LOCAL_CREDENTIALS_FILE = join(REPO_ROOT, process.env.ANSYRA_LOCAL_TEST === "true" ? ".env.seed.test.local" : ".env.seed.local");

let loaded = false;

/**
 * Populate `process.env` from `.env.seed.local`, if it exists.
 *
 * Deliberately does NOT overwrite a variable that is already set: an explicit
 * environment always beats the local file, which is what makes a deployment's
 * configuration authoritative over a developer's leftovers.
 */
export function loadLocalCredentials(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(LOCAL_CREDENTIALS_FILE)) return;
  for (const line of readFileSync(LOCAL_CREDENTIALS_FILE, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** A strong password that satisfies the usual complexity rules without needing
 *  a policy engine to prove it: 32 base64url chars plus a fixed suffix. */
function generatePassword(): string {
  return `${randomBytes(24).toString("base64url")}!aA1`;
}

/**
 * The password for one seeded user.
 *
 * Throws rather than falling back to a default. A default password on a seeded
 * account is exactly the thing this module exists to prevent, and a loud failure
 * at the point of use is much easier to diagnose than a login that silently
 * stops working.
 */
export function passwordFor(user: SeedUser): string {
  loadLocalCredentials();
  const value = process.env[user.passwordEnv];
  if (!value) {
    throw new Error(
      `${user.passwordEnv} is not set, so the password for ${user.email} is unknown.\n` +
        `Run \`npm run seed:thornevale\` once — it generates the four passwords and writes\n` +
        `them to .env.seed.local (gitignored) — or set the variable yourself.`,
    );
  }
  return value;
}

/**
 * Every seeded password, generating and persisting any that are missing.
 *
 * Only the seeder calls this. Everything else uses `passwordFor`, which refuses
 * to invent a password behind your back — a test that quietly generated one
 * would be testing an account nobody can log into.
 */
export function resolveSeedPasswords(): Map<string, string> {
  loadLocalCredentials();
  const resolved = new Map<string, string>();
  const generated: string[] = [];

  for (const user of SEED_USERS) {
    let value = process.env[user.passwordEnv];
    if (!value) {
      value = generatePassword();
      process.env[user.passwordEnv] = value;
      generated.push(user.passwordEnv);
    }
    resolved.set(user.email, value);
  }

  if (generated.length > 0) {
    const body = [
      "# Passwords for the Thornevale seeded accounts.",
      "# GENERATED LOCALLY — gitignored, and the only copy that exists.",
      "# Back these up if you care about them; re-seeding with this file deleted",
      "# generates new ones and resets the accounts to match.",
      "",
      ...SEED_USERS.map((u) => `${u.passwordEnv}=${resolved.get(u.email)}`),
      "",
    ].join("\n");
    writeFileSync(LOCAL_CREDENTIALS_FILE, body, { mode: 0o600 });
  }

  return resolved;
}

/** True when this run had to invent passwords — the seeder prints them once. */
export function credentialsFileExists(): boolean {
  return existsSync(LOCAL_CREDENTIALS_FILE);
}
