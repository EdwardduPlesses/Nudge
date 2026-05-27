# Native-Currency Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store and display every amount in the workbook's own currency (e.g. ZAR), exactly as entered — no USD-equivalent storage, no FX round-trip on display.

**Architecture:** Add `base_currency` to `nudge_workbooks` (default USD; existing data unchanged). Amount columns are reinterpreted as native. Switching currency calls an atomic Postgres function that multiplies every amount by the live cross-rate and flips the flag. `useCurrency()` is reworked to format natively from the workbook's currency and to store typed values as-is; FX is used only for the one-time convert.

**Tech Stack:** Next.js 16, React 19, Supabase (service role + a plpgsql RPC), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-27-native-currency-storage-design.md`

**Branch:** `feat/native-currency`

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260528120000_nudge_base_currency.sql` (create) | `base_currency` column + `nudge_convert_workbook_currency` RPC |
| `src/lib/currency-config.ts` (modify) | add `crossRate`, `decimalsFor` |
| `src/lib/currency-config.test.ts` (create) | unit tests for the above |
| `src/lib/format-money.ts` (modify) | add `formatMoney(amount, code)` |
| `src/lib/format-money.test.ts` (create) | unit tests for `formatMoney` |
| `src/lib/fx.ts` (create) | server `getUsdRatesToTargets()` extracted from the exchange-rate route |
| `src/lib/budget/types.ts` (modify) | add `baseCurrency` to `BudgetState` |
| `src/lib/budget/supabase-persistence.ts` (modify) | load `base_currency` |
| `src/app/api/exchange-rate/route.ts` (modify) | use the extracted `getUsdRatesToTargets()` |
| `src/app/api/workbook/route.ts` (modify) | `PATCH { baseCurrency }` → convert-all |
| `src/context/currency-context.tsx` (modify) | native formatting; `changeCurrency`; drop FX display |
| consumer components (modify) | `formatFromUsd`→`formatAmount`, drop `displayAmountAsUsd` |

---

## Task 1: Migration — base_currency column + convert RPC

**Files:** Create `supabase/migrations/20260528120000_nudge_base_currency.sql`

> SQL only; a human/pipeline runs `npm run db:push`. The RPC makes the convert-all atomic
> (one transaction), which is better than non-transactional JS writes.

- [ ] **Step 1: Write the migration**

```sql
-- Native-currency storage: per-workbook base currency + atomic convert-all.

begin;

alter table public.nudge_workbooks
  add column if not exists base_currency text not null default 'USD';

-- Multiply every amount in a workbook by p_rate, round to p_decimals, set base_currency.
-- Runs as a single transaction (function body) so a partial conversion can't occur.
create or replace function public.nudge_convert_workbook_currency(
  p_workbook_id uuid,
  p_rate double precision,
  p_to_currency text,
  p_decimals int
) returns void
language plpgsql
as $$
begin
  update public.nudge_transactions
    set amount = round((amount * p_rate)::numeric, p_decimals)
    where workbook_id = p_workbook_id;

  update public.nudge_goals
    set target_amount = round((target_amount * p_rate)::numeric, p_decimals),
        saved_amount  = round((saved_amount  * p_rate)::numeric, p_decimals)
    where workbook_id = p_workbook_id;

  update public.nudge_debts
    set balance     = round((balance     * p_rate)::numeric, p_decimals),
        min_payment = round((min_payment * p_rate)::numeric, p_decimals)
    where workbook_id = p_workbook_id;

  update public.nudge_recurring_items
    set amount = round((amount * p_rate)::numeric, p_decimals)
    where workbook_id = p_workbook_id;

  update public.nudge_period_incomes
    set planned_amount = round((planned_amount * p_rate)::numeric, p_decimals)
    where period_id in (select id from public.nudge_periods where workbook_id = p_workbook_id);

  update public.nudge_period_category_limits
    set budget_limit = round((budget_limit * p_rate)::numeric, p_decimals)
    where period_id in (select id from public.nudge_periods where workbook_id = p_workbook_id);

  update public.nudge_workbooks
    set base_currency = p_to_currency
    where id = p_workbook_id;
end;
$$;

commit;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260528120000_nudge_base_currency.sql
git commit -m "feat(db): base_currency column + atomic convert-all RPC (run db:push)"
```

