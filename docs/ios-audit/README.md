# Atlas iOS — feature audit

A read of every file in `ios/` (88 files, ~10,700 lines), one report per feature
area, checked against the web app it shares a backend and a spec with. Eight area
reports, 8,780 lines, roughly 200 findings, every one carrying a `file:line` and a
concrete failure scenario.

| #   | Area                                                                            | Report                                                       |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Auth, app shell, navigation, session & run persistence                          | [`01-auth-shell.md`](01-auth-shell.md)                       |
| 2   | Onboarding — welcome, map building, placement                                   | [`02-onboarding.md`](02-onboarding.md)                       |
| 3   | The concept map — canvas, pan/zoom, node drawer                                 | [`03-map.md`](03-map.md)                                     |
| 4   | Session shell + Consume — reading, figures, lenses                              | [`04-session-consume.md`](04-session-consume.md)             |
| 5   | Socratic, Feynman, Connect, Crucible + dictation                                | [`05-phases.md`](05-phases.md)                               |
| 6   | Review deck (SM-2), calibration, streak                                         | [`06-review-calibration.md`](06-review-calibration.md)       |
| 7   | Home, Profile, Settings                                                         | [`07-home-profile-settings.md`](07-home-profile-settings.md) |
| 8   | Data & infrastructure — API, streaming, warm cache, store, theme, speech, build | [`08-infra.md`](08-infra.md)                                 |
| —   | Independent spot-checks of the severest claims                                  | [`00-verification.md`](00-verification.md)                   |

Each area report gives, per feature: the objective, a mechanism walkthrough with a
Mermaid diagram drawn from the real control flow, what it gives the learner, the
defects, and ranked improvements.

---

## The short version

The architecture is sound and unusually well documented — the `ponytail:` comments
explain intent at the exact places a reader needs it, and several of them name the
very defect the audit then confirms. The mastery ladder is correct and tested. The
prompts are byte-identical to the server's. Localisation is complete.

What the audit found is not an architecture problem. It is that **the learner's work
is not durable, three of the four interactive phases have drifted away from the
pedagogy they were ported from, and there is no CI on `ios/` to have caught either.**

### The five that block a release

| #   | Sev          | Where                                                          | What                                                                                                                                                                                                                               |
| --- | ------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **critical** | `AtlasStore.swift:307-319`; no `scenePhase` anywhere in `ios/` | Nothing flushes the 2-second debounced save when the app leaves the foreground. Grade the last card, swipe home — the grade, the calibration sample and the node state die with the suspended process.                             |
| 2   | **critical** | `Warm.swift:281` vs `useSpiral.ts:1690`                        | Review cards are deduped on the server's request-scoped ids (`r1…rN`). Every draft after the first collides completely and files nothing. The deck is frozen at day one, and the generation is re-billed on every launch, forever. |
| 3   | **critical** | `AtlasStore.swift:214`                                         | A failed `runs.list` shows onboarding; rebuilding the same subject upserts over the real row and destroys its cards, calibration and review history. The comment above it calls this "recoverable". It is not.                     |
| 4   | **critical** | `OpenRouter.swift:16`                                          | The OpenRouter spend credential ships inside the app binary, extractable from any build that leaves the machine.                                                                                                                   |
| 5   | **high**     | `RunSnapshot.swift:115` → `MapCanvas.tsx:306`                  | iOS writes `positions: {}`; the web dereferences `pos.x` with no null guard. An iOS-built run white-screens the browser map.                                                                                                       |

Items 1–3 are three independent ways to lose a learner's work. That is the single
most important sentence in this audit.

---

## Cross-cutting themes

The area reports are organised by screen. The findings are not — they cluster into
six stories that no single area report could see whole.

### A. The run is not durable — five independent loss paths

Each of these was found by a different agent looking at a different screen. Together
they are one defect with five faces.

| Path                                    | Where                                                           | Loses                                                   |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| No background flush                     | `AtlasStore.swift:307`, no `scenePhase` in `ios/`               | Everything inside the 2 s debounce, on every app switch |
| No token refresh after launch           | `AtlasStore.swift:199` is the only `refresh` call in the client | Every save ~1 h in, silently 401ing                     |
| `signOut` cancels rather than flushes   | `AtlasStore.swift:367-369`                                      | The last ≤2 s, on every deliberate sign-out             |
| `exit(0)` over an unproven flush        | `SettingsViewModel.swift:51-54`                                 | The whole pending write, if the upsert failed           |
| Failed library load → rebuild → clobber | `AtlasStore.swift:214`                                          | The entire prior run                                    |

`AGENTS.md` promises "the run is a row, and it saves itself." The `didSet`/`saveSoon`
mechanism does exactly what it claims — but nothing guarantees the debounce ever
fires, and nothing tells the learner when it didn't. There is no "not saved" state
anywhere in the iOS app; the web has one.

### B. Pedagogical inversion — the ladder is right, the rungs drifted

The mastery writes are correct and tested: Socratic writes nothing, Connect writes
`.shaky`, the Crucible alone writes `.mastered` and alone spawns its gap, and gap
spawning is idempotent. But the mechanisms that are supposed to _earn_ those states
have each lost their point:

- **Feynman** prints the rubric row _above_ the answer box (`FeynmanView.swift:79`).
  The whole device measures what the learner never thought to mention — which cannot
  be measured once you have shown them. Both `FeynmanViewModel.swift:5-6` and
  `feynman.ts:50-56` state the opposite invariant verbatim.
- **Connect** pre-fills the link editor with the generation's own answer
  (`ConnectViewModel.swift:40`). `connect.ts:129-135` opens blank on purpose:
  "handing it over unasked turns generation into recognition."
