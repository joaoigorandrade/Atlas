-- The domain axis: what settles a claim in this corner of the world.
--
-- `kind` says what the learner must be able to DO — tell instances apart, run
-- a sequence, predict what changes. It deliberately does not say what subject
-- the node belongs to, and it structurally cannot: "settle it by deriving it"
-- and "settle it by reading the source in context" are not two kinds of doing,
-- they are two kinds of warrant.
--
-- The default is `general`, which produces byte-identical prompts and the
-- byte-identical ladder the pre-domain engine produced. That is what lets this
-- ship without a `content_cache` VERSION bump and without re-cutting any run
-- already in progress: `domainOf` (lib/server/job.ts) omits `general` from the
-- cache key exactly as `nodeKindOf` omits `concept`.

alter table public.topics
  -- The map's own domain, which decides what a node is, what an edge means,
  -- how many nodes there are and which axis they are laid out on.
  add column if not exists domain text not null default 'general';

alter table public.nodes
  -- A node's own domain. Usually the topic's, but not always: a machine
  -- learning map has `formal` nodes (the gradient) and `executable` ones
  -- (implement the layer).
  add column if not exists domain text not null default 'general';
