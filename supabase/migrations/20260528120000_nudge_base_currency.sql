-- Native-currency storage: per-workbook base currency + atomic convert-all.

begin;

alter table public.nudge_workbooks
  add column if not exists base_currency text not null default 'USD';

-- Multiply every amount in a workbook by p_rate, round to p_decimals, set base_currency.
-- Runs as a single transaction (function body) so a partial conversion can't occur.
create or replace function public.nudge_convert_workbook_currency(
  p_workbook_id uuid,
  p_rate double precision,
  p_to_currency text,
  p_decimals int
) returns void
language plpgsql
as $$
begin
  update public.nudge_transactions
    set amount = round((amount * p_rate)::numeric, p_decimals)
    where workbook_id = p_workbook_id;

  update public.nudge_goals
    set target_amount = round((target_amount * p_rate)::numeric, p_decimals),
        saved_amount  = round((saved_amount  * p_rate)::numeric, p_decimals)
    where workbook_id = p_workbook_id;

  update public.nudge_debts
    set balance     = round((balance     * p_rate)::numeric, p_decimals),
        min_payment = round((min_payment * p_rate)::numeric, p_decimals)
    where workbook_id = p_workbook_id;

  update public.nudge_recurring_items
    set amount = round((amount * p_rate)::numeric, p_decimals)
    where workbook_id = p_workbook_id;

  update public.nudge_period_incomes
    set planned_amount = round((planned_amount * p_rate)::numeric, p_decimals)
    where period_id in (select id from public.nudge_periods where workbook_id = p_workbook_id);

  update public.nudge_period_category_limits
    set budget_limit = round((budget_limit * p_rate)::numeric, p_decimals)
    where period_id in (select id from public.nudge_periods where workbook_id = p_workbook_id);

  update public.nudge_workbooks
    set base_currency = p_to_currency
    where id = p_workbook_id;
end;
$$;

commit;
