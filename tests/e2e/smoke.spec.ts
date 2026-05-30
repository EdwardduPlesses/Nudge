import { test, expect } from "@playwright/test";
import { resetTestUser } from "./helpers/db";

test.beforeAll(async () => {
  await resetTestUser();
});

test("app loads with the dashboard and primary nav", async ({ page }) => {
  await page.goto("/app");

  // Brand mark + dev-preview chip confirm we're authenticated as the test user.
  await expect(page.getByRole("link", { name: "Nudge — home" })).toBeVisible();
  // The chip renders in both the mobile masthead and desktop strip (one hidden per
  // viewport via CSS); asserting presence confirms we're the dev-preview test user.
  await expect(page.getByText("Dev preview").first()).toBeAttached();

  // Primary section tabs render.
  for (const name of ["Overview", "Activity", "Plan", "Money goals", "Insights"]) {
    await expect(page.getByRole("tab", { name }).first()).toBeVisible();
  }

  // No error boundary.
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
});

test("can navigate between primary sections", async ({ page }) => {
  await page.goto("/app");

  await page.getByRole("tab", { name: "Plan" }).first().click();
  await expect(page.getByRole("tab", { name: "Budgets" }).first()).toBeVisible();

  await page.getByRole("tab", { name: "Money goals" }).first().click();
  await expect(page.getByRole("tab", { name: "Goals" }).first()).toBeVisible();

  await page.getByRole("tab", { name: "Insights" }).first().click();
  await page.getByRole("tab", { name: "Activity" }).first().click();
  await page.getByRole("tab", { name: "Overview" }).first().click();
});
