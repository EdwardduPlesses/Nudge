-- Category / transaction / goal ids are logical slugs (e.g. "housing") reused per workbook.
-- Global PK on `id` alone caused 23505 when another workbook already had the same id.

alter table public.nudge_transactions
  drop constraint if exists nudge_transactions_category_id_fkey;

alter table public.nudge_transactions
  drop constraint if exists nudge_transactions_goal_id_fkey;

alter table public.nudge_categories
  drop constraint nudge_categories_pkey;

alter table public.nudge_categories
  add primary key (workbook_id, id);

alter table public.nudge_goals
  drop constraint nudge_goals_pkey;

alter table public.nudge_goals
  add primary key (workbook_id, id);

alter table public.nudge_transactions
  drop constraint nudge_transactions_pkey;

alter table public.nudge_transactions
  add primary key (workbook_id, id);

-- NO ACTION (not SET NULL): composite FK would null `workbook_id` too on delete.
alter table public.nudge_transactions
  add constraint nudge_transactions_category_fk
  foreign key (workbook_id, category_id)
  references public.nudge_categories (workbook_id, id);

alter table public.nudge_transactions
  add constraint nudge_transactions_goal_fk
  foreign key (workbook_id, goal_id)
  references public.nudge_goals (workbook_id, id);
