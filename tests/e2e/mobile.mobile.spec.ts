import { test, expect } from "@playwright/test";
import { resetTestUser } from "./helpers/db";

// Runs only under the `mobile` project (Pixel 7 viewport) via testMatch.
test.beforeAll(async () => {
  await resetTestUser();
});

test("mobile: app loads with the bottom nav, FAB, and is navigable", async ({ page }) => {
  await page.goto("/app");

  // The mobile masthead wordmark + bottom tab bar render.
  await expect(page.getByRole("heading", { name: "Nudge" })).toBeVisible();
  const bottomNav = page.getByRole("tablist", { name: "Sections" });
  await expect(bottomNav).toBeVisible();

  // Quick-add FAB is present and tappable (not covered).
  const fab = page.getByRole("button", { name: "Quick add expense" });
  await expect(fab).toBeVisible();
  await fab.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Bottom-nav navigation works.
  await bottomNav.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();

  // No horizontal overflow (content fits the viewport width).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
