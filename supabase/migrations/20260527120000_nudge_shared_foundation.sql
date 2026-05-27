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
-- No FK to nudge_categories: its PK is composite (workbook_id, id) since
-- 20250430140000, so `id` alone is not referenceable. The (period_id, category_id)
-- key is still unambiguous because period_id pins exactly one workbook.
create table if not exists public.nudge_period_category_limits (
  period_id uuid not null references public.nudge_periods (id) on delete cascade,
  category_id text not null,
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
  -- Plain text (no FK): nudge_categories PK is composite (workbook_id, id).
  category_id text,
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
