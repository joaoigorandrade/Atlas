# AGENTS.md

Atlas is a learning platform built around a living concept map (see `docs/SPEC.md`
for the full product spec, `README.md` for the overview). The onboarding flow
(welcome → building → diagnostic → map), Phase 1 (Plan — the map's
re-planning behavior: gap spawning, goal-conditioned ordering, pace warnings,
skip pruning), and the session phases (Consume, Socratic, Feynman, Connect,
Crucible, Retain) are implemented; all content is AI-generated per topic via
OpenRouter (see "AI content generation" below).

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript 5 (strict)
- No UI framework, no CSS-in-JS library — inline styles + design tokens
- Fonts via `next/font/google`: Newsreader (serif), Instrument Sans (sans), Spline Sans Mono (mono)

## Commands

```bash
npm run dev        # dev server on :3000
npm run build      # production build — must pass before pushing
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```

## Layout

- `app/` — App Router shell only (layout, fonts, global keyframes). Pages stay thin; screens live in `components/`.
- `components/AtlasApp.tsx` — the single client-side state machine (screen, form, selection, canvas view). All cross-screen state lives here.
- `components/onboarding/`, `components/map/` — presentational screens; they receive state + callbacks as props and hold no app state.
- `lib/curriculum.ts` — the mastery-state vocabulary, session engines (pure reducers), and the re-planning model (gap spawning, goal ordering, pace math). Types and logic only — no domain data lives here.
- `lib/theme.ts` — design tokens. Never hard-code a color/font that has a token.
- `lib/speech.ts` — the voice seam (browser-native Web Speech): dictation, read-aloud, the device-level `atlas.voice` preference, and every `SpeechRecognition`/`speechSynthesis` detail. No component touches those APIs directly.
- `lib/server/` — the OpenRouter client (`openrouter.ts`) and the per-kind content generators (`generate.ts`: prompts, validators, layout/ids/offsets post-processing). Server-only; the API key never reaches the browser.
- `app/api/generate/route.ts` — the single generation endpoint the client posts to; `lib/api.ts` is its typed client wrapper.

## AI content generation

All learning content is generated per topic through OpenRouter — the concept
graph + placement diagnostic at onboarding (`kind: "curriculum"`), and each
phase's material on first entry (`consume`, `socratic`, `feynman`, `connect`,
`crucible`, `retain`), cached per node for the run in `AtlasApp`. Configure via
`.env.local` (see `.env.example`): `OPENROUTER_API_KEY` (required),
`OPENROUTER_MODEL` (default `openai/gpt-4o-mini` — cheap and structured-output
reliable), `OPENROUTER_BASE_URL` (override for tests). Generated JSON is
validated server-side with one corrective retry; ids, graph layout, and gap
placement offsets are always computed server-side, never trusted from the
model.

## Never make a screen wait on a model

Generation is seconds; a screen entry should be milliseconds. Three layers keep
it that way, and a new surface must use all three:

- **`content_cache`** (`lib/server/contentCache.ts`) — every cacheable
  generation is addressed by a SHA-256 of its exact prompt inputs and stored
  shared across users, so the second learner to open a concept pays neither the
  latency nor the spend. `/api/generate` reads it before spending a call and
  writes through after; only `judge` is uncacheable (it grades one learner's own
  words). Service-role only — RLS is on with no policies. **A hit is returned to
  the client without re-validation**, so changing a payload's shape means
  bumping `VERSION` in that file — otherwise stored rows in the old shape flow
  straight into the new renderer.
- **`lib/server/job.ts`** — normalization, cache key, and generation resolved in
  one place, so `/api/generate` and the `/api/content` batch read address the
  same row. A new kind goes here, not in a route.
- **`lib/warm.ts`** — the client's deduped, concurrency-capped background queue.
  `AtlasApp` batch-reads the cache for the nodes ahead on map open, warms the
  misses, and hands off phase-to-phase (Consume warms Socratic, Feynman warms
  Connect, Connect warms Crucible). A click on something already warming joins
  that request rather than starting a second one.

The rule that makes it safe: a warm and the click that follows must derive
their inputs from the *same* function (the `*Params` callbacks in `AtlasApp`).
Compute a pool or a label list twice and the keys diverge — you get a cache
miss and pay for the generation twice.

A fourth layer covers the wait no cache can hide — the *first* generation of a
kind, where latency is dominated by sequential output decoding:

