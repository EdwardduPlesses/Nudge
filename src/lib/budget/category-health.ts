import type { BudgetState } from "./types";
import { categorySpendThisMonth } from "./selectors";

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
  reference: Date,
): CategoryHealthRow[] {
  return state.categories.map((cat) => {
    const spend = categorySpendThisMonth(cat.id, state.transactions, reference);
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
