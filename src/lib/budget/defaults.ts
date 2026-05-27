import type { BudgetState } from "./types";

export const defaultBudgetState = (): BudgetState => ({
  workbookId: "",
  periodAnchorDay: 1,
  members: [],
  period: { id: "", startDate: "", endDate: "", label: null },
  editable: true,
  memberIncomes: [],
  categories: [
    { id: "housing", name: "Housing", budgetLimit: 1400, color: "#6366f1", createdBy: null },
    { id: "food", name: "Food & groceries", budgetLimit: 600, color: "#22c55e", createdBy: null },
    { id: "transport", name: "Transport", budgetLimit: 350, color: "#f59e0b", createdBy: null },
    { id: "fun", name: "Fun & dining", budgetLimit: 250, color: "#ec4899", createdBy: null },
    { id: "health", name: "Health", budgetLimit: 200, color: "#14b8a6", createdBy: null },
    { id: "other", name: "Other", budgetLimit: 200, color: "#94a3b8", createdBy: null },
  ],
  transactions: [],
  goals: [],
});
