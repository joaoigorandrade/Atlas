-- Re-backfill the phase ledger for rows that drifted after the catalogue landed.
--
-- The catalogue migration backfilled `phases_done` once, for every run in
-- flight. What it could not cover is rows written *since* by a surface that
-- still set mastery as a literal: the placement diagnostic on both clients
-- (`applyDiagnosticEffect`) writes `mastered`/`shaky` straight into the state
-- map, and the iOS client wrote state literals everywhere until the inversion
-- landed there. Each of those produced a node that is Dominado with an empty
-- ledger.
--
-- That is not cosmetic. State is *derived* from this column now, so such a node
-- reads as Dominado over a rail with nothing ticked, its CTA opens Consume
-- while its header says it is finished, and the next phase it closes re-derives
-- it back to Learning — walking real mastery backwards.
--
-- Identical mapping to the catalogue migration's own backfill, and identical
-- guard: only rows whose ledger is still empty, so a run that has recorded
-- anything is never overwritten. Re-runnable.
--
-- Note the ladder used: `phase_plan` is the node's *own* stored plan, not a
-- fixed six — a row written after the four ladders started differing has to be
-- backfilled against the ladder it actually runs, or the last gate named here
-- is a phase the node never had.
update public.nodes set phases_done =
  case
    when state = 'learning' then
      case
        when consume_progress is not null
         and not coalesce((consume_progress->>'finished')::boolean, false)
          then array[]::text[]
        when consume_progress is not null
         and not coalesce((consume_progress->>'handedOff')::boolean, false)
          then array['consume']
        else array['consume','socratic']
      end
    -- Every gate but the last, so a Shaky node is owed precisely the gate its
    -- `diagnostic-hesitation` / `crucible-fail` line promises, and no more.
    when state = 'shaky'
      then (select coalesce(array_agg(p order by i), array[]::text[])
              from unnest(phase_plan) with ordinality as g(p, i)
             where p <> 'retain'
               and i < (select max(i2) from unnest(phase_plan) with ordinality as g2(p2, i2)
                         where p2 <> 'retain'))
    -- Every gate. Retain is never backfilled: it is closed by `reviewed`, not
    -- by a session, and `phaseIndex` reads that column directly.
    when state = 'mastered'
      then (select coalesce(array_agg(p order by i), array[]::text[])
              from unnest(phase_plan) with ordinality as g(p, i)
             where p <> 'retain')
    else array[]::text[]
  end
where phases_done = '{}' and state in ('learning', 'shaky', 'mastered');
