# One flow: Consume → Explain → Perform → Retain → Mock Exam

## Context

Atlas runs two flows today:

- **Mastery:** goals, a placement diagnostic, 16 phases chosen by kind × domain × cell, overnight holds, gaps, the Feed and continents.
- **"Só quero saber":** a 1–3 concept map. Every node runs Consume → Explain → Perform → Retain (`GLANCE_PLAN`), and there is no test.

The pivot keeps **only** the short ladder and makes it excellent. What you decided:

- **No mode picker.** The welcome screen is the topic box plus "Começar". Nothing is called "Só quero saber" any more, because there is no choice left to name.
- **A map has 1–4 concepts.** A broad topic gets "this is big — pick a part", with suggested sub-topics, plus a **"Só ir / Just go"** button that squeezes it to the essential 4.
- **Each concept has 1–3 levels.**
  - Level I is required. II and III are optional upgrades of the same city.
  - Upgrading grows the city's relief: lowland → hills → mountains, reusing `components/map/Relief.tsx`.
  - A level is never a new dot.
- **Every level runs the same four phases.** A **Mock Exam** closes each map.
- **Each concept-level gets its own generated "spine"** (§2), which every phase builds on.
- **Old mastery maps are dropped.** The exact rows are confirmed first.
- **Web first.** iOS gets its own parity wave later.

### What reading today's code turned up

1. **Perform is written only for procedures.** Its prompt is "an EXECUTION pass for the procedure X", but the quick ladder runs it on facts, concepts and principles too, and no `kindNote` row exists for Perform.
2. **Explain is written for a Feynman phase that won't exist.** Its prompt says "Later they will explain… from a blank page", and it reads nothing the learner saw: it gets only `nodeParams`.
3. **Retain cards come only from the reading** (Consume takeaways plus the text, and only on web).
   - Explain's misconception and the learner's Perform misses never become cards.
   - The thorough deck prompt hard-codes electrical-circuit examples (`generate/retain.ts:253`).
4. **The exam has no learner signal and writes nothing back.** It sees ids and labels only. It is already offered on glance maps (`MapInvite`, `AtlasApp.tsx:644`), even though the welcome screen promises "sem teste".
5. **The hand-off breaks after Perform.**
   - Perform returns to the map (`usePerform.ts:196`) instead of handing on to Retain.
   - The "Keep it" button stays primary for days, until `reviewed` flips after the 7-day rule (`NodeDetail.tsx:236`).
   - Explain always passes (`explainPassed = session.done`).
6. **Warming has known holes.**
   - The server warm is off for glance because it raced the client warm (c7f2ee9).
   - Perform can be warmed before its lesson lands in `node_content`, which keys a case with no lesson behind it.
   - A Consume warm is a non-streamed prefetch, so a click that joins it never streams.
7. **Nothing picks the cases.** Each phase invents its own examples from the label, so the "most-used case" and the "edge case" differ from phase to phase.
8. **The docs point at a deleted file.** `docs/SPEC.md` was removed in b3ab020, but `CLAUDE.md` and `AGENTS.md` still point to it.

---

## 1. The flow the learner walks

```
Welcome ─ topic box (+ outline/photo upload) ─ "Começar"      (no goal, no date, no diagnostic)
   │
   ├─ topic too broad for 4 concepts? → "Isso é grande — escolha uma parte"
   │     3–5 sub-topic offers  ·  "Só ir" (squeeze to the essential 4)
   │
Building ─ map streams 1–4 cities; the server makes each concept's spine as it lands
   │
Map ─ primary CTA "Começar: <concept 1>"
   │
   ├─ each concept (level I):
   │     Consume  ~4–6 min  read; each section's check asked first; right → takeaway only
   │     Explain  ~2 min    5 cards; the listener voices the top misconception; pick/say the reply
   │     Perform  ~5 min    one real case (form depends on kind), Write | Draw, step report;
   │                        fix once or re-run on a harder case
   │     Guardar  ~8–15 min every new card of the concept (≥7 per section, all atoms), answer-first,
   │                        in lesson order; misses re-show in the pass with "rever" to the section
   │     → map: next concept is the primary CTA; "Subir de nível" is the quiet option
   │
   ├─ every level-I concept done → **Prova final** is the primary CTA
   │     results per spine item → each miss = a due card + a "rever" link to the section that taught it
   │     ≥70% presses the wax seal on the map
   │
   ├─ optional "Subir de nível" (II, then III): same four phases on a harder spine;
   │     the relief grows; the exam re-opens to cover it
   │
   └─ later days: Revisão (FSRS due cards across maps); "Retained ✓" after a 7-day gap
```

