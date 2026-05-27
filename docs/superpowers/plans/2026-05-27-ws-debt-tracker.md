# Workstream E — Debt Payoff Tracker

> Implement task-by-task with TDD for the payoff math. Depends on merged Foundation + A–D.

**Goal:** Track debts (balance, APR, minimum payment), log payments against them (transactions with `debt_id`), and show payoff guidance — snowball/avalanche ordering and a projected debt-free date — in a Debts tab.

**Branch:** `feat/debt-tracker` (off `main`).

**Foundation facts:**
- `nudge_debts(id text pk, workbook_id, name, balance, apr, min_payment, created_by, created_at)` exists.
- `nudge_transactions.debt_id text` exists; the transactions POST route already accepts `debtId` in its body.
- Tabs are defined in `src/components/nudge/nudge-tab-nav.tsx` (`TABS` array + `NudgeTabKey` union, consumed by `NudgeTopBar` desktop pill + `NudgeMobileTabBar`); the content switch is in `src/components/nudge/nudge-app.tsx`.
- `resolveMutationContext()`, `logActivity` (entity "debt"), `useNudgeBudget()` (has `state.transactions`, `addTransaction`, `currentUserId`, `whopUserToken`, `nudgeBudgetFetchInit`), `useCurrency()`.

---

## Task E1: Debt module (math + CRUD + route)

**Files:** Create `src/lib/budget/debt.ts`, `src/lib/budget/debt.test.ts`, `src/app/api/debts/route.ts`.

