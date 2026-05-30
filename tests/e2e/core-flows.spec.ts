import { test, expect } from "@playwright/test";
import { resetTestUser } from "./helpers/db";
import { addCategory, addExpense } from "./helpers/ui";

test.beforeEach(async () => {
  await resetTestUser();
});

test("add a category, log an expense against it, and persist across reload", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();

  await addCategory(page, "Groceries", "500");

  // The new category card shows zero spend against the cap.
  await expect(page.getByText(/Spent .* of /).first()).toContainText("500");

  // Log an expense via the consolidated Add Transaction dialog (FAB).
  await addExpense(page, 42, "e2e-coffee");

  // Spend reflects the expense (optimistic update).
  await expect(page.getByText(/Spent .* of /).first()).toContainText("42");

  // Persists after a full reload (server round-trip succeeded).
  await page.reload();
  await page.getByRole("tab", { name: "Plan" }).first().click();
  await page.getByRole("tab", { name: "Budgets" }).first().click();
  await expect(page.getByText(/Spent .* of /).first()).toContainText("42");
});