**Rules:**

- **A concept-level is learned when its Perform passes.** No overnight hold. Retain never gates it.
- **"Já sei isso" (`skipKnown`) stays.** It jumps straight to Perform, and a pass counts as learned.
- **The map is complete when its exam passes.** The exam is a destination, not a lock: levels and the exam never block each other.
- **Status shows separately on a learned concept.** Its card count and due status are shown on their own, and the primary button walks on. This fixes the stuck "Keep it".

---

## 2. The spine — one ranked inventory every phase builds on

It is a new cached kind, `spine`, made once per concept-level. It has its own validator and its own `PROMPT_REV`, and it is stored in `node_content`. It is plumbing _data_, not a shared engine: each phase keeps its own reducer, shape, validator and grader.

```ts
type Spine = {
  ideas: { id: "K1"…; text; why }[];               // 3–6 must-know
  cases: { id: "C1"…; situation; frequency }[];    // 2–4 most-used real situations
  edges: { id: "E1"…; condition; whatChanges }[];  // 2–4 boundaries where the rule bends/fails
  traps: { id: "M1"…; belief; tempting; fix }[];   // 1–3 misconceptions, commonest first
  terms: { term; meaning; notation? }[];           // 0–5, incl. the method/notation names Perform will use
};
```

### How it picks the important things

1. **Over-generate.** The model writes 8–10 candidates per bucket, each stated so a practitioner would recognise it ("where you meet this", "what breaks if you forget it").
2. **Jev ranks them** (`lib/server/decide.ts`). Ranking a fixed set is Jev's job. Example questions: "Which situation does someone using X meet most often?" and "Which boundary, if missed, causes the costliest error?" Keep the top k. Below `SURE`, keep the LLM's own order.
3. **Ground in the learner's material.** An uploaded outline or chapter feeds the candidates, so the spine follows their syllabus.
4. **Levels II and III** receive level I's spine as "already taught — never re-teach". Their cases and edges must be rarer or harder.

### Who makes it

**Only the server.** Map build `after()` creates a spine as each concept frame lands, and a level spawn creates one too. Every phase job stamps it from the server (`withSpine`, the same pattern as `withNodeCell`) and generates it inline if it is missing. A race can make one spine twice — ponytail: one small call, add an in-flight lock if logs show it.

### What each phase takes

| Phase   | Reads                                                        | Must cover                                                                                                                  |
| ------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Consume | whole spine                                                  | every `K`; worked examples = `C1`/`C2`; ≥1 check on an `E`; `M1` refuted where it bites; each section lists `covers: [...]` |
| Explain | `K`, `M1`/`M2`, `E`                                          | the listener voices `M1`; the analogy says where it breaks at an `E`                                                        |
| Perform | `C`, `E`, `terms`                                            | run 1 = `C1`; a re-run = `C2` with an `E` twist; method and notation from `terms`                                           |
| Retain  | the Consume lesson (every atom) + spine ids + learner misses | every atom of every section is carded; a card carries its `spine[]` ids so misses trace back                                |
| Exam    | all spines on the map + weak ids                             | the blueprint in §6                                                                                                         |

**Perform grounds on the spine, not the lesson text.** Today it reads `lessonNote` from `node_content`. Moving to the spine removes the lesson race, so Perform can warm in parallel with Consume. The guard for this is Consume's coverage validator plus the shared `terms`/notation.

---

## 3. Prompt structure, per phase

### 3.0 What the learner has already read: map, continent and their own history

**Today:** `boundaryNote` (`generate/common.ts:226`) passes **labels only**: earlier concepts on the map (`priorLabels`), later ones (`laterLabels`), and the concepts of sibling maps in the continent (`neighbours`, stamped by the server). The model has to guess what those lessons contained.

**Your decisions:**

- the shared lesson plus a personal bridge;
- spine digests;
- one-line recall instead of re-teaching;
- the same terms and notation;
- cross-map cards and exam items;
- broad-topic offers seed a continent.

**Shared part (cacheable, structure-based).** Every earlier concept counts as taught, whether this learner opened it or not.

- **The prior labels become spine digests.** For each earlier concept on the map, and each concept of the sibling maps in the continent, the prompt gets a **digest**: its `K` ideas (one line each) and its `terms` with notation (~300 tokens per concept). `later` stays labels-only, because it is a fence and not material.
- **New rules in `boundaryNote`:**
  - **Never re-teach** a digest idea. When the new lesson leans on one, it writes a one-line recall: "Lembra: <idea>".
  - **Reuse the digest's terms and notation verbatim.** Don't rename a symbol or method between concepts or maps.
