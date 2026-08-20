# AGENTS.md — Atlas iOS

The rules for `ios/`. The root `AGENTS.md` still governs everything about the
product (the phases, the mastery vocabulary, the generation model, the caching
rules) — this file only says how that is expressed in Swift. `ios/PLAN.md` is
the build order and the screen inventory.

## Stack

- Swift 6, SwiftUI, iOS 17+. Strict concurrency on.
- No third-party dependency. Not one. `URLSession` streams NDJSON, `Observation`
  holds state, `Codable` decodes payloads, `Canvas` draws the map. Anything a
  package would add here, the platform already ships.
- All source lives in the `AtlasKit` package; the Xcode target is an entry point.

## Commands

```bash
cd ios/AtlasKit
swift build        # must pass before pushing
swift test         # must pass before pushing — runs on the host, no simulator
```

Both run without Xcode, which is the point: they belong in CI next to the web
app's gates.

The Xcode project is generated, never committed — `Project.swift` is the only
description of the app target:

```bash
cd ios
make generate      # tuist generate, with the .env.local values Tuist needs
make run           # generate, build, install and launch on the simulator
make open          # generate and open the workspace in Xcode
```

`make build` and `make test` are the two `swift` commands above; `make clean`
drops everything generated.

`generate.sh` exists because Tuist forwards only `TUIST_`-prefixed variables
into a manifest, so it lifts `ATLAS_BASE_URL`, `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` out of the web app's `.env.local` rather than asking
for a second dotfile. They are baked into `Info.plist`; `App/Sources/AtlasApp.swift`
reads them back and builds the store, and that is all the app target contains —
every line of the app is in `AtlasKit`.

## The design is the source of truth

`Learning Platform Mobile.dc.html` in the Claude Design project. Match it through
`Theme.swift`, never by eyeballing.

- **Never hard-code a colour, a face, a duration or a gutter that has a token.**
  `Palette`, `Face`, `Motion`, `Metrics`. A new token is added to `Theme.swift`
  and to `lib/theme.ts` in the same change, or the two platforms have already
  drifted.
- Mastery colours come from `NodeState.color` — never invent a state or a colour
  for one.
- Phase colours (Consume green, Socratic/Feynman blue, Connect purple, Crisol
  red) are carried by the CTA's `tint` and the header kicker, nothing else.
- **The mobile design's own decisions, which are not negotiable per screen:**
  side rails become bottom sheets; every two-column desktop grid stacks; a screen
  has at most one `Dock`; the tab bar is Início · Mapa · Revisão · Perfil and
  Session is never a tab.

## Composition

- A screen composes `Components.swift` — `TopBar`, `Card`, `CTAButton`,
  `GhostButton`, `Dock`, `Chip`, `Kicker`, `SegmentBar`. It does not re-declare a
  padding, a radius or a border that one of those already carries. Something the
  design repeats on a third screen becomes a component there.
- No `ViewModifier` with one call site, no protocol with one conformer, no
  generic wrapper for a view used once.
- One screen per file, named for the screen. A screen file that passes ~250 lines
  is a screen that is doing state's job.

## State

- `AtlasStore` is the one owner of everything persisted — graph, mastery states,
  cached generations. A screen reads it from `@Environment` and writes back
  through it; it never keeps a second copy of a node's state.
- **`frontier` is derived, never stored.** Ask `store.display`, which runs
  `displayStates`. Nothing writes `.frontier` into a `StateMap` and nothing
  stores a locked flag.
- Renderable state is `@State`/`@Observable`. Gesture, drag and timer state that
  must not trigger a redraw lives in a plain reference held by `@State`.
- `@MainActor` on anything that touches a view. `AtlasAPI` is an actor and stays
  off the main one.

## Networking

- **`AtlasAPI` is the only place in the app that makes an HTTP request.** A new
  content kind is a method there, never a `URLSession` call in a view.
- Streamed kinds render frames as they land. A frame with `partial: true` is a
  redraw: show it, never assemble it, never treat it as the answer — a complete
  frame for the same slot always follows. A frame named `__error` means the
  stream died after committing to a 200: keep what landed and offer a retry.
- Never derive "is this the last item?" from a streamed array's length; read the
  explicit total the payload carries.
- Errors surface as `AtlasError` with a `code`. The screen says something true
  about the code in the learner's language — the `message` is for logs and never
  appears on screen.
- The client never holds the OpenRouter key, never talks to a model directly, and
  never re-implements a prompt. If a screen needs content, some kind on
  `/api/generate` produces it.

## Touch, safety, accessibility

- Nothing tappable is under `Metrics.tap` (44pt). The design already draws every
  control at 44–58pt; shrinking one to fit is a layout bug, not a trade-off.
- Docks sit above the home indicator, top bars below the notch: respect the safe
  area, never paint under it with content.
- Every icon-only button has a label. Dynamic Type is honoured — the type scale
  is relative, and a screen that breaks at the largest size is not done.
- Every free-text answer has a mic beside it. Voice follows the language setting,
  never a second choice.

## Copy

The interface is Portuguese and English, same as the web app. Write copy as
literal `Text("…")` at the call site and let the String Catalog carry the second
language — no hand-rolled lookup table, no key constants. Never ship a string
built by concatenation.

## Verifying a change

`swift build` and `swift test` pass, then run it: the iOS simulator against
`ATLAS_FIXTURES=1 npm run dev` on the host, and click the real flow through to
the screen you changed. A screenshot of the screen next to its artboard is what
"matches the design" means.
