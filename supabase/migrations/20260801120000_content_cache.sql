-- Generated-content cache + a run_states split, both in service of one goal:
-- a screen should open from the database, not from an LLM round-trip.
--
-- 1. `content_cache` is keyed by a server-computed SHA-256 of the exact prompt
--    inputs (kind + topic + node + interests + …). Identical inputs produce
--    interchangeable content, so a row is shared across users: the second
--    learner to open a concept pays neither the latency nor the spend. Only
--    the hash is stored — the raw inputs (a learner's typed interests) never
--    land in a shared table.
--
--    RLS is on with NO policies, so the table is unreachable with the
--    browser's publishable key. Only the server's service-role client, behind
--    /api/generate and /api/content, ever touches it.
--
-- 2. `run_states.caches` moves the per-run generated content out of the
--    `snapshot` blob. The map only needs graph/states/positions to render, and
--    it no longer waits on megabytes of chunks to arrive; the frequent
--    write-through saves stop re-uploading that content on every node drag.

create table public.content_cache (
  key text primary key,
  kind text not null,
  payload jsonb not null,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now()
);

create index content_cache_kind_created on public.content_cache (kind, created_at desc);

alter table public.content_cache enable row level security;

-- Read + count the hit in one round-trip; the route is latency-sensitive.
create or replace function public.content_cache_get(cache_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare hit jsonb; -- not `found`: plpgsql already defines that one
begin
  update public.content_cache
     set hits = hits + 1, last_hit_at = now()
   where key = cache_key
  returning payload into hit;
  return hit;
end;
$$;

-- The batch warm: one call fills every already-generated surface at once.
create or replace function public.content_cache_get_many(cache_keys text[])
returns table (key text, payload jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.content_cache c
     set hits = c.hits + 1, last_hit_at = now()
   where c.key = any(cache_keys);
  return query
    select c.key, c.payload from public.content_cache c
     where c.key = any(cache_keys);
end;
$$;

-- Service-role only, matching the table: no browser client may call these.
revoke all on function public.content_cache_get(text) from public;
revoke all on function public.content_cache_get(text) from anon, authenticated;
revoke all on function public.content_cache_get_many(text[]) from public;
revoke all on function public.content_cache_get_many(text[]) from anon, authenticated;
grant execute on function public.content_cache_get(text) to service_role;
grant execute on function public.content_cache_get_many(text[]) to service_role;

-- ---- run_states: split the content caches off the hot snapshot ------------

alter table public.run_states
  add column caches jsonb not null default '{}'::jsonb;

-- A caches-only upsert must be able to create the row, so snapshot needs a
-- default; the core save fills it moments later.
alter table public.run_states
  alter column snapshot set default '{}'::jsonb;

-- Copy, don't move: leaving `snapshot.caches` in place keeps the currently
-- deployed build working whichever side of the deploy this migration lands on.
-- A v1/v2 row is read from whichever copy it has, and the first core save
-- after it rewrites the snapshot as v3 — without the caches — so the
-- duplication clears itself.
update public.run_states
   set caches = snapshot -> 'caches'
 where snapshot ? 'caches';