---

## Task 2: Cross-rate + decimals helpers

**Files:** Modify `src/lib/currency-config.ts`; Create `src/lib/currency-config.test.ts`

- [ ] **Step 1: Write failing tests** (`src/lib/currency-config.test.ts`):

```ts
import { expect, test } from "vitest";
import { crossRate, decimalsFor } from "./currency-config";

const usd = { ZAR: 18.6, EUR: 0.92, GBP: 0.79, JPY: 152 };

test("crossRate USD->ZAR is the ZAR usd-rate", () => {
  expect(crossRate("USD", "ZAR", usd)).toBeCloseTo(18.6, 6);
});

test("crossRate ZAR->USD is the inverse", () => {
  expect(crossRate("ZAR", "USD", usd)).toBeCloseTo(1 / 18.6, 6);
});

test("crossRate EUR->ZAR = usdZAR/usdEUR", () => {
  expect(crossRate("EUR", "ZAR", usd)).toBeCloseTo(18.6 / 0.92, 6);
});

test("crossRate same currency is 1", () => {
  expect(crossRate("ZAR", "ZAR", usd)).toBe(1);
});

test("decimalsFor: JPY 0, others 2", () => {
  expect(decimalsFor("JPY")).toBe(0);
  expect(decimalsFor("ZAR")).toBe(2);
  expect(decimalsFor("USD")).toBe(2);
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npm run test src/lib/currency-config.test.ts`
Expected: FAIL — `crossRate`/`decimalsFor` not exported.

- [ ] **Step 3: Implement** (append to `src/lib/currency-config.ts`):

```ts
/** Conversion multiplier from one display currency to another, via USD pivot. */
export function crossRate(
  from: DisplayCurrency,
  to: DisplayCurrency,
  usdRates: UsdRatesToTargets,
): number {
  if (from === to) return 1;
  const usdFrom = from === "USD" ? 1 : usdRates[from as FxTargetCode];
  const usdTo = to === "USD" ? 1 : usdRates[to as FxTargetCode];
  if (!Number.isFinite(usdFrom) || !Number.isFinite(usdTo) || usdFrom <= 0 || usdTo <= 0) {
    return NaN;
  }
  return usdTo / usdFrom;
}

/** Fraction digits for storage rounding (JPY is whole-number). */
export function decimalsFor(code: DisplayCurrency): number {
  return code === "JPY" ? 0 : 2;
}
```

- [ ] **Step 4: Run, confirm 5 passed**

Run: `npm run test src/lib/currency-config.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/currency-config.ts src/lib/currency-config.test.ts
git commit -m "feat(currency): cross-rate + decimals helpers with tests"
```

---

## Task 3: Native money formatter

**Files:** Modify `src/lib/format-money.ts`; Create `src/lib/format-money.test.ts`

- [ ] **Step 1: Write failing tests** (`src/lib/format-money.test.ts`):

```ts
import { expect, test } from "vitest";
import { formatMoney } from "./format-money";

test("formats ZAR with R symbol and 2dp", () => {
  const s = formatMoney(100, "ZAR");
  expect(s).toMatch(/R/);
  expect(s).toMatch(/100[.,]00/);
});

test("formats JPY with no decimals (rounds)", () => {
  const s = formatMoney(1234.6, "JPY");
  expect(s).toMatch(/1,?235/);
  expect(s).not.toMatch(/\./);
});

test("non-finite renders em dash", () => {
  expect(formatMoney(NaN, "USD")).toBe("—");
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npm run test src/lib/format-money.test.ts`
Expected: FAIL — `formatMoney` not exported.

- [ ] **Step 3: Implement** (append to `src/lib/format-money.ts`):

