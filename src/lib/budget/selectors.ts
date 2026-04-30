import { endOfMonth, format, parseISO, startOfMonth, subDays } from "date-fns";
import type { Category, Goal, Transaction } from "./types";

/**
 * Calendar day from a stored transaction date. Entries use `yyyy-MM-dd` or
 * `yyyy-MM-ddT12:00:00.000Z` from the picker — compare this string to local month bounds instead
 * of `isWithinInterval(parseISO(...))`, which can shift the instant into the previous local day.
 */
export function transactionCalendarDayKey(dateStr: string): string | null {
  const t = dateStr.trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m?.[1]) return m[1];
  const parsed = parseISO(t);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "yyyy-MM-dd");
}

export function transactionsThisMonth(
  transactions: Transaction[],
  reference: Date,
): Transaction[] {
  const startKey = format(startOfMonth(reference), "yyyy-MM-dd");
  const endKey = format(endOfMonth(reference), "yyyy-MM-dd");
  return transactions.filter((t) => {
    const key = transactionCalendarDayKey(t.date);
    if (key == null) return false;
    return key >= startKey && key <= endKey;
  });
}

export function sumIncome(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
}

export function sumExpenses(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
}

/** Expenses linked to a savings goal are allocations, not category consumption. */
const GOAL_EXPENSE_SLICE_KEY = "_goal_allocation";

export function spendingByCategory(
  transactions: Transaction[],
  categories: Category[],
): { name: string; value: number; color: string }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const id = t.goalId != null ? GOAL_EXPENSE_SLICE_KEY : t.categoryId ?? "_none";
    map.set(id, (map.get(id) ?? 0) + t.amount);
  }
  const catById = new Map(categories.map((c) => [c.id, c]));
  return [...map.entries()]
    .map(([id, value]) => {
      if (id === GOAL_EXPENSE_SLICE_KEY) {
        return {
          name: "Savings goals",
          value,
          color: "#ca8a04",
        };
      }
      const cat = catById.get(id);
      return {
        name: cat?.name ?? "Uncategorized",
        value,
        color: cat?.color ?? "#64748b",
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function dailySpendingLastWeek(transactions: Transaction[]): {
  day: string;
  total: number;
}[] {
  const today = new Date();
  const days: { day: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = subDays(today, i);
    const label = format(d, "EEE");
    const dayKey = format(d, "yyyy-MM-dd");
    const total = transactions
      .filter((t) => {
        if (t.type !== "expense") return false;
        const tk = transactionCalendarDayKey(t.date);
        return tk === dayKey;
      })
      .reduce((s, t) => s + t.amount, 0);
    days.push({ day: label, total });
  }
  return days;
}

export function categorySpendThisMonth(
  categoryId: string,
  transactions: Transaction[],
  reference: Date,
): number {
  const monthTx = transactionsThisMonth(transactions, reference);
  return monthTx
    .filter(
      (t) =>
        t.type === "expense" &&
        t.goalId == null &&
        (t.categoryId ?? "_none") === categoryId,
    )
    .reduce((s, t) => s + t.amount, 0);
}

/** Net USD moved into a goal via transactions (expenses add, income withdrawals subtract). */
export function goalAllocationNetUsd(goalId: string, transactions: Transaction[]): number {
  let n = 0;
  for (const t of transactions) {
    if (t.goalId !== goalId) continue;
    if (t.type === "expense") n += t.amount;
    else n -= t.amount;
  }
  return n;
}

/** Displayed saved balance: baseline plus net from goal-linked activity. */
export function goalDisplaySaved(goal: Goal, transactions: Transaction[]): number {
  const base = Number.isFinite(goal.savedAmount) ? Math.max(0, goal.savedAmount) : 0;
  return Math.max(0, base + goalAllocationNetUsd(goal.id, transactions));
}

export function goalProgressRatio(goal: Goal, transactions: Transaction[]): number {
  if (goal.targetAmount <= 0 || !Number.isFinite(goal.targetAmount)) return 0;
  return Math.min(1, goalDisplaySaved(goal, transactions) / goal.targetAmount);
}

export function totalGoalsTargetUsd(goals: Goal[]): number {
  return goals.reduce(
    (s, g) => s + (Number.isFinite(g.targetAmount) ? Math.max(0, g.targetAmount) : 0),
    0,
  );
}

export function totalGoalsSavedUsd(goals: Goal[], transactions: Transaction[]): number {
  return goals.reduce((s, g) => s + goalDisplaySaved(g, transactions), 0);
}

export function overallSavingsProgress(goals: Goal[], transactions: Transaction[]): number {
  const t = totalGoalsTargetUsd(goals);
  if (t <= 0) return 0;
  return Math.min(1, totalGoalsSavedUsd(goals, transactions) / t);
}
