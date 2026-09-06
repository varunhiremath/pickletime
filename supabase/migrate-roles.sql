-- PickleTime — shared admin migration
--
-- RUN THIS BEFORE THE NEW APP REACHES ANY PHONE. Without it, "Make admin" in
-- the roster fails with "Could not find the function public.set_member_role".
-- Nothing else in the app is affected.
--
-- Paste it into the Supabase SQL editor and run it once. Safe to re-run.
--
-- WHAT THIS IS FOR
--
-- Only an admin can start a session, and until now a club had exactly one — the
-- person who created it. If they were not at the courts, nobody could get the
-- games going. This lets an admin share that.
--
-- No policy changes are needed: policies.sql already grants every club admin
-- INSERT on sessions and games, so a second admin can create sessions the
-- moment their row says 'admin'. The only new thing is a safe way to say so.
--
-- WHY THIS IS AN RPC RATHER THAN A PLAIN UPDATE
--
-- members_update already lets an admin write to any row in their club, so the
-- app *could* set role directly. But nothing in a policy can express "there must
-- always be at least one admin left" — an admin demoting themselves as the last
-- one standing would lock the whole club out of ever starting a session again,
-- with no way back in. That guard has to live somewhere the client cannot skip.

create or replace function public.set_member_role(p_member_id uuid, p_role text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_member  public.members%rowtype;
  v_admins  int;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if p_role not in ('admin', 'player') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;

  select * into v_member from public.members where id = p_member_id;
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  -- Authorisation, checked here rather than trusted from the caller. This
  -- function runs as its owner and therefore past RLS, so it is the only thing
  -- standing between a player and their own promotion.
  if not exists (
    select 1 from public.members m
     where m.club_id = v_member.club_id
       and m.user_id = v_uid
       and m.role = 'admin'
  ) then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;

  if v_member.role = p_role then
    return row_to_json(v_member);
  end if;

  -- The lock-out guard. Counted inside the transaction, so two admins demoting
  -- each other at the same moment cannot both pass this check and leave zero.
  if p_role = 'player' then
    select count(*) into v_admins
      from public.members
     where club_id = v_member.club_id and role = 'admin'
       for update;

    if v_admins <= 1 then
      raise exception 'A club needs at least one admin' using errcode = '23514';
    end if;
  end if;

  update public.members
     set role = p_role
   where id = p_member_id
  returning * into v_member;

  return row_to_json(v_member);
end;
$$;

revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;
