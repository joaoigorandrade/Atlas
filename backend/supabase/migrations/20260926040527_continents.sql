-- Continents: maps that belong together.
--
-- Some subjects are too big for one map, and some maps work better beside
-- each other. A continent groups a learner's topics; each member stays a whole,
-- separate run underneath — the continent only draws them as one landmass and
-- tells each map's generations what its neighbours teach.
--
-- `scopes` holds every offer a too-broad build came back with. A scope is
-- *uncharted* while no member topic carries its subject, so charting one is
-- just creating that topic into the continent — nothing here is updated.
--
-- Dissolving a continent must never take a map with it: `on delete set null`.

create table public.continents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index continents_user_id_idx on public.continents (user_id);

alter table public.continents enable row level security;
create policy "read own" on public.continents for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own" on public.continents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own" on public.continents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own" on public.continents for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.topics
  add column continent_id uuid references public.continents (id) on delete set null;

create index topics_continent_id_idx on public.topics (continent_id);
