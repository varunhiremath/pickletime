-- PickleTime — schema
--
-- Run this FIRST, then policies.sql, then functions.sql.
-- Safe to re-run: everything is IF NOT EXISTS / CREATE OR REPLACE.
--
-- Design notes worth keeping in mind when editing:
--   * members.user_id is NULL until an invite is claimed. Postgres allows
--     repeated NULLs in a UNIQUE constraint, which is exactly what we want:
--     many unclaimed roster entries, but only one account per club.
--   * Every foreign key cascades, so deleting a club or a session takes its
--     derived rows with it. Standings are computed from games, so a partial
--     delete would leave the table referencing players who no longer exist.
--   * Scores are never written directly — see functions.sql submit_score().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- clubs

create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- members

create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  -- NULL until the person claims their invite on a device.
  user_id      uuid references auth.users(id) on delete set null,
  role         text not null default 'player' check (role in ('admin', 'player')),
  color_index  int  not null default 0,
  created_at   timestamptz not null default now(),
  -- One account per club. Repeated NULLs are permitted, so any number of
  -- roster entries can sit unclaimed.
  unique (club_id, user_id)
);

create index if not exists members_club_idx on public.members(club_id);
create index if not exists members_user_idx on public.members(user_id);

-- ---------------------------------------------------------------- invites

-- One live invite per member. The code is stored readable so the admin can
-- re-send it; policies.sql restricts SELECT on this table to club admins, so
-- nobody else can read a code and claim a friend's identity.
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  member_id   uuid not null unique references public.members(id) on delete cascade,
  code        text not null check (length(code) >= 6),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  claimed_at  timestamptz,
  revoked     boolean not null default false
);

-- Codes are matched case-insensitively, so uniqueness has to be too.
create unique index if not exists invites_code_key on public.invites(upper(code));
create index if not exists invites_club_idx on public.invites(club_id);

-- Brute-force throttle for claim_invite(). The code space is ~40 bits, which is
-- not much against unlimited guessing, so attempts are counted per account.
create table if not exists public.claim_attempts (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  attempts      int not null default 0,
  window_start  timestamptz not null default now()
);

-- ---------------------------------------------------------------- sessions

create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  name        text not null default 'Session',
  date        date not null default current_date,
  format      text not null,
  player_ids  uuid[] not null default '{}',
  num_games   int  not null default 0,
  courts      int  not null default 1 check (courts >= 1),
  points_to   int  not null default 11 check (points_to >= 1),
  -- The seed the schedule was generated from. Same seed, same schedule —
  -- see src/utils/rng.js. bigint because it is an unsigned 32-bit value.
  rng_seed    bigint not null default 0,
  status      text not null default 'live' check (status in ('draft', 'live', 'final')),
  created_by  uuid references public.members(id) on delete set null,
  imported    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Which format the session is played in. Kept as a named constraint added
-- separately rather than inline, so widening it for a new format is an ALTER
-- rather than a table rewrite. See supabase/migrate-pairs.sql.
--
--   singles           one player per side, round robin
--   doubles_americano partners rotate every game; players are ranked
--   doubles_pairs     partners are fixed for the session; TEAMS are ranked
--
-- Dropped and re-added rather than guarded with `when duplicate_object`: on a
-- database that already has an older, narrower version of this constraint,
-- add-and-swallow would silently keep the narrow one, and creating a session in
-- the new format would still fail. Re-running this file has to actually widen it.
do $$
declare
  v_name text;
begin
  select con.conname into v_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'sessions'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%format%'
   limit 1;

  if v_name is not null then
    execute format('alter table public.sessions drop constraint %I', v_name);
  end if;

  alter table public.sessions
    add constraint sessions_format_check
    check (format in ('singles', 'doubles_americano', 'doubles_pairs'));
end $$;

-- Start time, as "HH:MM" 24-hour text. Text rather than `time` because it is
-- only ever displayed, never compared or arithmetic'd, and a bare `time` column
-- invites timezone questions that do not apply to "we play at nine".
-- Nullable: a session without a set time is perfectly normal.
alter table public.sessions add column if not exists start_time text;

-- Whether this session finishes with a knockout stage: top four seeds into
-- semifinals, then a third-place game and a final. The four fixtures live in
-- `games` like any other; this flag only records that the session was set up
-- with them, so the UI can say "no playoffs" rather than "playoffs not reached".
alter table public.sessions add column if not exists playoffs boolean not null default false;

create index if not exists sessions_club_idx on public.sessions(club_id, created_at desc);

-- ---------------------------------------------------------------- games

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  ordinal     int  not null,
  round       int  not null default 1,
  court       int  not null default 1,
  team_a      uuid[] not null,
  team_b      uuid[] not null,
  byes        uuid[] not null default '{}',
  score_a     int,
  score_b     int,
  played      boolean not null default false,
  scored_by   uuid references public.members(id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (session_id, ordinal)
);

-- Which part of the tournament a game belongs to.
--
-- 'rr' is an ordinary round-robin fixture and is the default, so every game
-- written before playoffs existed keeps meaning exactly what it meant.
--
-- The knockout rows are created with the session but start with EMPTY team_a
-- and team_b: nobody knows who plays a semifinal until the round robin is done.
-- src/utils/bracket.js derives the line-ups from the standings for display, and
-- submit_score() writes them onto the row the moment a score is entered — after
-- which the stored line-up is the record of who actually played.
alter table public.games
  add column if not exists stage text not null default 'rr';

alter table public.games
  add column if not exists slot text;

do $$
begin
  alter table public.games
    add constraint games_stage_check
    check (stage in ('rr', 'sf', 'bronze', 'final'));
exception
  when duplicate_object then null;
end $$;

-- A session has at most one of each knockout fixture. Round-robin games have a
-- NULL slot, and Postgres allows any number of those.
create unique index if not exists games_session_slot_key
  on public.games(session_id, slot)
  where slot is not null;

create index if not exists games_session_idx on public.games(session_id, ordinal);

-- ---------------------------------------------------------------- score_events

-- Append-only audit log. policies.sql grants no INSERT/UPDATE/DELETE to
-- anybody, so the only writer is submit_score(), which is SECURITY DEFINER.
-- That is what makes "anyone can edit any score" safe: every change is
-- attributable and nothing can be rewritten after the fact.
create table if not exists public.score_events (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  member_id   uuid references public.members(id) on delete set null,
  score_a     int,
  score_b     int,
  prev_a      int,
  prev_b      int,
  created_at  timestamptz not null default now()
);

-- Knockout line-ups are part of a score change: entering the final's score is
-- also the act that records who reached it. Logging them keeps the audit trail
-- complete — otherwise a bracket could be re-pointed at different players with
-- nothing but the score showing in the log.
alter table public.score_events add column if not exists team_a uuid[];
alter table public.score_events add column if not exists team_b uuid[];

create index if not exists score_events_game_idx
  on public.score_events(game_id, created_at desc);

-- ---------------------------------------------------------------- realtime

-- Broadcast row changes on games so every phone reorders its standings the
-- moment anyone scores. Wrapped because adding a table twice raises an error.
do $$
begin
  alter publication supabase_realtime add table public.games;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.sessions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.members;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
