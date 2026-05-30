# Nudge — recurring payments + layout improvements

Status: design draft
Date: 2026-05-30

## Goal

Make recurring payments practical to use and fix two screens where a growing list buries
the thing you came to do. Six changes, all in the recurring / budget UI:

1. Recurring items fire **only at period start or end** (drop the free 1–28 day).
2. An **"Add to this period"** button backfills recurring items into a period that already
   started (the main pain point: items added mid-period currently never appear).
3. **Recurring tab layout** — add via a dialog from a top button, so the list stays on top.
4. **Activity page** — cap the "Recent changes" feed height so transactions stay visible.
5. **"Make recurring"** action in the Edit-transaction dialog.
6. **Plan tab** — show total budgeted vs planned income.

## Current behaviour (what we're changing)

- `RecurringItem` (`src/lib/budget/recurring.ts`) carries `dayOfPeriod: number | null`
  (1–28, or `null` = period start). `materializeRecurring` computes a date by offsetting
  `dayOfPeriod - 1` days from `period.startDate`, clamped to `endDate`.
- Materialization runs **only when a period is created** — `ensureCurrentPeriod` and
  `resolvePeriodForDate` in `src/lib/budget/period-repo.ts` call `materializeRecurring`.
  Nothing re-runs it, so an item added after the current period already exists never lands
  in that period. `materializeRecurring` is already **idempotent**: each generated
  transaction id is `rec_<itemId>_<periodStart>`, upserted with
  `onConflict: "workbook_id,id", ignoreDuplicates: true`.
- `src/components/nudge/recurring-tab.tsx` renders the item list first and the add-form at
  the bottom of the page (the scroll problem). The form has a free "Day of period" input.
- `src/components/nudge/activity-tab.tsx` renders the `<ActivityFeed>` ("Recent changes")
  above the transaction list, with no height bound.
- `src/components/nudge/budgets-tab.tsx` already computes
  `totalBudget = sum(category.budgetLimit)` but only feeds it to a progress bar; it's never
  shown as a figure next to income. `householdTotal = totalPlannedIncome(state)` is shown.
- `src/components/nudge/add-transaction-dialog.tsx` has `EditTransactionDialog` using the
  shared `TxnFormFields`; there is no recurring concept.

## 1. Start / end timing

