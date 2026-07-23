# Atlas — Deep Test Report & Production Ship Plan

> Date: **2026-07-19** · Branch: `main` @ `05dda7f` · Stack: Next 15.5.20 · React 19 · TS strict
> Model under test: `deepseek/deepseek-chat` via OpenRouter · Build ✓ · Typecheck ✓ · 137 kB first load
> Published artifact: <https://claude.ai/code/artifact/83827911-bc7f-4eeb-8bd8-3d893c7ce111>
>
> **Update — 2026-07-23:** the backlog below is now implemented and shipped.
> See §0 for the per-task status. Build ✓ · Typecheck ✓ · 38 unit tests ✓ ·
> Supabase migrations applied (RLS on) · **live in production**:
> <https://atlas-tan-two.vercel.app>

---

## 0. Implementation status — 2026-07-23

The full backlog (§vii) was implemented after this report was written. Current
state on `main` (working tree):

- `npm run build` ✓ · `npm run typecheck` ✓ · `npm test` → **38 passed, 4 skipped**
  (the 4 are the live-model eval, gated behind `RUN_EVAL=1`).
- Supabase project `vdqyniquypytagxhbaen`: `run_states` + `generation_log`
  tables live, **RLS enabled**, `generation_calls_this_month()` RPC present.
- Deployed to Vercel (`estou-casando/atlas`) — production alias
  **<https://atlas-tan-two.vercel.app>** serving: `/` gated → `/login`,
  `/privacy` public (200), auth + Supabase env working at runtime.

### Per-task status

| Task | Title | Status |
|---|---|---|
| #7 | Root-container scroll drift | ✅ `overflow: clip` on the app root |
| #8 | Responsive minimum pass | ✅ rails collapse < 1280 px, gate < 768 px |
| #9 | Momentum replay never ends | ✅ `setMomentumPlaying(false)` at `MOMENTUM_WEEKS` |
| #10 | Validators vs template echoes | ✅ semantic rejections + unit tests |
| #11 | Retry/backoff + fallback + friendly errors | ✅ backoff, model chain, `BUSY_MESSAGE`, 401/402 kept distinct |
| #12 | Gap nodes → targeted Socratic | ✅ gap CTA calls `enterSocratic` |
| #13 | "Retained ✓" premature | ✅ `phaseIndex(state, reviewed)`; needs real review history |
| #14 | Shaky copy accuracy | ✅ `ShakyReason` per node, reason-selected copy |
| #15 | Crucible draws vs real nodes | ✅ validated against `masteredLabels` |
| #16 | Updater side-effects + DAG cycle check | ✅ cycle rejection in `validateCurriculum`; pure updater |
| #17 | Auth + persistence (Supabase) | ✅ email/password accounts + `run_states` snapshot, RLS |
| #18 | Protect `/api/generate` | ✅ auth, input caps, daily quota, monthly cap, logging |
| #19 | Error monitoring + structured logs | ✅ structured JSON logs per call; Vercel-native observability (Sentry deferred by choice) |
| #20 | CI — typecheck/build/tests/smoke | ✅ `.github/workflows/ci.yml` + Vitest suites |
| #21 | Real FSRS scheduling | ✅ `ts-fsrs`, persisted `StoredCard`s, real due dates + forecast |
| #22 | Day-aware adherence | ✅ `rolloverAdherence`, `lastDay`, persisted |
| #23 | Exam date + real pace | ✅ `examDate` captured; `paceStatus(daysLeft)` |
| #24 | DB content cache | ✅ per-node caches in the run snapshot |
| #25 | Free-text Socratic judging | ✅ `judgeSocratic` endpoint |
| #26 | Real Feynman diffing | ✅ `judgeFeynman` endpoint |
| #27 | Judged Crucible | ✅ `judgeCrucible` endpoint |
| #28 | Model split + eval suite | ✅ `OPENROUTER_JUDGE_MODEL` + `npm run eval` fixtures |
| #29 | Vercel deploy | ✅ live production (alias above); env set for prod+preview |
| #30 | PDF/syllabus upload | ✅ `/api/extract` (unpdf), size/type-capped, grounds curriculum |
| #31 | Right-moment reminders | ⚠️ cron route + `vercel.json` scaffold; **daily** (Hobby cap), email gated on `RESEND_API_KEY` |
| #32 | Settings + data export | ✅ Settings screen: goal/date/target/interests/reminder + JSON/CSV export |
| #33 | Launch hardening | ⚠️ **partial**: privacy page + account/data deletion (`/api/account/delete`) done; analytics, load test, security-review sign-off outstanding |

### Follow-ups still open

1. **#31 right-moment reminders** need Vercel **Pro** for an hourly cron; the
   Hobby plan caps crons at once/day, so reminders currently fire daily to all
   armed+unmet learners rather than at each learner's usual hour. Email delivery
   is a no-op until `RESEND_API_KEY` (+ verified sender) is set. **Set
   `CRON_SECRET` first** — the cron route is otherwise publicly triggerable; a
   fail-safe forces sends to no-op on any unauthenticated hit, so real email
   only flows once `CRON_SECRET` is set and matched.
2. **Supabase auth advisor:** login is now email/password (not magic link), so
   **enable leaked-password protection** (HaveIBeenPwned) in Auth settings.
   <https://supabase.com/docs/guides/auth/password-security>
3. **#33 remainder:** product analytics (D1/D7 return, phase-completion,
   gap-close), a generation-path load test, and a security-review sign-off are
   still process work, not yet code.
4. **Docs drift:** `AGENTS.md` still describes magic-link auth; the app uses
   email/password. Reconcile.

---

Every feature was exercised end-to-end against the production build (`npm run build` +
`next start -p 3100`) with **live AI generation**, plus a static review of the full
codebase. This document records what works, what's broken, what's missing, and a
phased plan to take Atlas from polished prototype to shippable product.

---

## i. Verdict

**The learning loop works — the product around it doesn't exist yet.**

Every phase of the spiral (Plan → Consume → Socratic → Feynman → Connect → Crucible →
Retain), the diagnostic, gap write-backs, adherence, and calibration all function
end-to-end with live generated content, and the build is clean. But there is **no
persistence, no auth, no API protection, and no real assessment** — a page refresh
erases everything, anyone can burn the OpenRouter balance, and session outcomes are
pre-scripted rather than judged. Atlas today is an excellent interactive demo of the
spec. The plan below is sequenced to close exactly that gap.

---

## ii. What was tested, and what happened

Full click-through of the production build, driving a real run: *Linear Algebra*,
exam goal, chess/investing interests, 15 min/day target.

