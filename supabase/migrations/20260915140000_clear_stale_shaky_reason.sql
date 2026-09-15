-- A shaky reason on a node that isn't Shaky.
--
-- The reason used to be inert: state was the input, and the reason only chose
-- which honest line to print *when* state happened to be `shaky`. So nothing
-- ever cleared it when a flagged node later went green, and prod carries rows
-- that are `mastered` with a `diagnostic-hesitation` or a `crucible-fail`
-- still on them.
--
-- With the phase catalogue, state is derived from the ledger and a leftover
-- reason is no longer inert: `stateFromPlan` returns `shaky` whenever one is
-- present, so the next phase any of those nodes finished would drop it out of
-- green for a gate it had already passed.
--
-- `assemble` guards the same invariant on read, so this is belt and braces —
-- but the rows should not carry a contradiction either way.
update public.nodes
  set shaky_reason = null
  where shaky_reason is not null and state <> 'shaky';
