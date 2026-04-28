import { defaultBudgetState } from "./defaults";
import type { BudgetState } from "./types";

const VERSION = 1;

type Persisted = { v: number; data: BudgetState };

export function storageKey(experienceId: string, userId: string): string {
  return `nudge:budget:v${VERSION}:${experienceId}:${userId}`;
}

export function loadBudgetState(key: string): BudgetState {
  if (typeof window === "undefined") return defaultBudgetState();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return defaultBudgetState();
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed?.v !== VERSION || !parsed.data) return defaultBudgetState();
    return mergeWithDefaults(parsed.data);
  } catch {
    return defaultBudgetState();
  }
}

export function saveBudgetState(key: string, state: BudgetState): void {
  if (typeof window === "undefined") return;
  const payload: Persisted = { v: VERSION, data: state };
  window.localStorage.setItem(key, JSON.stringify(payload));
}

function mergeWithDefaults(data: BudgetState): BudgetState {
  const base = defaultBudgetState();
  return {
    incomePlan: typeof data.incomePlan === "number" ? data.incomePlan : base.incomePlan,
    categories:
      Array.isArray(data.categories) && data.categories.length > 0
        ? data.categories
        : base.categories,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    goals: Array.isArray(data.goals) ? data.goals : [],
  };
}
