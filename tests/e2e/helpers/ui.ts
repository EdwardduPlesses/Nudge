import { expect, type Page } from "@playwright/test";

/** Add a category with a monthly cap via the Budgets tab. */
export async function addCategory(page: Page, name: string, cap = "500") {
  await page.getByRole("tab", { name: "Plan" }).first().click();
  await page.getByRole("tab", { name: "Budgets" }).first().click();
  const addSection = page.locator("section").filter({ hasText: "Add category" });
  await addSection.getByPlaceholder("Subscriptions").fill(name);
  await addSection.getByRole("spinbutton").fill(cap);
  await addSection.getByRole("button", { name: "Add category" }).click();
}

/**
 * Add an expense through the consolidated Add Transaction dialog (opened via the FAB).
 * Requires at least one category to exist. Waits for the persistence POST.
 */
export async function addExpense(page: Page, amount: number, note?: string) {
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Amount").fill(String(amount));
  if (note) await dialog.getByLabel("Note").fill(note);
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/transactions") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await saved;
  await expect(dialog).toBeHidden();
}
