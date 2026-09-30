-- W2.8: rows a human reviewed. The TTL prune never drops one, and a topic
-- built on a verified map says so.
alter table public.content_cache add column if not exists verified boolean not null default false;
alter table public.topics add column if not exists verified boolean not null default false;

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
       -- Reviewed by a person: kept however cold it is.
       and not c.verified
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
