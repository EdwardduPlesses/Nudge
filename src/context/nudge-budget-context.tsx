"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { defaultBudgetState } from "@/lib/budget/defaults";
import type { BudgetState, Goal, Transaction } from "@/lib/budget/types";

type NudgeBudgetContextValue = {
  state: BudgetState;
  setIncomePlan: (n: number) => void;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  removeTransaction: (id: string) => void;
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  updateCategoryBudget: (categoryId: string, budgetLimit: number) => void;
  renameCategory: (categoryId: string, name: string) => void;
  addCategory: (name: string, budgetLimit: number) => void;
  addGoal: (g: Omit<Goal, "id">) => void;
  updateGoal: (
    id: string,
    patch: Partial<Pick<Goal, "name" | "targetAmount" | "deadline">>,
  ) => void;
  removeGoal: (id: string) => void;
};

const Ctx = createContext<NudgeBudgetContextValue | null>(null);

const WHOP_USER_TOKEN_HEADER = "x-whop-user-token";

function nudgeBudgetFetchInit(token: string | null | undefined, init?: RequestInit): RequestInit {
  const nextHeaders = new Headers(init?.headers);
  if (token) nextHeaders.set(WHOP_USER_TOKEN_HEADER, token.trim());
  return { ...init, headers: nextHeaders };
}

export function NudgeBudgetProvider(props: {
  experienceId: string;
  userId: string;
  /**
   * Incoming `x-whop-user-token` from the document request. Browser `fetch` must send this so
   * `/api/budget-state` verifies the same user as RSC (Whop does not add it automatically).
   */
  whopUserToken?: string | null;
  /** Loaded on the server from Supabase (`null` when no workbook exists yet). */
  remote: { snapshot: BudgetState | null };
  children: ReactNode;
}) {
  const [state, setState] = useState<BudgetState>(() =>
    props.remote.snapshot != null ? props.remote.snapshot : defaultBudgetState(),
  );
  const [hydrated, setHydrated] = useState(false);
  const skipNextRemotePut = useRef(props.remote.snapshot != null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextRemotePut.current) {
      skipNextRemotePut.current = false;
      return;
    }
    const t = setTimeout(() => {
      const q = new URLSearchParams({ experienceId: props.experienceId });
      void fetch(
        `/api/budget-state?${q}`,
        nudgeBudgetFetchInit(props.whopUserToken, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        }),
      ).then((res) => {
        if (!res.ok) console.error("[Nudge] budget sync failed", res.status);
      });
    }, 650);
    return () => clearTimeout(t);
  }, [hydrated, props.experienceId, props.whopUserToken, state]);

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

  const updateTransaction = useCallback((id: string, patch: Partial<Omit<Transaction, "id">>) => {
    setState((s) => ({
      ...s,
      transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
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

  const updateGoal = useCallback(
    (id: string, patch: Partial<Pick<Goal, "name" | "targetAmount" | "deadline">>) => {
      setState((s) => ({
        ...s,
        goals: s.goals.map((g) => {
          if (g.id !== id) return g;
          const next = { ...g };
          if (typeof patch.name === "string") {
            const trimmed = patch.name.trim();
            if (trimmed) next.name = trimmed;
          }
          if (typeof patch.targetAmount === "number" && Number.isFinite(patch.targetAmount)) {
            next.targetAmount = Math.max(0, patch.targetAmount);
          }
          if (patch.deadline !== undefined) next.deadline = patch.deadline;
          return next;
        }),
      }));
    },
    [],
  );

  const removeGoal = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      goals: s.goals.filter((g) => g.id !== id),
      transactions: s.transactions.map((t) =>
        t.goalId === id ? { ...t, goalId: null } : t,
      ),
    }));
  }, []);

  const value = useMemo<NudgeBudgetContextValue>(
    () => ({
      state,
      setIncomePlan,
      addTransaction,
      removeTransaction,
      updateTransaction,
      updateCategoryBudget,
      renameCategory,
      addCategory,
      addGoal,
      updateGoal,
      removeGoal,
    }),
    [
      state,
      setIncomePlan,
      addTransaction,
      removeTransaction,
      updateTransaction,
      updateCategoryBudget,
      renameCategory,
      addCategory,
      addGoal,
      updateGoal,
      removeGoal,
    ],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useNudgeBudget() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNudgeBudget must be used within NudgeBudgetProvider");
  return v;
}
