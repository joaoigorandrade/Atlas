# Atlas

A concept-map learning platform for the web and iOS. Atlas turns a subject into a prerequisite graph, guides practice on each concept, and brings it back through spaced review. Learning sessions update the same map rather than living in a separate course checklist.

The web app is also the backend for the native app. Both use the same generation contracts, account data, learning plans, and review scheduler.

## What you can do

- **Build a learning map:** choose an exam, project, mastery, or Pareto goal; add interests, a daily target, and an optional exam date. An optional adaptive placement diagnostic targets five questions and can end early.
- **Manage multiple subjects:** return to saved maps from the library, inspect prerequisites and progress, and continue a concept's learning plan.
- **Practice in different ways:** read explanations, distinguish examples, reason through mechanisms, teach back, execute procedures, solve transfer problems, and retrieve from memory.
- **Repair gaps:** detected missing concepts can become attached nodes that feed back into the learning graph.
- **Review with FSRS:** grade cards Again, Hard, Good, or Easy; the scheduler updates their next due dates. Daily targets, streaks, and calibration views connect practice to adherence and confidence.
- **Use English or Brazilian Portuguese:** both clients contain localized interfaces and language-aware generation.
- **Read and answer aloud:** optional Speechify read-aloud and platform speech recognition support voice interaction. The web reader also supports timestamp-based highlighting.
- **Bring material and export progress:** the web app extracts text from PDF, TXT, and Markdown files. Map and card exports are available; export formats differ between clients and are not a cross-client import protocol.

The web map supports pan, zoom, dragging, search, and prerequisite highlighting. The native app uses its own SwiftUI navigation and map presentation; the clients share the learning model, not identical layouts or every peripheral feature.

## How learning works

### Twelve phases, selected by concept kind

The phase catalogue lives in [`lib/curriculum/phases.ts`](lib/curriculum/phases.ts). A node receives a persisted plan when its map is built.

| Phase        | Purpose                                                            |
| ------------ | ------------------------------------------------------------------ |
| Consume      | Read an explanation with examples and checks.                      |
| Discriminate | Distinguish valid instances from near-misses.                      |
| Socratic     | Explain reasoning under questioning.                               |
| Predict      | Commit to an outcome and confidence before seeing the answer.      |
| Trace        | Follow a mechanism or process step by step.                        |
| Feynman      | Teach the concept back in your own words.                          |
| Perform      | Execute a procedure on a concrete case.                            |
| Drill        | Repeat focused practice for fluency.                               |
| Connect      | Elaborate relationships and build memory supports.                 |
| Crucible     | Apply learning in a novel context.                                 |
| Recall       | Retrieve without the source explanation.                           |
| Retained     | Track successful spaced review; the internal phase ID is `retain`. |

Not every node uses all twelve phases:

| Node kind | Default plan                                                                         |
| --------- | ------------------------------------------------------------------------------------ |
| Fact      | Consume → Discriminate → Drill → Connect → Recall → Retained                         |
| Concept   | Consume → Discriminate → Socratic → Feynman → Connect → Crucible → Recall → Retained |
| Procedure | Consume → Trace → Feynman → Perform → Drill → Connect → Crucible → Retained          |
| Principle | Consume → Socratic → Predict → Trace → Feynman → Connect → Crucible → Retained       |

Older maps can retain their earlier six-phase plans. Updating the catalogue does not automatically rewrite existing plans.

### Progress is not the same as retention

| Map state or marker | Current meaning                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Unknown             | No learning progress recorded.                                                                   |
| Frontier            | An unknown, non-gap node whose prerequisites are met; derived rather than stored.                |
| Learning            | A plan has started but its completion gates are not all satisfied.                               |
| Shaky               | A node carries a shaky reason, including some intermediate completion states or failed practice. |
| Mastered            | The plan's non-retention gates are complete and no shaky reason remains.                         |
| Gap                 | A detected missing concept attached to another node, not a normal frontier entry.                |

In the current prerequisite rules, both Shaky and Mastered satisfy a prerequisite. Retained is tracked separately through successful card review, not a requirement for the Mastered state. Placement and “already know” actions can also mark plans complete, so map color should not be interpreted as independent proof of long-term mastery.

