# Plan — shrink the codebase, gate the quality, make it agent-testable

Measured 2026-08-15 on `main` @ 9544fb1.

## Where we actually are

| Metric                                              | Now                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| Source LOC (`app` + `components` + `lib` + `tests`) | 37,129                                                                   |
| Top 4 files                                         | 13,321 LOC — **36% of the repo in 4 files**                              |
| `components/AtlasApp.tsx`                           | 5,084 LOC, one component, 118 `useCallback`, 44 `useRef`                 |
| `lib/curriculum.ts`                                 | 3,057 LOC                                                                |
| `lib/server/generate.ts`                            | 2,597 LOC                                                                |
| `components/session/ConsumeView.tsx`                | 2,583 LOC, 139 inline `style={{}}` objects                               |
| Inline `style={{}}` app-wide                        | ~800                                                                     |
| ESLint                                              | ~~not installed~~ → flat config, `npm run lint` required in CI           |
| Prettier / formatting gate                          | ~~none~~ → `format:check` required in CI                                 |
| `data-testid` in the app                            | **0**                                                                    |
| `aria-label` / `role`                               | 9 / 11 total                                                             |
| E2E tests                                           | none (Playwright is in `node_modules` but not in `package.json`)         |
| CI                                                  | typecheck + vitest + build. No lint, no coverage, no e2e, no size budget |
| `/api/generate`                                     | auth-gated, input-capped, logged — **no quota, no spend ceiling**        |

Two structural facts drive everything below:

1. **Size is concentrated, not spread.** Four files are the problem. A repo-wide
   sweep would be motion; four surgical splits are the work.
2. **Nothing can be browser-tested today**, by a human or an agent, because every
   screen past onboarding waits on a live OpenRouter call — seconds of latency,
   real money, non-deterministic output. Fixtures are the prerequisite for the
   entire testing story, not a nice-to-have.

---

## Phase 0 — Gates first (before any refactor)

**Status: landed** (2026-08-15). Six required checks on `main`; the numbers in
the table above are the pre-Phase-0 snapshot and are kept as the baseline.
`e2e` is the seventh and joins in Phase 1.

Gates land _before_ the refactor so the refactor is measured by them, and so the
size never grows back.

### 0.1 ESLint (the script is currently a lie)

`eslint` + `eslint-config-next` + `typescript-eslint`. Rules kept to what catches
real bugs — no style bikeshed (`next/core-web-vitals`, no-floating-promises,
no-unused-vars, exhaustive-deps as **error**). `npm run lint` in CI.

### 0.2 File-size budget — the gate that makes "reduce size" stick

`scripts/size-budget.mjs`, ~15 lines: fail if any file under `app/`,
`components/`, `lib/` exceeds the ceiling in `size-budget.json`. Seed the
ceilings at today's values, then **ratchet down** as each phase lands. CI fails
if a file grows past its recorded ceiling. This is the single most important
gate: it converts "we should keep it small" into a build failure.

### 0.3 Coverage floor on the logic layer

Vitest is already here — turn on `coverage: { provider: 'v8' }` with a threshold
on `lib/**` only (start at the current number, ratchet up). Components and routes
are covered by e2e, not by unit coverage theatre.

### 0.4 Formatting

Prettier + `--check` in CI. Zero-argument, ends all diff noise.

### 0.5 Branch protection

Make `lint`, `typecheck`, `test`, `size`, `e2e`, `build` **required status
checks** on `main`, with "require branches up to date". Without this the
workflow is advisory and the whole phase is decorative.

### 0.6 Cost/abuse gate on `/api/generate`

Not a CI gate — a production one, and the plan's only true risk item. Today any
signed-in account can drive unbounded OpenRouter spend. Add a per-user daily
generation quota read off the `generation_log` table that already exists
(no new table, no new dep) and a 429 through the existing `rate_limit` error
code, which is already wired end-to-end in `lib/errors.ts` and `errorCopy.ts`.

**Deliverable:** `.github/workflows/ci.yml` with 6 jobs, all required.

---

## Phase 1 — The agent-testability layer

Ordered before the refactor on purpose: these tests are the safety net that makes
Phase 2 safe to do at all.

### 1.1 Fixture mode — the keystone

`lib/server/job.ts` is already the single funnel where every kind's normalization,
cache key, and generation resolve. One branch there:

```
ATLAS_FIXTURES=1  →  resolve from tests/fixtures/<kind>.json, never call OpenRouter
```

~30 lines in one file. It gives every downstream test determinism, zero latency,
and zero spend. Fixtures are captured once from real generations, so they are
real-shaped, and they are validated by the existing validators on capture so they
can't drift from the renderer.

### 1.2 Seed route

`app/api/test/seed/route.ts`, refusing to exist unless `ATLAS_FIXTURES=1`. Accepts
a run snapshot (screen, graph, node states, phase) and writes it, so an agent can
land directly on "Crucible, node 7, two gaps open" instead of replaying onboarding
for the fortieth time. Turns a 90-second setup into a 200ms one.

### 1.3 Stable selectors

