# Recurring Payments + Layout Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recurring payments fire only at period start/end, let users backfill them into a period that already started, mark a transaction as recurring from the edit dialog, fix the Recurring/Activity scroll problems, and show total-budgeted-vs-income on the Plan tab.

**Architecture:** Reuse the existing nullable `nudge_recurring_items.day_of_period` column as a timing flag (`null` = start, sentinel `999` = end) — no migration. Extract the recurring date/timing logic into pure, unit-tested helpers; keep the supabase/React glue thin and verify it with type-check + build + manual checks (matching this repo, which unit-tests pure functions only). A new idempotent `POST /api/recurring/apply` endpoint backfills the current period; the existing `materializeRecurring` is reused and made to return a newly-inserted count.

**Tech Stack:** Next.js 16 (App Router, route handlers), React 19, TypeScript, frosted-ui, Supabase JS, vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-recurring-and-budget-improvements-design.md`

---

## Conventions for this plan

- Run a single test file: `npx vitest run <path>`. Run all unit tests: `npm run test`.
- Type-check: `npx tsc --noEmit`. Lint: `npm run lint`. Build: `npm run build`.
- This repo unit-tests **pure functions only**. Tasks 1 and 6 are TDD. Tasks 2–5 (supabase route + React UI) have no unit-test harness here — they are verified by `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus the explicit manual checks in each task.
- The DB column stays `day_of_period`; only the TypeScript model uses `timing`. **No migration / `db push` is required for this work.**

## File structure

- `src/lib/budget/recurring.ts` — **modify**: timing model, pure `recurringRowsFor`/`timingFromDayOfPeriod`/`dayOfPeriodForTiming` helpers, `materializeRecurring` returns a count.
- `src/lib/budget/recurring.test.ts` — **create**: unit tests for the pure helpers.
- `src/app/api/recurring/apply/route.ts` — **create**: idempotent backfill endpoint.
- `src/context/nudge-budget-context.tsx` — **modify**: expose `refresh()` (wraps existing `resync()`).
- `src/components/nudge/add-recurring-dialog.tsx` — **create**: dialog form for adding a recurring item.
- `src/components/nudge/recurring-tab.tsx` — **modify**: header actions (Add item dialog + Add to this period), remove inline form, timing label.
- `src/components/nudge/add-transaction-dialog.tsx` — **modify**: "Make recurring" action in `EditTransactionDialog`.
- `src/components/nudge/activity-tab.tsx` — **modify**: cap the "Recent changes" feed height.
- `src/lib/budget/selectors.ts` — **modify**: add `totalCategoryBudget`.
- `src/lib/budget/selectors.test.ts` — **modify**: test `totalCategoryBudget`.
- `src/components/nudge/budgets-tab.tsx` — **modify**: budgeted-vs-income summary line.

---

## Task 1: Recurring timing model (pure helpers + wiring)

Replace the free `dayOfPeriod` with a `timing: "start" | "end"` model, backed by the existing `day_of_period` column via a sentinel. Extract the date logic into pure functions and unit-test them.

**Files:**
- Modify: `src/lib/budget/recurring.ts`
- Test: `src/lib/budget/recurring.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/budget/recurring.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  FIRES_AT_END,
  timingFromDayOfPeriod,
  dayOfPeriodForTiming,
  recurringRowsFor,
  type RecurringItem,
} from "./recurring";

const item = (over: Partial<RecurringItem>): RecurringItem => ({
  id: "r1",
  type: "expense",
  amount: 100,
  categoryId: null,
  goalId: null,
  note: "",
  timing: "start",
  ownerUserId: "u1",
  active: true,
  ...over,
});

const period = { id: "p1", startDate: "2026-05-01", endDate: "2026-05-31" };

test("timingFromDayOfPeriod: null + legacy 1-28 are start; sentinel/>=29 is end", () => {
  expect(timingFromDayOfPeriod(null)).toBe("start");
  expect(timingFromDayOfPeriod(1)).toBe("start");
  expect(timingFromDayOfPeriod(28)).toBe("start");
  expect(timingFromDayOfPeriod(29)).toBe("end");
  expect(timingFromDayOfPeriod(FIRES_AT_END)).toBe("end");
});

test("dayOfPeriodForTiming: end -> sentinel; start/undefined -> null", () => {
  expect(dayOfPeriodForTiming("end")).toBe(FIRES_AT_END);
  expect(dayOfPeriodForTiming("start")).toBe(null);
  expect(dayOfPeriodForTiming(undefined)).toBe(null);
});

test("recurringRowsFor: start fires on period start, end on period end, id is stable", () => {
  const rows = recurringRowsFor(
    "wb1",
    [item({ id: "a", timing: "start" }), item({ id: "b", timing: "end" })],
    period,
  );
  expect(rows[0]).toMatchObject({
    id: "rec_a_2026-05-01",
    workbook_id: "wb1",
    period_id: "p1",
    date: "2026-05-01",
  });
  expect(rows[1]).toMatchObject({ id: "rec_b_2026-05-01", date: "2026-05-31" });
});

test("recurringRowsFor: blank note falls back to 'Recurring'", () => {
  const rows = recurringRowsFor("wb1", [item({ note: "" })], period);
  expect(rows[0].note).toBe("Recurring");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/budget/recurring.test.ts`
