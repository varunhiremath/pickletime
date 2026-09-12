-- PickleTime — rename the sessions you already have
--
-- A ONE-OFF. Not a migration, not part of schema.sql — run it once and forget
-- it. Nothing in the app depends on it.
--
-- Sessions name themselves now (src/utils/sessionName.js):
--
--   Sept 13 · Sunday Doubles
--   Sept 5 · Saturday Singles
--
-- but the ones created before that are still called "Session", "Session (2)"
-- or whatever was typed at the time. This gives them the same names they would
-- have got today, computed from the date and format already on the row.
--
-- WHAT IT WILL NOT TOUCH
--
--   * A session whose name already says its date. "Sept 13 · Sunday Doubles"
--     and a hand-typed "Sept 13 grudge match" are both left exactly as they
--     are — the point is to fill in the ones that say nothing, not to flatten
--     names somebody chose. That also makes this safe to run twice.
--
-- Paste it into the Supabase SQL editor and run it. It prints every row it
-- changed, old name next to new, so you can see what happened.
--
-- To preview without writing anything, run it inside a transaction:
--   begin;  <paste>  rollback;

with candidate as (
  select
    s.id,
    s.club_id,
    s.name as old_name,
    s.start_time,
    s.created_at,
    -- "Sept 13 · Sunday Doubles". to_char gives Jan…Dec, which matches the app
    -- everywhere except September: people write "Sept", and so does the app.
    (case extract(month from s.date)::int when 9 then 'Sept' else to_char(s.date, 'Mon') end)
      || ' ' || extract(day from s.date)::int
      || ' · ' || trim(to_char(s.date, 'Day'))
      || ' ' || (case when s.format = 'singles' then 'Singles' else 'Doubles' end)
      as base
  from public.sessions s
  where s.date is not null
    -- Skip anything whose name already carries this date. Mirrors
    -- nameCarriesDate() in src/utils/sessionName.js: the month must appear
    -- (any spelling — "Sep", "Sept", "September" all start "sep") and so must
    -- the day, as a number of its own rather than one buried in 2013 or 131.
    and not (
      position(
        lower(substr(
          case extract(month from s.date)::int when 9 then 'Sept' else to_char(s.date, 'Mon') end,
          1, 3
        )) in lower(s.name)
      ) > 0
      and s.name ~ ('(^|[^0-9])' || extract(day from s.date)::int || '([^0-9]|$)')
    )
),
numbered as (
  select
    c.*,
    -- Two sessions on one day would otherwise end up with the same name, which
    -- is the problem this is meant to fix. Oldest keeps the plain name.
    row_number() over (
      partition by c.club_id, c.base
      order by c.start_time nulls first, c.created_at
    ) as seq
  from candidate c
),
final as (
  select
    n.id,
    n.old_name,
    case
      when n.seq = 1 then n.base
      -- A usable start time tells them apart better than a number does.
      when n.start_time ~ '^[0-9]{1,2}:[0-9]{2}$'
        then n.base || ' · ' || to_char(n.start_time::time, 'FMHH12:MI am')
      else n.base || ' · ' || n.seq
    end as new_name
  from numbered n
)
update public.sessions s
   set name = f.new_name
  from final f
 where s.id = f.id
   and s.name is distinct from f.new_name
returning f.old_name as "was", s.name as "now", s.date, s.format;
