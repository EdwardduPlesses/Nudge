# Workstream D — Recurring / Scheduled Items

> Implement task-by-task. Depends on merged Foundation + A + B + C.

**Goal:** Let users define recurring income/expense items (e.g. salary, rent, subscriptions) that are auto-materialized as transactions when a new budget period rolls over. Plus a UI to manage them.

**Branch:** `feat/recurring-items` (off `main`).

**Foundation facts:**
- `nudge_recurring_items(id text pk, workbook_id, type[income|expense], amount, category_id text, goal_id text, note, day_of_period smallint, owner_user_id, active bool, created_at)` exists.
- `nudge_transactions` PK is composite `(workbook_id, id)`; columns include `period_id, date, amount, type, category_id, goal_id, debt_id, note, created_by`.
- `ensureCurrentPeriod(workbookId, anchorDay, todayIso)` in `src/lib/budget/period-repo.ts` creates new periods in a loop (only when the target period doesn't already exist) and calls `copySnapshot` for each created period.
- `resolveMutationContext()` → `{userId, workbookId}`; `logActivity` from `@/lib/budget/activity`.

---

## Task D1: Recurring module + route + materialization

**Files:** Create `src/lib/budget/recurring.ts`, `src/app/api/recurring/route.ts`; modify `src/lib/budget/period-repo.ts`.

- [ ] **Step 1 — create `src/lib/budget/recurring.ts`:**
```ts
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface RecurringItem {
  id: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string | null;
  goalId: string | null;
  note: string;
  dayOfPeriod: number | null;
  ownerUserId: string;
  active: boolean;
}

function mapRow(r: Record<string, unknown>): RecurringItem {
  return {
    id: r.id as string,
    type: r.type === "income" ? "income" : "expense",
    amount: Number(r.amount) || 0,
    categoryId: (r.category_id as string) ?? null,
    goalId: (r.goal_id as string) ?? null,
    note: (r.note as string) ?? "",
    dayOfPeriod: r.day_of_period == null ? null : Number(r.day_of_period),
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

function addDaysIso(startIso: string, days: number): string {
  const [y, m, d] = startIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Materialize a workbook's active recurring items as transactions in `period`.
 * Idempotent: each materialized transaction id is derived from the recurring id +
 * period start, upserted with onConflict do-nothing, so re-running does not duplicate.
 */
export async function materializeRecurring(
  workbookId: string,
  period: { id: string; startDate: string; endDate: string },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_recurring_items")
    .select("*")
    .eq("workbook_id", workbookId)
    .eq("active", true);
  if (error) throw error;
  const items = (data ?? []).map(mapRow);
  if (items.length === 0) return;

  const rows = items.map((it) => {
    const offset = it.dayOfPeriod && it.dayOfPeriod > 1 ? it.dayOfPeriod - 1 : 0;
    let date = addDaysIso(period.startDate, offset);
    if (date > period.endDate) date = period.endDate;
    return {
      id: `rec_${it.id}_${period.startDate}`,
      workbook_id: workbookId,
      period_id: period.id,
      date,
      amount: it.amount,
      type: it.type,
      category_id: it.categoryId,
      goal_id: it.goalId,
      note: it.note || "Recurring",
      created_by: it.ownerUserId,
    };
  });
  // Composite PK is (workbook_id, id); ignore duplicates so this is idempotent.
  await supabase.from("nudge_transactions").upsert(rows, { onConflict: "workbook_id,id", ignoreDuplicates: true });
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
      note: String(body.note ?? ""),
      day_of_period: body.dayOfPeriod ?? null,
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
  if (body.note !== undefined) patch.note = String(body.note);
  if (body.dayOfPeriod !== undefined) patch.day_of_period = body.dayOfPeriod;
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
- [ ] **Step 2 — `src/app/api/recurring/route.ts`** (GET/POST/PATCH/DELETE), pattern identical to the other per-item routes (use `resolveMutationContext`, `isSupabasePersistenceEnabled`, and `logActivity(workbookId, userId, action, "recurring", id, summary)` after success). GET returns `{items: listRecurring(workbookId)}`. POST → `createRecurring(workbookId, userId, body)` returns `{item}`. PATCH `{id, ...}` → updateRecurring. DELETE `?id=` → deleteRecurring.
- [ ] **Step 3 — wire materialization** in `src/lib/budget/period-repo.ts`: import `materializeRecurring` from `./recurring`. In `ensureCurrentPeriod`, after a period is created in the loop (right after `if (snapshotFrom) await copySnapshot(...)`), call `await materializeRecurring(workbookId, { id: created.id, startDate: created.startDate, endDate: created.endDate });`. Also handle the `if (!last)` fallback path (materialize that period too). Do NOT materialize when a period already existed (the early-return path) — that preserves idempotency and avoids creating recurring tx on every load.
- [ ] **Step 4 — verify** `npx tsc --noEmit` clean; build passes. **Commit:** `feat(recurring): recurring items module, route, and period materialization`.

> NOTE: materialization runs server-side during `ensureCurrentPeriod`. Because it is keyed by `rec_<id>_<periodStart>` and upserts with ignoreDuplicates, repeated calls are safe. Editing a recurring item only affects FUTURE periods (already-materialized transactions are untouched) — document this in the commit body.

---

## Task D2: Recurring management UI

**Files:** Create `src/components/nudge/recurring-dialog.tsx`; modify `src/components/nudge/budgets-tab.tsx` (a "Recurring items" button opening the dialog).

- [ ] **Step 1 — READ** `src/components/nudge/sharing-dialog.tsx` (for the fetch+dialog pattern with `nudgeBudgetFetchInit`/`useNudgeBudget`), `src/components/nudge/add-transaction-dialog.tsx` (form controls), and `docs/nudge-ui-standards.md`.
- [ ] **Step 2 — `RecurringDialog`** (parent-controlled `open`/`onOpenChange`): on open `GET /api/recurring`; list items (type, amount via `useCurrency().formatFromUsd`, note, day-of-period, category if any, an active toggle); a form to add a new item (type select, amount, optional category select from `state.categories`, optional note, day-of-period number 1–28); edit/delete per row (PATCH/DELETE). Use `nudgeBudgetFetchInit(whopUserToken, …)`. After any change, refetch. Show a hint: "Recurring items are added automatically at the start of each new budget period." Handle `{error}` responses. If a load-on-mount effect trips `set-state-in-effect`, scope-disable with a comment.
- [ ] **Step 3 — entry point** in `budgets-tab.tsx`: a "Recurring items" button (frosted-ui `Button`, soft) near the categories/settings area opening the dialog via local `useState`. Disable it when `!state.editable`? No — recurring items are workbook-level (not period-specific), so allow managing them regardless of the viewed period. Additive only.
- [ ] **Step 4 — verify** `npx tsc --noEmit && npm run build`; lint ≤ baseline. **Commit:** `feat(ui): recurring items management dialog`.

---

## Task D3: Validate & merge
- [ ] `npm run test`, `npx tsc --noEmit`, `npm run build`, `npm run lint` (≤ 13). No migration (table exists).
- [ ] **merge:** `git checkout main && git merge --no-ff feat/recurring-items && git push origin main`.

## Self-review (D)
- Recurring income/expense defined + auto-materialized on rollover (idempotent) → D1. ✓
- Edit affects future periods only → derived from materialize-on-create semantics. ✓
- Management UI → D2. ✓
