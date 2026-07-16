# The Learning Platform — Complete Final-Product Specification

> A web application that takes any topic and moves a learner through a closed spiral: **plan → consume → question → teach back → connect → apply → retain**, with **calibration** and **adherence** woven through every surface. The concept map is the spine; mastery state is the blood that flows through all of it.

---

## 1. Core Model (read this first — it explains every screen)

The app is **not** a linear course. It is a **living knowledge map** you act upon.

- **The map is home base.** Every subject is a directed graph of concept **nodes** connected by prerequisite **edges**, laid out foundations-to-frontier.
- **The phases are actions on a node**, not screens you walk through once. You always return to the map.
- **Everything reads and writes node state.** A Socratic session, a failed card, a botched application problem — all update the same mastery state and can spawn new nodes. That write-back is what makes the app a *spiral* instead of a checklist.

**The three surfaces** (top-level navigation):

1. **Map** — the whole subject as a living graph; your home.
2. **Session** — where learning happens, on one node at a time.
3. **Review** — retention, surfaced daily.

A thin **Analytics/Calibration** layer sits under all three. An **Adherence** system (streaks, momentum, honest queue) wraps the whole experience.

### Node mastery states (the shared vocabulary of the entire app)

Every node is always in exactly one state, shown by color everywhere it appears:

| State | Meaning | Visual |
|---|---|---|
| **Unknown** | Not yet assessed or learned | Grey, dim |
| **Frontier** | Prerequisites met — ready to learn now (the ZPD) | Glowing / pulsing |
| **Learning** | In progress this session | Blue |
| **Shaky** | Learned but failing reviews or applications | Amber |
| **Mastered** | Understood + retained + *applied* in novel context | Green |
| **Gap** | A sub-concept spawned from a detected failure | Red, attached under its parent |

Mastery is only awarded when a concept has been **understood, retained, and successfully transferred** — not on recall alone.

---

## 2. First Run / Onboarding

**Goal:** get to a lit-up map with a clear frontier in under 5 minutes, and set up the two things adherence depends on (a goal and a daily rhythm).

**Screen: Welcome**
- Single input: *"What do you want to learn?"* — accepts a topic, a pasted syllabus, or a file upload (PDF/course outline).
- Secondary, optional: *"Why?"* — goal conditioning. Options: exam (with date), build a project (describe it), general mastery. This steers pruning and ordering downstream.
- Ask for **interests** (e.g. chess, football, real estate) — used later for personalized analogies and examples. Skippable.
- Ask for a **daily target** (e.g. 15 min) — this becomes the honest queue budget and the streak unit.

**Screen: Building your map** (2–4 s)
- The AI generates the concept DAG from a grounded source, topologically sorts it, and animates nodes into place foundations-first. The learner watches the territory assemble — this is a deliberate "this is *mine*" moment, not a spinner.

**Screen: Placement diagnostic** (2–3 min, adaptive)
- Short adaptive questions that binary-search the learner's edge. Correct answers prune whole branches ("you already own this"); wrong answers pin the frontier lower.
- As it runs, nodes color live: mastered branches go green and collapse, the frontier lights up.
- **Ends on the map**, frontier glowing, with a single CTA: *"Start here →"* pointing at the first frontier node.

**Edge cases:** topic too broad → AI offers 2–3 scoped sub-maps to pick from. Upload unreadable → fall back to topic input. Learner skips diagnostic → everything starts Unknown and the frontier is the graph roots.

---

## 3. The Map (Home)

The screen the user lives on. Everything else is entered from here and returns here.

**Layout**
- **Canvas (center):** the interactive graph. Pan/zoom. Nodes colored by state. Edges show prerequisite direction. The **frontier glows**. Auto-laid-out left-to-right (foundations → frontier), but draggable.
- **Left rail:** the goal (with exam countdown if set), overall mastery % (a fill of the territory), and a "jump to frontier" button.
- **Top bar:** search nodes, the **streak flame**, today's **Review count** (honest: "8 min," not "312 cards"), and profile/settings.
- **Right rail (contextual):** appears when a node is selected — node title, state, last-touched, and the **action list** (see Node Detail).

**Interactions**
- **Click a node** → right rail opens with its detail and available actions.
- **Double-click a frontier node** → drops straight into Session on that node.
- **Hover an edge** → highlights the prerequisite chain, so the learner sees *why* a node is locked.
- **Locked nodes** (prerequisites unmet) are dimmed; clicking one shows "learn these first" and highlights the path.
- **Momentum view toggle** → replays the map lighting up over the past weeks (an adherence/motivation surface — visible progress).

**States**
- **Fresh map:** mostly grey, frontier glowing at the roots.
- **In progress:** green core, amber shaky nodes pulling attention, red gap nodes clustered under parents.
- **Near-complete:** mostly green; the app starts surfacing cross-topic **interleaved** challenges instead of new nodes.

