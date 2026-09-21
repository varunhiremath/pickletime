-- PickleTime — active / inactive roster members
--
-- RUN THIS BEFORE THE NEW APP REACHES ANY PHONE. Without it, deactivating a
-- member fails ("column active does not exist") and every roster row reads as
-- active, which is the old behaviour rather than a broken one.
--
-- Paste it into the Supabase SQL editor and run it once. Safe to re-run.
--
-- WHY IT EXISTS
--
-- Deleting a member was the only way to get somebody off the roster, and
-- deleting takes their fixtures and every score on them with it — the
-- standings of a session played three months ago quietly change. Right for a
-- name typed by mistake, completely wrong for somebody who moved away.
--
-- Inactive is a roster state and nothing more. Every game they played, every
-- result, their player page and the sessions they were part of are all
-- untouched; they are simply not offered for the next session. `player_ids` is
-- stored per session, so no past session notices this at all.
--
-- Defaulting to true means every existing member stays exactly as they are.

alter table public.members
  add column if not exists active boolean not null default true;

-- Admins already have UPDATE on members (policies.sql, members_update), and
-- that policy is not column-restricted, so there is nothing further to grant.
