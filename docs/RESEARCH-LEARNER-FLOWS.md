# Research — four learners, four topics: where Atlas wins, where they leave

Written 2026-09-29 on `main` @ 0aea4a8. This is the evidence; the plan that
acts on it is `PLAN-LEARNING.md`, where every finding (R1–R19) and idea
(#1–#29) below maps to a plan item. This document asks whether a real learner
would stay long enough to reach mastery, and what would make Atlas the fastest
_deep_ way to learn anything.

## How this was researched

- **The product, read end to end:** onboarding, scope offers, placement,
  the map, all fifteen phase engines and generators, speech, review, and the
  iOS mirror.
- **The product, actually run.** The real generators were called directly (no
  cache or database writes) on the configured content model
  (`openai/gpt-5.6-luna` in `.env.local`; production may run another). Four
  maps, two narrowed maps, and nine phase payloads: Consume, Perform ×2,
  Produce, Drill, Provenance, Steelman, Discriminate, and a second Consume.
  Every quote and number below comes from those outputs.
- **Hours** are the app's own estimates (`PHASE_MINUTES` summed over each
  node's plan) set against its own pace model (`CELL_BUDGET`). They are not
  measured times; production has one topic and no phase finished yet.
- **The alternatives,** checked as of September 2026: ChatGPT Study Mode,
  Gemini Guided Learning, NotebookLM (now Gemini Notebook), Duolingo Max,
  Speak, Ascension's podcasts, 3Blue1Brown and Brilliant. Plus the learning
  science each flow leans on. Sources are at the end.

## What every learner goes through

1. **Welcome.** Topic, goal (`exam` · `project` · `mastery` · `pareto`),
   interests, daily minutes, an exam date (exam goal only), a Pareto share
   (Pareto only), and an optional syllabus upload.
2. **Map build.** Nodes stream in: about 26 s for linear algebra, 39 s for
   Spanish. A topic that is too broad returns 2–3 narrower "territories" in
   about 4 s instead.
3. **Placement.** Five adaptive questions (`mcq`, `compute`, `speak`, `order`).
4. **The map.** The frontier lights up, and a node opens its ladder: 3 to 11
   phases, each 3–10 minutes, fixed when the map was built.
5. **Review.** FSRS cards drafted from Connect and a card factory. Flip, grade
   yourself. One queue per open topic.

---

## Flow A — Linear algebra for an exam

**Ana**, a second-year engineering student. The exam is in five weeks, three
other courses compete for time, and Ana has 30 minutes a day. The course has
problem sets and two past exams.

### What Ana gets

A 14-node map. It asks for **72 gated sessions, about 8.5 h of phase time**,
while the app's own pace model says 5.7 h, so the pace line under-promises by
half. The five core nodes (Vectors, Matrices, Basis & Dimension, Linear
Transformations, Eigenvalues) run **10–11 phases each**. That includes Vectors
at "easy", because the `formal` domain adds Trace, Perform and Drill to a
concept's ladder and difficulty only removes Socratic.

**Missing for an exam:** inverse matrices, change of basis, diagonalization,
Gram–Schmidt / orthogonal matrices, column space and null space as their own
nodes. **Present but wasted on this learner:** "Scalars".

### Session by session

| When   | What happens                                                                                                                                                                                                                                                       | What Ana thinks                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Day 1  | Types the topic, picks Exam, sets the date. Doesn't notice the syllabus upload. Watches the map assemble.                                                                                                                                                          | "Nice — it knows the subject."                                                    |
| Day 1  | Placement: five questions. Gets the easy ones right.                                                                                                                                                                                                               | "Five questions for a whole course?"                                              |
| Day 1  | Opens **Vectors**: 10 rungs. "I already know this" is a secondary action.                                                                                                                                                                                          | "Ten steps for vectors? I did these in high school." **First exit risk.**         |
| Day 3  | Consume on **Eigenvalues**. Three sections; the prose is accurate and names the misconceptions. But there is not one matrix on screen: everything is `T(x,y) = (2x + y, x + 2y)`, because the renderer has no math notation. Figures are box-and-arrow flowcharts. | "My exam writes `det(A − λI)` with brackets. Where's the picture of the stretch?" |
| Day 4  | Perform on **Linear Systems** (the node promises "augmented matrices and row operations"). The generated case: _38 tickets, adults $11, students $7, $318 total_. That's two unknowns, solvable by substitution, with no matrix needed.                            | "This is ninth-grade algebra. The exam is 3×3 with a free variable."              |
| Day 4  | Types the work into a textarea. No math input and no scratchpad; the real work happens on paper, and a summary gets typed.                                                                                                                                         | "I'm writing an essay about a computation."                                       |
| Day 6  | Span and Linear Independence are "working" nodes: Consume + Discriminate + Retain. Ana classifies cases but is never asked to _compute_ independence, which is exactly what the exam asks.                                                                         | "Green, but I couldn't do exam question 3."                                       |
| Week 2 | Opens ChatGPT or Gemini, photographs problem set 4, asks for guided help. Watches 3Blue1Brown for the picture.                                                                                                                                                     | **Leaves.** Comes back only to review, if at all.                                 |

### What "green" means here, and what the exam wants

| Atlas proves                                     | The exam demands                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Explains eigenvectors in words; classifies cases | Computes a 3×3 characteristic polynomial correctly, under time pressure |
| Runs a 2-variable word problem                   | Row-reduces, finds free variables, writes parametric solutions          |
| Transfers one idea into a novel framing          | Picks the right method among many in a mixed paper                      |
| —                                                | Short proofs ("if A is invertible, 0 is not an eigenvalue")             |
| Prose notation                                   | Matrix notation, read and written fluently                              |

**No phase asks for a proof**, even though the `formal` domain is defined as
"derivation from stated rules".

### Why Ana leaves, and where to

- **The problem sets and past exams define what counts.** ChatGPT Study Mode
  and Gemini Guided Learning take a photo or PDF of _that_ material and tutor
  on it. NotebookLM makes quizzes from the lecture slides. Atlas can ground
  the _map_ in a syllabus, but not a single _item_ in the course's material.
- **The picture.** 3Blue1Brown, now with built-in exercises, and Brilliant
  teach the geometry that makes eigenvectors obvious. Atlas's figures can't
  draw a plane.
- **Time.** 8.5 h of fixed ladders on nodes Ana half-knows, against five
  weeks and three other courses.

**What Atlas has that none of them do:** a map of what Ana knows and doesn't,
gap nodes that name the exact missing piece, calibration, spaced review Ana
didn't have to build. That is the reason to stay, _if_ the practice is exam-shaped.

---

## Flow B — Spanish for a trip

**Rafael**, a Brazilian flying to Madrid in six weeks. Rafael commutes 40
minutes by bus each way and uses the app in pt-BR.

### What Rafael gets

"Espanhol para viagem", Pareto 20% → 8 nodes, **34 sessions, about 3.6 h**. The map is
genuinely smart in places:

- It opens with **Pronúncia contrastiva**, where Portuguese habits break
  Spanish (r, j, ll, b/v, vowels).
- It has a **Reparo e confirmação** node: asking for repetition, confirming
  numbers. That is the survival skill most courses forget.

Every node is `procedure` + `performative`, so every ladder is Consume →
Discriminate → Drill → Produce → Recall.

**Missing:** false friends (_embarazada_, _exquisito_, _polvo_, _oficina_…),
the classic pt→es trap. And **listening, anywhere, in any phase.**

**Too big:** "Situações de viagem" is a single node covering transport,
lodging, restaurant, shopping, payments and problems.

### Session by session

| When  | What happens                                                                                                                                                                                                                                                                                          | What Rafael thinks                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Day 1 | No goal fits a trip. Picks Pareto. **No field for the trip date**, because only Exam has one. **No question about the destination.** The content quietly assumes Madrid; for Buenos Aires (voseo, _colectivo_, a different accent) it would be wrong.                                                 | "OK, 80/20 sounds right."                                       |
| Day 1 | Consume: reading _about_ Spanish, in Portuguese. Read-aloud uses one voice "that carries both locales", so the Spanish examples are read without a native Spanish voice.                                                                                                                              | "I need to _hear_ it."                                          |
| Day 2 | Drill: "_Diga em espanhol: precisar_" → tap one of _necesito / necesitar / necesario_. Most reps are cognates a Portuguese speaker guesses (_ir → ir_, _querer → querer_, _poder → poder_). It says "diga" (say) but it's a tap. Words, not chunks.                                                   | "Too easy. Is this teaching me anything?"                       |
| Day 3 | Produce: a real scene (checking in at a Madrid _pousada_, 6 turns, 20–35 s each, well-chosen target forms). Rafael speaks into the mic, **and the recognizer is set to pt-BR** (`speechLang` only knows en-US and pt-BR). The Spanish comes out transcribed as Portuguese, and the judge grades that. | "It says I said something I didn't."                            |
| Day 3 | And even when it works, the receptionist never answers. Six monologues into silence: no follow-up question, nothing to understand at native speed.                                                                                                                                                    | "At the real desk, the hard part is what _they_ say back."      |
| Day 4 | Recall: a blank page, written from memory.                                                                                                                                                                                                                                                            | "I'm not going to _write_ in Madrid."                           |
| Bus   | The app wants a screen and a keyboard. Rafael's study time is 80 min/day on a bus.                                                                                                                                                                                                                    | **Leaves** for Duolingo Max / Speak / ChatGPT voice / Pimsleur. |

### What "green" means here, and what the trip wants

Atlas proves Rafael can recognise words and produce six monologue turns once.
The trip demands:

- understanding a fast, unpredicted reply;
- hearing prices, times and gate numbers at speed;
- carrying a real back-and-forth and repairing it when it breaks;
- a few hundred high-frequency **chunks** available without thinking.

Vocabulary research is blunt about the volume involved. Nation's coverage
figures put comfortable comprehension of speech (98% of words known) at
6,000–7,000 word families, and 95% at around 3,000. A traveller needs far
less, but still several hundred high-frequency chunks. An 8-node map carrying
a few dozen phrases per node can't reach that; a phrase bank with audio review
can.

### Why Rafael leaves, and where to

- **Voice-first, conversational:**
  - Duolingo Max: Video Call with an AI character that remembers past calls,
    and Roleplay with feedback after each scene.
  - Speak: voice-first lessons with real-time pronunciation scoring.
  - ChatGPT's voice mode: free-form roleplay on demand.
- **Audio for the commute:** Pimsleur and podcasts.
- **The destination variant** and native voices are table stakes there.

**What Atlas has that none of them do:** a contrastive, Portuguese-aware plan;
repair strategies as a first-class skill; avoidance detection (`thin`). No
competitor catches a learner routing around the subjunctive. Keep that, and
put it on voice.

---

## Flow C — Catholic Church history

**Teresa**, a parish catechist in Brazil. Teresa wants to understand the
Church's history well enough to teach it: 15 minutes most evenings, and a lot
of driving.

### What Teresa gets

1. "História da Igreja Católica" + Mastery → in 4 s, _"é um continente, não um
   mapa"_, offering three eras.
2. Teresa charts the whole continent; the first territory, **Igreja Antiga**,
   is built with **16 nodes**.
3. The nodes are **one straight chain**: each node's only prerequisite is the
   one before it. So there is exactly one frontier node at any moment. The
   map is a timeline drawn as a tree, with no dates on it.
4. All 16 nodes are tagged `concept`: events, people and documents alike. The
   `interpretive` domain adds Provenance and Steelman, so the 13 core nodes
   run **10 phases each**.
5. **123 sessions and about 15 h for the first era alone**; roughly 45 h for
   all three. That includes **13 Steelmans and 13 Crucibles** in one era.

### Session by session

| When   | What happens                                                                                                                                                                                                                                                                                                                                                                                                                              | What Teresa thinks                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Day 1  | Consume on the Jerusalem community, read aloud while cooking.                                                                                                                                                                                                                                                                                                                                                                             | "Lovely. This is the part I came for."                                |
| Day 2  | Discriminate on **Irineu de Lião** (a person). The cases are riddles: _"a bishop in a city of Gaul at the end of the 2nd century…"_ → Irenaeus. One option, _Patrística_, contains the right answer as a subset. It's trivia, not a boundary.                                                                                                                                                                                             | "A quiz about who's who."                                             |
| Day 5  | Provenance on **Nicaea**, the best surface in the app for this topic. An honest "faithful paraphrase" of the Creed, well-built claims, a strong "whose voice is missing" close. But one key contradicts the phase's own rule: _"the assembled bishops professed one God… the Son true God"_ is keyed `asserts`, when the document's existence **proves** the bishops professed it. Teresa understood the distinction and is marked wrong. | "Did I misunderstand, or is it wrong?" Trust dents.                   |
| Day 6  | Steelman on the **Didache**: _unitary Syrian manual (Audet, Milavec) vs. layered compilation (Niederwimmer, Rordorf & Tuilier)_. Real scholars, real debate, specialist philology. Consume never taught these positions, so Teresa has to argue cases she has never seen.                                                                                                                                                                 | "I'm being examined on a dissertation I didn't read."                 |
| Week 2 | Crucible #4: "apply" an event to a novel context — for history this becomes analogy-making.                                                                                                                                                                                                                                                                                                                                               | "Why am I doing this again?"                                          |
| Week 3 | Still in the 2nd century. The trip through 2,000 years looks like 45 hours of worksheets.                                                                                                                                                                                                                                                                                                                                                 | **Leaves** for a podcast and a good book; maybe a parish study group. |

### What "green" means here, and what Teresa wants

Atlas proves Teresa can classify, rule claims against a source, argue both
sides, and explain. Teresa wants:

- **a narrative** — who, when, why, and what came of it;
- **chronology across the whole arc** — what came before what, across eras;
- **connection to today** — the liturgy, the Creed prayed on Sunday;
- the ability to **explain it to the parish**.

Feynman is aligned with that last point. Nothing trains chronology: the
placement test has an `order` kind, but no phase does.

### Why Teresa leaves, and where to

- **Narrative audio from a trusted voice.** Ascension's daily 20–30 minute
  "in a Year" podcasts and _Catholic Classics_ are the category leaders.
  Books (Duffy's _Saints and Sinners_) and lecture courses cover the same
  ground.
- **Trust and lens.** Atlas's content is academically even-handed, which is
  good. But Teresa can't choose between a faith-formation reading (what the
  Church teaches about its own history, with its documents) and an academic
  one. The sources are recalled by the model rather than retrieved, and
  there is no link to the full text (New Advent, vatican.va).
- **Community.** Church history is often studied in groups.

**What Atlas has that none of them do:** Provenance and Steelman are genuinely
rare. No podcast makes you read a source as a document or argue the side you
reject. Keep them, and ration them to the nodes that earn them.

---

## Flow D — Finance

**Bruno**, 29, salaried (CLT) in São Paulo, carrying a credit-card balance. Bruno
wants to "get my money organised and start investing".

### What Bruno gets

1. "Finanças" → too broad → Personal / Basic investments / Corporate. Bruno
   picks Personal, Pareto 20% → **7 nodes, 43 sessions, about 5.2 h** (the
   pace model says 3.1 h).
2. The subject-area tags are noise, so the ladders are noise:
   - Budget is tagged `executable`, the domain meant for code.
   - Financial margin (income minus expenses, an _easy_ idea) is `formal`, so
     it runs **10 phases** including Trace, Drill and Crucible.
   - Emergency reserve is `general`; cash flow is `empirical`.
3. The content has **R$ amounts but no Brazil.** Across the whole Consume on
   asset allocation there are 23 mentions of _ações_ and 8 of _renda fixa_,
   and zero of Tesouro Direto, Selic, CDI, CDB, LCI/LCA, FGC, poupança or
   income tax. Bruno's real decision (_Tesouro Selic or a CDB at 100% of CDI
   for the reserve? What does the FGC cover?_) isn't in the app.
