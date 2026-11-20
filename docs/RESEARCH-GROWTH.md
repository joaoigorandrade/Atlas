# Research — learning value, performance, and the habit loop

Written 2026-10-06 on `main` @ 84ad86c. `PLAN-LEARNING.md` already owns _what
Atlas teaches_ (W0–W11); this document does not repeat it. It covers three
things that plan leaves open: **does the learner ever reach the learning**,
**how fast is the app**, and **what brings them back tomorrow**. Every claim
below was measured on this commit or read from production; where something is
inferred rather than measured, it says so.

## How this was researched

- `npm run build` on this commit, then the emitted chunks were measured raw and gzipped.
- Production database (Supabase `vdqyniquypytagxhbaen`), read-only counts.
- Production env var _names_ (`vercel env ls production`); no values were read.
- The app was driven in fixture mode (`atlas-perf`), from welcome to the first node.
- The relevant code was read: `AtlasApp`, `AppGate`, `useRunState`, `warm.ts`,
  `afterBuild.ts`, `adherence.ts`, `api/cron/reminders`.

## The one-paragraph answer

Atlas's teaching is unusually deep. The problem is that learners almost never
reach it. Production has made **2,629 model calls and 137 map builds**, but has
only **2 topics, 4 phase attempts and 0 mastered nodes**. That is dogfooding
with 5 accounts, so the counts are small, but the shape is clear: building a
map is the hook, and the sessions are where people stop. The re-engagement
channel has never sent anything, phones are blocked, and the first screen is
blank until 332 kB of JavaScript has run. The biggest gain in learning value
right now is not a new phase. It is getting a learner to their first retrieval
attempt in under two minutes, and back for a second one the next day.

---

## 1. The funnel: what production shows

| Measure                         | Production (all time) |
| ------------------------------- | --------------------- |
| Accounts                        | 5                     |
| `curriculum` calls (map builds) | 137                   |
| Topics that still exist         | 2                     |
| Nodes · learning · mastered     | 25 · 2 · **0**        |
| `phase_attempts` rows           | **4**                 |
| Model calls (`generation_log`)  | 2,629                 |
| …of which `consume`             | 1,088 (588 jobs)      |
| `content_cache` rows            | 239                   |

What this tells us:

1. **Most model spend goes to content nobody reads.** `afterBuild.ts` warms
   Consume for `CURRICULUM_WARM_NODES = 12` nodes on every build. 137 builds ×
   up to 12 nodes is where most of the 1,088 Consume calls came from, against
   2 Consume attempts.
2. **There is no funnel instrumentation.** `phase_attempts` only records phase
   _closes_. Nothing records "map built → node opened → phase started → phase
   closed → came back on day 2". `generation_log` has no latency, token or
   cache-hit columns, so the app's biggest wait (the model) can't be measured
   either.

## 2. Learning value

`PLAN-LEARNING.md` covers content correctness, gates, spacing, Mix, the final,
languages, math and so on. These are the levers it leaves open, or ranks too
low given the funnel above.

### L1. A short default ladder, with heavier rungs earned by evidence · L

The fixture's first node shows a **9-rung ladder** before the learner has
started: Consume → Explain → Discriminate → Socratic → Feynman → Connect →
Crucible → Recall → Retained. W3.1 caps it at 5 (easy) and 7 (medium). Even so,
every rung runs whether the learner needs it or not.

**Change.** Run the ladder _test-first_ by default. Each rung opens with its
own proof item, and its teaching part runs only on a miss. This is what W3.3
(pretest) and W3.4 (prove-it) already do, applied to every rung. In practice:

- The default visible ladder is **Consume → one applied rung → Recall
  (next day)**.
- A heavy rung (Feynman, Steelman, Crucible) is inserted only when a cheaper
  rung fails or confidence is miscalibrated (`calibOverCount`).
- The plan stays frozen at build (the rule holds); what changes is which
  rungs _open_, decided by the existing ledger.

**Why.** Retrieval practice and mastery learning both say: test, then teach the
miss. The ledger already carries the signal (`shakyReasons`, calibration). The
learner sees three steps, not nine. M.2 (phase effectiveness) will then show
which inserted rungs actually move the 7-day probe.

