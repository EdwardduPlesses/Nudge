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
  note: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string | null;
}

export interface BudgetState {
  incomePlan: number;
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
}
