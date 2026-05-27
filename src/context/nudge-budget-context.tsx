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
import type { BudgetState, Goal, Transaction } from "@/lib/budget/types";

type NudgeBudgetContextValue = {
  state: BudgetState;
  currentUserId: string;
  whopUserToken: string | null;
  selectPeriod: (periodId: string | null) => Promise<void>;
  setMemberIncome: (whopUserId: string, amount: number) => void;
  addTransaction: (t: Omit<Transaction, "id" | "createdBy" | "periodId">) => void;
  removeTransaction: (id: string) => void;
  updateTransaction: (
    id: string,
    patch: Partial<Omit<Transaction, "id" | "createdBy" | "periodId">>,
  ) => void;
  updateCategoryBudget: (categoryId: string, budgetLimit: number) => void;
  renameCategory: (categoryId: string, name: string) => void;
  addCategory: (name: string, budgetLimit: number) => void;
  addGoal: (g: Omit<Goal, "id" | "createdBy">) => void;
  updateGoal: (
    id: string,
    patch: Partial<Pick<Goal, "name" | "targetAmount" | "deadline">>,
  ) => void;
  removeGoal: (id: string) => void;
};

const Ctx = createContext<NudgeBudgetContextValue | null>(null);

const WHOP_USER_TOKEN_HEADER = "x-whop-user-token";

export function nudgeBudgetFetchInit(token: string | null | undefined, init?: RequestInit): RequestInit {
  const nextHeaders = new Headers(init?.headers);
  if (token) nextHeaders.set(WHOP_USER_TOKEN_HEADER, token.trim());
  return { ...init, headers: nextHeaders };
}

function upsertIncome(list: BudgetState["memberIncomes"], whopUserId: string, amount: number) {
  const next = list.filter((i) => i.whopUserId !== whopUserId);
  next.push({ whopUserId, plannedAmount: Math.max(0, amount) });
  return next;
}