### L2. Pull the 7-day probe (M.1) and Mix (W5.2) forward · M + L

Nothing in production proves anything was learned. The probe is the only
Durability metric, and it also works as a daily hook (§4). Mix (interleaved
"which idea applies?") is one of the best-supported accelerators, and it is
the first surface that rewards a learner for owning _several_ cities. Both sit
in Stage III and Continuous today. Ship them before Stage IV.

### L3. Session-end "now you can" · S

When a phase closes, show one line written by the generator that names the
capability gained ("You can now tell a basis from a spanning set"), plus the
next rung's cost in minutes. The concept already has a `summary`, so this
needs one more field, not a new kind. Learners keep going when progress is
stated as ability, not as a percentage.

### L4. Faded worked examples on `procedure` nodes · M

Perform shows a full worked case, then asks for a full run. Worked-example
research (Renkl; Sweller) says to fade it: full example, then the last step
left blank, then the last two, then cold. This fits inside Perform's own
reducer as a `fade` level per re-run (`rerun` already exists from W1.4), so it
is not a new phase.

### L5. Skip what the funnel says not to build yet

W6–W11 (languages, math, timelines, uploads, new phases) are each 12–25
dev-days. None of them matters while 0 nodes reach mastered. Hold Stage IV
until §4's funnel shows learners reaching week 2.

---

## 3. Performance

### What was measured

| Item                               | Value                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` first-load JS                  | **332 kB** gz (102 shared + page)                                                                                                                     |
| `app/page-*.js`                    | 540 kB raw · **150 kB gz**, one chunk                                                                                                                 |
| `next/dynamic` / `React.lazy` uses | **0**                                                                                                                                                 |
| supabase-js chunk (`962-*.js`)     | 188 kB raw · 52 kB gz (includes Realtime)                                                                                                             |
| Client uses of supabase-js         | `refreshSession` (useToast), `signOut` (useNavigation), LoginScreen                                                                                   |
| SSR output of `/`                  | `AppGate` (blank paper). `hydrated` starts `false` in `useRunState:223` and flips in an effect, so the server-read `initial` never paints server-side |
| Root-state hover                   | `hoverId` is `useState` in `AtlasApp`: each node hover re-renders the shell                                                                           |
| `React.memo` in components         | 2                                                                                                                                                     |
| React Compiler                     | off                                                                                                                                                   |
| Map DOM                            | 258 elements, 2 canvases. The map itself is cheap                                                                                                     |

### P1. Split the bundle by screen · S

`AtlasApp` statically imports all 16 phase views plus Dashboard, Continent,
Profile, Settings and CalibrationView. Load each phase view, and every screen
except the map, with `next/dynamic`. Prefetch the owed phase's chunk where the
warm queue already prefetches its content (`warmKindsFor`), so opening a phase
stays instant. _Inference:_ most of the 150 kB page chunk moves off the
critical path. Measure with `npm run build` before and after.

### P2. Remove supabase-js from the browser · S

Three calls justify 52 kB gzipped. Replace them with:

- `POST /auth/signout`, a server route on `@supabase/ssr`;
- `POST /api/auth/refresh`, which the 401 handler in `useToast` calls;
- the magic-link request moves to a server action on `/login`.

`middleware.ts` already refreshes cookies on navigation. The `NEXT_PUBLIC_SUPABASE_*`
mirror in `next.config.ts` can then go too.

### P3. Paint the map from the server · M

`app/page.tsx` already reads `profile` and `topics` on the server to save
~770 ms, but the client discards that and shows `AppGate` until an effect runs.
Two steps:

1. **Cheap:** when `initial` is present, start `hydrated` as `true` (derive it
   in `useRunState`'s initializer). The first client render is then the map,
   not the gate.
2. **Proper:** render the dashboard or map shell (masthead, rails, node list)
   as a Server Component and stream it. Leave the canvas as the client island.
   LCP then stops depending on bundle parse time.

### P4. Stop the whole-app re-render · M (part of the refactor below)

`AtlasApp` holds hover, query, loading, judging and every live stream (via
`useSessionState`). Token-by-token frames arrive every ~66 ms
(`OPENROUTER_PARTIAL_MS`). _Inference, verify with the React Profiler:_ each
frame and each hover re-renders the full 1,010-line shell and its children.
Two fixes, cheapest first:

- Turn on **React Compiler** (`experimental.reactCompiler` plus
  `babel-plugin-react-compiler`, the one new dependency) to auto-memoize the
  prop-drilled tree. Move `hoverId` into `MapCanvas`/`NodeHoverCard`.
- The structural fix is §5.

### P5. Measure the model, since it is the real wait · S

Add `ms`, `ttft_ms`, `model`, `tokens_in`, `tokens_out` and `cache_hit` to
`generation_log`. `logGenerationCalls` already writes every call. With that
data:

- choose the judge model on p50/p95 latency, not on feel;
- confirm that the first Consume after a build is a cache hit (the
  `afterBuild` promise);
- report Web Vitals with `useReportWebVitals` (built into Next) to `lib/log`.
  No vendor needed.

### P6. Warm less, later · S

Lower `CURRICULUM_WARM_NODES` from 12 to **2–3** (the frontier the learner can
actually open). When the first phase closes, the client warm queue already
looks ahead. This cuts most of the speculative spend from abandoned builds
with no latency cost to anyone who stays.

---

## 4. The habit loop — making Atlas hard to put down

The aim is a loop that pays out _on learning_: a retrieval success, a city lit
or restored. It should not pay out on time-in-app. A reward tied to minutes
would optimize reading, which is exactly what the gates exist to stop.

The pieces already in place are good: a forgiving streak with banked freezes
(`adherence.ts`), the map lighting up, fading cities (W4.2), and one daily
plan (W4.6). What is missing is everything that brings someone back.

### H1. A trigger that actually fires · S — do first

- **The reminder has never been sent.** Production has no `RESEND_API_KEY` and
  no `APP_URL`, so `/api/cron/reminders` logs `reminder_noop` and returns.
  Set both. Without `APP_URL`, the link in the mail would point to
  `https://atlas.local`.