4. Perform is a well-made budget for a fictional **Lucas** in R$. Bruno's own
   numbers never enter.

### What "green" means here, and what Bruno wants

Atlas proves Bruno can explain cash flow, forecast scenarios, and budget a
stranger's month. Bruno wants **behaviour**: a budget that exists, revolving
credit paid off, a reserve built, a first investment made with understanding.

The literature is unkind to the gap. A meta-analysis of 201 studies found
financial-education interventions explain about **0.1% of the variance in
financial behaviour**, with effects decaying to nearly nothing after about 20
months. What works better is **just-in-time** education: narrow, tied to a
specific decision, close to the moment of the behaviour. A finance map
mastered in the abstract is the format with the weakest evidence behind it.

### Why Bruno leaves, and where to

- ChatGPT or Gemini with Bruno's own numbers pasted in.
- Brazilian finance creators who speak Selic and CDB fluently.
- The bank app's built-in budgets and savings boxes.
- A spreadsheet.
- For certification (CPA-10/20, CEA): question banks and timed mock exams.

**What Atlas has:** the structure that keeps Bruno from learning allocation
before cash flow, and review that makes compound interest stick. Nothing else
he uses has an order or a memory. Keep that, and point it at his own life.

---

## The pattern under all four

The same eight reasons recur. They are ordered by how many of the four flows
each one loses.

