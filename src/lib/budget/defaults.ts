import type { BudgetState } from "./types";

export const defaultBudgetState = (): BudgetState => ({
  incomePlan: 3500,
  categories: [
    { id: "housing", name: "Housing", budgetLimit: 1400, color: "#6366f1" },
    { id: "food", name: "Food & groceries", budgetLimit: 600, color: "#22c55e" },
    { id: "transport", name: "Transport", budgetLimit: 350, color: "#f59e0b" },
    { id: "fun", name: "Fun & dining", budgetLimit: 250, color: "#ec4899" },
    { id: "health", name: "Health", budgetLimit: 200, color: "#14b8a6" },
    { id: "other", name: "Other", budgetLimit: 200, color: "#94a3b8" },
  ],
  transactions: [],
  goals: [],
});
