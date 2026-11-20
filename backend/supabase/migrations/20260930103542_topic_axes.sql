-- Topic-level axes, stamped by the server from the map's "about" header and
-- read back by withTopicAxes (W0.4). Each is null/empty until a map sets it,
-- and an unset axis is omitted from every cache key.
alter table public.topics
  add column if not exists map_domain text,
  add column if not exists target_language text,   -- W1.1, BCP-47 with region
  add column if not exists jurisdictional boolean not null default false, -- W2.5
  add column if not exists locale text,            -- W2.5, ISO country, set only when jurisdictional
  add column if not exists lenses jsonb not null default '[]'::jsonb, -- W2.6, offered
  add column if not exists lens text,              -- W2.6, chosen by the learner
  add column if not exists shape text,             -- W9.1
  add column if not exists target jsonb;           -- W5.1 { kind, text, date }

-- W2.5: the learner's country, defaulted from the device locale.
alter table public.profiles add column if not exists country text;
