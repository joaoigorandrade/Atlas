# Atlas iOS — plan

The mobile counterpart of `Learning Platform Mobile.dc.html` (Claude Design
project `ede1cd84`), built in SwiftUI. Same tokens, same phases, same mastery
palette as the web app; what changes is where things live — side rails become
bottom sheets and tabs, every two-column grid stacks.

## What we reuse, and what we build

**Reused as-is:** the whole backend. `/api/generate` (all content kinds, cache,
quota, NDJSON streaming), `/api/content`, `/api/speech`, `/api/health`,
Supabase auth and the `run_states` row. The iOS app is a second client on the
existing contract — no parallel API, no duplicated prompt logic, no second copy
of the curriculum rules that isn't a direct mirror of `lib/curriculum`.

**Built:** the SwiftUI client — 20 screens, the tab shell, the map canvas, and a
Swift mirror of exactly three things from `lib/`: the design tokens
(`Theme.swift` ← `lib/theme.ts`), the mastery vocabulary and frontier derivation
(`Concept.swift` ← `lib/curriculum/types.ts` + `replan.ts`), and the generation
seam (`AtlasAPI.swift` ← `lib/api.ts`).

### The one server change this needs

**Done.** `lib/supabase/server.ts` accepts `Authorization: Bearer
<access_token>` and falls back to cookies — one branch, no change to any route
(`middleware.ts` already excludes `/api/`). The token both authenticates the
caller and rides on every PostgREST request, so RLS still sees the learner.
`tests/bearerAuth.test.ts` covers it.

## Architecture

```
ios/
  AtlasKit/                 SPM package — everything: models, API, views, tests
    Sources/AtlasKit/
      Theme.swift           tokens (colour, face, motion, metrics)
      Auth.swift            Supabase auth over REST + the keychain session
      Concept.swift         NodeState, ConceptGraph, displayStates
      AtlasAPI.swift        the single HTTP seam + NDJSON stream reader
      Store.swift           @Observable run state — one owner
      Components.swift      the design's CSS classes as views
      PhaseContent.swift    what the five phases decode off /api/generate
      Session.swift         one pass through the spiral, and what it writes back
      Speech.swift          read-aloud and dictation, both platform-only
      RootView.swift        tab shell
      HomeView.swift        the reference screen
      AuthView.swift        screens 1–4, four states of one screen
      ConsumeView.swift     …one file per screen, from there on
    Tests/AtlasKitTests/    swift test, no simulator needed
  Atlas.xcodeproj           app target: entry point + fonts + assets, ~10 lines
```

One package, not a module graph: a screen and the state it reads ship together.
The Xcode app target holds only `@main`, the bundled fonts and the app icon, so
`swift test` runs in CI without Xcode or a simulator.

**Creating the app target** (one time, not scriptable): Xcode → new iOS App
("Atlas", SwiftUI, Swift 6) at `ios/Atlas/`, add `ios/AtlasKit` as a local
package dependency, replace `ContentView` with
`RootView(store: AtlasStore(api: AtlasAPI(baseURL: …), auth: AtlasAuth(baseURL:
<supabase url>, apiKey: <publishable key>)))`, drop the three `.ttf` faces into
the target and list them under `UIAppFonts`. Voice needs two usage strings —
`NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` —
without them the mic beside every free-text answer is a button that kills the
app the first time it is pressed. Screen 4 arrives through
`onOpenURL`, so register a URL type if the confirmation link should reopen the
app; without one the learner confirms in the browser and comes back to sign in,
which is what the design's copy already says.

## Screens

Twenty artboards, in the order they should be built. Each row is one screen file.

| # | Screen | Mobile shape the design fixes |
|---|--------|-------------------------------|
| 1–4 | Entrar · Criar conta · Confirme seu e-mail · Link expirado | serif 20pt fields on a shadowed card, 52pt tap height; errors sit *below* the form, never in an alert |
| 5 | Boas-vindas | goal grid 2×2, daily-target row, CTA in a dock |
| 6 | Montando | the map assembling behind a centred progress line |
| 7 | Direto ou perguntas | full-screen fork over the faded new map |
| 8 | Nivelamento | segment bar, one adaptive question, feedback inline under the options |
| 9 | Mapa | canvas + persistent bottom sheet (subject, % dominado, próximo) + tab bar |
| 10 | Detalhe do nó | the desktop's 356pt drawer as a tall bottom sheet: state, summary, phase spiral, prereq chips, dock |
| 11 | Início | today's review card + frontier card + map list |
| 12 | Perfil | 2×2 stat grid, learning profile, settings rows |
| 13 | Configurações | goal, daily target, language, voice toggles, data export |
| 14 | Consume | section progress rail, prose, figure, lens chips, check block |
| 15 | Socratic | chat transcript, answer dock with mic |
| 16 | Feynman | beat rail, one prompt card, prev/next dock |
| 17 | Connect | concept web SVG, link prompt, drafted cards |
| 18 | Crisol | problem block, work area, submit + hint dock |
| 19 | Revisão | card deck with stacked backs, self-rating before flip, four-grade dock |
| 20 | Calibração | calibration curve, then the reading *below* it (the 268pt rail becomes a header icon) |