A `data-testid` convention — currently zero exist. Applied to **navigation
landmarks and interactive controls only**, not to every div:
`screen-<name>`, `node-<id>`, `phase-<name>`, `action-<verb>`. An agent that can
address controls by testid stops guessing at text that i18n will change under it.

Accessibility rides along here: 9 `aria-label`s and 11 `role`s across a whole app
is a real gap on its own terms, and it is also the other half of what makes a
page legible to an agent. Buttons get names, the canvas gets a role, the sheets
get `aria-modal`.

### 1.4 Playwright + `docs/AGENT-TESTING.md`

Add `@playwright/test` properly (it's already sitting in `node_modules`
undeclared), a config that boots `next dev` with `ATLAS_FIXTURES=1`, and
`npm run e2e`. Six specs to start — one per phase, plus onboarding.

`docs/AGENT-TESTING.md` is the map an agent reads before touching the app:
the screen graph, the testid vocabulary, seed recipes, what fixture mode does and
does not fake. Without it every agent session re-derives the state machine from
5,000 lines of `AtlasApp.tsx`.

The same server that Playwright drives is what a browser-driving agent (Playwright
MCP) drives — one harness, both consumers, no second setup.

---

## Phase 2 — Shrink the four files

Every step below is behaviour-preserving and lands behind the Phase 1 e2e suite.

### 2.1 `AtlasApp.tsx` — 5,084 → target ~800

The 118 `useCallback`s are the tell: everything is memoized by reflex, and the
memoization is most of the volume. Split by concern into `components/atlas/`:
`useRunSnapshot` (persistence + caches), `useCanvas` (pan/zoom/drag),
`useWarming` (the `lib/warm.ts` orchestration), `useDiagnostic`, `useSession`
(phase dispatch). `AtlasApp` becomes the shell that composes them.

Delete on the way through: `useCallback` on anything not in a dependency array or
a memoized child's props. Most of the 118 are pure ceremony.

### 2.2 `lib/server/generate.ts` — 2,597 → target ~1,000

Twelve kinds × (`validateX` + `generateX` + `xContext` + a shape const) written
out longhand. Twelve implementations of one shape is exactly when a table earns
its place: one `defineKind({ shape, rules, context, validate })` and each kind
becomes ~40 lines of data instead of ~200 lines of code. The prompts stay verbatim
— they are the product, and none of this touches them.

### 2.3 `ConsumeView.tsx` — 2,583 → target ~600

Extract the independent sub-surfaces it has grown: figure, prediction, the
lens/model sheet, ask-about-this, the read-aloud toolbar. Each is already
self-contained; they are just inlined.

### 2.4 `curriculum.ts` — 3,057, split not shrunk

Six session reducers + the replanning model + the shared vocabulary. Split into
`lib/curriculum/{types,replan,consume,socratic,feynman,connect,crucible,retain}.ts`
with a barrel so no import changes. **Honest note:** this one is a browsability
win, not a size win — the logic is load-bearing and mostly earns its lines.

### 2.5 Inline styles — ~800 objects

Not a rewrite. Two mechanical passes:
hoist repeated `style={{}}` literals to module-level consts (they are currently
reallocated on every render — a correctness-adjacent perf win as well as a size
one), and move anything that is genuinely static to a class in `globals.css`.
No CSS-in-JS dependency; `lib/theme.ts` stays the token source of truth.

---

## Phase 3 — Production readiness

- **Quota + spend ceiling** on generation (Phase 0.6 — listed there because it
  is the gate, but it is really a production item and the highest-risk one open).
- **`/api/health`** — one route, checks Supabase reachability. Vercel and any
  uptime check need a target.
- **Error budget visibility** — `lib/log.ts` already emits structured events;
  point them somewhere queryable rather than at stdout.
- **`README.md` + `AGENTS.md` reconciliation** — `AGENTS.md` is 16.6K and is the
  stated source of truth; it needs the fixture mode, testid vocabulary, and the
  new gates or the next agent works from a stale map.

---

## Sequencing

| Phase              | Why this order                                                               |
| ------------------ | ---------------------------------------------------------------------------- |
| 0 — Gates          | Measured before the refactor, so improvement is provable and irreversible    |
| 1 — Fixtures + e2e | The safety net; Phase 2 is reckless without it                               |
| 2 — The four files | Behaviour-preserving, verified by Phase 1, ratcheted by Phase 0.2            |
| 3 — Production     | Independent of the refactor; 0.6 can jump the queue if spend is a live worry |

Expected outcome: ~37k → ~26k LOC, with the four monoliths under a ratcheting
budget, six required CI checks, and an app an agent can drive deterministically
in under a second per step.

## Deliberately skipped

- **Bundle-size CI gate** — `next build` already prints the numbers; add a budget
  when a regression actually bites.
- **Component unit tests** — e2e on fixtures covers the same ground without
  mocking the world. Add them only where a component holds real logic.
- **Storybook / visual regression** — not until the design churns enough to need it.
- **A new state library** — the split hooks are the fix; Redux/Zustand would be
  moving the 5,084 lines, not deleting them.