- **The server stamps it** (`withDigests`, the same pattern as `withNeighbours`): it reads the ancestors' and continent siblings' spines from `node_content` and adds the digest hash as a cache-key axis. No client carries it (memory: the four places cache-key axes go stale).
- **Order:**
  - Spines are made in parallel from labels.
  - Each **phase** waits for its own spine and the digests before it, and all of them are ready seconds after the map lands.
  - A missing sibling spine (an old map) falls back to its label.

**Personal bridge (per learner, never in the shared cache).** This is a new small kind, `bridge`, stored in `node_content` (which is already per learner) and warmed with the phases.

1. **Jev picks the related concepts.** It chooses, from the concepts _this learner_ has finished on **any** of their maps, the ones genuinely related to this concept. This is a pick-from-set, so it is Jev's job. If none qualifies at or above `SURE`, there is no bridge.
2. **The LLM writes the bridge.** It is 1–3 sentences at the top of Consume, from those concepts' digests, for example: "Você já viu X em <mapa>: isso aqui é…".

**Cross-map cards and exam items.**

- **Contrast cards** (§5) pair this concept with the most confusable concept the learner has learned, in the same map **or the same continent**. Jev picks the pair.
- **The exam** (§6) adds 1–2 integration questions that mix this map's concepts with learned concepts from sibling maps in the continent.

**Continents form from offers.**

- Picking a part from a broad topic's offers creates a continent named after the broad topic, e.g. "Cálculo 1".
- The other offers wait on it as uncharted territories, which reuses today's chart-all model.
- Parts the learner picks later join it.
- "Só ir" builds the essential-4 map on its own.
- Jev's existing auto-placement (`jev.ts:192`) still places other related maps.

**House rules, kept everywhere:**

- Open answer first.
- Second person.
- Both languages.
- Server-shuffled options.
- Every closed key is blind-solved (`verify.ts`).

**`QUICK LOOK` becomes the base register.** Today's note in `topicNote.ts:27` is the default. WS0 hard-codes `quickLook = true` so nothing re-keys early. WS3 deletes the axis in the same change that bumps those kinds' `PROMPT_REV`.

**Consume** (`generate/consume.ts`). Keep: takeaway first, the check as a pretest, labelled worked steps, refutation, streaming, and blind-solved checks.

- Add the spine as the outline.
- `covers` goes on every section, and the validator fails a pass that leaves a `K` uncovered.
- Worked examples come from `C`, and at least one check sits on an `E`.
- The section count comes from |K| × difficulty (`consumeBand`). The importance branches go: every node is "working".

**Explain** (`generate/explain.ts`). Keep the five cards and the listener with named wrong-reply reasons.

- Drop the Feynman line.
- `misconception` = `M1`.
- `checkBack` becomes the bridge into Perform ("before you try it…").
- It now reads the spine, so it is grounded for the first time.

**Perform** (`generate/perform.ts`). Add a **kind-aware task form** (the missing `kindNote` row). The shape stays the same (`task`, `scaffold`, `steps[].mustShow`, `loadBearing`) and so does the judge (`judgePerform`).

