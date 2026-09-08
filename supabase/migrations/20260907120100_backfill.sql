-- Move every run_states row into the normalized tables. Pure SQL, no script:
-- the whole corpus is a few hundred rows and this has to be replayable against
-- a branch database without a Node runtime.
--
-- `iosCards` is deliberately not carried. It is SM-2 scheduler state that FSRS
-- cannot read, on decks small enough to re-draft; carrying it would mean
-- inventing stability and difficulty numbers that were never measured.

insert into public.profiles (
  user_id, daily_target, language, streak, best, freezes,
  last_day, met_today, usual_time, reminder_on, history)
select distinct on (user_id)
  user_id,
  coalesce((snapshot->'form'->>'target')::int, 15),
  snapshot->>'language',
  coalesce((snapshot->'adherence'->>'streak')::int, 0),
  coalesce((snapshot->'adherence'->>'best')::int, 0),
  coalesce((snapshot->'adherence'->>'freezes')::int, 0),
  coalesce(snapshot->'adherence'->>'lastDay', ''),
  coalesce((snapshot->'adherence'->>'metToday')::boolean, false),
  coalesce(snapshot->'adherence'->>'usualTime', ''),
  coalesce((snapshot->'adherence'->>'reminderOn')::boolean, false),
  coalesce(snapshot->'adherence'->'history', '[]'::jsonb)
from public.run_states
-- The freshest run is the one whose streak is real; the others are stale copies
-- of the same per-learner counter.
order by user_id, updated_at desc
on conflict (user_id) do nothing;

insert into public.topics (
  user_id, subject, goal, interests, pareto_pct, exam_date, language,
  calib_samples, misconceptions, modality_tally, lit_today, created_at, updated_at)
select
  user_id, subject,
  coalesce(snapshot->'form'->>'goal', 'exam'),
  coalesce(snapshot->'form'->>'interests', ''),
  coalesce((snapshot->'form'->>'paretoPct')::int, 20),
  coalesce(snapshot->'form'->>'examDate', ''),
  snapshot->>'language',
  coalesce(snapshot->'calibSamples', '[]'::jsonb),
  coalesce(snapshot->'misconceptions', '[]'::jsonb),
  coalesce(snapshot->'modalityTally', '{}'::jsonb),
  coalesce(snapshot->'litToday', '[]'::jsonb),
  updated_at, updated_at
from public.run_states
on conflict (user_id, subject) do nothing;

-- Nodes. Position comes from `positions` when the learner has dragged the node
-- and from the node's own generated coordinates otherwise — the browser drew
-- from `positions` only, so that is the authoritative one where it exists.
-- `frontier` is never stored: it is derived from the edges on read, and a
-- stored copy is something for the derivation to disagree with.
insert into public.nodes (
  topic_id, id, user_id, label, summary, g, week, x, y, is_gap,
  state, shaky_reason, reviewed,
  consume_progress, socratic_progress, feynman_progress, connect_progress)
select
  t.id, n->>'id', r.user_id,
  coalesce(n->>'label', ''), n->>'summary',
  coalesce((n->>'g')::int, 0), coalesce((n->>'week')::int, 0),
  coalesce((r.snapshot->'positions'->(n->>'id')->>'x')::double precision, (n->>'x')::double precision, 0),
  coalesce((r.snapshot->'positions'->(n->>'id')->>'y')::double precision, (n->>'y')::double precision, 0),
  coalesce((n->>'gap')::boolean, false),
  nullif(coalesce(r.snapshot->'states'->>(n->>'id'), n->>'state', 'unknown'), 'frontier'),
  r.snapshot->'shakyReasons'->>(n->>'id'),
  coalesce(r.snapshot->'reviewedNodes', '[]'::jsonb) @> to_jsonb(n->>'id'),
  r.snapshot->'consumeProgress'->(n->>'id'),
  r.snapshot->'socraticProgress'->(n->>'id'),
  r.snapshot->'feynmanProgress'->(n->>'id'),
  r.snapshot->'connectProgress'->(n->>'id')
