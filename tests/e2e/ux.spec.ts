import { test, expect } from "@playwright/test";
import { resetTestUser } from "./helpers/db";

test.beforeEach(async () => {
  await resetTestUser();
});

async function seedExpense(page: import("@playwright/test").Page, note: string) {
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();
  await page.getByRole("tab", { name: "Plan" }).first().click();
  await page.getByRole("tab", { name: "Budgets" }).first().click();
  const addSection = page.locator("section").filter({ hasText: "Add category" });
  await addSection.getByPlaceholder("Subscriptions").fill("Misc");
  await addSection.getByRole("button", { name: "Add category" }).click();

  await page.getByRole("button", { name: "Quick add expense" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton").fill("25");
  await dialog.getByPlaceholder("e.g. coffee").fill(note);
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/transactions") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save expense" }).click();
  await saved;
}

test("deleting a transaction asks for confirmation; Cancel keeps it, Confirm removes it", async ({
  page,
}) => {
  await seedExpense(page, "e2e-delete-me");
  await page.getByRole("tab", { name: "Activity" }).first().click();
  await expect(page.getByText("e2e-delete-me")).toBeVisible();

  // Remove → confirmation dialog appears.
  await page.getByRole("button", { name: "Remove" }).first().click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText("Remove transaction?")).toBeVisible();

  // Cancel keeps the transaction.
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText("e2e-delete-me")).toBeVisible();

  // Confirm actually deletes it.
  await page.getByRole("button", { name: "Remove" }).first().click();
  const confirm2 = page.getByRole("alertdialog");
  await expect(confirm2).toBeVisible();
  const del = page.waitForResponse(
    (r) => r.url().includes("/api/transactions") && r.request().method() === "DELETE",
  );
  await confirm2.getByRole("button", { name: "Remove" }).click();
  await del;
  await expect(page.getByText("e2e-delete-me")).toHaveCount(0);
});

test("Add transaction shows an inline error on an empty amount instead of silently doing nothing", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();

  // Open the full Add transaction dialog from the dashboard.
  await page.getByRole("button", { name: "Add income or expense" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Save with no amount → inline error, dialog stays open.
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/enter (an |a valid )?amount/i)).toBeVisible();
});