| Surface | Result | Notes from the run |
|---|---|---|
| Onboarding · Welcome | ⚠️ works, gaps | Form works. "Drop a PDF" is copy only — no upload exists. Exam goal never asks for a date. |
| Onboarding · Build + Diagnostic | ✅ pass | Generated an 18-node DAG + 3 probes. All three answer effects verified: confident pruned the chain, hesitant marked Shaky and spawned a gap node, "no idea" left territory unknown. |
| Map · canvas & rails | ⚠️ works, bugs | Pan/zoom/drag, search dimming, locked-path highlight, goal-ordered Next Up, pace warning all work. Two layout bugs (P1 below). |
| Phase 2 · Consume | ✅ pass | Predict→reveal with honest wrong-guess corrections, pre-taught terms, real citations (Axler, Strang, Lay), interest-based analogy rewrites (chess), auto-advance to Socratic. |
| Phase 3a · Socratic | ✅ pass | Wrong reply caught, not smoothed over. Help dial rises on "I'm stuck", "Just tell me" teaches and advances, scratchpad gates the step. All four moves used in order. |
| Phase 3b · Feynman | ⚠️ works, content bug | Freeze-scaffold, speak/type toggle, verdict diff (2 explained / 1 skipped / 1 confused), fix micro-pass flipped a red row to green, unresolved gap wrote back to the map. But reply labels were literal template echoes (P2 below). |
| Phase 4 · Connect | ✅ pass | Correctly auto-detected "conceptual" and hid mnemonic tools. Both links confirmed; two atomic cards drafted for Retain; node advanced to Shaky. |
| Phase 5 · Crucible | ⚠️ works, scripted | Confidence gate → novel chess-framed problem → forced first failure → gap "Component-wise Addition" written back → re-explain → rung-down retry → pass → Mastered, gap resolved, streak ticked. The outcome is deterministic and the generated "error" was self-contradictory (P2 below). |
| Phase 6 · Retain | ✅ pass | Honest queue (~8 min · 5 cards), confidence tap → cloze flip → FSRS-labeled grades. "Again" fired the full alive-loop: overconfidence read-back, instant re-explanation, node flagged Shaky, re-teach offered. Cleared queue reached "Done for today". |
| Adherence | ✅ pass | Streak 0→1 on mastery, "Review · clear ✓", freeze banked, reminder copy. Not day-aware (see blockers). |
| Calibration | ✅ pass | Live curve from real taps: Vector Operations 89% felt / 60% real flagged overconfident; coach line and jump-to-Crucible present. |
| API `/api/generate` | ✅ pass | Correct 400s for bad JSON, missing topic/nodeLabel, unknown kind, empty pools; 405 for GET. Key stays server-side. One live 502 handled gracefully by the client (toast, no crash). |

---

## iii. Bugs found

Reproduced during the run unless marked code-level. Ordered by severity. Each maps to
a task in the backlog (task numbers refer to the session task list created 2026-07-19).

### P1 — Root-container scroll drift shifts the whole UI off-screen, unrecoverably *(task #7)*

The app root uses `overflow: hidden`, but its content (canvas SVG, off-screen nodes)
still creates scrollable overflow (`scrollWidth` 2038 at a 1440 viewport). Any
browser-initiated `scrollIntoView` — focusing the search box, tabbing to a button near
the clipped edge — scrolls the hidden container (observed `scrollLeft = 200`),
dragging the nav and left rail off-screen with no scrollbar to recover. Hit twice in
one session, once from an ordinary NodeDetail chip click that then also swallowed the
click.

**Fix:** `overflow: clip` on the root in `components/AtlasApp.tsx` (clip forbids
programmatic scrolling), or reset `scrollLeft/scrollTop` in a scroll listener.

### P1 — No responsive layout: unusable below ~1350 px *(task #8)*

TopBar, LeftRail (240 px), and NodeDetail (~310 px) are absolutely positioned with
fixed widths. At laptop-narrow and split-screen widths the rails collide with and
cover the canvas; at 716 px the app is unusable. No mobile story at all.

**Fix:** minimum-viable pass — collapsible rails below a breakpoint + a "best on
desktop" gate for mobile.

### P2 — Momentum replay never ends; later-spawned nodes stay masked *(task #9)*

Code-level, confirmed in `components/AtlasApp.tsx`: when the replay reaches week 3 the
interval clears but `momentumPlaying` stays `true`, so the week-mask keeps applying.
Gap nodes spawned mid-run (week 4) render grey/unknown indefinitely until the user
happens to toggle the button again.

**Fix:** set `momentumPlaying(false)` when `next >= MOMENTUM_WEEKS`, or auto-toggle
after a beat.

### P2 — Generated content passes validation while being pedagogically broken *(task #10)*

Two live occurrences: (1) Feynman reply options were literal echoes of the prompt's
placeholder text — the learner is asked to choose between "a complete, precise answer"
and "a confidently WRONG answer (a real misconception)". (2) The Crucible transfer
diagnostic named an error that didn't exist: "resulting in [4, 2] instead of [4, 2]" —
the sample attempt was actually correct, yet it "failed". Validators check shape and
non-emptiness, not sense.

**Fix:** reject known template echoes in validators; longer term, replace scripted
verdicts with real answer judging (Phase 2 of the plan).

### P2 — Transient upstream errors surface raw and unretried *(task #11)*

A live DeepSeek 429 ("temporarily rate-limited upstream") reached the user as a toast
containing raw provider JSON, mapped to a 502. There is no backoff-retry and no
fallback model, so a routine upstream blip fails the user's action outright.

**Fix:** retry 429/5xx with backoff in `lib/server/openrouter.ts`, add an
`OPENROUTER_FALLBACK_MODEL` chain, and map errors to friendly copy.

### P3 — Gap nodes are dead ends *(task #12)*

The spec promises each red gap opens a targeted Socratic pass. On the map, a gap
node's primary action is only a toast (`onPrimaryAction`, case "gap"). Gaps spawned
from the diagnostic and Feynman can never actually be closed from the map.

### P3 — "Retained ✓" is granted at the moment of mastery *(task #13)*

`phaseIndex("mastered")` returns 6, so the phase tracker shows Retained as complete
before a single review has happened — undercutting the product's own "mastery =
understood + retained + applied" definition.

### P3 — Shaky copy claims a failure that may not have happened *(task #14)*

The node-detail confidence line for Shaky always reads "your last application failed",
but nodes also become Shaky by completing Connect or by a hesitant diagnostic answer.

### P3 — Crucible "drawn from your map" list isn't validated against the map *(task #15)*

