# Workstream B — Budget Periods & History UI Implementation Plan

> Implement task-by-task with TDD where logic is pure. Depends on merged Foundation + A.

**Goal:** Surface budget periods in the UI: a period selector to view the current period or any past period (past = read-only), and a setting to configure the anchor day (e.g. 25th). The period data model, snapshot rollover, and read-only mutation guards already exist in Foundation.

**Branch:** `feat/budget-periods-ui` (off `main`).

**Foundation facts:**
- `nudge_periods` + `ensureCurrentPeriod(workbookId, anchorDay, todayIso)` + `listPeriods(workbookId)` from `@/lib/budget/period-repo`.
- `GET /api/budget-state?periodId=` returns `{state: BudgetState}` where `BudgetState` has `period: {id,startDate,endDate,label}`, `editable: boolean`, `periodAnchorDay: number`.
- Context (`useNudgeBudget()`) already exposes `state`, `selectPeriod(periodId|null)`, `whopUserToken`, `currentUserId`, and guards every mutation when `!state.editable`.
- `resolveMutationContext()` → `{userId, workbookId}`; `getSupabaseAdmin()`; `isSupabasePersistenceEnabled()`.
- `nudge_workbooks.period_anchor_day smallint` column exists. `clampAnchorDay` in `@/lib/budget/period-math`.

---

## Task B1: Periods list + workbook-settings routes

**Files:** Create `src/app/api/periods/route.ts`, `src/app/api/workbook/route.ts`.

- [ ] **Step 1 — `src/app/api/periods/route.ts`** (GET list + ensure current):
```ts
import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureCurrentPeriod, listPeriods } from "@/lib/budget/period-repo";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  const { data: wb } = await supabase.from("nudge_workbooks").select("period_anchor_day").eq("id", ctx.workbookId).single();
  const today = new Date().toISOString().slice(0, 10);
  const current = await ensureCurrentPeriod(ctx.workbookId, Number(wb?.period_anchor_day ?? 1), today);
  const periods = await listPeriods(ctx.workbookId);
  return NextResponse.json({ periods, currentPeriodId: current.id, periodAnchorDay: Number(wb?.period_anchor_day ?? 1) });
}
```
- [ ] **Step 2 — `src/app/api/workbook/route.ts`** (PATCH anchor day):
```ts
import { NextResponse } from "next/server";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clampAnchorDay } from "@/lib/budget/period-math";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const ctx = await resolveMutationContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.periodAnchorDay === undefined) return NextResponse.json({ error: "periodAnchorDay required" }, { status: 400 });
  const day = clampAnchorDay(Number(body.periodAnchorDay));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_workbooks").update({ period_anchor_day: day }).eq("id", ctx.workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, periodAnchorDay: day });
}
```
- [ ] **Step 3 — verify** `npx tsc --noEmit` clean for new files. **Commit:** `feat(api): periods list + workbook anchor-day routes`.

---

## Task B2: Context — periods list, selection, anchor day

**Files:** Modify `src/context/nudge-budget-context.tsx`.

