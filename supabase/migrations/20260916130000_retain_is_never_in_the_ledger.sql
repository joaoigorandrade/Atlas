-- `retain` is closed by review history, never by a session — so it has no
-- business in `phases_done`.
--
-- Every reader already knows this and works around it: `planGates` drops
-- `retain` before deciding mastery, `phaseIndex` reads the `reviewed` column
-- for that rung instead of the ledger, and the detail rail ticks it from
-- `reviewed` too. Nothing is therefore *broken* by a stray entry — which is
-- exactly why it went unnoticed.
--
-- It is still a lie in the data. A row reading
-- `phases_done @> '{retain}'` with `reviewed = false` says the learner
-- finished a rung they cannot have finished, and the next thing to read this
-- column without knowing the convention will believe it. The writer that
-- produced these (the iOS placement's `applyDiagnosticLedger`, which ticked
-- the whole plan instead of its gates) is fixed; this clears what it wrote.
--
-- Unconditional rather than guarded on `reviewed`: the entry is meaningless in
-- both cases. A node that really has been reviewed says so in its own column.
update public.nodes
   set phases_done = array_remove(phases_done, 'retain')
 where 'retain' = any(phases_done);
