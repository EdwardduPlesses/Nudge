import { test, expect } from "@playwright/test";
import { resetTestUser, listPeriodStarts, setAnchorDay } from "./helpers/db";

const CURRENT_YEAR = new Date().getFullYear();

/** Max year among the test user's period start dates (0 if none). */
async function maxPeriodYear(): Promise<number> {
  const starts = await listPeriodStarts();
  return starts.reduce((max, s) => Math.max(max, Number(s.slice(0, 4))), 0);
}

test.describe("anchor-day budget cycle", () => {
  test.beforeEach(async () => {
    await resetTestUser();
  });

  test("changing the anchor day via Settings keeps the current period in the present", async ({
    page,
  }) => {
    await page.goto("/app");
    // Initial load creates the current period on the default (day 1) grid.
    await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();
    expect(await maxPeriodYear()).toBeLessThanOrEqual(CURRENT_YEAR);

    // Open Settings and change the budget cycle start day.
    await page.getByRole("button", { name: "Settings" }).first().click();
    const cycle = page.getByRole("combobox", { name: "Budget cycle start day" });
    await expect(cycle).toBeVisible();

    // The change triggers PATCH /api/workbook then a GET /api/periods rollover. Await the
    // rollover so we assert after it settles. The buggy version overshoots (~240 inserts)
    // and this response never arrives in time → RED; the fix makes it fast → GREEN.
    const rollover = page.waitForResponse(
      (r) => r.url().includes("/api/periods") && r.request().method() === "GET",
      { timeout: 20_000 },
    );
    await cycle.click();
    await page.getByRole("option", { name: "Day 15" }).click();
    await rollover;

    // The period selector must still show the current year — NOT a far-future year.
    const period = page.getByRole("combobox", { name: "Budget period" });
    await expect(period).toContainText(String(CURRENT_YEAR));

    // Authoritative check: no period was created beyond next year (the overshoot bug
    // created ~240 future periods, pushing "current" ~20 years out).
    expect(await maxPeriodYear()).toBeLessThanOrEqual(CURRENT_YEAR + 1);
  });

  test("does not compound across reloads after an anchor change", async ({ page }) => {
    // Arrange a workbook + current period, then shift the anchor directly in the DB
    // so the next /api/periods call exercises the rollover path on a shifted grid.
    await page.goto("/app");
    await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();
    await setAnchorDay(15);

    // Each reload calls ensureCurrentPeriod. The buggy version pushed the latest period
    // ~20 years further out on every load; the fix must be idempotent.
    for (let i = 0; i < 3; i++) {
      await page.goto("/app");
      await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();
    }
    expect(await maxPeriodYear()).toBeLessThanOrEqual(CURRENT_YEAR + 1);

    const period = page.getByRole("combobox", { name: "Budget period" });
    await expect(period).toContainText(String(CURRENT_YEAR));
  });
});
