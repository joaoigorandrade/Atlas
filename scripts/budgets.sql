-- What the phases really take, to tune CELL_BUDGET / PHASE_MINUTES /
-- DIFFICULTY_PACE (lib/curriculum/cells.ts, replan.ts; Phases.swift mirrors).
-- Read-only. Run through the Supabase MCP (`execute_sql`, one SELECT per call —
-- it shows only the last result) or psql. PLAN-LEARNING.md W3.6 / M.5.

-- 1. Median active minutes per phase × cell, over phases actually closed.
select
  coalesce(n.importance, 'core') || '/' || coalesce(n.difficulty, 'medium') as cell,
  p.phase,
  count(*) as closed,
  round((percentile_cont(0.5) within group (order by (n.phase_seconds ->> p.phase)::numeric))::numeric / 60, 1)
    as median_min
from nodes n
cross join lateral unnest(n.phases_done) as p(phase)
where not n.is_gap
  and n.phase_seconds ? p.phase
group by 1, 2
order by 1, 2;

-- 2. Median minutes to close every gate of a node, per cell — the number
--    CELL_BUDGET promises.
select
  coalesce(importance, 'core') || '/' || coalesce(difficulty, 'medium') as cell,
  count(*) as nodes,
  round((percentile_cont(0.5) within group (order by total))::numeric / 60, 1) as median_min
from (
  select n.importance, n.difficulty,
         (select sum(value::numeric) from jsonb_each_text(n.phase_seconds)) as total
  from nodes n
  where not n.is_gap and n.state = 'mastered' and n.phase_seconds is not null
) t
group by 1 order by 1;
