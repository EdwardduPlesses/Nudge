import { expect, test } from "vitest";
import { transactionsInPeriod, categorySpendInPeriod } from "./selectors";
import { periodDayCounts, computeMonthlySpendingVelocity } from "./velocity";
import { computeMonthlyRemaining } from "./monthly-remaining";
import { computeCategoryHealthRows } from "./category-health";
import type { BudgetState, Transaction } from "./types";

// Period 2026-05-25..2026-06-24 (anchor day 25) — straddles two calendar months.
const PERIOD = { id: "p", startDate: "2026-05-25", endDate: "2026-06-24", label: "May 2026" };
const TODAY = new Date("2026-06-02T12:00:00Z");

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-05-26",
    amount: 100,
    type: "expense",
    categoryId: "food",
    goalId: null,
    debtId: null,
    note: "",
    createdBy: null,
    periodId: "p",
    ...over,
  };
}

test("transactionsInPeriod keeps late-May rows that belong to a 25th-anchor period", () => {
  const txs = [
    tx({ date: "2026-05-26" }), // in period
    tx({ date: "2026-06-10" }), // in period
    tx({ date: "2026-05-24" }), // before period start
    tx({ date: "2026-06-25" }), // after period end
  ];
  const kept = transactionsInPeriod(txs, PERIOD);
  expect(kept.map((t) => t.date).sort()).toEqual(["2026-05-26", "2026-06-10"]);
});

test("categorySpendInPeriod sums a category's expenses across the whole period", () => {
  const txs = [
    tx({ categoryId: "food", amount: 40, date: "2026-05-26" }), // late May, still this period
    tx({ categoryId: "food", amount: 60, date: "2026-06-10" }),
    tx({ categoryId: "rent", amount: 999, date: "2026-06-10" }),
    tx({ categoryId: "food", amount: 5, type: "income", date: "2026-06-10" }), // income ignored
    tx({ categoryId: "food", amount: 7, goalId: "g1", date: "2026-06-10" }), // goal allocation ignored
  ];
  expect(categorySpendInPeriod("food", txs)).toBe(100);
});

test("periodDayCounts derive from the period, not the calendar month", () => {
  const d = periodDayCounts(PERIOD, TODAY);
  expect(d.totalDays).toBe(31); // 2026-05-25..2026-06-24 inclusive
  expect(d.daysPassed).toBe(9); // 05-25..06-02 inclusive
  expect(d.remainingInclusiveDays).toBe(23); // 06-02..06-24 inclusive
});

test("velocity uses period day counts and the full period's expenses", () => {
  const txs = [
    tx({ amount: 90, date: "2026-05-26" }), // late May — was dropped by the calendar-month bug
    tx({ amount: 90, date: "2026-06-01" }),
  ];
  const v = computeMonthlySpendingVelocity(txs, [{ id: "food", name: "Food", budgetLimit: 600, color: "#000", createdBy: null }], PERIOD, TODAY);
  expect(v.totalSpent).toBe(180); // both counted, including late-May
  expect(v.daysPassed).toBe(9);
  expect(v.totalDaysInMonth).toBe(31); // total period days
  expect(Math.round(v.dailyRate)).toBe(20); // 180/9
  expect(Math.round(v.forecast)).toBe(620); // 20 * 31
});

function state(over: Partial<BudgetState>): BudgetState {
  return {
    workbookId: "w", periodAnchorDay: 25, baseCurrency: "USD", members: [],
    period: PERIOD, editable: true,
    memberIncomes: [{ whopUserId: "u", plannedAmount: 2000 }],
    categories: [{ id: "food", name: "Food", budgetLimit: 300, color: "#000", createdBy: null }],
    transactions: [], goals: [],
    ...over,
  };
}

test("computeMonthlyRemaining counts late-May expenses that belong to the period", () => {
  const snap = computeMonthlyRemaining(
    state({ transactions: [tx({ amount: 500, date: "2026-05-26" })] }),
  );
  expect(snap.currentMonthExpensesUsd).toBe(500);
  expect(snap.availableThisMonthUsd).toBe(1500); // 2000 income - 500
});

test("computeCategoryHealthRows counts the full period spend (not just the calendar month)", () => {
  const rows = computeCategoryHealthRows(
    state({ transactions: [tx({ categoryId: "food", amount: 150, date: "2026-05-26" })] }),
  );
  const food = rows.find((r) => r.categoryId === "food")!;
  expect(food.currentMonthCategorySpendUsd).toBe(150);
  expect(food.percentUsed).toBe(50); // 150 / 300
});
