import type { BudgetState } from "./types";

export const defaultBudgetState = (): BudgetState => ({
  workbookId: "",
  periodAnchorDay: 1,
  baseCurrency: "USD",
  members: [],
  period: { id: "", startDate: "", endDate: "", label: null },
  editable: true,
  memberIncomes: [],
  // Intentionally empty. This state is only ever used as an in-memory fallback when the
  // Supabase load fails — a new account must never see seeded/demo categories or data.
  categories: [],
  transactions: [],
  goals: [],
});
