-- Collapse nudge_workbooks to one per user (drop experience_id from the key).
-- Pre-step: for users with multiple workbooks, keep only the most recently updated.
-- Children (nudge_categories, nudge_transactions, nudge_goals) cascade on workbook_id.

begin;

-- 1. Keep newest workbook per user, delete the others.
with ranked as (
  select id,
         row_number() over (
           partition by whop_user_id
           order by updated_at desc, id desc
         ) as rn
  from public.nudge_workbooks
)
delete from public.nudge_workbooks
where id in (select id from ranked where rn > 1);

-- 2. Drop the (experience_id, whop_user_id) unique constraint.
--    The exact constraint name was recorded in pre-flight step P3.
alter table public.nudge_workbooks
  drop constraint if exists nudge_workbooks_experience_id_whop_user_id_key;

-- 3. Drop the experience_id column.
alter table public.nudge_workbooks
  drop column if exists experience_id;

-- 4. Drop the old composite index (if it survived the column drop).
drop index if exists public.nudge_workbooks_exp_user_idx;

-- 5. Enforce one workbook per user.
alter table public.nudge_workbooks
  add constraint nudge_workbooks_whop_user_id_key unique (whop_user_id);

commit;