1. **One shape for every kind of knowledge (4/4).** Atlas has one canvas (a
   prerequisite map) and one unit (a node with a ladder). Knowledge comes in
   at least four shapes:
   - **hierarchical** — linear algebra, and it fits;
   - **skill and volume** — languages: hundreds of chunks and hours of ear;
   - **narrative and chronological** — history: a timeline and causes;
   - **decision and behaviour** — finance: one's own life.

   `kind` (what you must _do_) and `domain` (what counts as _evidence_) are
   both good axes. Neither is the **shape**, and the shape is what makes
   Church history a 16-link chain and Spanish an 8-node map with no volume.

2. **"Green" is not the target performance (4/4).** Every flow's real test
   differs from the ladder's: a timed mixed exam with proofs; an unscripted
   conversation heard at native speed; a narrative taught to others; a changed
   behaviour. The app never asks what the target is, so it can't
   backward-design toward it or test it at the end.
3. **The modality is wrong for the moment (3/4).**
   - The app is screen and keyboard first.
   - Its voice layer is locked to the interface language, which breaks
     language learning outright.
   - There is no math notation or math input.
   - Visuals are limited to box-and-arrow figures.
   - There is no hands-free mode for the commute or the drive.

   Competitors are voice-first (Speak, Duolingo, ChatGPT voice), audio-first
   (podcasts), camera-first (photograph the problem), or visual-first
   (3Blue1Brown).