function newId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}`;
}

export function NudgeBudgetProvider(props: {
  experienceId: string;
  userId: string;
  /**
   * Incoming `x-whop-user-token` from the document request. Browser `fetch` must send this so
   * the per-item APIs verify the same user as RSC (Whop does not add it automatically).
   */
  whopUserToken?: string | null;
  /** Loaded on the server from Supabase. Always a real snapshot (never null). */
  remote: { snapshot: BudgetState };
  children: ReactNode;
}) {
  const [state, setState] = useState<BudgetState>(props.remote.snapshot);

  // Read the freshest state inside callbacks without re-creating them (avoids stale closures
  // around `period.id` / `editable`).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const post = useCallback(
    (url: string, body: unknown) =>
      fetch(
        url,
        nudgeBudgetFetchInit(props.whopUserToken, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    [props.whopUserToken],
  );
  const patch = useCallback(
    (url: string, body: unknown) =>
      fetch(
        url,
        nudgeBudgetFetchInit(props.whopUserToken, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    [props.whopUserToken],
  );
  const del = useCallback(
    (url: string) =>
      fetch(
        url,
        nudgeBudgetFetchInit(props.whopUserToken, { method: "DELETE", credentials: "include" }),
      ),
    [props.whopUserToken],
  );
  const warnOnFail = useCallback(
    (label: string) => (r: Response) => {
      if (!r.ok) console.error(`[Nudge] ${label} failed`, r.status);
    },
    [],
  );

  const selectPeriod = useCallback(
    async (periodId: string | null) => {
      const url = periodId
        ? `/api/budget-state?periodId=${encodeURIComponent(periodId)}`
        : "/api/budget-state";
      const res = await fetch(
        url,
        nudgeBudgetFetchInit(props.whopUserToken, { credentials: "include" }),
      );
      if (res.ok) {
        const { state: next } = (await res.json()) as { state: BudgetState };
        setState(next);
      }
    },
    [props.whopUserToken],
  );

  const setMemberIncome = useCallback(
    (whopUserId: string, amount: number) => {
      if (!stateRef.current.editable) return;
      const periodId = stateRef.current.period.id;
      const plannedAmount = Math.max(0, amount);
      setState((s) => ({ ...s, memberIncomes: upsertIncome(s.memberIncomes, whopUserId, amount) }));
      void patch("/api/period-incomes", { periodId, whopUserId, plannedAmount }).then(
        warnOnFail("set income"),
      );
    },
    [patch, warnOnFail],
  );

  const addTransaction = useCallback(
    (t: Omit<Transaction, "id" | "createdBy" | "periodId">) => {
      if (!stateRef.current.editable) return;
      const id = newId("tx");
      const periodId = stateRef.current.period.id;
      setState((s) => ({
        ...s,
        transactions: [{ ...t, id, createdBy: props.userId, periodId }, ...s.transactions],
      }));
      void post("/api/transactions", { id, ...t }).then(warnOnFail("add transaction"));
    },
    [post, warnOnFail, props.userId],
  );

  const removeTransaction = useCallback(
    (id: string) => {
      if (!stateRef.current.editable) return;
      setState((s) => ({
        ...s,
        transactions: s.transactions.filter((t) => t.id !== id),
      }));
      void del(`/api/transactions?id=${encodeURIComponent(id)}`).then(
        warnOnFail("remove transaction"),
      );
    },
    [del, warnOnFail],
  );

  const updateTransaction = useCallback(
    (id: string, patchBody: Partial<Omit<Transaction, "id" | "createdBy" | "periodId">>) => {
      if (!stateRef.current.editable) return;
      setState((s) => ({
        ...s,
        transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patchBody } : t)),
      }));
      void patch("/api/transactions", { id, ...patchBody }).then(warnOnFail("update transaction"));
    },
    [patch, warnOnFail],
  );

  const updateCategoryBudget = useCallback(
    (categoryId: string, budgetLimit: number) => {
      if (!stateRef.current.editable) return;
      const periodId = stateRef.current.period.id;
      const limit = Math.max(0, budgetLimit);
      setState((s) => ({
        ...s,
        categories: s.categories.map((c) =>
          c.id === categoryId ? { ...c, budgetLimit: limit } : c,
        ),
      }));
      void patch("/api/period-category-limits", {
        periodId,
        categoryId,
        budgetLimit: limit,
      }).then(warnOnFail("update category budget"));
    },
    [patch, warnOnFail],
  );

  const renameCategory = useCallback(
    (categoryId: string, name: string) => {
      if (!stateRef.current.editable) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      setState((s) => ({
        ...s,
        categories: s.categories.map((c) =>
          c.id === categoryId ? { ...c, name: trimmed } : c,
        ),
      }));
      void patch("/api/categories", { id: categoryId, name: trimmed }).then(
        warnOnFail("rename category"),
      );
    },
    [patch, warnOnFail],
  );

  const addCategory = useCallback(
    (name: string, budgetLimit: number) => {
      if (!stateRef.current.editable) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const palette = ["#8b5cf6", "#0ea5e9", "#f97316", "#ef4444", "#84cc16"];
      const id = newId("cat");
      const periodId = stateRef.current.period.id;
      const color = palette[stateRef.current.categories.length % palette.length] ?? "#94a3b8";
      const limit = Math.max(0, budgetLimit);
      setState((s) => ({
        ...s,
        categories: [
          ...s.categories,
          { id, name: trimmed, budgetLimit: limit, color, createdBy: props.userId },
        ],
      }));
      void post("/api/categories", { id, name: trimmed, color }).then(warnOnFail("add category"));
      void patch("/api/period-category-limits", {
        periodId,
        categoryId: id,
        budgetLimit: limit,
      }).then(warnOnFail("set category limit"));
    },
    [post, patch, warnOnFail, props.userId],
  );

  const addGoal = useCallback(
    (g: Omit<Goal, "id" | "createdBy">) => {
      if (!stateRef.current.editable) return;
      const id = newId("goal");
      setState((s) => ({
        ...s,
        goals: [...s.goals, { ...g, id, createdBy: props.userId }],
      }));
      void post("/api/goals", { id, ...g }).then(warnOnFail("add goal"));
    },
    [post, warnOnFail, props.userId],
  );

  const updateGoal = useCallback(
    (id: string, patchBody: Partial<Pick<Goal, "name" | "targetAmount" | "deadline">>) => {
      if (!stateRef.current.editable) return;
      setState((s) => ({
        ...s,
        goals: s.goals.map((g) => {
          if (g.id !== id) return g;
          const next = { ...g };
          if (typeof patchBody.name === "string") {
            const trimmed = patchBody.name.trim();
            if (trimmed) next.name = trimmed;
          }
          if (
            typeof patchBody.targetAmount === "number" &&
            Number.isFinite(patchBody.targetAmount)
          ) {
            next.targetAmount = Math.max(0, patchBody.targetAmount);
          }
          if (patchBody.deadline !== undefined) next.deadline = patchBody.deadline;
          return next;
        }),
      }));
      void patch("/api/goals", { id, ...patchBody }).then(warnOnFail("update goal"));
    },
    [patch, warnOnFail],
  );

  const removeGoal = useCallback(
    (id: string) => {
      if (!stateRef.current.editable) return;
      setState((s) => ({
        ...s,
        goals: s.goals.filter((g) => g.id !== id),
        transactions: s.transactions.map((t) =>
          t.goalId === id ? { ...t, goalId: null } : t,
        ),
      }));
      void del(`/api/goals?id=${encodeURIComponent(id)}`).then(warnOnFail("remove goal"));
    },
    [del, warnOnFail],
  );

  const value = useMemo<NudgeBudgetContextValue>(
    () => ({
      state,
      currentUserId: props.userId,
      whopUserToken: props.whopUserToken ?? null,
      selectPeriod,
      setMemberIncome,
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
      props.userId,
      props.whopUserToken,
      selectPeriod,
      setMemberIncome,
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
