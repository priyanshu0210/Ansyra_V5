import { test as setup } from "@playwright/test";
import { login, PARTNER, ASSOCIATE, RIVAL, statePath } from "./fixtures";
import { resetLocalLoginLimits } from "../support/reset-login-limits";

setup.beforeEach(resetLocalLoginLimits);

// Log each seeded account in ONCE and save the session for every spec to reuse.
//
// Not an optimisation. The login limiter is database-backed and limits both IP
// and account (api/auth-router.ts), and a suite that logs
// in on every test trips it partway through and fails the rest with a timeout
// that looks exactly like a broken login. The first version of this suite did
// precisely that: four tests failed, all of them for that reason and none of
// them for the reason they were testing.

setup("authenticate as the partner", async ({ page }) => {
  await login(page, PARTNER);
  await page.context().storageState({ path: statePath("partner") });
});

setup("authenticate as the associate", async ({ page }) => {
  await login(page, ASSOCIATE);
  await page.context().storageState({ path: statePath("associate") });
});

setup("authenticate as the rival firm", async ({ page }) => {
  await login(page, RIVAL);
  await page.context().storageState({ path: statePath("rival") });
});
