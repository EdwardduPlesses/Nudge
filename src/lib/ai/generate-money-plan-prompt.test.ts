import { describe, expect, test } from "vitest";
import { generateMoneyPlanPrompt } from "./generate-money-plan-prompt";
import type { BudgetState, Transaction } from "../budget/types";
import type { DebtInput } from "../budget/debt";

// Period 2026-05-25..2026-06-24 (anchor day 25) — straddles two calendar months,
// and its label ("May 2026") is derived from the START month only.
const PERIOD = { id: "p", startDate: "2026-05-25", endDate: "2026-06-24", label: "May 2026" };
const NOW = new Date("2026-06-02T12:00:00Z");

// A display-currency-style formatter (no FX); mirrors how the app injects formatAmount.
const fm = (amount: number) => `R${amount.toFixed(2)}`;

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

function state(over: Partial<BudgetState> = {}): BudgetState {
  return {
    workbookId: "w",
    periodAnchorDay: 25,
    baseCurrency: "ZAR",
    members: [],
    period: PERIOD,
    editable: true,
    memberIncomes: [{ whopUserId: "u", plannedAmount: 2000 }],
    categories: [
      { id: "food", name: "Food", budgetLimit: 300, color: "#000", createdBy: null },
      { id: "rent", name: "Rent", budgetLimit: 900, color: "#111", createdBy: null },
    ],
    transactions: [tx({ categoryId: "food", amount: 150, date: "2026-05-26" })],
    goals: [],
    ...over,
  };
}

const DEBTS: DebtInput[] = [{ id: "d1", name: "Visa", balance: 1000, apr: 19.9, minPayment: 100 }];

describe("generateMoneyPlanPrompt — period framing", () => {
  test("emits real period bounds and day counts, never 'calendar month'", () => {
    const p = generateMoneyPlanPrompt(state(), fm, { now: NOW, currencyCode: "ZAR" });
    expect(p).toContain("2026-05-25");
    expect(p).toContain("2026-06-24");
    expect(p).toMatch(/budget period/i);
    // The data must not be mislabeled as a calendar month / month-to-date.
    expect(p).not.toMatch(/this calendar month/i);
    expect(p).not.toMatch(/reference calendar month/i);
    expect(p).not.toMatch(/month-to-date/i);
    // periodDayCounts(PERIOD, NOW) => total 31, passed 9, remaining 23
    expect(p).toContain("23");
  });
});

describe("generateMoneyPlanPrompt — currency", () => {
  test("states the display currency explicitly", () => {
    const p = generateMoneyPlanPrompt(state(), fm, { now: NOW, currencyCode: "ZAR" });
    expect(p).toMatch(/amounts.*ZAR/i);
    expect(p).not.toMatch(/canonical USD/i);
  });
});

describe("generateMoneyPlanPrompt — NaN safety", () => {
  test("non-finite figures render a sentinel, never NaN or a fake 0", () => {
    const s = state({
      categories: [{ id: "x", name: "Broken", budgetLimit: Number.NaN, color: "#000", createdBy: null }],
      memberIncomes: [{ whopUserId: "u", plannedAmount: Number.NaN }],
    });
    const p = generateMoneyPlanPrompt(s, fm, { now: NOW, currencyCode: "ZAR" });
    expect(p).not.toMatch(/NaN/);
    expect(p).toMatch(/\(missing\)/);
  });
});

describe("generateMoneyPlanPrompt — transaction truncation honesty", () => {
  test("states how many of how many rows are shown", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      tx({ amount: 10 + i, date: "2026-06-01", note: `t${i}` }),
    );
    const p = generateMoneyPlanPrompt(state({ transactions: many }), fm, { now: NOW, currencyCode: "ZAR" });
    expect(p).toMatch(/showing 20 of 25/i);
  });
});

describe("generateMoneyPlanPrompt — debts", () => {
  test("includes a debt section with remaining, APR, payoff order and a debt-free projection", () => {
    const payment = tx({ amount: 100, date: "2026-05-26", debtId: "d1", categoryId: null });
    const p = generateMoneyPlanPrompt(state({ transactions: [payment] }), fm, {
      now: NOW,
      currencyCode: "ZAR",
      debts: DEBTS,
    });
    expect(p).toMatch(/debt/i);
    expect(p).toContain("Visa");
    expect(p).toMatch(/19\.9/);
    expect(p).toMatch(/R900\.00/); // 1000 balance - 100 paid
    expect(p).toMatch(/debt-free/i);
  });

  test("tags debt-linked transactions so they are not read as discretionary spend", () => {
    const payment = tx({ amount: 100, date: "2026-05-26", debtId: "d1", categoryId: null });
    const p = generateMoneyPlanPrompt(state({ transactions: [payment] }), fm, {
      now: NOW,
      currencyCode: "ZAR",
      debts: DEBTS,
    });
    expect(p).toMatch(/debt payment/i);
  });
});

describe("generateMoneyPlanPrompt — precomputed signals", () => {
  test("injects forecast, status and a per-day safe-to-spend instead of asking the model to compute them", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      tx({ categoryId: "food", amount: 80, date: "2026-05-26", note: `f${i}` }),
    );
    const p = generateMoneyPlanPrompt(state({ transactions: many }), fm, { now: NOW, currencyCode: "ZAR" });
    expect(p).toMatch(/forecast/i);
    expect(p).toMatch(/on track|warning|overspending/i);
    expect(p).toMatch(/per day|\/day|safe to spend/i);
  });

  test("supplies per-category percent-used and status so the model does not recompute", () => {
    const p = generateMoneyPlanPrompt(state(), fm, { now: NOW, currencyCode: "ZAR" });
    // Food: 150/300 = 50% used
    expect(p).toMatch(/50%/);
  });
});

describe("generateMoneyPlanPrompt — goal deadline math", () => {
  test("derives required monthly contribution toward a dated goal", () => {
    const s = state({
      goals: [
        {
          id: "g",
          name: "Emergency fund",
          targetAmount: 1200,
          savedAmount: 200,
          deadline: "2026-12-31",
          createdBy: null,
        },
      ],
    });
    const p = generateMoneyPlanPrompt(s, fm, { now: NOW, currencyCode: "ZAR" });
    expect(p).toContain("Emergency fund");
    expect(p).toMatch(/per month|\/month/i);
  });
});

describe("generateMoneyPlanPrompt — graceful with thin data", () => {
  test("does not throw on an empty workbook", () => {
    const empty = state({ categories: [], transactions: [], goals: [], memberIncomes: [] });
    expect(() => generateMoneyPlanPrompt(empty, fm, { now: NOW, currencyCode: "ZAR" })).not.toThrow();
  });
});
