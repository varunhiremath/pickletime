-- PickleTime — pooled singles migration
--
-- RUN THIS BEFORE THE NEW APP REACHES ANY PHONE. Creating a pooled session
-- writes format = 'singles_pools', which the existing CHECK constraint rejects.
-- Without it, creating one fails with "violates check constraint
-- sessions_format_check" and nothing else in the app is affected.
--
-- Paste it into the Supabase SQL editor and run it once. Safe to re-run.
--
-- Nothing else changes, and in particular there is no `pool` column. Pool play
-- never crosses pools, so the fixtures themselves already say who is in which
-- pool — a pool is a connected component of the fixture graph. A column would
-- be a second source of truth that could disagree with the games it describes.
-- See src/utils/pools.js.

do $$
declare
  v_name text;
begin
  -- The constraint is normally named sessions_format_check, but a table created
  -- by an older script may have named it differently. Find whichever CHECK is
  -- guarding `format` and replace it, rather than assuming the name.
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
    check (format in ('singles', 'doubles_americano', 'doubles_pairs', 'singles_pools'));
end $$;
