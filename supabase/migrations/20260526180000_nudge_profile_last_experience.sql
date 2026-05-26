-- Remember the most recent experience id a user accessed Nudge from via the
-- Whop iframe. Used by the standalone access gate to call
-- whopsdk.users.checkAccess(last_experience_id, { id: userId }) — Whop's
-- check-access endpoint requires an experience/product/company id, not the
-- app id, so we have to remember a known one.

alter table public.nudge_profiles
  add column if not exists last_experience_id text;