Expected: FAIL — `timingFromDayOfPeriod`/`dayOfPeriodForTiming`/`recurringRowsFor`/`FIRES_AT_END` are not exported yet.

- [ ] **Step 3: Rewrite `recurring.ts` with the timing model**

Replace the **entire** contents of `src/lib/budget/recurring.ts` with:

```ts
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Sentinel stored in `day_of_period` to mean "fire at period end". The column predates the
 *  start/end-only model: null = start, this sentinel = end. Legacy 1-28 values read as start. */
export const FIRES_AT_END = 999;

export type RecurringTiming = "start" | "end";

export interface RecurringItem {
  id: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string | null;
  goalId: string | null;
  note: string;
  timing: RecurringTiming;
  ownerUserId: string;
  active: boolean;
}

/** Row shape upserted into nudge_transactions when materializing recurring items. */
export interface RecurringTxnRow {
  id: string;
  workbook_id: string;
  period_id: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  category_id: string | null;
  goal_id: string | null;
  note: string;
  created_by: string;
}

/** DB day_of_period -> timing. null / legacy 1-28 = start; sentinel (>=29) = end. */
export function timingFromDayOfPeriod(dayOfPeriod: unknown): RecurringTiming {
  return Number(dayOfPeriod) >= 29 ? "end" : "start";
}

/** timing -> DB day_of_period. end = sentinel; start (or unset) = null. */
export function dayOfPeriodForTiming(timing: RecurringTiming | undefined): number | null {
  return timing === "end" ? FIRES_AT_END : null;
}

function mapRow(r: Record<string, unknown>): RecurringItem {
  return {
    id: r.id as string,
    type: r.type === "income" ? "income" : "expense",
    amount: Number(r.amount) || 0,
    categoryId: (r.category_id as string) ?? null,
    goalId: (r.goal_id as string) ?? null,
    note: (r.note as string) ?? "",
    timing: timingFromDayOfPeriod(r.day_of_period),
    ownerUserId: r.owner_user_id as string,
    active: Boolean(r.active),
  };
}

export async function listRecurring(workbookId: string): Promise<RecurringItem[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_recurring_items")
    .select("*")
    .eq("workbook_id", workbookId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Build transaction rows for a period from active recurring items. Pure (no I/O) so the
 *  date/timing logic is unit-testable. start -> period.startDate, end -> period.endDate. */
export function recurringRowsFor(
  workbookId: string,
  items: RecurringItem[],
  period: { id: string; startDate: string; endDate: string },
): RecurringTxnRow[] {
  return items.map((it) => ({
    id: `rec_${it.id}_${period.startDate}`,
    workbook_id: workbookId,
    period_id: period.id,
    date: it.timing === "end" ? period.endDate : period.startDate,
    amount: it.amount,
    type: it.type,
    category_id: it.categoryId,
    goal_id: it.goalId,
    note: it.note || "Recurring",
    created_by: it.ownerUserId,
  }));
}

/**
 * Materialize a workbook's active recurring items as transactions in `period`.
 * Idempotent: each materialized transaction id is derived from the recurring id +
 * period start, upserted with onConflict do-nothing, so re-running does not duplicate.
 * Returns the number of NEWLY inserted transactions (0 if all already existed).
 */
export async function materializeRecurring(
  workbookId: string,
  period: { id: string; startDate: string; endDate: string },
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_recurring_items")
    .select("*")
    .eq("workbook_id", workbookId)
    .eq("active", true);
  if (error) throw error;
  const items = (data ?? []).map(mapRow);
  if (items.length === 0) return 0;

  const rows = recurringRowsFor(workbookId, items, period);
  // Composite PK is (workbook_id, id); ignore duplicates so this is idempotent. With
  // ignoreDuplicates, .select() returns only the rows actually inserted -> newly-added count.
  const { data: inserted, error: upsertError } = await supabase
    .from("nudge_transactions")
    .upsert(rows, { onConflict: "workbook_id,id", ignoreDuplicates: true })
    .select("id");
  if (upsertError) throw upsertError;
  return inserted?.length ?? 0;
}

export async function createRecurring(
  workbookId: string,
  ownerUserId: string,
  body: Partial<RecurringItem>,
): Promise<RecurringItem> {
  const supabase = getSupabaseAdmin();
  const id = body.id ?? (typeof crypto !== "undefined" && crypto.randomUUID ? `rec_${crypto.randomUUID()}` : `rec_${Date.now()}`);
  const { data, error } = await supabase
    .from("nudge_recurring_items")
    .insert({
      id,
      workbook_id: workbookId,
      type: body.type === "income" ? "income" : "expense",
      amount: Math.max(0, Number(body.amount ?? 0)),
      category_id: body.categoryId ?? null,
      goal_id: body.goalId ?? null,
      note: String(body.note ?? "").slice(0, 1000),
      day_of_period: dayOfPeriodForTiming(body.timing),
      owner_user_id: ownerUserId,
      active: body.active ?? true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateRecurring(workbookId: string, id: string, body: Partial<RecurringItem>): Promise<void> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (body.type !== undefined) patch.type = body.type === "income" ? "income" : "expense";
  if (body.amount !== undefined) patch.amount = Math.max(0, Number(body.amount));
  if (body.categoryId !== undefined) patch.category_id = body.categoryId;
  if (body.goalId !== undefined) patch.goal_id = body.goalId;
  if (body.note !== undefined) patch.note = String(body.note).slice(0, 1000);
  if (body.timing !== undefined) patch.day_of_period = dayOfPeriodForTiming(body.timing);
  if (body.active !== undefined) patch.active = body.active;
  const { error } = await supabase.from("nudge_recurring_items").update(patch).eq("id", id).eq("workbook_id", workbookId);
  if (error) throw error;
}

export async function deleteRecurring(workbookId: string, id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_recurring_items").delete().eq("id", id).eq("workbook_id", workbookId);
  if (error) throw error;
}
```

