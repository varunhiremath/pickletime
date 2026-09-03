-- PickleTime — playoffs migration
--
-- RUN THIS BEFORE THE NEW APP REACHES ANY PHONE. The new build creates sessions
-- with a `playoffs` column, writes `stage`/`slot` on games, and calls a
-- five-argument submit_score(). Without these changes those calls fail and
-- scoring stops working.
--
-- Paste the whole file into the Supabase SQL editor and run it once. Safe to
-- re-run: every statement is IF NOT EXISTS / CREATE OR REPLACE.
--
-- (Everything here is already folded into schema.sql and functions.sql — running
-- those two in order does the same job. This file is just the delta, so you
-- don't have to scroll through the rest.)

-- ---------------------------------------------------------------- sessions

alter table public.sessions add column if not exists playoffs boolean not null default false;

-- ---------------------------------------------------------------- games

-- 'rr' is the default, so every existing game keeps meaning exactly what it
-- meant: an ordinary round-robin fixture.
alter table public.games add column if not exists stage text not null default 'rr';
alter table public.games add column if not exists slot  text;

do $$
begin
  alter table public.games
    add constraint games_stage_check
    check (stage in ('rr', 'sf', 'bronze', 'final'));
exception
  when duplicate_object then null;
end $$;

-- One of each knockout fixture per session. Round-robin games have a NULL slot
-- and Postgres allows any number of those.
create unique index if not exists games_session_slot_key
  on public.games(session_id, slot)
  where slot is not null;

-- ---------------------------------------------------------------- score_events

alter table public.score_events add column if not exists team_a uuid[];
alter table public.score_events add column if not exists team_b uuid[];

-- ---------------------------------------------------------------- submit_score

-- Knockout rows are created empty — nobody knows who plays a semifinal until the
-- round robin ends — so entering the score is also what records the line-up.
--
-- The old three-argument version is dropped first: leaving both would make a
-- three-argument call ambiguous, and Postgres would refuse it outright.

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
  v_uid      uuid := auth.uid();
  v_club     uuid;
  v_member   public.members%rowtype;
  v_game     public.games%rowtype;
  v_played   boolean;
  v_knockout boolean;
  v_team_a   uuid[];
  v_team_b   uuid[];
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

revoke all    on function public.submit_score(uuid, int, int, uuid[], uuid[]) from public, anon;
grant execute on function public.submit_score(uuid, int, int, uuid[], uuid[]) to authenticated;
