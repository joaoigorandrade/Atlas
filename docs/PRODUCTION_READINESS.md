# Atlas — Production Readiness Review

**Date:** 2026-07-19 · **Reviewed at:** `main` (`05dda7f`, PR #14 merged)
**Verdict: Atlas is a polished, well-engineered interactive prototype — it is not yet a production application.**

The codebase is in genuinely good shape for what it is: `npm run typecheck` and
`npm run build` both pass clean, the client/server split keeps the OpenRouter
key server-side, generated JSON is validated with a corrective retry, ids and
layout are computed server-side rather than trusted from the model, and the
state machine in `AtlasApp` is coherent and well-documented. Nothing reviewed
here is sloppy.

What separates it from production is structural, not cosmetic: **there is no
persistence, no authentication, no cost/abuse protection on the paid API
endpoint, no tests, no CI, and the "AI tutoring" sessions are pre-scripted
multiple-choice content rather than real dialogue.** Each of these is detailed
below with the work required to close it.

---

## Priority legend

| Priority | Meaning |
|---|---|
| **P0** | Launch blocker — shipping without it is broken, insecure, or financially dangerous |
| **P1** | Required for the product to deliver its core promise (the spec's spiral) |
| **P2** | Expected of a production app; can follow shortly after launch |
| **P3** | Spec features and polish that can be sequenced later |

---

## P0 — Launch blockers

### 1. No persistence — all state dies on refresh

Every piece of state — the generated concept graph, node mastery, the streak,
calibration samples, drafted review cards, all generated content caches — lives
in React `useState` inside `components/AtlasApp.tsx`. There is no database, no
`localStorage`, nothing. A page refresh (or accidental tab close) destroys the
learner's entire map and progress, and re-creating it costs another round of
paid LLM calls.

This is fatal to the product's own thesis: the spec (§11, §13) is built on
*returning tomorrow* — spaced review and streaks cannot exist in an app that
forgets everything on reload.

**Work required:**
- Choose a persistence layer (Supabase/Postgres is the natural fit; a
  `localStorage` snapshot is an acceptable stopgap for a beta, but not for
  multi-device).
- Persist: user profile + onboarding form, the graph (including spawned gap
  nodes and positions), the `StateMap`, adherence state, calibration samples,
  generated-content caches (so re-entry never re-bills), and review cards with
  real scheduling metadata.
- Add load/restore on boot (skip onboarding when a map exists) and a
  "continue where you left off" path.

### 2. No authentication or user model

There are no accounts. Combined with #1, every visitor is a fresh anonymous
session; combined with #3, every visitor can spend your money.

**Work required:** any standard auth (Supabase Auth, NextAuth/Auth.js, Clerk).
Sessions must be tied to a user id, and that id must scope all persisted state
and all generation requests.

### 3. `/api/generate` is open, unmetered, and pays per call

`app/api/generate/route.ts` accepts unauthenticated POSTs, and every request triggers
one or two OpenRouter completions (the validator retries once) on your API key.
Anyone who finds the URL can script it and drain the account. There is also:

- **No rate limiting** of any kind (per-IP or otherwise).
- **No input length caps** — `topic`, `interests`, `nodeLabel`, `pool`,
  `nodes` are interpolated into prompts unbounded, so a single request can be
  made arbitrarily token-expensive (`labels()` and the array filters check
  types, not sizes).
- **Prompt injection** — user text is spliced directly into the prompt. The
  blast radius today is only "weird content back to the same user" (the JSON
  validators constrain shape), but combined with cost abuse it matters.
- **No spend ceiling** — no per-user daily budget, no circuit breaker if
  OpenRouter starts erroring or a bug loops generations.

**Work required:**
- Require an authenticated session on the route.
- Rate-limit (e.g. Upstash Ratelimit or middleware) per user and per IP.
- Cap field lengths server-side (`topic` ≤ ~200 chars, `interests` ≤ ~200,
  `pool`/`nodes` array sizes ≤ ~20, etc.).
- Add a per-user daily generation budget and an env-configurable global kill
  switch.
- Log per-request token/cost usage for monitoring.

### 4. Zero tests and no CI

There is not a single test in the repository, and no `.github/workflows` (or
any CI config). The only safety net is `tsc` and the build. The pure reducers
in `lib/curriculum.ts` (~1,900 lines: session engines, frontier derivation,
gap spawning, pace math) and the server-side validators in
`lib/server/generate.ts` are exactly the kind of code unit tests protect —
and exactly the code a regression would silently corrupt (mastery state is the
whole product).

Also: `package.json` has a `lint` script (`next lint`) but **ESLint is not in
`devDependencies` and there is no ESLint config** — the script does not work.

**Work required:**
- Add Vitest (or Jest); unit-test the reducers (`socraticReducer`,
  `feynmanReducer`, `crucibleReducer`, `retainReducer`, `displayStates`,
  `spawnGap`/`removeNode`, `orderedFrontier`, `paceStatus`, adherence
  functions) and every `validate*` in `generate.ts` against malformed model
  output.
- Add one Playwright smoke test of the real flow (welcome → build → diagnostic
  → map) against a mocked `OPENROUTER_BASE_URL` — the pieces (preinstalled
  Chromium, base-URL override) already exist for this.
- Add ESLint (`eslint` + `eslint-config-next`) and fix the `lint` script.
- GitHub Actions: typecheck + lint + test + build on every PR.

---

## P1 — The product promise (spec gaps that change what the app *is*)

### 5. The tutoring sessions are scripted theater, not AI dialogue

This is the most important honest finding. All six phases fetch their entire
content **up front** as one JSON blob, and the "interaction" is choosing among
pre-written multiple-choice replies:

- **Socratic** (spec §7): the spec's core demand — free-form dialogue, a
  scratchpad the AI actually reads, contingent scaffolding, anti-sycophancy
  ("the single most important behavior in the product") — is a fixed 4-step
  script with 3–4 canned replies per step. The learner never types their own
  reasoning; nothing they do changes the questions.
- **Feynman** (§8): "voice-first teach-back" is a `speak` action that reveals a
  pre-generated *plausible transcript of what the learner might have said*.
  The gap report diffs the script, not the learner's explanation.
- **Crucible** (§10): the learner does type a free-form attempt — but it is
  **never evaluated**. `crucibleReducer` hard-codes the outcome: first attempt
  at rung 0 is always `"partial"` (always spawning the pre-generated gap),
  and the retry always passes (`lib/curriculum.ts:1003`). Mastery — the state
  the entire map runs on — is granted by a fixed two-step sequence regardless
  of what the learner wrote.
- **Consume** predictions are real MCQs (fine), but "highlight → ask about
  this" and adaptive modality are static pre-generated strings.

For a demo this is a smart design. For production it means the app cannot
actually detect understanding, which is the product's entire claim.

**Work required (incremental path):**
1. Add a second endpoint (`kind: "evaluate"` or `/api/tutor`) that sends the
   learner's free text + session context to the model and returns a structured
   judgment (verdict, feedback, detected gap). Wire it into Crucible submission
   first — that's where mastery is granted, so it's the highest-leverage fix.
2. Convert Socratic to real multi-turn chat (streaming), keeping the generated
   script as the tutor's *plan* rather than the whole interaction.
3. Feynman: accept typed teach-back first; voice (Web Speech API / Whisper)
   can follow.
4. Keep the scripted mode as a fallback/offline/demo mode if desired.

### 6. Retention scheduling is not real (FSRS in name only)

The review queue is generated fresh by the LLM per run: the "FSRS intervals"
on grade buttons are model-written strings (`"4 d"`), the forecast panel
("Decaying this week — N cards") is entirely invented by the model, grades are
never stored, and no card has a due date. `dailyQueue()` even `parseInt`s the
LLM's count string. Nothing is scheduled; tomorrow's queue would just be
another generation.

**Work required:**
- Store cards (they're already drafted from Connect/Feynman content) with real
  scheduling state per card.
- Use a real FSRS implementation (`ts-fsrs` is the standard TypeScript
  package) to compute intervals from grades; persist review logs.
- Derive the forecast ("due now / this week / solid") from the scheduler, not
  the LLM. Generate card *content* with the LLM; never the *schedule*.

### 7. Adherence is cosmetic

`AdherenceState` has the right shape (freezes, history, best streak), but:
there is no day-rollover logic anywhere — nothing ever appends a new day,
applies a freeze to a missed day, or resets `metToday` at midnight; `history`
only ever contains today; `usualTime` is hard-coded `"7:30pm"`; and the
reminder toggle controls no actual notification. With no persistence (#1), a
streak of 2 is literally unreachable.

**Work required:** after #1, compute rollover on load (compare last-seen date,
consume freezes for missed days, extend history), learn `usualTime` from real
session timestamps, and implement reminders (web push or email) or remove the
toggle until they exist.

### 8. Momentum replay shows nothing for real users

`visibleStates` masks nodes with `n.week > momentumWeek` during the replay —
but every generated node gets `week: 0` (`lib/server/generate.ts` layout) and
spawned gaps get `week: 4` (`SPAWN_WEEK`), while the replay runs weeks 0→3.
So the "map lighting up over weeks" replay shows a static map with gaps
hidden — it was built for demo data that had per-week values and no longer
has a data source. Either persist real "when did this node light" timestamps
(trivial once #1 exists) or remove the toggle for launch.

---

## P2 — Production hygiene

### 9. Error handling & resilience
- **No React error boundary** — any render error white-screens the entire app
  (and with #1, loses everything). Add `app/error.tsx` and `app/global-error.tsx`.
- **No request timeout/abort** on client fetches (`lib/api.ts`) — a hung
  generation leaves the overlay until the server gives up; add `AbortController`
  + a user-facing cancel.
- `route.ts` echoes internal error messages (including OpenRouter response
  bodies, up to 400 chars) straight to the client — map to safe messages, log
  the details server-side.
- No structured logging or error tracking (e.g. Sentry) and no analytics —
  you will be blind in production. Add both.
- No health check endpoint.

### 10. Security headers & platform config
- `next.config.ts` is empty: no CSP, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS. Inline-style-heavy UI makes CSP easy (no inline
  scripts needed).
- `maxDuration = 120` on the generate route requires a Vercel plan that allows
  it — verify against the target plan or the route silently truncates.
- The OpenRouter attribution header is a placeholder (`https://atlas.local`).
- Add `robots.txt`, favicon, and OG metadata (currently only title/description).

### 11. Input devices & accessibility — desktop-mouse only
- The map canvas handles `mousedown/mousemove/wheel` only — **no touch or
  pointer events**: on any phone/tablet the core surface cannot pan, zoom, or
  select. Either implement Pointer Events + pinch zoom or serve an explicit
  "desktop only" gate.
- No keyboard navigation on the canvas, no focus management between screens,
  no `aria-` attributes on custom controls (nodes, phase tracker, grade
  buttons), no `prefers-reduced-motion` handling for the pulse/assemble
  animations.
- Fixed `height: 100vh` layout with absolutely-positioned rails — audit small
  laptop heights and add `100dvh`.

### 12. Cost & latency engineering for generation
- Content is cached only in-memory per run — every returning visitor re-pays
  for every node. Persist the caches (#1) keyed by (topic, node, model).
- First-entry latency per phase is a full LLM round trip behind a modal
  overlay; consider pre-generating the next likely node in the background
  (the frontier is known) and streaming where possible.
- Add retry-with-backoff for transient OpenRouter 429/5xx (currently one
  validation retry exists, but a network failure surfaces immediately).

---

## P3 — Spec features not yet built (sequenced later)

| Spec § | Feature | Status |
|---|---|---|
| §2 | Syllabus paste / **file upload** (PDF, course outline) as map source | Not built — topic string only |
| §2 | Too-broad topic → offer 2–3 scoped sub-maps | Not built |
| §2 | Exam **date** capture (goal is exam/project/mastery only; pace math assumes a fixed 21-day horizon in `paceStatus`) | Partial |
| §3 | Multiple subjects / maps per user | Single topic per run |
| §6 | True adaptive modality (lead with the representation that lands) | Static alt variants |
| §7 | Real scratchpad the AI reads | Canned reaction string |
| §8 | Voice input for Feynman | Simulated |
| §10 | Real interleaving + "boss" branch challenges (rungs are static labels; `draws` is display text) | Not built |
| §12 | Calibration exists ✅ (real felt-vs-real samples) — but samples need persistence | Partial |
| §14 | Full Analytics screen (mastery-over-time, retention health, transfer rate, pace) | Only Calibration exists |
| §16 | Settings screen (goal editing, daily target, interests, notifications, voice, scaffolding aggressiveness, **data export**) | Not built |

---

## Smaller code-level notes (fix opportunistically)

- `components/AtlasApp.tsx:446` — `onNodeDown` reads `positionsRef.current[id]`
  without a guard; a node without a position would crash on `pos.x`. (All
  current paths set positions, but `attachGap` silently no-ops when the parent
  position is missing — same latent assumption.)
- `dailyQueue` (`lib/curriculum.ts:1391`) parses the LLM's `"N cards"` string —
  goes away with real scheduling (#6).
- `validateConnect` computes `wanted` and immediately `void`s it — dead code.
- `consumeSkipCrucible` toasts "skipping ahead to the Crucible" but routes to
  the map without opening the Crucible.
- Gap ids are deterministic per node (`gap-cru-${nodeId}`), and `attachGap` is
  idempotent — good — but a *re*-failure after a pass can't spawn a second,
  different gap (content is cached per run).
- `package-lock.json` is committed ✅ but dependencies use broad `^` ranges on
  major frameworks; consider Renovate/Dependabot once CI exists.
- The in-repo docs (`README.md` "What's implemented", `AGENTS.md`) lag the
  code slightly — sessions/calibration/adherence are built; keep them synced.

---

## Suggested sequencing

1. **Week 1 — stop the bleeding:** auth (#2) + API protection (#3) + error
   boundaries (#9). The app can then be safely exposed at all.
2. **Week 1–2 — make it real:** persistence (#1), restore-on-load, persisted
   generation caches (#12). This unlocks streaks, review, and momentum.
3. **Week 2–3 — make it true:** real FSRS scheduling (#6), free-text Crucible
   evaluation (#5 step 1), adherence rollover (#7).
4. **Week 3–4 — make it safe to change:** tests + CI + ESLint (#4). (Do this
   in parallel if there are two people.)
5. **Then:** real Socratic dialogue (#5 steps 2–3), mobile/touch + a11y (#11),
   Analytics & Settings (P3).

The prototype has done its job: the model, the state machine, and the
server-side validation discipline are the right foundation. The remaining work
is real but well-defined — it's building the production shell (identity,
storage, safety, evaluation) around a core that already works.
