import { test, expect } from "@playwright/test";
import { resetTestUser, listTransactionAmounts, getBaseCurrency } from "./helpers/db";

const SEED_AMOUNT = 100;

// Add a category and one $100 expense via the UI so there is money to (mis)convert.
async function seedOneExpense(page: import("@playwright/test").Page) {
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();
  await page.getByRole("tab", { name: "Plan" }).first().click();
  await page.getByRole("tab", { name: "Budgets" }).first().click();
  const addSection = page.locator("section").filter({ hasText: "Add category" });
  await addSection.getByPlaceholder("Subscriptions").fill("Misc");
  await addSection.getByRole("button", { name: "Add category" }).click();

  await page.getByRole("button", { name: "Quick add expense" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton").fill(String(SEED_AMOUNT));
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/transactions") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save expense" }).click();
  await saved;
}

test.beforeEach(async () => {
  await resetTestUser();
});

test("concurrent currency changes never double-convert stored amounts", async ({ page }) => {
  await seedOneExpense(page);
  expect(await getBaseCurrency()).toBe("USD");

  // Fire two identical USD→ZAR conversions concurrently (simulates a double-tap, a retry,
  // or two shared-workbook members). Pre-fix, each multiplied every amount (~rate² ≈ 35×
  // the seed). The compare-and-swap claim must let the multiply run at most once.
  const body = { data: { baseCurrency: "ZAR" } };
  const [r1, r2] = await Promise.all([
    page.request.patch("/api/workbook", body),
    page.request.patch("/api/workbook", body),
  ]);

  // Both requests succeed (one converts, one is a no-op) OR both 503 if live rates are
  // down (we refuse to convert on stale fallback rates — see the stale guard).
  expect([200, 503]).toContain(r1.status());
  expect([200, 503]).toContain(r2.status());

  const amounts = await listTransactionAmounts();
  expect(amounts.length).toBe(1);
  const amount = amounts[0];

  // A single USD→ZAR conversion lands ≈ 100 × ~18 ≈ 1800; no conversion stays 100.
  // A double conversion would be ≈ 100 × 18² ≈ 35000. Anything below 10000 proves the
  // multiply ran at most once.
  expect(amount).toBeLessThan(10_000);

  // And if a conversion did run, the currency must reflect it.
  if (amount > SEED_AMOUNT * 2) {
    expect(await getBaseCurrency()).toBe("ZAR");
  }
});