| Kind      | Task                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| procedure | execute the steps on `C1` (today's prompt)                                                       |
| concept   | decide whether a case near an `E` is an instance, and justify it against the defining conditions |
| principle | predict what happens in a situation and trace the causal chain                                   |
| fact      | use the fact in a realistic decision (retrieve → apply → check)                                  |

**Retain** — see §5.

**Exam** — see §6. It also gains the pending `GIVENS_NOTE` (`RESEARCH-PROMPTS.md` §6.31).

**Map** (`generate/mapPrompt.ts`, `jev.ts` `sizeMap`).

- The size bounds go from `[1,3]` to `[1,4]`.
- Every concept is "working".
- `deeper` changes from "always []" to 0–2 levels per concept, with a target share and a filled example (memory: optional fields need a target). A `fact` usually gets none.
- **Broad topics:** the `tooBroad` escape returns when the essentials need more than 4 concepts. It offers 3–5 sub-topics.
- A new `essentials` build flag (the "Só ir" choice) says: "pick the 4 concepts a newcomer most needs from the whole topic, never tooBroad". It replaces today's "chart the whole continent" button in `ScopeOffers.tsx`.
- Picking an offer seeds the continent (§3.0). Manual continent grouping from the dashboard stays.

**Tuning loop for every prompt change.**

1. Bump that kind's `PROMPT_REV`.
2. Run the generators directly with the scratchpad vitest config (no cache writes) on the four research personas: linear algebra, Spanish, Church history, finance.
3. Read the validation-fail rate, `verify_dropped`, pretest-collapse, spine coverage, and whether Perform's form matches the kind.

---

## 4. How the phases connect

```
map frame ─► spine (server) ─┬─► consume ─────────┐
                             ├─► explain          │ learner signals, tagged by spine id:
                             ├─► perform          │   consume pretest misses
                             ├─► retain (shared)  │   explain replies tried and wrong
                             └─► exam blueprint ◄─┤   perform step misses
                                                  │   card lapses
retain (personal) ◄───────────────────────────────┘   exam misses ─► due cards + "rever" link
```

- **Signals live in the attempts log.** They go in `phase_attempts` (W0.2), tagged with spine ids. WS0 decides whether that means a new column or the existing detail payload. There is no new table.
- **Hand-offs stay owned by `enterOwedPhase`** (memory: never name a target).
  - Consume → Explain → Perform is unchanged.
  - **New:** a Perform pass hands on to the in-session "Guardar" pass over that concept's cards, then back to the map with the next concept as the primary CTA.
  - A Perform fail stays on Perform: fix once, or re-run on `C2`+`E`.

---

## 5. Cards — remember every atom of the lesson (the heart of the flow)

### What you decided

| Question       | Decision                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage       | **Every atom of Consume.** Each section's takeaway, terms, rules and relations, quantities, worked-example steps, refuted misconception and figure parts.                                                              |
| How many       | **Jev decides per section** how many cards it takes to remember everything in it. **Every section gets at least 7**, and a dense one gets as many as it needs (20, 30…). There is no per-concept quota and no ceiling. |
| When           | **Born once, after Perform.** "Guardar" shows **all** of the concept's new cards right away, then FSRS spaces them. At ≥7 per section, a 3-section concept is ≥21 cards, about 8–15 minutes.                           |
| Answering      | **The answer box is open and focused by default.** "Só virar" is always there, quietly. A typed or spoken answer is judged, and the judge _suggests_ Again/Hard/Good/Easy; the learner confirms.                       |
| Known sections | **Same cards as everything else.** A right pretest today doesn't mean kept.                                                                                                                                            |
| Load           | **Deal everything due**, as today. No new-card cap and no cut.                                                                                                                                                         |
| Retention      | **0.90**, as today.                                                                                                                                                                                                    |
| Formats        | cloze, Q/A, **reversed pairs**, **figure-label**, **step-sequence**, **contrast**                                                                                                                                      |
| Control        | **Make a card from highlighted text.** **Flag a bad card → rewrite.** No edit or delete UI, and no `.apkg` export (CSV/JSON export stays).                                                                             |
| On a miss      | **Inline re-explain plus "rever"**, which opens the exact Consume section. The concept does **not** turn Shaky. There is no auto-rewrite and no sibling follow-up.                                                     |

### Pipeline (per concept-level; the shared deck is cached, keyed on the lesson)

1. **Size.** Jev runs `sizeSection` on each Consume section: "How many distinct things must a learner recall to know everything in this section?"
   - The buckets are 7–9 / 10–14 / 15–20 / 21–30 / 31–40, and Jev's top pick sets the target `n`.
   - The floor is 7: a thin section is carded from more angles (reversed pairs, why, step) rather than with fewer cards.
   - Above 40, the section is split into two card calls.
   - This replaces the per-node `sizeDeck` (`jev.ts:283`).
   - Without Jev, the fallback is max(7, atoms × 1.5).
   - ponytail: the bucket ceiling of 40 is a guess. Raise it if the coverage check finds atoms left uncarded.
2. **Atomize, then card.** There is one call per section, run in parallel.
   - It first lists the section's **atoms**, each with an id (`s2.a3`) and its spine id when there is one.
   - It then writes `n` ±1 cards that together cover every atom, picking each card's format from what the atom is:

   | Atom                                            | Format                                                                                                                                                                                        |
   | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | term / symbol                                   | **reversed pair**: term → meaning **and** meaning → term, as two sibling cards                                                                                                                |
   | relation, rule, quantity, condition             | **cloze** on the load-bearing word or value (never a word common sense fills)                                                                                                                 |
   | "why it is so", or a refuted misconception      | **Q/A** ("Why does…?" / "What's wrong with: <belief>?")                                                                                                                                       |
   | worked-example step                             | **step-sequence**: "In <example>, after <step label>, what comes next — and why?" One per step, built from the section's labelled `example.steps`                                             |
   | a node of the section's `figure`                | **figure-label**: the section's diagram is drawn with that node's label hidden, "what goes here?". The `figure` is structured data rendered by `Figure.tsx`, so no image processing is needed |
   | 2+ concepts learned in the map **or continent** | **contrast**: "X or Y — which applies when…?" Jev picks the most confusable learned partner, and one small call runs when a concept is carded                                                 |

3. **Validate.**
   - The count is within `n` ±1, and every listed atom is covered by at least one card.
   - The `back` is ≤ 25 words (it is the grading key).
   - Each card stands alone: no "as above".
   - Every card carries `section`, `atoms[]`, `spine[]` and `format`.
   - Remove the hard-coded circuit examples (`retain.ts:253`).
4. **Check each card's answer.** Jev blind-checks each card: "Does the front determine one answer?" Ambiguous cards are regenerated once, then dropped and logged.
5. **Personal cards** (per learner, never cached):
   - a Perform step missed → a card on that step's rule;
   - an Explain reply that was tried and wrong → a card on why it fails;
   - an exam miss → a card on that atom;
   - a **card from highlighted text** — the Consume `PassagePanel` and the Perform report get "Fazer cartão", which writes one atomic card in the same formats.

### In review (`RetainCard.tsx`, `useRetain.ts`)

- **The answer box comes first** (`OpenAnswer` plus `MicButton`). The judge's suggestion highlights a grade button, and "Só virar" skips the box.
- **Siblings never meet on the same day.** The two sides of a reversed pair, or two cards on the same atom, are never shown in one session. This is Anki's "bury siblings": the second one moves to the next day.
- **On Again:** the card's `reExplain` (≤ 60 words) shows inline, with a **"rever" deep link** to that section of Consume (`section` id). Nothing on the map changes: today's "miss marks the node Shaky" is removed.
- **"Esse cartão está ruim":** the card is rewritten from a new angle on the same atoms. The old card is retired, its FSRS state is reset for the new one, and the flag is logged so prompt tuning can see it.
- **The "Guardar" pass runs in lesson order** (first encounter). A card answered Again comes back within the same pass (FSRS learning steps), and the pass ends when every new card has been recalled once. After that, the global Revisão queue shuffles across maps.
- **Unchanged:** FSRS (`lib/fsrs.ts`) at retention 0.90, leeches at 8 lapses (a leech offers "rever"), and "Retained ✓" after a 7-day gap.

### Quality loop

**Log per card:** the judge-suggestion vs learner-grade agreement, flags, lapses per format and Jev's ambiguity drops.

**Read on the four personas, per section:**

- the atom count vs Jev's `n`;
- coverage of the spine;
- the share of each format;
- how many cards fail the "front determines one answer" check.

---

## 6. The Mock Exam at the end of each map

**When it is offered:**

- once every level-I concept on the map is learned;
- again after a level upgrade;
- again after 7 days ("prove it held").

**No setup screen.** The size and difficulty pickers go, matching "no mode picker".

- The size is 4 questions per concept-level reached, plus 1–2 integration questions when the map has 2 or more concepts, plus 1–2 that mix in learned concepts from sibling maps when the map sits in a continent.
- At least 6 questions, at most 20.

**Blueprint per concept-level:**

- 1 `K` (understanding);
- 1 `C` (application, with new numbers or surface);
- 1 `E` (boundary);
- 1 `M` (the misconception as the tempting distractor).

A weak spine id takes the slot of a strong one of the same type.

**Item rules, kept as they are:**

- a scenario stem;
- the problem solved in `work` before the key;
- 4 parallel options;
- own words first (`OpenAnswer`);
- a blind-solved key;
- server shuffle;
- one question per stream frame, plus top-up.

**Results:**

- shown per spine item, weakest first;
- **each miss is written back** — its cards lapse, or a personal card is made, and they are due now — with a "rever" link to the section that covers it;
- a pass (≥70%) seals the map.

**Storage:** the paper and its history stay on the device (`lib/examStore.ts`). Only the write-backs go through the card API.

---

## 7. Help tools — extend what exists to every phase

| Tool                                              | Today                          | After                                                                                       |
| ------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| Read-aloud (Speechify `SpeakerButton`)            | Consume + lens view            | + Explain cards, Perform task/report, card back/`reExplain`, exam explanations              |
| Dictation `MicButton`                             | every `OpenAnswer`             | unchanged                                                                                   |
| Ask about this (`passage`)                        | Consume prose                  | + Explain cards, Perform report, card `reExplain`, exam explanation (same kind, new anchor) |
| Figures (`Figure`, `ExampleImage`, Jev `svgPlan`) | Consume examples, Perform case | + Explain analogy, `apply` cards with a visual case                                         |
| Lenses Simpler / Example / Analogy / Go deeper    | Consume sections               | rename "Go deeper" → "Mais detalhe / More detail" so it doesn't collide with levels         |
| Write / Draw (`SketchPad`)                        | Perform                        | unchanged                                                                                   |
| Confidence bet                                    | Consume pretest                | unchanged (the Feed and ink economy are removed)                                            |

**Skipped:** realtime voice conversation and a continuous "listen to the lesson" mode. Add them when read-aloud usage asks for it.

---

## 8. Pre-warming — no phase screen waits on a model after the map paints

**One owner per kind**, which ends the c7f2ee9 race:

- **Server: spines only.** The map build's `after()` makes them, chained per concept frame as it streams. Then:
  - a level spawn makes the level-II spine;
  - a level-I Perform pass pre-makes it, because that is when "Subir de nível" appears.
- **Client: the phases, through the queue** (`lib/warm.ts`).
  - Consume, Explain and Perform for all 1–4 concepts warm in parallel, since they key on the spine and none waits for the lesson. Raise `MAX_CONCURRENT` from 2 to 4.
  - **The shared card deck** reads the lesson, so it warms when the learner finishes Consume. Explain and Perform then give it minutes, and "Guardar" opens on a ready deck. Its key is the lesson's hash, stamped by the server from `node_content` (the `readLesson` pattern).
  - **The Consume warm streams.** Its frames land in the `live*` state, so a click that joins an in-flight warm paints whatever is already there. This fixes "a joined warm never streams".
  - **The exam paper** starts streaming in the background when the map's last level-I Perform passes. It is resumable, as today.
  - **Personal cards** are drafted at the end of Perform, during "Guardar".

**Cache-key axes** are stamped by the server: concept, level, language and the spine hash. The memory note on cache keys lists four places that go stale silently; server-stamping avoids all four.

---

## 9. What gets removed (web)

About 14.4k web lines go, out of about 21.6k across both clients.

**Onboarding:**

- `MasteryDetails.tsx`, `DiagnosticPanel.tsx` and `DiagnosticAnswers.tsx`.
- The mastery and diagnostic parts of `useOnboarding.ts` (105–137, 233–310, 368–481).
- `lib/curriculum/diagnostic.ts` and `generate/diagnosticQuestion.ts`.
- The `ModeCard`s and mastery strings in `WelcomeScreen.tsx`.
- The goal rows in `goalDate.ts`.
- The **second goal picker in `SettingsScreen.tsx:259`**, which today can turn the overnight holds back on.

**Twelve phases:** Discriminate, Provenance, Socratic, Steelman, Predict, Trace, Feynman, Drill, Produce, Connect, Crucible and Recall. For each, its reducer, generator (and judge), hook, view and copy go, along with:

- `useDomainPhases`/`useDomainPhaseCaches`;
- the Socratic and Connect blocks inline in `useSpiral.ts`;
- their branches in `useGeneration`, `useSessionState`, `useRunState`, `PhaseSheets`, `job.ts`, `api.ts`, `judge.ts`, `apiJudge.ts` and `toastCopy.ts`.

**Mastery systems:**

- Gaps: `spawnGap`/`openGapIds`/`removeNode`, and gap entry through Socratic.
- `heldGate`/`holdFrom` (keep `earnsRetained`).
- The `GOAL_CELLS` rows except one, `appliedRung` and `rationing.ts`.
- The Feed and ink: `feed.ts`, `useFeed.ts`, `FeedView.tsx`.
- `paceStatus` and the exam date.
- The Socratic, Feynman and Crucible parking mirrors (keep Perform's).
- `startCurriculumWarm`.
- `goals()`.

**Plans:** `PHASE_PLAN`, `resolvePlan`, `withGoalPlan`, `DOMAIN_PLAN`, `GATE_PRIORITY` and `USE_RUNGS` go. One `LADDER` constant replaces them. **`spawnDepth` stamps `LADDER`**, because today it calls `resolvePlan` and a level would get a removed rung.

**Kept:**

- `displayStates`, `nextStopOf`, `frontierTarget`;
- streak and adherence, `dailyPlan`;
- calibration (Retain's confidence tap);
- `skipKnown`;
- manual continents;
- FSRS.

**Data:**

- A migration deletes topics whose `goal <> 'glance'` (cascade).
- The row count is confirmed with SQL through the Supabase MCP first, one SELECT per call.
- `topics.goal` defaults to `'glance'`.
- Old rows of removed kinds age out of `content_cache` on the TTL prune.

**Tests:**

- The `PHASE_PLAN` invariants in `tests/curriculum.test.ts` are rewritten around `LADDER`.
- The removed phases' unit and e2e specs are deleted.
- **`tests/e2e/helpers.ts` `runOnboarding`** is rewritten. It clicks `action-mode-mastery` today, so every e2e spec depends on it.

**Docs:**

- `docs/PLAN-FLOW.md` (this design) becomes the roadmap, and `PLAN-LEARNING.md` is marked superseded.
- `AGENTS.md`: the phase catalogue is rewritten to four phases plus the spine.
- The `SPEC.md` pointers in `CLAUDE.md` and `AGENTS.md` are removed.

**iOS meanwhile:**

- The server ignores the goal a client sends and always builds the single flow.
- Payload changes stay additive (`covers`, new card sources), so today's iOS still decodes them.
- A small iOS change hides the "Domínio" card, so nobody hits the removed placement kind.

---

## Status — Stage A (2026-11-27, branch `pivot/one-flow`)

Landed (web):

- One `LADDER` (`lib/curriculum/phases.ts`); `GoalKind` is only `"glance"`; the
  server writes `topics.goal = 'glance'` whatever a client sends and stamps
  `quickLook` on every topic (so no row re-keys before WS3).
- Welcome is the topic box + "Começar"; Settings has no goal or date; no
  placement; no Feed/ink; no gaps; no overnight hold; no pace countdown.
- The 12 phases are deleted (reducers, generators, judges, hooks, views,
  fixtures, tests). Retain's card grader (`judgeRecall`) moved to
  `generate/judgeRecall.ts`.
- A passed Perform hands on to Review ("Guardar") and lights the day; a learned
  concept's primary button walks on. A missed card no longer turns its concept
  Shaky.
- Contracts: `lib/curriculum/spine.ts` (`Spine`, `CardTrace`, `CardFormat`,
  `SpineSignal`); `ReviewCard` and `StoredCard` extend `CardTrace`.
- Migrations written, **not applied**: `20261128000000_card_trace.sql` (card
  columns), `20261128000100_one_flow.sql` (drops the one mastery topic — "Europa
  medieval", 34 nodes, 0 started, 0 cards — and defaults `goal` to `glance`).
- iOS: the "Domínio" card is gone from the welcome screen (AtlasKit builds for
  the simulator).

Moved to later workstreams (deliberately not stubbed in Stage A):

- The `spine` **kind** registers with its generator in WS2 (a kind with no
  generator would be dead code); the types above are the contract.
- Card trace columns are written/read by the card store in WS4a/4b.
- `paceStatus`, `daysUntil`, the gap helpers in `replan.ts`, `spacing.ts`'s
  hold helpers and the `shaky` state are now unused or near-unused; WS1-cleanup
  can delete them once WS4b confirms Retain does not need `shaky` for display.

## 10. Workstreams (multi-agent)

**Stage A — make room** (one agent, serial, lands first): **WS0 + WS1**

- `LADDER`, and the server forcing a single flow.
- Welcome without a picker, Settings without a goal picker.
- Delete the 12 phases and the mastery systems.
- Fix the Perform → "Guardar" hand-off and the learned-node CTA.
- Register the `spine` kind with a fixture and the `Spine`/signal types (the contract), and declare the retain/exam input fields.
- Extend the card contract with `section`, `atoms[]`, `spine[]`, `format` (`cloze | qa | reversed | figure | step | contrast`) and `siblingOf`. Add the matching columns on `cards`, one migration.
- Remove the "card miss → node Shaky" write. Retire the `shaky` and `gap` states if nothing else still writes them.
- The drop migration (after confirming the rows).
- Docs, the e2e helper, `size-budget.json` lowered.
- The iOS card hidden.

**Stage B — parallel** (5 agents, disjoint files; 4a and 4b agree the card fields in Stage A's contract):

| WS  | Scope                                                                                                                                                                                                                                                                                                   | Main files                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | Spine generator + Jev ranking; map 1–4; levels always asked; broad-topic offers + "Só ir"; offers seed a continent                                                                                                                                                                                      | `generate/spine.ts` (new), `jev.ts`, `mapPrompt.ts`, `map.ts`, `ScopeOffers.tsx`, the build path in `useOnboarding.ts`, `useContinents.ts`                       |
| 4a  | **Card generation (server):** Jev `sizeSection`, the atomize → card call per section, the formats, validators, the Jev ambiguity check, the contrast call, personal-card drafting, highlight → card, flag → rewrite                                                                                     | `generate/retain.ts`, `jev.ts` (`sizeSection`), `verify.ts`, `job.ts` retain inputs, `cardSources.ts`                                                            |
| 4b  | **Card experience (client):** answer box first with "Só virar", the four new card renderers (reversed / figure-label / step / contrast), sibling burying, Again → reExplain + "rever" deep link (no Shaky), "Esse cartão está ruim", the "Guardar" pass after Perform, "Fazer cartão" in `PassagePanel` | `RetainCard.tsx`, `RetainView.tsx`, `useRetain.ts`, `useRetainDraft.ts`, `retainDraft.ts`, `lib/curriculum/retain.ts`, `lib/fsrs.ts`, `consume/PassagePanel.tsx` |
| 5   | Exam: blueprint, no setup, write-back, re-offers                                                                                                                                                                                                                                                        | `generate/exam.ts`, `examJob.ts`, `lib/curriculum/exam.ts`, `useExam.ts`, `ExamView.tsx`, `exam/*`, `MapInvite.tsx`                                              |
| 6   | Levels as relief growth; drop the map pips; "Subir de nível" after Perform; the drawer lists four phases                                                                                                                                                                                                | `depth.ts`, `useDepth.ts`, `DepthLevels.tsx`, `Relief.tsx`, `MapNode.tsx`, `NodeDetail.tsx`                                                                      |

**Stage C** (after WS2): **WS3** — the Consume, Explain and Perform prompts on the spine, Perform's kind forms, and removing the `quickLook` axis with the `PROMPT_REV` bumps. It also covers §3.0: `withDigests` and the digest-based `boundaryNote`, plus the `bridge` kind (Jev picks the related concepts the learner finished, the LLM writes 1–3 sentences) and its slot at the top of Consume. Files: `generate/{consume,explain,perform,common,topicNote,bridge}.ts`, `shapes.ts`, `verify.ts`, `store/continents.ts` (digest read), `job.ts` axes, the Consume header in `ConsumeView.tsx`.

**Stage D — parallel** (2 agents):

- **WS7 help tools** — phase views, `SpeakerButton`, `PassagePanel`, `ExampleImage`, `ModelView`.
- **WS8 pre-warm** — `app/api/generate/route.ts`, `lib/server/afterBuild.ts`, `useWarming.ts`, `lib/warm.ts`.

**Stage E:**

- The flow review: the four personas through the eval, plus one dogfood pass each.
- Then **WS9, iOS parity**, as its own wave.

---

## Verification

- **Every workstream:** from `web/`, run `npm run typecheck && npm run lint && npm test && npm run size && npm run build` and `npm run format:check`.
- **Fixture e2e** (`ATLAS_FIXTURES=1`, `docs/AGENT-TESTING.md`). The new `flow.spec.ts` replaces `glance.spec.ts`:
  1. Welcome, then build (no picker, no diagnostic).
  2. Concept 1 through Consume → Explain → Perform → Guardar.
  3. Concept 2.
  4. "Guardar" deals every new card of the concept, with the answer box first. A miss shows the re-explanation and a "rever" link that opens the right section. Siblings are buried. "Esse cartão está ruim" swaps the card. "Fazer cartão" from a highlight adds one.
  5. The exam: write-backs land as due cards.
  6. "Subir de nível" grows the relief and runs the ladder on level II.
  7. A broad topic shows the offers, and "Só ir" builds 4 concepts.
- **Prompt quality:** scratchpad vitest runs of `spine`, `consume`, `explain`, `perform`, `retain` and `exam` on the four personas. Check:
  - spine coverage by Consume sections;
  - Perform's form matches the kind;
  - the deck covers every atom of every section, and each section's card count sits within Jev's `n` ±1;
  - the exam follows the blueprint;
  - `verify_dropped` stays below 3%.
- **Prod:**
  - Before the drop migration, count the topics by `goal` (SQL through the MCP).
  - After it, confirm that only those rows went.
  - Drive one real map in the signed-in browser pane and check the state invariants with SQL (memory: prod verification).