- **Socratic** sends the judge its own critique as "the question" from the second
  attempt onward (`SocraticViewModel.swift:115`) — so it mis-grades precisely the
  learners who are struggling. And its `hint`/`tell` steps are generated and never
  rendered, so an unanswerable probe has no exit but the back arrow.
- **The Crucible** has no confidence gate, so `recordCalib` never fires from the one
  phase built to catch overconfidence (`Calibration.swift:6-7` admits this).
- **Connect** displays "N cartões rascunhados" and writes zero cards
  (`ConnectView.swift:103`). The learner's sentence is discarded on exit.

None of these is a crash. All of them quietly convert the product's actual method
into something easier and less effective, while the UI claims otherwise.

### C. Silent dead ends

A failed generation routinely leaves a screen with no retry and no dock, while
`ErrorCopy` says "Tente de novo em instantes" — advice the UI gives no way to take.
Confirmed at `CrucibleView.swift:37`, `FeynmanView.swift:48`, `ConnectView.swift:61`,
`ReviewView.swift:50`, and the Consume path at `Warm.swift:140` (which wipes partial
content, then reports the pass "done"). Onboarding has the same shape: a stream that
dies mid-flight throws away every concept that landed, against the explicit rule in
`AGENTS.md` §Networking.

### D. Money leaks

- The review draft is re-requested and re-billed **every launch, forever** (theme A,
  item 2) because `uncovered` can never shrink.
- `Warm.swift:160-178`'s `prior`/`laterLabels` is not `conceptBoundary`, so every
  per-node generation is keyed and prompted differently from the web's — the shared
  `caches` column cannot hit, and both clients pay separately for the same concept.
- The full `cards` array re-uploads on every graded card (~200 KB every 2 s on a
  mature run) because `snapshot` has no `warm.revision`-style change guard.

### E. The accessibility floor

The map is a `Canvas` with nothing for VoiceOver to read (`MapView.swift:59`) — the
central screen of the product is invisible to a blind learner. The calibration curve
is one label over a plot (`CalibrationView.swift:63`). The 2×2 stat grid and the
daily-target row cannot reflow at large Dynamic Type. Several controls sit under the
44 pt floor `AGENTS.md` calls non-negotiable: the drawer's nudge buttons (~33 pt),
Home's avatar (34 pt).

### F. The root cause: `ios/` has no CI

`.github/workflows/ci.yml` contains **no iOS job at all**. `ios/AGENTS.md` requires
`make build`, `make test` and `make strings` before every push and calls them
required checks; nothing enforces that. Compounding it, a fresh clone cannot build —
`Secrets.swift` is git-ignored and required — so the gates cannot run even if added
without fixing that first.

This is why the other five themes were able to accumulate. It is the cheapest fix in
the report and the one that stops the bleeding.

---

## What is genuinely well made

Recorded because an audit that only lists defects misrepresents the codebase.

- **The prompts are byte-identical to the server's.** The one rule most likely to rot
  silently — `ios/AGENTS.md` warns that a drifted prompt means "the app quietly
  teaches something else" — has held.
- **The mastery ladder is correct and tested**, including idempotent gap spawning and
  the dashed-edge rule.
- **Localisation is complete**: 290 keys, zero missing English, plurals in the
  catalogue rather than in Swift. Checked by parsing the catalogue, not sampling.
- **Double-submit is genuinely impossible** in all three judged phases.
- **`WarmCache`'s one-generation-per-key guarantee holds** — a warm and the click that
  beats it share one task, exactly as designed.
- **The keychain handling, the `Landed` two-halves design, and the `RunSnapshot`
  extras merge** each survived a dedicated attempt to break them.
- **No NaN on an empty run, no credential in the exports, and account deletion
  genuinely deletes** server-side and clears the keychain — three things specifically
  hunted for and not found.

## One documentation correction

`ios/PLAN.md`'s "Deliberately not in v1" says the run, the deck and the calibration
curve "live for one launch." That is stale: they persist via `iosCards`, pinned by
`RunSnapshotTests.swift:105`. Worth fixing so nobody re-implements what already works.

---

## Suggested order of work

**Wave 1 — stop losing work and money** (small, mechanical, high value)

1. `scenePhase` flush + `beginBackgroundTask` in `RootView` — one `onChange`.
2. Re-id review cards on receipt; add a two-draft regression test.
3. Never upsert over a row the client failed to read; add a visible "not saved" state.
4. Refresh on 401.
5. Flush before clearing in `signOut`; gate `exit(0)` on a proven flush.

**Wave 2 — make the teaching do what it says** 6. `context["question"] = .string(current.prompt)` — one line. 7. Stop revealing the Feynman rubric row before the answer. 8. Open the Connect editor blank; write the cards or drop the count. 9. Render Socratic's existing `hint`/`tell`. 10. Retry affordances on every failed generation.

**Wave 3 — the shared contract** 11. Seed `positions` so an iOS run opens in the browser. 12. Port `conceptBoundary` so both clients hit the same cache. 13. Port `orderedFrontier` + `readingPhaseIndex`.

**Wave 4 — the floor** 14. iOS CI (after making a clean clone buildable). 15. VoiceOver representation for the map and the calibration curve. 16. Dynamic Type reflow and the 44 pt violations.

---

_Method: eight parallel subagents, one per area, each reading its files in full and
cross-checking against the web implementation. The severest claims were then
re-verified independently against the source — see [`00-verification.md`](00-verification.md),
which confirms four and corrects one (a mastered node's CTA pushes into an
unimplemented `Pending("Revisão")` stub, not into the Crucible as first reported)._
