import { test, expect } from "@playwright/test";
import { resetTestUser, seedDebt, debtPaymentTotal } from "./helpers/db";

test.beforeEach(async () => {
  await resetTestUser();
});

test("log a debt payment through the Add Transaction dialog", async ({ page }) => {
  // Load once to create the workbook, then seed a debt and reload so the dialog sees it.
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();
  const debtId = await seedDebt("Car loan", 1000);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();

  // Open the consolidated dialog and choose Debt payment.
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByText("Debt payment").click();
  // The debt select defaults to the only debt; just enter the amount.
  await dialog.getByLabel("Amount").fill("150");

  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/transactions") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await saved;
  await expect(dialog).toBeHidden();

  // The payment is recorded against the debt (reduces its remaining balance).
  expect(await debtPaymentTotal(debtId)).toBe(150);
});
