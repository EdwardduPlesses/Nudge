import type { BudgetState } from "./types";
import { sumExpenses, sumIncome, transactionsThisMonth } from "./selectors";

export type MonthlyRemainingSnapshot = {
  /** True when `incomePlan` is missing or zero—user should set a monthly income. */
  needsIncomePlan: boolean;
  monthlyIncomeUsd: number;
  currentMonthIncomeUsd: number;
  currentMonthExpensesUsd: number;
  availableThisMonthUsd: number;
  /** Share of comparable income still available; null when there is no income basis. */
  remainingPercent: number | null;
  isOverBudget: boolean;
};

/**
 * Monthly “room” after spending, using planned income vs logged income whichever is larger.
 *
 * availableThisMonth = max(monthlyIncome, currentMonthIncome) - currentMonthExpenses
 */
export function computeMonthlyRemaining(
  state: Pick<BudgetState, "incomePlan" | "transactions">,
  reference: Date = new Date(),
): MonthlyRemainingSnapshot {
  const monthlyIncome = Number.isFinite(state.incomePlan) ? Math.max(0, state.incomePlan) : 0;
  const monthTx = transactionsThisMonth(state.transactions, reference);
  const currentMonthIncome = sumIncome(monthTx);
  const currentMonthExpenses = sumExpenses(monthTx);
  const comparableIncome = Math.max(monthlyIncome, currentMonthIncome);
  const availableThisMonth = comparableIncome - currentMonthExpenses;

  const needsIncomePlan = monthlyIncome <= 0;

  const remainingPercent =
    comparableIncome > 0 ? (availableThisMonth / comparableIncome) * 100 : null;

  return {
    needsIncomePlan,
    monthlyIncomeUsd: monthlyIncome,
    currentMonthIncomeUsd: currentMonthIncome,
    currentMonthExpensesUsd: currentMonthExpenses,
    availableThisMonthUsd: availableThisMonth,
    remainingPercent,
    isOverBudget: availableThisMonth < 0,
  };
}