**AI behavior:** continuously re-plans. Repeatedly-failed nodes auto-spawn finer sub-nodes. If a goal has a deadline, the map reorders to hit the highest-value nodes first and warns if the pace won't make it.

---

## 4. Node Detail (the Session hub)

Opening a node doesn't launch one fixed flow — it shows **where this node is in its own spiral** and offers the next right action.

**Layout (right rail or full panel)**
- Node title, state badge, prerequisite/dependent links (clickable).
- A **phase tracker** for this node: Consume → Socratic → Feynman → Connect → Crucible → Retained. Each shows done / current / locked.
- **Primary CTA** = the next uncompleted phase. Secondary = re-do any completed phase.
- A **confidence reading** for this node (from calibration data): "You *feel* solid here but your last application failed" — the metacognition nudge lives here.

**Interaction:** the learner can always jump the recommended phase, but the app defaults to the pedagogically correct next step and gently flags skips ("You haven't taught this back yet — want to?").

The following sections are the phases, each a distinct Session view.

---

## 5. Phase 1 — Plan (the map itself)

Already covered by onboarding + the Map. Ongoing, it's not a separate screen — it's the **re-planning behavior** of the map: pruning, reordering to the goal, spawning sub-nodes from failures. The only recurring UI is a small "Map updated" toast when the AI restructures ("Added 2 sub-concepts under *Recursion* — you keep missing base cases").

**Improvement already built in:** goal-conditioned ordering, pace warnings against a deadline, aggressive skipping of diagnosed-known material (the main *faster* lever).

---

## 6. Phase 2 — Consume (the Learn view)

**Goal:** minimum, grounded, dual-coded input — then straight into retrieval. This is the phase most apps ruin by dumping text; here it's short and active.

**Layout**
- Distraction-free reading column, **segmented**: content reveals in chunks, not a wall.
- **Dual-coded:** an auto-generated diagram sits beside the prose for each chunk.
- **Pre-taught terms:** key vocabulary is introduced *before* the paragraph that uses it.
- **Source citations** on every claim — trust is visible; the learner isn't memorizing hallucinations.
- Inline controls per chunk: **Simpler · Example · Analogy (from my interests) · Go deeper.** Rewrites on demand.

**The desirable-difficulty mechanic (the *deeper* lever):**
- Before revealing each chunk's explanation, the app poses a **prediction/guess** ("What do you think happens if…?"). The learner answers, *then* the explanation reveals. A wrong guess followed by the correction encodes far better than passive reading. This turns the most passive phase into an active one.

**Interactions**
- Answer the prediction → reveal → continue.
- Tap any term for its pre-taught definition inline.
- "Rewrite as: worked example / diagram / analogy" — **adaptive modality**; the app learns which representation lands for this learner and leads with it next time.
- Highlight text → "ask about this" opens a mini-Socratic aside without leaving the view.

**Exit:** finishing the last chunk auto-advances to Socratic. Node moves Unknown/Frontier → **Learning**.

**Edge cases:** learner already guesses everything right → app fast-forwards and suggests skipping to Crucible (diagnostic overshoot correction). Learner rewrites everything to "simpler" repeatedly → app flags a missing prerequisite and offers to route there.

---

## 7. Phase 3a — Socratic (during learning)

**Goal:** the learner *constructs* the idea through guided questioning, with **contingent scaffolding** — never pure interrogation, never pure lecture.

**Layout**
- **Dialogue column** (left): the AI's probing questions and the learner's replies.
- **Shared scratchpad / whiteboard** (right): a canvas the learner works on — writes, sketches, derives — and the **AI reacts to what's written there**, not just to chat text. This is central, not decorative.
- **Help-level indicator** (top): a visible dial — *Silent · Hint · Guide · Show me* — reflecting current scaffolding. It rises when the learner is lost, falls toward silence as they master it.

**AI behavior (the hard part — get this right or the app fails):**
- Uses the classic Socratic moves: clarify, challenge assumptions, probe reasoning, probe implications, question the question.
- **Contingent:** near-correct → hint and let them finish; genuinely lost → *drop the Socratic act and just teach*, then resume questioning. A tutor that never answers is infuriating and slow.
- **Anti-sycophancy (non-negotiable):** it must *catch* wrong reasoning, not validate it. Warm but honest. Wrong answers get surfaced, gently, never smoothed over. This is the single most important behavior in the product.
- Scaffolding **fades** as mastery rises within the session.

**Interactions**
- Type or write on the scratchpad; the AI responds to both.
- "I'm stuck" → raises help level one step (explicit control over scaffolding).
- "Just tell me" → drops to direct instruction, logged (repeated use flags a prerequisite gap).

**Exit:** when the learner can answer the core probes unaided, the node's understanding is established; advance to Feynman.

---

