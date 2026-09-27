import { test as base, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import {
  USER_ASSOCIATE,
  USER_PARTNER,
  USER_RIVAL,
} from "@fixtures/thornevale/ids";
import { passwordFor } from "@fixtures/thornevale/credentials";
import { fileURLToPath } from "node:url";

// The package is ESM ("type": "module"), so __dirname does not exist here.
const HERE = join(fileURLToPath(import.meta.url), "..");

// Shared login helpers. Credentials come from the seeded corpus rather than from
// env vars so the suite runs for anyone who has run `npm run seed:thornevale`.

// Resolved from the environment at import time, never committed. If the four
// variables are unset this throws with instructions rather than falling back to
// a default — a default password on a seeded account is the exact thing the
// credentials module exists to prevent.
export const PARTNER = {
  email: USER_PARTNER.email,
  password: passwordFor(USER_PARTNER),
};
export const ASSOCIATE = {
  email: USER_ASSOCIATE.email,
  password: passwordFor(USER_ASSOCIATE),
};
export const RIVAL = {
  email: USER_RIVAL.email,
  password: passwordFor(USER_RIVAL),
};

/** Where a logged-in session is cached between the setup project and the specs. */
export function statePath(who: "partner" | "associate" | "rival"): string {
  return join(HERE, ".auth", `${who}.json`);
}

export async function login(page: Page, who: { email: string; password: string }) {
  // Driven by data-testid rather than by label text: the login form's <label>
  // elements are not associated with their inputs via htmlFor, so getByLabel
  // finds nothing. The testids are the stable contract here.
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(who.email);
  await page.getByTestId("auth-password").fill(who.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
}

/** Attempt a login without waiting for it to succeed. */
export async function attemptLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("login-submit").click();
}

/**
 * Open a dashboard tab. Sections are query params on /dashboard, not paths —
 * `home` owns the clean no-param URL.
 */
export async function openTab(page: Page, tab: string) {
  await page.goto(tab === "home" ? "/dashboard" : `/dashboard?tab=${tab}`);
  await expect(page.getByTestId(`dashboard-tab-${tab}`)).toBeVisible({ timeout: 30_000 });
}

/** Search before opening a retained fixture: newer scratch rows can fill page one. */
export async function openAnvil(page: Page): Promise<string> {
  await openTab(page, "pipeline");
  await page.getByRole("textbox", { name: "Search deals", exact: true }).fill("Project Anvil");
  await page.getByRole("button", { name: "Project Anvil", exact: true }).click();
  await page.waitForURL(/\/dashboard\/deals\/\d+/, { timeout: 30_000 });
  return new URL(page.url()).pathname;
}

export { base as test, expect };
