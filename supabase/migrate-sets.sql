-- PickleTime — multi-set matches migration
--
-- RUN THIS BEFORE THE NEW APP REACHES ANY PHONE. Without it, switching a game
-- to best-of-three fails with "Could not find the sets_a column" and, more
-- quietly, submit_score() keeps its old three-argument shape. Nothing else in
-- the app is affected — every existing game is a single game, which is what it
-- has always been.
--
-- Paste it into the Supabase SQL editor and run it once. Safe to re-run.
--
-- WHAT THIS IS FOR
--
-- A playoff is often played best-of-three to 11 rather than as one game to 11,
-- and which matches those are is decided on the day. So it is a property of the
-- game, not of the session: any fixture can be switched.
--
-- WHY score_a STILL EXISTS ALONGSIDE THE SETS
--
-- It holds the TOTAL points across the sets, so points for, against and
-- difference go on counting what they always counted. What it must NOT be used
-- for any more is deciding who won: 11–9, 5–11, 11–9 is won two sets to one by
-- a side that scored 27 to 29. The totals are computed here rather than taken
-- from the client, so they cannot disagree with the sets they came from.

alter table public.games add column if not exists sets_a int[] not null default '{}';
alter table public.games add column if not exists sets_b int[] not null default '{}';

-- Both sides must have the same number of sets, and a match is at most three.
-- Enforced here rather than only in the app, because the audit log's whole point
-- is that a client cannot write something the database would not stand behind.
do $$
begin
  alter table public.games
    add constraint games_sets_shape_check
    check (
      coalesce(array_length(sets_a, 1), 0) = coalesce(array_length(sets_b, 1), 0)
      and coalesce(array_length(sets_a, 1), 0) <= 3
    );
exception
  when duplicate_object then null;
end $$;

-- The set scores are part of a score change, so they belong in the audit trail
-- exactly like the score itself.
alter table public.score_events add column if not exists sets_a int[];
alter table public.score_events add column if not exists sets_b int[];

-- ================================================================
-- submit_score(game_id, a, b, team_a, team_b, sets_a, sets_b)
-- ================================================================
-- Same function as before with two more arguments. Passing sets makes the match
-- a set match and the totals are derived from them; passing none (or clearing
-- the score) makes it a single game again.

drop function if exists public.submit_score(uuid, int, int, uuid[], uuid[]);

create or replace function public.submit_score(
  p_game_id uuid,
  p_a       int,
  p_b       int,
  p_team_a  uuid[] default null,
  p_team_b  uuid[] default null,
  p_sets_a  int[]  default null,
  p_sets_b  int[]  default null
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
  v_sets_a int[] := '{}';
  v_sets_b int[] := '{}';
  v_score_a int := p_a;
  v_score_b int := p_b;
  v_n      int;
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

  -- --- sets -----------------------------------------------------
  -- Only when a score is actually being written. Clearing a score clears the
  -- sets with it, so a cleared match goes back to being an ordinary fixture.
  if p_sets_a is not null and p_sets_b is not null
     and coalesce(array_length(p_sets_a, 1), 0) > 0 then

    v_n := coalesce(array_length(p_sets_a, 1), 0);

    if v_n <> coalesce(array_length(p_sets_b, 1), 0) then
      raise exception 'Both sides need the same number of sets' using errcode = '22023';
    end if;

    if v_n > 3 then
      raise exception 'A match is at most 3 sets' using errcode = '22023';
    end if;

    if exists (select 1 from unnest(p_sets_a || p_sets_b) as s(v) where s.v < 0) then
      raise exception 'Scores cannot be negative' using errcode = '22023';
    end if;

    v_sets_a := p_sets_a;
    v_sets_b := p_sets_b;

    -- Derived here, not trusted from the caller, so the totals can never
    -- disagree with the sets they came from.
    select coalesce(sum(v), 0) into v_score_a from unnest(p_sets_a) as s(v);
    select coalesce(sum(v), 0) into v_score_b from unnest(p_sets_b) as s(v);
  end if;

  if (v_score_a is not null and v_score_a < 0) or (v_score_b is not null and v_score_b < 0) then
    raise exception 'Scores cannot be negative' using errcode = '22023';
  end if;

  v_played   := v_score_a is not null and v_score_b is not null;
  v_knockout := coalesce(v_game.stage, 'rr') <> 'rr';

  -- Clearing a score clears the sets too.
  if not v_played then
    v_sets_a := '{}';
    v_sets_b := '{}';
  end if;

  -- Default: leave the line-up exactly as it is.
  v_team_a := v_game.team_a;
  v_team_b := v_game.team_b;

  if v_knockout then
    if not v_played then
      v_team_a := '{}';
      v_team_b := '{}';
    elsif p_team_a is not null and p_team_b is not null then
      if array_length(p_team_a, 1) is null or array_length(p_team_b, 1) is null then
        raise exception 'A knockout game needs a player on each side' using errcode = '22023';
      end if;

      if p_team_a && p_team_b then
        raise exception 'A player cannot be on both sides' using errcode = '22023';
      end if;

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
    (game_id, member_id, score_a, score_b, prev_a, prev_b, team_a, team_b, sets_a, sets_b)
  values
    (p_game_id, v_member.id, v_score_a, v_score_b, v_game.score_a, v_game.score_b,
     v_team_a, v_team_b, v_sets_a, v_sets_b);

  update public.games
     set score_a    = v_score_a,
         score_b    = v_score_b,
         sets_a     = v_sets_a,
         sets_b     = v_sets_b,
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

revoke all on function public.submit_score(uuid, int, int, uuid[], uuid[], int[], int[])
  from public, anon;
grant execute on function public.submit_score(uuid, int, int, uuid[], uuid[], int[], int[])
  to authenticated;