- **`lib/server/stream.ts`** — progressive delivery. A generator yields
  `StreamFrame`s (one named slot of the eventual payload) and the route writes
  them out as NDJSON, so a screen paints on its first item instead of its last.
  `Job.shape` declares what a complete set looks like; `framesToPayload`
  assembles it back into exactly what `Job.run()` would have returned and
  returns **null** on a short or gappy set. Nothing incomplete is ever written
  to `content_cache` (hits skip validation) or to a `*Cache` in `AtlasApp` —
  partial content lives in a `live*` state so `isCached` and the warm dedupe
  can't mistake it for a finished pass.
- The first frame is pulled *before* committing to a 200, so a real failure
  still surfaces as an error status. Each streaming generator falls back to its
  single-shot, retried `run()` if it fails before yielding anything; after that
  it surfaces, and the client keeps whatever landed.
- Streaming has **no corrective retry and no model-fallback chain**, and
  `streamJsonObjects` uses the *content* model role. Don't stream a call that
  needs either — notably the judge.
- A surface that renders a streamed list must not derive "am I on the last
  one?" from the array's length. `SocraticSession`/`FeynmanSession` carry an
  explicit `total` for exactly this reason; deriving it from `.length` ends the
  session as soon as the learner answers the first item.
- **`after()`** (`app/api/generate/route.ts`) warms the new map's frontier
  server-side once the build response has flushed, so the first node click is a
  cache hit. It charges through the same `chargeGeneration` helper as everything
  else.

Quota accounting follows the split: `generation_log` rows are *model calls*
(the monthly ceiling, which tracks spend), while `job_id` groups them into
*jobs* (the per-learner daily quota — a learner's fair share of surfaces). A
job that fans out declares `Job.cost`.

## Auth & persistence (Supabase)

- Accounts are Supabase email magic links via `@supabase/ssr`: `middleware.ts`
  refreshes the session and redirects signed-out visitors to `/login`;
  `app/auth/confirm/route.ts` lands the emailed link. Always gate server-side
  with `supabase.auth.getClaims()` — never `getSession()`.
- Clients live in `lib/supabase/` (`client.ts` browser, `server.ts` server,
  `middleware.ts` session refresh). Env vars keep their unprefixed names in
  `.env.local`; `next.config.ts` mirrors URL + publishable key to
  `NEXT_PUBLIC_*` for the browser.
- Run state persists coarsely (§17): one `run_states` row per (user, subject),
  split across two columns. `snapshot` is the run core — graph, StateMap,
  positions, adherence, calibration, cards — small, versioned (v3), saved on a
  1.2s debounce; it is the only thing the first paint waits on. `caches` holds
  the per-node generated content — large, saved on a 4s debounce, loaded in the
  background behind an already-interactive map. `lib/persistence.ts` defines
  both and migrates v1/v2 rows whose caches still travel inline. RLS keeps rows
  per-user (`supabase/migrations/`). Normalize when FSRS lands.

## Conventions

- Styling is inline `style={{...}}` objects matching the design file (`Learning Platform.dc.html` in the Claude Design project); animations are the shared keyframes in `app/globals.css` (`pulseGlow`, `assemble`, `fadeUp`, `softIn`).
- Node mastery states are the app's shared vocabulary: `unknown | frontier | learning | shaky | mastered | gap`. Use `STATE_COLOR` / `STATE_LABEL` from `lib/curriculum.ts` — never invent a state or a color for one.
- Mastery state is live: `AtlasApp` holds one `StateMap` of stored progress (`ProgressState`, everything but `frontier`); `frontier` and locking are always derived from prerequisites via `displayStates` — never store `frontier` or a locked flag. New surfaces read and write that `StateMap`, nothing else.
- Every question is asked open-ended first. A surface that also has a closed
  (pick-an-option) form renders `AnswerModeToggle` + `OpenAnswer` from
  `components/OpenAnswer.tsx`, defaulting to "Own words": the free-text answer
  goes to the `judge` mode `"choice"`, which returns the option index the closed
  path already keys on. Never ship a question that can only be answered by tapping.
- A free-text box gets `<MicButton>` from `components/VoiceInput.tsx` beside it —
  speaking is an alternative to typing on every answer surface. It renders
  nothing where the browser can't dictate or the learner has voice off, so the
  fallback is free; voice follows the language setting, never a second choice.
- Client components declare `"use client"`; keep server components the default elsewhere.
- Mutable interaction state that shouldn't trigger renders (drag, pan, timers) lives in refs; renderable state in `useState`.
- Path alias: `@/*` from the repo root (e.g. `@/lib/theme`).

## Verifying changes

`npm run build` must pass. For UI changes, drive the real flow: `npm run start -- -p 3100`, then use Playwright with the preinstalled Chromium (`executablePath: '/opt/pw-browsers/chromium'`) to click through welcome → build → diagnostic → map and screenshot.
