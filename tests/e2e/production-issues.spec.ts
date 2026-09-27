import { test, expect, type Page } from "@playwright/test";
import { openTab, statePath } from "./fixtures";

async function selectKestrel(page: Page) {
  await page.getByRole("button", { name: /^Deal:/ }).click();
  await page.getByRole("combobox", { name: "Search deals" }).fill("Project Kestrel Retro");
  await page.getByRole("option", { name: /^Project Kestrel Retro(?: Selected)?$/ }).click();
}

const routes = ["pipeline", "targets", "genome", "assumptions", "cultural", "regulatory", "synergy", "comps", "analytics"];
for (const account of ["partner", "rival"] as const) {
  test.describe(`${account} route resilience`, () => {
    test.use({ storageState: statePath(account) });
    for (const tab of routes) test(`${tab} renders after direct entry and refresh`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openTab(page, tab);
      await expect(page.getByTestId("shell-loading")).toHaveCount(0);
      if (tab === "synergy" && account === "partner") await selectKestrel(page);
      if (tab === "synergy") await expect(page.getByText(account === "partner" ? "Cost workstreams with a named owner" : "Nothing in integration yet.", { exact: false })).toBeVisible();
      await page.reload();
      await expect(page.getByTestId(`dashboard-tab-${tab}`)).toBeVisible();
      await expect(page.getByTestId("shell-loading")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Something went wrong on this page." })).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}

test.describe("saved synergy and selector behavior", () => {
  test.use({ storageState: statePath("partner") });
  test("selector fits mobile and desktop viewports", async ({ page }, testInfo) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await openTab(page, "assumptions");
      await page.getByRole("button", { name: /^Deal:/ }).click();
      await page.getByRole("combobox", { name: "Search deals" }).fill("Project Anvil");
      await expect(page.getByRole("option", { name: /^Project Anvil(?: Selected)?$/ })).toBeVisible();
      await expect(page.locator('[data-slot="popover-content"]')).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(page.locator('[data-slot="popover-content"]')).toHaveCSS("opacity", "1");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`selector-${width}.png`) });
    }
  });
  test("loads legacy data, switches to missing data, and searches with keyboard", async ({ page }) => {
    await openTab(page, "synergy");
    await selectKestrel(page);
    await expect(page.getByTestId("synergy-result")).toBeVisible();
    await page.getByRole("button", { name: /^Deal:/ }).click();
    await page.getByRole("combobox", { name: "Search deals" }).fill("Nordhaven");
    await page.getByRole("combobox", { name: "Search deals" }).press("ArrowDown");
    await page.getByRole("combobox", { name: "Search deals" }).press("Enter");
    await expect(page.getByText("Synergy data is unavailable for this deal.")).toBeVisible();
    for (const tab of ["assumptions", "cultural", "regulatory"]) {
      await openTab(page, tab);
      await page.getByRole("button", { name: /^Deal:/ }).click();
      await page.getByRole("combobox", { name: "Search deals" }).fill("Project Verity");
      await page.getByRole("option", { name: /Project Verity/ }).click();
      await expect(page.getByRole("button", { name: "Deal: Project Verity" })).toBeVisible();
    }
  });
  test("Synergy API failure is local and offers retry", async ({ page }) => {
    await page.route("**/api/trpc/**", async (route) => {
      const paths = new URL(route.request().url()).pathname.split("/api/trpc/")[1].split(",");
      if (!paths.includes("ai.getSynergyPlan")) return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      body[paths.indexOf("ai.getSynergyPlan")] = { error: { json: { message: "Test unavailable", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } } };
      await route.fulfill({ response, json: body });
    });
    await openTab(page, "synergy");
    await expect(page.getByText("The synergy plan could not load.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Something went wrong on this page." })).toHaveCount(0);
  });
});
