-- Optional link from a transaction to a savings goal (expense = allocate to goal; income = withdraw).
alter table public.nudge_transactions
  add column if not exists goal_id text references public.nudge_goals (id) on delete set null;
