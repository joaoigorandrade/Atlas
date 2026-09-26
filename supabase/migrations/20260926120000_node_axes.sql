-- Two cost axes per node: how much the learner's goal rests on it, and how hard
-- it is. Importance decides how deep the ladder goes, difficulty how much
-- guidance it gives — both are folded into `phase_plan` at map-build time, and
-- stored here as well because the map draws them (city vs town, the relief
-- beside the city).
--
-- The defaults are honest for every row already on the map: each was built
-- before the axes existed, ran the full ladder, and so behaved as a core,
-- medium concept. Nothing in flight moves.

alter table public.nodes
  add column if not exists importance text not null default 'core',
  add column if not exists difficulty text not null default 'medium';

alter table public.nodes
  drop constraint if exists nodes_importance_check;
alter table public.nodes
  add constraint nodes_importance_check check (importance in ('core', 'support'));

alter table public.nodes
  drop constraint if exists nodes_difficulty_check;
alter table public.nodes
  add constraint nodes_difficulty_check
  check (difficulty in ('easy', 'medium', 'hard'));
