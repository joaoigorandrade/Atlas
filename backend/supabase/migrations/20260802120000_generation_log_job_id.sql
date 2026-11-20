-- Splits the two things `generation_log` was being asked to measure with one
-- number.
--
-- Until now every /api/generate request inserted exactly one row, and both
-- ceilings counted rows. That was fine while one request meant one model call.
-- It stops being fine as soon as a request fans out — the Consume pass alone
-- makes a reading call plus a follow-up for its adaptive rewrites — because
-- the learner would be charged one unit of quota for several units of spend.
--
-- So: a request inserts one row per model call it may make, all sharing a
-- job_id. The monthly ceiling keeps counting rows, which is now a true call
-- count and a true proxy for spend. The per-learner daily quota counts
-- distinct job_ids, which is what "a learner's fair share of surfaces" always
-- meant — 60 jobs is exactly the number the old row count stood for.

alter table public.generation_log
  add column job_id uuid not null default gen_random_uuid();

-- The default backfills every historical row with its own job_id, so each
-- existing row counts as one job and today's numbers don't move when this
-- lands.

create index generation_log_user_day_job
  on public.generation_log (user_id, created_at desc, job_id);

-- Distinct jobs this learner has started today (UTC), for the daily quota.
-- security invoker: the existing "Users read own generation rows" policy is
-- what scopes it, so this can never see another learner's rows.
create or replace function public.generation_jobs_today()
returns bigint
language sql
security invoker
set search_path = ''
stable
as $$
  select count(distinct job_id) from public.generation_log
  where user_id = (select auth.uid())
    and created_at >= date_trunc('day', (now() at time zone 'utc'));
$$;

revoke all on function public.generation_jobs_today() from public;
revoke execute on function public.generation_jobs_today() from anon;
grant execute on function public.generation_jobs_today() to authenticated;