## Run the web app

Use Node.js 22 and npm, matching the repository's CI environment.

```bash
git clone https://github.com/joaoigorandrade/Atlas.git
cd Atlas
npm ci
```

### Try it without live services

Fixture mode replaces model generation and server-side account persistence with deterministic fixtures and an in-memory store. Supply placeholder Supabase values because the browser client still needs to initialize:

```bash
SUPABASE_URL=https://placeholder.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder \
ATLAS_FIXTURES=1 npm run dev
```

Open `http://localhost:3000`. This mode makes no live model calls, does not exercise real authentication or database persistence, and loses its in-memory data when the server restarts. Never enable `ATLAS_FIXTURES` in production.

### Use real accounts and generation

```bash
cp .env.example .env.local
```

Configure these values in `.env.local`:

| Variable                   | Role                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`       | Server-side AI generation and judging.                                                                                        |
| `SUPABASE_URL`             | Supabase project URL.                                                                                                         |
| `SUPABASE_PUBLISHABLE_KEY` | Public client key; access is constrained by authentication and row-level security.                                            |
| `SUPABASE_SECRET_KEY`      | Server-only access for shared caches, administrative account deletion, and reminders. Configure it for a complete deployment. |

Then prepare the backend:

1. Apply the SQL files in [`supabase/migrations/`](supabase/migrations/) in filename order to the intended Supabase project. Review and back up an existing deployment first: the history includes normalization, backfills, and removal of legacy `run_states`.
2. Enable email/password authentication and configure the allowed web redirect URLs.
3. Configure confirmation emails for the [`/auth/confirm` callback](app/auth/confirm/route.ts), which expects `token_hash` and `type`. Do not assume a callback accepting only an authorization `code`.
4. Start the app with `npm run dev`.

Authentication currently uses email/password signup and login with email confirmation, not passwordless magic-link login. Some older comments elsewhere in the repository still describe the previous auth and storage designs.

For a production server:

```bash
npm run build
npm start
```

Set deployment environment variables before building. `next.config.ts` exposes the Supabase URL and publishable key, plus public feature flags, to the browser bundle; changes require a restart or rebuild as appropriate. Never expose the OpenRouter, Supabase secret, Speechify, or Resend keys in client code.

### Optional services and controls

| Variables                                                     | Purpose                                                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_MODEL`                                            | Content model; defaults to `deepseek/deepseek-chat`.                                                                  |
| `OPENROUTER_JUDGE_MODEL`                                      | Separate judging model; otherwise uses the content model.                                                             |
| `OPENROUTER_FALLBACK_MODEL`                                   | Optional comma-separated fallback model chain.                                                                        |
| `OPENROUTER_BASE_URL`, `OPENROUTER_TIMEOUT_MS`                | Provider endpoint and request timeout overrides.                                                                      |
| `CURRICULUM_WARM_NODES`                                       | Server-side content warm-up depth after map creation; `0` disables it. The implementation currently defaults to `12`. |
| `CONTENT_CACHE_VERSION`                                       | Namespace for generated-content cache invalidation.                                                                   |
| `CONTENT_CACHE_TTL_DAYS`                                      | Cold-cache retention used by cleanup; defaults to `90`.                                                               |
| `SPEECHIFY_API_KEY`                                           | Enables read-aloud; without it, there is no browser speech-synthesis fallback.                                        |
| `SPEECHIFY_VOICE_ID`, `SPEECHIFY_MODEL`, `SPEECHIFY_BASE_URL` | Speech provider overrides.                                                                                            |
| `SPEECH_CACHE_VERSION`                                        | Separate speech cache namespace.                                                                                      |
| `CRON_SECRET`, `RESEND_API_KEY`, `REMINDER_FROM`, `APP_URL`   | Authorized reminder execution, email delivery, sender, and destination URL.                                           |

Use [`.env.example`](.env.example) as the configuration template, but consult the implementation for defaults: some template comments reflect older behavior.

## Run the iOS app

The native client requires macOS, Xcode with Swift 6.2 and an iOS 26 SDK, and Tuist. The Swift package targets iOS 26 or later and depends on the author's NavigationPackage and NetworkingPackage.

From the repository root:

