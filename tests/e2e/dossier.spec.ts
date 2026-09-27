import { test, expect } from "@playwright/test";
import { openAnvil, openTab, statePath } from "./fixtures";

// The screens a person actually opens, rendered against the full corpus.

test.describe("the dashboard renders against real data", () => {
  test.use({ storageState: statePath("partner") });

  test("E2E-DASH-01: the pipeline lists the seeded deals", async ({ page }) => {
    await openTab(page, "pipeline");
    await page.getByRole("textbox", { name: "Search deals", exact: true }).fill("Project Anvil");
    await expect(page.getByText("Project Anvil", { exact: true }).first()).toBeVisible();
    await page.getByRole("textbox", { name: "Search deals", exact: true }).fill("Project Verity");
    await expect(page.getByText("Project Verity", { exact: false }).first()).toBeVisible();
  });

  test("E2E-DASH-02: the home tab renders without a data error", async ({ page }) => {
    await openTab(page, "home");
    await expect(page.getByTestId("data-error")).toHaveCount(0);
  });

  test("E2E-DASH-03: analytics renders against the corpus", async ({ page }) => {
    await openTab(page, "analytics");
    await expect(page.getByTestId("data-error")).toHaveCount(0);
  });

  test("E2E-DASH-04: target screening lists the seeded targets", async ({ page }) => {
    await openTab(page, "targets");
    await expect(page.getByText("Ashgrove Surface Technologies", { exact: false }).first()).toBeVisible();
  });

  test("E2E-DASH-05: the comps tab renders", async ({ page }) => {
    await openTab(page, "comps");
    await expect(page.getByTestId("data-error")).toHaveCount(0);
  });

  test("E2E-DASH-06: the activity feed renders the corpus history", async ({ page }) => {
    await openTab(page, "activity");
    await expect(page.getByTestId("data-error")).toHaveCount(0);
  });

  test("E2E-DASH-07: no console errors while moving across the main tabs", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    for (const tab of ["home", "pipeline", "targets", "analytics", "genome"]) {
      await openTab(page, tab);
    }
    // React key warnings and the like are noise; a thrown error is not.
    const real = errors.filter((e) => !/DevTools|favicon|Download the React/i.test(e));
    expect(real, `console errors: ${real.join(" | ")}`).toEqual([]);
  });
});

test.describe("the deal dossier", () => {
  test.use({ storageState: statePath("partner") });

  test("E2E-DOSSIER-01: Project Anvil opens with its panels populated", async ({ page }) => {
    await openAnvil(page);
    await expect(page.getByTestId("deal-detail-error")).toHaveCount(0);
    await expect(page.getByText("Thornevale Industrial Group", { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("E2E-DOSSIER-02: the dossier survives a reload on its own URL", async ({ page }) => {
    await openAnvil(page);
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId("deal-detail-error")).toHaveCount(0);
  });

  test("E2E-DOSSIER-03: another firm hitting the same URL gets an error state, not the deal", async ({ page, browser }) => {
    // Read the id as the owner, then visit it in a SEPARATE context carrying the
    // rival firm's session. A fresh context rather than clearing cookies and
    // logging in again — that second login is what tripped the rate limiter and
    // made this test fail for a reason unrelated to what it tests.
    await openAnvil(page);
    const dealUrl = new URL(page.url()).pathname;

    const rivalContext = await browser.newContext({ storageState: statePath("rival") });
    const rivalPage = await rivalContext.newPage();
    await rivalPage.goto(`http://localhost:3000${dealUrl}`);
    await expect(rivalPage.getByTestId("deal-detail-error")).toBeVisible({ timeout: 30_000 });
    await expect(rivalPage.getByText("Thornevale Industrial Group", { exact: false })).toHaveCount(0);
    await rivalContext.close();
  });
});

test.describe("feature gating in the UI", () => {
  test.use({ storageState: statePath("partner") });

  test("E2E-RBAC-01: the associate does not see the tabs they lack grants for", async ({ browser }) => {
    // Seeded without `documents` and `economics`. The server refuses those
    // routes; the UI should not offer them in the first place.
    const ctx = await browser.newContext({ storageState: statePath("associate") });
    const page = await ctx.newPage();
    await openTab(page, "home");
    const nav = page.getByRole("navigation");
    await expect(nav.getByText(/deal economics/i)).toHaveCount(0);
    await ctx.close();
  });

  test("E2E-RBAC-02: the partner reaches the dashboard cleanly", async ({ page }) => {
    await openTab(page, "home");
    await expect(page.getByTestId("data-error")).toHaveCount(0);
  });
});

test.describe("responsive", () => {
  test.use({ storageState: statePath("partner") });

  for (const [label, width, height] of [
    ["mobile", 375, 812],
    ["tablet", 768, 1024],
    ["desktop", 1280, 800],
  ] as const) {
    test(`E2E-RESP-${label}: the dashboard does not scroll horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openTab(page, "pipeline");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A couple of pixels of sub-pixel rounding is not a layout bug.
      expect(overflow, `horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(2);
    });
  }
});
