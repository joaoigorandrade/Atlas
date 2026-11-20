-- A node written without a plan should run its KIND's plan, not the legacy six.
--
-- `phase_plan` was given the pre-catalogue ladder as its default so the same
-- migration that added the column could backfill every row already on disk.
-- That was right for rows built before kinds existed. It is wrong for rows
-- written after, and exactly one kind of row is still written without naming a
-- plan: a gap node. Both clients invent one locally (`spawnGap`), send neither
-- `kind` nor `phase_plan`, and let the defaults stand.
--
-- The two defaults disagree. `kind` falls to 'concept', whose plan is eight
-- rungs; `phase_plan` fell to the legacy six. So a spawned gap ran the concept
-- ladder in the session that spawned it — both clients resolve an *absent* plan
-- from the kind — and the legacy one on every launch after, having quietly lost
-- Discriminate and Recall between one app open and the next.
--
-- Empty is the honest default: it is what "this row never named a plan" means,
-- and it is already what both resolvers read as "use the kind's"
-- (`phasePlan()` in lib/curriculum/phases.ts, `ConceptNode.plan` in
-- Domain/Phases.swift, both guarded on length). Rows that DO name a plan are
-- untouched, so "a plan is frozen at build" still holds for every map.
alter table public.nodes alter column phase_plan set default '{}';

-- The gaps already written under the old default. Only gaps: a node the map
-- builder created named its plan explicitly, and a pre-catalogue row was
-- backfilled to the legacy six on purpose — neither is guessing, and neither
-- moves. Emptying these lets each one resolve from the `kind` it was stored
-- with, which is the plan it ran the day it was spawned.
update public.nodes
   set phase_plan = '{}'
 where is_gap
   and phase_plan = '{consume,socratic,feynman,connect,crucible,retain}';
