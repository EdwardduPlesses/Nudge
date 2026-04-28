"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { BudgetState, Goal, Transaction } from "@/lib/budget/types";
import type { Category } from "@/lib/budget/types";
import { defaultBudgetState } from "@/lib/budget/defaults";
import { loadBudgetState, saveBudgetState, storageKey } from "@/lib/budget/storage";

type NudgeBudgetContextValue = {
  state: BudgetState;
  storageKey: string;
  setIncomePlan: (n: number) => void;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  removeTransaction: (id: string) => void;
  updateCategoryBudget: (categoryId: string, budgetLimit: number) => void;
  renameCategory: (categoryId: string, name: string) => void;
  addCategory: (name: string, budgetLimit: number) => void;
  addGoal: (g: Omit<Goal, "id">) => void;
  updateGoalSaved: (id: string, savedAmount: number) => void;
  removeGoal: (id: string) => void;
  resetDemo: () => void;
};

const Ctx = createContext<NudgeBudgetContextValue | null>(null);

export function NudgeBudgetProvider(props: {
  experienceId: string;
  userId: string;
  children: ReactNode;
}) {
  const key = useMemo(
    () => storageKey(props.experienceId, props.userId),
    [props.experienceId, props.userId],
  );
  const [state, setState] = useState<BudgetState>(defaultBudgetState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setState(loadBudgetState(key));
      setHydrated(true);
    });
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    saveBudgetState(key, state);
  }, [hydrated, key, state]);

  const setIncomePlan = useCallback((n: number) => {
    setState((s) => ({ ...s, incomePlan: Math.max(0, n) }));
  }, []);

  const addTransaction = useCallback((t: Omit<Transaction, "id">) => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tx_${Date.now()}`;
    setState((s) => ({
      ...s,
      transactions: [{ ...t, id }, ...s.transactions],
    }));
  }, []);

  const removeTransaction = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      transactions: s.transactions.filter((t) => t.id !== id),
    }));
  }, []);

  const updateCategoryBudget = useCallback((categoryId: string, budgetLimit: number) => {
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) =>
        c.id === categoryId ? { ...c, budgetLimit: Math.max(0, budgetLimit) } : c,
      ),
    }));
  }, []);

  const renameCategory = useCallback((categoryId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) =>
        c.id === categoryId ? { ...c, name: trimmed } : c,
      ),
    }));
  }, []);

  const addCategory = useCallback((name: string, budgetLimit: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const palette = ["#8b5cf6", "#0ea5e9", "#f97316", "#ef4444", "#84cc16"];
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `cat_${Date.now()}`;
    setState((s) => ({
      ...s,
      categories: [
        ...s.categories,
        {
          id,
          name: trimmed,
          budgetLimit: Math.max(0, budgetLimit),
          color: palette[s.categories.length % palette.length] ?? "#94a3b8",
        },
      ],
    }));
  }, []);

  const addGoal = useCallback((g: Omit<Goal, "id">) => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `goal_${Date.now()}`;
    setState((s) => ({
      ...s,
      goals: [...s.goals, { ...g, id }],
    }));
  }, []);

  const updateGoalSaved = useCallback((id: string, savedAmount: number) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) =>
        g.id === id ? { ...g, savedAmount: Math.max(0, savedAmount) } : g,
      ),
    }));
  }, []);

  const removeGoal = useCallback((id: string) => {
    setState((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) }));
  }, []);

  const resetDemo = useCallback(() => {
    const fresh = defaultBudgetState();
    setState({
      ...fresh,
      transactions: seedDemoTransactions(fresh.categories),
      goals: [
        {
          id: "g_emergency",
          name: "Emergency fund",
          targetAmount: 5000,
          savedAmount: 1200,
          deadline: null,
        },
      ],
    });
  }, []);

  const value = useMemo<NudgeBudgetContextValue>(
    () => ({
      state,
      storageKey: key,
      setIncomePlan,
      addTransaction,
      removeTransaction,
      updateCategoryBudget,
      renameCategory,
      addCategory,
      addGoal,
      updateGoalSaved,
      removeGoal,
      resetDemo,
    }),
    [
      state,
      key,
      setIncomePlan,
      addTransaction,
      removeTransaction,
      updateCategoryBudget,
      renameCategory,
      addCategory,
      addGoal,
      updateGoalSaved,
      removeGoal,
      resetDemo,
    ],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useNudgeBudget() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNudgeBudget must be used within NudgeBudgetProvider");
  return v;
}

function seedDemoTransactions(categories: Category[]): Transaction[] {
  const food = categories.find((c) => c.id === "food")?.id ?? categories[0]?.id ?? null;
  const transport = categories.find((c) => c.id === "transport")?.id ?? null;
  const fun = categories.find((c) => c.id === "fun")?.id ?? null;
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [
    {
      id: "demo1",
      date: iso(today),
      amount: 42.5,
      type: "expense",
      categoryId: food,
      note: "Groceries",
    },
    {
      id: "demo2",
      date: iso(today),
      amount: 18,
      type: "expense",
      categoryId: transport,
      note: "Transit",
    },
    {
      id: "demo3",
      date: iso(today),
      amount: 3200,
      type: "income",
      categoryId: null,
      note: "Paycheck",
    },
    {
      id: "demo4",
      date: iso(new Date(today.getTime() - 86400000 * 2)),
      amount: 64,
      type: "expense",
      categoryId: fun,
      note: "Dinner out",
    },
  ];
}