from public.run_states r
join public.topics t on t.user_id = r.user_id and t.subject = r.subject
cross join lateral jsonb_array_elements(coalesce(r.snapshot->'graph'->'nodes', '[]'::jsonb)) n
where n->>'id' is not null
on conflict (topic_id, id) do nothing;

-- `nullif(..., 'frontier')` above leaves a null behind; the column's default
-- only applies to omitted values, so restate it.
update public.nodes set state = 'unknown' where state is null;
alter table public.nodes alter column state set not null;

insert into public.edges (topic_id, from_id, to_id, user_id, dashed)
select t.id, e->>0, e->>1, r.user_id, coalesce((e->>2)::boolean, false)
from public.run_states r
join public.topics t on t.user_id = r.user_id and t.subject = r.subject
cross join lateral jsonb_array_elements(coalesce(r.snapshot->'graph'->'edges', '[]'::jsonb)) e
where e->>0 is not null and e->>1 is not null and e->>0 <> e->>1
on conflict (topic_id, from_id, to_id) do nothing;

-- Cards. Everything that is not provenance or scheduler state is the card's
-- content — cloze halves, answer, front, back, the re-explanation — and it
-- travels as one object rather than five nullable columns.
insert into public.cards (topic_id, id, user_id, node_id, type, source, content, fsrs, due)
select
  t.id, c->>'id', r.user_id,
  coalesce(c->>'nodeId', ''),
  coalesce(c->>'type', 'recall'),
  coalesce(c->>'source', ''),
  c - 'id' - 'nodeId' - 'type' - 'source' - 'fsrs',
  c->'fsrs',
  coalesce((c->'fsrs'->>'due')::timestamptz, now())
from public.run_states r
join public.topics t on t.user_id = r.user_id and t.subject = r.subject
cross join lateral jsonb_array_elements(coalesce(r.snapshot->'cards', '[]'::jsonb)) c
where c->>'id' is not null and c->'fsrs' is not null
on conflict (topic_id, id) do nothing;

-- Generated content. Backfilled rows carry their payload inline and no
-- cache_key: the shared content_cache row they came from may since have been
-- abandoned by a CONTENT_CACHE_VERSION bump, and a pointer into a row nothing
-- addresses any more is a miss dressed as a hit.
insert into public.node_content (topic_id, node_id, kind, variant, user_id, payload)
select t.id, kv.key, k.kind, '', r.user_id, kv.value
from public.run_states r
join public.topics t on t.user_id = r.user_id and t.subject = r.subject
cross join lateral (values ('consume'), ('socratic'), ('feynman'), ('connect'), ('crucible')) k(kind)
cross join lateral jsonb_each(coalesce(r.caches->k.kind, '{}'::jsonb)) kv
on conflict (topic_id, node_id, kind, variant) do nothing;

-- The lens walkthroughs were keyed `model:<node>:<chunk>:<lens>` in one flat
-- bucket; node and variant come back out of the key.
insert into public.node_content (topic_id, node_id, kind, variant, user_id, payload)
select
  t.id,
  split_part(kv.key, ':', 2),
  'model',
  split_part(kv.key, ':', 3) || ':' || split_part(kv.key, ':', 4),
  r.user_id, kv.value
from public.run_states r
join public.topics t on t.user_id = r.user_id and t.subject = r.subject
cross join lateral jsonb_each(coalesce(r.caches->'models', '{}'::jsonb)) kv
where kv.key like 'model:%:%:%'
on conflict (topic_id, node_id, kind, variant) do nothing;

-- Retain is topic-wide, not per-node: it is drafted from the set of nodes that
-- have no card yet, so it files under the empty node id.
insert into public.node_content (topic_id, node_id, kind, variant, user_id, payload)
select t.id, '', 'retain', '', r.user_id, r.caches->'retain'
from public.run_states r
join public.topics t on t.user_id = r.user_id and t.subject = r.subject
where jsonb_typeof(r.caches->'retain') = 'object'
on conflict (topic_id, node_id, kind, variant) do nothing;
