import type { BudgetState, Category, Goal, Transaction } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseCategory(raw: unknown): Category | null {
  if (!isRecord(raw)) return null;
  const id = raw.id;
  const name = raw.name;
  const budgetLimit = raw.budgetLimit;
  const color = raw.color;
  if (typeof id !== "string" || typeof name !== "string" || typeof color !== "string") return null;
  if (typeof budgetLimit !== "number" || !Number.isFinite(budgetLimit)) return null;
  return { id, name, budgetLimit, color };
}

function parseTransaction(raw: unknown): Transaction | null {
  if (!isRecord(raw)) return null;
  const id = raw.id;
  const date = raw.date;
  const amount = raw.amount;
  const type = raw.type;
  const note = raw.note;
  const categoryId = raw.categoryId;
  const goalIdRaw = raw.goalId;
  const goalId =
    goalIdRaw === null || typeof goalIdRaw === "string" ? goalIdRaw : null;
  if (typeof id !== "string" || typeof date !== "string" || typeof note !== "string") return null;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (type !== "income" && type !== "expense") return null;
  if (categoryId !== null && typeof categoryId !== "string") return null;
  return {
    id,
    date,
    amount,
    type,
    categoryId,
    goalId,
    note,
  };
}

function parseGoal(raw: unknown): Goal | null {
  if (!isRecord(raw)) return null;
  const id = raw.id;
  const name = raw.name;
  const targetAmount = raw.targetAmount;
  const savedAmount = raw.savedAmount;
  const deadline = raw.deadline;
  if (typeof id !== "string" || typeof name !== "string") return null;
  if (typeof targetAmount !== "number" || !Number.isFinite(targetAmount)) return null;
  if (typeof savedAmount !== "number" || !Number.isFinite(savedAmount)) return null;
  if (deadline !== null && typeof deadline !== "string") return null;
  return {
    id,
    name,
    targetAmount,
    savedAmount,
    deadline,
  };
}

export function parseBudgetStateBody(raw: unknown): BudgetState | null {
  if (!isRecord(raw)) return null;
  const incomePlan = raw.incomePlan;
  const categories = raw.categories;
  const transactions = raw.transactions;
  const goals = raw.goals;
  if (typeof incomePlan !== "number" || !Number.isFinite(incomePlan) || incomePlan < 0) return null;
  if (!Array.isArray(categories) || !Array.isArray(transactions) || !Array.isArray(goals)) return null;
  const cats = categories.map(parseCategory).filter((c): c is Category => c !== null);
  const txs = transactions.map(parseTransaction).filter((t): t is Transaction => t !== null);
  const gs = goals.map(parseGoal).filter((g): g is Goal => g !== null);
  if (cats.length !== categories.length || txs.length !== transactions.length || gs.length !== goals.length) {
    return null;
  }
  return {
    incomePlan,
    categories: cats,
    transactions: txs,
    goals: gs,
  };
}
