export interface Category {
  id: string;
  name: string;
  /** Monthly spending limit (USD) */
  budgetLimit: number;
  color: string;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  categoryId: string | null;
  /** When set: expense increases goal balance (transfer to savings); income decreases it (withdrawal). */
  goalId: string | null;
  note: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  /**
   * Opening / legacy baseline in USD only. Progress from activity is added on top via
   * goal-linked transactions (see `goalDisplaySaved`).
   */
  savedAmount: number;
  deadline: string | null;
}

export interface BudgetState {
  incomePlan: number;
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
}