Tabs are **Início · Mapa · Revisão · Perfil**. Session is not a tab — it is not a
destination without a selected node, so every phase is pushed from the map.

## Phases

1. **Shell + tokens** (done): package, tokens, mastery vocabulary, tab shell,
   Início as the reference screen, one test on frontier derivation.
2. **Auth** (screens 1–4) + the bearer change on the server (done): GoTrue over
   REST with the key in `Secrets.swift`, the session in the keychain, refreshed
   at launch.
3. **Map + node detail** (9, 10) against fixture mode (done): `Canvas` draws
   edges and nodes off `ConceptNode.x/y`, `MapTransform` owns pan/zoom so the
   drawing and the tap hit-test agree, and `ATLAS_FIXTURES=1` boots the demo run
   in `Fixtures.swift` so both screens are reachable before onboarding exists.
4. **Onboarding** (5–8) (done): `Onboarding` is the state machine — it owns the
   run it is building (graph, mastery states, pending gaps) and commits all of
   it to the store in one write at `finish()`, so the shell shows onboarding for
   exactly as long as there is no map. The curriculum stream lands concept by
   concept behind the assembly beat (`buildFloor` is a floor, not a target), the
   first placement question is fired once 8 concepts exist so the two cold
   generations overlap, and the placement writes real mastery: a correct answer
   prunes the whole prerequisite chain, a genuine miss hangs a gap node under
   the concept. Fixture mode still boots straight into the demo run, so these
   four screens are reached by signing in, not by `ATLAS_FIXTURES=1`.
5. **Session phases** (14–18) (done): `Session` is the pass — it owns which
   phase is on screen and every mastery write the spiral makes, so no screen
   touches the map itself. The chain is pushed from the map's node sheet and
   runs Consume → Socratic → Feynman → Connect → Crisol, each phase's CTA
   handing to the next; the back arrow returns to the map at any point.
   Consume streams section by section and its check gates Continue, and it
   holds its place: the run carries a `ConsumeProgress` per node — the web's
   own record, same key, same shape — written on every turn of a section, so
   leaving mid-reading comes back on the section it stopped at with its check
   still answered, and `readingPhaseIndex` keeps the drawer from ticking off
   phases nobody has done. Socratic
   judges the learner's own words and only a correct or a told answer closes a
   probe; Feynman judges the whole teach-back at once and hangs a gap under
   every rubric row it can't find; Connect leaves the node Shaky; the Crucible
   is the only path to green, and its failure is the only path to a spawned
   gap. Read-aloud (`/api/speech`) and dictation (`SFSpeechRecognizer`) are in
   `Speech.swift` — no dependency for either.
6. **Retain + calibration** (19, 20), then **Início/Perfil/Configurações**
   (11–13) (done): `Review` is the pass over the day's deck — it owns the
   scheduler write, the review history that finally earns Retido (`phaseIndex`
   now reads `store.reviewed`), the calibration reading a tap-then-grade pair
   makes, and the Shaky flag a miss hangs on the node. `retain` is a card
   *factory*: it is asked once about nodes with no cards, and `ScheduledCard`
   schedules them locally from then on. Screen 20 plots those readings —
   confidence across, delivery up, everything under the diagonal is bravado.
   Início is the day's two decisions (what is due, what the frontier is),
   Perfil the run's four numbers, and Configurações owns goal, daily target,
   content language, the two voice switches, the exports and account deletion.

   Deliberately short of the web: SM-2 rather than FSRS (`Retain.swift` says
   what that costs), a streak that any work ticks and a missed day resets, one
   map on Início rather than a list, and no reminder row — there is no APNs to
   arm one with.

## Deliberately not in v1

Offline persistence beyond what `run_states` gives (the web app has none
either — and the iOS client doesn't read or write that row yet either, so the
run, the deck and the calibration curve live for one launch; the four settings
and the streak are in `UserDefaults`), push notifications for the reminder, iPad layouts, widgets, and any
local model. The daily reminder already exists as a server cron; wiring APNs to
it is a phase of its own, after the app works.
