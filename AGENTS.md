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

## Auth & persistence (Supabase)

- Accounts are Supabase email magic links via `@supabase/ssr`: `middleware.ts`
  refreshes the session and redirects signed-out visitors to `/login`;
  `app/auth/confirm/route.ts` lands the emailed link. Always gate server-side
  with `supabase.auth.getClaims()` — never `getSession()`.
- Clients live in `lib/supabase/` (`client.ts` browser, `server.ts` server,
  `middleware.ts` session refresh). Env vars keep their unprefixed names in
  `.env.local`; `next.config.ts` mirrors URL + publishable key to
  `NEXT_PUBLIC_*` for the browser.
- Run state persists coarsely (§17): one `run_states` row per (user, subject)
  holding a versioned JSON snapshot — graph, StateMap, adherence, calibration,
  generated-content caches. `lib/persistence.ts` defines the snapshot;
  `AtlasApp` hydrates it on mount and write-through saves debounced. RLS keeps
  rows per-user (`supabase/migrations/`). Normalize when FSRS lands.

## Conventions

- Styling is inline `style={{...}}` objects matching the design file (`Learning Platform.dc.html` in the Claude Design project); animations are the shared keyframes in `app/globals.css` (`pulseGlow`, `assemble`, `fadeUp`, `softIn`).
- Node mastery states are the app's shared vocabulary: `unknown | frontier | learning | shaky | mastered | gap`. Use `STATE_COLOR` / `STATE_LABEL` from `lib/curriculum.ts` — never invent a state or a color for one.
- Mastery state is live: `AtlasApp` holds one `StateMap` of stored progress (`ProgressState`, everything but `frontier`); `frontier` and locking are always derived from prerequisites via `displayStates` — never store `frontier` or a locked flag. New surfaces read and write that `StateMap`, nothing else.
- Client components declare `"use client"`; keep server components the default elsewhere.
- Mutable interaction state that shouldn't trigger renders (drag, pan, timers) lives in refs; renderable state in `useState`.
- Path alias: `@/*` from the repo root (e.g. `@/lib/theme`).

## Verifying changes

`npm run build` must pass. For UI changes, drive the real flow: `npm run start -- -p 3100`, then use Playwright with the preinstalled Chromium (`executablePath: '/opt/pw-browsers/chromium'`) to click through welcome → build → diagnostic → map and screenshot.
