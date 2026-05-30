import { expect, test } from "vitest";
import { safeToSpendToday, totalCategoryBudget } from "./selectors";
import type { BudgetState } from "./types";

function baseState(over: Partial<BudgetState>): BudgetState {
  return {
    workbookId: "w", periodAnchorDay: 1, baseCurrency: "USD", members: [],
    period: { id: "p", startDate: "2026-05-01", endDate: "2026-05-31", label: null },
    editable: true,
    memberIncomes: [{ whopUserId: "u", plannedAmount: 3100 }],
    categories: [], transactions: [], goals: [],
    ...over,
  };
}

test("safeToSpendToday: (income - expenses) / inclusive days remaining", () => {
  // income 3100, no expenses, viewing on May 1 → 31 days inclusive → 100/day
  const r = safeToSpendToday(baseState({}), new Date("2026-05-01T12:00:00Z"));
  expect(r).not.toBeNull();
  expect(Math.round(r!.discretionaryRemainingUsd)).toBe(3100);
  expect(r!.daysRemaining).toBe(31);
  expect(Math.round(r!.perDayUsd)).toBe(100);
});

test("safeToSpendToday subtracts only expense transactions, floors at 0", () => {
  const s = baseState({
    transactions: [
      { id: "1", date: "2026-05-02", amount: 3100, type: "expense", categoryId: null, goalId: null, debtId: null, note: "", createdBy: null, periodId: "p" },
      { id: "2", date: "2026-05-02", amount: 500, type: "income", categoryId: null, goalId: null, debtId: null, note: "", createdBy: null, periodId: "p" },
    ],
  });
  const r = safeToSpendToday(s, new Date("2026-05-16T12:00:00Z"));
  expect(r!.discretionaryRemainingUsd).toBe(0);
  expect(r!.perDayUsd).toBe(0);
});

test("safeToSpendToday returns null for a past (non-editable) period", () => {
  expect(safeToSpendToday(baseState({ editable: false }), new Date("2026-05-10T12:00:00Z"))).toBeNull();
});

test("safeToSpendToday returns null when no income is planned", () => {
  expect(safeToSpendToday(baseState({ memberIncomes: [] }), new Date("2026-05-10T12:00:00Z"))).toBeNull();
});

test("totalCategoryBudget sums category caps", () => {
  expect(
    totalCategoryBudget([
      { budgetLimit: 200 },
      { budgetLimit: 50.5 },
      { budgetLimit: 0 },
    ]),
  ).toBe(250.5);
});

test("totalCategoryBudget ignores non-finite caps and returns 0 for empty", () => {
  expect(totalCategoryBudget([])).toBe(0);
  expect(totalCategoryBudget([{ budgetLimit: Number.NaN }, { budgetLimit: 100 }])).toBe(100);
  expect(totalCategoryBudget([{ budgetLimit: Infinity }])).toBe(0);
});