The interleave chips displayed "Chess" — an interest, not a map node. `draws` are free
strings from the model; validate them against real node labels or drop the claim
"from your map".

### P3 — Side effects inside a state updater; no DAG cycle check *(task #16)*

Code-level: `answerDiagnostic` calls `setStates` and mutates `pendingGapsRef` inside
the `setAnswered` updater. React is free to invoke updaters more than once
(StrictMode, concurrent renders) — duplicate pending gaps are only saved today by
`attachGap`'s idempotence. Also: a generated curriculum containing a prerequisite
cycle would leave those nodes permanently locked (Kahn layout tolerates cycles;
`displayStates` does not) — worth a server-side DAG check.

---

## iv. Production blockers

Not bugs — whole systems the spec assumes that don't exist yet. These define the ship
plan.

1. **No persistence.** Graph, mastery, streak, calibration, and cards live only in
   React state. Refresh = total loss. Nothing about a "daily spine" or FSRS can be
   true without storage.
2. **No auth, no users.** One anonymous session; nothing separates learners.
3. **Unprotected generation endpoint.** `/api/generate` has no auth, no rate limit,
   no input length caps, no spend caps. Anyone who finds the URL spends the
   OpenRouter balance; a 100 KB "topic" goes straight into the prompt.
4. **Sessions are scripted, not judged.** Socratic/Feynman replies are pre-generated
   multiple choice; the scratchpad "reading" is canned; "voice-first" is a typing
   animation; the Crucible fails rung 0 and passes rung 1 *regardless of what the
   learner writes*. Mastery is therefore claimable without understanding — the core
   spec promises (contingent tutoring, real gap detection, transfer as truest signal)
   need a live judging loop.
5. **FSRS doesn't exist.** Intervals are strings the LLM invents; the forecast panel
   is fabricated numbers; nothing is scheduled, stored, or due tomorrow.
6. **Adherence isn't day-aware.** `freshAdherence()` runs on every load; streaks and
   freezes never span days; "reminders" have no delivery mechanism.
7. **Pace math is hardcoded.** Exam countdown is a constant 24 days (`EXAM_DAYS`) and
   35 min/node; the exam date is never asked for.
8. **No tests, CI, or monitoring.** Zero automated tests, no CI pipeline, no error
   tracking, no analytics. Also promised-but-absent: PDF/syllabus upload,
   too-broad-topic scoping, interleaved/boss problems, voice input, settings, data
   export.

---

## v. Ship plan

Four phases, each with an explicit exit gate. Estimates assume one focused engineer
plus AI tooling; treat them as relative sizes.

### Phase 0 · Stop the bleeding — ~1–2 weeks *(tasks #17–#20)*

Make the current demo safe to put behind a URL.

- **Auth + database** *(#17)*: Supabase — accounts, and persist the run state (graph,
  StateMap, adherence, calibration, generated-content cache) keyed by user. Start
  with a coarse JSON snapshot per subject; normalize later.
