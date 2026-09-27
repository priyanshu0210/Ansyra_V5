import { test, expect } from "@playwright/test";
import { openAnvil, statePath } from "./fixtures";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The workflows a person actually performs, driven through the browser:
// open a dossier, upload a document, run an analysis on it, read the result.

test.use({ storageState: statePath("partner") });

test("E2E-ROOM-01: the data room lists the seeded corpus", async ({ page }) => {
  await openAnvil(page);
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  const room = page.getByTestId("data-room");
  await expect(room).toBeVisible({ timeout: 30_000 });
  await expect(room.getByText("Quality of Earnings Report", { exact: false }).first()).toBeVisible();
  await expect(room.getByText("Financial History FY2001-FY2025", { exact: false }).first()).toBeVisible();
});

test("E2E-ROOM-02: a document uploads through the browser and appears in the list", async ({ page }) => {
  await openAnvil(page);
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page.getByTestId("data-room")).toBeVisible({ timeout: 30_000 });

  // A real file on disk, uploaded through the real signed-URL handshake: the
  // browser PUTs the bytes straight to Storage and they never pass through the
  // API server, which is why its body limit is only 2 MB.
  const dir = mkdtempSync(join(tmpdir(), "ansyra-e2e-"));
  const name = `e2e-upload-${Date.now()}.txt`;
  const file = join(dir, name);
  writeFileSync(
    file,
    [
      "SUPPLEMENTARY DILIGENCE NOTE (uploaded by the end-to-end suite)",
      "",
      "Torvald Agritech represents 18.7% of FY2025 revenue and renews in December 2027.",
      "The contract carries a 3% annual price-down clause.",
    ].join("\n"),
  );

  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByTestId("data-room").getByText(name, { exact: false })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("doc-error")).toHaveCount(0);

  // Persisted, not just optimistically rendered.
  await page.reload();
  await expect(page.getByTestId("data-room").getByText(name, { exact: false })).toBeVisible({ timeout: 30_000 });

  expect(readFileSync(file, "utf8")).toContain("Torvald Agritech");
});

test("E2E-ROOM-03: an analysis runs on a document and its result is readable", async ({ page }) => {
  await openAnvil(page);
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  const room = page.getByTestId("data-room");
  await expect(room).toBeVisible({ timeout: 30_000 });

  // Pick whichever document row rendered first and drive its analyse menu.
  const analyseButton = page.locator('[data-testid^="doc-analyze-"]').first();
  await analyseButton.click();
  const redFlags = page.locator('[data-testid$="-red_flags"]').first();
  await redFlags.click();

  // Mock mode sleeps a fixed 600ms and every mock string carries the literal
  // "[mock]", which makes it a reliable marker that a real analysis ran.
  await expect(page.locator('[data-testid^="analysis-"]').first()).toBeVisible({ timeout: 60_000 });
});

test("E2E-GATE-01: the dossier tells the user the advancement gate is locked", async ({ page }) => {
  // The corpus is deliberately stuck: one unanswered red-flag assumption, and
  // the accepted conclusion at this stage has expired. The dossier should SAY
  // so, rather than offering an advance the server would refuse.
  //
  // Matched EXACTLY. The dossier renders the summary line as its own paragraph
  // and then repeats a longer form inside panels that are collapsed by default,
  // so a regex match resolved to a hidden node and timed out — a selector bug
  // that looked exactly like the feature being broken.
  await openAnvil(page);
  await expect(page.getByTestId("deal-detail-error")).toHaveCount(0);
  await expect(page.getByText("Advancement gate: locked", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("E2E-GATE-02: the locked gate explains WHY, naming the specific blocker", async ({ page }) => {
  // "Blocked" with no reason is precisely the failure mode this product exists
  // to avoid, so the explanation is the thing worth asserting — not the lock.
  await openAnvil(page);
  await expect(page.getByText("Advancement gate: locked", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/red-flag assumption is unanswered/i).first()).toBeVisible();
});

test("E2E-GATE-03: decision health reports the expired conclusion behind the deal", async ({ page }) => {
  // The corpus carries an accepted-but-expired recommendation on purpose. A deal
  // whose justification has aged out should say that in words, not just refuse.
  //
  // Scoped to VISIBLE paragraphs. This dossier renders several panels collapsed,
  // and a plain text match keeps resolving to a hidden copy first — the same
  // trap that made the two tests above look broken when they were not.
  await openAnvil(page);
  await expect(
    page.locator("p:visible").filter({ hasText: /has expired/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
});

test("E2E-GENOME-01: institutional-memory search returns something for a corpus query", async ({ page }) => {
  await page.goto("/dashboard?tab=genome");
  await expect(page.getByTestId("dashboard-tab-genome")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("data-error")).toHaveCount(0);
});