- [ ] **Step 1 — Read the file.** It exposes `selectPeriod`. Add new context fields/methods (ADD ONLY — do not change existing methods):
  - `periods: Period[]` (state, initialized `[]`).
  - `selectedPeriodId: string | null` (the currently-viewed period; defaults to `props.remote.snapshot.period.id`).
  - `currentPeriodId: string | null` (the editable/current one; defaults to the same on init).
  - `loadPeriods: () => Promise<void>` — `GET /api/periods`, set `periods`, `currentPeriodId`, and `periodAnchorDay` (store anchor in a new `periodAnchorDay` field or reuse `state.periodAnchorDay`).
  - `setPeriodAnchorDay: (day: number) => Promise<void>` — `PATCH /api/workbook {periodAnchorDay}`, then `await loadPeriods()` and `await selectPeriod(null)` (reload current period so a changed cycle reflects).
  - Update `selectPeriod(periodId)` to also set `selectedPeriodId` to the resolved period id (use the returned state's `period.id`, or the requested id).
- [ ] **Step 2 — On mount**, call `loadPeriods()` once (an effect guarded so it runs a single time) so the selector is populated. Import `useEffect` if needed.
- [ ] **Step 3 — Add the new fields to `NudgeBudgetContextValue` type and the `useMemo` value + deps.**
- [ ] **Step 4 — `npx tsc --noEmit && npm run build`** pass. **Commit:** `feat(context): periods list + selection + anchor day`.

---

## Task B3: Period selector + anchor-day setting + read-only UI

**Files:** Create `src/components/nudge/period-selector.tsx`. Modify `src/components/nudge/nudge-app.tsx` (place the selector in the editorial strip / top bar) and `src/components/nudge/budgets-tab.tsx` (anchor-day setting + disable income input when `!state.editable`).

- [ ] **Step 1 — Read** `src/components/nudge/nudge-app.tsx` (the desktop editorial strip around the "Edition N°/date" line and the mobile masthead) and `src/components/nudge/budgets-tab.tsx`, and `docs/nudge-ui-standards.md`. Match frosted-ui `Select` usage (see `HeaderCurrencySelect` in nudge-app.tsx for the pattern).
- [ ] **Step 2 — Build `PeriodSelector`** (client). Uses `useNudgeBudget()`:
  - A frosted-ui `Select` listing `periods` (label each with its `label` or `startDate – endDate`); the value is `selectedPeriodId`. On change, call `selectPeriod(id)` (or `selectPeriod(null)` when the chosen id equals `currentPeriodId`, to reload the live current period).
  - When `selectedPeriodId !== currentPeriodId` (viewing the past), render a small read-only chip/badge next to it: "Viewing past period — read-only" (use the `atelier-chip` style seen in nudge-app.tsx, tone neutral). Include a "Back to current" affordance that calls `selectPeriod(null)`.
- [ ] **Step 3 — Place the selector** in `nudge-app.tsx`: in the desktop editorial strip (the `hidden ... sm:flex` block with Edition/date) add the `<PeriodSelector />`, and in the mobile masthead near `HeaderCurrencySelect`. Additive only; keep existing markup.
- [ ] **Step 4 — Anchor-day setting** in `budgets-tab.tsx`: add a small control (frosted-ui `Select` of days 1–28 plus "Last day" mapping to 31, OR a numeric `TextField` 1–31) bound to the anchor day; on change call `setPeriodAnchorDay(day)`. Label it clearly ("Budget cycle starts on day"). Also: **disable the income input and any edit controls in this tab when `!state.editable`** (past period) and show a subtle "read-only" hint. Keep changes minimal and additive.
- [ ] **Step 5 — `npx tsc --noEmit && npm run build`** pass. **Commit:** `feat(ui): period selector, history view, anchor-day setting`.

---

## Task B4: Validate & merge

- [ ] **Step 1 —** `npm run test` (existing suites green), `npx tsc --noEmit`, `npm run build`, and `npm run lint` must show NO new errors beyond the main baseline of 13 problems (9 errors). If a new `set-state-in-effect` appears from a load-on-mount effect, add a scoped `// eslint-disable-next-line react-hooks/set-state-in-effect` with a comment (consistent with the app).
- [ ] **Step 2 —** No migration needed (anchor-day column + periods tables exist). If schema changed, STOP.
- [ ] **Step 3 — merge:** `git checkout main && git merge --no-ff feat/budget-periods-ui && git push origin main`.

## Self-review (B)
- Spec §4 (anchor-day config) → B1 `PATCH /api/workbook` + B3 setting. ✓
- Spec §8 (view past periods, read-only) → B1 `GET /api/periods` + B2 selection + B3 selector + read-only disabling. ✓
- Reuses Foundation's `editable` guard; no new period math. ✓
