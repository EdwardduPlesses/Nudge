-- Atomic accept-invite: the membership rewrite for both modes runs inside a single
-- transaction (the function body) so a partial failure rolls back everything. This
-- prevents the orphaned-membership footgun where a mid-sequence error could leave a
-- user with ZERO memberships (ensureActiveWorkbook would then silently mint a fresh
-- empty workbook, losing the shared budget).
--
-- Composite-PK note: nudge_workbook_members keys on (workbook_id, whop_user_id), so
-- every delete/insert is scoped accordingly. Period creation is intentionally LEFT to
-- the TypeScript caller (ensureCurrentPeriod) AFTER this RPC: it is idempotent and
-- non-destructive, so it does not need to share this transaction.

begin;

-- p_mode: 'adopt' (joiner joins the inviter's workbook, joiner's other memberships
-- removed) or 'fresh' (new workbook with both as members, both prior memberships
-- removed). Re-validates the invite under row locks to avoid races / double-accept.
-- Returns the resulting workbook id (the one the caller should ensure a period for).
create or replace function public.nudge_accept_invite(
  p_invite_id uuid,
  p_joiner_user_id text,
  p_mode text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite        public.nudge_invites%rowtype;
  v_workbook_id   uuid;
  v_member_count  int;
begin
  if p_mode not in ('adopt', 'fresh') then
    raise exception 'invalid mode: %', p_mode using errcode = '22023';
  end if;

  -- Lock the invite row so concurrent accepts can't both pass the guards.
  select * into v_invite
  from public.nudge_invites
  where id = p_invite_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Invite not found or already used.' using errcode = 'P0002';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Invite not found or already used.' using errcode = 'P0002';
  end if;
  if v_invite.inviter_user_id = p_joiner_user_id then
    raise exception 'You can''t accept your own invite.' using errcode = 'P0001';
  end if;
  if v_invite.invitee_user_id is not null and v_invite.invitee_user_id <> p_joiner_user_id then
    raise exception 'This invite was issued to a different account.' using errcode = 'P0001';
  end if;

  -- Profile must exist before a membership FK can reference it.
  insert into public.nudge_profiles (whop_user_id)
  values (p_joiner_user_id)
  on conflict (whop_user_id) do nothing;

  if p_mode = 'adopt' then
    -- Cap: at most two members per workbook (excluding the joiner, who may already
    -- be present from a retried call).
    select count(*) into v_member_count
    from public.nudge_workbook_members
    where workbook_id = v_invite.workbook_id
      and whop_user_id <> p_joiner_user_id;
    if v_member_count >= 2 then
      raise exception 'This budget already has two members.' using errcode = 'P0001';
    end if;

    -- Join the inviter's workbook (idempotent), then drop the joiner's other memberships.
    insert into public.nudge_workbook_members (workbook_id, whop_user_id, role)
    values (v_invite.workbook_id, p_joiner_user_id, 'member')
    on conflict (workbook_id, whop_user_id) do nothing;

    delete from public.nudge_workbook_members
    where whop_user_id = p_joiner_user_id
      and workbook_id <> v_invite.workbook_id;

    v_workbook_id := v_invite.workbook_id;
  else
    -- fresh: new workbook owned by the inviter, both as members, both prior
    -- memberships removed. No data is merged.
    insert into public.nudge_workbooks (whop_user_id, period_anchor_day)
    values (v_invite.inviter_user_id, 1)
    returning id into v_workbook_id;

    delete from public.nudge_workbook_members
    where whop_user_id in (v_invite.inviter_user_id, p_joiner_user_id);

    insert into public.nudge_workbook_members (workbook_id, whop_user_id, role)
    values
      (v_workbook_id, v_invite.inviter_user_id, 'owner'),
      (v_workbook_id, p_joiner_user_id, 'member');
  end if;

  update public.nudge_invites
  set status = 'accepted', invitee_user_id = p_joiner_user_id
  where id = v_invite.id;

  return v_workbook_id;
end;
$$;

commit;
