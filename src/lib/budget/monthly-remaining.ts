import type { BudgetState } from "./types";
import { sumExpenses, sumIncome, totalPlannedIncome, transactionsInPeriod } from "./selectors";

export type MonthlyRemainingSnapshot = {
  /** True when planned income is missing or zero—user should set a monthly income. */
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
  state: Pick<BudgetState, "memberIncomes" | "transactions" | "period">,
): MonthlyRemainingSnapshot {
  const planned = totalPlannedIncome(state);
  const monthlyIncome = Number.isFinite(planned) ? Math.max(0, planned) : 0;
  const periodTx = transactionsInPeriod(state.transactions, state.period);
  const currentMonthIncome = sumIncome(periodTx);
  const currentMonthExpenses = sumExpenses(periodTx);
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
