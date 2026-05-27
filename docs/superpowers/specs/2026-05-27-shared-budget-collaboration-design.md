# Nudge — shared budgets, budget periods & history

Status: design draft
Date: 2026-05-27

## Goal

Let two people (e.g. a couple) share one budget workbook. Either partner can edit
income, categories, goals, and transactions; every change is attributed to who made
it. Add explicit **budget periods** (anchored to a configurable day of month) with
**per-period snapshots** of income and category limits, and the ability to **view past
periods**. Also fold in three high-value features: recurring/scheduled items,
a "safe to spend today" figure, and a debt payoff tracker. Dashboards become
**per-person aware** (income split per person + total, plus a mine/theirs/both filter).

## Decisions locked in

- **Sharing scope:** exactly two people, one shared workbook. The membership table
  generalizes but the workbook caps at 2 members for now.
- **Invites:** both by Whop username (lookup → pending request) and by share code/link.
- **On join:** the joiner chooses **adopt the inviter's existing budget** OR **start
  fresh**. Never auto-merge two data sets. Set-aside data is kept, not deleted.
- **Concurrency:** retire the full-workbook replace; move to **per-item saves**.
- **Attribution:** `created_by` on transactions, goals, categories; an activity feed;
  filter by person on dashboard + activity.
- **Income when shared:** per-member planned income, listed separately + combined total.
- **Periods:** configurable anchor day of month; periods created lazily; each new
  period **snapshots** the prior period's income plan + category limits.
- **History:** any past period is viewable; **past periods are read-only in v1** (only
  the current period is editable).
- **Extra features in scope:** recurring/scheduled items, safe-to-spend-today, debt
  payoff tracker, per-person-aware dashboards.

## Non-goals (v1)

- More than 2 members per workbook (table allows it; UI/flows assume 2).
- Editing historical periods.
- Real-time/live sync (Supabase Realtime). Changes appear on refresh/reopen.
- Merging two members' pre-existing data.
- Non-monthly period cycles (bi-weekly/custom length).
- Backlog items not listed above (rollover, auto-save-to-goals, period-end review,
  sinking funds, bill reminders/push) — see Future backlog.

---

## Identity & authorization

- `whop_user_id` remains the single user identifier, obtained only via the existing
  `getCurrentUserId(headers)` resolver (see standalone-app-mode spec).
- **Access rule:** a user may read/write a workbook only if a `nudge_workbook_members`
  row links them to it. Every mutation endpoint resolves the caller's workbook via
  membership and rejects anything else with 403.
- The service role (server) still performs all DB access; RLS stays enabled with no
  client policies.

---

## Data model

### Changed tables

**`nudge_workbooks`**
- Drop `unique (whop_user_id)`.
- Keep `whop_user_id` as `created_by`/owner reference (nullable allowed; source of
  truth for access is the members table).
- Remove `income_plan` (moves to `nudge_period_incomes`).
- Add `period_anchor_day smallint not null default 1` (1–31; 29–31 clamp to month's
  last day at runtime).
- Keep `updated_at`; add `created_at`.

**`nudge_categories`** — becomes the stable category catalog.
- Keep `id`, `workbook_id`, `name`, `color`.
- Remove `budget_limit` (moves to `nudge_period_category_limits`).
- Add `created_by text` (nullable; backfilled to owner).