This removes the old `addDaysIso` and `clampDayOfPeriod` helpers (now unused) and changes `materializeRecurring`'s return type to `Promise<number>`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/budget/recurring.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check (the route still passes `body` through; `period-repo.ts` ignores the new return value)**

Run: `npx tsc --noEmit`
Expected: no errors. (The recurring API route at `src/app/api/recurring/route.ts` needs no change — it forwards the request body to `createRecurring`/`updateRecurring`, which now read `body.timing`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/budget/recurring.ts src/lib/budget/recurring.test.ts
git commit -m "feat(recurring): start/end timing model with pure, tested helpers"
```

---

## Task 2: Idempotent "apply to current period" endpoint + context `refresh()`

Add `POST /api/recurring/apply` that backfills the current period, and expose a `refresh()` on the budget context so the UI can re-pull state afterward.

**Files:**
- Create: `src/app/api/recurring/apply/route.ts`
- Modify: `src/context/nudge-budget-context.tsx`

- [ ] **Step 1: Create the apply route**

Create `src/app/api/recurring/apply/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveMutationContext } from "../../_shared/workbook-mutation";
import { logActivity } from "@/lib/budget/activity";
import { ensureCurrentPeriod } from "@/lib/budget/period-repo";
import { materializeRecurring } from "@/lib/budget/recurring";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const c = await resolveMutationContext();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { userId, workbookId } = c;
  try {
    const supabase = getSupabaseAdmin();
    const { data: wb } = await supabase
      .from("nudge_workbooks")
      .select("period_anchor_day")
      .eq("id", workbookId)
      .single();
    const anchorDay = Number(wb?.period_anchor_day ?? 1);
    const today = new Date().toISOString().slice(0, 10);
    const period = await ensureCurrentPeriod(workbookId, anchorDay, today);
    const added = await materializeRecurring(workbookId, period);
    if (added > 0) {
      await logActivity(
        workbookId,
        userId,
        "created",
        "recurring",
        period.id,
        `applied ${added} recurring item${added === 1 ? "" : "s"} to this period`,
      );
    }
    return NextResponse.json({ added });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Expose `refresh()` from the budget context**

In `src/context/nudge-budget-context.tsx`, add `refresh` to the context type. Find this line in the `NudgeBudgetContextValue` type:

```ts
  clearSyncError: () => void;
```

Add immediately after it:

```ts
  /** Re-fetch authoritative budget state for the period in view (e.g. after a server-side mutation). */
  refresh: () => Promise<void>;
```

- [ ] **Step 3: Wire `refresh` into the context value**

Still in `src/context/nudge-budget-context.tsx`, find the value object inside `useMemo` (it ends with `clearSyncError,`). Add `refresh: resync,`:

```ts
      syncError,
      clearSyncError,
      refresh: resync,
```

Then add `resync` to that `useMemo`'s dependency array (the array starting with `[ state,` and ending `clearSyncError, ]`). Add `resync,` to it:

```ts
      syncError,
      clearSyncError,
      resync,
    ],
```

(`resync` is already defined above as a stable `useCallback`.)

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors (≤ baseline).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds; the route `/api/recurring/apply` appears in the route list.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/recurring/apply/route.ts src/context/nudge-budget-context.tsx
git commit -m "feat(recurring): POST /api/recurring/apply backfill + context refresh()"
```

---

## Task 3: Add-recurring dialog + Recurring tab layout

Move the add-form into a dialog opened from a header button, add the "Add to this period" button, and show the start/end timing label on each row.

**Files:**
- Create: `src/components/nudge/add-recurring-dialog.tsx`
- Modify: `src/components/nudge/recurring-tab.tsx`

- [ ] **Step 1: Create the add-recurring dialog**

Create `src/components/nudge/add-recurring-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button, Callout, Dialog, RadioGroup, Select, Text, TextField } from "frosted-ui";
import { useCurrency } from "@/context/currency-context";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";
import type { RecurringTiming } from "@/lib/budget/recurring";

