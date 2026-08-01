-- PickleTime — row-level security
--
-- Run AFTER schema.sql, BEFORE functions.sql.
-- Safe to re-run: every policy is dropped before being recreated.
--
-- This file is what makes the app's anon key safe to ship in the bundle.
-- Nothing here trusts the client; every rule is evaluated in the database.

-- ================================================================
-- Helpers
-- ================================================================
--
-- These MUST be SECURITY DEFINER. The policy on `members` needs to ask "is the
-- caller a member of this club?", which means querying `members` — and a policy
-- on a table that queries that same table recurses forever. A definer function
-- runs as its owner and bypasses RLS, breaking the cycle. This is the single
-- most common way to get RLS wrong on Supabase.
--
-- `set search_path = public` is not decoration either: a SECURITY DEFINER
-- function with a mutable search_path can be hijacked by a caller who creates a
-- shadowing object in a schema earlier on the path.

create or replace function public.is_member(club uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.club_id = club and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_admin(club uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.club_id = club and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

-- Child tables reach their club through these.
create or replace function public.club_of_session(s uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select club_id from public.sessions where id = s;
$$;

create or replace function public.club_of_game(g uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select s.club_id
  from public.games gm
  join public.sessions s on s.id = gm.session_id
  where gm.id = g;
$$;

-- ================================================================
-- Enable RLS everywhere
-- ================================================================

alter table public.clubs          enable row level security;
alter table public.members        enable row level security;
alter table public.invites        enable row level security;
alter table public.sessions       enable row level security;
alter table public.games          enable row level security;
alter table public.score_events   enable row level security;
alter table public.claim_attempts enable row level security;

-- ================================================================
-- clubs
-- ================================================================
-- No INSERT policy: a brand-new account belongs to no club, so there is nothing
-- for a policy to check against. Club creation goes through create_club().

drop policy if exists clubs_select on public.clubs;
create policy clubs_select on public.clubs
  for select using (public.is_member(id));

drop policy if exists clubs_update on public.clubs;
create policy clubs_update on public.clubs
  for update using (public.is_admin(id)) with check (public.is_admin(id));

drop policy if exists clubs_delete on public.clubs;
create policy clubs_delete on public.clubs
  for delete using (public.is_admin(id));

-- ================================================================
-- members
-- ================================================================

drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select using (public.is_member(club_id));

drop policy if exists members_insert on public.members;
create policy members_insert on public.members
  for insert with check (public.is_admin(club_id));

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update using (public.is_admin(club_id)) with check (public.is_admin(club_id));

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete using (public.is_admin(club_id));

-- ================================================================
-- invites
-- ================================================================
-- SELECT is admin-only, deliberately. Codes are stored readable so the admin can
-- re-send one, which means anyone who could read this table could claim a
-- friend's identity. Claiming happens through claim_invite(), which is
-- SECURITY DEFINER and therefore does not need the caller to read the row.

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select using (public.is_admin(club_id));

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert with check (public.is_admin(club_id));

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites
  for update using (public.is_admin(club_id)) with check (public.is_admin(club_id));

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete using (public.is_admin(club_id));

-- ================================================================
-- sessions
-- ================================================================

drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select using (public.is_member(club_id));

drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions
  for insert with check (public.is_admin(club_id));

drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions
  for update using (public.is_admin(club_id)) with check (public.is_admin(club_id));

drop policy if exists sessions_delete on public.sessions;
create policy sessions_delete on public.sessions
  for delete using (public.is_admin(club_id));

-- ================================================================
-- games
-- ================================================================
-- NOTE THE ABSENCE OF AN UPDATE POLICY. This is load-bearing, not an oversight.
--
-- With no UPDATE policy, no client can write a score directly — not a player,
-- not even the admin. The only path is submit_score(), which appends to
-- score_events in the same transaction. That is what makes the audit log
-- impossible to bypass, and it is what makes "anyone can edit any score" a safe
-- feature rather than a reckless one.
--
-- INSERT/DELETE are admin-only because those are schedule generation, not
-- scoring.

drop policy if exists games_select on public.games;
create policy games_select on public.games
  for select using (public.is_member(public.club_of_session(session_id)));

drop policy if exists games_insert on public.games;
create policy games_insert on public.games
  for insert with check (public.is_admin(public.club_of_session(session_id)));

drop policy if exists games_delete on public.games;
create policy games_delete on public.games
  for delete using (public.is_admin(public.club_of_session(session_id)));

-- Tripwire. RESTRICTIVE is the important word: permissive policies are OR'd
-- together, so a plain permissive policy here would be silently overridden the
-- moment somebody adds another one. A restrictive policy is AND'd — every future
-- UPDATE policy must ALSO satisfy this one, and this one never passes. So the
-- "no direct score writes" rule survives a well-meaning edit.
drop policy if exists games_no_direct_update on public.games;
create policy games_no_direct_update on public.games
  as restrictive for update using (false) with check (false);

-- ================================================================
-- score_events
-- ================================================================
-- Readable by club members, writable by nobody. submit_score() is SECURITY
-- DEFINER so it writes past these policies; a client cannot forge, amend or
-- erase an entry.

drop policy if exists score_events_select on public.score_events;
create policy score_events_select on public.score_events
  for select using (public.is_member(public.club_of_game(game_id)));

-- ================================================================
-- claim_attempts
-- ================================================================
-- Bookkeeping for the brute-force throttle. Only claim_invite() touches it, and
-- that runs as definer. No policies at all, so the table is invisible to
-- clients — a caller must not be able to read or reset their own attempt count.

-- ================================================================
-- Grants
-- ================================================================
-- RLS decides row visibility; grants decide whether the role can reach the table
-- at all. Both are needed. score_events and claim_attempts get no write grants.

grant usage on schema public to anon, authenticated;

grant select, update, delete on public.clubs    to authenticated;
grant select, insert, update, delete on public.members  to authenticated;
grant select, insert, update, delete on public.invites  to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, delete on public.games             to authenticated;
grant select on public.score_events                      to authenticated;
