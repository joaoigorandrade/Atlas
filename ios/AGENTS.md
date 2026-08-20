# AGENTS.md — Atlas iOS

The rules for `ios/`. The root `AGENTS.md` still governs everything about the
product (the phases, the mastery vocabulary, the generation model, the caching
rules) — this file only says how that is expressed in Swift. `ios/PLAN.md` is
the build order and the screen inventory.

## Stack

- Swift 6, SwiftUI, iOS 26+. Strict concurrency on.
- **Two dependencies, both first-party.** `Navigation` (routes, navigators, the
  tab shell) and `Networking` (typed requests, the `URLSession` client). Both
  declare `.iOS(.v26)` and nothing else, which is what sets the floor above —
  and what took the host-macOS build away.
- Nothing else. `Observation` holds state, `Codable` decodes payloads, `Canvas`
  draws the map, `Speech`/`AVFoundation` carry voice. Anything else a package
  would add here, the platform already ships.
- All source lives in the `AtlasKit` package; the Xcode target is an entry point.

## Commands

```bash
cd ios
make build         # must pass before pushing — xcodebuild, generic simulator
make test          # must pass before pushing — needs a booted simulator
```

Neither needs the Xcode *project*, but both need Xcode's toolchain: `swift build`
and `swift test` on the host stopped resolving the moment the two iOS-only
packages came in. `make test` runs against whichever simulator is booted, so
boot one (or run `make run`) first.

The Xcode project is generated, never committed — `Project.swift` is the only
description of the app target:

```bash
cd ios
make generate      # tuist generate, with the .env.local values Tuist needs
make run           # generate, build, install and launch on the simulator
make open          # generate and open the workspace in Xcode
```

`make clean` drops everything generated, the resolved package checkouts
included.

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

## Layout

```
Sources/AtlasKit/
  App/        the shell — RootView, AtlasTab (the four tabs), AtlasRoute
              (everything that is pushed or presented), LaunchViewModel
  Core/       Theme, Components, Speech, Support (ErrorCopy and two one-liners)
  Domain/     the vocabulary and the pure functions — Concept, Diagnostic,
              Calibration, Retain, PhaseContent. No I/O, no SwiftUI state.
  Data/       AtlasAPI + AtlasEndpoint + NDJSONStream, AtlasAuth + SessionStore,
              AtlasStore + Defaults, Fixtures
  Features/   one folder per surface, each holding its view(s) and view model:
              Auth, Onboarding, Home, Map, Review, Profile,
              Session/{Consume,Socratic,Feynman,Connect,Crucible}
```

## Composition

- A screen composes `Components.swift` — `TopBar`, `Card`, `CTAButton`,
  `GhostButton`, `Dock`, `Chip`, `Kicker`, `SegmentBar`, `BackButton`, `Avatar`.
  It does not re-declare a padding, a radius or a border that one of those
  already carries. Something the design repeats on a third screen becomes a
  component there.
- No `ViewModifier` with one call site, no protocol with one conformer, no
  generic wrapper for a view used once.
- One screen per file, named for the screen, beside the view model it renders.

## MVVM

- **Every screen has a view model**, `@Observable @MainActor final class
  <Screen>ViewModel`, in the same folder as its view. It owns the screen's own
  state, the async work, and every derived string or colour the screen shows.
- **A view holds no `@State` a view model could hold** and computes nothing in
  `body` that a stored property could carry. Segment rails, greetings, queue
  minutes and error sentences are prepared in the model, not mapped per redraw.
- **A view model is built once**, in `.task`, never in `body` or a `@State`
  default that re-runs on every parent update — the phase models mark the node
  Learning and start generations on the way in.
- A view model writes to `AtlasStore` and reads `AtlasAPI`; it never reaches for
  a navigator. Navigation is the view's job.

## Navigation

- `AtlasTab` is the tab bar (Início · Mapa · Revisão · Perfil) — `NavigationTabView`
  renders it and gives each tab its own `Navigator`, so a stack survives a trip
  through another tab. Session is never a tab.
- `AtlasRoute` is every other destination. A screen asks the navigator
  (`@EnvironmentObject var navigator: AtlasNavigator`) for one — `navigate(to:)`
  to push, `openSheet(_:)` for the node drawer, `pop()`/`popToRoot()` to leave.
  No `NavigationLink`, no per-screen `sheet(item:)`, no `@Environment(\.dismiss)`.
- A pushed session hides the tab bar; it does not cover the screen. `navigate`
  dismisses the drawer on the way, which is why there is no `onDismiss` dance.

## State

- `AtlasStore` is the one owner of everything persisted — graph, mastery states,
  cached generations. A view model reads it and writes back through it; nothing
  keeps a second copy of a node's state.
- **`frontier` is derived, never stored.** Ask `store.display`, which runs
  `displayStates`. Nothing writes `.frontier` into a `StateMap` and nothing
  stores a locked flag.
- Renderable state is `@State`/`@Observable`. Gesture, drag and timer state that
  must not trigger a redraw lives in a plain reference held by `@State`.
- `@MainActor` on anything that touches a view. `AtlasAPI` is an actor and stays
  off the main one.

## Networking

- **`AtlasAPI` is the only place in the app that makes an HTTP request.** A new
  content kind is a method there, never a `URLSession` call in a view or a view
  model.
- Requests are `HTTPRequestData` values built in `AtlasEndpoint` — a path, a
  method, headers and a body, nothing else. There is no request type per call.
- Unary requests run through `Networking`'s `URLSessionNetworkClient`, with
  `successStatusCodes: 0..<600` on purpose: a 4xx body carries the `code` a
  screen speaks and the header carries the request id a log needs, and
  `NetworkError.httpError` drops both. `AtlasAPI.send` is where a status becomes
  an `AtlasError`.
- Streamed kinds go through `NDJSONStream`, which builds the same request value
  and reads `URLSession.bytes` — the package client buffers whole responses,
  which is exactly wrong for a screen that should paint on its first frame.
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

`make build` and `make test` pass, then run it: the iOS simulator against
`ATLAS_FIXTURES=1 npm run dev` on the host, and click the real flow through to
the screen you changed. A screenshot of the screen next to its artboard is what
"matches the design" means.