```bash
cp ios/AtlasKit/Sources/AtlasKit/Data/Secrets.example.swift.txt \
   ios/AtlasKit/Sources/AtlasKit/Data/Secrets.swift
```

Fill in the Supabase URL and publishable key in `Secrets.swift`. The file is ignored by Git; do not put a Supabase secret key or AI provider key in it. Native authentication talks directly to Supabase, while application data and AI requests go through the Atlas backend.

Allow `atlas://auth/confirm` in the Supabase redirect configuration for native email confirmation. Use the same Supabase project as the backend.

Generate the workspace and open Xcode:

```bash
cd ios
make open
```

The generated workspace and project are not committed. To point a simulator build at a local web server, set the Tuist-prefixed variable when generating:

```bash
TUIST_ATLAS_BASE_URL=http://localhost:3000 make open
```

Without an override, [`Project.swift`](ios/Project.swift) uses its configured deployed backend. A physical device needs a reachable backend URL; its `localhost` is not your Mac.

Useful native commands, run from `ios/`:

```bash
make generate       # Generate without opening Xcode
make run            # Build, install, and launch on a simulator
make build          # Build AtlasKit for iOS Simulator
make test           # Run tests on a booted simulator
make strings        # Check localization coverage
make strings-update # Update catalogue keys before translating
```

Boot an iOS simulator before running `make test` or the default `make run`. Native build, test, and localization requirements are documented in [`ios/AGENTS.md`](ios/AGENTS.md); root web CI does not replace these checks.

## Architecture

### Shared backend, platform-specific clients

- **Web:** Next.js 15 App Router, React 19, strict TypeScript, and token-based styling without a UI component framework.
- **iOS:** SwiftUI with observable view models, Keychain-backed sessions, SwiftData local content storage, and streamed networking.
- **Identity and persistence:** Supabase Auth and Postgres with row-level security. Web requests use cookies; native requests use bearer tokens.
- **Generation:** server-side OpenRouter calls with input normalization, structured-output validation, and NDJSON streaming for progressive rendering.
- **Scheduling:** `ts-fsrs` in [`lib/fsrs.ts`](lib/fsrs.ts). The web uses the TypeScript scheduler; native review reaches it through the API.

Both clients persist application data through `/api/v1`. The normalized model separates profiles, topics, nodes, prerequisite edges, cards, node content, and generation logs rather than uploading an entire run document on each change.

### Content and caching

Generated content has several distinct lifetimes:

1. A shared server `content_cache` deduplicates cacheable jobs by normalized inputs.
2. Per-topic `node_content` records preserve the learner's generated material, including payloads that outlive shared-cache expiration or version changes.
3. Browser CacheStorage and native SwiftData mirror content locally for reuse.
4. Warm-up and in-flight deduplication reduce waiting for upcoming phases.

Only complete, validated generation results are durable content. Judging, diagnostic-question generation, and passage follow-ups are not shared-cache jobs. Speech audio has its own cache.

Local caching is not a promise of fully offline operation: new generation, authentication, and server persistence still require connectivity. See [`docs/CONTENT-STORAGE.md`](docs/CONTENT-STORAGE.md) for the storage design.

### API overview

Application routes require authentication unless noted otherwise. Route implementations are the authoritative request and response contracts.

| Route                                 | Responsibility                                                        |
| ------------------------------------- | --------------------------------------------------------------------- |
| `POST /api/generate`                  | Generate phase content, maps, diagnostic questions, and judgments.    |
| `POST /api/content`                   | Batch lookup of cached content without generating it.                 |
| `POST /api/extract`                   | Extract source text from supported uploads.                           |
| `POST /api/speech`                    | Synthesize or retrieve cached read-aloud audio.                       |
| `GET /api/v1/bootstrap`               | Load the profile and saved topic state without bulk content payloads. |
| `GET/PATCH /api/v1/profile`           | Read or update learner preferences.                                   |
| `POST /api/v1/topics`                 | Create a topic.                                                       |
| `GET/PATCH/DELETE /api/v1/topics/:id` | Read, update, or delete an owned topic.                               |
| `PATCH /api/v1/topics/:id/nodes`      | Apply node changes.                                                   |
| `PUT/DELETE /api/v1/topics/:id/cards` | Persist or remove cards.                                              |
| `GET /api/v1/topics/:id/content`      | Retrieve a topic's saved content.                                     |
| `GET/POST /api/v1/topics/:id/review`  | Get the review queue or submit a grade.                               |
| `POST /api/account/delete`            | Delete account data and attempt administrative auth-user deletion.    |
| `GET /api/cron/reminders`             | Cron-secret-protected reminder sending and cache cleanup.             |
| `GET /api/health`                     | Public Supabase dependency probe against the normalized topics table. |
| `/api/test/seed`                      | Fixture-only GET, POST, and DELETE helpers for test state.            |

