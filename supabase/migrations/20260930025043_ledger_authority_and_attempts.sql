-- W0.1: when each phase first closed on a node, stamped by the server the
-- first time the phase appears in phases_done. The later-day rule (W4.1) reads it.
alter table public.nodes
  add column if not exists phase_closed_at jsonb not null default '{}'::jsonb;

-- W0.2: every phase close, pass or fail, never overwritten.
create table if not exists public.phase_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  node_id text not null,
  phase text not null,
  passed boolean not null,
  score real,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists phase_attempts_topic_idx on public.phase_attempts (topic_id, node_id, at);
create index if not exists phase_attempts_user_idx on public.phase_attempts (user_id, at);

alter table public.phase_attempts enable row level security;
create policy "read own" on public.phase_attempts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own" on public.phase_attempts for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.topics tp where tp.id = topic_id and tp.user_id = (select auth.uid())));
revoke all on public.phase_attempts from anon;
