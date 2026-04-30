-- Goal-linked transfers (matches app Transaction.goalId + sync layer).
alter table public.nudge_transactions add column if not exists goal_id text;