- **Send at the learner's hour.** The cron runs once a day at 18:00 UTC
  (15:00 in Brazil) because Hobby allows only daily crons. Use Supabase
  `pg_cron` + `pg_net` to call the route hourly instead (free, already your
  database), and gate on `adherence.usualTime`.
- **Say something specific.** "3 cards in _Eigenvalues_ are fading · 4 min"
  beats "Your queue is ready". `dailyPlan()` already computes it.
- **Web Push.** Add a manifest and a service worker. Safari supports Web Push
  on macOS and on iOS home-screen apps. That is the second channel, beside
  email. The iOS app should use local notifications from the same `dailyPlan`.

### H2. One tap from trigger to learning · M

- **Unblock phones for the daily loop.** `AtlasApp:548` blocks anything below
  768 px. That is defensible for the canvas, but the daily habit happens on a
  phone. Below 768 px, render **Today + Review + the current phase** (all
  single-column already) and keep the map gated.
- **Deep links.** `/?today=1` and `/review` open straight into the first item.
  The reminder and the push notification link there, not to the dashboard.
- **3-minute units** (W4.7): finish the parking audit so every phase resumes.

### H3. First win in under two minutes · M

Today a new learner fills a seven-field form, waits about 26–39 s for the
build, then gets a placement offer. After that they land on a map with no
call to action. At the 800 px viewport tested here, clicking a node showed
nothing until "⟨ Node" was pressed.

- **Ask for the topic and goal only.** Ask for interests, daily target and
  date _after_ the first session, when the learner has a reason to answer.
- **Start the first node during the build.** The first frontier node's Consume
  is the first warm. Open it as soon as it lands, with the map assembling
  behind it as context. The map is the reward for finishing the first
  section, not the doorway to it.
- **Placement inside, not before.** The section pretests (W3.3) _are_
  placement. Fold the 5-question diagnostic into them.
- On the map, always show a primary "Continue: _Foundations_ · Consume ·
  4 min" button, whether or not the rail is open.

### H4. Make the reward visible and variable · M

- **Conquest moment.** When the last gate closes, ink the city on the canvas,
  extend the coastline, and name what it unlocked. The `assemble` keyframes
  and `WaxSeal` are already there.
- **Reclaim loop.** A fading city (W4.2) is honest loss aversion: the map
  really is forgetting. "Restore _Basis_ · 2 cards" is a better daily hook
  than a streak, because the learner can see what they would lose.
