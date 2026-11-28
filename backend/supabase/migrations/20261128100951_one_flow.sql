-- One flow (docs/PLAN-FLOW.md): the mastery flow is gone, so a topic built
-- under it has a ladder whose phases no longer exist. Its nodes, edges, cards
-- and content go with it (`on delete cascade`).
--
-- Confirmed against prod on 2026-11-27 before writing this: exactly one such
-- topic (goal 'mastery', 34 nodes, none started, 0 cards). Apply only after
-- re-running that count.
delete from public.topics where goal is distinct from 'glance';

alter table public.topics alter column goal set default 'glance';
