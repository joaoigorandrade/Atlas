-- The run, normalized. Everything a learner owns used to live in two JSONB
-- columns of one `run_states` row: the graph, every mastery state, every node
-- position, every unfinished session, the whole card deck, and every generated
-- passage. That shape made all three of this migration's motivations true at
-- once — a node drag re-uploaded the map, a graded card re-uploaded the deck,
-- and "delete this topic" had no cascade to lean on because there was nothing
-- to cascade from.
--
-- What is a row now: a topic, a node, an edge, a card, one generated payload.
-- What stays JSON: a node's per-phase progress record, which exactly one screen
-- reads and writes whole. Normalizing that would buy nothing and cost a join.
--
-- `content_cache` and `speech_cache` are untouched: global, prompt-hash keyed,
-- shared across users, holding no learner text. A topic delete must not reach
-- them — `node_content` is the per-topic thing it takes.

-- ---------------------------------------------------------------- profiles --
-- Adherence is a property of the learner, not of a topic. It used to be copied
-- into every run's snapshot (so streaks disagreed between topics) and kept a
-- third time in the iOS UserDefaults, which agreed with neither.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_target integer not null default 15,
  language text,
  streak integer not null default 0,
  best integer not null default 0,
  freezes integer not null default 0,
  last_day text not null default '',
  met_today boolean not null default false,
  usual_time text not null default '',
  reminder_on boolean not null default false,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ topics --
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject text not null,
  goal text not null default 'exam',
  interests text not null default '',
  pareto_pct integer not null default 20,
  exam_date text not null default '',
  -- The language the *content* was generated in, which is a property of the run
  -- and not of the device reading it. Null on a row that predates the field:
  -- guessing from a UI language would freeze the wrong answer permanently.
  language text,
  calib_samples jsonb not null default '[]'::jsonb,
  misconceptions jsonb not null default '[]'::jsonb,
  modality_tally jsonb not null default '{}'::jsonb,
  lit_today jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject)
);

-- ------------------------------------------------------------------- nodes --
-- `state` is the live mastery state, never `frontier` — that one is derived
-- from the prerequisite edges on read, in both clients, and storing it would
-- give the derivation something to disagree with.
create table public.nodes (
  topic_id uuid not null references public.topics (id) on delete cascade,
  id text not null,
  user_id uuid not null default auth.uid(),
  label text not null default '',
  summary text,
  g integer not null default 0,
  week integer not null default 0,
  x double precision not null default 0,
  y double precision not null default 0,
  is_gap boolean not null default false,
  state text not null default 'unknown',
  shaky_reason text,
  reviewed boolean not null default false,
  consume_progress jsonb,
  socratic_progress jsonb,
  feynman_progress jsonb,
  connect_progress jsonb,
  updated_at timestamptz not null default now(),
  primary key (topic_id, id)
);
create index nodes_user on public.nodes (user_id);

-- ------------------------------------------------------------------- edges --
-- [prerequisite -> dependent]; `dashed` is the soft-prereq flag the map draws.
create table public.edges (
  topic_id uuid not null references public.topics (id) on delete cascade,
  from_id text not null,
  to_id text not null,
  user_id uuid not null default auth.uid(),
  dashed boolean not null default false,
  primary key (topic_id, from_id, to_id)
);
create index edges_user on public.edges (user_id);

-- ------------------------------------------------------------------- cards --
-- `due` is lifted out of the FSRS state into its own column so the day's queue
-- is a query with an index behind it rather than a scan of the whole deck.
create table public.cards (
  topic_id uuid not null references public.topics (id) on delete cascade,
  id text not null,
  user_id uuid not null default auth.uid(),
  node_id text not null,
  type text not null,
  source text not null,
  content jsonb not null default '{}'::jsonb,
  fsrs jsonb not null,
  due timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (topic_id, id)
);
create index cards_due on public.cards (topic_id, due);
create index cards_user on public.cards (user_id);

-- ------------------------------------------------------------ node_content --
-- One generated payload, addressed the way a screen asks for it. `cache_key`
-- points into the shared `content_cache`, which already holds the payload once
-- for everyone; `payload` is the fallback for anything generated without a
-- stable key, and is what the backfill below fills.
create table public.node_content (
  topic_id uuid not null references public.topics (id) on delete cascade,
  node_id text not null,
  kind text not null,
  variant text not null default '',
  user_id uuid not null default auth.uid(),
  cache_key text,
  payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (topic_id, node_id, kind, variant)
);
create index node_content_user on public.node_content (user_id);

-- Per-topic spend attribution. Nulled rather than deleted with the topic: the
-- log is billing telemetry and outlives the learning data it paid for.
alter table public.generation_log
  add column topic_id uuid references public.topics (id) on delete set null;

-- --------------------------------------------------------------------- RLS --
-- Child tables carry a denormalized user_id so each policy stays a single
-- indexed comparison rather than an `exists (select 1 from topics ...)`
-- subquery evaluated per row.
do $$
declare t text;
begin
  foreach t in array array['profiles','topics','nodes','edges','cards','node_content'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy "read own" on public.%I for select to authenticated using ((select auth.uid()) = user_id)$f$, t);
    execute format($f$create policy "insert own" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)$f$, t);
    execute format($f$create policy "update own" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)$f$, t);
    execute format($f$create policy "delete own" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)$f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- triggers --
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','topics','nodes','cards','node_content'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch_updated_at', t);
  end loop;
end $$;
