import {
  endOfMonth,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  subDays,
} from "date-fns";
import type { Category, Transaction } from "./types";

export function monthWindow(reference: Date) {
  return { start: startOfMonth(reference), end: endOfMonth(reference) };
}

export function transactionsThisMonth(
  transactions: Transaction[],
  reference: Date,
): Transaction[] {
  const { start, end } = monthWindow(reference);
  return transactions.filter((t) =>
    isWithinInterval(parseISO(t.date), { start, end }),
  );
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

export function spendingByCategory(
  transactions: Transaction[],
  categories: Category[],
): { name: string; value: number; color: string }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const id = t.categoryId ?? "_none";
    map.set(id, (map.get(id) ?? 0) + t.amount);
  }
  const catById = new Map(categories.map((c) => [c.id, c]));
  return [...map.entries()]
    .map(([id, value]) => {
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
    const total = transactions
      .filter((t) => {
        if (t.type !== "expense") return false;
        const td = parseISO(t.date);
        return format(td, "yyyy-MM-dd") === format(d, "yyyy-MM-dd");
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
    .filter((t) => t.type === "expense" && (t.categoryId ?? "_none") === categoryId)
    .reduce((s, t) => s + t.amount, 0);
}
