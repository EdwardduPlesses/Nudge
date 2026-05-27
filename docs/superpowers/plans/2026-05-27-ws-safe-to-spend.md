# Workstream F — Safe-to-Spend Today

> Implement task-by-task with TDD for the selector. Depends on merged Foundation + A–E.

**Goal:** Show a period-aware, income-based "safe to spend today" figure: `(planned income − expenses so far this period) ÷ days remaining in the current period`. Recurring items and goal contributions are already materialized as expense transactions in the period, so subtracting all period expenses naturally accounts for them. Replace the existing budget-based month figure in the dashboard hero aside with this.

**Branch:** `feat/safe-to-spend` (off `main`).

**Facts:**
- `BudgetState` has `period: {id, startDate, endDate, label}`, `editable: boolean`, `memberIncomes`, `transactions` (already scoped to the loaded period).
- `totalPlannedIncome(state)` in `@/lib/budget/selectors`.
- `OverviewHero` (`src/components/nudge/dashboard/overview-hero.tsx`) currently renders a "Safe to spend today" aside from `computeMonthlySpendingVelocity(...).safeDailyUsd` (budget-based, month-based). Replace the NUMBER source for that aside; leave the velocity insight line untouched.
- date-fns is available (`parseISO`, `differenceInCalendarDays`).

---

## Task F1: Period-aware safe-to-spend selector + wire-in

**Files:** Modify `src/lib/budget/selectors.ts`, create `src/lib/budget/selectors.test.ts` (or append if it exists), modify `src/components/nudge/dashboard/overview-hero.tsx`.

- [ ] **Step 1 — failing test** (`src/lib/budget/selectors.test.ts`):
```ts
import { expect, test } from "vitest";
import { safeToSpendToday } from "./selectors";
import type { BudgetState } from "./types";

function baseState(over: Partial<BudgetState>): BudgetState {
  return {
    workbookId: "w", periodAnchorDay: 1, members: [],
    period: { id: "p", startDate: "2026-05-01", endDate: "2026-05-31", label: null },
    editable: true,
    memberIncomes: [{ whopUserId: "u", plannedAmount: 3100 }],
    categories: [], transactions: [], goals: [],
    ...over,
  };
}

test("safeToSpendToday: (income - expenses) / inclusive days remaining", () => {
  // income 3100, no expenses, viewing on May 1 → 31 days inclusive → 100/day
  const r = safeToSpendToday(baseState({}), new Date("2026-05-01T12:00:00Z"));
  expect(r).not.toBeNull();
  expect(Math.round(r!.discretionaryRemainingUsd)).toBe(3100);
  expect(r!.daysRemaining).toBe(31);
  expect(Math.round(r!.perDayUsd)).toBe(100);
});

test("safeToSpendToday subtracts only expense transactions, floors at 0", () => {
  const s = baseState({
    transactions: [
      { id: "1", date: "2026-05-02", amount: 3100, type: "expense", categoryId: null, goalId: null, debtId: null, note: "", createdBy: null, periodId: "p" },
      { id: "2", date: "2026-05-02", amount: 500, type: "income", categoryId: null, goalId: null, debtId: null, note: "", createdBy: null, periodId: "p" },
    ],
  });
  const r = safeToSpendToday(s, new Date("2026-05-16T12:00:00Z"));
  expect(r!.discretionaryRemainingUsd).toBe(0);
  expect(r!.perDayUsd).toBe(0);
});

test("safeToSpendToday returns null for a past (non-editable) period", () => {
  expect(safeToSpendToday(baseState({ editable: false }), new Date("2026-05-10T12:00:00Z"))).toBeNull();
});

test("safeToSpendToday returns null when no income is planned", () => {
  expect(safeToSpendToday(baseState({ memberIncomes: [] }), new Date("2026-05-10T12:00:00Z"))).toBeNull();
});
```
- [ ] **Step 2 — run, confirm FAIL.**
- [ ] **Step 3 — implement in `src/lib/budget/selectors.ts`** (append; reuse the existing `totalPlannedIncome`):
```ts
import { differenceInCalendarDays, parseISO } from "date-fns";
// (keep existing imports; add date-fns import if not present)

export interface SafeToSpendResult {
  perDayUsd: number;
  daysRemaining: number;
  discretionaryRemainingUsd: number;
}

/**
 * Income-based daily safe-to-spend for the CURRENT period:
 *   (planned income − expenses logged so far this period) ÷ inclusive days left.
 * Recurring items & goal contributions are already expense transactions in the period,
 * so they are captured by the expense sum. Returns null when not applicable (past period,
 * no income, or the reference date is past the period end).
 */
export function safeToSpendToday(
  state: Pick<BudgetState, "editable" | "period" | "memberIncomes" | "transactions">,
  today: Date,
): SafeToSpendResult | null {
  if (!state.editable) return null;
  const income = totalPlannedIncome(state);
  if (income <= 0) return null;
  const end = parseISO(state.period.endDate);
  const daysRemaining = differenceInCalendarDays(end, today) + 1;
  if (!Number.isFinite(daysRemaining) || daysRemaining < 1) return null;
  const expenses = state.transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + (Number.isFinite(t.amount) ? t.amount : 0), 0);
  const discretionaryRemainingUsd = Math.max(0, income - expenses);
  return {
    perDayUsd: discretionaryRemainingUsd / daysRemaining,
    daysRemaining,
    discretionaryRemainingUsd,
  };
}
```
- [ ] **Step 4 — run tests, confirm 4 passed.**
- [ ] **Step 5 — wire into `overview-hero.tsx`**: compute `const safe = useMemo(() => safeToSpendToday(state, new Date()), [state]);` (import `safeToSpendToday`). Change the "Safe to spend today" aside so it renders when `safe != null && safe.perDayUsd > 0` and shows `formatFromUsd(safe.perDayUsd)`; keep the existing label/copy and the existing aside markup/styling. Update the small description to "You can spend this much per day for the rest of this period." Remove the dependence of THAT ASIDE on `v.safeDailyUsd` (the velocity result `v` and its insight line stay for the rest of the hero — do not remove them). Keep everything else intact.
- [ ] **Step 6 — verify** `npm run test` (4 new + existing green), `npx tsc --noEmit`, `npm run build`, `npm run lint` (≤ 13). **Commit:** `feat(dashboard): period-aware income-based safe-to-spend`.

---

## Task F2: Validate & merge
- [ ] `npm run test`, `npx tsc --noEmit`, `npm run build`, `npm run lint` (≤ 13). No migration.
- [ ] **merge:** `git checkout main && git merge --no-ff feat/safe-to-spend && git push origin main`.

## Self-review (F)
- Safe-to-spend = (income − period expenses) ÷ days left, period-aware, recurring/goal-inclusive (via expense sum) → `safeToSpendToday` (unit-tested). ✓
- Surfaced in the dashboard hero aside, current period only. ✓
