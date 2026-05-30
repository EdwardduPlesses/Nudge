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
import type { BudgetState, Goal, Period, Transaction } from "@/lib/budget/types";

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
  // B2 — periods list, selection, and anchor-day control
  periods: Period[];
  selectedPeriodId: string | null;
  currentPeriodId: string | null;
  periodAnchorDay: number;
  loadPeriods: () => Promise<void>;
  setPeriodAnchorDay: (day: number) => Promise<void>;
  /** Set when an optimistic change was rolled back after a failed save; null when clear. */
  syncError: string | null;
  clearSyncError: () => void;
  /** Re-fetch authoritative budget state for the period in view (e.g. after a server-side mutation). */
  refresh: () => Promise<void>;
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

  // B2 — periods list, selection, and anchor-day
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(
    props.remote.snapshot.period.id,
  );
  const [currentPeriodId, setCurrentPeriodId] = useState<string | null>(
    props.remote.snapshot.period.id,
  );
  const [periodAnchorDay, setPeriodAnchorDayState] = useState<number>(
    props.remote.snapshot.periodAnchorDay,
  );
  // Surfaced to the UI when an optimistic change had to be rolled back after a failed save.
  const [syncError, setSyncError] = useState<string | null>(null);

  // Read the freshest state inside callbacks without re-creating them (avoids stale closures
  // around `period.id` / `editable` / the selected period).
  const stateRef = useRef(state);
  const selectedPeriodIdRef = useRef(selectedPeriodId);
  const currentPeriodIdRef = useRef(currentPeriodId);
  useEffect(() => {
    stateRef.current = state;
    selectedPeriodIdRef.current = selectedPeriodId;
    currentPeriodIdRef.current = currentPeriodId;
  });

  // A failed network request should surface like a failed save (not an unhandled rejection),
  // so the wrappers turn a thrown fetch into a non-ok Response that flows through `warnOnFail`.
  const networkFailure = () => new Response(null, { status: 503 });
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
      ).catch(networkFailure),
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
      ).catch(networkFailure),
    [props.whopUserToken],
  );
  const del = useCallback(
    (url: string) =>
      fetch(
        url,
        nudgeBudgetFetchInit(props.whopUserToken, { method: "DELETE", credentials: "include" }),
      ).catch(networkFailure),
    [props.whopUserToken],
  );

  // Re-fetch authoritative state for the period currently in view. Used to roll back an
  // optimistic change the server rejected, so local state can't silently drift from the DB.
  const resync = useCallback(async () => {
    const pid = selectedPeriodIdRef.current;
    const url = pid
      ? `/api/budget-state?periodId=${encodeURIComponent(pid)}`
      : "/api/budget-state";
    try {
      const res = await fetch(
        url,
        nudgeBudgetFetchInit(props.whopUserToken, { credentials: "include" }),
      );
      if (res.ok) {
        const { state: next } = (await res.json()) as { state: BudgetState };
        setState(next);
      }
    } catch (err) {
      console.error("[Nudge] resync failed", err);
    }
  }, [props.whopUserToken]);

  // On a failed save, roll the optimistic edit back to server truth and tell the user.
  const warnOnFail = useCallback(
    (label: string) => (r: Response) => {
      if (!r.ok) {
        console.error(`[Nudge] ${label} failed`, r.status);
        setSyncError("That change couldn't be saved — restoring the latest data.");
        void resync();
      }
    },
    [resync],
  );

  const clearSyncError = useCallback(() => setSyncError(null), []);

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
        // B2 — keep selectedPeriodId in sync with the resolved period
        setSelectedPeriodId(next.period.id);
      }
    },
    [props.whopUserToken],
  );

  // B2 — load periods list from /api/periods
  const loadPeriods = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/periods",
        nudgeBudgetFetchInit(props.whopUserToken, { credentials: "include" }),
      );
      if (res.ok) {
        const data = (await res.json()) as {
          periods: Period[];
          currentPeriodId: string;
          periodAnchorDay: number;
        };
        setPeriods(data.periods);
        // Keep the default selection pinned to the current period. Only move it along if the
        // user hasn't deliberately navigated to a past period (i.e. they were on "current").
        const prevCurrent = currentPeriodIdRef.current;
        const prevSelected = selectedPeriodIdRef.current;
        if (prevSelected === null || prevSelected === prevCurrent) {
          setSelectedPeriodId(data.currentPeriodId);
        }
        setCurrentPeriodId(data.currentPeriodId);
        setPeriodAnchorDayState(data.periodAnchorDay);
      }
    } catch (err) {
      console.error("[Nudge] loadPeriods failed", err);
    }
  }, [props.whopUserToken]);

  // B2 — update the budget-cycle anchor day then reload
  const setPeriodAnchorDay = useCallback(
    async (day: number) => {
      const res = await patch("/api/workbook", { periodAnchorDay: day });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; periodAnchorDay: number };
        setPeriodAnchorDayState(data.periodAnchorDay);
        await loadPeriods();
        await selectPeriod(null);
      }
    },
    [patch, loadPeriods, selectPeriod],
  );

  // B2 — populate periods list on mount
  useEffect(() => {
    // setState happens inside the async loadPeriods (not synchronously in the effect body)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPeriods();
  }, [loadPeriods]);

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
      // B2 — periods list, selection, and anchor-day
      periods,
      selectedPeriodId,
      currentPeriodId,
      periodAnchorDay,
      loadPeriods,
      setPeriodAnchorDay,
      syncError,
      clearSyncError,
      refresh: resync,
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
      periods,
      selectedPeriodId,
      currentPeriodId,
      periodAnchorDay,
      loadPeriods,
      setPeriodAnchorDay,
      syncError,
      clearSyncError,
      resync,
    ],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useNudgeBudget() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNudgeBudget must be used within NudgeBudgetProvider");
  return v;
}
