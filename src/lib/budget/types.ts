export interface Member {
  whopUserId: string;
  role: "owner" | "member";
  displayName: string | null;
  color: string | null;
}

export interface Period {
  id: string;
  startDate: string;
  endDate: string;
  label: string | null;
}

export interface MemberIncome {
  whopUserId: string;
  plannedAmount: number;
}

export interface Category {
  id: string;
  name: string;
  /** Monthly spending limit (USD) */
  budgetLimit: number;
  color: string;
  /** Whop user id of who created it; null for legacy/pre-attribution rows. */
  createdBy: string | null;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  categoryId: string | null;
  /** When set: expense increases goal balance (transfer to savings); income decreases it (withdrawal). */
  goalId: string | null;
  /** When set: an expense linked to a debt counts as a payment toward that debt's balance. */
  debtId: string | null;
  note: string;
  /** Whop user id of who created it; null for legacy/pre-attribution rows. */
  createdBy: string | null;
  /** Period this transaction belongs to (assigned by date). */
  periodId: string | null;
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
  /** Whop user id of who created it; null for legacy/pre-attribution rows. */
  createdBy: string | null;
}

export interface BudgetState {
  workbookId: string;
  periodAnchorDay: number;
  members: Member[];
  /** The period this snapshot represents (current or a selected past period). */
  period: Period;
  /** Whether this period is editable (current period) or read-only (past). */
  editable: boolean;
  memberIncomes: MemberIncome[];
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
}
