-- #18 · One row per /api/generate call: the per-user daily quota and the
-- global monthly ceiling both count from here, and it doubles as the
-- generation audit log (who, what kind, when).

create table public.generation_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create index generation_log_user_created on public.generation_log (user_id, created_at desc);

alter table public.generation_log enable row level security;

create policy "Users insert own generation rows"
  on public.generation_log for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users read own generation rows"
  on public.generation_log for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Global monthly call count for the spend ceiling: security definer so an
-- ordinary authenticated request can read the cross-user aggregate (a bare
-- count leaks nothing personal).
create or replace function public.generation_calls_this_month()
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select count(*) from public.generation_log
  where created_at >= date_trunc('month', now());
$$;

revoke all on function public.generation_calls_this_month() from public;
revoke execute on function public.generation_calls_this_month() from anon;
grant execute on function public.generation_calls_this_month() to authenticated;
