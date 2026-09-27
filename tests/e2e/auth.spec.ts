import { test, expect } from "@playwright/test";
import { attemptLogin, login, ASSOCIATE, PARTNER } from "./fixtures";
import { resetLocalLoginLimits } from "../support/reset-login-limits";

test.beforeEach(resetLocalLoginLimits);

// These tests exercise logging in itself, so they run without a stored session.
test.use({ storageState: { cookies: [], origins: [] } });

// The session boundary, in a real browser with a real httpOnly cookie.

test("E2E-AUTH-01: a signed-out visitor is bounced off the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByTestId("auth-card")).toBeVisible();
});

test("E2E-AUTH-02: a seeded member can log in and reach the dashboard", async ({ page }) => {
  await login(page, PARTNER);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("E2E-AUTH-03: the session survives a full page reload", async ({ page }) => {
  // The actual claim an httpOnly session cookie is making. A client-side-only
  // session would pass every other test in this file and fail this one.
  //
  // Uses the ASSOCIATE account deliberately: the login limiter is per IP+email
  // at 5/min, and spreading these across accounts keeps any single email well
  // under it even when the whole file runs back to back.
  await login(page, ASSOCIATE);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("auth-card")).toHaveCount(0);
});

test("E2E-AUTH-04: a wrong password is refused with a visible message", async ({ page }) => {
  await attemptLogin(page, PARTNER.email, "definitely-not-the-password");
  await expect(page.getByTestId("auth-error")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/login/);
});

test("E2E-AUTH-05: an unknown account is refused without confirming it does not exist", async ({ page }) => {
  await attemptLogin(page, "nobody@thornevale.example.invalid", "whatever-Passw0rd!");
  const error = page.getByTestId("auth-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  // Account enumeration: the message must not distinguish "no such user" from
  // "wrong password".
  await expect(error).not.toContainText(/no such|does not exist|not found|unknown user/i);
});

test("idle warning resets on activity, then signs out only the idle browser session", async ({ page, browser }) => {
  await page.clock.install();
  await login(page, PARTNER);
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const otherPage = await other.newPage();
  try {
    await resetLocalLoginLimits();
    await login(otherPage, PARTNER);
    await page.clock.fastForward(55 * 60_000);
    await expect(page.getByText(/You’ve been inactive/)).toBeVisible();
    await page.getByRole("button", { name: "Stay signed in" }).click();
    await expect(page.getByText(/You’ve been inactive/)).toHaveCount(0);
    await page.clock.fastForward(59 * 60_000);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.clock.fastForward(60_000);
    await expect(page).toHaveURL(/\/login/);
    await otherPage.reload();
    await expect(otherPage.getByTestId("dashboard-tab-home")).toBeVisible();
  } finally {
    await other.close();
  }
});
