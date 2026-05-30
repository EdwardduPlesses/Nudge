import { test, expect } from "@playwright/test";
import {
  resetTestUser,
  getTransactionPeriodStart,
  listPeriodRows,
} from "./helpers/db";

// Default anchor day is 1, so periods are calendar months. "Today" is server-UTC.
const CURRENT_MONTH_START = `${new Date().toISOString().slice(0, 7)}-01`;

test.beforeEach(async () => {
  await resetTestUser();
});

test("a back-dated transaction is filed under the period its date belongs to", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();

  // POST a transaction dated in a prior month directly to the API.
  const res = await page.request.post("/api/transactions", {
    data: { amount: 50, type: "expense", date: "2026-03-15", note: "e2e-backdated" },
  });
  expect(res.ok()).toBeTruthy();

  // It must land in the March 2026 period, NOT the current period.
  const periodStart = await getTransactionPeriodStart("e2e-backdated");
  expect(periodStart).toBe("2026-03-01");
  expect(periodStart).not.toBe(CURRENT_MONTH_START);
});

test("editing a closed period's planned income is rejected (409)", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();

  // Materialize a past (closed) period by back-dating a transaction into it.
  await page.request.post("/api/transactions", {
    data: { amount: 10, type: "expense", date: "2026-03-15", note: "e2e-seed-march" },
  });

  const periods = await listPeriodRows();
  const current = periods.find((p) => p.startDate === CURRENT_MONTH_START);
  const past = periods.find((p) => p.startDate === "2026-03-01");
  expect(current, "current period exists").toBeTruthy();
  expect(past, "past period was materialized").toBeTruthy();

  // Writing income to the CLOSED period must be refused.
  const closed = await page.request.patch("/api/period-incomes", {
    data: { periodId: past!.id, whopUserId: "dev_local_user", plannedAmount: 999 },
  });
  expect(closed.status()).toBe(409);

  // Writing income to the CURRENT period still works.
  const ok = await page.request.patch("/api/period-incomes", {
    data: { periodId: current!.id, whopUserId: "dev_local_user", plannedAmount: 999 },
  });
  expect(ok.ok()).toBeTruthy();
});

test("an invalid transaction date falls back to today's period instead of being stored verbatim", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(page.getByRole("combobox", { name: "Budget period" })).toBeVisible();

  const res = await page.request.post("/api/transactions", {
    data: { amount: 5, type: "expense", date: "banana", note: "e2e-garbage-date" },
  });
  expect(res.ok()).toBeTruthy();
  // Garbage date → filed under the current period (not a row with a nonsense date/period).
  expect(await getTransactionPeriodStart("e2e-garbage-date")).toBe(CURRENT_MONTH_START);
});
