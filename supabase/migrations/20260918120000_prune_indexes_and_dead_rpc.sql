-- Three things the audit turned up in the schema itself.
--
-- 1. The nightly prune had no index for its own predicate.
--
-- Both caches are deleted by `last_hit_at < cutoff`, and neither table had an
-- index leading with that column — `speech_cache` had one on `created_at`,
-- which nothing queries at all. So the one cron the plan allows sequentially
-- scanned both tables every night, and `speech_cache` is the largest table in
-- the schema by bytes (a base64 clip per row, one row per distinct voice ×
-- language × prose, forever).
create index if not exists content_cache_last_hit
  on public.content_cache (last_hit_at);
create index if not exists speech_cache_last_hit
  on public.speech_cache (last_hit_at);
drop index if exists public.speech_cache_created;

-- 2. `content_cache_get_many` scanned the table twice.
--
-- It UPDATEd the hit counters and then ran a second SELECT over the same keys.
-- `returning` does both in one pass — this is the map-open hot path, up to 40
-- keys per /api/content call.
create or replace function public.content_cache_get_many(cache_keys text[])
returns table(key text, payload jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.content_cache c
       set hits = c.hits + 1, last_hit_at = now()
     where c.key = any(cache_keys)
    returning c.key, c.payload;
end;
$$;

-- 3. A dead SECURITY DEFINER function, readable by every signed-in learner.
--
-- `generation_calls_this_month()` was written for a spend ceiling that no
-- longer exists — `app/api/generate/route.ts` says so in as many words, and
-- nothing in lib/ or app/ has called either quota function since. It counted
-- `generation_log` across ALL users with no `user_id` predicate and was granted
-- to `authenticated`, so any signed-in learner could read the deployment's
-- total generation count over `/rest/v1/rpc/`. Dropping it is also the cheapest
-- answer to its missing index: the seq scan goes with it.
--
-- `generation_jobs_today()` stays. It is equally uncalled today, but it is
-- correctly scoped (`user_id = auth.uid()`), is not SECURITY DEFINER, and is
-- the per-learner daily quota the log was designed to feed.
drop function if exists public.generation_calls_this_month();

-- 4. `nodes.state` was unvalidated text.
--
-- `kind` got a check constraint when it was added; `state` never had one, and
-- `applyNodeDeltas` writes whatever a client sends. One PATCH with a typo'd
-- state stores permanently: the web renders it with an undefined colour, and
-- iOS decodes `NodeState` with no unknown-case fallback, so the whole bootstrap
-- throws and the library stops loading on the phone until the row is repaired.
-- The constraint is a smaller diff than validating at the route, and it is
-- where `kind`'s already lives.
update public.nodes
   set state = 'unknown'
 where state not in ('unknown', 'learning', 'shaky', 'mastered', 'gap');

alter table public.nodes
  drop constraint if exists nodes_state_check;
alter table public.nodes
  add constraint nodes_state_check
  check (state in ('unknown', 'learning', 'shaky', 'mastered', 'gap'));
