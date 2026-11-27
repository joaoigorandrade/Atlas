-- Deeper levels of a map concept (II, III). `deeper` is the specs the map
-- wrote on a base node; `depth` marks a spawned level node. Both nullable:
-- every existing row is a plain level-I node with no levels.
alter table public.nodes
  add column if not exists deeper jsonb,
  add column if not exists depth smallint check (depth in (2, 3));
