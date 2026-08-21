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
make strings       # must pass before pushing — every line of copy in both languages
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

`make strings` builds AtlasKit with `SWIFT_EMIT_LOC_STRINGS=YES` and holds the
keys swiftc extracted against `App/Resources/Localizable.xcstrings` — see
*Copy*. `make strings-update` folds new keys in so only the English is left to
write.

`make clean` drops everything generated, the resolved package checkouts
included.

`ATLAS_BASE_URL` in `Project.swift` is baked into `Info.plist`;
`App/Sources/AtlasApp.swift` reads it back and builds the store, and that is all
the app target contains — every line of the app is in `AtlasKit`.

**It is the deployed web app, never a local one.** A simulator can reach a dev
server on the host, but a phone can't, so a build pointed at `localhost` is a
build that works on exactly one machine. Test against the deployment; if you
have to try a server change first, deploy a preview and edit the constant for
that run only. `Info.plist` carries the host and nothing else — the Supabase URL
and its publishable key moved into `Secrets.swift` with the rest, so a generated
project holds no credential.

## Where a call goes (development phase)

The app holds its own credentials — `Secrets.swift`, which is **not committed**
(copy `Secrets.example.swift.txt` and fill it from the web app's `.env.local`).
The repo is public and the OpenRouter key is a spend credential: it must never
be committed, and it is extractable from any build that leaves this machine.

Three destinations, on purpose:

- **Supabase, directly** — auth (`AtlasAuth` → GoTrue). The publishable key is
  a client key and RLS is the access control.
- **OpenRouter, directly** — the kinds listed in `Prompts.streamed`. Their
  prompts are *copied* from `lib/server/generate/*.ts`, not rewritten: change a
  prompt on the server and it has to be re-copied here, or the app quietly
  teaches something else. `OpenRouter.swift` is a port of the transport half of
  `lib/server/openrouter.ts` — same request, same deadlines, same streaming-JSON
  scanning, pinned by `OpenRouterTests.swift`.
- **The web app** — everything not yet ported. `Prompts.streamed` returning nil
  is what routes a kind to `/api/generate`, so an unported kind keeps working
  and porting one is a single `case`.

What the device path deliberately does not have: the fallback model chain, the
shared `content_cache`, the quota, and the spend log. Those are the server's,
and a kind that matters more than a laptop build should stay there.

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
App/Resources/     Localizable.xcstrings (every line of copy, pt-BR → en),
                   InfoPlist.xcstrings, the Newsreader face
Sources/AtlasKit/
  App/        the shell — RootView, AtlasTab (the four tabs), AtlasRoute
              (everything that is pushed or presented), LaunchViewModel
  Core/       Theme, Components, Speech, Support (ErrorCopy and two one-liners)
  Domain/     the vocabulary and the pure functions — Concept, Diagnostic,
              Calibration, Retain, PhaseContent. No I/O, no SwiftUI state.
  Data/       AtlasAPI + AtlasEndpoint + NDJSONStream, AtlasAuth + SessionStore,
              RunStore + RunSnapshot (the `run_states` row, shared with the web),
              OpenRouter + Prompts + Secrets (uncommitted),
              AtlasStore + Defaults, Warm (the generation cache), Fixtures
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

**The `Navigation` package owns every push, present and tab switch.** SwiftUI's
own navigation is not an alternative here: a screen that reaches for
`NavigationStack`, `NavigationLink`, `sheet(item:)` or `@Environment(\.dismiss)`
has taken a stack the shell can no longer reset — which is what signing out
needs, and what a session pushed from two tabs needs.

- `AtlasTab` is the tab bar (Início · Mapa · Revisão · Perfil). `NavigationTabView`
  renders it from `AtlasTabNavigator` and gives each tab its own `Navigator`, so
  a stack survives a trip through another tab. Session is never a tab.
- `AtlasRoute` is every other destination — a `Routable` enum, one case per
  screen, so a destination is named rather than built at the call site. A new
  screen is a case there and a line in its `destination`, never a link.
- A screen asks the navigator it is given (`@EnvironmentObject var navigator:
  AtlasNavigator`, `AtlasTabNavigator` for a tab change) — `navigate(to:)` to
  push, `openSheet(_:)` for the node drawer, `pop()`/`popToRoot()`/
  `dismissSheet()` to leave.
- A pushed session hides the tab bar; it does not cover the screen. `navigate`
  dismisses the drawer on the way, which is why there is no `onDismiss` dance.
- The one `onOpenURL` (`RootView`) is the email confirmation link, which is a
  notice and not a place. A link that names a screen goes through the package's
  `DeepLinkHandler` into an `AtlasRoute`, never through a second `onOpenURL`.

## State

- `AtlasStore` is the one owner of everything persisted — graph, mastery states,
  cached generations (`store.warm`, see "Never make a screen wait on a model"). A view model reads it and writes back through it; nothing
  keeps a second copy of a node's state.
- **`frontier` is derived, never stored.** Ask `store.display`, which runs
  `displayStates`. Nothing writes `.frontier` into a `StateMap` and nothing
  stores a locked flag.
- **The run is a row, and it saves itself.** Every stored property of the run on
  `AtlasStore` has `didSet { saveSoon() }`, so a screen persists by writing to
  the store and never by calling a save. Adding a field to the run means adding
  the observer *and* a line in `RunSnapshot` — a field in neither is a field
  that vanishes on relaunch.
- **Writes that are not the learner working hold `quiet`.** Restoring, switching
  map and signing out all write the whole run at once, and `signOut` writes it
  empty; without the flag that clear upserts an empty map over a real row. Any
  new bulk write of the store belongs inside it.
- Renderable state is `@State`/`@Observable`. Gesture, drag and timer state that
  must not trigger a redraw lives in a plain reference held by `@State`.
- `@MainActor` on anything that touches a view. `AtlasAPI` is an actor and stays
  off the main one.

## Never make a screen wait on a model

Generation is seconds; opening a screen should be milliseconds. `Warm.swift` is
the port of the web's `lib/warm.ts`, and a new generated surface uses it rather
than calling `AtlasAPI` from a view model.

- **`store.warm` (`WarmCache`) holds every generation of the open run, by key.**
  It is `@Observable`, so a screen reads the key it cares about and redraws as
  it fills — whether the pass was started by that screen a moment ago or by a
  warm five minutes before it. A view model owns *no* copy of generated
  content; `ConsumeViewModel.chunks` is a read of the cache, not a stored array.
- **One generation per key.** `fill` registers its task before it suspends, so a
  warm and the click that beats it to the punch share one task — clicking
  through early costs the remainder of a request already running, never a second
  generation. A pass that fails, or lands empty, leaves nothing behind: the next
  caller retries and surfaces the error instead of inheriting it.
- **The builders in `Warm.swift` are the only place a kind is asked for.** A warm
  and the click after it address the same content only if one function decides
  the inputs — the boundary, the Connect pool, the language. Compute a pool
  twice and you pay for the generation twice. That is also why the pool is part
  of the key: `key(kind, node, inputs)`.
- **Who warms what.** The map warms the head of the frontier's reading pass and
  drafts the day's review cards; the node drawer warms whatever phase the node
  is owed; a session warms one phase ahead (`SessionViewModel.warmNext`), so
  Consume writes Socratic, Socratic writes Feynman, and so on to the Crisol.
- The cache is emptied whenever the run changes (`open`, `clearRun`) — every key
  names the run and the language it belongs to, and nothing survives a sign-out.

## Networking

**The `Networking` package owns every request the app makes.** A request is an
`HTTPRequestData` value and it goes out through a `URLSessionNetworkClient` —
never a hand-built `URLRequest`, never a bare `URLSession` call, and never a
second client type per call site.

- **`AtlasAPI` is the only place that talks to the web app.** A new content kind
  is a method there, never a request in a view or a view model. `AtlasAuth` and
  `RunStore` are the same rule for Supabase — auth over GoTrue, saved runs over
  PostgREST — and each holds its own client for that second host. Those three
  are the whole list.
- Requests are `HTTPRequestData` values built in `AtlasEndpoint` — a path, a
  method, headers and a body, nothing else. There is no request type per call.
- Unary requests run through `Networking`'s `URLSessionNetworkClient`, with
  `successStatusCodes: 0..<600` on purpose: a 4xx body carries the `code` a
  screen speaks and the header carries the request id a log needs, and
  `NetworkError.httpError` drops both. `AtlasAPI.send` is where a status becomes
  an `AtlasError`.
- Streaming is the one thing the client does not do: `NetworkClient` buffers a
  whole response, which is exactly wrong for a screen that should paint on its
  first frame. So `NDJSONStream` still builds the package's request value and
  only takes over the reading, through `URLSession.bytes`. That split is the
  rule — a streamed endpoint keeps `HTTPRequestData`; it does not get its own
  request shape.
- Streamed kinds render frames as they land. A frame with `partial: true` is a
  redraw: show it, never assemble it, never treat it as the answer — a complete
  frame for the same slot always follows. A frame named `__error` means the
  stream died after committing to a 200: keep what landed and offer a retry.
- Never derive "is this the last item?" from a streamed array's length; read the
  explicit total the payload carries.
- Errors surface as `AtlasError` with a `code`. The screen says something true
  about the code in the learner's language — the `message` is for logs and never
  appears on screen.
- `OpenRouter.swift` is the single sanctioned exception, and only because it is a
  port of a server file that must stay diffable against it (see *Where a call
  goes*). It is a vendor transport, not app networking: nothing else in the app
  builds a `URLRequest`, and no view or view model ever reaches it — a screen
  asks `AtlasAPI` for content and does not know which destination answered.

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

**The interface ships in pt-BR and en-US, always** — same requirement as the web
app, different mechanism. Portuguese is the *source* language: the copy in the
code is the Portuguese, and `App/Resources/Localizable.xcstrings` carries the
English beside it. There is no lookup table and there are no key constants; the
string at the call site is the key.

The catalogue lives in the **app target**, not in the package, so a `Text("…")`
anywhere in AtlasKit resolves against `Bundle.main` with no `bundle:` argument
to remember. Nothing about localisation is declared in `Package.swift`.

- **Copy is a `LocalizedStringKey` literal at the call site.** `Text("Assunto")`,
  `Kicker("Próximo")`, `CTAButton("Voltar ao mapa")`, `Button("Dica")`,
  `.alert("Apagar minha conta?")`, `.accessibilityLabel("Voltar")` — all of
  those localise themselves. A component parameter that is always copy is typed
  `LocalizedStringKey`, never `String`; passing a `String` to one is a compile
  error, which is the point.
- **Generated material is `verbatim:`.** A concept's label, a section's kicker,
  a problem's tag, a formatted date, a count on its own — none of that is copy
  and none of it belongs in the catalogue. `Text(verbatim:)`,
  `Kicker(verbatim:)`, `Chip(verbatim:)`, `Waiting(verbatim:)`. Reach for it
  deliberately: a bare `Text(someString)` picks the non-localising overload
  silently, so writing `verbatim:` is how the next reader knows it was meant.
- **A view model exposes `LocalizedStringKey`** for anything the view only
  displays (`actionTitle`, `headline`, `reading(_:)`), and `String(localized:)`
  for a string it also inspects — anything checked with `.isEmpty`, or where one
  branch is copy and another is a node's own label. `ErrorCopy.sentence` is the
  second kind, and the `doing:` fragment it takes is copy too:
  `doing: String(localized: "montar sua revisão")`.
- **Interpolate, never concatenate.** `"Cartão \(i) de \(n)"` becomes the key
  `Cartão %lld de %lld` and translates as one sentence; `a + " " + b` is two
  languages spliced in Portuguese word order. The same goes for a sentence with
  an optional tail — write both sentences whole.
- **Plural agreement belongs to the catalogue.** No `\(n == 1 ? "" : "s")` in
  Swift: give the key a `plural` variation in both languages (the two don't
  pluralise on the same rule, and English `%lld d` doesn't inflect at all).
- **Phase names stay English in both languages** — Consume, Socratic, Feynman,
  Connect, Crucible, Retained are product vocabulary. The prose around them is
  translated: `Crisol · aplicação` → `Crucible · application`.
- `Info.plist` copy — the two usage descriptions — lives in
  `App/Resources/InfoPlist.xcstrings`, with the Portuguese in `Project.swift` as
  its base value.

**The gate is `make strings`.** The key set is not guessed from a regex:
`SWIFT_EMIT_LOC_STRINGS=YES` makes swiftc emit one `.stringsdata` per file
listing every literal it actually compiled as a localised string, and the script
fails on any key with no English and on any catalogue entry the code no longer
uses. Run `make strings-update` after adding copy, then write the English.

**The interface follows the system language, and the picker on screen 13 does
not change it.** iOS lets a learner set a language for one app (Settings ›
Atlas › Language) and the catalogue answers to that; `AtlasAPI.deviceLanguage`
reads `Bundle.main.preferredLocalizations`, so the prose the model writes
defaults to the language the app is drawn in. Screen 13's *Idioma* field is the
content override on top of that, which is what its note says.
<!-- ponytail: no in-app UI-language switch. It would mean threading a locale
     through every `String(localized:)` in every view model — one that is
     forgotten renders in the wrong language with nothing to catch it. The
     system setting is free and correct. -->

## Verifying a change

`make build`, `make test` and `make strings` pass, then run it: the iOS simulator against
`ATLAS_FIXTURES=1 npm run dev` on the host, and click the real flow through to
the screen you changed. A screenshot of the screen next to its artboard is what
"matches the design" means.

A screen whose copy changed is checked in both languages — relaunch it with
`xcrun simctl launch <udid> com.joaoigor.atlas -AppleLanguages "(en)"` and read
it. English is usually the longer of the two; a line that only fits in
Portuguese is not done.
