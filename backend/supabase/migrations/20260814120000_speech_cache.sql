-- Synthesized-audio cache, for read-aloud (#TTS).
--
-- Read-aloud moved off the browser's `speechSynthesis` — which was free, but
-- whose voice quality is a per-browser lottery and which reports no word
-- timing — onto a hosted engine billed per character. This table is what keeps
-- that cheap: a clip is keyed by a server-computed SHA-256 of everything that
-- changes the audio (version, provider, model, voice, language, and the exact
-- spoken string), so the second learner to read a section pays neither the
-- wait nor the characters. The prose is already shared across users by
-- `content_cache`, so the hit rate here is the same one that table enjoys.
--
-- Only the hash is stored, never the prose that produced it.
--
-- Deliberately NOT a new kind inside `content_cache`: that table's version is
-- bumped whenever a prompt changes, and audio for prose that didn't change
-- must not be discarded — and re-billed — because a prompt elsewhere was
-- reworded. Two caches that invalidate for unrelated reasons get two versions.
--
-- RLS is on with NO policies, so the table is unreachable with the browser's
-- publishable key. Only the server's service-role client, behind /api/speech,
-- ever touches it.

create table public.speech_cache (
  key text primary key,
  payload jsonb not null,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now()
);

create index speech_cache_created on public.speech_cache (created_at desc);

alter table public.speech_cache enable row level security;

-- Read + count the hit in one round-trip; a learner is waiting on the audio.
create or replace function public.speech_cache_get(cache_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare hit jsonb; -- not `found`: plpgsql already defines that one
begin
  update public.speech_cache
     set hits = hits + 1, last_hit_at = now()
   where key = cache_key
  returning payload into hit;
  return hit;
end;
$$;

-- Service-role only, matching the table: no browser client may call this.
revoke all on function public.speech_cache_get(text) from public;
revoke all on function public.speech_cache_get(text) from anon, authenticated;
grant execute on function public.speech_cache_get(text) to service_role;
