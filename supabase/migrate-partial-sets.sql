-- PickleTime — save a best-of-three one set at a time
--
-- RUN THIS BEFORE THE NEW APP REACHES ANY PHONE. Without it, saving a set match
-- that is only one or two sets in marks the whole match PLAYED — which would
-- put a half-finished game into the standings as a tie and let a bracket
-- advance from it. Nothing else in the app is affected.
--
-- Paste it into the Supabase SQL editor and run it once. Safe to re-run.
--
-- WHAT CHANGES
--
-- One line of submit_score(): `played` for a set match is no longer "there are
-- scores", it is "somebody has won two sets". A match with one set in stores
-- its sets and its running totals, and stays unplayed until it is decided.
--
-- The signature is unchanged, so this is a plain CREATE OR REPLACE.

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
  v_wins_a int;
  v_wins_b int;
  v_decided boolean := null;
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

    -- Whether the MATCH is over, which is not the same as whether it has
    -- scores. Best of three needs two sets: 1–0 and 1–1 are both matches in
    -- progress, and marking either played would let the standings count a
    -- half-finished game as a tie.
    select
      count(*) filter (where t.a > t.b),
      count(*) filter (where t.b > t.a)
      into v_wins_a, v_wins_b
      from unnest(p_sets_a, p_sets_b) as t(a, b);

    v_decided := greatest(v_wins_a, v_wins_b) >= 2 and v_wins_a <> v_wins_b;
  end if;

  if (v_score_a is not null and v_score_a < 0) or (v_score_b is not null and v_score_b < 0) then
    raise exception 'Scores cannot be negative' using errcode = '22023';
  end if;

  v_played   := coalesce(v_decided, v_score_a is not null and v_score_b is not null);
  v_knockout := coalesce(v_game.stage, 'rr') <> 'rr';

  -- Clearing a score clears the sets too. `v_decided is null` means no sets were
  -- passed at all — an ordinary single game — so this must not fire for a set
  -- match that is merely undecided, which still has sets worth keeping.
  if v_score_a is null or v_score_b is null then
    v_sets_a := '{}';
    v_sets_b := '{}';
  end if;

  -- Default: leave the line-up exactly as it is.
  v_team_a := v_game.team_a;
  v_team_b := v_game.team_b;

  if v_knockout then
    -- An undecided match keeps its line-up: the players are on court, the
    -- result just is not in yet. Only clearing the score releases the slot back
    -- to being derived from the standings.
    if v_score_a is null or v_score_b is null then
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