- **Protect `/api/generate`** *(#18)*: require a session, per-user daily generation
  quota, cap `topic`/`interests`/label lengths, and a global monthly spend ceiling.
- **Fix P1s and P2s** *(#7–#11)*: `overflow: clip`, responsive-minimum pass, momentum
  flag reset, retry/backoff + fallback model + friendly error copy.
- **Observability** *(#19)*: Sentry (client + route), structured logs on generation
  cost/latency/validation-retries.
- **CI** *(#20)*: GitHub Actions — typecheck, build, unit tests for the pure reducers
  and validators, and one Playwright smoke (welcome → build → diagnostic → map with a
  mocked `OPENROUTER_BASE_URL`, which the code already supports).

> **Exit gate:** a logged-in user can refresh mid-session and lose nothing; a
> stranger cannot spend a cent of OpenRouter budget.

### Phase 1 · Make the promises true — ~2–4 weeks *(tasks #21–#24)*

The features the UI already claims become real.

- **Real FSRS** *(#21)*: adopt `ts-fsrs`; persist cards (from Connect links, Feynman
  fixes, Socratic tells) with real due dates; the Review queue and forecast read from
  the scheduler, not the LLM's imagination.
- **Day-aware adherence** *(#22)*: streak/freeze logic on calendar days server-side;
  the "done for today" state survives until midnight, not until refresh.
- **Real pace** *(#23)*: capture the exam date at onboarding; derive `daysLeft`; keep
  the warning honest.
- **Close the gap loop** *(#12, #13)*: gap nodes open their targeted Socratic pass;
  "Retained ✓" requires actual review history.
- **Validation hardening** *(#10, #15, #16)*: template-echo rejection,
  draws-must-be-node-labels, server-side DAG/cycle check.
- **Cost control** *(#24)*: cache generated curriculum + phase content in the DB per
  (topic, kind, node) and reuse across sessions and users.

> **Exit gate:** a learner who comes back three days running sees a real queue, a
> true streak, and a pace number derived from their actual exam date.

### Phase 2 · Real tutoring (the moat) — ~4–8 weeks *(tasks #25–#28)*

Replace scripts with judgment — this is the product's actual bet.

- **Free-text Socratic** *(#25)*: learner types (or dictates) answers; a server-side
  judge classifies correct/near/wrong/lost and generates the contingent response,
  streaming. The anti-sycophancy behavior moves from copy to prompt + eval.
- **Real Feynman diffing** *(#26)*: the learner's own explanation (text first, voice
  later) is diffed against the concept's sub-points to produce the Gap Report — gaps
  are detected, not chosen from a menu.
- **Judged Crucible** *(#27)*: grade the actual attempt; failure names the actual
  missing sub-concept; success is earned. Add the interleaved and boss rungs once
  several nodes are green.
- **Model strategy** *(#28)*: cheap model for content generation, stronger model for
  judging; a small eval set per behavior (does it catch planted misconceptions? does
  it refuse to validate wrong answers?) running in CI.

> **Exit gate:** a learner who answers wrongly cannot reach Mastered; the eval suite
> proves the tutor catches planted misconceptions.

### Phase 3 · Launch polish — ~2–4 weeks, overlaps Phase 2 *(tasks #29–#33)*

Everything a public launch needs around the core.

- **Deploy** *(#29)*: Vercel production project, env via `vercel env`, preview
  deploys per PR, Rolling Release for the launch.
- **Onboarding completeness** *(#30)*: PDF/syllabus upload with grounding,
  too-broad-topic scoping (2–3 sub-map offers), skip-diagnostic path.
- **Reminders** *(#31)*: email or push at the learner's usual time (Vercel Cron + the
  stored `usualTime`).
- **Settings surface** *(#32)*: goal/deadline editing, daily target, interests,
  scaffolding aggressiveness, voice toggle, export (cards + map JSON).
- **Hardening** *(#33)*: load test the generation path, security review of the API
  surface, privacy policy + data deletion, product analytics on the loop (D1/D7
  return, phase completion, gap-close rate).

> **Exit gate:** a stranger can sign up, build a map on their own topic, and return
> tomorrow to a working daily loop — without anyone on the team touching a server.

---

## vi. Appendix · session facts

| Fact | Value |
|---|---|
| Generation calls in one node's full spiral | 6 (curriculum, consume, socratic, feynman, connect, crucible, retain) — observed latency roughly 15–60 s each on deepseek-chat |
| Observed failures | 1 × upstream 429 (DeepSeek via DeepInfra), surfaced as 502; succeeded on manual retry |
| Validation behavior | Server retries once with the validation error appended; ids/layout/offsets computed server-side as documented |
| API negative tests | invalid JSON → 400 · missing topic → 400 · unknown kind → 400 · missing nodeLabel → 400 · empty nodes/pool → 400 · GET → 405 |
| Write-backs verified on the map | diagnostic gap ("Matrix Multiplication"), Feynman gap ("scaling vs rotating"), Crucible gap ("Component-wise Addition", later resolved), Review miss → Matrices flagged Shaky |
| Key safety | `OPENROUTER_API_KEY` confirmed server-only; `.env.local` gitignored |

Tested 2026-07-19 against a local production build with live OpenRouter generation.
Test-harness note: two coordinate-space desyncs of the testing browser were
identified and excluded from findings; every reported bug was verified in-DOM or in
source.

---

## vii. Task backlog

The full backlog derived from this report — 27 tasks, each with context and
acceptance criteria. Numbering matches the session task list created 2026-07-19.
**Ready to start now** (no blockers): #7–#16, #17, #19, #20, #23, #29, #30.

### Bug fixes

#### #7 · Fix root-container scroll drift that shifts the UI off-screen — `P1`

**Context:** The app root div in `components/AtlasApp.tsx` uses `overflow:hidden`,
but canvas content still creates scrollable overflow (`scrollWidth` ~2038 at a 1440
viewport). Browser-initiated `scrollIntoView` (focusing the search box,
tabbing/clicking buttons near the clipped edge) scrolls the hidden container
(observed `scrollLeft=200`), dragging the top nav and left rail permanently
off-screen — no scrollbar exists to recover. Reproduced twice in one session; once it
also swallowed a NodeDetail chip click.

**Fix:** change the root container to `overflow:clip` (clip forbids programmatic
scrolling), or add a scroll listener that resets `scrollLeft/scrollTop` to 0. Prefer
`overflow:clip`.

**Acceptance:**
- With the map open, focus the search input, tab through NodeDetail chips, and click
  prerequisite chips: TopBar "Map/Session/Review" pills remain fully visible and
  clickable at all times.
- `element.scrollLeft` on the root container stays 0 after keyboard-tabbing through
  the entire map surface.
- `npm run build` passes.

#### #8 · Add minimum responsive layout pass (usable ≥1024px, gated below) — `P1`

**Context:** TopBar, LeftRail (~240px fixed), and NodeDetail (~310px fixed) are
absolutely positioned in `components/map/*`. Below ~1350px viewport width the rails
collide with/cover the canvas; at 716px (e.g. split screen) the app is unusable.
There is no mobile story.

**Fix (minimum viable):** collapsible left rail and node-detail rail below a
breakpoint (e.g. 1280px) with toggle affordances; below a hard minimum (e.g. 768px)
show a polished "Atlas is best on a desktop screen" gate rather than a broken layout.

**Acceptance:**
- At 1440, 1280, and 1024px widths: all top-bar controls, left-rail actions, and
  NodeDetail CTAs are reachable and unclipped (verify with Playwright viewport runs).
- At 375px the gate screen renders instead of overlapping rails.
- No horizontal scrolling of the page body at any width.

#### #9 · Reset momentumPlaying when the momentum replay finishes — `P2`

**Context:** In `components/AtlasApp.tsx` (`toggleMomentum`, ~line 1363), when the
replay interval reaches `MOMENTUM_WEEKS` it clears the interval but never sets
`momentumPlaying(false)`. The week-mask in `visibleStates` keeps applying, so nodes
spawned mid-run (week 4 gap nodes, `SPAWN_WEEK` in `lib/curriculum.ts`) render masked
grey/unknown indefinitely until the user toggles the button again.

**Fix:** when `next >= MOMENTUM_WEEKS`, clear the interval AND
`setMomentumPlaying(false)` (optionally after a ~1s beat so the final frame reads).

**Acceptance:**
- Spawn a gap node (e.g. via a hesitant diagnostic answer), run Momentum replay, wait
  for it to end: the gap node returns to its red gap rendering without any further
  clicks.
- The "Momentum replay" button reads as off (not mid-replay) after the replay
  completes.

#### #10 · Harden content validators against template echoes and nonsense — `P2`

**Context:** Validators in `lib/server/generate.ts` only check shape/non-emptiness,
so pedagogically broken content passes. Observed live: (1) Feynman reply labels were
literal echoes of the prompt's placeholder text — learner saw options "a complete,
precise answer" / "a hand-wave ('you'll feel it', 'just trust it')" / "a confidently
WRONG answer (a real misconception)"; (2) Crucible transfer diagnostic named a
nonexistent error ("resulting in [4, 2] instead of [4, 2]") for a sample attempt that
was actually correct.

**Fix:** add semantic rejection rules to `validateFeynman`/`validateCrucible` (and
siblings): reject reply labels matching known prompt-template phrases; reject
transfer rows where the "error" quotes identical before/after values; the existing
one-retry loop then re-prompts with the specific failure. Tighten prompts to instruct
writing concrete answers, not descriptions of answers.

**Acceptance:**
- Unit tests feed captured bad payloads (template-echo replies, self-identical error
  text) to the validators and assert they throw.
- 10 consecutive live Feynman generations on 2 different topics produce zero
  template-echo labels.
- Retry loop still succeeds within 2 attempts for normal generations.

#### #11 · Add retry/backoff, fallback model, and friendly errors to the OpenRouter client — `P2`

**Context:** A live DeepSeek upstream 429 ("temporarily rate-limited upstream",
provider DeepInfra) reached the user as a toast containing raw provider JSON, mapped
to HTTP 502 by `lib/server/openrouter.ts`. There is no retry for transient errors and
no fallback model, so a routine upstream blip fails the user's action outright.

**Fix in `lib/server/openrouter.ts`:** retry 429/5xx with exponential backoff (e.g. 2
tries, 1s/4s); support `OPENROUTER_FALLBACK_MODEL` (comma-separated chain) tried
after retries exhaust; map remaining failures to friendly copy ("The writer is busy —
try again in a moment") while logging the raw provider error server-side. Keep
401/402 surfacing distinctly (key/billing problems must be visible to the operator).
Update `.env.example`.

**Acceptance:**
- With `OPENROUTER_BASE_URL` pointed at a mock that returns 429 twice then 200, a
  generation succeeds with no user-visible error.
- With a mock that always 429s on the primary model but 200s on the fallback,
  generation succeeds via fallback (assert via mock request log).
- When all attempts fail, the client toast shows friendly copy with no raw JSON; the
  server log contains the provider payload.

#### #12 · Wire gap nodes to their targeted Socratic pass — `P3`

**Context:** The spec (`docs/SPEC.md` §8, §10) promises every red gap node opens a
targeted Socratic micro-pass. Today in `components/AtlasApp.tsx` `onPrimaryAction`,
case "gap" only fires `showToast("Targeted Socratic pass on X")` — gap nodes spawned
from the diagnostic and Feynman are dead ends that can never be closed from the map.

**Fix:** for a selected gap node, the primary CTA generates (kind "socratic", scoped
to the gap's label with its parent as context) and opens a short SocraticView pass;
completing it removes the gap node from the graph (`removeNode` already exists in
`lib/curriculum.ts` and is used by the Crucible flow) and toasts "Gap closed".

**Acceptance:**
- Spawn a Feynman gap, click the gap node, click its primary CTA: a Socratic session
  opens scoped to the gap's sub-concept.
- Completing the session removes the gap node and its dashed edge from the map;
  states/positions/spawnedIds entries are cleaned up.
- Exiting mid-session leaves the gap node intact.

#### #13 · Stop granting "Retained ✓" at the moment of mastery — `P3`

**Context:** `phaseIndex("mastered")` in `lib/curriculum.ts` returns 6, so the
NodeDetail phase tracker shows "Retained ✓ REDO" the instant a Crucible passes —
before a single review has happened. This contradicts the product's own definition
(mastery = understood + retained + applied) and the spec's "only Crucible success +
retention grants green".

**Fix:** track per-node review history (at minimum: has any card for this node been
graded ≥ good at least once). Mastered-but-unreviewed nodes show Crucible ✓, Retained
as current/next ("→"), with the primary CTA "Review now". Retained shows ✓ only after
real review history exists. (Full FSRS integration is a separate task — this can key
off the in-session done map until then.)

**Acceptance:**
- Immediately after Mark Mastered, the node's phase tracker shows Retained as next,
  not done.
- After grading a card for that node "good" in Review, the tracker shows Retained ✓.

#### #14 · Make Shaky-state copy reflect how the node became shaky — `P3`

**Context:** `STATE_CONFIDENCE.shaky` in `lib/curriculum.ts` always reads "You feel
solid here, but your last application failed" — but nodes become Shaky three ways:
completing Connect (no application attempted yet), a hesitant diagnostic answer, and
an actual Crucible/Review failure. Two of the three make the copy false.

**Fix:** store a `shakyReason` per node when writing the state ("connect-complete" |
"diagnostic-hesitation" | "crucible-fail" | "review-miss") and select the confidence
line accordingly, e.g. connect-complete → "Understood and connected — now prove it
transfers in the Crucible."

**Acceptance:**
- After finishing Connect, the NodeDetail line does NOT claim a failed application;
  it points to the Crucible as the next step.
- After a Crucible first-rung failure or a Review "Again", the line correctly
  references the failure.
- After a hesitant diagnostic answer, the line references the diagnostic hesitation.

#### #15 · Validate Crucible "draws" against real map nodes — `P3`

**Context:** The Crucible sidebar claims "DRAWN FROM YOUR MAP — the problem
interleaves mastered nodes", but `content.draws` are free strings from the model.
Observed live: "Chess" (a learner interest, not a map node) displayed as a drawn
node.

**Fix:** in `lib/server/generate.ts` `validateCrucible`, accept only draws that
case-insensitively match the `masteredLabels` passed in the request (pass them into
the validator); drop non-matching entries and fail validation if fewer than 1 remains
(triggering the corrective retry). Alternatively, if the design wants interest
flavoring, relabel the section honestly — but default to validating.

**Acceptance:**
- Unit test: a payload with draws `["Chess", "Vectors"]` against masteredLabels
  `["Vectors"]` validates to draws `["Vectors"]`.
- Live Crucible generation shows only genuine map-node labels under "Drawn from your
  map".

#### #16 · Remove side effects from answerDiagnostic updater; add server-side DAG cycle check — `P3`

**Context (two related correctness risks):**
1) `components/AtlasApp.tsx` `answerDiagnostic` calls `setStates()` and mutates
   `pendingGapsRef` inside the `setAnswered(prev => ...)` updater. React may invoke
   updaters more than once (StrictMode, concurrent renders); duplicate pending gaps
   are only saved today by `attachGap`'s idempotence. Restructure so the updater is
   pure: compute effects from the current answered value outside the updater, or move
   to a reducer that returns all state and applies side effects in an event
   handler/effect.
2) `lib/server/generate.ts` `layoutGraph` tolerates cycles (Kahn leftovers get a
   final column) but `lib/curriculum.ts` `displayStates` does not — nodes in a
   prerequisite cycle can never become frontier, permanently locking that branch. Add
   an explicit cycle detection in `validateCurriculum` that fails validation
   (triggering the corrective retry) when edges contain a cycle.

**Acceptance:**
- With React StrictMode enabled in dev, answering a "shaky" diagnostic question
  queues exactly one pending gap and spawns exactly one gap node.
- Unit test: `validateCurriculum` throws on a payload whose edges contain a cycle
  (a→b, b→a) and accepts a valid DAG.
- `npm run typecheck` and build pass.

### Phase 0 · Stop the bleeding

#### #17 · Add auth + database persistence (Supabase) — `blocker`

**Context:** All app state — graph, StateMap mastery, adherence/streak, calibration
samples, generated-content caches — lives only in React state in
`components/AtlasApp.tsx`. A page refresh erases everything, which makes the
daily-spine/FSRS/streak premises of `docs/SPEC.md` impossible. There are no user
accounts.

**Work:** integrate Supabase — auth (email magic link is enough to start) via
`@supabase/ssr`; persist per-user, per-subject run state. Start coarse: one row per
(user, subject) holding graph JSON, states JSON, adherence JSON, calibration JSON,
and the generated-content cache keyed by (kind, nodeId); normalize later when FSRS
lands. Load on app start; write-through on state changes (debounced). RLS so users
only read/write their own rows.

**Acceptance:**
- Sign in, build a map, complete one full phase, hard-refresh: map, node states, gap
  nodes, streak, and calibration readings are all intact.
- Re-entering a phase whose content was generated pre-refresh does not re-bill a
  generation (cache persisted).
- A second account sees none of the first account's data (RLS verified).
- Signed-out users hit a sign-in screen, not the app.

#### #18 · Protect /api/generate — auth, quotas, input caps, spend ceiling — `blocker` · *blocked by #17*

**Context:** `app/api/generate/route.ts` is a public, unauthenticated endpoint that
spends OpenRouter credit on every call. There is no rate limiting, no input length
validation (a 100KB topic goes straight into the prompt), no per-user quota, and no
global spend cap. This is a direct token-spend abuse vector and the top security
issue found in testing.

**Work:** require an authenticated session (401 otherwise); cap input lengths
server-side (topic ≤ 200 chars, interests ≤ 200, nodeLabel ≤ 120, pool/nodes array
sizes bounded); per-user daily generation quota (e.g. 60 calls/day, 429 with friendly
copy when exceeded); global monthly spend ceiling tracked from OpenRouter usage
fields in responses, hard-stopping generation when hit; log every call with user id,
kind, latency, and token usage.

**Acceptance:**
- Unauthenticated POST → 401; over-length topic → 400 with clear message; user over
  daily quota → 429 with friendly client toast.
- Curl replay of the report's negative test suite (invalid JSON, missing fields,
  unknown kind) still returns the same 400/405 behavior.
- A generation-log table/dashboard shows per-user counts and token usage after a test
  run.

#### #19 · Add error monitoring and structured generation logs — `blocker`

**Context:** There is no error tracking or observability. During testing, a live
upstream 429 was only diagnosable via local server stdout; in production it would be
invisible. Generation cost/latency/validation-retry rates are unmeasured.

**Work:** add Sentry (client + server route instrumentation for Next 15 App Router);
structured server logs for every generation: kind, model, attempt count (validation
retries), latency ms, token usage, outcome (ok / validation-fail / upstream-error
status). Surface a simple ops view for error rate and p95 latency per kind.

**Acceptance:**
- A forced validation double-failure appears in Sentry with kind and model tags.
- A forced upstream 500 appears with the provider payload attached server-side (never
  sent to the client).
- Logs for one full spiral run show all 6+ generation calls with latency and token
  counts.

#### #20 · CI pipeline — typecheck, build, unit tests, Playwright smoke — `blocker`

**Context:** Zero automated tests and no CI exist. `AGENTS.md`'s only gate is a
manual `npm run build`. The validator/reducer logic in `lib/curriculum.ts` and
`lib/server/generate.ts` is pure and highly testable; the code already supports
`OPENROUTER_BASE_URL` override explicitly for test mocking.

**Work:** GitHub Actions workflow on PR + main: `npm run typecheck`, `npm run build`,
unit tests (Vitest) for `lib/curriculum.ts` reducers (socratic/feynman/connect/
crucible/retain transitions, displayStates/frontier derivation, markTodayMet
idempotence) and `lib/server/generate.ts` validators (including the bad payloads
captured in testing); one Playwright E2E smoke against `next start` with
`OPENROUTER_BASE_URL` pointed at a local mock server returning canned JSON: welcome →
build → diagnostic (all 3 effects) → map renders with frontier + gap node.

**Acceptance:**
- CI red on: type error, build failure, any unit test failure, or smoke failure;
  green on main as merged.
- Unit coverage includes at least: one test per reducer action type, validator
  accept + reject cases, cycle rejection (once #16 lands).
- Smoke run completes < 5 min with zero real OpenRouter calls.

### Phase 1 · Make the promises true

#### #21 · Implement real FSRS scheduling with persisted cards — `blocker` · *blocked by #17*

**Context:** The Retain phase claims FSRS but intervals are strings the LLM invents
per generation; the "Retention health" forecast panel is fabricated numbers; no card
exists after the session ends. Cards drafted in Connect (`connectCards` in
`lib/curriculum.ts`) are counted in a toast and discarded.

**Work:** adopt the `ts-fsrs` package; create a persisted cards table (user, node,
type, front/cloze/back, source phase, FSRS state: stability/difficulty/due/reps/
lapses). Card creation writes: Connect confirmed links + accepted mnemonics, Feynman
fix outcomes, and Retain-generated cards on first review of a node. Grading calls
FSRS to compute the next due date; the daily queue = cards actually due, budgeted to
the user's daily target in minutes; the forecast panel reads real counts (due now /
due this week / stable 30d+). Remove the invented fsrs interval strings from the
retain generation prompt or keep them only as display hints replaced by computed
intervals.

**Acceptance:**
- Grade a card "good": its due date advances per ts-fsrs and it does not reappear
  today; "again" reschedules it into today's queue.
- Cards confirmed in Connect appear in the next Review session without a retain
  generation inventing them.
- The forecast panel numbers match the card table exactly (assert in a unit test
  against a seeded table).
- Queue chip shows real minutes derived from due-card count, honest-queue style.

#### #22 · Make adherence day-aware and persistent — `blocker` · *blocked by #17*

**Context:** `freshAdherence()` in `lib/curriculum.ts` runs on every page load —
streak, freezes, metToday, and history reset each session. The forgiving-streak
mechanic (spec §13) cannot function without calendar awareness, and the streak shown
after any refresh is a lie.

**Work:** persist adherence per user (extends the persistence layer); compute day
rollover server-side in the user's timezone: on first activity of a new day, evaluate
yesterday (met → streak holds; unmet + freeze banked → consume freeze, mark history
"freeze"; unmet + no freeze → streak resets); history strip shows the real trailing
14 days; metToday derived from actual activity (queue cleared or node mastered)
recorded with timestamps; earn a freeze per N-day streak (pick N, e.g. 7, and
document it).

**Acceptance:**
- Meet the target, refresh: streak and flame unchanged.
- Simulated day advance without activity while holding a freeze: streak survives,
  history shows a freeze day, freezes decrement.
- Second consecutive missed day with no freeze: streak resets to 0.
- Unit tests cover the three rollover branches and timezone boundary (23:59 vs 00:01
  activity).

#### #23 · Capture the exam date and derive real pace math — `blocker`

**Context:** The spec's exam goal includes a date ("exam (with date)"), but
`components/onboarding/WelcomeScreen.tsx` never asks for one. `lib/curriculum.ts`
hardcodes `EXAM_DAYS = 24` and `NODE_MINUTES = 35`, so the left rail's "Final exam ·
24 days" countdown and "Behind pace" warning are fiction.

**Work:** add a date input to the Welcome screen when goal = exam (skippable; also
editable later — coordinates with #32); persist it; `paceStatus` takes `daysLeft`
computed from the real date; when no date is set, hide the countdown chip and show
pace as informational only. Revisit `NODE_MINUTES` against observed session lengths
once analytics exist (leave a constant for now, documented).

**Acceptance:**
- Choosing exam + a date 10 days out shows "Final exam · 10 days" and pace math using
  10 days.
- The countdown decrements across (simulated) days.
- Exam goal with no date: no fabricated countdown anywhere.
- Non-exam goals unchanged.

#### #24 · Cache generated content in the database, shared across sessions — `blocker` · *blocked by #17*

**Context:** Generated content (curriculum, per-node phase material) is cached only
in React state for the current run (`consumeCache` etc. in `AtlasApp.tsx`). Every new
session re-bills every generation (~6 LLM calls per node spiral, 15–60s each
observed). This is the main cost and latency lever.

**Work:** persist generated content keyed by (user, subject, kind, nodeId) — write on
successful generation, read before calling OpenRouter. Add a content-version field so
validator/prompt changes can invalidate stale entries. Evaluate a second-level shared
cache across users keyed by (topic-normalized, kind, nodeLabel) for common topics —
behind a flag, since interests personalize content (strip interests from shared-cache
entries or exclude personalized kinds).

**Acceptance:**
- Re-entering a phase in a new browser session makes zero OpenRouter calls (verify
  via generation logs).
- Bumping the content-version regenerates on next entry.
- Per-user cost per node spiral drops to ~0 generations on second and later visits
  (measured in the generation log).

### Phase 2 · Real tutoring (the moat)

#### #25 · Free-text Socratic with server-side answer judging — `core`

**Context:** Socratic replies today are pre-generated multiple choice
(`SocraticStep.replies` in `lib/curriculum.ts`) — the learner picks from a menu, so
the "contingent tutor" and anti-sycophancy (spec §7, called "the single most
important behavior in the product") are scripted theater. The scratchpad reaction is
likewise canned regardless of what's drawn/written.

**Work:** replace reply menus with free text (typed; voice later). New server
endpoint judges the learner's answer against the step's concept: classify
correct/near/wrong/lost and generate the contingent response (hint when near, catch
when wrong — named plainly, teach when lost), streaming the reply. Help-level dial
driven by the judged history. Scratchpad submits its text/strokes-as-text for the
same judging. Keep the generated step scaffolding (probes, hints, tells) as the
session skeleton. Use a stronger judge model than the content model (see #28).

**Acceptance:**
- Typing a planted misconception (e.g. "scalar multiplication rotates the vector")
  gets it named and corrected, never affirmed — verified across the eval set, not one
  anecdote.
- A near-miss answer receives a hint and a re-ask, not the full answer.
- "Just tell me" still works and is logged; repeated use still flags a prerequisite
  gap.
- Judging p95 latency < 4s streamed-start on the chosen model.

#### #26 · Real Feynman diffing of the learner's own explanation — `core` · *blocked by #25*

**Context:** Feynman "teach-back" today streams a pre-written transcript the learner
never wrote, and verdicts come from picking one of three canned replies. The Gap
Report is therefore chosen, not detected — the spec's core promise (§8: diff the
learner's actual explanation; gaps become map nodes) is simulated.

**Work:** the learner types (later: speaks, via an STT integration — separate
follow-up) their actual explanation per sub-point or freeform. Server diffs it
against the concept's expected sub-points: per sub-point verdict
good/skipped/confused with a quoted-from-their-words justification; naive-student
interjections generated in reaction to what they actually said. Gap Report renders
the real diff; unresolved gaps write back exactly as today (the `attachGap` path
already works). Fix micro-pass judges free-text answers (reuses the #25 judging
endpoint).

**Acceptance:**
- An explanation that genuinely omits a sub-point yields "skipped" for that sub-point
  with a justification referencing their text.
- An explanation containing a planted wrong claim yields "confused" on the right
  sub-point, quoted.
- A complete correct explanation yields an all-green report and no gap write-back.
- The written-back gap nodes still attach/resolve on the map as before.

#### #27 · Judged Crucible attempts + interleaved and boss rungs — `core` · *blocked by #25*

**Context:** The Crucible outcome is deterministic — `crucibleReducer` in
`lib/curriculum.ts` returns "partial" on rung 0 and "pass" on rung 1 regardless of
what the learner writes; the transfer diagnostic describes a pre-generated sample
attempt, not theirs. Mastery (the green state) is therefore claimable with any
non-empty text. The truest-signal-of-mastery premise (spec §10) requires real
grading. The ladder's "Interleaved mix" and "Boss" rungs are decorative.

**Work:** grade the learner's actual attempt server-side against the problem: produce
per-sub-concept transfer rows (good/red) grounded in their text, decide pass/partial
from the grading, and on failure name the actually-missing sub-concept for the gap
write-back (replacing the pre-generated gap spec when it differs). Confidence gate
re-asked on retries (today conf is silently null on rung 1, skipping the calibration
hook). Implement the interleaved rung (problem drawing on 2+ green nodes) once ≥3
nodes are green, and a boss challenge spanning a branch before the branch shows fully
green.

**Acceptance:**
- A correct rung-0 attempt passes on the first try (no forced failure); node goes
  Mastered.
- A wrong attempt fails with a diagnostic that quotes/references the actual error,
  and the written-back gap names the genuinely missing sub-concept.
- Empty/garbage input never reaches Mastered.
- With 3+ green nodes, the next Crucible offers an interleaved problem; a branch only
  renders fully green after its boss challenge passes.
- Calibration records a felt/real pair on every attempt including retries.

#### #28 · Model strategy + pedagogy eval suite in CI — `core`

**Context:** One cheap model (`deepseek/deepseek-chat`) currently does everything.
Judging answers demands more reliability than generating content, and the
anti-sycophancy behavior — the product's stated most-important behavior — is
currently unmeasured and unenforced.

**Work:** split model roles via env (`OPENROUTER_MODEL` for content,
`OPENROUTER_JUDGE_MODEL` for Socratic/Feynman/Crucible judging); build a small eval
harness (script + fixtures, runnable in CI nightly and on prompt changes):
planted-misconception answers that must be caught (never affirmed), near-miss answers
that must get hints not answers, correct answers that must pass, template-echo
generations that must be rejected by validators. Track pass rates per model/prompt
version; block prompt-change PRs that regress the misconception-catch rate.

**Acceptance:**
- `npm run eval` produces a per-behavior pass-rate report against fixtures using
  mocked and (optionally, flagged) live models.
- CI runs the mocked eval on every PR touching prompts/validators; a regression fails
  the check.
- Misconception-catch rate ≥ 95% on the fixture set with the chosen judge model
  before Phase 2 tasks are called done.

### Phase 3 · Launch polish

#### #29 · Vercel production deployment with previews and rollout — `launch`

**Context:** The app runs only locally. `AGENTS.md` targets Next.js and the repo has
no deployment configuration. The generate route already sets `maxDuration = 120`,
which Vercel Functions supports.

**Work:** create/link the Vercel project; set env (`OPENROUTER_API_KEY`, model vars,
Supabase keys) per environment via `vercel env`; preview deploys per PR wired to CI;
production on main behind a Rolling Release for launch; confirm the 120s generation
route works on Fluid Compute; custom domain + HTTPS.

**Acceptance:**
- Merging to main deploys production automatically after CI passes; PRs get preview
  URLs.
- A full spiral run completes on the production URL (no local server), including a
  >60s generation.
- Secrets absent from the repo and client bundle (verify with a bundle grep for key
  prefixes).
- Rollback verified once: promote previous deployment and confirm the app serves it.

#### #30 · PDF/syllabus upload and too-broad-topic scoping — `launch`

**Context:** The Welcome screen says "or drop a PDF / course outline · we ground the
map in a real source" but no file input exists — the copy is false. The spec's edge
cases (§2) — topic too broad → offer 2–3 scoped sub-maps; unreadable upload → fall
back to topic input — are unimplemented.

**Work:** file input + drag-drop on Welcome (PDF/text, size-capped); server-side text
extraction; feed extracted outline into the curriculum prompt as grounding;
broad-topic detection in the curriculum generation (model returns either a map or 2–3
scoped sub-map offers; add the response variant + validator + a chooser UI);
unreadable/oversized files fall back gracefully to the typed topic with honest copy.

**Acceptance:**
- Uploading a course-outline PDF produces a map whose nodes visibly track the
  outline's units.
- Typing "science" (or similarly broad) offers scoped sub-maps to pick from instead
  of a mush map.
- A corrupted/only-images PDF shows a friendly fallback and the typed-topic path
  still works.
- Upload size/type limits enforced server-side (rejecting a 50MB file with clear
  copy).

#### #31 · Right-moment reminders (email/push at the learner's usual time) — `launch` · *blocked by #22, #29*

**Context:** The streak popover promises "Nudge set for ~7:30pm — when you usually
show up, not midnight" (`reminderCopy` in `lib/curriculum.ts`), but no delivery
mechanism exists and `usualTime` is a hardcoded string that never learns.

**Work:** compute `usualTime` from the user's actual activity timestamps (rolling
median of session-start hour); a scheduled job (Vercel Cron) sends the reminder —
email first (e.g. Resend), web push later — only when `reminderOn`, only if today's
target is unmet, phrased in honest-queue minutes ("~8 min keeps the 5-day streak
alive"). Respect timezone; one reminder max per day; unsubscribe link that flips
`reminderOn`.

**Acceptance:**
- A user active at ~9pm for several (simulated) days gets their reminder near 9pm,
  not a fixed hour.
- No reminder when today's target is already met or reminders are off.
- Unsubscribe link works and is reflected in the flame popover toggle.
- Cron run is idempotent — double-firing the job sends at most one reminder per user
  per day.

#### #32 · Settings surface + data export — `launch` · *blocked by #17, #23*

**Context:** Spec §16 lists a Settings surface — goal & deadline, daily time target,
interests, notification timing, voice on/off, scaffolding aggressiveness, data
export — none of which exists. Onboarding choices are currently frozen for the life
of a run, so a learner can't fix a wrong daily target or update their exam date
(which #23 makes consequential).

**Work:** settings screen reachable from the top-bar avatar: edit goal/exam date,
daily target, interests, reminder time/toggle, scaffolding aggressiveness (maps to
Socratic help-level bias), voice toggle (forward-looking); data export downloads the
map (nodes/edges/states JSON) and cards (JSON + Anki-importable CSV).

**Acceptance:**
- Changing daily target immediately changes the honest-queue budget and pace math.
- Changing the exam date updates the countdown and pace warning.
- Export downloads open correctly: map JSON round-trips through `JSON.parse`; cards
  CSV imports into Anki with front/back intact.
- All settings persist across sessions (backed by the persistence layer).

#### #33 · Launch hardening — load test, security review, privacy, analytics — `launch` · *blocked by #18, #29*

**Context:** Pre-launch diligence not covered elsewhere. The generation path is the
load-sensitive surface (long-running LLM calls); the API surface changes
substantially in Phases 0–2; there is no privacy policy, data deletion, or product
analytics on the learning loop.

**Work:** load test the generation endpoints (concurrent long-running calls; verify
quota + queue behavior degrades gracefully, no unbounded spend under load); run a
security review of the branch and fix findings; privacy policy + account deletion
(cascade user data, honor within the app); product analytics on the loop with a
minimal event set: D1/D7 return, phase completion rates, gap-close rate,
diagnostic→first-session conversion, review-queue clear rate (privacy-respecting, no
content payloads in events).

**Acceptance:**
- Load test report: 50 concurrent generations produce zero 5xx from our layer, quota
  429s are friendly, and spend stays within the configured ceiling.
- Security review passes with no high/critical findings open.
- Account deletion removes all rows for the user (verified by direct DB query) and
  signs them out.
- The analytics dashboard answers "what % of learners who built a map returned the
  next day" from real events.

### Dependency graph

```
#17 auth+persistence ──▶ #18 protect API ──▶ #33 hardening ◀── #29 deploy
        │                                                        │
        ├──▶ #21 FSRS      ├──▶ #22 adherence ──▶ #31 reminders ◀┘
        ├──▶ #24 content cache
        └──▶ #32 settings ◀── #23 exam date

#25 socratic judging ──▶ #26 feynman diffing
        └──────────────▶ #27 judged crucible

Independent: #7–#16 (bug fixes), #19 monitoring, #20 CI, #23, #29, #30
```

