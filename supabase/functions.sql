-- PickleTime — RPCs
--
-- Run LAST, after schema.sql and policies.sql. Safe to re-run.
--
-- Only three functions are needed. Minting and revoking invites are ordinary
-- authorised INSERT/UPDATEs that the admin's RLS policies already allow, so they
-- get no RPC.
--
-- Every function here is SECURITY DEFINER, which means it runs past RLS. Each
-- one therefore checks authorisation itself, explicitly, as its first act.

-- ================================================================
-- create_club(name, admin_name)
-- ================================================================
-- A brand-new anonymous account belongs to no club, so no INSERT policy could
-- ever authorise it to create one — the policy would have nothing to check
-- against. This function is that bootstrap: it creates the club and, in the same
-- transaction, the admin member bound to the caller's auth.uid().

create or replace function public.create_club(p_name text, p_admin_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_club   public.clubs%rowtype;
  v_member public.members%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Club name is required' using errcode = '22023';
  end if;

  insert into public.clubs (name)
  values (trim(p_name))
  returning * into v_club;

  insert into public.members (club_id, name, user_id, role, color_index)
  values (v_club.id, coalesce(nullif(trim(p_admin_name), ''), 'Me'), v_uid, 'admin', 0)
  returning * into v_member;

  return json_build_object('club', row_to_json(v_club), 'member', row_to_json(v_member));
end;
$$;

-- ================================================================
-- claim_invite(code)
-- ================================================================
-- The raw code travels over TLS and is compared HERE. The client never decides
-- whether a code is valid — it only normalises the typing (case, ambiguous
-- glyphs) before sending. See src/utils/inviteCode.js normalizeInviteCode().
--
-- Throttled per account: the code space is ~40 bits, which is thin against
-- unlimited guessing. Ten attempts per fifteen minutes.
--
-- WHY THIS RETURNS {ok:false, error} INSTEAD OF RAISING
--
-- An earlier version raised an exception for every rejection. That silently
-- defeated the throttle: raising rolls the transaction back, and the rollback
-- took the attempt counter with it. Only attempts that got *past* the code
-- lookup were ever counted — exactly backwards — so guessing was effectively
-- unlimited. Caught by supabase/rls.test.mjs.
--
-- Returning a value lets the transaction commit, so the counter persists.
-- Genuinely exceptional conditions (not signed in) still raise, because there is
-- no counter to preserve in that case.

create or replace function public.claim_invite(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_invite   public.invites%rowtype;
  v_club     public.clubs%rowtype;
  v_member   public.members%rowtype;
  v_attempts int;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- --- throttle -------------------------------------------------
  -- Single upsert so the count is atomic under concurrent attempts.
  insert into public.claim_attempts as ca (user_id, attempts, window_start)
  values (v_uid, 1, now())
  on conflict (user_id) do update
     set attempts     = case when ca.window_start < now() - interval '15 minutes'
                             then 1 else ca.attempts + 1 end,
         window_start = case when ca.window_start < now() - interval '15 minutes'
                             then now() else ca.window_start end
  returning ca.attempts into v_attempts;

  if v_attempts > 10 then
    return json_build_object('ok', false,
      'error', 'Too many attempts. Wait a few minutes and try again.');
  end if;

  -- --- look the code up ----------------------------------------
  select * into v_invite
    from public.invites
   where upper(code) = upper(trim(p_code));

  if not found then
    return json_build_object('ok', false, 'error', 'That code is not valid.');
  end if;

  if v_invite.revoked then
    return json_build_object('ok', false, 'error', 'That code has been revoked.');
  end if;

  if v_invite.claimed_at is not null then
    return json_build_object('ok', false, 'error', 'That code has already been used.');
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return json_build_object('ok', false, 'error', 'That code has expired.');
  end if;

  -- Already in this club on another roster entry? Claiming a second one would
  -- give the same person two rows in the standings.
  if exists (
    select 1 from public.members
     where club_id = v_invite.club_id and user_id = v_uid
  ) then
    return json_build_object('ok', false, 'error', 'You have already joined this club.');
  end if;

  -- --- claim ----------------------------------------------------
  update public.members
     set user_id = v_uid
   where id = v_invite.member_id
  returning * into v_member;

  if not found then
    return json_build_object('ok', false, 'error', 'That code is not valid.');
  end if;

  update public.invites
     set claimed_at = now()
   where id = v_invite.id;

  -- A successful claim clears the throttle.
  delete from public.claim_attempts where user_id = v_uid;

  select * into v_club from public.clubs where id = v_invite.club_id;

  return json_build_object('ok', true,
    'club', row_to_json(v_club), 'member', row_to_json(v_member));
end;
$$;

-- ================================================================
-- submit_score(game_id, a, b, team_a, team_b)
-- ================================================================
-- The ONLY way a score is ever written. `games` has no UPDATE policy (see
-- policies.sql), so this function is the sole writer, and it always appends to
-- score_events in the same transaction. That is what makes the audit log
-- impossible to bypass — including for the admin, whose overrides are logged
-- exactly like everyone else's.
--
-- Passing (null, null) clears a score.
--
-- WHY THIS TAKES TEAMS
--
-- Knockout fixtures are created with the session but start empty: nobody knows
-- who plays a semifinal until the round robin has finished. The client derives
-- the line-ups from the standings (src/utils/bracket.js) and passes them in
-- alongside the score, which is the moment they stop being a derivation and
-- become a record of who actually played. Without that, correcting a
-- round-robin score months later would silently rewrite the final.
--
-- Teams are only ever written for knockout rows. A round-robin fixture's
-- line-up comes from the generated schedule and this function will not touch it,
-- whatever the caller passes.

drop function if exists public.submit_score(uuid, int, int);

create or replace function public.submit_score(
  p_game_id uuid,
  p_a       int,
  p_b       int,
  p_team_a  uuid[] default null,
  p_team_b  uuid[] default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_club   uuid;
  v_member public.members%rowtype;
  v_game   public.games%rowtype;
  v_played boolean;
  v_knockout boolean;
  v_team_a uuid[];
  v_team_b uuid[];
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;

  v_club := public.club_of_game(p_game_id);

  select * into v_member
    from public.members
   where club_id = v_club and user_id = v_uid;

  if not found then
    raise exception 'You are not a member of this club' using errcode = '42501';
  end if;

  if (p_a is not null and p_a < 0) or (p_b is not null and p_b < 0) then
    raise exception 'Scores cannot be negative' using errcode = '22023';
  end if;

  v_played   := p_a is not null and p_b is not null;
  v_knockout := coalesce(v_game.stage, 'rr') <> 'rr';

  -- Default: leave the line-up exactly as it is.
  v_team_a := v_game.team_a;
  v_team_b := v_game.team_b;

  if v_knockout then
    if not v_played then
      -- Clearing a knockout score un-decides it, so the slot goes back to being
      -- derived from the standings. Leaving stale players on a cleared
      -- semifinal would freeze the bracket at whatever it happened to say.
      v_team_a := '{}';
      v_team_b := '{}';
    elsif p_team_a is not null and p_team_b is not null then
      if array_length(p_team_a, 1) is null or array_length(p_team_b, 1) is null then
        raise exception 'A knockout game needs a player on each side' using errcode = '22023';
      end if;

      if p_team_a && p_team_b then
        raise exception 'A player cannot be on both sides' using errcode = '22023';
      end if;

      -- Everyone named has to be on this club's roster. The caller is already a
      -- member and could enter any score they like, but they should not be able
      -- to write another club's member ids into this one's games.
      if exists (
        select 1
          from unnest(p_team_a || p_team_b) as t(id)
         where not exists (
           select 1 from public.members m
            where m.id = t.id and m.club_id = v_club
         )
      ) then
        raise exception 'Those players are not in this club' using errcode = '22023';
      end if;

      v_team_a := p_team_a;
      v_team_b := p_team_b;
    end if;
  end if;

  insert into public.score_events
    (game_id, member_id, score_a, score_b, prev_a, prev_b, team_a, team_b)
  values
    (p_game_id, v_member.id, p_a, p_b, v_game.score_a, v_game.score_b, v_team_a, v_team_b);

  update public.games
     set score_a    = p_a,
         score_b    = p_b,
         team_a     = v_team_a,
         team_b     = v_team_b,
         played     = v_played,
         scored_by  = v_member.id,
         updated_at = now()
   where id = p_game_id
  returning * into v_game;

  return row_to_json(v_game);
end;
$$;

-- ================================================================
-- Grants
-- ================================================================
-- EXECUTE is granted narrowly. Note that create_club and claim_invite are
-- reachable by any signed-in account by design — that is how somebody with no
-- club yet gets one. Both check auth.uid() themselves.

revoke all on function public.create_club(text, text)     from public, anon;
revoke all on function public.claim_invite(text)          from public, anon;
revoke all on function public.submit_score(uuid, int, int, uuid[], uuid[]) from public, anon;

grant execute on function public.create_club(text, text)  to authenticated;
grant execute on function public.claim_invite(text)       to authenticated;
grant execute on function public.submit_score(uuid, int, int, uuid[], uuid[]) to authenticated;

-- The RLS helpers MUST stay executable by `authenticated`. Policy expressions
-- are evaluated as the querying role, so revoking EXECUTE here would make every
-- policy that calls them fail with "permission denied for function" — i.e. the
-- whole app would stop reading anything. Exposing them is harmless: all a caller
-- learns is whether they themselves are a member or admin of a club they already
-- know the id of.
grant execute on function public.is_member(uuid)        to authenticated;
grant execute on function public.is_admin(uuid)         to authenticated;
grant execute on function public.club_of_session(uuid)  to authenticated;
grant execute on function public.club_of_game(uuid)     to authenticated;