type RecurringType = "income" | "expense";
const NO_CATEGORY = "__none__";

export function AddRecurringDialog(props: { trigger: React.ReactNode; onAdded: () => void }) {
  const { state, whopUserToken } = useNudgeBudget();
  const c = useCurrency();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RecurringType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [note, setNote] = useState("");
  const [timing, setTiming] = useState<RecurringTiming>("start");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function reset() {
    setType("expense");
    setAmount("");
    setCategoryId(NO_CATEGORY);
    setNote("");
    setTiming("start");
    setFormError(null);
  }

  async function submit() {
    setFormError(null);
    const amt = c.parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    const body: {
      type: RecurringType;
      amount: number;
      timing: RecurringTiming;
      categoryId?: string;
      note?: string;
    } = { type, amount: amt, timing };
    if (type === "expense" && categoryId !== NO_CATEGORY) body.categoryId = categoryId;
    if (note.trim()) body.note = note.trim();

    setSubmitting(true);
    try {
      const res = await fetch(
        "/api/recurring",
        nudgeBudgetFetchInit(whopUserToken, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      const json = (await res.json().catch(() => ({}))) as { item?: unknown; error?: string };
      if (!res.ok || !json.item) {
        setFormError(json.error || "Could not add recurring item.");
        return;
      }
      reset();
      setOpen(false);
      props.onAdded();
    } catch {
      setFormError("Could not add recurring item.");
    } finally {
      setSubmitting(false);
    }
  }

  const showCategory = type === "expense";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger>{props.trigger}</Dialog.Trigger>
      <Dialog.Content
        size="3"
        className="max-h-[calc(100dvh-2rem)] max-w-[min(calc(100vw-1.5rem),24rem)] overflow-y-auto overscroll-contain sm:max-w-md"
      >
        <Dialog.Title>Add recurring item</Dialog.Title>
        <Dialog.Description size="2" color="gray" className="leading-relaxed">
          Income or bills added automatically each period.
        </Dialog.Description>

        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="mt-6 flex flex-col gap-5">
            {formError ? (
              <Callout.Root color="red" size="1">
                <Callout.Text>{formError}</Callout.Text>
              </Callout.Root>
            ) : null}

            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                Type
              </Text>
              <Select.Root value={type} onValueChange={(v) => setType(v as RecurringType)}>
                <Select.Trigger placeholder="Choose type" aria-label="Recurring item type" className="min-h-11 w-full" />
                <Select.Content>
                  <Select.Item value="expense">Expense</Select.Item>
                  <Select.Item value="income">Income</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>

            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                Amount
              </Text>
              <TextField.Root className="nudge-field w-full">
                <TextField.Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={c.currencyCode === "JPY" ? "1" : "any"}
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder={c.currencyCode === "JPY" ? "0" : "0.00"}
                  value={amount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
                />
              </TextField.Root>
            </div>

            {showCategory && state.categories.length > 0 ? (
              <div>
                <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                  Category <span className="font-normal text-gray-500">(optional)</span>
                </Text>
                <Select.Root value={categoryId} onValueChange={setCategoryId}>
                  <Select.Trigger placeholder="No category" aria-label="Recurring item category" className="min-h-11 w-full" />
                  <Select.Content>
                    <Select.Item value={NO_CATEGORY}>No category</Select.Item>
                    {state.categories.map((cat) => (
                      <Select.Item key={cat.id} value={cat.id}>
                        {cat.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </div>
            ) : null}

            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                When
              </Text>
              <RadioGroup.Root value={timing} onValueChange={(v) => setTiming(v as RecurringTiming)}>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4">
                    <RadioGroup.Item value="start" />
                    <Text size="2">Start of period</Text>
                  </label>
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-600/15 bg-gray-900/3 px-3 py-2.5 dark:bg-white/4">
                    <RadioGroup.Item value="end" />
                    <Text size="2">End of period</Text>
                  </label>
                </div>
              </RadioGroup.Root>
            </div>

            <div>
              <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
                Note <span className="font-normal text-gray-500">(optional)</span>
              </Text>
              <TextField.Root className="nudge-field w-full">
                <TextField.Input
                  placeholder="e.g. rent, salary"
                  autoComplete="off"
                  value={note}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
                />
              </TextField.Root>
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray" size="3" className="w-full sm:w-auto">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="submit" size="3" color="gold" disabled={submitting} className="w-full shadow-sm sm:w-auto">
              {submitting ? "Adding…" : "Add recurring item"}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Rewrite the Recurring tab**

Replace the **entire** contents of `src/components/nudge/recurring-tab.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Callout, Switch, Text } from "frosted-ui";
import { NudgeListSkeleton } from "@/components/nudge/content-skeleton";
import { ConfirmButton } from "@/components/nudge/confirm-button";
import { AddRecurringDialog } from "@/components/nudge/add-recurring-dialog";
import { useCurrency } from "@/context/currency-context";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";

type RecurringType = "income" | "expense";
type RecurringTiming = "start" | "end";

type RecurringItem = {
  id: string;
  type: RecurringType;
  amount: number;
  categoryId: string | null;
  goalId: string | null;
  note: string | null;
  timing: RecurringTiming;
  ownerUserId: string | null;
  active: boolean;
};

function ItemRow(props: {
  item: RecurringItem;
  categoryName: string | null;
  busy: boolean;
  onToggleActive: (id: string, active: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const c = useCurrency();
  const { item } = props;
  const timingLabel = item.timing === "end" ? "Period end" : "Period start";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-600/15 bg-gray-900/3 p-4 dark:bg-white/4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge color={item.type === "income" ? "gold" : "gray"} variant="soft">
            {item.type === "income" ? "Income" : "Expense"}
          </Badge>
          <Text size="2" color="gray">
            {timingLabel}
          </Text>
          {props.categoryName ? (
            <Text size="2" color="gray" className="truncate">
              {props.categoryName}
            </Text>
          ) : null}
        </div>
        {item.note ? (
          <p className="text-sm wrap-break-word text-foreground/80 line-clamp-3">{item.note}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-3 sm:items-end">
        <p className="text-right text-lg font-bold tabular-nums tracking-tight">
          {c.formatAmount(item.amount)}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <Switch
              size="2"
              color="gold"
              checked={item.active}
              disabled={props.busy}
              onCheckedChange={(v) => props.onToggleActive(item.id, v)}
            />
            <Text size="1" color="gray">
              {item.active ? "Active" : "Paused"}
            </Text>
          </label>
          <ConfirmButton
            title="Remove recurring item?"
            description="This stops it from being added to future periods."
            confirmLabel="Remove"
            onConfirm={() => props.onRemove(item.id)}
            trigger={
              <Button type="button" variant="soft" color="red" size="2" disabled={props.busy}>
                Remove
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}

export function RecurringTab() {
  const { state, whopUserToken, refresh } = useNudgeBudget();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const categoryName = useMemo(() => {
    const map = new Map(state.categories.map((cat) => [cat.id, cat.name]));
    return (id: string | null) => (id ? map.get(id) ?? null : null);
  }, [state.categories]);

  const authedFetch = useCallback(
    (url: string, init?: RequestInit) =>
      fetch(url, nudgeBudgetFetchInit(whopUserToken, { credentials: "include", ...init })),
    [whopUserToken],
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authedFetch("/api/recurring");
      const json = (await res.json().catch(() => ({}))) as {
        items?: RecurringItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Could not load recurring items.");
      setItems(json.items ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load recurring items.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  // Load on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    setActionError(null);
    // Optimistic flip for responsiveness; reverted on failure.
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, active } : it)));
    try {
      const res = await authedFetch("/api/recurring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, active: !active } : it)));
        setActionError(json.error || "Could not update item.");
      }
    } catch {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, active: !active } : it)));
      setActionError("Could not update item.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await authedFetch(`/api/recurring?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setActionError(json.error || "Could not remove item.");
        return;
      }
      await refetch();
    } catch {
      setActionError("Could not remove item.");
    } finally {
      setBusyId(null);
    }
  }

  async function applyToPeriod() {
    setApplying(true);
    setApplyMsg(null);
    setActionError(null);
    try {
      const res = await authedFetch("/api/recurring/apply", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { added?: number; error?: string };
      if (!res.ok) {
        setActionError(json.error || "Could not apply recurring items.");
        return;
      }
      const n = json.added ?? 0;
      setApplyMsg(n > 0 ? `Added ${n} item${n === 1 ? "" : "s"} to this period.` : "Already up to date.");
      if (n > 0) await refresh();
    } catch {
      setActionError("Could not apply recurring items.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ───── Header ───── */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">
            <span className="eyebrow-gold">N°03</span>
            <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>
              —
            </span>
            Recurring
          </span>
          <h2
            className="heading-display mt-3"
            style={{ color: "var(--ink)", fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)", lineHeight: 1.1 }}
          >
            Recurring
          </h2>
          <p className="mt-2 max-w-prose" style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.55 }}>
            Income and bills that are added automatically to each new budget period.
          </p>
        </div>
        {state.editable ? (
          <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto">
            <Button
              type="button"
              variant="soft"
              color="gray"
              size="3"
              disabled={applying}
              className="w-full sm:w-auto"
              onClick={() => void applyToPeriod()}
            >
              {applying ? "Adding…" : "Add to this period"}
            </Button>
            <AddRecurringDialog
              onAdded={() => void refetch()}
              trigger={
                <button type="button" className="atelier-btn-gold w-full sm:w-auto" aria-label="Add recurring item">
                  <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
                    ✦
                  </span>
                  Add item
                </button>
              }
            />
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-7">
        {loadError ? (
          <Callout.Root color="red" size="1">
            <Callout.Text>{loadError}</Callout.Text>
          </Callout.Root>
        ) : null}
        {applyMsg ? (
          <Callout.Root color="gray" size="1">
            <Callout.Text>{applyMsg}</Callout.Text>
          </Callout.Root>
        ) : null}
        {actionError ? (
          <Callout.Root color="red" size="1">
            <Callout.Text>{actionError}</Callout.Text>
          </Callout.Root>
        ) : null}

        {loading ? (
          <NudgeListSkeleton rows={3} />
        ) : (
          <section className="flex flex-col gap-3">
            <Text size="2" weight="medium" className="block text-foreground/80">
              Your recurring items
            </Text>
            {items.length > 0 ? (
              items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  categoryName={categoryName(item.categoryId)}
                  busy={busyId === item.id}
                  onToggleActive={(id, active) => void toggleActive(id, active)}
                  onRemove={(id) => void removeItem(id)}
                />
              ))
            ) : (
              <Text size="2" color="gray" className="leading-relaxed">
                No recurring items yet. Tap “Add item” to create one.
              </Text>
            )}
          </section>
        )}

        <Text size="1" color="gray" className="leading-relaxed">
          New items are added to future periods automatically. To pull them into the current period now, tap “Add to this period”.
        </Text>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors. (If lint flags an unused import, remove it — the rewrite above only imports what it uses.)

- [ ] **Step 4: Manual verification**

Start the app (`npm run dev`), open the Recurring tab on the current period:
- The header shows **Add to this period** and **Add item**; the list is at the top — no scrolling to reach an add-form.
- **Add item** opens a dialog; adding an item with timing Start/End closes the dialog and the new row appears with "Period start"/"Period end".
- A past period (via the period selector) hides both header buttons.

- [ ] **Step 5: Commit**

```bash
git add src/components/nudge/add-recurring-dialog.tsx src/components/nudge/recurring-tab.tsx
git commit -m "feat(recurring): dialog-based add + 'Add to this period' button + timing label"
```

---

## Task 4: "Make recurring" in the Edit-transaction dialog

Add a one-way "Make recurring" action to `EditTransactionDialog`, shown only for income/expense entries.

**Files:**
- Modify: `src/components/nudge/add-transaction-dialog.tsx`

- [ ] **Step 1: Add recurring-status state to `EditTransactionDialog`**

In `src/components/nudge/add-transaction-dialog.tsx`, inside `EditTransactionDialog`, find:

```ts
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const fetchedDebtOptions = useDebtOptions(props.open, whopUserToken);
```

Insert a new state line between them:

```ts
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recurringStatus, setRecurringStatus] = useState<"idle" | "saving" | "done">("idle");
  const fetchedDebtOptions = useDebtOptions(props.open, whopUserToken);
```

- [ ] **Step 2: Reset the status when the dialog opens**

Find the open-effect that begins:

```ts
  useEffect(() => {
    if (!props.open || !tx) return;
    const fb = state.categories[0]?.id ?? "";
    setAmount(String(tx.amount));
    setAmountError(null);
    setNote(tx.note);
```

Add `setRecurringStatus("idle");` right after `setAmountError(null);`:

```ts
    setAmount(String(tx.amount));
    setAmountError(null);
    setRecurringStatus("idle");
    setNote(tx.note);
```

- [ ] **Step 3: Add the `makeRecurring` handler**

In `EditTransactionDialog`, directly above its `function submit() {`, add:

```ts
  async function makeRecurring() {
    const amt = c.parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setAmountError("Enter a valid amount");
      return;
    }
    const body: {
      type: "income" | "expense";
      amount: number;
      timing: "start";
      categoryId?: string;
      note?: string;
    } = {
      type: entryType === "income" ? "income" : "expense",
      amount: amt,
      timing: "start",
    };
    if (entryType === "expense" && categoryId) body.categoryId = categoryId;
    if (note.trim()) body.note = note.trim();

    setRecurringStatus("saving");
    try {
      const res = await fetch(
        "/api/recurring",
        nudgeBudgetFetchInit(whopUserToken, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      setRecurringStatus(res.ok ? "done" : "idle");
      if (!res.ok) setAmountError("Could not make this recurring.");
    } catch {
      setRecurringStatus("idle");
      setAmountError("Could not make this recurring.");
    }
  }
```

- [ ] **Step 4: Render the "Make recurring" row**

In `EditTransactionDialog`'s returned JSX, find the `<TxnFormFields ... />` block (the one inside `EditTransactionDialog`'s form) and its closing `/>`. Immediately after that closing `/>`, insert:

```tsx
          {entryType === "income" || entryType === "expense" ? (
            <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-gray-600/15 bg-gray-900/3 p-3 dark:bg-white/4">
              <div className="min-w-0">
                <Text size="2" weight="medium" className="block text-foreground/80">
                  Repeat every period
                </Text>
                <Text size="1" color="gray" className="leading-snug">
                  Adds this as a recurring item at the start of each period.
                </Text>
              </div>
              {recurringStatus === "done" ? (
                <Text size="2" color="green" className="shrink-0">
                  Added to Recurring ✓
                </Text>
              ) : (
                <Button
                  type="button"
                  variant="soft"
                  color="gold"
                  size="2"
                  disabled={recurringStatus === "saving"}
                  className="shrink-0"
                  onClick={() => void makeRecurring()}
                >
                  {recurringStatus === "saving" ? "Adding…" : "Make recurring"}
                </Button>
              )}
            </div>
          ) : null}
```

(`Text`, `Button`, `nudgeBudgetFetchInit`, `c`, and `whopUserToken` are all already imported/in scope in this file.)

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

In the app, on the current period, edit an existing expense → a "Repeat every period" row shows a **Make recurring** button. Click it → it becomes "Added to Recurring ✓". Open the Recurring tab → a matching item exists with "Period start". Editing a Goal or Debt-payment entry shows **no** recurring row.

- [ ] **Step 7: Commit**

```bash
git add src/components/nudge/add-transaction-dialog.tsx
git commit -m "feat(transactions): 'Make recurring' action in the edit dialog"
```

---

## Task 5: Cap the "Recent changes" feed on the Activity page

**Files:**
- Modify: `src/components/nudge/activity-tab.tsx`

- [ ] **Step 1: Wrap the feed in a capped-height scroll container**

In `src/components/nudge/activity-tab.tsx`, find:

```tsx
      {/* ───── Recent changes ───── */}
      <section aria-label="Recent changes" className="atelier-card p-4 sm:p-5">
        <span className="eyebrow mb-3 block">Recent changes</span>
        <ActivityFeed filterUserId={whoFilter === "all" ? undefined : whoFilter} />
      </section>
```

Replace it with:

```tsx
      {/* ───── Recent changes ───── */}
      <section aria-label="Recent changes" className="atelier-card p-4 sm:p-5">
        <span className="eyebrow mb-3 block">Recent changes</span>
        <div className="max-h-56 overflow-y-auto overscroll-contain pr-1">
          <ActivityFeed filterUserId={whoFilter === "all" ? undefined : whoFilter} />
        </div>
      </section>
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

On a workbook with many activity entries, the "Recent changes" box now scrolls internally at ~`max-h-56` and the transaction list below it stays visible without scrolling past a long feed.

- [ ] **Step 4: Commit**

```bash
git add src/components/nudge/activity-tab.tsx
git commit -m "fix(activity): cap Recent changes feed height so transactions stay visible"
```

---

## Task 6: Plan tab — total budgeted vs planned income

Add a pure `totalCategoryBudget` selector (TDD), then render an income-vs-budgeted summary.

**Files:**
- Modify: `src/lib/budget/selectors.ts`
- Test: `src/lib/budget/selectors.test.ts`
- Modify: `src/components/nudge/budgets-tab.tsx`

- [ ] **Step 1: Write the failing test**

In `src/lib/budget/selectors.test.ts`, change the import line:

```ts
import { safeToSpendToday } from "./selectors";
```

to:

```ts
import { safeToSpendToday, totalCategoryBudget } from "./selectors";
```

Then append these tests to the end of the file:

```ts
test("totalCategoryBudget sums category caps", () => {
  expect(
    totalCategoryBudget([
      { budgetLimit: 200 },
      { budgetLimit: 50.5 },
      { budgetLimit: 0 },
    ]),
  ).toBe(250.5);
});

test("totalCategoryBudget ignores non-finite caps and returns 0 for empty", () => {
  expect(totalCategoryBudget([])).toBe(0);
  expect(totalCategoryBudget([{ budgetLimit: Number.NaN }, { budgetLimit: 100 }])).toBe(100);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/budget/selectors.test.ts`
Expected: FAIL — `totalCategoryBudget` is not exported.

- [ ] **Step 3: Add the selector**

In `src/lib/budget/selectors.ts`, find:

```ts
export function totalPlannedIncome(s: Pick<BudgetState, "memberIncomes">): number {
  return s.memberIncomes.reduce((sum, i) => sum + i.plannedAmount, 0);
}
```

Add directly after it:

```ts
/** Sum of all category monthly caps (planned spending). */
export function totalCategoryBudget(categories: Pick<Category, "budgetLimit">[]): number {
  return categories.reduce(
    (s, c) => s + (Number.isFinite(c.budgetLimit) ? c.budgetLimit : 0),
    0,
  );
}
```

(`Category` is already imported at the top of `selectors.ts`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/budget/selectors.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Use the selector in the Plan tab**

In `src/components/nudge/budgets-tab.tsx`, add `totalCategoryBudget` to the selectors import. Find:

```ts
import {
  categorySpendInPeriod,
  memberLabel,
  sumExpenses,
  totalPlannedIncome,
  transactionsInPeriod,
} from "@/lib/budget/selectors";
```

Replace with:

```ts
import {
  categorySpendInPeriod,
  memberLabel,
  sumExpenses,
  totalCategoryBudget,
  totalPlannedIncome,
  transactionsInPeriod,
} from "@/lib/budget/selectors";
```

- [ ] **Step 6: Compute the summary values**

In `budgets-tab.tsx`, find:

```ts
  const totalBudget = state.categories.reduce((s, cat) => s + cat.budgetLimit, 0);
  const budgetUsedRatio =
    totalBudget > 0 ? Math.min(1, spent / totalBudget) : spent > 0 ? 1 : 0;
```

Replace with:

```ts
  const totalBudget = totalCategoryBudget(state.categories);
  const budgetUsedRatio =
    totalBudget > 0 ? Math.min(1, spent / totalBudget) : spent > 0 ? 1 : 0;
  const unallocated = householdTotal - totalBudget;
```

- [ ] **Step 7: Render the budgeted-vs-income summary**

In `budgets-tab.tsx`, find the "Budget usage" block:

```tsx
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="eyebrow">Budget usage</span>
            <span
              className="tabular"
              style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}
            >
              {Math.round(budgetUsedRatio * 100)}% of category limits
            </span>
          </div>
          <Progress value={budgetUsedRatio * 100} color="gold" />
        </div>
```

Insert this block immediately **before** it (so the figures sit above the usage bar):

```tsx
        <div
          className="mt-6 flex flex-col gap-2 pt-4"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <span className="eyebrow">Planned income</span>
            <span className="tabular" style={{ color: "var(--ink-soft)", fontSize: "0.95rem" }}>
              {fmt(householdTotal)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="eyebrow">Total budgeted</span>
            <span className="tabular" style={{ color: "var(--ink-soft)", fontSize: "0.95rem" }}>
              {fmt(totalBudget)}
            </span>
          </div>
          <div
            className="flex items-baseline justify-between gap-4 pt-2"
            style={{ borderTop: "1px solid var(--hairline)" }}
          >
            <span className="eyebrow">{unallocated >= 0 ? "Unallocated" : "Over budget"}</span>
            <span
              className="heading-display tabular"
              style={{
                color: unallocated >= 0 ? "var(--ink)" : "var(--tone-overdue)",
                fontSize: "1.05rem",
                lineHeight: 1.2,
              }}
            >
              {unallocated >= 0 ? fmt(unallocated) : `Over by ${fmt(Math.abs(unallocated))}`}
            </span>
          </div>
        </div>
```

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 9: Manual verification**

On the Plan tab: the income-plan card shows **Planned income**, **Total budgeted**, and **Unallocated**. Raise category caps above income → the last line flips to **"Over by …"** in the overdue/red tone. Works in both solo and shared (2+ member) layouts.

- [ ] **Step 10: Commit**

```bash
git add src/lib/budget/selectors.ts src/lib/budget/selectors.test.ts src/components/nudge/budgets-tab.tsx
git commit -m "feat(plan): show total budgeted vs planned income with over-budget state"
```

---

## Task 7: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test`
Expected: all tests pass (including `recurring.test.ts` and the new `selectors.test.ts` cases).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors (≤ baseline).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds; `/api/recurring/apply` is listed among the routes.

- [ ] **Step 5: End-to-end manual smoke (the original pain point)**

In the running app, on the current period:
1. Add a recurring expense (it does **not** appear as a transaction yet — by design).
2. Tap **Add to this period** → message "Added 1 item to this period."; the expense now appears under Activity/Dashboard.
3. Tap **Add to this period** again → "Already up to date." (no duplicate created).
4. Toggle an item to **End of period**, tap Add to this period in a fresh period (or next rollover) → it files on the last day of the period.

- [ ] **Step 6: Commit (only if any verification fix was needed)**

```bash
git add -A
git commit -m "chore(recurring): verification fixes"
```

---

## Spec coverage check

- §1 Start/end timing → **Task 1** (model + helpers), surfaced in **Task 3** (dialog control + row label).
- §2 "Add to this period" + count + `refresh()` → **Task 2** (endpoint, `materializeRecurring` count, context) + **Task 3** (button).
- §3 Recurring layout (dialog from top button) → **Task 3**.
- §4 Activity feed capped height → **Task 5**.
- §5 "Make recurring" simple action → **Task 4**.
- §6 Plan total vs income → **Task 6**.
- No-migration storage (sentinel) → **Task 1**. No `db push` step anywhere → consistent with the spec's non-goals.
