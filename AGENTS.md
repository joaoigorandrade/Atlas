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
npm run dev            # dev server on :3000
npm run build          # production build — must pass before pushing
npm run start          # serve the production build
npm run typecheck      # tsc --noEmit
npm run lint           # eslint — real-bug rules only, no style
npm run format         # prettier --write .  (format:check to verify)
npm test               # vitest (test:coverage adds the lib/** floor)
npm run size           # file-length ratchet — see below
npm run e2e            # playwright, on fixture mode — see docs/AGENT-TESTING.md
```

Every one of those is a required CI check (`.github/workflows/ci.yml`), one
status check per gate.

**Fixture mode.** `ATLAS_FIXTURES=1 npm run dev` answers every generation from
`lib/server/fixtures.ts` instead of OpenRouter — deterministic, instant, free —
and stands in for Supabase auth and persistence. It is the only way to drive
the app past onboarding without spending money and waiting on a model, so it is
what Playwright and any browser-driving agent run against.
`POST /api/test/seed` (fixture mode only) lands the app directly on a given run
state. Controls carry `data-testid`s in a fixed vocabulary
(`screen-*`, `node-*`, `phase-*`, `action-*`). **`docs/AGENT-TESTING.md` is the
full map — read it before driving the app in a browser.**

**The size ratchet.** `size-budget.json` holds a line ceiling per file: 400 by
default, an explicit entry for the files already over it. CI fails when a file
grows past its ceiling, so size can only go down. When a file shrinks, run
`node scripts/size-budget.mjs --update` in the same PR to lower its entry —
ceilings never rise. Adding a genuinely new large file means editing
`size-budget.json` by hand, on purpose, in review.

## Layout

- `app/` — App Router shell only (layout, fonts, global keyframes). Pages stay thin; screens live in `components/`.
- `components/AtlasApp.tsx` — the shell: it composes the hooks in `components/atlas/` and renders. It holds no logic of its own.
- `components/atlas/` — where the cross-screen state actually lives, one hook per owner: `useRunState` (everything persisted — graph, mastery states, positions, cards, cached generations), `useSessionState` (what is open and what is streaming), `useGeneration` (the one seam every foreground generation goes through), `useSpiral` (the six phases as **one** state machine — they transition into each other, so splitting per phase would push every transition through another ref), `useOnboarding`, `useWarming`, `useDerived` (the view model), `useNavigation`, `useCanvas`, `useToast`, `useViewport`. Anything a hook returns that a dependency array names **must be stable** — an unstable identity here re-hydrates the whole app every render.
- `components/onboarding/`, `components/map/`, `components/session/` — presentational screens; they receive state + callbacks as props and hold no app state.
- `lib/curriculum/` (barrel at `lib/curriculum.ts`'s old import path, `@/lib/curriculum`) — the mastery-state vocabulary, session engines (pure reducers), and the re-planning model (gap spawning, goal ordering, pace math), split per phase plus `types`, `adherence`, `calibration`, `replan`. Types and logic only — no domain data lives here.
- `lib/theme.ts` — design tokens. Never hard-code a color/font that has a token.
- `lib/i18n.tsx` — the language seam. There is no catalog file on the web: each
  component keeps its own `STRINGS = { en, "pt-BR" }` beside its markup and
  reads it through `useT`; the context only tracks which language is active and
  where that answer came from (`languageAction` is what keeps a device's guess
  from overriding the language a run's content is written in). See **Both
  languages, always** below.
- `lib/speech.ts` — the voice seam: dictation, read-aloud, the device-level `atlas.voice` preference. No component touches a speech API directly. The two halves run on two engines. **Dictation** is browser-native `SpeechRecognition` — no key, no cost, and the only thing that gives the live as-you-talk transcript. **Read-aloud** is a hosted engine behind `/api/speech` (`lib/server/tts.ts`, Speechify), because the browser's own voices are a per-OS lottery and report no word timing; the hosted one returns per-word timestamps, which is what the read-along highlight and the progress ring are built on. There is deliberately **no `speechSynthesis` fallback** — without `SPEECHIFY_API_KEY` the control simply isn't offered (`NEXT_PUBLIC_TTS_ENABLED`), so voice quality never depends on the browser.
- `lib/rich.ts` — the markdown walk `components/Rich.tsx` renders, as a pure function. Read-aloud speaks `spokenText()` and gets character offsets back, so the string the engine says and the string the reader sees must be the same one; `Rich` takes a `speak` range and marks the word being spoken.
- `lib/server/` — the OpenRouter client (`openrouter.ts`) and the per-kind content generators, one file per kind in `generate/` (prompts, validators, layout/ids/offsets post-processing) over a shared `common.ts`, behind a barrel at `@/lib/server/generate`. Server-only; the API key never reaches the browser.
- `app/api/generate/route.ts` — the single generation endpoint the client posts to; `lib/api.ts` is its typed client wrapper.
- `app/api/health/route.ts` — public liveness probe: `{ ok, supabase, ms }`, 503 when Supabase is unreachable. Point uptime checks here. It deliberately does not probe OpenRouter — that would cost a model call per check.
- `app/api/speech/route.ts` — read-aloud synthesis: auth-gated, one plain segment in, base64 audio + per-word marks out. Clips are cached in `speech_cache` (`lib/server/speechCache.ts`) and shared across users, so a section is billed once however many learners read it — deliberately its own table, since `content_cache`'s version moves whenever a _prompt_ does and audio for unchanged prose must not be re-billed for that.

## Both languages, always

**Every line of copy ships in pt-BR and en-US.** Not "eventually" — a surface
with a Portuguese string and no English one is unfinished, on either client.

- On the web that means a `STRINGS = { en: {...}, "pt-BR": {...} }` object next
  to the component, read through `useT`. A table that lives outside its
  component (`lib/toastCopy.ts`, `components/atlas/dashboardCopy.ts`, …) is
  covered by `tests/i18nCoverage.test.ts`, which fails on a missing key, an
  untranslated line that came out identical in both languages, and a builder
  that drops its argument. Add new tables to that test.
- Never concatenate a sentence out of a stem and a clause: the two languages
  don't put the pieces in the same order. Write both sentences whole, and let
  an interpolation carry only a value.
- Phase names (Consume, Socratic, Feynman, Connect, Crucible, Retained) are
  product vocabulary and stay English in both languages. Everything a learner
  reads around them is translated.
- On iOS the mechanism is different — a String Catalogue, not a lookup table —
  and `ios/AGENTS.md` §Copy is the rule there. The requirement is the same one.

## AI content generation

All learning content is generated per topic through OpenRouter — the concept
map at onboarding (`kind: "curriculum"`, streamed one concept at a time in
prerequisite order; the placement questions follow one at a time as
`diagnosticQuestion`, since each one's difficulty depends on the last answer),
and each phase's material on first entry (`consume`, `socratic`, `feynman`,
`connect`, `crucible`, `retain`), cached per node for the run in `AtlasApp`.
One kind is smaller than a phase: `summary` writes the single sentence the node
rail says about a concept, and exists only as a backfill — a generated map
writes every node's `summary` inline, but a run built before summaries (or a
concept whose sentence the map generation dropped) has none, and the rail's
fallback is copy about the mastery state, which is identical under every
concept in that state. It lands on the node in the graph, so it is saved with
the run snapshot and written once per concept, ever.
Two kinds are finer-grained than a node, both of them Consume's. `model` is a
single lens (Simpler / Example / Analogy / Go deeper) opened over a single
section, keyed on that section's own prose and cached per (node, section,
lens). `passage` is "ask about this": the learner's question about a stretch of
prose they highlighted, streamed a paragraph at a time and — like `judge` —
never cached, since the inputs are one learner's selection and one learner's
words.
Every per-node generation also carries the **map around the concept**
(`conceptBoundary` in `lib/curriculum.ts` → `boundaryNote` in `generate.ts`):
the labels of every ancestor (already taught — build on it, never re-teach it)
and of every other concept on the map (taught by its own pass — never explain
it here). Without it each pass is written as if its concept were the only thing
the learner will ever read, and the map's content overlaps and spoils itself.
It is part of the cache key for `consume`, `socratic`, `feynman` and
`crucible`, so a warm and the click after it must derive it from the same
`boundaryOf` callback; gap nodes are excluded so the row stays shared across
learners on the same topic.

Configure via
`.env.local` (see `.env.example`): `OPENROUTER_API_KEY` (required),
`OPENROUTER_MODEL` (default `deepseek/deepseek-chat`),
`OPENROUTER_BASE_URL` (override for tests). Generated JSON is
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
their inputs from the _same_ function (the `*Params` callbacks in `AtlasApp`).
Compute a pool or a label list twice and the keys diverge — you get a cache
miss and pay for the generation twice.

A fourth layer covers the wait no cache can hide — the _first_ generation of a
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
- **Token-by-token** is the layer under that, for the kinds whose unit is prose
  a learner reads _while_ it appears. `streamJsonObjectsProgressive`
  (`openrouter.ts`) repairs the half-decoded object in the buffer with
  `closePartialJson`, runs it through a _lenient_ validator supplied per kind,
  and yields it as a redraw; the generator re-sends it as a frame at the slot
  it is writing with `partial: true`. Those frames are rendered and nothing
  else: `ndjsonStream` doesn't retain them, `framesToPayload` drops them, and
  `collectFrames` (client) drops them, so a redraw can never be assembled,
  cached, or mistaken for the answer. A complete frame for the same slot always
  follows and replaces it. Redraws are throttled (`OPENROUTER_PARTIAL_MS`,
  ~66ms) because each one carries the whole object — per-token frames would
  cost O(n²) bytes on a long answer.
  It is on where prose is the unit and the learner is watching it land: the
  passage aside, the model view's beats, and the judge's critique (drafting
  `response` only — a half-written _verdict_ is a different classification than
  the one the model settles on, and the verdict drives mastery writes). It is
  deliberately off for `consume`/`socratic`/`feynman`/`curriculum`, whose items
  are structured objects — a section without its `check`, a step without its
  `replies`, has nothing coherent to render, and every renderer would have to
  become partial-tolerant to show half of one. `StreamingText`
  (`components/Pending.tsx`) is the shared "being written" mark: the text so
  far plus a blinking nib, ink dots while it's still empty.
- The first frame is pulled _before_ committing to a 200, so a real failure
  still surfaces as an error status. Each streaming generator falls back to its
  single-shot, retried `run()` if it fails before yielding anything; after that
  it surfaces, and the client keeps whatever landed.
- Streaming has **no corrective retry and no model-fallback chain**, and
  `streamJsonObjects` uses the _content_ model role. Don't stream a call that
  needs either — notably the judge.
- A payload's _shape_ is chosen so a partial one still means something.
  `framesToPayload` only assembles flat parts, so the map travels as a flat
  `nodes` list where each node carries its own `prereqs` rather than as
  `{graph: {nodes, edges}}` — `graphFromMapNodes` (`lib/curriculum.ts`) derives
  the graph on both sides, and derives a _real_ one from the first three
  concepts, which is what lets the canvas paint mid-stream. Anything the whole
  payload is needed to compute is re-sent at the end instead: the map's columns
  can't be centred until their height is known, so the settling pass re-yields
  every node at its original index and frame replacement folds it in.
- A surface that renders a streamed list must not derive "am I on the last
  one?" from the array's length. `SocraticSession` carries an explicit `total`
  for exactly this reason; deriving it from `.length` ends the session as soon
  as the learner answers the first item. (Feynman needs no `total`: the learner
  teaches the whole concept once, and the rubric is graded as a set.)
- A surface that dispatches against streamed content must read it the same way
  it renders it — the committed cache _or_ the live stream (`socraticStepsFor`,
  `feynmanBeatsFor`). Reading only the cache makes every action a silent no-op
  until the stream finishes, which looks like a dead button, not a wait.
- **`after()`** (`app/api/generate/route.ts`) warms the new map's frontier
  server-side once the build response has flushed, so the first node click is a
  cache hit. It records through the same `logGenerationCalls` helper as
  everything else.

`generation_log` rows are _model calls_ (what tracks spend), and `job_id`
groups them into _jobs_ (the surfaces a learner asked for). A job that fans out
declares `Job.cost`, which is how many rows it writes.

Two ceilings sit on that table, both in `lib/server/quota.ts`
(`generationBlocked`), both checked in `/api/generate` after the free cache hit
and before the first model call:

- **`GENERATION_DAILY_QUOTA`** (default 60) — distinct jobs one learner may
  start per UTC day, via `generation_jobs_today()`. Fairness.
- **`GENERATION_MONTHLY_CALLS`** (default 20,000) — model calls this deployment
  may make in a calendar month across every learner, via
  `generation_calls_this_month()`. The bill. It also gates the server-side
  frontier warm, which spends after the response where nothing else would stop
  it.

Over either, `/api/generate` answers 429 `rate_limit`; a background warm is
declined silently with a 204 instead. Both **fail open**: if a count is
unavailable the request proceeds, because 429-ing every learner over a broken
meter is the worse failure. Still missing: any `max_tokens` on model calls.

## Logs

`lib/log.ts` is the only way anything writes a log line, on the server and in
the browser: one JSON object per line, `{ lvl, evt, ...fields }`, with error
bodies truncated at 600 chars and a `req` request id that also travels back to
the client on the `x-atlas-request-id` header. That is what makes "it failed" a
grep, not an investigation.

Server lines land in Vercel's runtime logs and in any drain attached to them —
`lvl:"error"` is an error-budget query, `evt:"generate_quota_exceeded"` is the
spend picture, `req` joins a learner's report to the exact request. No
telemetry vendor and no logging table: the platform already stores and queries
these, and a second store would be a second thing to keep alive. Never
`console.log` directly, and never log a raw upstream body — `describe()` bounds
it.

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
  positions, adherence, calibration, cards, per-node Consume reading progress,
  the modality tally — small, versioned (v4), saved on a
  1.2s debounce; it is the only thing the first paint waits on. `caches` holds
  the per-node generated content — large, saved on a 4s debounce, loaded in the
  background behind an already-interactive map. `lib/persistence.ts` defines
  both and migrates v1/v2 rows whose caches still travel inline. RLS keeps rows
  per-user (`supabase/migrations/`). Normalize when FSRS lands.

## Conventions

- Styling is inline `style={{...}}` objects matching the design file (`Learning
Platform.dc.html` in the Claude Design project). Two things a pseudo-class
  can't reach from an inline style live in `app/globals.css` instead: the shared
  keyframes (`pulseGlow`, `assemble`, `fadeUp`, `softIn`, …) and the **interaction
  layer** — the `at-press` / `at-lift` / `at-tint` / `at-glow` classes that carry
  every hover, press and focus state. Anything tappable gets `at-press`; a card
  or a map node gets `at-lift`. An inline style beats those classes for the same
  property, so an element wearing one must not also set `transform` or
  `transition` inline — move it to a wrapper.
- Motion values come from `motion` / `transition()` in `lib/theme.ts`, the same
  way colours come from `color`. Never hand-write a duration or an easing curve.
- A hover that _says something_ is `HoverHint` (`components/HoverHint.tsx`),
  never a `title` attribute: it dwells before opening, opens on keyboard focus
  too, and is portalled to `<body>` so a scrolling rail can't clip it. The map's
  own version is `NodeHoverCard` — the state, phase and cost of a hovered
  concept, read off the same `StateMap` the detail rail reads. Both use the
  `peekIn` / `peekOut` keyframe pair via `usePresence`.
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
