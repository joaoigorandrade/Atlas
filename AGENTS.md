# AGENTS.md

Atlas is a learning platform built around a living concept map (see `docs/SPEC.md`
for the full product spec, `README.md` for the overview). The onboarding flow
(welcome → building → diagnostic → map) and Phase 1 (Plan — the map's
re-planning behavior: gap spawning, goal-conditioned ordering, pace warnings,
skip pruning) are implemented; the session phases (Consume, Socratic, Feynman,
Connect, Crucible, Retain) are not yet.

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
- `lib/curriculum.ts` — the concept graph, mastery-state vocabulary, diagnostic script, and the re-planning model (gap specs, goal ordering, pace math). All domain data goes here, never inline in components.
- `lib/theme.ts` — design tokens. Never hard-code a color/font that has a token.

## Conventions

- Styling is inline `style={{...}}` objects matching the design file (`Learning Platform.dc.html` in the Claude Design project); animations are the shared keyframes in `app/globals.css` (`pulseGlow`, `assemble`, `fadeUp`, `softIn`).
- Node mastery states are the app's shared vocabulary: `unknown | frontier | learning | shaky | mastered | gap`. Use `STATE_COLOR` / `STATE_LABEL` from `lib/curriculum.ts` — never invent a state or a color for one.
- Mastery state is live: `AtlasApp` holds one `StateMap` of stored progress (`ProgressState`, everything but `frontier`); `frontier` and locking are always derived from prerequisites via `displayStates` — never store `frontier` or a locked flag. New surfaces read and write that `StateMap`, nothing else.
- Client components declare `"use client"`; keep server components the default elsewhere.
- Mutable interaction state that shouldn't trigger renders (drag, pan, timers) lives in refs; renderable state in `useState`.
- Path alias: `@/*` from the repo root (e.g. `@/lib/theme`).

## Verifying changes

`npm run build` must pass. For UI changes, drive the real flow: `npm run start -- -p 3100`, then use Playwright with the preinstalled Chromium (`executablePath: '/opt/pw-browsers/chromium'`) to click through welcome → build → diagnostic → map and screenshot.