Replace the free day input with a two-option segmented control (`frosted-ui` `RadioGroup`,
matching the dialog's existing radio style): **Start of period** (default) / **End of
period**. Applies in the new add dialog and anywhere timing is shown/edited.

### Storage — no migration

Reuse the existing nullable `nudge_recurring_items.day_of_period` column as a timing flag:

- `null` → **start** (already the current meaning of `null`).
- sentinel `999` → **end** (named constant `FIRES_AT_END = 999`, with a comment).
- Legacy rows with a mid-period day (2–28) **collapse to start** at materialize time.

`recurring.ts` changes:

- `RecurringItem` gains `timing: "start" | "end"` (replaces `dayOfPeriod` in the TS type;
  the DB column stays `day_of_period`).
- `mapRow`: `timing = Number(r.day_of_period) >= 29 ? "end" : "start"`.
- `createRecurring` / `updateRecurring`: write `day_of_period = body.timing === "end" ? 999 : null`.
  Remove `clampDayOfPeriod` (no longer a real day).
- `materializeRecurring`: `const date = it.timing === "end" ? period.endDate : period.startDate;`
  (drops `addDaysIso` offset math; `addDaysIso` can be removed if unused elsewhere).

> Alternative considered: add an explicit `fires_at_end boolean` column (one small additive
> migration). Rejected in favour of the no-migration sentinel because it is legacy-safe and
> the user preferred avoiding migrations. Easy to switch to the column if preferred at review.

## 2. "Add to this period" button (manual trigger)

A button on the Recurring tab header, shown only when the period in view is editable
(current period). Pressing it pulls all **active** recurring items into the current period.

### Endpoint — `POST /api/recurring/apply`

New route `src/app/api/recurring/apply/route.ts` (`dynamic = "force-dynamic"`), mirroring
the existing recurring route's `ctx()` guard:

1. `resolveMutationContext()` → `{ userId, workbookId }` (401 if null; 503 if Supabase off).
2. Read `period_anchor_day` from `nudge_workbooks`; `today = new Date().toISOString().slice(0,10)`.
3. `period = await ensureCurrentPeriod(workbookId, anchorDay, today)` — guarantees the
   current period exists (and rolls forward if needed).
4. `const added = await materializeRecurring(workbookId, period)`.
5. `logActivity(workbookId, userId, "created", "recurring", period.id, "applied recurring items to this period")`.
6. Return `{ added }`.

### `materializeRecurring` returns a count

Change its signature to `Promise<number>`. Add `.select("id")` to the upsert; with
`ignoreDuplicates: true`, PostgREST returns only the **newly inserted** rows, so
`return data?.length ?? 0`. (Verify this returns inserted-only during implementation; it is
the documented supabase behaviour.) Early `return 0` when there are no active items. The
existing callers in `period-repo.ts` ignore the return value (no change needed there).

### Client wiring

- `recurring-tab.tsx`: an "Add to this period" button calls `POST /api/recurring/apply`,
  then refreshes budget state so the new transactions appear on Activity/Dashboard.
- Feedback via the existing inline-callout pattern: **"Added N item(s) to this period."** or
  **"Already up to date."** (when `added === 0`).
- Refresh: expose a small `refresh()` on `NudgeBudgetProvider` that wraps the existing
  private `resync()` (re-fetches `/api/budget-state` for the selected period). Add it to the
  context value/type. The recurring tab calls `refresh()` after a successful apply.
- Per the user's choice, creating a recurring item does **not** auto-apply — the button is
  the only trigger.

## 3. Recurring tab layout — dialog from a top button

- Extract the add-form from `recurring-tab.tsx` into a new `AddRecurringDialog`
  (`src/components/nudge/add-recurring-dialog.tsx`), following the `AddTransactionDialog`
  shape (frosted-ui `Dialog`, `size="3"`, the same `max-h`/scroll classes). It owns the
  form state (type, amount, category, note, timing) and `POST`s to `/api/recurring`, then
  calls `onAdded()` so the tab refetches its list.
- The tab header gets two actions: **+ Add item** (opens the dialog) and **Add to this
  period** (§2), both gated on `state.editable`.
- The page body becomes: header + actions, then the item list (and load/empty/error
  states). The trailing helper text stays.
- `ItemRow` day label changes from `Day N` / `Period start` to **"Period start"** /
  **"Period end"** based on `item.timing`.

## 4. Activity page — capped "Recent changes" feed

In `activity-tab.tsx`, wrap the `<ActivityFeed>` inside the "Recent changes" `section`
(currently lines ~230–233) in a scroll container: `max-h-56 overflow-y-auto overscroll-contain`
(≈3–4 rows), keeping the existing card padding. The transaction list below stays visible
regardless of feed length. No change to `ActivityFeed` itself.

## 5. "Make recurring" in the Edit-transaction dialog

A one-way action (no transaction↔recurring link stored — per the user's choice).

- In `EditTransactionDialog`, below the form, add a "Repeat every period" row with a
  **Make recurring** button (frosted-ui `Button`, soft).
- On click: `POST /api/recurring` with `{ type, amount, categoryId (expense only), note,
  timing: "start" }` derived from the dialog's current values. On success, swap the button
  for an inline **"Added to Recurring ✓"** confirmation and disable it for the rest of that
  dialog session (mitigates accidental double-add; a fresh edit session could add again,
  which is the accepted trade-off of the simple approach).
- Scope: shown only for **income** and **expense** entries. Hidden when `entryType` is
  `goal` or `debt` (recurring items have no debt link, and recurring goal transfers are out
  of scope for v1).
- No duplicate transaction is created now: the transaction already covers the current
  period; future periods pick the template up via §2 / period rollover.

## 6. Plan tab — total budgeted vs planned income

In `budgets-tab.tsx`, in the income-plan card (near the income figure / household total),
add a summary line built from values already in scope:

- **Planned income** = `householdTotal` (`totalPlannedIncome(state)`).
- **Total budgeted** = `totalBudget` (already computed; sum of category caps).
- **Unallocated** = `income − budgeted`; render in the muted/normal tone when ≥ 0, and as
  **"Over by <amount>"** in the red/ruby tone when budgeted exceeds income.

All three use `c.formatAmount`. This sits with the existing "Budget usage" block so the
comparison is immediate. ("Income" here is the **planned** income on this tab — the
apples-to-apples figure when planning.)

## Components & files affected

- `src/lib/budget/recurring.ts` — timing model, `materializeRecurring` returns count.
- `src/app/api/recurring/apply/route.ts` — **new** apply endpoint.
- `src/app/api/recurring/route.ts` — accept/return `timing` instead of `dayOfPeriod`.
- `src/lib/budget/period-repo.ts` — unchanged calls (ignore new return value).
- `src/context/nudge-budget-context.tsx` — expose `refresh()` (wraps `resync()`).
- `src/components/nudge/recurring-tab.tsx` — header actions, list, removes inline form.
- `src/components/nudge/add-recurring-dialog.tsx` — **new** dialog (form + timing control).
- `src/components/nudge/activity-tab.tsx` — capped-height feed container.
- `src/components/nudge/add-transaction-dialog.tsx` — "Make recurring" in `EditTransactionDialog`.
- `src/components/nudge/budgets-tab.tsx` — budgeted-vs-income summary line.

## Non-goals

- No DB migration (reuse `day_of_period`; the `999` sentinel encodes "end").
- No two-way transaction↔recurring link, and no auto-apply on create.
- No recurring support for **debt** or **goal** transactions (income/expense only).
- No mid-period / arbitrary-day timing, weekly/bi-weekly cadence, or per-member recurring.
- "Make recurring" stays in Edit only (not added to the Add-transaction dialog) for v1.

## Testing

- **Unit (`recurring.ts`)**: `mapRow` maps `null`/legacy 2–28 → `start` and `999` → `end`;
  `materializeRecurring` files a `start` item on `period.startDate` and an `end` item on
  `period.endDate`; re-running materialize inserts nothing the second time and returns `0`;
  first run returns the inserted count.
- **Apply endpoint**: with active items, `POST /api/recurring/apply` returns `added > 0`
  the first time and `added === 0` immediately after (idempotent); transactions are filed
  under the current period.
- **Manual**: add a recurring item after the period started → it's absent → press "Add to
  this period" → it appears in Activity; press again → "Already up to date". Toggle an item
  to End → next apply/rollover files it on the last day. "Make recurring" on an edited
  expense creates a matching item on the Recurring tab. Plan tab shows
  income/budgeted/unallocated and flips to "Over by …" when caps exceed income. Activity
  feed scrolls internally without pushing the transaction list down.
- `npx tsc --noEmit`, `npm run build`, `npm run lint` (≤ baseline), `npm run test` green.

## Sequencing

Self-contained; no dependency on other in-flight specs. Recommended build order: §1 (timing
model) → §2 (apply endpoint + count + `refresh()`) → §3 (dialog/layout) → §5 (make
recurring) → §4 (activity cap) → §6 (plan total). §4 and §6 are independent and can be done
any time.
