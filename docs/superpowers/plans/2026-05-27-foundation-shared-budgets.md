# Foundation — Shared Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-user, full-replace budget model with a membership-based,
period-aware, per-item-saved data layer that every later workstream builds on.

**Architecture:** Add a `nudge_workbook_members` access layer and a `nudge_periods`
dimension over the existing Supabase schema (additive migration, no data loss). Reshape
loading to return one period's slice; replace the destructive `PUT /api/budget-state`
with per-item routes that resolve the caller's workbook via membership. Refactor the
React context to call per-item endpoints instead of debounced full PUT. Create extension
seams (tab registry, typed mutation API) so parallel workstreams add features cleanly.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (service role), TypeScript,
Vitest (added here for pure-logic unit tests).

**Branch:** `feat/foundation-shared-budgets`

---

## File structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (create) | Vitest config for `src/**/*.test.ts` (node env) |
| `package.json` (modify) | add `test` script + Vitest devDeps |
| `src/lib/budget/period-math.ts` (create) | pure anchor-day → period range helpers |
| `src/lib/budget/period-math.test.ts` (create) | unit tests for period math |
| `src/lib/budget/types.ts` (modify) | add Member, Period, per-person income, `createdBy` |
| `supabase/migrations/20260527120000_nudge_shared_foundation.sql` (create) | additive schema + backfill |
| `src/lib/budget/workbook-access.ts` (create) | resolve caller → workbook via membership |
| `src/lib/budget/period-repo.ts` (create) | ensure/list periods, snapshot rollover |
| `src/lib/budget/supabase-persistence.ts` (modify) | period-aware fetch; per-item writes |
| `src/app/api/budget-state/route.ts` (modify) | GET one period; remove PUT |
| `src/app/api/transactions/route.ts` (create) | POST/PATCH/DELETE a transaction |
| `src/app/api/categories/route.ts` (create) | POST/PATCH/DELETE a category |
| `src/app/api/period-category-limits/route.ts` (create) | PATCH a per-period limit |
| `src/app/api/period-incomes/route.ts` (create) | PATCH a per-member income |
| `src/app/api/goals/route.ts` (create) | POST/PATCH/DELETE a goal |
| `src/context/nudge-budget-context.tsx` (modify) | per-item mutations; period state |
| `src/components/nudge/nudge-app.tsx` (modify) | add tab registry seam |

---

## Task 1: Add Vitest for pure-logic unit tests

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: `src/lib/budget/smoke.test.ts` (temporary)

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest@^3`
Expected: adds `vitest` to devDependencies, no errors.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 3: Add `test` script to `package.json`**

In the `scripts` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test**

Create `src/lib/budget/smoke.test.ts`:

```ts
import { expect, test } from "vitest";