## Tests and quality checks

Run web checks from the repository root:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run size
npm run build
```

`npm run format` rewrites formatting throughout the repository. `npm run size` enforces the per-file line budgets in `size-budget.json`; coverage also has enforced thresholds.

For browser tests:

```bash
npx playwright install --with-deps chromium
npm run e2e
# Or: npm run e2e:ui
```

Playwright starts its own fixture-mode dev server, uses one worker because the fixture store is shared, and defaults to port `3941`. Set `ATLAS_E2E_PORT` to override it. [`docs/AGENT-TESTING.md`](docs/AGENT-TESTING.md) documents seed helpers and browser selectors; some examples still use legacy six-phase maps.

`npm run eval` runs live-model judge evaluations with `RUN_EVAL=1`. It requires real provider credentials, incurs provider usage, and is intentionally excluded from normal CI.

The [web CI workflow](.github/workflows/ci.yml) runs lint, format, type, coverage, size, build, and fixture E2E checks on Node.js 22. Passing fixture tests does not validate deployed Supabase configuration, live model quality, email delivery, or speech-provider availability.

## Operational notes and current limitations

- **Health probe:** `/api/health` checks a Supabase query, not OpenRouter, email, or speech availability. An empty result under row-level security is healthy; a failed query returns `503`.
- **Provider usage:** generation is logged, but there is no enforced daily quota or monthly spending cap in the application. Warm-up can trigger additional model requests; set provider-side budgets and choose warm-up depth deliberately.
- **Reminders:** `vercel.json` schedules the cron at `18:00 UTC` daily, not at each learner's local preferred time. Actual email delivery needs the cron secret, Supabase secret key, Resend configuration, and a suitable sender.
- **Uploads:** extraction accepts files up to 10 MiB and uses at most the first 20,000 extracted characters. It does not perform OCR on scanned PDFs.
- **Account deletion:** inspect the endpoint result. If the server admin credential is absent or auth deletion fails, data deletion can complete while `authDeleted` is false.
- **Documentation drift:** older plans, audit reports, and comments can describe previous implementations. Prefer current route contracts, migrations, and phase definitions when extending the app.

## Repository map

```text
app/                    Web pages, auth callback, and API route handlers
components/
  atlas/                Web application state and orchestration hooks
  onboarding/           Goal setup, map building, and placement
  map/                  Interactive web concept map
  session/              Learning-phase surfaces
lib/
  curriculum/           Graphs, phase plans, progress, and calibration
  server/generate/      Per-kind AI generators and response validation
  server/store/         Normalized server persistence
  supabase/             Browser/server auth clients and middleware support
  fsrs.ts               Shared review scheduling implementation
  persistence.ts        Web persistence API client
  theme.ts              Web design tokens
ios/
  App/                  App entry point, resources, and localization
  AtlasKit/             Native domain, networking, storage, features, and tests
  Project.swift         Tuist app manifest
supabase/migrations/    Ordered database schema and data migrations
tests/                  Unit, integration, live-model, and browser tests
scripts/                Repository quality tooling
docs/                   Testing/storage guides, plans, and historical audits
```

## Contributing

Read [`AGENTS.md`](AGENTS.md) before changing the repository and [`ios/AGENTS.md`](ios/AGENTS.md) before native work. [`CLAUDE.md`](CLAUDE.md) points Claude-based agents to the same rules.

Keep English and Brazilian Portuguese copy in sync, preserve persisted phase-plan compatibility, and test state changes as well as rendered content. The [quality plan](docs/PLAN-QUALITY.md) provides additional context, while the implementation and automated checks define the current behavior.