```ts
/** Format `amount` directly in `code` (no FX). Amounts are already stored in `code`. */
export function formatMoney(amount: number, code: DisplayCurrency): string {
  if (!Number.isFinite(amount)) return "—";
  const value = code === "JPY" ? Math.round(amount) : Math.round(amount * 100) / 100;
  return new Intl.NumberFormat(localeForCurrency(code), intlCurrencyOptions(code)).format(value);
}
```

- [ ] **Step 4: Run, confirm 3 passed**

Run: `npm run test src/lib/format-money.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/format-money.ts src/lib/format-money.test.ts
git commit -m "feat(currency): native formatMoney with tests"
```

---

## Task 4: Extract server FX helper

**Files:** Create `src/lib/fx.ts`; Modify `src/app/api/exchange-rate/route.ts`

- [ ] **Step 1: Read** `src/app/api/exchange-rate/route.ts` to see how it fetches USD→target
  rates (Frankfurter) and falls back to `FALLBACK_USD_RATES`.

- [ ] **Step 2: Create `src/lib/fx.ts`** — move the rate-fetching logic into a reusable
  server function:

```ts
import { FALLBACK_USD_RATES, FX_TARGETS, isFxComplete, type UsdRatesToTargets } from "@/lib/currency-config";

/** Fetch USD→{ZAR,EUR,GBP,JPY} multipliers; fall back to constants on any failure. */
export async function getUsdRatesToTargets(): Promise<{ rates: UsdRatesToTargets; stale: boolean }> {
  try {
    const symbols = FX_TARGETS.join(",");
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${symbols}`, {
      cache: "no-store",
    });
    if (!res.ok) return { rates: FALLBACK_USD_RATES, stale: true };
    const json = (await res.json()) as { rates?: Partial<UsdRatesToTargets> };
    if (json.rates && isFxComplete(json.rates)) return { rates: json.rates, stale: false };
    return { rates: FALLBACK_USD_RATES, stale: true };
  } catch {
    return { rates: FALLBACK_USD_RATES, stale: true };
  }
}
```

> If the existing route already has equivalent logic with extra nuances (caching headers,
> a different provider URL), preserve those nuances by moving the real implementation here
> rather than this simplified version; this is the interface to expose.

- [ ] **Step 3: Update `exchange-rate/route.ts`** to call `getUsdRatesToTargets()` and return
  `{ base: "USD", rates, stale }` (its existing response shape). Keep its caching behavior.

- [ ] **Step 4: Verify** `npx tsc --noEmit` clean; `npm run build` passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fx.ts src/app/api/exchange-rate/route.ts
git commit -m "refactor(fx): extract getUsdRatesToTargets for reuse"
```

---

## Task 5: Add baseCurrency to BudgetState + loader

**Files:** Modify `src/lib/budget/types.ts`, `src/lib/budget/supabase-persistence.ts`

- [ ] **Step 1: Add the field to `BudgetState`** in `types.ts` (after `periodAnchorDay`):

```ts
  /** ISO currency the workbook's amounts are stored & displayed in (e.g. "ZAR"). */
  baseCurrency: string;
```

- [ ] **Step 2: Load it** in `supabase-persistence.ts`. In `loadWorkbookMeta`, extend the
  workbook select to include `base_currency` and return it:

Change the workbook query select to `"period_anchor_day, base_currency"`, and update the
return type/object to include `baseCurrency: (wb.base_currency as string) ?? "USD"`.
Then in `fetchBudgetStateForUser`, destructure `baseCurrency` from `loadWorkbookMeta` and
add `baseCurrency` to the returned `BudgetState`.

(Read the current `loadWorkbookMeta` first — it returns `{ anchorDay, members }`; make it
`{ anchorDay, baseCurrency, members }`.)

- [ ] **Step 3: Fix `defaultBudgetState()`** in `src/lib/budget/defaults.ts` — add
  `baseCurrency: "USD"` to the returned object.