**`nudge_transactions`**
- Add `period_id uuid references nudge_periods(id) on delete cascade` (assigned by
  the transaction's date).
- Add `created_by text` (Whop user id; backfilled to owner).
- Add `created_at timestamptz not null default now()`.
- Add `debt_id text references nudge_debts(id) on delete set null` (payments to a debt;
  mirrors the existing `goal_id` pattern).

**`nudge_goals`**
- Add `created_by text` (nullable; backfilled to owner).
- Goals stay workbook-level (span periods).

### New tables

**`nudge_workbook_members`**
- `workbook_id uuid references nudge_workbooks(id) on delete cascade`
- `whop_user_id text references nudge_profiles(whop_user_id) on delete cascade`
- `role text not null check (role in ('owner','member')) default 'member'`
- `display_name text`
- `color text` (attribution chip color)
- `joined_at timestamptz not null default now()`
- PK `(workbook_id, whop_user_id)`. Index on `whop_user_id`.

**`nudge_invites`**
- `id uuid pk default gen_random_uuid()`
- `workbook_id uuid references nudge_workbooks(id) on delete cascade`
- `inviter_user_id text not null`
- `code text unique` (short, URL-safe; used for code/link joins)
- `invitee_username text` (nullable; username-targeted invite)
- `invitee_user_id text` (nullable; resolved Whop user id once known)
- `status text not null check (status in
  ('pending','accepted','declined','revoked','expired')) default 'pending'`
- `created_at timestamptz not null default now()`
- `expires_at timestamptz`

**`nudge_periods`**
- `id uuid pk default gen_random_uuid()`
- `workbook_id uuid references nudge_workbooks(id) on delete cascade`
- `start_date text not null` (ISO date)
- `end_date text not null` (ISO date, inclusive)
- `label text` (e.g. "May 25 – Jun 24")
- `created_at timestamptz not null default now()`
- `unique (workbook_id, start_date)`. Index on `(workbook_id, start_date)`.

**`nudge_period_incomes`**
- `period_id uuid references nudge_periods(id) on delete cascade`
- `whop_user_id text not null`
- `planned_amount double precision not null default 0`
- PK `(period_id, whop_user_id)`.

**`nudge_period_category_limits`**
- `period_id uuid references nudge_periods(id) on delete cascade`
- `category_id text references nudge_categories(id) on delete cascade`
- `budget_limit double precision not null default 0`
- PK `(period_id, category_id)`.

**`nudge_recurring_items`**
- `id text pk`
- `workbook_id uuid references nudge_workbooks(id) on delete cascade`
- `type text not null check (type in ('income','expense'))`
- `amount double precision not null`
- `category_id text references nudge_categories(id) on delete set null`
- `goal_id text` (nullable)
- `note text not null default ''`
- `day_of_period smallint` (nullable; which day within the period to date the item;
  null = period start)
- `owner_user_id text not null` (attribution for materialized transactions)
- `active boolean not null default true`
- `created_at timestamptz not null default now()`

**`nudge_debts`**
- `id text pk`
- `workbook_id uuid references nudge_workbooks(id) on delete cascade`
- `name text not null`
- `balance double precision not null default 0` (current principal)
- `apr double precision not null default 0`
- `min_payment double precision not null default 0`
- `created_by text`
- `created_at timestamptz not null default now()`

**`nudge_activity`**
- `id uuid pk default gen_random_uuid()`
- `workbook_id uuid references nudge_workbooks(id) on delete cascade`
- `actor_user_id text not null`
- `action text not null` (e.g. `created`, `updated`, `deleted`)
- `entity_type text not null` (transaction|goal|category|income|period|member|
  workbook|recurring|debt)
- `entity_id text`
- `summary text not null` (human-readable, e.g. "Sarah raised Groceries to $600")
- `metadata jsonb`
- `created_at timestamptz not null default now()`

All new tables: RLS enabled, no client policies (service-role only).

### Migration plan

One additive migration that preserves all existing data:

1. Create new tables (members, invites, periods, period_incomes,
   period_category_limits, recurring_items, debts, activity).
2. Alter existing tables (add columns; do **not** drop `whop_user_id` from workbooks;
   drop its unique constraint).
3. **Backfill** for every existing workbook:
   - Insert an `owner` membership row (`whop_user_id` = workbook owner).
   - Create an initial `nudge_periods` row covering the current period (derived from
     `period_anchor_day` default 1 → calendar month containing `updated_at`/now).
   - Insert one `nudge_period_incomes` row (owner, `planned_amount` = old
     `income_plan`).
   - For each existing category, insert a `nudge_period_category_limits` row for the
     initial period using the old `budget_limit`; set `created_by` = owner.
   - Assign every existing transaction a `period_id` (the initial period if its date
     falls in range, else create/locate the matching period by date) and
     `created_by` = owner.
   - Set `created_by` = owner on existing goals.
4. Drop `income_plan` from workbooks and `budget_limit` from categories **after**
   backfill (separate step / later migration to keep rollback safe).

---

## Period lifecycle

- **Anchor → date range:** given `period_anchor_day = D`, the period containing date
  `T` runs from the most recent occurrence of day `D` (clamped to month length) up to
  the day before the next occurrence. `D = 1` yields calendar months.
- **Lazy creation:** on load, the server ensures a period exists for "today." If the
  latest period's `end_date` is in the past, create the next period(s) by **snapshotting**
  the latest period: copy `nudge_period_incomes` and `nudge_period_category_limits`
  forward; then **materialize recurring items** as transactions in the new period
  (attributed to each item's `owner_user_id`, dated by `day_of_period`).
- **Changing the anchor day** only affects periods created after the change; existing
  periods are untouched.

---

## Invite & join flows

**Create invite (inviter):**
- `POST /api/invites` with `{ method: 'username'|'code', username? }`.
- Username method: resolve via Whop API → store `invitee_username` + resolved
  `invitee_user_id`, status `pending`.
- Code method: generate a unique `code`, status `pending`. Return code/link.
- Reject if the workbook already has 2 members or an active pending invite.

**Accept (joiner):**
- Username invite appears as a pending request in their app (`GET /api/invites/incoming`).
- Code join: `POST /api/invites/accept` with `{ code }`.
- On accept, the joiner chooses `{ mode: 'adopt'|'fresh' }`:
  - `adopt`: add joiner as `member` to the inviter's workbook. Joiner's previous
    workbook membership is removed (data set aside, not deleted).
  - `fresh`: create a new empty workbook with both users as members (inviter as
    `owner`); both prior workbooks are set aside.
- Decline/revoke transition status accordingly.

**Leave / unshare (later, low priority):** out of v1 scope; note as backlog.

---

## API surface (per-item saves)

Replace `PUT /api/budget-state` (full replace) with granular, membership-authorized
endpoints. Each write stamps actor/`created_by` and appends one `nudge_activity` row.

| Resource | Methods |
|---|---|
| `/api/transactions` | POST, PATCH (by id), DELETE (by id) |
| `/api/categories` | POST, PATCH, DELETE |
| `/api/period-category-limits` | PATCH (by period+category) |
| `/api/period-incomes` | PATCH (by period+member) |
| `/api/goals` | POST, PATCH, DELETE |
| `/api/periods` | GET (list/select), POST (rare; usually lazy) |
| `/api/recurring-items` | POST, PATCH, DELETE |
| `/api/debts` | POST, PATCH, DELETE |
| `/api/invites` | POST, GET incoming, POST accept, POST decline/revoke |
| `/api/members` | GET, PATCH (display name/color) |
| `/api/activity` | GET (paged, filterable by actor) |

`GET /api/budget-state` is retained but reshaped to load **one period** (current or a
selected `periodId`) for the resolved workbook: members, period income (per person +
total), per-period category limits, that period's transactions, workbook-level goals,
recurring items, debts. Writes no longer go through it.

**Concurrency:** writes are targeted insert/update/delete by id, so two members editing
different items don't collide. Last-write-wins remains only at the single-field level
(acceptable for 2 people). No optimistic-locking version column in v1.

---

## Extra features

**Recurring/scheduled items.** Defined per workbook; materialized into transactions on
period rollover (see lifecycle). Editing a recurring item affects future periods only.
A simple management list in the UI.

**Safe to spend today.** Derived selector, no schema:
`safeToSpend = (total planned income for period − expenses so far this period −
remaining recurring expenses this period − planned goal contributions this period)`,
shown as a total and as a per-day figure (`÷ days remaining in period`). Dashboard card.

**Debt payoff tracker.** `nudge_debts` holds balances/APR/min payment. A payment is a
transaction with `debt_id` set (mirrors `goal_id`), which reduces the displayed balance.
Client computes snowball (smallest balance first) and avalanche (highest APR first)
orderings and a projected debt-free date. A debts section/tab.

**Per-person-aware dashboards.** Income shown per member + total. A mine/theirs/both
filter (member id) flows into dashboard selectors — spending totals, category health,
velocity, and the activity feed all respect it. When solo (1 member) the filter is
hidden.

---

## UI / component changes

- **Period selector** in the app chrome: current period + dropdown of past periods;
  selecting a past period renders read-only.
- **Members & sharing screen:** invite by username or code, show pending invites,
  show members with their colors; accept/decline incoming requests; choose adopt/fresh
  on join.
- **Attribution chips:** name/color on transaction rows, goals, categories.
- **Activity tab:** existing `activity-tab.tsx` extended to render the `nudge_activity`
  feed with actor + person filter.
- **Income editing:** per-member inputs with a total; current-period only.
- **New surfaces:** recurring items list, debts section, safe-to-spend card on dashboard.
- Follow `docs/nudge-ui-standards.md` and existing frosted-ui patterns.

## Client state changes

- `nudge-budget-context.tsx`: stop debounced full PUT; switch to per-item mutations
  with optimistic local updates and reconcile on response. Hold `members`,
  `currentPeriod`, `selectedPeriodId`, per-person income, recurring items, debts, and
  an `actorUserId`. Loading a different period refetches via `GET /api/budget-state?periodId=`.

---

## Edge cases

- **Anchor day 29–31** in short months → clamp to last day; ensure no gaps/overlaps
  between consecutive periods.
- **Transaction dated outside the current period** (back/forward dating) → resolve or
  lazily create the matching period; in v1, dating into a past (read-only) period is
  disallowed from the UI.
- **Second invite while one is pending** or **workbook already has 2 members** → block
  with clear message.
- **Username not found / user never opened app** → username invite resolution fails
  gracefully; suggest the code method.
- **Adopt vs fresh** must be atomic (transaction) so a half-joined state can't occur.
- **Activity feed** must never block the primary write (best-effort append within the
  same transaction; if it fails, the write still succeeds and logs an error).
- **Goal/debt-linked transactions** keep working across the new period dimension.

## Testing

- Period math: anchor-day → range for D=1, 25, 31 across month boundaries and leap Feb.
- Migration backfill: existing single-user workbook becomes a 1-member workbook with an
  initial period, per-member income, and per-period limits identical to before.
- Membership authorization: non-member is rejected (403) on every mutation endpoint.
- Invite/join: username + code paths; adopt vs fresh; 2-member cap; decline/revoke.
- Per-item concurrency: two members add different transactions → both persist; editing
  the same field → last write wins, no row loss.
- Recurring materialization on rollover; safe-to-spend selector; debt payoff orderings.
- Per-person dashboard filter correctness.

## Future backlog (not in this build)

Budget rollover (envelope), auto-save-to-goals ("pay yourself first"), period-end
review + month-over-month trends, sinking funds, emergency-fund milestone, bill
reminders & partner push notifications, leave/unshare flow, real-time live sync,
>2 members, editing historical periods, CSV export/backup.
