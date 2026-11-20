-- The phase catalogue: per-node phase plans, and the inversion.
--
-- Phase used to be *derived from mastery state* — a fixed six-tuple indexed by
-- `phaseIndex(state, reviewed)` — so every node on every map ran the same six
-- rungs, and `mastered` was reachable only by passing Crucible. Now the node
-- carries what kind of thing it is, the ladder that follows from that, and the
-- record of what the learner has finished; state is derived from the record.
--
-- All four kinds run the same six phases today. The catalogue lands before the
-- phases that make the ladders differ, so nothing a learner sees moves.

alter table public.nodes
  -- What kind of thing the concept is. Everything already on the map was
  -- taught as a concept, so that is what it was, and the default is honest.
  add column if not exists kind text not null default 'concept',
  -- The ladder, resolved from `kind` at map-build time and frozen here.
  -- Stored rather than recomputed: shipping a new catalogue must not re-cut
  -- the rungs under a run already in progress.
  add column if not exists phase_plan text[] not null default
    '{consume,socratic,feynman,connect,crucible,retain}',
  -- What the learner has finished, in completion order. Mastery state is
  -- derived from this.
  add column if not exists phases_done text[] not null default '{}',
  -- One home for every future phase's resumable session, keyed by phase id.
  -- The four `*_progress` columns above it are one-per-phase, which would mean
  -- an eight-file hand edit per new phase; this is the last such migration.
  add column if not exists phase_progress jsonb not null default '{}';

-- Guarded like the columns above it: this migration is already applied on
-- prod, and a replay must not fail on the one statement that isn't idempotent.
alter table public.nodes
  drop constraint if exists nodes_kind_check;
alter table public.nodes
  add constraint nodes_kind_check
  check (kind in ('fact', 'concept', 'procedure', 'principle'));

-- Backfill `phases_done` so every run in flight shows the same rung it shows
-- today. This reproduces the old `readingPhaseIndex(state, reviewed, progress)`
-- exactly, which is the check the rehearsal on a Supabase branch asserts:
--
--   unknown / gap  → -1, locked or no spiral at all       → empty ledger
--   frontier       → 0, Consume                           → empty ledger
--   learning       → 0 / 1 / 2, decided by the reading record (below)
--   shaky          → 4, Crucible                          → the first four
--   mastered       → 5, Retained, or 6 once reviewed      → every gate
--
-- Retain is never backfilled: it is closed by `reviewed`, not by a session,
-- and `phaseIndex` reads that column directly.
update public.nodes set phases_done =
  case
    when state = 'learning' then
      case
        -- Left part-way through: Consume is still the current phase, which is
        -- the correction `readingPhaseIndex` existed to make.
        when consume_progress is not null
         and not coalesce((consume_progress->>'finished')::boolean, false)
          then array[]::text[]
        -- Read through, never questioned: Socratic is current.
        when consume_progress is not null
         and not coalesce((consume_progress->>'handedOff')::boolean, false)
          then array['consume']
        -- Handed off, or no reading record at all — the old state-derived
        -- answer stood, and that was Feynman.
        else array['consume','socratic']
      end
    when state = 'shaky' then array['consume','socratic','feynman','connect']
    when state = 'mastered'
      then array['consume','socratic','feynman','connect','crucible']
    else array[]::text[]
  end
where phases_done = '{}' and state in ('learning', 'shaky', 'mastered');