- [ ] **Step 4: Verify** `npx tsc --noEmit` — errors will appear in the currency context /
  consumers (fixed next tasks); the loader/types/defaults themselves must compile. Note the
  error list.

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget/types.ts src/lib/budget/supabase-persistence.ts src/lib/budget/defaults.ts
git commit -m "feat(currency): expose workbook baseCurrency in budget state"
```

---

## Task 6: Convert-all on the workbook route

**Files:** Modify `src/app/api/workbook/route.ts`

- [ ] **Step 1: Read** the current route (it PATCHes `period_anchor_day`). Add `baseCurrency`
  handling. Replace the file with both behaviors:

```ts
import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clampAnchorDay } from "@/lib/budget/period-math";
import { crossRate, decimalsFor, isDisplayCurrency } from "@/lib/currency-config";
import { getUsdRatesToTargets } from "@/lib/fx";
import { logActivity } from "@/lib/budget/activity";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  // Anchor-day update (unchanged behavior).
  if (body.periodAnchorDay !== undefined) {
    const day = clampAnchorDay(Number(body.periodAnchorDay));
    const { error } = await supabase.from("nudge_workbooks").update({ period_anchor_day: day }).eq("id", ctx.workbookId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, periodAnchorDay: day });
  }

  // Base-currency change → atomic convert-all.
  if (body.baseCurrency !== undefined) {
    const to = String(body.baseCurrency);
    if (!isDisplayCurrency(to)) return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    const { data: wb, error: wbErr } = await supabase.from("nudge_workbooks").select("base_currency").eq("id", ctx.workbookId).single();
    if (wbErr) return NextResponse.json({ error: wbErr.message }, { status: 500 });
    const from = (wb.base_currency as string) ?? "USD";
    if (!isDisplayCurrency(from) || from === to) {
      // No-op (already in target). Still ensure the flag is set.
      await supabase.from("nudge_workbooks").update({ base_currency: to }).eq("id", ctx.workbookId);
      return NextResponse.json({ ok: true, baseCurrency: to });
    }
    const { rates } = await getUsdRatesToTargets();
    const rate = crossRate(from, to, rates);
    if (!Number.isFinite(rate) || rate <= 0) return NextResponse.json({ error: "Rate unavailable" }, { status: 502 });
    const { error: rpcErr } = await supabase.rpc("nudge_convert_workbook_currency", {
      p_workbook_id: ctx.workbookId,
      p_rate: rate,
      p_to_currency: to,
      p_decimals: decimalsFor(to),
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    await logActivity(ctx.workbookId, ctx.userId, "updated", "workbook", ctx.workbookId, `changed budget currency to ${to}`);
    return NextResponse.json({ ok: true, baseCurrency: to });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` clean for this file; `npm run build` passes.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/workbook/route.ts
git commit -m "feat(api): convert-all when workbook base currency changes"
```

---

## Task 7: Rework the currency context to native

**Files:** Modify `src/context/currency-context.tsx`

- [ ] **Step 1: Replace the provider** so it reads the workbook currency from the budget
  context and formats natively. It is rendered INSIDE `NudgeBudgetProvider`, so
  `useNudgeBudget()` is available. New shape:

```tsx
"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import {
  DISPLAY_CURRENCY_CODES,
  DISPLAY_LABELS,
  type DisplayCurrency,
  isDisplayCurrency,
} from "@/lib/currency-config";
import { formatMoney } from "@/lib/format-money";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";

type CurrencyContextValue = {
  currencyCode: DisplayCurrency;
  /** Format an amount already stored in the workbook currency. */
  formatAmount: (amount: number) => string;
  /** Parse user input into a plain number in the workbook currency (no conversion). */
  parseAmount: (text: string | number) => number;
  /** Change the workbook currency (server converts all amounts, then we reload). */
  changeCurrency: (code: DisplayCurrency) => Promise<void>;
};

const CurrencyCtx = createContext<CurrencyContextValue | null>(null);

export function CurrencyPreferenceProvider(props: {
  experienceId: string;
  userId: string;
  children: ReactNode;
}) {
  const { state, whopUserToken } = useNudgeBudget();
  const currencyCode: DisplayCurrency = isDisplayCurrency(state.baseCurrency)
    ? state.baseCurrency
    : "USD";

  const formatAmount = useCallback((amount: number) => formatMoney(amount, currencyCode), [currencyCode]);

  const parseAmount = useCallback((text: string | number) => {
    if (typeof text === "number") return Number.isFinite(text) ? text : 0;
    const n = Number(String(text).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }, []);

  const changeCurrency = useCallback(
    async (code: DisplayCurrency) => {
      if (code === currencyCode) return;
      const res = await fetch(
        "/api/workbook",
        nudgeBudgetFetchInit(whopUserToken, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseCurrency: code }),
        }),
      );
      if (res.ok) window.location.reload();
      else console.error("[Nudge] currency change failed", res.status);
    },
    [currencyCode, whopUserToken],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({ currencyCode, formatAmount, parseAmount, changeCurrency }),
    [currencyCode, formatAmount, parseAmount, changeCurrency],
  );

  return <CurrencyCtx.Provider value={value}>{props.children}</CurrencyCtx.Provider>;
}

export function useCurrency() {
  const v = useContext(CurrencyCtx);
  if (!v) throw new Error("useCurrency must be used within CurrencyPreferenceProvider");
  return v;
}

export function displayCurrencyItems(): { code: DisplayCurrency; label: string }[] {
  return DISPLAY_CURRENCY_CODES.map((code) => ({ code, label: DISPLAY_LABELS[code] }));
}
```

(The `experienceId`/`userId` props are retained for call-site compatibility but no longer
used; do not change the two pages that pass them.)

- [ ] **Step 2: Verify** `npx tsc --noEmit` — remaining errors are now in consumer
  components that reference removed members (`formatFromUsd`, `displayAmountAsUsd`,
  `usdAsDisplayAmount`, `rates`, `setCurrency`, `currency`, `amountApproxLabel`,
  `canonicalHint`). List them; fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/context/currency-context.tsx
git commit -m "feat(currency): native formatting context (no FX round-trip)"
```

---

## Task 8: Update consumers + currency selector

**Files:** Modify the components below. Apply this exact transformation recipe per file,
then make `npx tsc --noEmit` and `npm run build` pass (tsc is the checklist — every removed
symbol surfaces as an error to fix).

**Transformation recipe:**
- `formatFromUsd(x)` → `formatAmount(x)` (rename the destructured member from `useCurrency()` and all calls).
- Input dialogs that did `displayAmountAsUsd(Number(input))` to get a USD value to save →
  use `parseAmount(input)` and save that number directly (it is already in the workbook
  currency). Remove the `displayAmountAsUsd` usage.
- `usdAsDisplayAmount(x)` (used to prefill an input from a stored value) → use `x` directly.
- Remove `amountApproxLabel` / `canonicalHint` usages and the small "(approx ZAR)" /
  "stored as USD" hint text they fed (delete those label spans).
- Remove any use of `currency`, `setCurrency`, `rates`, `rateLoading`, `rateError`,
  `rateForCurrency` from `useCurrency()`.

**Files to update (all consumers of the old API):**
- `src/components/nudge/activity-tab.tsx` — `formatFromUsd`→`formatAmount`.
- `src/components/nudge/add-transaction-dialog.tsx` — format rename; input save via `parseAmount`; prefill via stored number.
- `src/components/nudge/quick-add-expense-dialog.tsx` — same as add-transaction.
- `src/components/nudge/budgets-tab.tsx` — format rename; income & cap inputs via `parseAmount`.
- `src/components/nudge/goals-tab.tsx` — format rename; target input via `parseAmount`.
- `src/components/nudge/debts-tab.tsx` — format rename; balance/min/payment inputs via `parseAmount`.
- `src/components/nudge/recurring-dialog.tsx` — format rename; amount input via `parseAmount`.
- `src/components/nudge/dashboard-tab.tsx` — `formatFromUsd`→`formatAmount`.
- `src/components/nudge/dashboard/overview-hero.tsx` — `formatFromUsd`→`formatAmount`.
- `src/components/nudge/dashboard/category-health-list.tsx` — `formatFromUsd`→`formatAmount`.
- `src/components/nudge/dashboard/spending-velocity-card.tsx` — `formatFromUsd`→`formatAmount`.
- `src/components/nudge/dashboard/ai-money-plan-cta.tsx` — `formatFromUsd`→`formatAmount`.
- `src/components/nudge/insights-tab.tsx` — `formatFromUsd`→`formatAmount`; remove approx/canonical hints.
- `src/components/nudge/charts.tsx` — chart domain is now base currency: replace
  `formatUsdAsDisplayAxisTick(v, currency, rate)` with `formatUsdAsDisplayAxisTick(v, currencyCode, 1)`
  (rate 1, `currencyCode` from `useCurrency()`); replace any `formatFromUsd` with `formatAmount`.

- [ ] **Step 1: Currency selector wiring** in `src/components/nudge/nudge-app.tsx`. The
  `TopBarCurrencySelect` and `HeaderCurrencySelect` currently call `setCurrency`. Change both
  to read `currencyCode` and call `changeCurrency` from `useCurrency()`. Add a brief inline
  note near the control: "Changing this converts all amounts at today's rate." (Keep using
  `displayCurrencyItems()` for the options.)

- [ ] **Step 2: Apply the recipe** to every file listed above.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build && npm run test`
Expected: all clean/green. If any consumer still references a removed member, fix it.

- [ ] **Step 4: Commit**

```bash
git add src/components src/context
git commit -m "feat(currency): format/store natively across the app; currency selector converts-all"
```

---

## Task 9: Validate, migrate & merge

- [ ] **Step 1: Full validation**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm run test`
Expected: lint ≤ baseline (13 problems); tsc clean; build ok; tests green.

- [ ] **Step 2: Apply migration**

Run: `npm run db:push`
Confirm `nudge_workbooks.base_currency` exists (default `'USD'`) and the
`nudge_convert_workbook_currency` function is present. Existing amounts unchanged.

- [ ] **Step 3: Manual smoke (dev)**

`npm run dev`: existing data still shows (as USD). Switch currency to ZAR in the selector →
confirm a one-time conversion (amounts ×~18.6, rounded), everything now formats as `R…`,
and re-entering R100 persists and re-displays as exactly R100 on reload. Switch back to USD →
amounts return to ~original magnitude.

- [ ] **Step 4: Merge**

```bash
git checkout main && git merge --no-ff feat/native-currency
git push origin main
```

---

## Self-review

- **Spec coverage:** base_currency column (Task 1) ✓; native storage semantics (Tasks 5,8) ✓;
  non-destructive migration defaulting USD (Task 1) ✓; convert-all at live rate, per-currency
  rounding, activity log (Tasks 1,6) ✓; native display + store-as-typed, helpers renamed
  (Tasks 3,7,8) ✓; exchange-rate kept only for convert (Task 4 + Task 6 usage) ✓; non-goals
  respected (no per-tx currency, no live display FX) ✓.
- **Improvement over spec:** convert-all is an atomic Postgres RPC (Task 1), eliminating the
  spec's non-transactional-ordering caveat.
- **Placeholder scan:** none — every code step has complete code; Task 8 is a precise
  mechanical recipe with the full file list and tsc as the completion gate.
- **Type consistency:** `formatAmount`/`parseAmount`/`currencyCode`/`changeCurrency` defined in
  Task 7 are used consistently in Task 8; `crossRate`/`decimalsFor` (Task 2) and
  `getUsdRatesToTargets` (Task 4) match their Task 6 call sites; `baseCurrency` (Task 5) feeds
  the context in Task 7.
