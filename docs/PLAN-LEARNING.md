# Plan — the fastest deep way to learn anything

Written 2026-09-29 on `main` @ 0aea4a8. This is the one plan for what Atlas
teaches and how learners experience it. `PLAN-QUALITY.md` was about the
codebase; `RESEARCH-LEARNER-FLOWS.md` is the evidence behind this plan (four
learners walked through real generator output, why each would leave, and 29
ideas). Every item here traces back to a finding (F = mastery integrity,
R = research) or a research idea (#), in the traceability tables at the end.

## North star

> A learner reaches complete, durable knowledge of **any** topic, in the
> **least time**, measured against **what they actually need to do with it**.

That breaks into five numbers. Every wave moves at least one of them, and the
measurement track exists so they can be read at all.

| Metric                  | Definition                                                                            | Target                                 |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------------- |
| **Durability**          | Share of `mastered` nodes whose 7-day probe (M.1) passes                              | ≥ 80%                                  |
| **Minutes to mastery**  | Active seconds (`phase_seconds`) over a node's gates, per cell                        | −30% vs. baseline on known material    |
| **Content correctness** | Share of shipped closed items whose key a blind solver disputes (W0.3)                | < 3% in every domain                   |
| **Target performance**  | Share of maps whose final (W5.3) passes again ≥ 7 days after first passing — "Proven" | ≥ 75%                                  |
| **Stay**                | Share of learners still active in week 4 of a map (from `phase_attempts`)             | Baseline first; then +50% vs. baseline |

Production today: one topic, 15 nodes, no phase closed, no cards. Until real
learners arrive, every number is read from **dogfooding** plus the **flow
eval** (M.3), which re-runs the four research learners on every stage gate.

## What must survive every wave

These are what no competitor has, and the reason to stay:

- **The core model:** fifteen purpose-built phases with their own signals and
  gates, and plans resolved from kind × domain × cell and frozen on the node.
- **Honest state:** mastery derived from a ledger (`stateFromPlan`), gap nodes
  that name the missing piece, and Shaky reasons.
- **The learner model:** calibration, misconception memory, and avoidance
  detection (`thin`).
- **The rare phases:** source criticism (Provenance) and steelmanning.
- **Review:** automatic spaced review (FSRS).

The competitors are better _sessions_; Atlas is a better _curriculum_. This
plan keeps the curriculum and brings the sessions up to their level.

---

## Findings

### F — what undermines "mastered" (from reading the engines)

| #   | Finding                                                                                                                            | Where                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| F1  | A node can go unknown → mastered in one sitting; Recall runs minutes after Crucible, so it measures working memory, not retention. | `stateFromPlan`, `PHASE_PLAN`              |
| F2  | The Crucible's scaffolded re-attempt (rung 1, right after the re-explanation) masters the node.                                    | `advanceFromCrucible`, `useSpiral.ts:1646` |
| F3  | Feynman "Fix this" is multiple choice with elimination; guessing until right flips a gap to `good`.                                | `feynmanReducer` `fix`                     |
| F4  | Feynman gaps set no Shaky reason; the parent reaches `mastered` with gap nodes still open.                                         | `advanceFromFeynman`                       |
| F5  | Perform's re-run replays the same case after the report showed what was wrong.                                                     | `performReducer` `rerun`                   |
| F6  | Connect passes on two confirmed links; an empty draft falls back to the map's sentence.                                            | `connectReady`, `connectCards`             |
| F7  | Every closed item's key is written by the same call as the question and never checked.                                             | `lib/server/generate/*`                    |
| F8  | Review is flip-then-self-grade — the fluency illusion calibration exists to catch.                                                 | `RetainCard.tsx`                           |
| F9  | Mastery never decays until a card is failed.                                                                                       | `displayStates`                            |
| F10 | Nothing makes the learner choose _which_ idea applies.                                                                             | —                                          |
| F11 | Drill is one multiple-choice sitting; automaticity forms across days.                                                              | `drill.ts`                                 |
| F12 | Produce grades a speech-recognition transcript that normalises the errors it should catch.                                         | `useProduce.ts`, `lib/speech.ts`           |
| F13 | The ledger is mirrored by hand in TS and Swift; the server stores whatever `state` a client sends.                                 | `lib/server/store/nodes.ts`                |

### R — why real learners would leave (from running the generators on four topics)

| #   | Finding                                                                                                                                                                                               | Flow  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| R1  | **Speech is locked to the interface language** (`speechLang` knows only en-US/pt-BR; iOS uses `AtlasAPI.language`). Spanish spoken in Produce is transcribed as Portuguese; read-aloud has one voice. | B     |
| R2  | No phase trains listening.                                                                                                                                                                            | B     |
| R3  | No math notation (`Rich` renders code/bold/em only), no math input, box-and-arrow figures only.                                                                                                       | A     |
| R4  | Practice can miss the node's own method: "Linear Systems (augmented matrices)" generated a two-variable substitution problem.                                                                         | A     |
| R5  | Domain tags are noisy per node, so ladders are random: budgeting tagged `executable`, an easy "margin" tagged `formal` → 10 phases.                                                                   | D     |
| R6  | No locale: finance content is in R$ but names no Brazilian instrument (Tesouro, CDI, Selic, FGC, IR).                                                                                                 | D     |
| R7  | The four kinds have no home for events, people or documents: all came back `concept`; Discriminate on a person becomes a keyword quiz; Crucible on an event becomes analogy-making.                   | C     |
| R8  | Chronological topics become a single chain (one frontier node at a time, no dates).                                                                                                                   | C     |
| R9  | Heavy phases run uniformly (13 Steelmans and 13 Crucibles in one era; easy core nodes run 10 phases). Phase time exceeds the pace model by 50–70% on three of four maps.                              | A C D |
| R10 | "Green" is not the target performance (timed exam, unscripted conversation, teaching, behaviour); the app never asks what the target is.                                                              | all   |
| R11 | Only the Exam goal has a date.                                                                                                                                                                        | B D   |
| R12 | One review queue per topic; nothing plans a day across maps.                                                                                                                                          | all   |
| R13 | Primary sources are recalled by the model, not retrieved or linked; one Provenance key contradicted the phase's own rule.                                                                             | C     |
| R14 | Screen- and keyboard-first; no hands-free mode; units are 5–15 min.                                                                                                                                   | B C   |
| R15 | Nothing is grounded in the learner's material beyond the map outline.                                                                                                                                 | A all |
| R16 | Life domains are taught in the abstract; the evidence favours just-in-time, own-context education.                                                                                                    | D     |
| R17 | Language Drill is multiple-choice cognates ("diga", but tap); Produce is monologue — the partner never answers.                                                                                       | B     |
| R18 | No lens choice for confessional subjects (academic vs. the tradition's own reading).                                                                                                                  | C     |
| R19 | Coverage gaps: linear algebra had no inverse or change of basis; Spanish had no false friends.                                                                                                        | A B   |

---

## Ground rules for every item

1. **Both clients, always.** Every ledger, gate or content change lands on web
   _and_ iOS (`ios/AtlasKit`) in the same wave; `tests/wireParity.test.ts`
   catches a `NodeDelta` field Swift drops.
2. **Both languages, always.** New copy ships en + pt-BR; web tables outside a
   component go in `tests/i18nCoverage.test.ts`; iOS strings are added to the
   xcstrings file by hand (`make strings-update` rewrites the catalogue).
3. **Phases are purpose-built.** A new phase gets its own reducer, generator,
   validator, gate, view and hook — the checklist in Wave 11. Map-level
   surfaces (Mix, the final) are not phases and live outside `PHASE_ORDER`.
4. **Hand-offs read the plan.** Only `enterOwedPhase` decides what opens next.
5. **Session snapshots are live data.** A new session field is missing on saved
   rows: normalise it in the reducer; never read an old field under new
   semantics.
6. **Cache discipline.** A payload _shape_ change bumps `VERSION` in
   `contentCache.ts`. A fixed prompt does not evict a bad row — delete it.
   **Topic-level axes are stamped by the server** (W0.4), never carried by a
   client, and are omitted from the key when unset so existing rows keep their
   address.
7. **The size ratchet has no headroom.** `useSpiral.ts`, `FeynmanView.tsx`,
   `CrucibleView.tsx`, `ConsumeView.tsx`, `ConnectView.tsx`, `RetainCard.tsx`
   and `job.ts` sit one line under their ceilings: **extract first**, then add.
8. **Fixtures and e2e move with the feature.** New kind → typed fixture; changed
   gate → progression spec + `tests/curriculum.test.ts` + `PhaseGateTests.swift`.
9. **Plans are frozen at build.** A `resolvePlan` change ships a new ladder for
   maps built after it; it never re-cuts a run in progress.
10. **A new dependency needs a sentence of justification** in its PR (only W7.1
    is expected to add one).

Sizes: **S** ≈ 1 dev-day · **M** ≈ 3 · **L** ≈ 8 (one developer working with
agents; rough, for ordering, not promises).

---

## Roadmap at a glance

| Stage               | Wave | Theme                                         | Size (dev-days) | Depends on | Fixes                    |
| ------------------- | ---- | --------------------------------------------- | --------------- | ---------- | ------------------------ |
| **I — Trustworthy** | 0    | Foundations: one authority, a measuring stick | ~9              | —          | F13 · enables all        |
|                     | 1    | Correctness and honest gates                  | ~15             | W0.1, W0.4 | R1 F2–F6 F12             |
|                     | 2    | Correct, local, verified content              | ~22             | W0.3, W0.4 | F7 R4–R6 R13 R18 R19     |
| **II — Fast**       | 3    | Never re-teach, ration the heavy phases       | ~10             | W0.2       | R9                       |
|                     | 4    | Durability and one daily rhythm               | ~15             | W0.1, W3   | F1 F8 F9 F11 R11 R12 R14 |
| **III — Real**      | 5    | Target performance: backward from the goal    | ~23             | W2, W4     | R10 F10                  |
| **IV — Fit**        | 6    | Languages: hear it, say it, converse          | ~21             | W1.1, W4.6 | R2 R17 R19               |
|                     | 7    | Math and formal subjects                      | ~25             | W2.1       | R3 R4                    |
|                     | 8    | Audio-first and on the move                   | ~12             | W1.1, W6.3 | R14                      |
|                     | 9    | The topic's own shape                         | ~25             | W3.1       | R7 R8                    |
|                     | 10   | The learner's own world                       | ~14             | W5.1       | R15 R16                  |
|                     | 11   | New phases                                    | ~25             | W1, W2.1   | F10 · depth              |
| **Continuous**      | M    | Measure, review the flows, tune               | ongoing         | W0.2       | all metrics              |

**Critical path to "trustworthy and fast"** (Stages I–II, ~70 dev-days):
W0 → W1.1 → W1.0–W1.6 ∥ W2.1 → W2.3–W2.5 ∥ W3 → W4.

**Stage gates.** At the end of each stage, run the **flow review** (M.3):
re-run Ana (linear algebra), Rafael (Spanish), Teresa (Church history) and
Bruno (finance) through the flow eval and one dogfood session each, and record
which of their exit points from `RESEARCH-LEARNER-FLOWS.md` still exist. A
stage is done when its targeted exits are gone, not when its PRs are merged.

---

# Stage I — Trustworthy

## Wave 0 — Foundations

**Why first:** Waves 1, 4 and 5 change the rules that derive mastery, and
Waves 1–10 add topic-level axes. With two hand-kept mirrors and a server that
trusts the client's `state` (F13), every rule change is two implementations
that can disagree silently. Without an attempts log and an eval, no later wave
can prove it helped.

### W0.1 The server re-derives state from the ledger (F13) · M

- **Change.** On every node write carrying `phasesDone` or `shakyReason`,
  `lib/server/store/nodes.ts` recomputes `state` with the web's pure functions
  (`stateFromPlan`, `reasonAfter` from `@/lib/curriculum`) and stores that,
  ignoring the client's `state`. The route returns it; both clients adopt it
  when it differs. It rides the existing `NodeDelta` writes, so the offline
  queue and debounced writer are unchanged.
- **Data.** `nodes.phase_closed_at jsonb` (`{ [phase]: ISO }`), stamped by the
  server the first time a phase appears in `phases_done`, and returned in
  bootstrap (`lib/persistence.ts`, `AtlasRun.swift`). W4.1 reads it.
- **Tests.** `tests/store.test.ts`: a delta claiming `mastered` on an unfinished
  ledger is stored `learning`; `wireParity` gains `phaseClosedAt`.
- **Done when** a hand-crafted delta can't write a state the ledger doesn't
  support.

### W0.2 An attempts log · S

- **Change.** Table `phase_attempts (user_id, topic_id, node_id, phase, passed,
score, detail jsonb, at)`, RLS owner-only, cascading from `topics`. Route
  `POST /api/v1/topics/:id/attempts`, called on every phase close on both
  clients, pass and fail, with the phase's own score (`{ overIncluded: 1 }`,
  `{ brokeAt: 2 }`, …). A log, unlike `phase_progress`, is never overwritten.
- **Migration** via Supabase MCP `apply_migration`, then rename the local file
  to its version; test RLS with a raise-and-rollback `DO` block.
- **Done when** every phase close on either client writes exactly one row.

### W0.3 The eval panel: content correctness + the four flows · M

- **Change.** `tests/content.eval.test.ts`, gated on `RUN_EVAL` like
  `judge.eval.test.ts`, calling the generators directly (no cache, no DB — the
  method used for the research). A fixed panel of 12 topics, two per domain,
  en and pt-BR, **including the four research topics** (linear algebra/exam,
  Espanhol para viagem/Pareto, Igreja Antiga/mastery, Finanças pessoais/Pareto).
- **Reports.**
  1. **Keys:** for each closed-item kind, the judge model solves every item
     blind; disagreement rate per kind × domain.
  2. **Tags:** each map's `kind`/`domain`/cell per node, flagging a map whose
     nodes span more than two domains.
  3. **Shape:** DAG width (chain detection), phase-minute hours vs. the pace
     model.
  4. **Locale and notation:** counts of jurisdiction terms on locale-bound
     topics, and LaTeX presence on formal ones.
- **Done when** the baseline is written under "Baselines" at the end of this
  file.

### W0.4 Topic-level axes are stamped by the server · S–M

- **Change.** Generalise `withNeighbours` (`lib/server/store/continents.ts`)
  into `withTopicAxes`, called at the same sites (`/api/generate`,
  `/api/content`, `afterBuild.ts`, `jobInput.ts`). It reads the `topics` row
  and stamps every topic-level axis onto the generation body, discarding any
  client-supplied copy.
- **Axes it stamps, as their waves land.** Each axis adds its column in the
  wave that needs it, not before, and is omitted from the key when unset:
  - `targetLanguage` (W1.1)
  - `locale` (W2.5)
  - `lens` (W2.6)
  - `target` (W5.1)
  - `shape` (W9.1)
- **Why.** A per-node axis has to reach four places on two clients, or it keys
  silently to the wrong row. A server-stamped one reaches none of them.
- **Tests.** A body carrying a forged axis is overwritten; an unset axis yields
  the pre-change cache key (pinned against a fixture key).

**Wave 0 ships:** one migration, one route, one store change, one eval, one
server seam. No learner-visible change.

---

## Wave 1 — Correctness and honest gates

Each item closes a way to reach green without earning it, or a surface that is
broken outright. One PR each, in this order.

### W1.0 Make room first · S

Lift the Crucible handlers (`enterCrucible`, `crucibleSubmit`,
`advanceFromCrucible`, retry) into `components/atlas/useCrucible.ts` and the
Feynman ones into `useFeynman.ts`, following `usePerform.ts`. This is
behaviour-preserving, verified by the e2e progression specs, and lowers
`useSpiral`'s entry in `size-budget.json` (`--update`).

### W1.1 A target language for speech (R1, F12) · M — _task already filed_

- **Change.**
  - **The target language.** A performative map returns `targetLanguage`
    (BCP-47 with region, e.g. `es-ES`), stored on `topics.target_language` and
    stamped via `withTopicAxes`. The map screen shows it with a one-tap variant
    change (Spain · Mexico · Argentina · …).
  - **Dictation.** Answer boxes whose expected answer is in the target language
    (Produce, the diagnostic `speak` kind, spoken Drill W6.4) dictate in it:
    `lib/speech.ts` takes an explicit language, and `Speech.swift` takes a
    `Locale`. Everything else still follows the interface language.
  - **Read-aloud.** `lib/server/tts.ts` takes a language per segment and a
    native voice per target (`simba-multilingual`, with a small voice table
    overridable by env). `speech_cache` keys include the voice, so existing
    clips aren't re-billed.
  - **The judge** is told the transcript came from a target-language recognizer
    and must not credit a target form in a low-confidence span. Web passes
    `SpeechRecognitionAlternative.confidence`; iOS passes segment confidence.
    The raw transcript is shown on the turn report.
- **Tests.** Unit: the recognizer language for a performative topic is the
  target; the key is unchanged for non-performative topics. Manual: Safari and
  iOS simulator.
- **Done when** "¿Me puede dar otra llave?" spoken on a pt-BR device lands in
  Produce as Spanish.

### W1.2 A scaffolded Crucible pass does not master (F2) · M

- **Rule.** A pass on rung 0 (cold) closes the Crucible. A pass on rung 1 (after
  the re-explanation) removes the gap node and closes the rung, but leaves the
  node **Shaky** with a new reason, `crucible-scaffolded`; the proof gate
  re-opens with a fresh problem.
- **Fresh problem.** Already half-built: `generateCrucible` takes `rerun`
  (`RERUN_DOMAINS`, keyed in `job.ts`, omitted when 0), and iOS tracks it
  (`crucibleRerun` in `Warm.swift`). Increment it after a scaffolded pass too.
  No new cache axis, no `VERSION` bump.
- **Files.** `lib/curriculum/types.ts` (+ reason, both copy tables),
  `useCrucible.ts`, iOS `CrucibleViewModel.swift` / `Warm.swift` /
  `Calibration.swift`, xcstrings, `crucibleCopy.tsx`.
- **Done when** e2e shows a rung-1 pass leaves the node Shaky and a later cold
  pass turns it green.

### W1.3 Feynman: repair in your own words; gaps block green (F3, F4) · M

- **Fix this.** The fix probe becomes an open answer (`OpenAnswer` +
  `MicButton`), judged by the existing `socratic` mode against the beat's
  `mustConvey`. `fix.replies` stay in the payload as the misconception bank
  (no shape change). `fixRuledOut` stops being written; saved sessions read it
  as empty.
- **Gaps block green.** `stateFromPlan` gains `openGaps`: a node with open gap
  children is `learning` or `shaky`, never `mastered`. The server derives it
  too (W0.1 has the graph), and it lands in `Calibration.swift` in the same PR.
- **Done when** a Feynman pass with two red rows cannot produce a green parent
  until both gap nodes close.

### W1.4 Perform re-runs on a new case (F5) · S

Give Perform the Crucible's `rerun` axis:

- `rerun` in `job.ts`'s `perform` case, omitted when 0;
- a per-node counter on both clients, the twin of `crucibleRerun`;
- a prompt line: "same procedure, different values and surface".

The report still quotes the previous run.

### W1.5 Connect: the learner writes the link, and it is checked (F6) · M

- `confirm` requires the learner's own sentence (≥ 6 words).
- The map's suggestion appears only _after_ confirming, as "compare", and is
  never used as a card back.
- New judge mode `connect`: `true | vague | false` + one line. `false` blocks
  the link.
- **Files.** `connect.ts`, `judge.ts`, `apiJudge.ts`, `ConnectView.tsx`
  (extract the link panel first), iOS `ConnectViewModel.swift`.
- **Why it matters.** These sentences become cards, and a wrong link rehearsed
  for months is the worst outcome in the app.

### W1.6 The small ones · S

- **Trace:** the header matches the reducer (the walk continues past a break),
  and `traceEarly` (first three right) is added.
- **Provenance:** `provenanceEarly` (first three right, including an `asserts`
  not called `proves`).
- **Steelman:** the judge rules the disconfirmer `real | vacuous`; the gate
  takes that instead of length.
- **Docs:** `AGENTS.md` says fifteen phases and names the three domain phases.

---

## Wave 2 — Correct, local, verified content

### W2.1 Blind-solve verification before caching (F7, R13) · L

- **Where.** One step in `lib/server/job.ts`, after a kind's validator and
  before `content_cache`. It covers `discriminate`, `predict`, `trace`,
  `drill`, `provenance`, `diagnosticQuestion` and each Consume `check`.
- **What.** A new model role, `verify` (judge model, temperature 0), sees the
  items without keys and returns picks plus confidence. Disputed items are
  dropped while the kind's lower bound holds; otherwise the payload is
  regenerated once, then shipped minus disputes with `evt:"verify_disputed"`.
  Dropping keeps the shape, so no `VERSION` bump.
- **Streaming.** Most payloads arrive via the warm queue, where the extra
  seconds cost nothing. On a foreground stream, verify each item as its frame
  completes, in parallel with the next. A failed item is withheld and `total`
  re-capped via the `hydrate { total }` path Socratic has; Discriminate,
  Predict, Trace and Drill gain it, normalised on saved sessions.
- **Backfill** script over existing rows; delete the disputed ones.
- **Cost.** One call per payload, cached, so paid once per topic.
- **Done when** W0.3's disputed-key rate is < 3% in every domain. The Nicaea
  "asserts" key is caught.

### W2.2 The right model per role · S

From W0.3's numbers, set `OPENROUTER_MODEL`, `OPENROUTER_JUDGE_MODEL` and the
new verify role. Add per-domain routing only if the eval proves one model can't
serve every domain.

### W2.3 Map quality: tags, chains, coverage (R5, R8, R19) · M

- **One domain per map.** The map prompt names the topic's domain once, first;
  nodes inherit it, and a node may override only with a `domainWhy` the
  validator requires (`mapConcept.ts`). That removes budgeting-as-code.
- **Prerequisite means "needed to understand", not "came earlier".** Add that
  rule to `mapRules`. The validator logs a >8-node map of width 1 (a chain)
  as `evt:"map_chain"`; W9 gives those topics a real timeline.
- **Coverage.**
  - **Exam goal with no upload:** one fast call first lists the standard
    course's units, then the map is grounded in that list through the existing
    `outline` path in `mapContext`. That catches the missing inverse.
  - **Performative maps:** the learner's own language is passed in, with a rule
    to include its contrastive traps (pt→es false friends).
- **Then** delete the cached map rows for the panel topics.
- **Done when** the panel shows ≤ 2 domains per map, no chains on hierarchical
  topics, inverse matrices and false friends present.

### W2.4 Practice must exercise the node's own method (R4) · S

The Perform and Crucible prompts gain one rule: the case must be unsolvable
without the node's own procedure as its summary states it. W2.1's verify call
also returns "which method did you use?"; if it names a prerequisite's method,
the case is regenerated.

**Done when** the linear-systems case needs row reduction (three unknowns, free
variable or inconsistency).

### W2.5 A locale for jurisdiction-bound topics (R6) · S–M

- **Data.** `profiles.country` (ISO, defaulted from the device locale, editable
  in Settings), and `topics.locale`, stamped at build.
- **Behaviour.**
  - The map returns `jurisdictional: boolean`: finance, law, tax, medicine and
    driving are jurisdictional; mathematics is not.
  - Only a jurisdictional topic carries `locale` through `withTopicAxes` and a
    `localeNote` into its prompts ("use {country}'s instruments, institutions,
    taxes and currency"). Linear algebra keeps its shared cache row.
- **Done when** the pt-BR finance panel topic names Tesouro/CDI/FGC/IR in
  Consume.

### W2.6 A lens for confessional and contested subjects (R18) · S

- The map may return 2 `lenses`, e.g. _academic historiography_ and _the
  Church's own reading, with its documents_. The learner picks one on the map
  screen; it is stored in `topics.lens` and stamped.
- The lens steers narrative phases (Consume, Feynman rubric, Recall). Provenance
  and Steelman are unchanged in both lenses.
- It is a key axis only when set.

### W2.7 Retrieved primary sources (R13) · M

- **Change.** Provenance and Consume's `cite` name a source plus a locator. The
  server fetches it from an **allow-list** of public-domain corpora (New
  Advent's Fathers, vatican.va, Papal Encyclicals Online, Perseus, Project
  Gutenberg, Yale Avalon). It checks the excerpt against the fetched text
  (normalised fuzzy match ≥ 0.9) before caching.
- **Outcome.** A match renders "Read the full source →". A miss relabels the
  excerpt as a paraphrase, and the link still goes to the document. Nothing is
  fetched from outside the list.

### W2.8 Verified maps for the top topics · M

- **Data.** A `verified` flag on `content_cache` rows; the TTL prune skips them.
- **Workflow.** A script dumps a topic's map and first-node payloads to
  markdown for human review, then marks the rows verified. The UI shows a
  "verified" mark.
- **Start with** the four research topics, then the top 50 by demand.
  Reviewer: open decision 6.

### W2.9 Computed answers — later

For formal and executable topics, verify by running the derivation (Vercel
Sandbox). Only if W2.1 leaves formal topics above target.

---

# Stage II — Fast

## Wave 3 — Never re-teach; ration the heavy phases

The time lever is not faster phases. It is **not re-teaching the known**,
**not running phases the node can't use**, and **ending a phase at its proof**.

### W3.1 Ration the heavy phases by evidence written at build (R9, R7) · M

- **Flags at build.** The map returns three per-node flags:
  - `contested` — a live scholarly or public disagreement exists;
  - `transferable` — applying the node outside its taught framing is
    meaningful;
  - `individual` — the node is a named person, event or document.
- **Rules in `resolvePlan`, applied in this order:**
  1. No Steelman unless `contested`.
  2. No Crucible unless `transferable`; `proofGate` already falls back to the
     last gate.
  3. No Discriminate on an `individual`.
  4. A cap on gates per cell (easy 5 · medium 7 · hard uncapped), trimmed by a
     per-kind priority table beside `PHASE_PLAN`.
  5. Connect is dropped when the node has fewer than two neighbours at build.
- **Both clients.** `resolvePlan` in TS and `Phases.swift`. The three plan
  invariants plus a new one ("no plan exceeds its cell cap") are pinned in
  both test suites.
- **Done when** the panel's phase-minute sums are ≤ 6 h for linear algebra,
  ≤ 10 h for the Early Church and ≤ 3.5 h for personal finance.

### W3.2 Earned skips · S

Generalise the "prove it" challenge from the whole plan to single rungs. A
table `CREDITS: Partial<Record<PhaseId, PhaseId[]>>` lets a clean first-try
pass of a harder phase credit easier unfinished gates before it:

- Feynman clean → Socratic;
- Perform clean → Trace;
- a cold Crucible → everything (unchanged).

It lives in `ledgerAfter` (TS + Swift), with a test per entry.

### W3.3 Consume pretest from the existing checks · M

- **Change.** Each section's `check` is asked **before** the section, in the
  learner's own words by default:
  - **Right:** the section collapses to its takeaway and the post-check is
    waived.
  - **Wrong:** the section opens in full (the pretesting effect), and the check
    is asked again at the end, in own words.
- **Data.** `ConsumeProgress.pretest`, normalised to `{}` on saved rows. No new
  generation.
- **Files.** `ConsumeView.tsx` (lift `SectionCheck` wiring first), iOS
  `ConsumeViewModel.swift`.
- **Done when** a learner who aces the pretest finishes Consume in under a third
  of the median time.

### W3.4 Test-out as the default on known ground · S

When the placement test (`applyDiagnosticLedger`) or a clean pretest says the
learner likely knows a frontier node, the **primary** CTA becomes "Prove it"
(`armChallenge`). A failed cold attempt costs one Crucible and returns to the
ladder. Changes land in `NodeDetail.tsx` and the iOS node sheet.

### W3.5 Early exits everywhere they are honest · S

Discriminate, Predict and Drill have them; Trace and Provenance get them in
W1.6. Recall closes without the report when the first draft retrieves every
row.

### W3.6 An honest pace model · S

- **Now.** Until data exists, `minutesLeft` is the sum of `PHASE_MINUTES` over
  owed gates, scaled by difficulty, never less than that sum. The pace line
  stops under-promising by 50–70%.
- **Later.** `scripts/budgets.mjs` prints per-cell and per-phase medians from
  `phase_seconds` and `phase_attempts`; update `CELL_BUDGET` / `PHASE_MINUTES`
  and the Swift mirrors from it after every wave.

---

## Wave 4 — Durability and one daily rhythm

### W4.1 The last gate is proven on a later day (F1) · M

- **Rule.** A plan's last gate opens only on a later local day than the node's
  first closed phase (read from `phase_closed_at`). Until then it shows "opens
  tomorrow" and the node stays `learning`. A cold test-out (W3.4) is exempt.
- **One function.** `gateOpen(plan, done, closedAt, today)` in
  `calibration.ts` and `Calibration.swift`. `primaryPhase` and the rail read
  it; W0.1's server derivation enforces it.
- **The streak** counts "closed a phase or passed a proof" (open decision 1).
- **Done when** no node in `phase_attempts` goes green on the day its first
  phase closed, except via a challenge.

### W4.2 Mastery fades on the map (F9) · S

A mastered node's fill saturation follows its cards' mean FSRS retrievability.
It is a derived display property, like `frontier`, computed in `useDerived` and
the iOS map and never stored. The node detail says "fading — N cards due".

### W4.3 Answer before you flip (F8) · M

- Recall and apply cards take a typed or spoken answer before the flip.
- A new judge mode, `card`, suggests a grade the learner can override.
- Every (self-grade, judge-grade) pair becomes a calibration sample.
- **Files.** `RetainCard.tsx` (extract the back face first), iOS
  `ReviewViewModel.swift`. FSRS is unchanged; the grade stays the learner's.
- Default: open decision 2.

### W4.4 Drill reps become cards (F11) · S

Correct-but-slow reps (`drillLabored`) become `recall` cards keyed
`${node}-drill-${rep.id}`. FSRS builds the automaticity across days.

### W4.5 Every goal gets a date (R11) · S

The welcome screen shows the date for every goal, with a goal-shaped label
(trip, class, talk, milestone). `topics.exam_date` widens to "the goal's date".
This is a widening, not a new meaning: old rows only set it for exams, so no
migration is needed. `paceStatus` already takes `daysLeft`. Lands in web and
iOS onboarding.

### W4.6 One daily plan across every map (R12) · M

- **Change.** A pure `dailyPlan(topics, profile, now)` in `lib/curriculum`,
  mirrored in Swift. It is computed from bootstrap, which already carries every
  topic's cards and states, so there is no new endpoint. It builds one
  10–20-minute list from:
  - due cards across topics, lowest retrievability first;
  - the next best rung per topic, weighted by deadline urgency
    (`neededPerDay / target`) and a learner pin.
- **Surfaces.** The Dashboard "Today" section and iOS Início show the list.
  Review accepts a cross-topic card list. The streak counts the plan.
- **Done when** a learner with four maps clears the day from one screen.

### W4.7 3–5 minute units (R14) · M

- **Resumable everywhere.** Every phase resumes mid-item; audit that all
  fifteen use `phaseParking`.
- **One rep.** A "one rep" action per topic on the dashboard.
- **iOS widget.** WidgetKit shows the next due card and opens it.

---

# Stage III — Real

## Wave 5 — Target performance: design backwards from the goal

### W5.1 "What will you be able to do, and how will we know?" (R10) · M

- **Change.** One onboarding question with goal-shaped suggestions:
  - "pass the exam on [date], and upload a past exam if you have one";
  - "a 5-minute check-in and dinner conversation in Madrid";
  - "teach the councils to my group";
  - "a budget, no revolving debt, a 3-month reserve".
- **Data.** Stored as `topics.target` (`{ kind: exam | conversation | teach |
behaviour | build, text, date }`) and stamped via `withTopicAxes`.
- **Effect.** The map prompt backward-designs: every node must serve the
  target, and the first node's summary names it.

### W5.2 Mix — which idea applies (F10) · L

- **Signal.** Selection: every phase names its concept, so the learner never
  has to recognise which one a problem needs. Interleaving is one of the
  best-supported accelerators, and it is what exams test.
- **Shape.** Map-level, outside `PHASE_ORDER`. Offered from the daily plan once
  a topic or continent has ≥ 3 mastered nodes, at most every other day.
- **Content.** Kind `mix`, 6–10 problems keyed on the sorted node ids. The
  learner commits which concept applies, then solves it.
- **Write-back.**
  - A wrong pick records "confuses A with B" in misconception memory and marks
    the right node Shaky with a new reason, `mix-confused`.
  - A right pick with a wrong solution reopens that node's proof gate.
- **Why here.** The map final (W5.3) builds on its surface.

### W5.3 The map final (R10) · L

- **Unlock.** When every non-gap node is green, or on demand as "where do I
  stand?".
- **Dispatch by `target.kind`,** each a thin container over existing graders:
  - `exam` → a timed mixed paper: Mix items plus Crucible-style problems, in
    the uploaded exam's format once W10.1 lands;
  - `teach` → a whole-map teach-back judged against a map rubric (Feynman at
    map scale);
  - `conversation` → a W6.2 conversation run; until then, Produce across
    scenarios;
  - `behaviour` / `build` → a mission check-in (W10.2); until then, a written
    plan judged against the map.
- **Outcome.** A first pass marks the map "ready"; a second pass ≥ 7 days later
  marks it **Proven**. Failures attach gaps to the nodes that failed
  (`attachGap`).
- **Order.** Ship `exam` and `teach` first (open decision 3).

### W5.4 Proven — a credential that means something · S

A shareable page: every node passed after a delay, plus the final passed twice,
a week apart, with dates.

### W5.5 Exam simulator and score prediction · M

- **Prediction.** Per-node accuracy from Mix and the final × the exam's weights
  (from the upload, else uniform) gives a predicted score.
- **Allocation.** The daily plan (W4.6) orders nodes by expected score gain per
  minute: the Exam goal's own Pareto.

**Stage gate:** the flow review (M.3) re-runs all four learners. Ana's "green
but can't do the exam" exit must be gone.

---

# Stage IV — Fit

Six tracks. After Wave 5 they can run in parallel. The recommended order
follows the flows the product most wants to win (open decision 9).

## Wave 6 — Languages: hear it, say it, converse

### W6.1 Listen — receptive processing at speed (R2) · L — _new phase_

- **Signal.** Understanding native-speed speech: no phase extracts it.
- **Home.** `performative`, before Produce.
- **Content.** 6–10 target-voice clips (W1.1) at 0.9–1.2×, in two accents where
  the variant allows. Each is followed by a comprehension question in the
  learner's language (open answer, judged), or by a dictation of a number,
  time or price (`checkNumeric` / `checkText`).
- **Gate.** Two thirds right, and numbers-at-speed right. Replays are reported,
  and more than two replays count as a miss.
- **Build** with the new-phase checklist (Wave 11).

### W6.2 Produce becomes a conversation (R17) · L

- **Change.** Each turn carries the partner's line: target language, spoken by
  TTS, and it must be understood to answer. One **unscripted twist** per scene
  is generated live from what the learner said: dictation → judge → partner
  line → TTS. That is turn-based on existing infrastructure; realtime voice is
  open decision 4.
- **Verdicts.** `good | thin | wrong` stay, plus `repaired` when a repair
  strategy was used well.
- **Shape change** → `VERSION` bump for `produce` rows.

### W6.3 A chunk bank per language node (R17, R19) · M

- Performative nodes carry `chunks[]`: 50–150 frequency-ranked phrases in the
  target variant, generated once and cached shared.
- Chunks become **audio cards**: the meaning in the learner's language on the
  front, answered **aloud** in the target (W1.1 dictation, `checkText`
  normalised), with the TTS answer on the back.
- FSRS carries the volume, and the cards flow into the daily plan.

### W6.4 Language Drill: say it, no cognates · S

Performative Drill is answered by voice. The generator excludes cognates shared
with the learner's language and drills chunks, not infinitives.

### W6.5 Contrastive maps · S

Performative map prompts get the learner's language, and must include a
false-friends node and repair and listening emphasis. The W0.3 panel checks it.

## Wave 7 — Math and formal subjects

### W7.1 Math rendering (R3) · M

- **Web.** `lib/rich.ts` gains a `math` token (`$…$`, `$$…$$`), rendered as
  **native MathML** via a LaTeX→MathML converter (`temml`; Safari and Chrome
  render MathML Core natively; the dependency is justified by the math the
  exam uses). `spokenText()` skips math the way it skips fences.
- **iOS.** SwiftMath, or a WKWebView for math blocks (open decision 5).
- **Prompts.** Formal-domain prompts ask for LaTeX on matrices and equations.
  The payload shape is unchanged (strings), so old rows stay valid.

### W7.2 Math input · M

`OpenAnswer` on formal nodes gains a matrix grid and a LaTeX-lite field with a
live preview. The judge receives LaTeX.

### W7.3 Photograph your work · M

- Camera or upload in Perform, Crucible and the final on formal nodes.
- A vision-capable judge role (`OPENROUTER_VISION_MODEL`) grades the page.
- The image lives only for the judge call and is not stored.
- On iOS, the camera goes through PhotosUI.

### W7.4 An interactive figure for formal nodes · L

A new figure kind, `transform2d { matrix }`: drag the basis vectors and watch
the grid, the determinant as area, and the eigen-directions. It is drawn on
canvas, with no dependency. The validator accepts both figure kinds, so there
is no `VERSION` bump.

### W7.5 Prove — construct a derivation · L — _new phase_

- **Signal.** Building a proof, which no phase asks for even though `formal`
  means "derivation from stated rules".
- **Content.** A statement, a hidden skeleton with load-bearing steps, and the
  common invalid moves.
- **Gate.** Perform-style: no invalid step, and every load-bearing step
  present.
- **Home.** `add` in `formal` for core `principle`/`concept` nodes of medium or
  hard difficulty.

## Wave 8 — Audio-first and on the move (R14)

### W8.1 Hands-free session · L

- **What it chains.** Read-aloud Consume sections, then the section check asked
  aloud and answered by voice, then voice-answerable due cards (W4.3 `card`
  judge).
- **Web.** Media Session API for controls.
- **iOS.** Background audio, `MPNowPlayingInfoCenter`, and
  `MPRemoteCommandCenter`. CarPlay comes later.

### W8.2 Call-and-response language audio · M

A Pimsleur-style anticipation pause over the chunk bank (W6.3): the meaning, a
pause, the learner speaks, then the model answer. The pause _is_ retrieval.

### W8.3 Narrated episodes · S

On timeline maps (W9), Consume is written as one continuous narration built for
listening.

## Wave 9 — The topic's own shape

### W9.1 A topic `shape` axis (R8) · M

- **Values.** The map returns `shape: hierarchy | timeline | scenarios | plan`,
  stored on `topics.shape` and stamped.
- **Effect.** The canvas and frontier ordering read it. Default `hierarchy`, so
  existing maps are unchanged.
- **The metaphor extends:**
  - a timeline is a voyage route along a coast;
  - scenarios are the cities of an itinerary;
  - a plan is a route with decision points.

### W9.2 Timeline maps and the `episode` kind (R7, R8) · L

- **Dates.** Timeline nodes carry `when` (a year or range). The canvas lays them
  out by time, in thematic lanes. Prerequisites become causal or conceptual
  only, so eras open in parallel.
- **The kind.** New `episode` kind with the ladder Consume (a story) →
  Chronicle → Provenance → Steelman (if `contested`) → Recall.
- **Build.** `NODE_KINDS`, `KIND_RULE`, `PHASE_PLAN`, the iOS enum, `kindNote`
  and the invariants.

### W9.3 Chronicle — chronology and causation · L — _new phase_

- **Content.** 5–8 episodes from the era: place them in order (`checkOrder`
  exists), then link neighbours with "led to / because", judged.
- **Gate.** The order is near-correct (at most one adjacent swap), and two
  thirds of the causal links are valid.

### W9.4 Scenario maps for languages · M

Nodes are stops on the itinerary (arrival → lodging → food → transport →
problems), each with its chunk bank. Same states, same ledger.

### W9.5 Plan maps for life domains (R16) · M

Nodes are decisions in the order life presents them: cash flow → debts →
reserve → protection → investing. Each carries missions (W10.2).

## Wave 10 — The learner's own world

### W10.1 Bring your material (R15) · L

- **Uploads.** PDFs, slides, photographed problem sets and past exams are
  stored per topic (Supabase Storage, owner RLS) and chunked on upload.
  `unpdf` and `/api/extract` already exist.
- **Grounding.** Retrieval at generation time:
  - Consume cites the learner's own page numbers;
  - Perform and Crucible cases come from the learner's problem sets;
  - the exam target (W5.1) takes the past exam's format.
- **Cache.** Payloads are keyed by the upload's content hash, so two learners
  with the same PDF share rows and no per-learner prompt forks the common row.

### W10.2 Your numbers and missions (R16) · M

- **Your numbers.** An optional private worksheet on plan-shaped topics
  (income, fixed costs, debts and their rates), never bank credentials. Stored
  in the topic row under RLS (open decision 8). Perform uses these numbers
  instead of a stranger's.
- **Missions.** Real-world tasks per node: _list your debts by effective annual
  cost_, _order dinner in Spanish_, _do problem set 4_. Each is debriefed with
  the `craft` Perform debrief.
- **Framing.** Education, never a recommendation: a prompt rule plus fixed copy.

### W10.3 Teach for real · S–M

- Export a Feynman explanation or a map summary as a one-page lesson the learner
  authored.
- Share a continent read-only with a study partner, who sees the other's
  frontier.

### W10.4 A weekly learning letter · S

Minutes by node, where calibration was off, which phase paid, and one
suggestion. Sent through the existing reminder channel.

## Wave 11 — New phases

**The new-phase checklist** (both clients):

- **Catalogue:**
  - `PHASE_ORDER` position, `PHASE_DEFS` (label + signal);
  - `PHASE_SKIP_NUDGE` + pt table, `PHASE_MINUTES` (TS + Swift);
  - homes in `PHASE_PLAN` / `DOMAIN_PLAN` / `USE_RUNGS`, and `CREDITS` (W3.2).
- **Engine:**
  - reducer and gate in `lib/curriculum/<p>.ts`;
  - generator and validator in `lib/server/generate/<p>.ts`;
  - `job.ts` kind and shape, plus a typed fixture.
- **Surfaces:**
  - `use<P>.ts`, a `phaseParking` slot, and `<P>View.tsx` over `PhaseShell`;
  - iOS `Phase` case, model, view model, view and xcstrings.
- **Tests:** plan invariants, gate clauses, `i18nCoverage`, an e2e progression
  spec, `PhaseGateTests.swift`, W2.1 verification if it has closed items.
- **Docs:** the `AGENTS.md` catalogue line.

Listen (W6.1), Prove (W7.5) and Chronicle (W9.3) follow this checklist inside
their own waves.

### W11.1 Audit — error detection · L

- **Content.** 3–4 worked solutions, exactly one without a flaw. Flaws are
  seeded from `recurringMisconceptions`, which makes the payload per learner
  (keyed like `passage`).
- **Session.** Commit a step (or "no error"), then say what is wrong (judge
  mode `audit`).
- **Gate.** Two thirds found **with the right reason**; at most one
  over-suspicion.
- **Home.** After `perform` in `procedure` and `principle` plans, and `add` in
  `formal` and `executable`. Proofs pair with W7.5.

### W11.2 Tutor — fix someone else's misconception · L

- **Content.** An AI student confidently holds a specific wrong model, seeded
  from the learner's recorded misconceptions.
- **Session.** A dialogue, judged per turn (mode `tutor`).
- **Gate.** Convinced within 5 turns, with the misconception named.
- **Home.** After `feynman`, only on **core-hard** `concept`/`principle` nodes,
  via `resolvePlan`'s difficulty rule.

### W11.3 Diagnose — reason back from evidence · L

- **Content.** A presentation, 6–8 evidence requests with costs, and 4 causes.
  Spend a budget, commit a cause, justify it.
- **Gate.** The right cause, plus a justification citing discriminating
  evidence.
- **Home.** `add` in `empirical` and `executable`.

### W11.4 Discriminate's generative close · S (not a phase)

The learner writes their own instance and near-miss, and the judge rules. Same
signal, so it stays inside Discriminate.

### W11.5 Candidates, decided by data

- **Estimate** (magnitude): only if Predict's qualitative setups pass learners
  who can't size an effect. Otherwise add numeric setups to Predict.
- **Capstone:** subsumed by W5.3 `build` targets unless the data says otherwise.

---

# Continuous — Measure, review the flows, tune

### M.1 The 7-day probe · M (after W4.3)

When a node's last gate closes, schedule one fresh open question for day 7,
judged by the `card` mode and tagged with plan, cell and attempts. This is the
Durability metric.

### M.2 Phase effectiveness · S

A SQL view: for each phase × kind × domain, the probe pass-rate of nodes that
ran the phase against those that skipped it (test-out, earned skip, early exit,
a rationed plan), beside the median minutes. A phase that costs time and moves
no probe is a candidate to cut from a plan.

### M.3 The flow review · S per stage gate

Re-run the four research learners through the W0.3 panel and one dogfood
session each, then update the exit-point checklist below. The research method
was generators called directly through a scratch vitest config (no cache, no
DB), and that is what the panel does.

### M.4 Stay · S

Week-2 and week-4 activity per map from `phase_attempts`, cut by domain and
shape. With few learners, read it as direction.

### M.5 After every wave

Run `scripts/budgets.mjs` (W3.6), the panel (W0.3) and the view (M.2), and
record the five north-star numbers under "Baselines".

---

## Flow exit points — what each stage must remove

| Learner                     | Exit point (from the research)                            | Removed by      |
| --------------------------- | --------------------------------------------------------- | --------------- |
| **Ana** — linear algebra    | "Ten steps for vectors I already know"                    | W3.1 W3.2 W3.4  |
|                             | "Where's the matrix? Where's the picture?"                | W7.1 W7.4       |
|                             | "This is ninth-grade algebra, not row reduction"          | W2.4            |
|                             | "Green, but I couldn't do exam question 3"                | W5.2 W5.3 W5.5  |
|                             | "I work on paper and type an essay"                       | W7.2 W7.3       |
|                             | "My problem sets are what count"                          | W10.1           |
| **Rafael** — Spanish        | "It says I said something I didn't" (pt-BR recognizer)    | **W1.1**        |
|                             | "I need to hear it" / "what _they_ say back"              | W6.1 W6.2       |
|                             | "Too easy — cognates, tapping"                            | W6.4 W6.3       |
|                             | "I study on a bus"                                        | W8.1 W8.2 W4.7  |
|                             | No trip date, no destination                              | W4.5 W1.1       |
| **Teresa** — Church history | "A quiz about who's who"                                  | W3.1 W9.2       |
|                             | "Is the key wrong?"                                       | W2.1 W2.7       |
|                             | "Examined on a dissertation I didn't read" (13 Steelmans) | W3.1            |
|                             | "45 hours of worksheets"; no chronology                   | W3.1 W9.2 W9.3  |
|                             | "I listen while driving"                                  | W8.1 W8.3       |
|                             | Lens and trust                                            | W2.6 W2.7 W2.8  |
| **Bruno** — finance         | Random ladders (budget-as-code)                           | W2.3 W3.1       |
|                             | "Where's Tesouro, CDI, the FGC?"                          | W2.5            |
|                             | "It's someone else's budget"                              | W10.2           |
|                             | Behaviour never changes                                   | W9.5 W10.2 W5.3 |

---

## Traceability

**Findings → items**

| Finding | Items     | Finding | Items          |
| ------- | --------- | ------- | -------------- |
| F1      | W4.1      | R5      | W2.3           |
| F2      | W1.2      | R6      | W2.5           |
| F3 F4   | W1.3      | R7      | W3.1 W9.2      |
| F5      | W1.4      | R8      | W2.3 W9.1 W9.2 |
| F6      | W1.5      | R9      | W3.1 W3.2 W3.6 |
| F7      | W2.1 W2.9 | R10     | W5.1 W5.3 W5.4 |
| F8      | W4.3      | R11     | W4.5           |
| F9      | W4.2      | R12     | W4.6           |
| F10     | W5.2      | R13     | W2.1 W2.7      |
| F11     | W4.4      | R14     | W4.7 W8        |
| F12     | W1.1      | R15     | W10.1          |
| F13     | W0.1      | R16     | W9.5 W10.2     |
| R1      | W1.1      | R17     | W6.2 W6.3 W6.4 |
| R2      | W6.1      | R18     | W2.6           |
| R3      | W7.1–W7.4 | R19     | W2.3 W6.5      |
| R4      | W2.4      |         |                |

**Research ideas (#) → items.** All 29 are placed.

| #   | Item      | #   | Item      | #   | Item       |
| --- | --------- | --- | --------- | --- | ---------- |
| 1   | W5.1      | 11  | W8.1–8.3  | 21  | W3.2       |
| 2   | W4.5      | 12  | W7.1–7.4  | 22  | W4.6       |
| 3   | W5.3      | 13  | W7.5      | 23  | W5.5       |
| 4   | W9.1      | 14  | W4.7      | 24  | W1 W2.1 W4 |
| 5   | W9.2 W9.3 | 15  | W10.1     | 25  | W5.2 W11.1 |
| 6   | W3.1      | 16  | W2.7      | 26  | W2.8       |
| 7   | W6.3      | 17  | W2.5      | 27  | W5.4       |
| 8   | W1.1      | 18  | W10.2     | 28  | W10.3      |
| 9   | W6.1      | 19  | W2.6      | 29  | W10.4      |
| 10  | W6.2      | 20  | W3.3 W3.4 |     |            |

---

## Deliberately skipped

- **A new mastery state** ("provisional", "fading", "proven" as a node state).
  The vocabulary is fixed: W4.1 uses `learning`, W4.2 is a display property,
  and Proven is a _map_ credential.
- **A shared phase engine** for the new phases. Rejected three times, for good
  reason.
- **Server-side gates for every phase.** W0.1 moves ledger → state, which is
  where drift hurts; moving fifteen reducers would cost more than it protects.
- **Per-domain model routing,** unless W0.3 proves one model can't serve every
  domain.
- **Leagues, feeds, a tutor marketplace.** Social is limited to W10.3 until
  learners exist to be social with.
- **Spend ceilings.** Verification adds one cached call per payload, and
  `generation_log` is enough to watch it.

## Open decisions

1. **Streak (W4.1).** Does "closed a phase" light the day, or only "passed a
   proof / cleared the plan"? _Recommend: closed a phase._
2. **Answer before flip (W4.3).** On for everyone, or opt-in? _Recommend: on,
   with a Settings toggle._
3. **First target kinds for the final (W5.3).** _Recommend: `exam` and `teach`;
   the others arrive with W6 and W10._
4. **Conversation (W6.2).** Turn-based on existing infrastructure, or a
   realtime voice model? _Recommend: turn-based first; measure latency; then
   decide._
5. **Math (W7.1).** `temml` + native MathML vs. KaTeX on web; SwiftMath vs.
   WKWebView on iOS. _Recommend: temml + MathML; SwiftMath._
6. **Verified maps (W2.8).** Who reviews, and how many topics before launch?
7. **Lens copy and default (W2.6).** _Recommend: no default; ask once, when
   the map offers lenses._
8. **"Your numbers" (W10.2).** Server under RLS, or device only?
9. **Stage IV order.** Languages (W6/W8) or math (W7) first? It depends on which
   learners Atlas most wants to win. _Recommend: W6 first, because W1.1
   already paid its entry cost._

## Baselines

_Filled by W0.3 and M.5 after each wave: disputed-key rate per domain, tag
spread, chain count, phase-minute hours per panel map, the five north-star
numbers._

### 2026-09-30 — W0.3 baseline (before Wave 1–2 content changes)

Model `openai/gpt-5.6-luna` for content and verify; two core nodes per map;
`scratch/eval/panel-2026-09-30.json`.

- **Disputed keys:** 9 / 329 overall (2.7%). By domain: formal 0/71,
  executable 0/67, empirical 2/49 (predict 1/20, discriminate 1/10),
  **interpretive 7/31 (23%)** (discriminate 3/11, provenance 4/15),
  performative 0/60, craft 0/24, general 0/27.
- **Tags:** no map spanned more than two domains; _Finanças pessoais_ came
  back `general` with no jurisdiction.
- **Shape:** one chain — _The French Revolution_, 23 nodes of width 1, all
  `concept`. _Igreja Antiga_ returned the scope offer instead of a map.
- **Phase-minute hours vs. pace model:** linear algebra 9.1 / 6.5,
  probabilidade 13.2 / 8.0, git 9.4 / 5.2, python 8.6 / 6.5, cardio 9.1 / 7.2,
  clima 10.4 / 6.5, French Revolution 20.8 / 13.0, espanhol 3.8 / 4.0,
  italiano 3.8 / 4.0, finanças 4.2 / 2.8, sourdough 3.9 / 3.3.
- **Locale and notation:** 0 Brazilian instruments in _Finanças pessoais_
  Consume; no LaTeX on either formal map.

### 2026-09-30 — Stage I gate (after W0–W2)

Same panel and models; `scratch/eval/panel-2026-09-30.json`. Disputed keys are
measured on raw generations — the W2.1 verifier drops the confident disputes
before anything is cached.

- **Disputed keys (raw):** 7 / 328 (2.1%). Interpretive **3 / 30** (from
  7 / 31): provenance 3/15, discriminate 0/11. Everywhere else ≤ 1 item.
- **Tags:** every map carries its header; nodes inherit the topic domain
  (only _Python para análise de dados_ keeps a stated second domain).
- **Shape:** _The French Revolution_ is no longer a chain (width 2, `timeline`,
  two lenses offered). _Sourdough baking_ reads as a chain by design (a craft
  map is its build sequence). _Igreja Antiga_ still returns the scope offer.
- **Axes:** Spanish and Italian carry `es-ES` / `it-IT` and `scenarios`;
  _Finanças pessoais_ is `jurisdictional` and `plan`; a direct probe of its
  Consume with `locale: BR` names Tesouro, Selic, CDI, CDB, FGC and Imposto de
  Renda (the panel's two probe nodes were budgeting nodes and named none).
- **Still open:** no LaTeX on formal maps (W7.1); phase-minute hours still
  exceed the pace model (this run predates W3.1's rationing).
- **W2.2 (model per role):** one model (`openai/gpt-5.6-luna`) serves every
  domain at ≤ 2.1% raw disputes, and the verifier removes the rest, so
  per-domain routing stays skipped and `OPENROUTER_VERIFY_MODEL` defaults to
  the judge model.