test("vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run test`
Expected: 1 passed.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
git rm src/lib/budget/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(test): add vitest for unit tests"
```

---

## Task 2: Period math (anchor-day → range)

**Files:**
- Create: `src/lib/budget/period-math.ts`
- Test: `src/lib/budget/period-math.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/budget/period-math.test.ts`:

```ts
import { expect, test } from "vitest";
import { periodRangeFor, clampAnchorDay, nextPeriodStart } from "./period-math";

test("anchor day 1 yields calendar month", () => {
  expect(periodRangeFor("2026-05-15", 1)).toEqual({ start: "2026-05-01", end: "2026-05-31" });
});

test("anchor day 25 spans month boundary", () => {
  expect(periodRangeFor("2026-05-26", 25)).toEqual({ start: "2026-05-25", end: "2026-06-24" });
  expect(periodRangeFor("2026-05-10", 25)).toEqual({ start: "2026-04-25", end: "2026-05-24" });
});

test("anchor day 31 clamps to short months", () => {
  // Feb 2026 has 28 days: anchor 31 -> Feb 28 start, Mar 30 end (day before next clamp Mar 31)
  expect(periodRangeFor("2026-02-15", 31)).toEqual({ start: "2026-01-31", end: "2026-02-27" });
});

test("clampAnchorDay bounds 1..31", () => {
  expect(clampAnchorDay(0)).toBe(1);
  expect(clampAnchorDay(40)).toBe(31);
  expect(clampAnchorDay(25)).toBe(25);
});

test("nextPeriodStart advances one cycle", () => {
  expect(nextPeriodStart("2026-05-25", 25)).toBe("2026-06-25");
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test src/lib/budget/period-math.test.ts`
Expected: FAIL — "Cannot find module './period-math'".

- [ ] **Step 3: Implement `period-math.ts`**

```ts
/** Pure date helpers for anchor-day budget periods. Dates are ISO `YYYY-MM-DD` strings. */

export function clampAnchorDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.trunc(day)));
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function iso(year: number, month0: number, day: number): string {
  const d = Math.min(day, daysInMonth(year, month0));
  const mm = String(month0 + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function addDaysIso(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** The period (start..end inclusive) that contains `dateIso`, given an anchor day. */
export function periodRangeFor(dateIso: string, anchorDay: number): { start: string; end: string } {
  const anchor = clampAnchorDay(anchorDay);
  const [y, m, d] = dateIso.split("-").map(Number);
  const month0 = m - 1;
  const startThisMonth = iso(y, month0, anchor);
  let start: string;
  if (d >= Number(startThisMonth.split("-")[2])) {
    start = startThisMonth;
  } else {
    const prevMonth0 = month0 - 1;
    const py = prevMonth0 < 0 ? y - 1 : y;
    const pm0 = (prevMonth0 + 12) % 12;
    start = iso(py, pm0, anchor);
  }
  const nextStart = nextPeriodStart(start, anchor);
  return { start, end: addDaysIso(nextStart, -1) };
}

/** Start date of the cycle after the one beginning at `startIso`. */
export function nextPeriodStart(startIso: string, anchorDay: number): string {
  const anchor = clampAnchorDay(anchorDay);
  const [y, m] = startIso.split("-").map(Number);
  const month0 = m - 1;
  const nextMonth0 = month0 + 1;
  const ny = nextMonth0 > 11 ? y + 1 : y;
  const nm0 = nextMonth0 % 12;
  return iso(ny, nm0, anchor);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test src/lib/budget/period-math.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget/period-math.ts src/lib/budget/period-math.test.ts
git commit -m "feat(budget): anchor-day period math with tests"
```

---

## Task 3: Extend domain types

**Files:**
- Modify: `src/lib/budget/types.ts`

- [ ] **Step 1: Add new types (append; keep existing exports)**

Append to `src/lib/budget/types.ts`:

```ts
export interface Member {
  whopUserId: string;
  role: "owner" | "member";
  displayName: string | null;
  color: string | null;
}

export interface Period {
  id: string;
  startDate: string;
  endDate: string;
  label: string | null;
}

export interface MemberIncome {
  whopUserId: string;
  plannedAmount: number;
}
```

- [ ] **Step 2: Add `createdBy` to existing record types**

In `Transaction`, `Category`, and `Goal` interfaces, add the field:

```ts
  /** Whop user id of who created it; null for legacy/pre-attribution rows. */
  createdBy: string | null;
```

Also add to `Transaction`:

```ts
  /** Period this transaction belongs to (assigned by date). */
  periodId: string | null;
```

- [ ] **Step 3: Replace `BudgetState` with the period-aware shape**

```ts
export interface BudgetState {
  workbookId: string;
  periodAnchorDay: number;
  members: Member[];
  /** The period this snapshot represents (current or a selected past period). */
  period: Period;
  /** Whether this period is editable (current period) or read-only (past). */
  editable: boolean;
  memberIncomes: MemberIncome[];
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in files that consume the old `BudgetState` (defaults, persistence,
context, components) — those are fixed in later tasks. Note the list; do not fix yet.

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget/types.ts
git commit -m "feat(budget): period-aware domain types"
```

---

## Task 4: Additive Supabase migration + backfill

**Files:**
- Create: `supabase/migrations/20260527120000_nudge_shared_foundation.sql`

> This task only writes SQL and commits it. A human/pipeline runs `npm run db:push`.
> There is no automated DB test; validation is SQL review + a successful `db:push` by the
> operator before any workstream that reads the new tables is merged.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260527120000_nudge_shared_foundation.sql`:

```sql
-- Foundation for shared budgets: membership, periods, per-period income & limits,
-- attribution, and the support tables for later workstreams. Additive + backfill;
-- no data loss. Legacy columns (income_plan, budget_limit) are dropped in a LATER
-- migration after backfill is verified.

begin;

-- 1. Workbook: allow >1 member; add anchor day + created_at; keep whop_user_id as owner.
alter table public.nudge_workbooks drop constraint if exists nudge_workbooks_whop_user_id_key;
alter table public.nudge_workbooks add column if not exists period_anchor_day smallint not null default 1;
alter table public.nudge_workbooks add column if not exists created_at timestamptz not null default now();
alter table public.nudge_workbooks alter column whop_user_id drop not null;

-- 2. Membership
create table if not exists public.nudge_workbook_members (
  workbook_id uuid not null references public.nudge_workbooks (id) on delete cascade,
  whop_user_id text not null references public.nudge_profiles (whop_user_id) on delete cascade,
  role text not null check (role in ('owner','member')) default 'member',
  display_name text,
  color text,
  joined_at timestamptz not null default now(),
  primary key (workbook_id, whop_user_id)
);
create index if not exists nudge_members_user_idx on public.nudge_workbook_members (whop_user_id);

-- 3. Periods
create table if not exists public.nudge_periods (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.nudge_workbooks (id) on delete cascade,
  start_date text not null,
  end_date text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (workbook_id, start_date)
);
create index if not exists nudge_periods_wb_start_idx on public.nudge_periods (workbook_id, start_date);

-- 4. Per-member income per period
create table if not exists public.nudge_period_incomes (
  period_id uuid not null references public.nudge_periods (id) on delete cascade,
  whop_user_id text not null,
  planned_amount double precision not null default 0,
  primary key (period_id, whop_user_id)
);

-- 5. Per-period category limits
create table if not exists public.nudge_period_category_limits (
  period_id uuid not null references public.nudge_periods (id) on delete cascade,
  category_id text not null references public.nudge_categories (id) on delete cascade,
  budget_limit double precision not null default 0,
  primary key (period_id, category_id)
);

-- 6. Invites (workstream A)
create table if not exists public.nudge_invites (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.nudge_workbooks (id) on delete cascade,
  inviter_user_id text not null,
  code text unique,
  invitee_username text,
  invitee_user_id text,
  status text not null check (status in ('pending','accepted','declined','revoked','expired')) default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists nudge_invites_code_idx on public.nudge_invites (code);
create index if not exists nudge_invites_invitee_idx on public.nudge_invites (invitee_user_id);

-- 7. Recurring items (workstream D)
create table if not exists public.nudge_recurring_items (
  id text primary key,
  workbook_id uuid not null references public.nudge_workbooks (id) on delete cascade,
  type text not null check (type in ('income','expense')),
  amount double precision not null,
  category_id text references public.nudge_categories (id) on delete set null,
  goal_id text,
  note text not null default '',
  day_of_period smallint,
  owner_user_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists nudge_recurring_wb_idx on public.nudge_recurring_items (workbook_id);

-- 8. Debts (workstream E)
create table if not exists public.nudge_debts (
  id text primary key,
  workbook_id uuid not null references public.nudge_workbooks (id) on delete cascade,
  name text not null,
  balance double precision not null default 0,
  apr double precision not null default 0,
  min_payment double precision not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists nudge_debts_wb_idx on public.nudge_debts (workbook_id);

-- 9. Activity feed (workstream C)
create table if not exists public.nudge_activity (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.nudge_workbooks (id) on delete cascade,
  actor_user_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nudge_activity_wb_time_idx on public.nudge_activity (workbook_id, created_at desc);

-- 10. Attribution + period columns on existing tables
alter table public.nudge_transactions add column if not exists period_id uuid references public.nudge_periods (id) on delete cascade;
alter table public.nudge_transactions add column if not exists created_by text;
alter table public.nudge_transactions add column if not exists created_at timestamptz not null default now();
alter table public.nudge_transactions add column if not exists debt_id text references public.nudge_debts (id) on delete set null;
alter table public.nudge_categories add column if not exists created_by text;
alter table public.nudge_goals add column if not exists created_by text;

-- 11. Backfill: owner membership, initial period, per-member income, per-period limits.
insert into public.nudge_workbook_members (workbook_id, whop_user_id, role)
select id, whop_user_id, 'owner' from public.nudge_workbooks
where whop_user_id is not null
on conflict do nothing;

-- One initial period per workbook = calendar month containing now() (anchor default 1).
insert into public.nudge_periods (workbook_id, start_date, end_date, label)
select w.id,
       to_char(date_trunc('month', now()), 'YYYY-MM-DD'),
       to_char((date_trunc('month', now()) + interval '1 month - 1 day'), 'YYYY-MM-DD'),
       to_char(now(), 'Mon YYYY')
from public.nudge_workbooks w
where not exists (select 1 from public.nudge_periods p where p.workbook_id = w.id);

-- Seed per-member income from legacy workbook income_plan (owner only).
insert into public.nudge_period_incomes (period_id, whop_user_id, planned_amount)
select p.id, w.whop_user_id, coalesce(w.income_plan, 0)
from public.nudge_workbooks w
join public.nudge_periods p on p.workbook_id = w.id
where w.whop_user_id is not null
on conflict do nothing;

-- Seed per-period limits from legacy category budget_limit, into the initial period.
insert into public.nudge_period_category_limits (period_id, category_id, budget_limit)
select p.id, c.id, coalesce(c.budget_limit, 0)
from public.nudge_categories c
join public.nudge_periods p on p.workbook_id = c.workbook_id
on conflict do nothing;

-- Attribute existing rows + assign transactions to the initial period.
update public.nudge_categories c set created_by = w.whop_user_id
  from public.nudge_workbooks w where c.workbook_id = w.id and c.created_by is null;
update public.nudge_goals g set created_by = w.whop_user_id
  from public.nudge_workbooks w where g.workbook_id = w.id and g.created_by is null;
update public.nudge_transactions t set created_by = w.whop_user_id
  from public.nudge_workbooks w where t.workbook_id = w.id and t.created_by is null;
update public.nudge_transactions t set period_id = p.id
  from public.nudge_periods p where t.workbook_id = p.workbook_id and t.period_id is null;

-- RLS on all new tables; no client policies (service-role only).
alter table public.nudge_workbook_members enable row level security;
alter table public.nudge_periods enable row level security;
alter table public.nudge_period_incomes enable row level security;
alter table public.nudge_period_category_limits enable row level security;
alter table public.nudge_invites enable row level security;
alter table public.nudge_recurring_items enable row level security;
alter table public.nudge_debts enable row level security;
alter table public.nudge_activity enable row level security;

commit;
```

- [ ] **Step 2: Review SQL for transaction-period coverage**

Re-read the backfill: every transaction whose date falls outside the initial calendar
month still gets `period_id = initial period` (only one period exists at backfill time).
That is acceptable for v1 — historical periods are generated going forward. Note this in
the commit message.

- [ ] **Step 3: Commit (operator runs db:push separately)**

```bash
git add supabase/migrations/20260527120000_nudge_shared_foundation.sql
git commit -m "feat(db): shared-budget foundation schema + backfill (run db:push)"
```

---

## Task 5: Workbook access resolver (membership)

**Files:**
- Create: `src/lib/budget/workbook-access.ts`
- Test: `src/lib/budget/workbook-access.test.ts`

- [ ] **Step 1: Write the failing test (pure helper portion)**

Create `src/lib/budget/workbook-access.test.ts`:

```ts
import { expect, test } from "vitest";
import { pickActiveWorkbookId } from "./workbook-access";

test("returns the only membership's workbook", () => {
  expect(pickActiveWorkbookId([{ workbookId: "wb1", joinedAt: "2026-01-01" }])).toBe("wb1");
});

test("prefers the most recently joined workbook when multiple", () => {
  expect(
    pickActiveWorkbookId([
      { workbookId: "old", joinedAt: "2026-01-01" },
      { workbookId: "new", joinedAt: "2026-05-01" },
    ]),
  ).toBe("new");
});

test("returns null when no memberships", () => {
  expect(pickActiveWorkbookId([])).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test src/lib/budget/workbook-access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `workbook-access.ts`**

```ts
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface MembershipRef {
  workbookId: string;
  joinedAt: string;
}

/** Pure selection: most-recently-joined membership wins (one workbook for 2-person v1). */
export function pickActiveWorkbookId(memberships: MembershipRef[]): string | null {
  if (memberships.length === 0) return null;
  return [...memberships].sort((a, b) => (a.joinedAt < b.joinedAt ? 1 : -1))[0].workbookId;
}

/** List the workbooks a user belongs to (membership rows). */
export async function listMemberships(whopUserId: string): Promise<MembershipRef[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_workbook_members")
    .select("workbook_id, joined_at")
    .eq("whop_user_id", whopUserId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ workbookId: r.workbook_id as string, joinedAt: r.joined_at as string }));
}

/** True if the user is a member of the workbook. Authorization gate for all mutations. */
export async function userIsWorkbookMember(whopUserId: string, workbookId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_workbook_members")
    .select("workbook_id")
    .eq("whop_user_id", whopUserId)
    .eq("workbook_id", workbookId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/**
 * Resolve the caller's active workbook id, creating a personal workbook + owner
 * membership + initial period on first use. Returns the workbook id.
 */
export async function ensureActiveWorkbook(whopUserId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const existing = pickActiveWorkbookId(await listMemberships(whopUserId));
  if (existing) return existing;

  await supabase.from("nudge_profiles").upsert({ whop_user_id: whopUserId }, { onConflict: "whop_user_id" });
  const { data: wb, error: wbErr } = await supabase
    .from("nudge_workbooks")
    .insert({ whop_user_id: whopUserId, period_anchor_day: 1 })
    .select("id")
    .single();
  if (wbErr) throw wbErr;
  const workbookId = wb.id as string;
  const { error: memErr } = await supabase
    .from("nudge_workbook_members")
    .insert({ workbook_id: workbookId, whop_user_id: whopUserId, role: "owner" });
  if (memErr) throw memErr;
  return workbookId;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm run test src/lib/budget/workbook-access.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget/workbook-access.ts src/lib/budget/workbook-access.test.ts
git commit -m "feat(budget): membership-based workbook access resolver"
```

---

## Task 6: Period repository (ensure current + list + snapshot rollover)

**Files:**
- Create: `src/lib/budget/period-repo.ts`

> Integration-heavy (DB). No unit test here; validated via the GET route in Task 8 and
> manual `db:push` + smoke. Keep functions small and pure-at-the-edges.

- [ ] **Step 1: Implement `period-repo.ts`**

```ts
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { periodRangeFor, nextPeriodStart, clampAnchorDay } from "./period-math";

export interface PeriodRow {
  id: string;
  startDate: string;
  endDate: string;
  label: string | null;
}

function labelFor(start: string): string {
  const [y, m] = start.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${name} ${y}`;
}

export async function listPeriods(workbookId: string): Promise<PeriodRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_periods")
    .select("id, start_date, end_date, label")
    .eq("workbook_id", workbookId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    label: (r.label as string) ?? null,
  }));
}

/**
 * Ensure a period exists for `todayIso`. If the latest period ends before today, roll
 * forward by snapshotting income + category limits into each new period. Returns the
 * current period row.
 */
export async function ensureCurrentPeriod(
  workbookId: string,
  anchorDay: number,
  todayIso: string,
): Promise<PeriodRow> {
  const supabase = getSupabaseAdmin();
  const anchor = clampAnchorDay(anchorDay);
  const target = periodRangeFor(todayIso, anchor);

  const periods = await listPeriods(workbookId);
  const found = periods.find((p) => p.startDate === target.start);
  if (found) return found;

  // Determine the latest existing period to snapshot from (if any).
  const latest = periods[0] ?? null;

  // Create periods from latest.start forward until we cover `target.start`.
  let cursorStart = latest ? nextPeriodStart(latest.startDate, anchor) : target.start;
  let last: PeriodRow | null = null;
  let snapshotFrom = latest;
  // Guard against runaway loops.
  for (let i = 0; i < 240; i++) {
    const range = periodRangeFor(cursorStart, anchor);
    const created = await insertPeriod(workbookId, range.start, range.end);
    if (snapshotFrom) await copySnapshot(snapshotFrom.id, created.id);
    last = created;
    snapshotFrom = created;
    if (range.start === target.start) break;
    cursorStart = nextPeriodStart(range.start, anchor);
  }
  if (!last) {
    // No latest and target already inserted above as first.
    last = await insertPeriod(workbookId, target.start, target.end);
  }
  return last;
}

async function insertPeriod(workbookId: string, start: string, end: string): Promise<PeriodRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nudge_periods")
    .upsert(
      { workbook_id: workbookId, start_date: start, end_date: end, label: labelFor(start) },
      { onConflict: "workbook_id,start_date" },
    )
    .select("id, start_date, end_date, label")
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    startDate: data.start_date as string,
    endDate: data.end_date as string,
    label: (data.label as string) ?? null,
  };
}

/** Copy per-member income and per-category limits from one period to another. */
async function copySnapshot(fromPeriodId: string, toPeriodId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const [{ data: incomes }, { data: limits }] = await Promise.all([
    supabase.from("nudge_period_incomes").select("whop_user_id, planned_amount").eq("period_id", fromPeriodId),
    supabase.from("nudge_period_category_limits").select("category_id, budget_limit").eq("period_id", fromPeriodId),
  ]);
  if (incomes?.length) {
    await supabase.from("nudge_period_incomes").upsert(
      incomes.map((r) => ({ period_id: toPeriodId, whop_user_id: r.whop_user_id, planned_amount: r.planned_amount })),
      { onConflict: "period_id,whop_user_id" },
    );
  }
  if (limits?.length) {
    await supabase.from("nudge_period_category_limits").upsert(
      limits.map((r) => ({ period_id: toPeriodId, category_id: r.category_id, budget_limit: r.budget_limit })),
      { onConflict: "period_id,category_id" },
    );
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors in `period-repo.ts` (pre-existing consumer errors from Task 3 remain).

- [ ] **Step 3: Commit**

```bash
git add src/lib/budget/period-repo.ts
git commit -m "feat(budget): period repository with snapshot rollover"
```

---

## Task 7: Period-aware persistence (fetch one period; per-item writes)

**Files:**
- Modify: `src/lib/budget/supabase-persistence.ts`

- [ ] **Step 1: Replace the file contents**

Rewrite `src/lib/budget/supabase-persistence.ts` to load one period and expose per-item
write helpers. Keep the `num` and `map*` helpers' spirit; new shape:

```ts
import type { BudgetState, Category, Goal, Member, MemberIncome, Transaction } from "./types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureActiveWorkbook } from "./workbook-access";
import { ensureCurrentPeriod, listPeriods, type PeriodRow } from "./period-repo";

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

async function loadWorkbookMeta(workbookId: string): Promise<{ anchorDay: number; members: Member[] }> {
  const supabase = getSupabaseAdmin();
  const [{ data: wb, error: wbErr }, { data: mem, error: memErr }] = await Promise.all([
    supabase.from("nudge_workbooks").select("period_anchor_day").eq("id", workbookId).single(),
    supabase
      .from("nudge_workbook_members")
      .select("whop_user_id, role, display_name, color")
      .eq("workbook_id", workbookId),
  ]);
  if (wbErr) throw wbErr;
  if (memErr) throw memErr;
  return {
    anchorDay: num(wb.period_anchor_day, 1),
    members: (mem ?? []).map((r) => ({
      whopUserId: r.whop_user_id as string,
      role: (r.role as "owner" | "member") ?? "member",
      displayName: (r.display_name as string) ?? null,
      color: (r.color as string) ?? null,
    })),
  };
}

/**
 * Load one period's slice for the caller. If `periodId` is given, that period is loaded
 * (read-only when it's not the current period); otherwise the current period is ensured.
 */
export async function fetchBudgetStateForUser(
  whopUserId: string,
  todayIso: string,
  periodId?: string | null,
): Promise<BudgetState> {
  const supabase = getSupabaseAdmin();
  const workbookId = await ensureActiveWorkbook(whopUserId);
  const { anchorDay, members } = await loadWorkbookMeta(workbookId);
  const current = await ensureCurrentPeriod(workbookId, anchorDay, todayIso);

  let period: PeriodRow = current;
  if (periodId && periodId !== current.id) {
    const all = await listPeriods(workbookId);
    const sel = all.find((p) => p.id === periodId);
    if (sel) period = sel;
  }
  const editable = period.id === current.id;

  const [incomeRes, catRes, limitRes, txRes, goalRes] = await Promise.all([
    supabase.from("nudge_period_incomes").select("whop_user_id, planned_amount").eq("period_id", period.id),
    supabase.from("nudge_categories").select("id, name, color, created_by").eq("workbook_id", workbookId),
    supabase.from("nudge_period_category_limits").select("category_id, budget_limit").eq("period_id", period.id),
    supabase
      .from("nudge_transactions")
      .select("id, date, amount, type, category_id, goal_id, debt_id, note, created_by, period_id")
      .eq("period_id", period.id),
    supabase.from("nudge_goals").select("id, name, target_amount, saved_amount, deadline, created_by").eq("workbook_id", workbookId),
  ]);
  for (const r of [incomeRes, catRes, limitRes, txRes, goalRes]) if (r.error) throw r.error;

  const limitByCat = new Map<string, number>(
    (limitRes.data ?? []).map((r) => [r.category_id as string, num(r.budget_limit)]),
  );
  const categories: Category[] = (catRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    budgetLimit: limitByCat.get(r.id as string) ?? 0,
    createdBy: (r.created_by as string) ?? null,
  }));
  const transactions: Transaction[] = (txRes.data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    amount: num(r.amount),
    type: r.type === "income" ? "income" : "expense",
    categoryId: (r.category_id as string) ?? null,
    goalId: (r.goal_id as string) ?? null,
    note: (r.note as string) ?? "",
    createdBy: (r.created_by as string) ?? null,
    periodId: (r.period_id as string) ?? null,
  }));
  const goals: Goal[] = (goalRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    targetAmount: num(r.target_amount),
    savedAmount: num(r.saved_amount),
    deadline: (r.deadline as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
  }));
  const memberIncomes: MemberIncome[] = (incomeRes.data ?? []).map((r) => ({
    whopUserId: r.whop_user_id as string,
    plannedAmount: num(r.planned_amount),
  }));

  return {
    workbookId,
    periodAnchorDay: anchorDay,
    members,
    period: { id: period.id, startDate: period.startDate, endDate: period.endDate, label: period.label },
    editable,
    memberIncomes,
    categories,
    transactions,
    goals,
  };
}
```

- [ ] **Step 2: Note the removed export**

`fetchBudgetStateFromSupabase` and `replaceBudgetStateInSupabase` are removed. Find
consumers:

Run: `npm run lint` and `npx tsc --noEmit`
Expected: errors in `src/app/api/budget-state/route.ts` and the experience loader —
fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/lib/budget/supabase-persistence.ts
git commit -m "feat(budget): period-aware state loader"
```

---

## Task 8: Reshape `GET /api/budget-state`; remove `PUT`

**Files:**
- Modify: `src/app/api/budget-state/route.ts`

- [ ] **Step 1: Rewrite the route**

Keep the `resolveBudgetUserId()` helper (unchanged). Replace GET; delete PUT and its
imports:

```ts
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { fetchBudgetStateForUser } from "@/lib/budget/supabase-persistence";
import { getCurrentUser } from "@/lib/auth/current-user";
import { userHasAnyNudgeMembership } from "@/lib/auth/standalone-gate";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const GATE_REFRESH_SECONDS = 15 * 60;

async function resolveBudgetUserId(): Promise<string | null> {
  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const u = await getCurrentUser(hdrs, cks);
  if (!u) return null;
  if (u.source === "standalone-session") {
    const stale = Math.floor(Date.now() / 1000) - u.gateCheckedAt > GATE_REFRESH_SECONDS;
    if (stale && !(await userHasAnyNudgeMembership(u.userId))) return null;
  }
  return u.userId;
}

export async function GET(req: Request) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const userId = await resolveBudgetUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const periodId = new URL(req.url).searchParams.get("periodId");
  const todayIso = new Date().toISOString().slice(0, 10);
  try {
    const state = await fetchBudgetStateForUser(userId, todayIso, periodId);
    return NextResponse.json({ state });
  } catch (err) {
    console.error("[Nudge] GET /api/budget-state failed", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create shared mutation helpers**

Create `src/app/api/_shared/workbook-mutation.ts`:

```ts
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ensureActiveWorkbook, userIsWorkbookMember } from "@/lib/budget/workbook-access";

/** Resolve caller + their active workbook for a mutation, or return null (→ 401/403). */
export async function resolveMutationContext(): Promise<
  { userId: string; workbookId: string } | null
> {
  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const u = await getCurrentUser(hdrs, cks);
  if (!u) return null;
  const workbookId = await ensureActiveWorkbook(u.userId);
  return { userId: u.userId, workbookId };
}

/** Verify the caller may write the given workbook (membership gate). */
export async function assertMember(userId: string, workbookId: string): Promise<boolean> {
  return userIsWorkbookMember(userId, workbookId);
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: the experience loader (RSC) still references old persistence — fix it next.

- [ ] **Step 4: Fix the experience loader**

Find the server component that called `fetchBudgetStateFromSupabase`:

Run: `npm run lint`
Open `src/app/experiences/[experienceId]/page.tsx` (and any `/app` loader). Replace the
initial-state fetch with:

```ts
import { fetchBudgetStateForUser } from "@/lib/budget/supabase-persistence";
// ...
const todayIso = new Date().toISOString().slice(0, 10);
const snapshot = await fetchBudgetStateForUser(userId, todayIso);
```

Pass `snapshot` into `NudgeBudgetProvider`'s `remote` prop (shape updated in Task 9).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/budget-state/route.ts src/app/api/_shared/workbook-mutation.ts src/app/experiences src/app/app 2>/dev/null
git commit -m "feat(api): period-aware GET budget-state; remove full-replace PUT"
```

---

## Task 9: Per-item route — transactions

**Files:**
- Create: `src/app/api/transactions/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";
import { ensureCurrentPeriod } from "@/lib/budget/period-repo";
import { getSupabaseAdmin as admin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function ctxOr401() {
  if (!isSupabasePersistenceEnabled()) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const ctx = await resolveMutationContext();
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ctx };
}

export async function POST(req: Request) {
  const r = await ctxOr401();
  if (r.error) return r.error;
  const { userId, workbookId } = r.ctx;
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  // Only the current period is editable; transactions are dated into it.
  const today = new Date().toISOString().slice(0, 10);
  const { data: wb } = await supabase.from("nudge_workbooks").select("period_anchor_day").eq("id", workbookId).single();
  const period = await ensureCurrentPeriod(workbookId, Number(wb?.period_anchor_day ?? 1), today);

  const id = body.id ?? crypto.randomUUID();
  const { error } = await supabase.from("nudge_transactions").insert({
    id,
    workbook_id: workbookId,
    period_id: period.id,
    date: String(body.date ?? today),
    amount: Number(body.amount ?? 0),
    type: body.type === "income" ? "income" : "expense",
    category_id: body.categoryId ?? null,
    goal_id: body.goalId ?? null,
    debt_id: body.debtId ?? null,
    note: String(body.note ?? ""),
    created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const r = await ctxOr401();
  if (r.error) return r.error;
  const { workbookId } = r.ctx;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (body.date !== undefined) patch.date = String(body.date);
  if (body.amount !== undefined) patch.amount = Number(body.amount);
  if (body.type !== undefined) patch.type = body.type === "income" ? "income" : "expense";
  if (body.categoryId !== undefined) patch.category_id = body.categoryId;
  if (body.goalId !== undefined) patch.goal_id = body.goalId;
  if (body.debtId !== undefined) patch.debt_id = body.debtId;
  if (body.note !== undefined) patch.note = String(body.note);
  const { error } = await supabase
    .from("nudge_transactions")
    .update(patch)
    .eq("id", body.id)
    .eq("workbook_id", workbookId); // scope to caller's workbook = authorization
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const r = await ctxOr401();
  if (r.error) return r.error;
  const { workbookId } = r.ctx;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("nudge_transactions")
    .delete()
    .eq("id", id)
    .eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

> Note: scoping every write with `.eq("workbook_id", workbookId)` where `workbookId`
> comes from the caller's own membership IS the authorization — a row in someone else's
> workbook can never match.

- [ ] **Step 2: Remove the duplicate import**

Delete the stray `import { getSupabaseAdmin as admin } ...` line (left as a reminder to
keep one import). Re-run typecheck.

- [ ] **Step 3: Build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/transactions/route.ts
git commit -m "feat(api): per-item transactions route"
```

---

## Task 10: Per-item routes — categories, period limits, period incomes, goals

**Files:**
- Create: `src/app/api/categories/route.ts`
- Create: `src/app/api/period-category-limits/route.ts`
- Create: `src/app/api/period-incomes/route.ts`
- Create: `src/app/api/goals/route.ts`

- [ ] **Step 1: `categories/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";

export const dynamic = "force-dynamic";

async function ctx() {
  if (!isSupabasePersistenceEnabled()) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const c = await resolveMutationContext();
  if (!c) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { c };
}

export async function POST(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { userId, workbookId } = r.c;
  const body = await req.json();
  const id = body.id ?? crypto.randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_categories").insert({
    id, workbook_id: workbookId, name: String(body.name ?? "Untitled"),
    color: String(body.color ?? "#94a3b8"), created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId } = r.c;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.color !== undefined) patch.color = String(body.color);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_categories").update(patch).eq("id", body.id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId } = r.c;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_categories").delete().eq("id", id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `period-category-limits/route.ts`** (PATCH/upsert one limit)

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const c = await resolveMutationContext();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.periodId || !body.categoryId) return NextResponse.json({ error: "periodId+categoryId required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  // Authorization: the period must belong to the caller's workbook.
  const { data: period } = await supabase.from("nudge_periods").select("workbook_id").eq("id", body.periodId).single();
  if (!period || period.workbook_id !== c.workbookId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await supabase.from("nudge_period_category_limits").upsert(
    { period_id: body.periodId, category_id: body.categoryId, budget_limit: Math.max(0, Number(body.budgetLimit ?? 0)) },
    { onConflict: "period_id,category_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: `period-incomes/route.ts`** (PATCH/upsert one member's income)

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const c = await resolveMutationContext();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.periodId || !body.whopUserId) return NextResponse.json({ error: "periodId+whopUserId required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const { data: period } = await supabase.from("nudge_periods").select("workbook_id").eq("id", body.periodId).single();
  if (!period || period.workbook_id !== c.workbookId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await supabase.from("nudge_period_incomes").upsert(
    { period_id: body.periodId, whop_user_id: String(body.whopUserId), planned_amount: Math.max(0, Number(body.plannedAmount ?? 0)) },
    { onConflict: "period_id,whop_user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: `goals/route.ts`** (POST/PATCH/DELETE)

```ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { resolveMutationContext } from "../_shared/workbook-mutation";

export const dynamic = "force-dynamic";

async function ctx() {
  if (!isSupabasePersistenceEnabled()) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const c = await resolveMutationContext();
  if (!c) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { c };
}

export async function POST(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { userId, workbookId } = r.c;
  const body = await req.json();
  const id = body.id ?? crypto.randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_goals").insert({
    id, workbook_id: workbookId, name: String(body.name ?? "Goal"),
    target_amount: Math.max(0, Number(body.targetAmount ?? 0)),
    saved_amount: Math.max(0, Number(body.savedAmount ?? 0)),
    deadline: body.deadline ?? null, created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId } = r.c;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.targetAmount !== undefined) patch.target_amount = Math.max(0, Number(body.targetAmount));
  if (body.deadline !== undefined) patch.deadline = body.deadline;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("nudge_goals").update(patch).eq("id", body.id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const r = await ctx(); if (r.error) return r.error;
  const { workbookId } = r.c;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getSupabaseAdmin();
  // Detach goal-linked transactions first (mirror old removeGoal behavior).
  await supabase.from("nudge_transactions").update({ goal_id: null }).eq("goal_id", id).eq("workbook_id", workbookId);
  const { error } = await supabase.from("nudge_goals").delete().eq("id", id).eq("workbook_id", workbookId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Build + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

```bash
git add src/app/api/categories src/app/api/period-category-limits src/app/api/period-incomes src/app/api/goals
git commit -m "feat(api): per-item routes for categories, limits, incomes, goals"
```

---

## Task 11: Refactor the React context to per-item saves

**Files:**
- Modify: `src/context/nudge-budget-context.tsx`

- [ ] **Step 1: Replace debounced full-PUT with per-item calls**

Rewrite the provider so each mutation (a) updates local state optimistically and (b)
fires the matching endpoint. Remove the `skipNextRemotePut`/debounced PUT effect.
Context value shape (extend, keep method names compatible where possible):

```tsx
type NudgeBudgetContextValue = {
  state: BudgetState;
  selectPeriod: (periodId: string | null) => Promise<void>;
  setMemberIncome: (whopUserId: string, amount: number) => void;
  addTransaction: (t: Omit<Transaction, "id" | "createdBy" | "periodId">) => void;
  removeTransaction: (id: string) => void;
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  updateCategoryBudget: (categoryId: string, budgetLimit: number) => void;
  renameCategory: (categoryId: string, name: string) => void;
  addCategory: (name: string, budgetLimit: number) => void;
  addGoal: (g: Omit<Goal, "id" | "createdBy">) => void;
  updateGoal: (id: string, patch: Partial<Pick<Goal, "name" | "targetAmount" | "deadline">>) => void;
  removeGoal: (id: string) => void;
};
```

Helper for authed fetch (keep `nudgeBudgetFetchInit`). Example mutation bodies:

```tsx
const post = (url: string, body: unknown) =>
  fetch(url, nudgeBudgetFetchInit(props.whopUserToken, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
const patch = (url: string, body: unknown) =>
  fetch(url, nudgeBudgetFetchInit(props.whopUserToken, {
    method: "PATCH", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
const del = (url: string) =>
  fetch(url, nudgeBudgetFetchInit(props.whopUserToken, { method: "DELETE", credentials: "include" }));
```

`addTransaction` example (optimistic + persist):

```tsx
const addTransaction = useCallback((t: Omit<Transaction, "id" | "createdBy" | "periodId">) => {
  const id = crypto?.randomUUID?.() ?? `tx_${Date.now()}`;
  setState((s) => ({ ...s, transactions: [{ ...t, id, createdBy: props.userId, periodId: s.period.id }, ...s.transactions] }));
  void post("/api/transactions", { id, ...t }).then((r) => { if (!r.ok) console.error("[Nudge] addTransaction failed", r.status); });
}, [props.userId, props.whopUserToken]);
```

`updateCategoryBudget` now PATCHes the per-period limit:

```tsx
const updateCategoryBudget = useCallback((categoryId: string, budgetLimit: number) => {
  setState((s) => ({ ...s, categories: s.categories.map((c) => c.id === categoryId ? { ...c, budgetLimit: Math.max(0, budgetLimit) } : c) }));
  void patch("/api/period-category-limits", { periodId: state.period.id, categoryId, budgetLimit });
}, [state.period.id, props.whopUserToken]);
```

`setMemberIncome` replaces `setIncomePlan`:

```tsx
const setMemberIncome = useCallback((whopUserId: string, amount: number) => {
  setState((s) => ({ ...s, memberIncomes: upsertIncome(s.memberIncomes, whopUserId, amount) }));
  void patch("/api/period-incomes", { periodId: state.period.id, whopUserId, plannedAmount: amount });
}, [state.period.id, props.whopUserToken]);
```

`selectPeriod` refetches a period slice:

```tsx
const selectPeriod = useCallback(async (periodId: string | null) => {
  const url = periodId ? `/api/budget-state?periodId=${encodeURIComponent(periodId)}` : `/api/budget-state`;
  const res = await fetch(url, nudgeBudgetFetchInit(props.whopUserToken, { credentials: "include" }));
  if (res.ok) { const { state: next } = await res.json(); setState(next); }
}, [props.whopUserToken]);
```

Add a small pure helper at module scope:

```tsx
function upsertIncome(list: BudgetState["memberIncomes"], whopUserId: string, amount: number) {
  const next = list.filter((i) => i.whopUserId !== whopUserId);
  next.push({ whopUserId, plannedAmount: Math.max(0, amount) });
  return next;
}
```

Apply the same optimistic+persist pattern to `removeTransaction`, `updateTransaction`,
`renameCategory`, `addCategory`, `addGoal`, `updateGoal`, `removeGoal` using the routes
from Tasks 9–10. When `state.editable` is false (past period), mutations should be
no-ops (guard at the start of each).

- [ ] **Step 2: Update provider props**

`remote` prop becomes `{ snapshot: BudgetState }` (no longer nullable — the loader always
returns a state). Initialize `useState(props.remote.snapshot)`.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: errors now only in components reading removed fields (`incomePlan`, etc.).

- [ ] **Step 4: Fix component consumers**

Run: `npm run lint`
For each component referencing `state.incomePlan`, compute the total from
`memberIncomes` instead. Add a selector `totalPlannedIncome(state)` to
`src/lib/budget/selectors.ts`:

```ts
import type { BudgetState } from "./types";
export function totalPlannedIncome(s: Pick<BudgetState, "memberIncomes">): number {
  return s.memberIncomes.reduce((sum, i) => sum + i.plannedAmount, 0);
}
```

Replace `state.incomePlan` reads with `totalPlannedIncome(state)` and `setIncomePlan(n)`
calls with `setMemberIncome(props.userId, n)` (or the income editor introduced in
workstream B). Category limit reads still use `category.budgetLimit` (now period-derived).

- [ ] **Step 5: Build + commit**

Run: `npx tsc --noEmit && npm run build && npm run test`
Expected: success; tests green.

```bash
git add src/context/nudge-budget-context.tsx src/lib/budget/selectors.ts src/components
git commit -m "feat(context): per-item saves + period-aware budget context"
```

---

## Task 12: Tab registry extension seam

**Files:**
- Modify: `src/components/nudge/nudge-app.tsx`
- Create: `src/components/nudge/tab-registry.ts`

- [ ] **Step 1: Create the registry**

```ts
import type { ComponentType } from "react";

export interface NudgeTab {
  id: string;
  label: string;
  order: number;
  Component: ComponentType;
}

const tabs: NudgeTab[] = [];

/** Workstreams register new tabs here instead of editing nudge-app.tsx directly. */
export function registerNudgeTab(tab: NudgeTab) {
  if (!tabs.some((t) => t.id === tab.id)) tabs.push(tab);
}

export function getNudgeTabs(): NudgeTab[] {
  return [...tabs].sort((a, b) => a.order - b.order);
}
```

- [ ] **Step 2: Wire existing tabs through the registry**

In `nudge-app.tsx`, register the existing tabs (dashboard, budgets, activity, goals,
insights) via `registerNudgeTab` at module load, and render from `getNudgeTabs()`. Keep
current visual behavior identical.

- [ ] **Step 3: Build + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: success; app renders the same tabs.

```bash
git add src/components/nudge/tab-registry.ts src/components/nudge/nudge-app.tsx
git commit -m "feat(ui): tab registry seam for parallel workstreams"
```

---

## Task 13: Foundation validation gate

- [ ] **Step 1: Full validation**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm run test`
Expected: all clean/green.

- [ ] **Step 2: Operator applies migration**

Hand off to the human/pipeline: `npm run db:push`. Confirm the 8 new tables exist and a
spot-checked existing workbook now has an owner membership row, an initial period, a
per-member income equal to its old `income_plan`, and per-period limits equal to old
`budget_limit`.

- [ ] **Step 3: Manual smoke (dev)**

Run: `npm run dev`, open the app, confirm: dashboard loads the current period; adding an
expense persists (reload shows it); editing a category limit persists; income edit
persists. No console errors.

- [ ] **Step 4: Merge to main**

```bash
git checkout main && git merge --no-ff feat/foundation-shared-budgets
git push origin main
```

---

## Self-review (Foundation)

- **Spec coverage:** membership (§1) ✓; per-item saves (§7) ✓; per-period income (§5) ✓;
  per-period limits + period dimension (§4) ✓; attribution columns (§6, columns only —
  UI in workstream C) ✓; schema for invites/recurring/debt/activity created additively
  so workstreams need no foundation changes ✓. Period UI/history (§8) and adopt/fresh
  join (§3) are intentionally in workstreams B and A.
- **Placeholders:** none — every code step has complete code.
- **Type consistency:** `fetchBudgetStateForUser` (persistence) ↔ GET route ↔ context;
  `BudgetState` fields (`workbookId`, `period`, `editable`, `memberIncomes`) used
  consistently; `ensureCurrentPeriod(workbookId, anchorDay, todayIso)` signature matches
  all call sites; route bodies use `categoryId`/`goalId`/`debtId`/`plannedAmount` camelCase
  consistently with the context fetch bodies.
- **Known follow-ups for workstreams:** legacy `income_plan`/`budget_limit` columns are
  dropped in a later migration (after backfill verified) — owned by workstream B.