- [ ] **Step 1 — failing tests (`debt.test.ts`)** for the pure functions:
```ts
import { expect, test } from "vitest";
import { debtRemaining, payoffOrder, projectDebtFreeMonths, type DebtInput } from "./debt";

const d = (over: Partial<DebtInput>): DebtInput => ({ id: "x", name: "D", balance: 1000, apr: 0, minPayment: 100, ...over });

test("debtRemaining subtracts linked payments from balance, floored at 0", () => {
  const txs = [
    { amount: 200, type: "expense", debtId: "x" },
    { amount: 50, type: "expense", debtId: "y" },
  ];
  expect(debtRemaining(d({ id: "x", balance: 1000 }), txs)).toBe(800);
  expect(debtRemaining(d({ id: "x", balance: 100 }), [{ amount: 250, type: "expense", debtId: "x" }])).toBe(0);
});

test("payoffOrder: snowball ascending remaining, avalanche descending apr", () => {
  const a = d({ id: "a", balance: 500, apr: 10 });
  const b = d({ id: "b", balance: 200, apr: 25 });
  expect(payoffOrder([a, b], [], "snowball").map((x) => x.id)).toEqual(["b", "a"]);
  expect(payoffOrder([a, b], [], "avalanche").map((x) => x.id)).toEqual(["b", "a"]);
});

test("projectDebtFreeMonths: 0% APR, 1000 at 100/mo = 10 months", () => {
  expect(projectDebtFreeMonths([d({ balance: 1000, apr: 0, minPayment: 100 })], [], "snowball")).toBe(10);
});

test("projectDebtFreeMonths returns null when min payments never cover interest", () => {
  expect(projectDebtFreeMonths([d({ balance: 1000, apr: 100, minPayment: 1 })], [], "avalanche")).toBeNull();
});
```
- [ ] **Step 2 — run, confirm FAIL.**
- [ ] **Step 3 — implement `src/lib/budget/debt.ts`:**
```ts
export interface DebtInput {
  id: string;
  name: string;
  balance: number;
  apr: number; // annual %, e.g. 19.9
  minPayment: number;
}

type PaymentTx = { amount: number; type: string; debtId?: string | null };

/** Remaining balance = entered balance minus the sum of linked expense payments, floored at 0. */
export function debtRemaining(debt: DebtInput, transactions: PaymentTx[]): number {
  const paid = transactions
    .filter((t) => t.debtId === debt.id && t.type === "expense")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return Math.max(0, debt.balance - paid);
}

export type PayoffStrategy = "snowball" | "avalanche";

/** Order debts for payoff focus. snowball = smallest remaining first; avalanche = highest APR first. */
export function payoffOrder(
  debts: DebtInput[],
  transactions: PaymentTx[],
  strategy: PayoffStrategy,
): DebtInput[] {
  const withRemaining = debts.map((dbt) => ({ dbt, remaining: debtRemaining(dbt, transactions) }));
  withRemaining.sort((a, b) =>
    strategy === "snowball" ? a.remaining - b.remaining : b.dbt.apr - a.dbt.apr,
  );
  return withRemaining.map((x) => x.dbt);
}

/**
 * Simulate month-by-month payoff with the avalanche/snowball rollover: every debt gets its
 * min payment; any surplus from cleared debts rolls to the current focus debt. Returns the
 * number of months to clear all debts, or null if balances never decrease (min < interest).
 */
export function projectDebtFreeMonths(
  debts: DebtInput[],
  transactions: PaymentTx[],
  strategy: PayoffStrategy,
): number | null {
  let balances = debts.map((dbt) => ({ id: dbt.id, apr: dbt.apr, bal: debtRemaining(dbt, transactions), min: dbt.minPayment }));
  balances = balances.filter((b) => b.bal > 0);
  if (balances.length === 0) return 0;
  const totalMinPool = balances.reduce((s, b) => s + b.min, 0);

  for (let month = 1; month <= 600; month++) {
    // 1. accrue interest
    for (const b of balances) b.bal += b.bal * (b.apr / 100 / 12);
    // 2. budget for this month = sum of original min payments (rolls over as debts clear)
    let pool = totalMinPool;
    // 3. pay minimums (capped at balance)
    for (const b of balances) {
      const pay = Math.min(b.min, b.bal);
      b.bal -= pay;
      pool -= pay;
    }
    // 4. focus order for surplus
    const order = strategy === "snowball"
      ? [...balances].sort((a, b) => a.bal - b.bal)
      : [...balances].sort((a, b) => b.apr - a.apr);
    for (const b of order) {
      if (pool <= 0) break;
      const extra = Math.min(pool, b.bal);
      b.bal -= extra;
      pool -= extra;
    }
    balances = balances.filter((b) => b.bal > 0.005);
    if (balances.length === 0) return month;
  }
  return null; // did not converge within 50 years → min payments insufficient
}

export function addMonthsIso(baseIso: string, months: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
```
- [ ] **Step 4 — run tests, confirm 4 passed.** (Note: in the `projectDebtFreeMonths` 0%-APR test, the surplus rollover doesn't change the single-debt result — 1000 at 100/mo with min 100 and pool 100 = 10 months.)
- [ ] **Step 5 — `src/app/api/debts/route.ts`** — GET/POST/PATCH/DELETE following the `goals/route.ts` pattern. GET → `{debts: [...] }` (select id,name,balance,apr,min_payment,created_by from `nudge_debts` where workbook_id). POST `{name, balance, apr, minPayment}` → insert (id = crypto.randomUUID(), created_by=userId), `logActivity(... "debt" ... "added a debt")`. PATCH `{id, name?, balance?, apr?, minPayment?}` → update (map camel→snake). DELETE `?id=` → also null `debt_id` on linked transactions first (`update({debt_id:null}).eq("debt_id", id).eq("workbook_id", workbookId)`), then delete the debt. Scope every write with `.eq("workbook_id", workbookId)`.
- [ ] **Step 6 — verify** tests green, `npx tsc --noEmit` clean, build passes. **Commit:** `feat(debt): debt module with payoff math + route`.

---

## Task E2: Debts tab UI

**Files:** Create `src/components/nudge/debts-tab.tsx`; modify `src/components/nudge/nudge-tab-nav.tsx` (add a "debts" tab to `TABS` + `NudgeTabKey`) and `src/components/nudge/nudge-app.tsx` (content switch + import).

- [ ] **Step 1 — READ** `src/components/nudge/nudge-tab-nav.tsx` (the `TABS` array shape: `{key,label,hint,icon}`), `src/components/nudge/nudge-app.tsx` (content switch `{tab === "..." ? <X/> : null}`), `src/components/nudge/goals-tab.tsx` (a similar list+form tab for styling), `src/components/nudge/sharing-dialog.tsx` (fetch pattern), and `docs/nudge-ui-standards.md`.
- [ ] **Step 2 — add the tab registration**: in `nudge-tab-nav.tsx` add `"debts"` to the `NudgeTabKey` union and a `TABS` entry `{ key:"debts", label:"Debts", hint:"Payoff", icon: (...) => (<svg .../>) }` (use a simple stroke icon consistent with the others — e.g. a downward trend / banknote). Place it after "goals".
- [ ] **Step 3 — content switch**: in `nudge-app.tsx`, import `DebtsTab` and add `{tab === "debts" ? <DebtsTab /> : null}` in the `role="tabpanel"` block. Additive only.
- [ ] **Step 4 — build `debts-tab.tsx`** (client). Uses `useNudgeBudget()` + `useCurrency()`:
  - On mount, `GET /api/debts` (authed). Keep `debts` in state.
  - A strategy toggle (snowball / avalanche) via frosted-ui `SegmentedControl` or pills.
  - For each debt (ordered by `payoffOrder(debts, state.transactions, strategy)`): show name, remaining (`debtRemaining(debt, state.transactions)` via `formatFromUsd`), APR, min payment, and a small progress bar (paid / original balance). A "Log payment" action: opens a small inline form / uses `addTransaction({ type:"expense", amount, categoryId:null, goalId:null, debtId: debt.id, note:"Debt payment", date: today })` from context (this persists + attributes + logs activity), then refetch debts. Edit/Delete debt (PATCH/DELETE → refetch).
  - An "Add debt" form: name, balance, APR, min payment → POST → refetch.
  - A summary card: total remaining across debts, and the projected debt-free date = `addMonthsIso(today, projectDebtFreeMonths(debts, state.transactions, strategy))` (show "—" when null, with a note "minimum payments don't cover interest").
  - Surface `{error}`. If a load-on-mount effect trips `set-state-in-effect`, scope-disable with a comment.
- [ ] **Step 5 — verify** `npx tsc --noEmit && npm run build`; `npm run test` (debt tests green); `npm run lint` ≤ 13. **Commit:** `feat(ui): debts tab with payoff guidance`.

---

## Task E3: Validate & merge
- [ ] `npm run test`, `npx tsc --noEmit`, `npm run build`, `npm run lint` (≤ 13). No migration (nudge_debts + debt_id exist).
- [ ] **merge:** `git checkout main && git merge --no-ff feat/debt-tracker && git push origin main`.

## Self-review (E)
- Debts with balance/APR/min payment + payments via `debt_id` transactions → E1 + E2 log-payment. ✓
- Snowball/avalanche ordering + projected debt-free date → `payoffOrder` + `projectDebtFreeMonths` (unit-tested). ✓
- Debts tab surface → E2. ✓
