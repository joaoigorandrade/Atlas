-- §17 · Coarse per-(user, subject) run persistence. One row holds the whole
-- run as JSON (graph, StateMap, adherence, calibration, generated-content
-- caches); normalize when FSRS lands. RLS keeps rows strictly per-user.

create table public.run_states (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject)
);

alter table public.run_states enable row level security;

create policy "Users read own runs"
  on public.run_states for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own runs"
  on public.run_states for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own runs"
  on public.run_states for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own runs"
  on public.run_states for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Keep updated_at honest on every write; load picks the freshest run by it.
create or replace function public.touch_run_states_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger run_states_touch_updated_at
  before update on public.run_states
  for each row
  execute function public.touch_run_states_updated_at();
