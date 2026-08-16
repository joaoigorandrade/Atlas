# Driving Atlas as an agent

Read this before touching the app in a browser. It is the map of what is on
screen, how to address it, and how to land on a given state without replaying
onboarding. Everything here is Phase 1 of `docs/PLAN-QUALITY.md`.

## The one thing that makes this possible: fixture mode

```bash
ATLAS_FIXTURES=1 npm run dev
```

Every generation — the map, the reading pass, every judge call — is answered
from `lib/server/fixtures.ts` instead of OpenRouter. Deterministic, instant,
free. Without it, every screen past onboarding waits on a live model call.

The same flag is what `playwright.config.ts` boots the app with, so the server
Playwright drives and the server a browser-driving agent (Playwright MCP)
should drive are the same server.

### What fixture mode fakes

| Faked                                  | How                                                             |
| -------------------------------------- | --------------------------------------------------------------- |
| Every model call                       | `fixturePayload()` in `lib/server/fixtures.ts`, per kind        |
| Supabase auth / quota / generation log | `fixtureSupabase()` — a signed-in stand-in learner, empty quota |
| The login redirect                     | `lib/supabase/middleware.ts` short-circuits                     |
| `run_states` persistence               | An in-memory map behind `/api/test/seed` (`lib/persistence.ts`) |

### What it does **not** fake

- **The request contract.** `resolveJob` still normalizes, still caps every
  input, still throws `BadRequest` — the fixture is swapped in after all of it.
- **The wire format.** A fixture job streams the same NDJSON frames a real one
  does, through `payloadToFrames`.
- **The reducers, the renderers, the persistence shape.** Those are the app.
- **Content quality.** Fixture prose is placeholder prose. A spec asserting on
  the _wording_ of generated content is asserting on the fixture, not the app.

Fixture payloads are typed as the interfaces the renderers consume, so `npm run
typecheck` is what keeps them in step with the app. They are written against the
request that asked for them — node ids and labels come from the job — because
the reducers reject content naming a concept the run has never heard of.

## Landing on a state: the seed route

`POST /api/test/seed` (fixture mode only; 404 otherwise):

```jsonc
{ "subject": "Linear algebra", "snapshot": {/* a RunSnapshot */}, "caches": {} }
```

- `GET /api/test/seed` → every run, newest first. `?subject=` for one.
- `DELETE /api/test/seed` → wipe the store. `?subject=` for one.

**Do not hand-write a snapshot.** Drive onboarding once, read the snapshot the
app itself persisted, then re-seed it with the states you want — that is exactly
what `tests/e2e/helpers.ts` does, and it can never drift from `RunSnapshot`:

```ts
const snapshot = await openRun(page, { foundations: "mastered" });
await openPhase(page, "core-rule", 4); // 4 = Crucible
```

## The testid vocabulary

Applied to navigation landmarks and interactive controls only — not to every
div. Prefer these over text: the app is bilingual and the copy moves.

| Selector                                                                         | What it addresses                                                                                                                            |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `[data-testid=app]`                                                              | The app root. **Read the state off it, don't guess:**                                                                                        |
| → `data-screen`                                                                  | `welcome` · `building` · `diagnostic` · `map` · `dashboard` · `profile`                                                                      |
| → `data-sheet`                                                                   | the open full-screen surface, or `none`                                                                                                      |
| → `data-hydrated`                                                                | `1` once the persisted run has been applied                                                                                                  |
| `screen-welcome` · `screen-building` · `screen-diagnostic`                       | onboarding surfaces                                                                                                                          |
| `screen-dashboard` · `screen-profile` · `screen-settings` · `screen-calibration` | the rest                                                                                                                                     |
| `map-canvas`                                                                     | the map itself (`role="application"`)                                                                                                        |
| `node-<id>`                                                                      | one concept chip. `data-state` carries its display state                                                                                     |
| `panel-node`                                                                     | the node detail rail. `data-node` carries the selected id                                                                                    |
| `phase-<name>`                                                                   | an open phase surface: `consume` `socratic` `feynman` `connect` `crucible` `retain`                                                          |
| `action-<verb>`                                                                  | a control: `build` `take-placement` `answer-<i>` `next` `start` `primary` `phase-<i>` `skip-confirm` `skip-cancel` `submit` `confidence-<i>` |
| `field-<name>`                                                                   | an input: `topic` `interests` `answer`                                                                                                       |

The screen graph, in the order a run walks it:

```
welcome ──build──▶ building ──▶ diagnostic ──start──▶ map
                                                       │
                        node → panel-node → action-phase-<i>
                                                       ▼
              consume → socratic → feynman → connect → crucible → retain
```

Selecting a node: press **Enter** on `node-<id>`. Clicking works for a human,
but a chip lives inside a panned, zoomed canvas and can sit under the plan rail
— the keyboard path is both accessible and position-independent.

## Running the suite

```bash
npm run e2e          # headless, boots its own dev server in fixture mode
npm run e2e:ui       # the Playwright UI
npx playwright test tests/e2e/crucible.spec.ts
```

One worker, on purpose: the seed store is one in-memory map in one dev server.
The first spec to run drives onboarding for real and parks the snapshot in
`test-results/run-snapshot.json`; the rest re-seed from it, which is why the
whole suite takes ~40s rather than ~2 minutes.

## Adding a spec

1. `openRun(page, states?)` — a map with a run on it.
2. `openPhase(page, nodeId, phaseIndex)` — 0 Consume · 1 Socratic · 2 Feynman ·
   3 Connect · 4 Crucible · 5 Retained. It clears the skip nudge for you.
3. Assert on structure and behaviour. If a control has no testid, add one in the
   same change rather than reaching for a CSS path or a copy string.
