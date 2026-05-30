-- The hottest read query (fetchBudgetStateForUser) filters nudge_transactions by
-- period_id on every page load, period switch, and resync. period_id had no index
-- (only workbook_id did), forcing a sequential scan of the whole table that grows
-- with global row count. Index it so the per-period fetch stays proportional to the
-- result size.
create index if not exists nudge_transactions_period_idx
  on public.nudge_transactions (period_id);
