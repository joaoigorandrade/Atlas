-- Content a topic owns must outlive both the shared cache's prune and its
-- version bumps. Two halves, one goal: `node_content` stops being a set of
-- pointers that something else is free to delete under it.
--
-- 1. `prune_content_cache` replaces the blind TTL delete the reminders cron
--    used to run. A row nothing has read in a season is still storage worth
--    reclaiming — unless a topic points at it, in which case deleting it takes
--    that learner's reading away and the next open regenerates it. The TTL was
--    written as "a learner returning after a season still opens warm"; without
--    this clause it did the exact opposite to exactly that learner.
--
-- 2. `node_content.payload` is filled alongside `cache_key` from now on (see
--    `putContent`). The pointer stays the fast path — one shared row, read in
--    a batch — and the payload is what survives a CONTENT_CACHE_VERSION bump,
--    which abandons every shared row by design and until now emptied every
--    existing topic with it.

create or replace function public.prune_content_cache(cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare dropped integer;
begin
  with gone as (
    delete from public.content_cache c
     where c.last_hit_at < cutoff
       -- Addressed by a topic: not ours to drop, however cold it is.
       and not exists (
         select 1 from public.node_content nc where nc.cache_key = c.key
       )
    returning 1
  )
  select count(*) into dropped from gone;
  return dropped;
end;
$$;

revoke all on function public.prune_content_cache(timestamptz) from public;
revoke all on function public.prune_content_cache(timestamptz) from anon, authenticated;
grant execute on function public.prune_content_cache(timestamptz) to service_role;

-- The prune's own index: without it every run sequentially scans `node_content`
-- once per candidate row.
create index if not exists node_content_cache_key
  on public.node_content (cache_key)
  where cache_key is not null;
