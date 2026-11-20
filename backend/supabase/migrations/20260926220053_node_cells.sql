-- The node grid: importance becomes three rows — the bar a node is held to
-- (core = master it, working = use it, peripheral = recognise it) — and every
-- node starts recording how long each of its phases really took, which is what
-- the per-cell time budgets (`CELL_BUDGET`) get tuned against.

-- `support` was the old second row: needed to use, not to master. That is
-- exactly `working`, so the rows move with their meaning.
alter table public.nodes drop constraint if exists nodes_importance_check;
update public.nodes set importance = 'working' where importance = 'support';
alter table public.nodes
  add constraint nodes_importance_check
  check (importance in ('core', 'working', 'peripheral'));

-- Active seconds per phase, keyed by phase id. Only visible, recently-used
-- time is counted by the clients, so a tab left open overnight is not a
-- 10-hour Consume.
alter table public.nodes
  add column if not exists phase_seconds jsonb not null default '{}'::jsonb;

-- One increment, atomically, so two tabs or a phone and a browser adding time
-- to the same phase never overwrite each other. Security invoker: RLS decides
-- whose node it is, exactly as for every other node write. Each call is
-- capped at an hour, which is longer than any honest session.
create or replace function public.add_phase_seconds(
  p_topic uuid,
  p_node text,
  p_phase text,
  p_seconds integer
) returns void
language sql
security invoker
set search_path = ''
as $$
  update public.nodes
  set phase_seconds = jsonb_set(
    phase_seconds,
    array[p_phase],
    to_jsonb(
      coalesce((phase_seconds ->> p_phase)::integer, 0)
      + least(greatest(p_seconds, 0), 3600)
    )
  )
  where topic_id = p_topic and id = p_node;
$$;

grant execute on function public.add_phase_seconds(uuid, text, text, integer)
  to authenticated;