- **Variety, not slot machines.** Mix (L2) and the "prove it" challenge are
  the novelty: a surprise expedition when 3+ cities are green. Never randomize
  the _reward_ itself (no loot, no random XP).
- **Territory explored %** per map and continent, in the masthead. It is
  progress you can feel without inventing a new mastery state.

### H5. Investment: things the learner owns · M

People come back to what they made. The learner's Feynman explanations,
Connect sentences and Socratic answers are already stored. Surface them as a
**Codex** per city (their own words, dated) and let them export it (W10.3).
Proven pages (W5.4) are the shareable version.

### H6. A streak that doesn't punish · S

- Add a **weekly target** ("4 of 7 days") as an alternative to the daily
  streak. It works better for exam students with competing courses.
- Add milestones at 7, 30 and 100 days, each earning a freeze. The mechanic
  already exists: `FREEZE_EVERY`.
- Don't use guilt copy, fake urgency or streak-loss alarms. The `adherence.ts`
  comment already says why: losing a streak is the #1 reason people quit.

### H7. Instrument it · S — needed to know any of this worked

Add a small `events` table (`user_id, evt, topic_id, node_id, at`), written
through `/api/v1`, with these events: `map_built`, `node_opened`,
`phase_started`, `phase_closed` (from `phase_attempts`), `reminder_sent`,
`reminder_opened` and `session_started`. Then three SQL views:

- the activation funnel;
- D1, D7 and D30 return rates;
- time from map build to first phase close.

This is the "Stay" number in `PLAN-LEARNING.md`, made readable.

---

## 5. The refactor worth doing now

You said a large refactor is fine, so this is the one that pays for P4, H2
and every future screen. The rest of this document does not depend on it.

**Problem.** `AtlasApp` (1,010 lines) composes about 12 hooks and passes their
output through props. `useSpiral` is 1,622 lines. All renderable state lives at
the root, which causes three problems:

- any update re-renders the shell;
- phone-only routes can't mount just the pieces they need;
- the size ratchet leaves no headroom (`size-budget.json`).

**Shape.**

1. **One external store** (`useSyncExternalStore`, no library) holding the run
   (`useRunState`'s data) and the live sessions. Components subscribe with
   selectors: the map reads node states, a phase view reads its own session.
   A streamed frame then re-renders only the phase that is streaming.
2. **Actions stay where they are.** The `useSpiral` handlers become functions
   over the store (`getState`/`setState`) instead of closures over refs. The
   rule that only `enterOwedPhase` decides hand-offs is unchanged. Most of the
   `useLive`/ref plumbing that exists to keep callbacks stable disappears,
   because store actions are stable by construction.
3. **Routes for the surfaces that need a URL:** `/`, `/today`, `/review`,
   `/t/[topic]` and `/t/[topic]/n/[node]/[phase]`. Each mounts only what it
   reads. `usePageTurn` keeps the crossfade via view transitions.

Do it behind the e2e progression specs, one surface at a time: the map first,
then Review/Today (which unlocks H2), then phases.

---

## Order of work

| #   | Item                                             | Size | Moves                     |
| --- | ------------------------------------------------ | ---- | ------------------------- |
| 1   | H1 set `RESEND_API_KEY`/`APP_URL`, specific copy | S    | return rate               |
| 2   | H7 events + funnel views; P5 latency columns     | S    | makes everything readable |
| 3   | P6 warm 2–3 nodes                                | S    | spend                     |
| 4   | P1 split by screen · P2 drop supabase-js · P3.1  | S×3  | first paint               |
| 5   | H3 first win < 2 min                             | M    | activation                |
| 6   | L1 test-first ladder, 3 visible rungs            | L    | minutes-to-mastery, stay  |
| 7   | H2 phone Today/Review + deep links + push        | M    | return rate               |
| 8   | L2 probe + Mix forward; H4 conquest/reclaim      | M+L  | durability, return        |
| 9   | §5 store + routes refactor (with P4)             | L    | perf, velocity            |
| 10  | H5 Codex, H6 weekly target, L3, L4               | S–M  | investment, depth         |

The first three items are about a day of work, and they are what turns the
rest from guesses into numbers.
