-- PickleTime — more than one time through the round robin
--
-- RUN THIS BEFORE THE NEW APP REACHES ANY PHONE. Without it, creating a
-- session fails with "column rr_passes does not exist" — every session writes
-- the column, not only the ones asking for a second pass.
--
-- Paste it into the Supabase SQL editor and run it once. Safe to re-run.
--
-- WHY IT EXISTS
--
-- Four players is six games, which is twenty minutes and then everyone stands
-- about. A small field wants to play everyone twice or three times, and that is
-- a better tournament than one pass either way: the table stops turning on a
-- single bad game.
--
-- Stored rather than derived, unlike the pools. It is a setup choice in the
-- same family as `courts` and `points_to`, and reshuffling has to know what was
-- asked for — counting the fixtures back would guess wrong the moment somebody
-- is removed from the draw.
--
-- Defaulting to 1 means every existing session is exactly what it already was.

alter table public.sessions
  add column if not exists rr_passes int not null default 1;

-- Named separately so re-running widens an older constraint rather than
-- failing on a duplicate.
do $$
begin
  if not exists (
    select 1
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'sessions'
       and con.conname = 'sessions_rr_passes_check'
  ) then
    alter table public.sessions
      add constraint sessions_rr_passes_check check (rr_passes between 1 and 5);
  end if;
end $$;