## 8. Phase 3b — Feynman (teach it back)

**Goal:** gap detection through self-explanation. The learner teaches; the AI plays the naive student and diffs the explanation.

**Layout**
- A prompt: *"Teach me this like I've never heard of it."*
- **Voice-first input** (with text fallback): speaking is faster and closer to real teaching. Live transcript shows as they talk.
- The AI appears as a **confused-student persona**, interrupting with naive questions ("wait, why does that matter?") — which surfaces exactly the parts the learner hand-waved.

**Output: the Gap Report**
- A **visual diff** of the explanation: **green** = explained well, **grey** = skipped, **red** = wrong/confused.
- Each red/grey item is actionable: **"Fix this"** launches a targeted Socratic micro-pass on *just* that sub-point.
- **Write-back:** gaps become **red Gap sub-nodes** attached under the parent on the map. This is the connective tissue — the loop, not a checklist.

**Interactions**
- Speak the explanation → naive questions interleave → receive the diff.
- Tap any gap → targeted Socratic fix → re-teach just that piece.
- "Teach again" to re-attempt the whole thing after fixes.

**Exit:** a clean-enough diff advances to Connect. Node stays **Learning** until Crucible passes.

**Edge case:** learner freezes on teach-back → AI offers a scaffold ("start with: what problem does this solve?") rather than a blank wall.

---

## 9. Phase 4 — Connect (the Elaboration station)

**Goal:** durable encoding through **elaboration** for conceptual material; **mnemonics only** for genuinely arbitrary content. The app auto-detects which is which so the learner never gets a silly mnemonic for something that deserved a mental model.

**Layout**
- **Linking prompts:** "How does this relate to *[node you already mastered]*?" — the app pulls real prior nodes from *this* learner's map, so connections are personal and true.
- A small **concept-web** visual: the current node with candidate links to prior knowledge; the learner confirms/draws the real relationships.
- **Conditional mnemonic tool:** appears *only* when the content is detected as list-like (sequences, taxonomies, vocab) — offers method-of-loci imagery, acronyms, vivid associations. Hidden for conceptual material.

**Interactions**
- Answer linking prompts (short free text or by drawing edges on the concept-web).
- Accept/edit a generated mnemonic when offered.
- Everything written here becomes **raw material for cards** in the retention phase.

**Exit:** advance to Crucible. The node is now *understood and connected* — but not yet Mastered.

---

## 10. Phase 5 — Crucible (application / transfer) — *the depth engine*

**Goal:** force the knowledge into **novel** contexts it wasn't taught in. This is the difference between inert knowledge and usable expertise, and it's the **truest signal of mastery** — far better than card recall.

**Layout**
- A **problem/scenario/mini-project** the learner has *not* seen, generated to sit at the **edge of their ability** (deliberate practice: calibrated difficulty, escalating).
- A **workspace** appropriate to the domain (free text, code editor, diagram canvas, step-by-step derivation).
- **Confidence prompt first** (calibration hook): "How confident are you before you start?" — captured for the calibration curve.
- **Immediate, specific feedback** on submission — not just right/wrong, but *which sub-concept* transferred and which didn't.

**Interleaving (the free multiplier):** once several nodes are green, the Crucible draws problems that **mix concepts across nodes** rather than drilling one — this measurably improves discrimination and transfer. This is where interleaving lives in the app.

**Write-back (diagnostically rich):**
- A failure here is precise: it names the sub-concept that didn't transfer and writes it to the map as a **red Gap node** or flips the parent to **Shaky**.
- Failure can trigger an immediate short Socratic re-explanation, then a re-attempt.

**Interactions**
- State confidence → attempt in the workspace → submit → targeted feedback.
- On success: node advances toward **Mastered** (only Crucible success + retention grants green).
- On failure: gap written back, re-teach path offered, difficulty recalibrated down one step.

**Improvement built in:** escalating difficulty ladder per node, and a "boss" interleaved challenge that spans a whole branch before it's allowed to go fully green.

---

## 11. Phase 6 — Retain (Review queue / FSRS) — *the daily spine*

**Goal:** keep mastered knowledge alive with optimally-spaced retrieval. This is the habit surface — it only works if the learner returns, so it's designed for adherence as much as for scheduling.

**Card generation**
- Cards are **auto-generated from the Socratic and Feynman sessions and the Connect phase** — the tedious step humans skip.
- **Atomic:** one fact per card; cloze-style where apt; no enumerations.
- **Varied by type:** recall cards, "explain why" cards, and **application** cards (mini-transfer), so review isn't only fill-in-the-blank.

**Scheduling**
- **FSRS**, not SM-2 — predicts recall far better; the modern standard. Cards surface at optimal spacing.

**Layout**
- **Honest queue:** shows *time* ("~8 min"), not an intimidating card count. The daily target from onboarding is the budget.
- One card at a time; **confidence tap before flipping** (calibration hook again).
- Grade after reveal (feeds FSRS).

