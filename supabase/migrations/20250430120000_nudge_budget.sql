-- Nudge budget persistence (Whop user id + experience id).
-- RLS enabled with no client policies: only the service role (server) should access these tables.

create table if not exists public.nudge_profiles (
  whop_user_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.nudge_workbooks (
  id uuid primary key default gen_random_uuid(),
  experience_id text not null,
  whop_user_id text not null references public.nudge_profiles (whop_user_id) on delete cascade,
  income_plan double precision not null default 0,
  updated_at timestamptz not null default now(),
  unique (experience_id, whop_user_id)
);

create table if not exists public.nudge_categories (
  id text primary key,
  workbook_id uuid not null references public.nudge_workbooks (id) on delete cascade,
  name text not null,
  budget_limit double precision not null default 0,
  color text not null default '#94a3b8'
);

create table if not exists public.nudge_transactions (
  id text primary key,
  workbook_id uuid not null references public.nudge_workbooks (id) on delete cascade,
  date text not null,
  amount double precision not null,
  type text not null check (type in ('income', 'expense')),
  category_id text references public.nudge_categories (id) on delete set null,
  note text not null default ''
);

create table if not exists public.nudge_goals (
  id text primary key,
  workbook_id uuid not null references public.nudge_workbooks (id) on delete cascade,
  name text not null,
  target_amount double precision not null,
  saved_amount double precision not null default 0,
  deadline text
);

create index if not exists nudge_workbooks_exp_user_idx
  on public.nudge_workbooks (experience_id, whop_user_id);

create index if not exists nudge_categories_workbook_idx
  on public.nudge_categories (workbook_id);

create index if not exists nudge_transactions_workbook_idx
  on public.nudge_transactions (workbook_id);

create index if not exists nudge_goals_workbook_idx
  on public.nudge_goals (workbook_id);

alter table public.nudge_profiles enable row level security;
alter table public.nudge_workbooks enable row level security;
alter table public.nudge_categories enable row level security;
alter table public.nudge_transactions enable row level security;
alter table public.nudge_goals enable row level security;

-- Intentionally no policies for anon/authenticated: direct PostgREST access is denied.
-- The Supabase service role (used only on the Next.js server) bypasses RLS.