4. **Nothing is grounded in the learner's world (4/4):** the problem sets, the
   destination, the faith or lens, the money. Study Mode, Guided Learning and
   NotebookLM all start from the learner's material.
5. **Uniform, long ladders (4/4).** Easy core nodes run 10 phases. Steelman
   and Crucible run on every interpretive node, whether or not the node is
   contested or transferable. On three of the four maps, the phases add up to 50–70% more time than the pace model promises. A learner
   who half-knows a node sees ten steps and leaves; "prove it" is a secondary
   action.
6. **Trust (3/4).**
   - Model-recalled sources.
   - An answer key that breaks its own rule.
   - Content that isn't specific to the learner's country.
   - Nothing verified by a human, and no credential.

   For exams, history and money, trust _is_ the product.

7. **Several topics, several queues (4/4).** Four maps mean four review
   queues, one daily target, and a deadline only for Exam. A trip in six weeks
   has no way to outrank a hobby.
8. **Session size (3/4).** A phase is 5–15 minutes and a node about an hour.
   Leaders are built from 3–5 minute units that fit a bus stop.

### What to protect while fixing it

None of the alternatives has:

- a living map of what you know, with gaps that name themselves;
- failure that writes back to the plan;
- calibration (felt vs. real);
- misconception memory;
- purpose-built ladders that test the right thing per kind of knowledge;
- avoidance detection;
- source criticism and steelmanning;
- automatic spaced review.