**The alive-loop refinement:**
- A **failed card doesn't just reschedule.** It can trigger a **30-second Socratic re-explanation right there**, *and* flag the node **Shaky/red** on the map for re-teaching.
- Retention failure thus **re-enters Phase 1** — the closed loop that separates this from "Anki plus a chatbot."

**Interactions**
- Tap confidence → flip → grade → next.
- "Explain" on any card → micro-Socratic aside.
- Failed card → offered instant re-teach or "schedule re-teach."

---

## 12. Calibration / Metacognition (woven through, plus one home)

**Goal:** the learner doesn't just learn the material — they learn *what they actually know*. Calibration is the "learn to learn" edge and it compounds across every future topic.

**Where it's captured (cheap hooks, everywhere):**
- Confidence tap before Crucible problems and before flipping review cards.
- Predictions in the Consume phase.

**Where it's shown — the Calibration screen (under Analytics):**
- A **calibration curve:** predicted confidence vs. actual performance. Overconfident zones (feels solid, fails) in one color; underconfident in another.
- Per-node and per-topic breakdowns: "You're systematically overconfident on *pointers*."
- A plain-language coach line that teaches the *feeling*: "Re-reading felt like learning here, but your first-try application failed — that's fluency, not mastery."

**Interaction:** tapping an overconfident node jumps to its Crucible to close the real gap. The whole point is to make the learner *feel* the difference between fluency and mastery, then act on it.

---

## 13. Adherence (the wrapper that decides whether any of this fires)

**Goal:** the learner comes back tomorrow. Spacing is worthless unopened; the spiral only spins on return. Most learning apps die here, not on pedagogy — so this is a first-class system, not polish.

**Mechanics**
- **Forgiving streaks:** a streak that survives one missed day (a "freeze"), because the #1 quit trigger is breaking a streak and feeling it's ruined. The flame lives in the top bar everywhere.
- **Honest queue:** always framed in minutes against the daily target, never a wall of 300 cards.
- **Visible momentum:** the map lighting up over weeks (the Momentum replay on the Map) — progress you can *see* is the strongest pull back.
- **Right-moment surfacing:** reviews and nudges timed to the learner's actual rhythm, not dumped at midnight.
- **Affective design:** the daily loop is short, winnable, and ends on a green node or a lit branch — a good feeling to return to.

**Interaction surfaces:** the top-bar flame + review count; a lightweight daily "done for today" confirmation showing what lit up; optional reminders tuned to when the learner actually shows up.

---

## 14. Analytics (the layer under everything)

A single screen aggregating what the phases write:

- **Mastery over time** — % of territory green, trend line.
- **Calibration** — the curve above.
- **Retention health** — FSRS forecast: what's due, what's decaying, what's rock-solid.
- **Transfer rate** — Crucible success on first attempt, the truest mastery metric.
- **Pace vs. goal** — if a deadline exists, on-track / behind, with the map's re-prioritization reflected.
- **Adherence** — streak history, active days, time-on-task honesty.

No vanity numbers. Every metric maps to an action (each is tappable → jumps to the relevant node/phase).

---

## 15. The Loop (how it all connects — the thing that produces "deeper & faster")

Every phase reads and writes the same node state, so the app is a spiral, not a pipeline:

```
        ┌──────────────────── MAP (spine, mastery state) ────────────────────┐
        │                                                                     │
   Plan ─▶ Consume ─▶ Socratic ─▶ Feynman ─▶ Connect ─▶ Crucible ─▶ Retain    │
             ▲            ▲          │ gaps      │          │ fail      │ fail │
             │            └──────────┘           │          │           │     │
             └──── re-teach ◀── red Gap nodes ◀──┴──────────┴───────────┘     │
                                                                              │
   Calibration captured at Consume / Crucible / Retain ──▶ Analytics ─────────┘
   Adherence wraps the whole thing (streak · honest queue · momentum)
```

- **Feynman gaps** → red nodes → targeted Socratic → new cards.
- **Crucible failures** → Shaky nodes → re-teach → recalibrated difficulty.
- **Review failures** → instant re-explain → Shaky node → back into the loop.
- **Calibration** turns every confidence tap into a signal the learner can act on.
- **Adherence** is what keeps the loop spinning at all.

Understanding comes from Socratic + Feynman. Retention comes from FSRS. **Depth comes from the Crucible. Self-direction comes from Calibration. Existence comes from Adherence.** No single phase produces "10x" — the compounding of retrieval-over-rereading, spacing-over-massing, immediate feedback, transfer, and return does.

---

## 16. Settings (brief)

Goal & deadline · daily time target · interests (for analogies) · notification timing · voice on/off for Feynman · scaffolding aggressiveness (how quickly the AI drops the Socratic act) · data export (cards, map).
