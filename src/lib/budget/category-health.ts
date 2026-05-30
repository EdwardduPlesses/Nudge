import type { BudgetState, Transaction } from "./types";

export type CategoryHealthStatus = "SAFE" | "WARNING" | "HIGH" | "OVER";

export interface CategoryHealthRow {
  categoryId: string;
  name: string;
  color: string;
  categoryLimitUsd: number;
  currentMonthCategorySpendUsd: number;
  /** `null` when no monthly limit is set (`budgetLimit <= 0`). */
  percentUsed: number | null;
  status: CategoryHealthStatus | null;
  insight: string;
}

export function statusFromPercentUsed(percentUsed: number): CategoryHealthStatus {
  if (percentUsed > 100) return "OVER";
  if (percentUsed > 90) return "HIGH";
  if (percentUsed > 70) return "WARNING";
  return "SAFE";
}

export function insightFromStatus(status: CategoryHealthStatus): string {
  switch (status) {
    case "SAFE":
      return "Healthy";
    case "WARNING":
      return "Watch this category";
    case "HIGH":
      return "Close to limit";
    case "OVER":
      return "Over budget";
  }
}

export function computeCategoryHealthRows(
  state: Pick<BudgetState, "categories" | "transactions">,
  transactionsOverride?: Transaction[],
): CategoryHealthRow[] {
  const transactions = transactionsOverride ?? state.transactions;
  // Single pass over the period-scoped transactions: category id → spend (excludes
  // income and goal allocations). Avoids re-scanning every transaction per category.
  const spendByCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense" || t.goalId != null) continue;
    const id = t.categoryId ?? "_none";
    spendByCategory.set(id, (spendByCategory.get(id) ?? 0) + t.amount);
  }
  return state.categories.map((cat) => {
    const spend = spendByCategory.get(cat.id) ?? 0;
    const limit = cat.budgetLimit;

    if (!(limit > 0)) {
      return {
        categoryId: cat.id,
        name: cat.name,
        color: cat.color,
        categoryLimitUsd: limit,
        currentMonthCategorySpendUsd: spend,
        percentUsed: null,
        status: null,
        insight: "No limit set",
      };
    }

    const percentUsed = (spend / limit) * 100;
    const status = statusFromPercentUsed(percentUsed);
    return {
      categoryId: cat.id,
      name: cat.name,
      color: cat.color,
      categoryLimitUsd: limit,
      currentMonthCategorySpendUsd: spend,
      percentUsed,
      status,
      insight: insightFromStatus(status),
    };
  });
}