The alternatives are _better sessions_; Atlas is a _better curriculum_. The
opportunity is to keep the curriculum and adopt their session surfaces.

---

## Brainstorm — the fastest _deep_ way to learn anything

Six principles, each with ideas under it. **Impact** is on time-to-mastery
(⏱) and depth (◆). **Effort** is S/M/L. ▶ marks what is already in
`PLAN-LEARNING.md`.

### Principle 1 — Start from the target performance, and design backwards

| #   | Idea                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Impact | Effort | Flows |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----- |
| 1   | **"What will you be able to do, and how will we know?"** One onboarding question, with suggestions per goal: _pass the exam on the date (upload a past exam)_; _hold a 5-minute check-in and dinner conversation in Madrid by Nov 10_; _teach the councils to my catechism group_; _have a budget, no revolving debt, a 3-month reserve by March_. The answer generates the **final field test first**. The map is built backwards from it, and mastery of the map ends in passing it, after a delay. | ⏱◆◆    | M      | all   |
| 2   | **Every goal gets a date**, not only Exam. A trip, a class, a talk, a financial milestone. The pace model and the cross-topic queue (#19) use it.                                                                                                                                                                                                                                                                                                                                                     | ⏱      | S      | all   |
| 3   | **The map-level final** ("the capstone test"): a mixed, timed, target-shaped assessment that unlocks when the map is green and again 7 days later. Mock exam, live conversation, teach-back recording, or behaviour check-in. The only thing that turns a map "Proven".                                                                                                                                                                                                                               | ◆◆     | M      | all   |

### Principle 2 — Let each topic take its natural shape

| #   | Idea                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Impact | Effort | Flows |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | ----- |
| 4   | **A topic-level `shape` axis**, alongside kind and domain: `hierarchy` (prerequisite map, as today), `scenarios` (languages: situations × functions), `timeline` (history: eras, dated episodes, causal links), `plan` (finance and other life domains: decisions in the order life presents them). The same node states and ledger underneath; a different canvas and ordering on top. It fits the engraved-atlas metaphor: a timeline is a voyage route along a coast, scenarios are the cities on an itinerary. | ⏱◆◆    | L      | B C D |
| 5   | **An `episode` kind for narrative knowledge.** The Merrill four have no home for "the Council of Nicaea", which is why every event came back as `concept`. Episode ladder: Consume (as a story) → **Chronicle** (place it on the timeline and name the causal link to its neighbours — the chronology signal no phase extracts) → Provenance → Recall. Steelman only where the map flagged the node `contested`.                                                                                                   | ⏱⏱◆    | M      | C     |
| 6   | **Ration the heavy phases by evidence written at map build.** `contested: true` gates Steelman; `transferable: true` gates Crucible. Discriminate never runs on a person or an event. Easy core nodes lose more than Socratic. By the app's own estimates, that removes roughly a third of the Church history hours without touching a gate.                                                                                                                                                                       | ⏱⏱     | S      | A C D |
| 7   | **Language nodes carry a chunk bank** (50–150 phrases per scenario, frequency-ranked, in the destination's variant), and the bank drives audio review. The map stays small; the volume lives in FSRS, where volume belongs.                                                                                                                                                                                                                                                                                        | ◆◆     | M      | B     |

### Principle 3 — Meet the learner in the moment and medium where learning happens

| #   | Idea                                                                                                                                                                                                                                                                                                                                                                           | Impact | Effort | Flows |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | ----- |
| 8   | **A target language, first-class (a bug today).** Dictation, read-aloud and the judge follow the _map's_ target language and regional variant, not the interface language. The destination is asked at onboarding. _(Filed as its own task from this session.)_                                                                                                                | ◆◆◆    | S–M    | B     |
| 9   | **A Listen phase** (performative): native-speed audio at 0.9–1.2×, in more than one accent, graded by comprehension. Numbers, times, prices and gate changes dictated at speed. The signal: _receptive processing_, which no phase extracts today.                                                                                                                             | ◆◆◆    | M      | B     |
| 10  | **Produce becomes a conversation.** The partner answers, follows up and throws one unpredictable turn, in real-time voice. Keep the `thin`/avoidance verdicts and add "used a repair strategy". This is where Duolingo, Speak and ChatGPT are; Atlas adds the avoidance check none of them has.                                                                                | ◆◆◆    | L      | B     |
| 11  | **Audio-first mode for commutes and drives.** Consume as narrated episodes (history). Call-and-response in the Pimsleur style for languages: the anticipation pause _is_ retrieval. Recall and Feynman spoken. Review cards answered by voice. On iOS: lock-screen and CarPlay controls.                                                                                       | ⏱◆     | M–L    | B C   |
| 12  | **Math-native.**<br>• Rendering (KaTeX); `Rich` gains a math token and read-aloud skips it the way it skips fences.<br>• A matrix input widget.<br>• **Photograph your handwritten work:** a vision-capable judge grades the paper, the way the exam will be written.<br>• An interactive 2D figure for `formal` nodes: drag the basis vectors, watch the determinant as area. | ◆◆     | M–L    | A     |
| 13  | **A Prove phase for `formal`**: construct a short proof, graded against a hidden proof skeleton. The planned Audit phase (spot the error in a flawed proof) is its pair.                                                                                                                                                                                                       | ◆◆     | M      | A     |
| 14  | **3–5 minute units.** Any phase can be parked and resumed mid-item (parking exists). The dashboard offers "one rep" per topic. An iOS widget shows a single due card.                                                                                                                                                                                                          | ⏱      | S–M    | all   |

### Principle 4 — Ground everything in the learner's own world

| #   | Idea                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Impact | Effort | Flows   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | ------- |
| 15  | **Bring your material, and the items follow it.** Beyond the syllabus that shapes the map: past exams set the item _style_; lecture PDFs and slides ground Consume, with the page cited; a photographed problem set becomes Perform cases. `unpdf` and `/api/extract` already exist. The next step is retrieval over the upload at generation time, keyed per learner, the way `passage` already is.                                                                                                                                                                                                         | ⏱◆◆    | L      | A (all) |
| 16  | **Retrieved primary sources.** Provenance quotes real text from public-domain corpora (New Advent's Church Fathers, vatican.va documents, papal encyclicals), links the full document, and verifies the excerpt exists before caching. The model chooses the passage; it never writes it.                                                                                                                                                                                                                                                                                                                    | ◆◆     | M      | C       |
| 17  | **A `locale` axis for jurisdiction-bound topics** (finance, law, tax, medicine, driving). The server stamps it from the profile, like `neighbours`, so it never becomes a four-place cache key. For Brazil: Tesouro, CDI, FGC, income-tax rules.                                                                                                                                                                                                                                                                                                                                                             | ◆◆     | S–M    | D       |
| 18  | **"Your numbers" and field missions.** For life domains: an optional private worksheet (income, fixed costs, debts; never bank credentials) that Perform cases use instead of "Lucas". **Missions**: _list your debts by effective annual cost; set up the automatic transfer; order dinner in Spanish; attend Mass and name where each part of the Liturgy of the Word comes from; do problem set 4_. Each is debriefed the way `craft` Perform debriefs work the app can't see. Just-in-time, own-context, behaviour-shaped: the format the evidence favours. Framed as education, never a recommendation. | ◆◆◆    | M      | all     |
| 19  | **A lens choice for contested or confessional subjects**: _academic historiography_ vs. _the Church's own reading, with its documents_ (and likewise for other traditions), stated up front. Steelman stays in both, and the lens only decides which reading the narrative follows.                                                                                                                                                                                                                                                                                                                          | ◆      | S      | C       |

### Principle 5 — Never re-teach the known; never let the fluent pass as mastered

| #   | Idea                                                                                                                                                                                                                                                                                         | Impact | Effort | Flows |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----- |
| 20  | ▶ **Test-out as the default** on known ground, plus the **Consume pretest** that collapses known sections (W3.1, W3.2).                                                                                                                                                                      | ⏱⏱⏱    | S–M    | A C D |
| 21  | **Earned skips.** Passing a harder phase cold credits the easier phases before it on that node, generalising the "prove it" challenge from the whole plan to each rung. Feynman clean on the first try → Recall is credited, for example.                                                    | ⏱⏱     | S      | all   |
| 22  | **One daily plan across every map**: a 10–20 minute set that mixes due cards and the next best rung across all topics, weighted by deadline (#2), forgetting (FSRS retrievability) and the learner's stated priority. This is cross-topic interleaving and the fix for four separate queues. | ⏱◆     | M      | all   |
| 23  | **Exam simulator** (the exam goal's own Pareto): a timed mock in the uploaded exam's format, a predicted score, and study minutes allocated to the largest score gain per minute.                                                                                                            | ⏱◆     | M      | A D   |
| 24  | ▶ **Delayed proof, verified keys, honest gates, a fading map** (Waves 1, 2 and 4). These keep the time saved above from being fluency.                                                                                                                                                       | ◆◆◆    | —      | all   |
| 25  | ▶ **Mix** (which idea applies) and **Audit** (spot the error) as the first new phases (W5.1, W5.2).                                                                                                                                                                                          | ◆◆     | L      | A D   |

### Principle 6 — Earn trust and keep people coming back

| #   | Idea                                                                                                                                                                                                                                                                                                                        | Impact | Effort | Flows |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----- |
| 26  | **Verified maps for the top topics.** Linear algebra, Spanish/English/French for travel, personal finance (BR/US), Church history, and the rest of the top 50. Each is reviewed once by a person, pinned in `content_cache` and marked "verified". The shared cache already makes this one row per topic for every learner. | ◆◆     | M      | all   |
| 27  | **A credential that means something.** "Proven" = every node passed after a delay, plus the map-level final (#3) passed twice, a week apart. Shareable. That is rarer and more honest than any course certificate.                                                                                                          | ◆      | S      | A D   |
| 28  | **Teach for real.** Export a Feynman explanation as a one-page lesson the learner wrote, for a catechist, a study group or a friend. Share a continent with a study partner and see each other's frontier.                                                                                                                  | ◆      | S–M    | C     |
| 29  | **A weekly learning letter**: time per node, where calibration was off, which phase paid, and what to change. Metacognition is the one skill that makes the _next_ topic faster.                                                                                                                                            | ⏱◆     | S      | all   |

---

## If only ten things get built

Ordered by (flows rescued × impact) ÷ effort, and sequenced so each one makes
the next pay more:

1. **#8 target language** — a correctness bug that breaks Flow B today. S–M.
2. **#6 ration the heavy phases** + **#21 earned skips** — cut the hours
   without touching a gate. S.
3. **▶ W3.1/W3.2 pretest and test-out as the default** — the biggest time
   lever on known material. S–M.
4. **#1 + #3 target performance and the map-level final** — make "done" mean
   the real thing. M.
5. **#17 locale** and **#19 lens** — cheap trust for finance and history. S.
6. **#9 Listen** + **#10 conversational Produce** — make language maps worth
   keeping. M–L.
7. **#12 math-native** (rendering first, photographed work second) — makes
   Flow A's practice exam-shaped. M–L.
8. **#22 one daily plan across maps** + **#2 dates for every goal**. M.
9. **#4/#5 shape axis and `episode` kind** — timeline for history, scenarios
   for languages. L; start with the timeline, since Church history shows the
   need most clearly.
10. **#15 bring your material** + **#18 missions** — ground everything in the
    learner's own world. L.

All ten are now scheduled in `PLAN-LEARNING.md`: #8 is W1.1, #6/#21 are
W3.1–W3.2, the pretest and test-out are W3.3–W3.4, #1/#3 are W5.1/W5.3, #17/#19
are W2.5–W2.6, #9/#10 are W6.1–W6.2, #12 is W7, #22/#2 are W4.6/W4.5,
#4/#5 are W9, and #15/#18 are W10. Its "Flow exit points" table is the
checklist each stage gate re-runs these four learners against.

---

## Sources

Product landscape (September 2026):

- [Introducing study mode — OpenAI](https://openai.com/index/chatgpt-study-mode/) · [Study mode FAQ](https://help.openai.com/en/articles/11780217-chatgpt-study-mode-faq) · [ChatGPT Study Mode in 2026 — Appscribed](https://appscribed.com/chatgpt-study-mode/)
- [Guided Learning in Gemini — Google](https://blog.google/products-and-platforms/products/education/guided-learning/) · [Gemini's Guided Learning and ChatGPT's Study Mode — Pearson](https://www.pearson.com/international-schools/international-schools-blog/2026/02/what-is-gemini_s-guided-learning-and-chatgpts-study-mode-.html)
- [NotebookLM features for students — Google](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-student-features/) · [Gemini Notebook for students](https://notebook.google/students) · [NotebookLM app quizzes and flashcards](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-app-quizzes-flashcards/)
- [Duolingo Max explained (2026)](https://beginnersinai.org/duolingo-max-explained/) · [Duolingo Roleplay explained](https://duolingoguides.com/duolingo-roleplay-explained/)
- [Speak](https://www.speak.com/) · [Speak app review 2026 — LanguaTalk](https://languatalk.com/blog/speak-app-review/)
- [Ascension app](https://ascensionpress.com/pages/ascension-app) · [Catholic Classics podcast](https://podcasts.apple.com/us/podcast/catholic-classics/id1644427671)
- [3Blue1Brown — linear algebra](https://www.3blue1brown.com/?topic=linear-algebra) · [Brilliant — linear algebra](https://brilliant.org/courses/lin-alg/)

Evidence:

- Kestin et al. 2025, [AI tutoring outperforms in-class active learning](https://www.nature.com/articles/s41598-025-97652-6) (Scientific Reports) — a pedagogy-designed AI tutor more than doubled median learning gains against active-learning classes.
- Bastani et al. 2025, [Generative AI without guardrails can harm learning](https://www.pnas.org/doi/10.1073/pnas.2422633122) (PNAS) — unguarded GPT-4 improved practice and hurt later unaided performance; a tutor that gives hints, not answers, removed the harm. Atlas's no-answers gates are on the right side of this.
- Fernandes, Lynch & Netemeyer 2014, [Financial literacy, financial education, and downstream financial behaviors](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2333898) (Management Science) — ~0.1% of behaviour variance, decay by ~20 months, a case for just-in-time education.
- Classic results these ideas lean on, not re-fetched here:
  - the testing effect (Roediger & Karpicke 2006);
  - spacing (Cepeda et al. 2006);
  - interleaving (Rohrer & Taylor 2007);
  - pretesting (Richland, Kornell & Kao 2009);
  - learning from erroneous examples (Große & Renkl 2007);
  - vocabulary coverage for comprehension (Nation 2006);
  - backward design (Wiggins & McTighe, _Understanding by Design_).
