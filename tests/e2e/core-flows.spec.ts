import { test, expect } from "@playwright/test";
import { resetTestUser } from "./helpers/db";

test.beforeEach(async () => {
  await resetTestUser();
});

test("add a category, log an expense against it, and persist across reload", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();

  // Plan → Budgets.
  await page.getByRole("tab", { name: "Plan" }).first().click();
  await page.getByRole("tab", { name: "Budgets" }).first().click();

  // Add a category with a monthly cap.
  const addSection = page.locator("section").filter({ hasText: "Add category" });
  await addSection.getByPlaceholder("Subscriptions").fill("Groceries");
  await addSection.getByRole("spinbutton").fill("500");
  await addSection.getByRole("button", { name: "Add category" }).click();

  // The new category card shows zero spend against the cap.
  const spendLine = page.getByText(/Spent .* of /).first();
  await expect(spendLine).toContainText("500");

  // Log an expense via the floating quick-add button.
  await page.getByRole("button", { name: "Quick add expense" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("spinbutton").fill("42");
  await dialog.getByPlaceholder("e.g. coffee").fill("e2e-coffee");
  // Wait for the persistence POST so the reload below can't abort an in-flight save.
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/transactions") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save expense" }).click();
  await expect(dialog).toBeHidden();
  await saved;

  // Spend reflects the expense (optimistic update).
  await expect(page.getByText(/Spent .* of /).first()).toContainText("42");

  // Persists after a full reload (server round-trip succeeded).
  await page.reload();
  await page.getByRole("tab", { name: "Plan" }).first().click();
  await page.getByRole("tab", { name: "Budgets" }).first().click();
  await expect(page.getByText(/Spent .* of /).first()).toContainText("42");
});

test("rejects an invalid expense amount", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();

  // Need a category first so the Save button is enabled.
  await page.getByRole("tab", { name: "Plan" }).first().click();
  await page.getByRole("tab", { name: "Budgets" }).first().click();
  const addSection = page.locator("section").filter({ hasText: "Add category" });
  await addSection.getByPlaceholder("Subscriptions").fill("Misc");
  await addSection.getByRole("button", { name: "Add category" }).click();

  await page.getByRole("button", { name: "Quick add expense" }).click();
  const dialog = page.getByRole("dialog");
  // Empty amount → inline validation error, dialog stays open.
  await dialog.getByRole("button", { name: "Save expense" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/enter an amount/i)).toBeVisible();
});
