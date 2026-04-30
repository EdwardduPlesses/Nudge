import { differenceInCalendarDays, endOfMonth } from "date-fns";
import type { Category, Transaction } from "./types";
import { transactionsThisMonth } from "./selectors";

export type SpendingVelocityStatus = "ON_TRACK" | "WARNING" | "OVERSPENDING";

export type SpendingVelocityInsightIntent =
  | { kind: "on_track"; messageKey: "on_track" }
  | { kind: "exceed_by"; overAmountUsd: number; messageKey: "exceed" }
  | {
      kind: "reduce_daily";
      reductionUsd: number;
      messageKey: "reduce";
    };

export function getCurrentMonthTransactions(transactions: Transaction[]): Transaction[] {
  return transactionsThisMonth(transactions, new Date()).filter(
    (t) => t.type === "expense",
  );
}

export function calculateTotalSpent(transactions: Transaction[]): number {
  return transactions.reduce((s, t) => {
    const a = Number.isFinite(t.amount) ? t.amount : 0;
    return s + a;
  }, 0);
}

export function getDaysPassedInMonth(): number {
  return new Date().getDate();
}

export function getTotalDaysInMonth(): number {
  return endOfMonth(new Date()).getDate();
}

export function calculateDailySpendRate(totalSpent: number, daysPassed: number): number {
  if (!Number.isFinite(totalSpent) || daysPassed <= 0) return 0;
  return totalSpent / daysPassed;
}

export function forecastEndOfMonthSpend(
  dailyRate: number,
  totalDaysInMonth: number,
): number {
  if (!Number.isFinite(dailyRate) || !Number.isFinite(totalDaysInMonth)) return 0;
  return dailyRate * totalDaysInMonth;
}

export function calculateTotalBudget(categories: Category[]): number {
  return categories.reduce((s, cat) => {
    const lim = Number.isFinite(cat.budgetLimit) ? Math.max(0, cat.budgetLimit) : 0;
    return s + lim;
  }, 0);
}

export function calculateStatus(
  forecast: number,
  budget: number,
): SpendingVelocityStatus | undefined {
  if (budget <= 0 || !Number.isFinite(budget)) return undefined;
  const f = Number.isFinite(forecast) ? forecast : 0;
  if (f <= budget) return "ON_TRACK";
  if (f <= budget * 1.1) return "WARNING";
  return "OVERSPENDING";
}

/** Inclusive calendar days from today through end of month (local). */
export function inclusiveRemainingDaysInMonthFromToday(): number {
  const today = new Date();
  const end = endOfMonth(today);
  return differenceInCalendarDays(end, today) + 1;
}

export function buildSpendingVelocityInsight(args: {
  status: SpendingVelocityStatus | undefined;
  forecastUsd: number;
  budgetUsd: number;
  totalSpentUsd: number;
  dailyRateUsd: number;
  hasBudget: boolean;
  remainingInclusiveDays: number;
}): SpendingVelocityInsightIntent | null {
  const {
    status,
    forecastUsd,
    budgetUsd,
    totalSpentUsd,
    dailyRateUsd,
    hasBudget,
    remainingInclusiveDays,
  } = args;
  if (!hasBudget || status === undefined) return null;
  const budget = Number.isFinite(budgetUsd) ? budgetUsd : 0;
  const forecast = Number.isFinite(forecastUsd) ? forecastUsd : 0;
  const spent = Number.isFinite(totalSpentUsd) ? totalSpentUsd : 0;

  if (status === "ON_TRACK") {
    return { kind: "on_track", messageKey: "on_track" };
  }

  if (forecast > budget) {
    const overAmountUsd = Math.max(0, forecast - budget);

    let reductionIntent: SpendingVelocityInsightIntent | null = null;
    if (remainingInclusiveDays >= 1) {
      const remainingBudget = budget - spent;
      if (remainingBudget > 0) {
        const requiredAvg = remainingBudget / remainingInclusiveDays;
        const rate = Number.isFinite(dailyRateUsd) ? dailyRateUsd : 0;
        if (Number.isFinite(requiredAvg)) {
          const reductionUsd = Math.max(0, rate - requiredAvg);
          if (reductionUsd > 1e-6) {
            reductionIntent = {
              kind: "reduce_daily",
              reductionUsd,
              messageKey: "reduce",
            };
          }
        }
      }
    }

    if (reductionIntent) return reductionIntent;
    return {
      kind: "exceed_by",
      overAmountUsd,
      messageKey: "exceed",
    };
  }

  return { kind: "on_track", messageKey: "on_track" };
}

export interface MonthlySpendingVelocityResult {
  totalSpent: number;
  dailyRate: number;
  forecast: number;
  budget: number;
  status: SpendingVelocityStatus | undefined;
  daysPassed: number;
  totalDaysInMonth: number;
  hasExpenseData: boolean;
  hasBudget: boolean;
  remainingInclusiveDays: number;
  safeDailyUsd: number | null;
  dailyReductionUsd: number | null;
  insight: SpendingVelocityInsightIntent | null;
}

/** Single snapshot from current budgets + transactions (caller passes full state slices). */
export function computeMonthlySpendingVelocity(transactions: Transaction[], categories: Category[]): MonthlySpendingVelocityResult {
  const monthExpenseTx = getCurrentMonthTransactions(transactions);
  const totalSpent = calculateTotalSpent(monthExpenseTx);
  const hasExpenseData = monthExpenseTx.length > 0;
  const daysPassed = getDaysPassedInMonth();
  const totalDaysInMonth = getTotalDaysInMonth();
  const dailyRate = calculateDailySpendRate(totalSpent, daysPassed);
  const forecast = forecastEndOfMonthSpend(dailyRate, totalDaysInMonth);
  const budget = calculateTotalBudget(categories);
  const hasBudget = budget > 0;
  const status = hasBudget ? calculateStatus(forecast, budget) : undefined;
  const remainingInclusiveDays = inclusiveRemainingDaysInMonthFromToday();

  let safeDailyUsd: number | null = null;
  if (hasBudget && remainingInclusiveDays >= 1) {
    const remaining = budget - totalSpent;
    safeDailyUsd = remaining / remainingInclusiveDays;
    if (!Number.isFinite(safeDailyUsd)) safeDailyUsd = null;
  }

  const insight = buildSpendingVelocityInsight({
    status,
    forecastUsd: forecast,
    budgetUsd: budget,
    totalSpentUsd: totalSpent,
    dailyRateUsd: dailyRate,
    hasBudget,
    remainingInclusiveDays,
  });

  const dailyReductionUsd =
    insight?.kind === "reduce_daily" && Number.isFinite(insight.reductionUsd)
      ? insight.reductionUsd
      : null;

  return {
    totalSpent,
    dailyRate,
    forecast,
    budget,
    status,
    daysPassed,
    totalDaysInMonth,
    hasExpenseData,
    hasBudget,
    remainingInclusiveDays,
    safeDailyUsd,
    dailyReductionUsd,
    insight,
  };
}
