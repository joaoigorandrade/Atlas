# Research — Consume, Explain, Perform and Retained, as one lesson

The second pass over the four phases every plan shares. `RESEARCH-PROMPTS.md`
§8 rewrote their prompts inside fixed payload shapes. This pass goes further.
It adds research that review did not cover (§3), traces the four phases as one
sequence a learner walks through (§4), and checks every prompt they send again,
aspect by aspect (§5). It then proposes how to restructure the phases
themselves (§6), which means changing shapes, plans and the generation pipeline
where the evidence says the learner's minutes are being spent badly.

**Status.** §7 is implemented in the commit that adds this file, and §8 (Consume
as reels) in the one after it. §6 is a proposal and is not implemented. Paths are relative to `web/` unless they start
with `docs/` or `ios/`.

---

## 1. The short version

**What was wrong**, most consequential first:

| #   | Finding                                                                                                                                                                                                                                                                                     | Status          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | **Four generations, four models of one concept.** Consume writes the lesson. Only Perform reads it. Explain and Retain write from the label, so each picks its own misconception, analogy and order. Retain wrote cards from a 400-character map summary written before any lesson existed. | Retain fixed §7 |
| 2   | **Most of a learner's first quarter-hour on a node is passive reading** (ICAP, §3.2.1). The prompts' old bands allowed 2-5 paragraphs × 3-6 sentences per section, so up to 30 sentences between two questions.                                                                             | Tightened §7    |
| 3   | **The post-read check could be answered by reading the worked example back.** Nothing said its case must differ. A check on a new case after a worked example is an example–problem pair (§3.2.3), at no extra cost.                                                                        | Fixed §7        |
| 4   | **Explain promised a Feynman that most plans do not have.** "Later they will explain the concept themselves" went to every node, but fact, `working` and `peripheral` plans carry no Feynman. On those nodes Explain models a skill nothing asks for.                                       | Wording §7      |
| 5   | **A fact's reading was asked for "1-2 sections"** against a size rule of 2-5, a validator floor of 2, and "where a note differs, the note wins". The obedient answer failed the shape. A streamed pass of one section is never cached, so every learner on that node paid for it again.     | Fixed §7        |
| 6   | **A one-count size band read "write 2-2 sections … only X earns 2"** on every peripheral reading.                                                                                                                                                                                           | Fixed §7        |
| 7   | **A principle's note forced a figure onto every section** ("A FIGURE IS REQUIRED", and the note wins), definitions included.                                                                                                                                                                | Fixed §7        |
| 8   | **Perform placed a lesson of up to 16k characters in the middle of its rules.** That is the position models use worst (§3.1.1).                                                                                                                                                             | Fixed §7        |
| 9   | **Retain keyed on each node's state and typed cards blind to its kind.** A node's cards forked by whether it was learning or mastered the day they were drafted. A definition card was written for a procedure, which keeps the definition rather than the ability to use it (§3.2.11).     | Fixed §7        |
| 10  | **The Perform judge withholds the corrected value even when the next run is a new case.** Elaborated feedback that includes the right answer beats feedback without it (§3.2.9). Withholding it only makes sense on the exit path, which keeps the same case.                               | §6.5            |
| 11  | **A typed Retain answer is graded by the Recall judge's free-recall prompt**: "everything they could still produce", 2-4 sentences back. A card needs one row and one line.                                                                                                                 | §6.3            |
| 12  | **The "example" lens is told to work a different case, but is never shown the case the section worked.**                                                                                                                                                                                    | §6.2            |

**What to restructure**, by expected learning per minute over effort:

1. **One lesson spine** (§6.1). Every phase reads what the reading taught: its
   takeaways, terms, subgoal labels and the misconception it refuted. Retain
   does now (§7). Explain needs one warm-timing change on both clients.
2. **Consume as prequestion → teaching → worked example → paired problem**
   (§6.2). A second item on a new case (`transfer`) confirms a pretest
   collapse and serves as the post-read problem. It is an optional field, so
   no `VERSION` bump.
3. **Explain only where Feynman follows** (§6.4). On fact, working and
   peripheral nodes it is a second reading of the same idea. Where it stays,
   ground it in the reading and move the check-back after the reply.
4. **Retain as a per-node card factory** run when Consume finishes (§6.3).
   Cards are keyed by node and takeaways, shared across learners, and never
   generated at the moment Review opens.
5. **Perform fades its support from the key it already has** (§6.5): first
   subgoal, then the outline, then the first step worked. A run that leaned on
   the outline holds its gate a night, as the Crucible's guided rung does.
6. **Plan, then write** (§6.6). One call fixes each section's takeaway and
   checks, and those are verified together. The sections are then written in
   parallel against that plan. This gives coherence first and a spine at warm
   time. Measure it before adopting.

---

## 2. What this pass adds

`RESEARCH-PROMPTS.md` §2–§3 already cover instruction density, field order
under JSON mode, judge biases, answer position, example copying, injection,
pretesting, refutation texts, item-writing rules, examples and non-examples,
worked examples and subgoal labels, Mayer's principles, analogies, feedback
levels, learning by teaching, card-writing rules and invented citations. None
of that is repeated here. §3 holds only what that review did not cover, each
item paired with what it means for these four phases.

---

## 3. Research

### 3.1 Prompting

**3.1.1 Long documents first, the task after them.** Anthropic's long-context
guidance is to put long inputs at the top, above the instructions and the
query, and reports that this significantly improves quality
([Anthropic, long-context tips](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips)).
Chroma's 2025 study of 18 models found that reliability falls as input grows,
even on simple tasks, and falls further on semantic than on lexical matching
([Chroma, "Context Rot"](https://research.trychroma.com/context-rot)).
_For Atlas:_ Perform's lesson block sat between the case rules and the step
rules. It now opens the prompt (§7). Retain's new grounding is capped per node
for the same reason.

**3.1.2 Decompose long generations.** Writing, critiquing and refining as three
chained prompts beat one prompt that did all three, on summaries
([Findings of ACL 2024](https://preview.aclanthology.org/nschneid-patch-4/2024.findings-acl.449)).
WorkedGen found prompt chaining and one-shot examples useful for LLM-written
worked examples
([summary](https://warwick.ac.uk/fac/cross_fac/eduport/edufund/projects/yang/projects/human-ai-co-creation-of-worked-examples-for-programming-classes/)).
Planning a budget per section improves adherence to length
([Plan-and-Write, 2025](https://arxiv.org/html/2511.01807v1)). There is no
controlled study of outline-then-write for lessons. _For Atlas:_ one decode
writes every section of a reading in sequence, so the third section is written
by a model that has already committed to the first two (§6.6).

**3.1.3 Self-correction needs an outside signal.** Without external feedback,
models asked to review their own reasoning did not improve and sometimes got
worse. GSM8K went from 75.9% to 74.7%, with more right answers turned wrong than
wrong ones fixed. Tools and execution results did help
([Huang et al., ICLR 2024](https://arxiv.org/abs/2310.01798)). _For Atlas:_ the
blind solve (`verify.ts`) is an outside signal: a separate call answers without
the key. Keep it, and don't add "now check your answer" turns to the content
prompts. Further checks should be external too, like the own-method check.

**3.1.4 Length instructions are followed loosely.** Models fail explicit length
instructions, and long-context models do no better
([LIFEBench, NeurIPS 2025](https://neurips.cc/virtual/2025/loc/san-diego/poster/121535)).
They also answer at greater length than needed even when told to be concise
([YapBench, 2026](https://arxiv.org/abs/2601.00624)). _For Atlas:_ state counts
of structural units (sections, paragraphs, sentences, steps). Those are what the
validators can hold. A word budget is a hope. The reading's length is set by
paragraphs × sentences, and that is the lever §7 uses.

**3.1.5 Precedence belongs in code.** `RESEARCH-PROMPTS.md` §2.4 covered
density. This pass found the failure mode it predicts. "Where a note differs
from the general rules, the note wins" handed the model three conflicts. One of
them (a fact's section count) contradicted the validator, so the model's correct
resolution failed the payload. _For Atlas:_ a note may describe; a count, band
or requirement is computed (`consumeBand` now takes the kind). §6.7 extends
this to every field.

**3.1.6 Prefix caching rewards a stable opening.** DeepSeek caches request
prefixes on disk by default, on a best-effort basis, and a request hits only
where it repeats a stored prefix
([DeepSeek, context caching](https://api-docs.deepseek.com/guides/kv_cache)).
Every Atlas prompt puts variable text (the node's label) straight after a
system line of about 150 words, so only that line can be shared. _Sizing,
honestly:_ in a Consume call, input is the small part of the cost; output
dominates. Reordering for the cache alone is not worth a prompt revision today.
It starts to pay once a reading is split into several calls that share one
long prefix (§6.6).

**3.1.7 LLM distractors are valid but not student-like.** LLM-written math
distractors were mathematically valid but often not the errors real students
make ([Feng et al., NAACL 2024](https://arxiv.org/pdf/2404.02124v2)). Model and
student preferences among distractors correlate only moderately
([2025](https://arxiv.org/html/2502.15140v1)). Models that do it well solve the
item first, simulate candidate misconceptions, then choose
([2026](https://arxiv.org/abs/2603.15547)). _For Atlas:_ name where a wrong
option comes from ("what someone would answer from a natural wrong idea"; "the
standard misconception a good teacher warns about"). Only learner picks can
show whether a distractor is plausible; the blind solve cannot. §6.9 makes
that a metric.

**3.1.8 LLM teaching content is good, and not always right.** In one study, 90%
of LLM tutoring dialogues gave high-quality support, but only 56.6% were
entirely correct ([2025](https://arxiv.org/html/2503.16460v1)). Experts rated
LLM-written worked examples clear, and students found them useful, while
recommending review before use (WorkedGen, above). _For Atlas:_ keys stay server-side,
the blind solve stays, and grounding (§6.1) is the cheapest way to keep later
phases consistent with what the reading said.

### 3.2 Learning content

**3.2.1 ICAP: what the learner is doing decides what they learn.** Interactive

> constructive > active > passive
> ([Chi & Wylie 2014](https://chilab.asu.edu/sites/default/files/lcl/chiwylie2014icap_2.pdf)).
> In classrooms, constructive activities beat active ones
> ([Chi et al. 2018](https://education.asu.edu/sites/default/files/lcl/chi_et_al-2018-cognitive_science.pdf)).
> The critique is that overt behaviour is an imperfect read of cognition
> ([npj Sci. Learn. 2023](https://www.nature.com/articles/s41539-023-00197-4.pdf)).
> _For Atlas:_ count a phase's minutes by mode (§4). Reading is passive.
> Answering a check in your own words, replying to Explain's listener and
> running Perform are constructive. Restructuring means moving minutes from the
> first kind to the second.

**3.2.2 Merrill's First Principles.** Instruction is problem-centred and runs
activation → demonstration → application → integration. Coaching is withdrawn
across tasks
([Merrill 2002, synthesis](https://www.yorku.ca/unsdgs/toolkit/wp-content/uploads/sites/617/2023/04/Merrills-First_Principles_of_Instruction_A_synthesis.pdf)).
_For Atlas:_ Consume demonstrates and its check applies. Nothing activated what
the learner already had, although the prompt lists the prerequisites. The
first section now opens from a named prerequisite and the gap it leaves (§7).
Perform's scaffold is coaching that never fades (§6.5).

**3.2.3 Example–problem pairs.** Studying an example and then solving an
isomorphic problem beat problem-solving alone and problem–example order
([van Gog, Kester & Paas 2011](https://research.ou.nl/en/publications/effects-of-worked-examples-example-problem-pairs-and-problem-exam/)). A small
meta-analysis found d ≈ 0.35, with large heterogeneity
([van Harsel et al. 2019](https://link.springer.com/10.1007/s11251-019-09484-3)).
Replications are mixed. _For Atlas:_ every Consume section already ends with a
worked example and a check. Requiring the check's case to differ from the
example's turns the pair into an example–problem pair. That is free, and §7
does it.

**3.2.4 Self-explanation prompts.** Self-explanation prompts gave g = 0.55
across 69 effects. Generic prompts did at least as well as specific ones
([Bisra et al. 2018](https://doi.org/10.1007/s10648-018-9434-x)). _For Atlas:_
a generic "why does this step follow from the last?" under the worked example
costs no generation (§6.2, optional).

**3.2.5 Fading and completion problems.** Removing worked steps one at a time
helps near transfer. Completion problems improved the quality of
self-explanation and near and medium transfer. Adaptive fading beat fixed
fading without costing more time
([Renkl & Atkinson; summaries](https://faculty.engineering.asu.edu/mre/wp-content/uploads/sites/31/2020/02/Stat_Adapt_Fad_JEE06.pdf)).
Studies disagree on fading backward versus forward. _For Atlas:_ fading
already runs across phases: Consume's example, then Trace, then Perform, then a
cold Crucible. Inside Perform it could fade from the key (§6.5).

**3.2.6 Erroneous examples help a little.** The overall effect is g ≈ 0.14,
larger with prompts to explain the error
([Alemdag et al.](https://www.leibniz-ipn.de/en/research/publications/a-framework-for-learning-from-erroneous-examples-and-meta-analysis-of-empirical-research)).
_For Atlas:_ keep the Crucible's flawed sample and add none to Consume.

**3.2.7 Productive failure is conditional.** Problem-solving before
instruction helped conceptual knowledge and transfer across 53 studies
([Sinha & Kapur 2021](https://doi.org/10.3102/00346543211019105)).
A competing meta-analysis found no significant advantage over scaffolded
alternatives
([2021](https://www.research-collection.ethz.ch/entities/publication/087241d3-ca0e-469e-a7f3-df9c122e2585)).
_For Atlas:_ don't turn Consume problem-first. The pretest is the
cheap form of it: an attempt to generate an answer before instruction.

**3.2.8 Interpolated tests hold attention.** Tests between lecture segments
halved mind-wandering, tripled note-taking and improved retention; restudy
breaks did not
([Szpunar, Khan & Schacter 2013](https://psychology.fas.harvard.edu/publications/interpolated-memory-tests-reduce-mind-wandering-and-improve-learning-online)).
Segmenting itself has small-to-medium effects
([Rey et al. 2019](https://www.doi.org/10.1007/S10648-018-9456-4)).
_For Atlas:_ the per-section check is the interpolated test. Shorter sections
mean a test every few minutes rather than every ten.

**3.2.9 What the feedback says matters.** In computer-based learning,
elaborated feedback reached 0.49, the correct answer alone 0.32, and right or
wrong alone 0.05. Delayed timing lowered effects
([Van der Kleij, Feskens & Eggen 2015](https://people.acer.org/en/publications/effects-of-feedback-in-a-computer-based-learning-environment-on-s/)).
_For Atlas:_ Consume's `right` and `wrong` lines and Retain's `reExplain` are
elaborated. Perform's report explains but withholds the value (§6.5).

**3.2.10 Hypercorrection.** Errors made with high confidence are corrected
more often by feedback (Butterfield & Metcalfe 2001). The effect lasts a week, though the error can return
([2011](https://pubmed.ncbi.nlm.nih.gov/21989771/)), and it holds in
classrooms ([2018](https://pubmed.ncbi.nlm.nih.gov/29781391/)). _For Atlas:_
confidence is tapped before Crucible, Predict, each run and each card, but not
before the Consume pretest. That is where the most confident errors, the
standing misconceptions, are most likely (§6.2, optional).

**3.2.11 Retrieval transfers only as far as the question went.** Transfer from
testing averaged d ≈ 0.40, and only under certain moderators
([Pan & Rickard 2018](https://sc-pan.github.io/pdf/PR_2018.pdf)). Fact quizzes
did not improve higher-order test performance; higher-order and mixed quizzes
did ([Agarwal 2019](https://www.learningscientists.org/blog/2019/6/27-1)).
Format effects (multiple choice versus short answer) conflict across
meta-analyses, and hybrid quizzes did best
([Adesope et al. 2017](https://education.wsu.edu/documents/2018/01/rethinking-use-tests.pdf/)).
_For Atlas:_ a deck of definition cards keeps definitions. Cards are now typed
by the node's kind: procedures applied, principles explained, concepts used to
classify a case (§7).

**3.2.12 Successive relearning.** Retrieve with feedback until correct once,
then relearn in later sessions at least a day apart. The result is durable, and
raising the first criterion gives diminishing returns
([Dunlosky et al., guide](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf);
[Higham et al.](https://eprints.soton.ac.uk/449677/1/Higham_et_al._in_press_JEdPsych.pdf)).
_For Atlas:_ the in-pass learning steps plus Retained ✓ (Good/Easy on a card
unseen for `RETAINED_MIN_DAYS`) already are successive relearning. Keep them.

**3.2.13 Teaching helps when it is expected and done.** Preparing to teach
gave g = 0.35, and teaching after preparing g = 0.56; interactive teaching beat
non-interactive ([Kobayashi 2019](https://zendy.io/title/10.1111/jpr.12221)).
Teaching after studying gave g = 0.27 overall and g = 0.48 with a teaching
expectancy ([Kobayashi 2024](https://www.x-mol.com/paperRedirect/1763030854519197696)).
_For Atlas:_ Explain followed by Feynman is that pair. Where no Feynman
follows, Explain carries neither the expectancy nor the teaching, and what is
left is a re-read.

**3.2.14 4C/ID: supportive versus procedural information.** Supportive
information, for the non-routine parts of a task, comes before the tasks.
Procedural information, for the routine parts, comes just in time, inside them
([van Merriënboer; MIT summary](https://openlearning.mit.edu/mit-faculty/research-based-learning-findings/four-component-instructional-design-4cid)).
_For Atlas:_ Consume is supportive information. Perform's subgoal names are
procedural information, and they belong inside the run at the moment of a
stall, not before it (§6.5).

**3.2.15 Expertise reversal.** Guidance that helps novices can hurt more
experienced learners
([Kalyuga 2007](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf)).
_For Atlas:_ the pretest collapse removes guidance adaptively, and it is the
right mechanism. A pretest guessed right by luck removes guidance from a
novice; a confirming second item makes that rare (§6.2).

**3.2.16 LLM-written cards and questions.** The evidence is thin. One MOOC
study found AI cards comparable in quality to human ones
([Bachiri et al. 2025](https://files.eric.ed.gov/fulltext/EJ1481879.pdf)).
LLM-written practice questions raised retention from 73% to 89% in one course,
with quality that varied
([An et al. 2025](https://arxiv.org/pdf/2507.05629v2)). _For Atlas:_ ground
cards in the lesson (§7). Measure agreement between the flip suggestion and the
learner's own grade, per card type.

---

## 4. The four phases as one sequence

**What the learner does, and in which mode.** Time is estimated from the
prompts' size bands at about 200 words a minute. `nodes.phase_seconds` holds
the real numbers, and the budgets should be tuned from them.

| Step                                  | Learner                   | Mode (ICAP)              | Estimate (before §7)           |
| ------------------------------------- | ------------------------- | ------------------------ | ------------------------------ |
| Consume: pretest, per section         | answers cold, own words   | constructive             | 20–40 s                        |
| Consume: terms, body, worked example  | reads                     | passive                  | 2–4 min per section            |
| Consume: check, per section           | answers once, own words   | constructive             | 20–40 s                        |
| Consume: lens / ask about this        | optional                  | active                   | —                              |
| Explain: five cards                   | reads                     | passive                  | ~1 min                         |
| Explain: the listener's misconception | replies, own words, retry | constructive/interactive | ~1 min                         |
| Perform (procedures only)             | runs one case, shows work | constructive             | 5–10 min, as the case is sized |
| Perform: report                       | reads                     | passive                  | ~1 min                         |
| Retained: one card                    | retrieves, flips, grades  | constructive             | 10–30 s                        |

A mid-sized reading (3–4 sections) at the old bands is about 1,500 words, or
7–8 minutes. The reducer documents 8–15 minutes. With one check of 20–40
seconds per section, roughly four-fifths of Consume is passive. Section 6 is
about moving that share.

**What each generation reads.**

| Generation | Before this pass                        | After §7                                    |
| ---------- | --------------------------------------- | ------------------------------------------- |
| consume    | label, prerequisites, boundary, axes    | unchanged                                   |
| explain    | label, boundary, axes                   | unchanged — needs the warm move (§6.4)      |
| perform    | label, boundary, axes, the whole lesson | the lesson now opens the prompt             |
| retain     | label, state, a 400-character summary   | the reading's takeaways and the node's kind |

Because Explain and (until now) Retain never saw the lesson, three generations
each chose "the" misconception, "the" analogy and "the" order. A learner could
meet two different "most common mistakes" ten minutes apart, or one the reading
never mentioned on a card three weeks later.

---

## 5. Every prompt, every aspect

Each prompt is checked on the same axes: framing, inputs, instruction set,
field rules, shape and field order, example, length, fit with the validator,
and cache and cost. ✓ marks what §7 changed, → points to a §6 proposal, and
"keep" marks what should stay as it is.

### 5.1 Shared pieces (`common.ts`, `cellNote.ts`)

- **`sizeRule`** ✓. With `min === max` it rendered "write 2-2 sections. 2 is
  the right answer for …; only … earns 2" on every peripheral reading. It now
  says "write exactly 2 sections".
- **`consumeBand`** ✓. It now takes the node's kind, and a fact is two
  sections whatever its cell. The fact note no longer states a count.
- **`KIND_NOTES.fact.consume`** ✓. It said "1-2 sections" (impossible) and
  "explanation is wasted here". The second half contradicts the reading's own
  hook ("a reason it is this way, if there genuinely is one"), and an
  elaborative reason is the one kind of explanation a fact benefits from.
- **`KIND_NOTES.principle.consume`** ✓. "A FIGURE IS REQUIRED" applied to
  every section. It now applies to the section that explains the mechanism.
- **"Where a note differs, the note wins"** → §6.7. Two conflicts remain by
  design: `recognise` cells say "keep the prose short" against the body rule,
  and the hard cell says "one more example" while the shape allows one per
  section. Neither breaks a validator, but both ask the model to arbitrate.
- **`SYSTEM`**, **`languageNote`**, **`boundaryNote`**, **`interestNote`**:
  keep, as the previous pass left them.

### 5.2 Consume, the section prompt (`consume.ts` `consumeContext`)

- **Framing** — keep: second person, a tutor at a table, written for the
  sequence the learner actually meets.
- **The sequence it describes** ✓. It said "Continuing is gated on it". The
  screen asks the post-read check once and shows the answer on a miss
  (`SectionCheck.tsx`). The model was told about a gate that does not exist.
- **Activation** ✓. The first section now names the prerequisite this concept
  builds on (or, for a foundation, an everyday case) and the problem it leaves
  unsolved (§3.2.2). The prerequisites were already in the prompt and nothing
  used them.
- **Body length** ✓. From 2-5 paragraphs × 3-6 sentences to 2-4 × 2-5, with
  the reason in the rule: every sentence is reading time taken from the
  example and the check. At midpoints that is about 10 sentences a section
  instead of about 16.
- **The worked example and the check** ✓. The check's case must differ from
  the example's, so the example demonstrates and the check applies (§3.2.3).
- **Distractors** ✓. They were "plausible misreadings of this section", but a
  pretest is answered before reading, so the useful wrong options are what a
  newcomer answers from a natural wrong idea (§3.1.7).
- **The misconception** ✓. It is now "the standard one a good teacher warns
  about, not a rare one". Explain is told the same, so the two converge even
  before Explain is grounded.
- **Field order** — keep, with a known trade-off. Backward design would write
  the check before the body. That delays the first streamed prose by the check's
  100–150 tokens, and the pretest cannot use the check until the blind solve
  returns anyway. §6.6 gets both.
- **One item doing two jobs** → §6.2. The same check is the pretest and the
  post-read check. A lucky pretest collapses the section, a 1-in-3 chance in
  closed mode, and the post-read check repeats an item already seen.
- **`cite`** — keep as is. It remains an unverified surface
  (`RESEARCH-PROMPTS.md` §5.11).
- **Cost**: the prompt grew 13% (§7). The output is several times the input,
  and the body, its largest part, got shorter.

### 5.3 Consume's shape and filled example (`shapes.ts`)

- Keep. Three filled fields on an off-topic concept. The example's steps work
  17:40 and its check asks about 19:15, which already models the new rule.
- The shape's comments still carry counts only. Keep that split between the
  comments (counts) and the prompt (rules).

### 5.4 The blind solve of a check (`verify.ts` `verifyChunkCheck`)

- Keep: an outside check on the key (§3.1.3).
- **It cannot see whether a check stands alone.** It solves with the section in
  hand (`context: sectionText(chunk)`), so a check that only works after
  reading ("in the example above…") passes. The pretest needs it to work
  before reading. → Add a `pointsAtMaterial` flag beside `unstated` in the
  solver's answer. That is one more boolean in a call already being made.
- With §6.2's `transfer` item, verify both items in one call (`items: [...]`).

### 5.5 The lens prompt (`model.ts`)

- Keep the four briefs. "Analogy" names where it breaks in its last beat, and
  "deeper" is the small print.
- **"Example" works a "SECOND, different" case blind.** The context carries the
  section's body and takeaway, not its worked example, so the "different" case
  can be the same one. → Send `example` with the section (the client already
  holds it, and it becomes a key input), or stamp it on the server from
  `node_content`.

### 5.6 Ask about this (`passage.ts`)

- Keep. It answers the question asked, stays inside the section, and names a
  misunderstanding first. "2-3 short paragraphs, and stop" is right for
  someone mid-reading.

### 5.7 The own-words judge (`choice.ts`), as Consume and Explain use it

- Keep. It matches on meaning, normalises units, and maps a vague answer to
  the weakest candidate.
- **On a pretest a generous match is costly.** A half-right guess mapped to the
  key collapses the section. §6.2's confirming item makes one generous match
  insufficient; nothing in the judge has to change.

### 5.8 Explain (`explain.ts`)

- **Framing** ✓. It no longer promises a later teach-back (§1 #4).
- **Problem card** ✓. It is now "a concrete situation the listener could
  actually be in" (Merrill's problem-centred start, §3.2.2), not an abstract
  question.
- **Misconception** ✓. The standard one, which the reading just corrected.
- **Grounding** → §6.4. The prompt still writes from the label, so its analogy
  and order can differ from the reading's.
- **Card order** → §6.4. The check-back ("ask them to use it on a new case")
  is the last move of a real explanation, but it is shown before the listener's
  misconception is dealt with.
- **Replies** — keep. One defuses the misconception at its root; two fail for
  named explanation moves; lengths are matched; rotation is by node id.
- **Where it runs** → §6.4.

### 5.9 Perform (`perform.ts`)

- **Lesson placement** ✓. The lesson opens the prompt inside `<lesson>` tags
  (a closing tag in the lesson's own text is stripped), and the rule binding
  the case to it stays with the case rules.
- **Case novelty** ✓. "The same moves as the lesson's worked example, on a
  case the learner has not already seen worked": an isomorph, not a copy, as
  example–problem pairs want (§3.2.3).
- Keep subgoal step names, `mustShow` with values, sizing in minutes,
  `loadBearing`, and the own-method check (an outside signal).
- **The scaffold is one rung** → §6.5.

### 5.10 The Perform judge (`perform.ts` `performJudgeMessages`)

- Keep: learner text fenced, quote before verdict, comparison against a key,
  arithmetic checked.
- **"Without writing out the corrected value"** → §6.5. That is right for the
  exit path (same case later) and wrong for "Run it again" (a new case;
  `performRerun` bumps `rerun`). The judge cannot know which the learner will
  pick, so the value belongs in a field shown only on the new-case path.

### 5.11 The Retain factory (`retain.ts`)

- **Grounding** ✓. Each node now carries what its reading taught (its
  takeaways), stamped by the server from `node_content` (`withNodeCell` →
  `withRetainNodes`). The map summary is the fallback.
- **Kind** ✓. Stamped from `nodes.kind`, and it decides the card type: fact →
  recall, principle → why, procedure → apply, concept → classify a case. This
  closes the open item on `kindNote`.
- **State** ✓. No longer in the prompt or the key (`retainNodes` in
  `jobInput.ts`).
- Keep the card rules, `back` as the grading key and the short `reExplain`.
- **The 8-node batch is keyed by its exact node set**, so two learners almost
  never share a draft, and the draft runs when Review opens → §6.3.

### 5.12 A typed Retain answer, graded (`recall.ts` judge, via `useRetain.retainFlip`)

- **Wrong framing** → §6.3. "The learner just wrote down, from memory …
  everything they could still produce about X" and "2-4 sentences … quoting
  their actual words" are free recall. A card's answer is a few words, and its
  suggestion should be one line the learner reads before grading themselves.

---

## 6. The refactor — the four phases as one lesson

### 6.1 One lesson spine

Constructive alignment: what is practised and kept is what was taught. The
spine of a reading is:

- its **takeaways** (one per section, written first);
- its **terms**;
- its **subgoal labels** (the bold labels that lead each worked step);
- the **misconception it refuted**.

The first three can be derived from today's payload. The fourth is prose
inside a body. Add it as an optional field on the section where it bites:

```json
"misconception": { "belief": "…", "tempting": "…" }
```

It is optional and additive. The web validator builds sections explicitly, and
iOS decodes `ConsumeChunk` through keyed `CodingKeys`, which ignore unknown
keys. So no `VERSION` bump is needed, only a `PROMPT_REV` bump. The server
stamps a digest of the spine on the phases that need it, as it stamps `lesson`
on Perform and `taught` on Retain:

| Phase    | Reads from the spine                                                           |
| -------- | ------------------------------------------------------------------------------ |
| Explain  | the misconception (the listener voices it); takeaways (the order follows them) |
| Perform  | subgoal labels (step names match the example's); the whole lesson, as today    |
| Retained | takeaways (one card each); the misconception (one "why" card on core nodes)    |

### 6.2 Consume: prequestion → teaching → worked example → paired problem

Each section becomes Merrill's cycle in miniature: activation, demonstration,
application.

| Step | Today                                     | Proposed                                                               |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------- |
| 1    | Pretest: `check`, cold. Right → collapse. | Pretest: `check`, cold. Right → step 1b.                               |
| 1b   | —                                         | Confirm: `transfer`, cold. Right → collapse. Wrong → open the section. |
| 2    | Read the terms, body and example.         | Same, shorter (§7).                                                    |
| 3    | Post-read check: the same `check` again.  | Paired problem: `transfer`, a new case of the same takeaway.           |

- **Shape**: an optional `transfer` with `check`'s shape. Old rows have none
  and keep today's flow. The pretest stays `check`, so the collapse logic and
  `pretestClean` keep their meaning.
- **Why**: a learner who knew the section answers two questions (~40 s) instead
  of reading it. A lucky skip in closed mode falls from 1 in 3 to 1 in 9. The
  post-read item becomes an application on a fresh case (§3.2.3, §3.2.11)
  instead of a repeat.
- **Cost**: about 120 output tokens per section. Verify both items in one blind
  solve, so no extra call.
- **Options, measured separately**:
  - a generic self-explanation line under the worked example (client only,
    ungraded; §3.2.4);
  - the confidence tap before the pretest (§3.2.10);
  - sending the worked example to the "example" lens (§5.5).
- **Touches**: `shapes.ts`, the validator, `lib/curriculum/consume.ts`
  (`afterPretest` plus a confirm step), `SectionCheck.tsx`, `ConsumeView`,
  `verify.ts`; on iOS `PhaseContent.swift`, `ConsumeViewModel`, `ConsumeView`;
  tests in `consume.test.ts` and `stream.test.ts`.

### 6.3 Retained: a per-node card factory, written when the reading ends

**Today.** Review opens, or a warm fires, and one generation writes cards for
up to eight uncovered nodes. It is keyed by that exact node set, so it is
almost never shared, and it is written from whatever grounding reaches it
(§7 now sends the takeaways).

**Proposed.**

- A per-node kind, `cards`, keyed by
  `{topic, nodeId, nodeLabel, nodeKind, taught, language}`.
- It is warmed when Consume finishes, so a node's cards exist before it is
  ever reviewed.
- One card per takeaway, at most three, typed by kind (§3.2.11). Core nodes
  get one more: a "why" card on the refuted misconception.
- Two learners who read the same lesson share the cards, and Review never
  waits on a model.
- **The typed answer**: a `card` judge mode with one row, a one-line
  `response`, and no free-recall framing (§5.12).
- **Touches**: a new generate kind (`job.ts`, `CACHEABLE`), `useRetain`'s
  `retainPlan` and iOS `Warm.swift` (which fill the card store from it), the
  judge route. The `retain` batch kind stays for old clients.

### 6.4 Explain: only where it earns its place, grounded, reordered

1. **Ride with Feynman, not with Consume.** In `resolvePlan`, keep `explain`
   only when `feynman` survives the bar and the cap. Fact, working and
   peripheral nodes lose a phase whose stated purpose (a model before the
   learner explains it unaided, §3.2.13) does not apply to them. They keep
   Consume's refutation.
   - This is a product decision. Plans are frozen at build, so only new maps
     change. Update the AGENTS.md "Explain rides behind Consume" paragraph and
     the plan comment in `phases.ts`.
   - The invariants in `curriculum.test.ts` still hold: Explain keeps homes.
2. **Ground it.** Move the Explain warm from Consume's open to the moment its
   payload commits (`warmNext(node, "consume")` in `useSpiral`, and the
   equivalent on iOS), then stamp the §6.1 digest. The listener then voices the
   misconception the reading refuted, and the learner's reply is retrieval of
   that refutation, not a second exposure to a new one.
   - The previous pass declined this because a warm at open time would hash
     without the lesson and the click with it, paying twice. Warming on commit
     removes the race.
3. **Reorder the reveal**: problem → analogy → order → misconception → the
   reply → check-back. Client only (`EXPLAIN_CARDS`, and when the check
   opens); the shape is unchanged.

### 6.5 Perform: fade the support from the key it already has

| Rung (on stall) | Shown                                    | Source              |
| --------------- | ---------------------------------------- | ------------------- |
| 1               | the first subgoal, never its result      | `scaffold` (today)  |
| 2               | the outline: every step's name, in order | `steps[].step`      |
| 3               | the first step worked, with its value    | `steps[0].mustShow` |

- **Client only.** The content exists. Subgoal names inside the run are
  procedural information given just in time (§3.2.14); rung 2 is
  subgoal-label scaffolding (`RESEARCH-PROMPTS.md` §3.6).
- **Gate.** A run that used rung 2 or 3 passes the report but holds the gate a
  night and parks a fresh case, the Crucible guided-rung rule. The cold run
  stays the proof.
- **Feedback.** An optional `fix` in the judge's response: the first broken
  step's correct result and the reason. It is shown only on "Run it again"
  (a new case) and hidden on exit (the same case later). It is additive, so old
  clients ignore it.

### 6.6 The pipeline: plan, then write

**Today.** One decode writes every section in order. Each check is written
after its body. Overlap between sections is discouraged only in prose.

**Proposed.**

1. **Plan call.** For every section: kicker, takeaway, `check` and `transfer`;
   plus the misconception and the section it bites in. About 400–600 output
   tokens. Blind-solve every item in one call. Cache the plan: it is the spine
   (§6.1).
2. **Section calls, in parallel**, each with the whole plan in its prompt:
   terms, body, example, figure, ask. Frames are still yielded in index order.

**For it:**

- Sections cannot overlap, because each sees the others' takeaways.
- The assessment is written before the instruction.
- Items are verified before any prose exists.
- The spine exists about ten seconds in, so Explain and Retain can be grounded
  at warm time.
- The section calls share one long prefix (system, rules, plan), which is where
  provider prefix caching pays (§3.1.6).

**Against it:**

- The first prose arrives later (the plan comes first). The outline, kickers
  and takeaways, can paint first as an advance organiser.
- More calls.
- Section calls written apart can drift in voice.

**Adopt only on numbers**: `overlap_uncached`, section count, words per
section, `verify_dropped`, time to first section, and output tokens per pass,
each against today's single decode.

### 6.7 Prompt assembly: one rule per field, resolved in code

Replace "general rules + kind/domain/cell notes + the note wins" with
per-field builders, for example `bodyRule(kind, domain, cell)`,
`exampleRule(kind, domain)`, `figureRule(kind)` and `checkRule(kind)`. Each
returns one sentence. Defaults (`concept`, `general`, the default cell) return
today's text, so those prompts stay byte-identical. The notes keep only what is
not a field rule (a domain's idea of evidence, a lens). This removes the
arbitration that produced findings 5 and 7, and it shortens every
non-default prompt.

### 6.8 What each proposal touches

| Proposal                   | Server | Web | iOS | `VERSION` | `PROMPT_REV`              |
| -------------------------- | :----: | :-: | :-: | :-------: | ------------------------- |
| 6.1 spine field + digest   |   ✓    |  —  |  —  |    no     | consume, explain          |
| 6.2 `transfer` item        |   ✓    |  ✓  |  ✓  |    no     | consume                   |
| 6.3 per-node card factory  |   ✓    |  ✓  |  ✓  |    no     | new kind                  |
| 6.4 Explain plan rule      |   —    |  ✓  |  —  |    no     | —                         |
| 6.4 grounding + reorder    |   ✓    |  ✓  |  ✓  |    no     | explain                   |
| 6.5 Perform ladder + `fix` |   ✓    |  ✓  |  ✓  |    no     | — (the judge is uncached) |
| 6.6 plan, then write       |   ✓    |  —  |  —  |    no     | consume                   |
| 6.7 per-field rules        |   ✓    |  —  |  —  |    no     | every kind it moves       |

Every shape change is an optional, additive field. Both clients ignore keys
they don't declare, so no proposal needs a `VERSION` bump.
`docs/CONTENT-STORAGE.md` remains the contract.

### 6.9 Order, and what to measure

Ship in this order: 6.4 (1) → 6.1 with 6.4 (2) → 6.2 → 6.5 → 6.3 → 6.6 and 6.7.
Read these before and after each change:

| Metric                                                      | Source                                           |
| ----------------------------------------------------------- | ------------------------------------------------ |
| Seconds per phase, per node kind and cell                   | `nodes.phase_seconds`                            |
| Pretest collapse rate, and collapses later failed at Recall | `ConsumeProgress.pretest`, Recall verdicts       |
| Post-read check accuracy                                    | `ConsumeProgress.checks`                         |
| Distractor pick rate per option                             | `checks[*].oi` against the stored order (§3.1.7) |
| Disputed keys                                               | `verify_dropped`                                 |
| Words per section, sections per pass                        | the cached `consume` payloads                    |
| Perform first-run pass rate, re-run pass rate               | `phase_attempts`                                 |
| Card lapse rate by type and kind                            | the FSRS store                                   |
| Flip suggestion vs the learner's grade                      | `retainFlip` suggestions against `retainGrade`   |

---

## 7. What this commit implements

Prompt text, two pieces of server stamping, and tests. No payload shape
changed and no client changed. `PROMPT_REV` moves `consume`, `explain`,
`perform` and `retain` to 3, so those four kinds regenerate on their next
unvisited node. Nobody loses content they already have (`node_content` keeps
it).

| Change                                                                              | Where                                       | Why            |
| ----------------------------------------------------------------------------------- | ------------------------------------------- | -------------- |
| A one-count band renders as "exactly N"                                             | `sizeRule` (`common.ts`)                    | §1 #6          |
| A fact is two short sections; the note no longer counts                             | `consumeBand` (`cellNote.ts`), `KIND_NOTES` | §1 #5, §3.1.5  |
| A principle's figure is required where the mechanism is explained, not everywhere   | `KIND_NOTES.principle.consume`              | §1 #7          |
| The reading opens from a named prerequisite and the gap it leaves                   | `consumeContext`                            | §3.2.2         |
| Body 2-4 paragraphs × 2-5 sentences, with the reason                                | `consumeContext`                            | §3.2.1, §3.2.8 |
| The check's case differs from the worked example's                                  | `consumeContext`                            | §3.2.3         |
| Distractors from a natural wrong idea; the standard misconception                   | `consumeContext`, `generateExplain`         | §3.1.7         |
| The described flow matches the screen (asked once; a miss shows the answer)         | `consumeContext`                            | §5.2           |
| Explain promises no teach-back; its problem card is a concrete situation            | `generateExplain`                           | §1 #4, §3.2.2  |
| The lesson opens Perform's prompt, fenced; the case is a new case of the same moves | `lessonBlock`, `lessonRule` (`perform.ts`)  | §3.1.1, §3.2.3 |
| Retain nodes carry their reading's takeaways and their kind, stamped by the server  | `withRetainNodes` (`store/nodes.ts`)        | §1 #1, #9      |
| Retain types cards by kind; state leaves the prompt and the key                     | `retain.ts`, `retainNodes` (`jobInput.ts`)  | §3.2.11        |

**Tests.** `tests/phasePrompts.test.ts` renders each prompt through a mocked
model and pins the changes above. It also covers Retain's stamping against the
fixture database: takeaways and kind are read from the stored rows, a client's
copies are dropped, and a node's key no longer depends on its state.
`tests/validators.test.ts` pins the principle's figure rule.

**Prompt length** (words, same inputs, before → after):

| Prompt                     | Before | After | Change |
| -------------------------- | -----: | ----: | -----: |
| consume, a procedure node  |  1,459 | 1,647 |   +13% |
| consume, a fact node       |  1,459 | 1,594 |    +9% |
| explain                    |    730 |   787 |    +8% |
| perform, before any lesson |    545 |   545 |     0% |
| retain, three nodes        |    842 |   951 |   +13% |

Retain's prompt also grows by each node's takeaways, capped at 700 characters a
node. What the learner reads goes the other way: a section's body is bounded at
about 10 sentences at the band's midpoints instead of about 16.

**Not measured.** There was no model key where this was written, so no
generation or eval ran. Before deploying, run `npm run eval` and the content
panel against the previous prompts, and read:

- validation-fail rate per kind;
- sections per pass and words per section;
- `verify_dropped` on Consume checks;
- pretest-collapse rate;
- on fact nodes: `consume_stream_fallback` and uncached single-section passes,
  which should go to zero.

## 8. Consume as reels

Consume is now read as a vertical feed of full-screen cards, one idea per
screen, swiped through, the way a phone already reads short video. The page
view is one tap away and is remembered per device.

### 8.1 Why this shape teaches better, not only differently

- **One idea per screen is segmenting, at its finest grain.** Segmented
  material has small-to-medium effects on retention and transfer (§3.2.8,
  Rey et al. 2019). A section used to arrive as 2-5 paragraphs at once, and the
  three readings in the database averaged about 180 words of prose plus
  about 100 of worked example per section.
- **A question every few cards is interpolated testing.** Tests between
  segments halved mind-wandering (§3.2.8, Szpunar et al. 2013). In the reels
  the check is one card in six or seven, not the end of a long scroll.
- **The check now comes before the takeaway.** On the page the takeaway sat
  above the check, so the check could be answered by reading the summary just
  above it. In the feed the learner answers from the beats and the example,
  which is retrieval, and the takeaway card then confirms and closes the
  section.
- **The first beat is a hook.** It poses the problem the section answers
  (Merrill's problem-centred start, §3.2.2), so the first screen earns the
  swipe.
- **Read-aloud has word-by-word captions.** Each card can be heard, with the
  word being spoken marked, and auto-play reads card after card hands-free.
  It stops at any card that asks something: the voice never answers for the
  learner.

### 8.2 What the learner sees

| Card       | What it holds                                                               | Rail |
| ---------- | --------------------------------------------------------------------------- | :--: |
| `pretest`  | the section's check, answered cold; nothing is dealt past it until answered |  —   |
| `beat`     | one beat of the prose in large type; the first carries the terms            |  ✓   |
| `example`  | the worked example; its steps land one after another                        |  ✓   |
| `figure`   | the diagram and its caption                                                 |  ✓   |
| `check`    | the post-read check, answered once; nothing past it until answered          |  —   |
| `takeaway` | the one line to keep, with Continue / Finish                                |  ✓   |

- **The rail** (right edge, where a reel keeps it): the four lenses, "Ask"
  (seeded with the card's own text and opened as a bottom sheet), "Listen",
  and "Skip" (folds the section to its takeaway; its check is still owed).
- **The story bar**: a segment per section, filling card by card. A reached
  segment jumps to its section.
- **Navigation**: swipe, the arrow under each card, or the keyboard (arrows,
  Page keys, Space, j/k).
- **Continue** carries the learner to where the next section starts.

### 8.3 What did not change

The reels are a view, not a second state. `consumeReel` deals cards from the
same `ConsumeProgress`, and the screen drives the same callbacks, so these all
behave as before:

- the pretest collapse;
- the answered-once check;
- the gates;
- `pretestClean` and the proof gate;
- the recap (now `ConsumeRecap`, shared by both views);
- saved progress and the node's ledger.

Every e2e spec that walks through Consume passes unchanged against the reels,
through the same test ids.

### 8.4 The content

The prompt now asks for the body as 2-5 beats of 1-3 sentences, at most about
50 words each, the first one a hook. Worked-example steps are one line each.
`PROMPT_REV.consume` moves to 4.

A reading cached before this change is split on the client, at sentence ends,
into cards of at most 60 words (`reelBeats`), so it reads in the feed without
regenerating.

### 8.5 Open

- **iOS** still reads the pass as a page. The beats read well there as short
  paragraphs, and nothing breaks. A native feed is a paging `ScrollView` over
  the same deck logic, ported to Swift.
- **Measure before tuning:**
  - seconds per card and per section (add a per-card timer to
    `phase_seconds`);
  - reading completion;
  - pretest-collapse rate;
  - post-read check accuracy, now that it precedes the takeaway;
  - how often learners switch to the page view.
- **The confirming pretest item (§6.2)** fits the feed as one more card.
  Without it, a lucky guess still folds a section.

---

## Sources

**Prompting.**

- [Anthropic — Long context prompting tips](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips)
- [Chroma — Context Rot (2025)](https://research.trychroma.com/context-rot)
- [Prompt Chaining or Stepwise Prompt? Findings of ACL 2024](https://preview.aclanthology.org/nschneid-patch-4/2024.findings-acl.449)
- [Plan-and-Write: structure-guided length control (2025)](https://arxiv.org/html/2511.01807v1)
- [Huang et al. — LLMs Cannot Self-Correct Reasoning Yet (ICLR 2024)](https://arxiv.org/abs/2310.01798)
- [LIFEBench — length instruction following (NeurIPS 2025)](https://neurips.cc/virtual/2025/loc/san-diego/poster/121535)
- [YapBench — Do Chatbot LLMs Talk Too Much? (2026)](https://arxiv.org/abs/2601.00624)
- [DeepSeek — Context caching](https://api-docs.deepseek.com/guides/kv_cache)
- [Feng et al. — Automated distractor generation for math MCQs (NAACL 2024)](https://arxiv.org/pdf/2404.02124v2)
- [Do LLMs Make Mistakes Like Students? (2025)](https://arxiv.org/html/2502.15140v1)
- [Can LLMs Model Incorrect Student Reasoning? (2026)](https://arxiv.org/abs/2603.15547)
- [LLM tutoring dialogues: quality and correctness (2025)](https://arxiv.org/html/2503.16460v1)
- [Human–AI co-creation of worked examples (WorkedGen)](https://warwick.ac.uk/fac/cross_fac/eduport/edufund/projects/yang/projects/human-ai-co-creation-of-worked-examples-for-programming-classes/)

**Learning science.**

- [Chi & Wylie 2014 — the ICAP framework](https://chilab.asu.edu/sites/default/files/lcl/chiwylie2014icap_2.pdf)
- [Chi et al. 2018 — translating ICAP into classrooms](https://education.asu.edu/sites/default/files/lcl/chi_et_al-2018-cognitive_science.pdf)
- [ICAP critique, npj Science of Learning 2023](https://www.nature.com/articles/s41539-023-00197-4.pdf)
- [Merrill — First Principles of Instruction, synthesis](https://www.yorku.ca/unsdgs/toolkit/wp-content/uploads/sites/617/2023/04/Merrills-First_Principles_of_Instruction_A_synthesis.pdf)
- [van Gog, Kester & Paas 2011 — example–problem pairs](https://research.ou.nl/en/publications/effects-of-worked-examples-example-problem-pairs-and-problem-exam/)
- [van Harsel et al. 2019 — EP vs PE](https://link.springer.com/10.1007/s11251-019-09484-3)
- [Bisra et al. 2018 — Inducing self-explanation, a meta-analysis](https://doi.org/10.1007/s10648-018-9434-x)
- [Renkl, Atkinson et al. — fading worked examples](https://faculty.engineering.asu.edu/mre/wp-content/uploads/sites/31/2020/02/Stat_Adapt_Fad_JEE06.pdf)
- [Alemdag et al. — learning from erroneous examples, meta-analysis](https://www.leibniz-ipn.de/en/research/publications/a-framework-for-learning-from-erroneous-examples-and-meta-analysis-of-empirical-research)
- [Sinha & Kapur 2021 — productive failure, a meta-analysis](https://doi.org/10.3102/00346543211019105)
- [From problem-solving to sensemaking — a comparative meta-analysis (2021)](https://www.research-collection.ethz.ch/entities/publication/087241d3-ca0e-469e-a7f3-df9c122e2585)
- [Szpunar, Khan & Schacter 2013 — interpolated tests](https://psychology.fas.harvard.edu/publications/interpolated-memory-tests-reduce-mind-wandering-and-improve-learning-online)
- [Rey et al. 2019 — a meta-analysis of the segmenting effect](https://www.doi.org/10.1007/S10648-018-9456-4)
- [Van der Kleij, Feskens & Eggen 2015 — feedback in computer-based learning](https://people.acer.org/en/publications/effects-of-feedback-in-a-computer-based-learning-environment-on-s/)
- [Hypercorrection persists over a week (2011)](https://pubmed.ncbi.nlm.nih.gov/21989771/)
- [Hypercorrection in the classroom (2018)](https://pubmed.ncbi.nlm.nih.gov/29781391/)
- [Pan & Rickard 2018 — transfer of test-enhanced learning](https://sc-pan.github.io/pdf/PR_2018.pdf)
- [Agarwal 2019 — retrieval practice and Bloom's taxonomy (summary)](https://www.learningscientists.org/blog/2019/6/27-1)
- [Adesope, Trevisan & Sundararajan 2017 — Rethinking the use of tests](https://education.wsu.edu/documents/2018/01/rethinking-use-tests.pdf/)
- [Dunlosky et al. — successive relearning](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)
- [Higham et al. — successive relearning in the classroom](https://eprints.soton.ac.uk/449677/1/Higham_et_al._in_press_JEdPsych.pdf)
- [Kobayashi 2019 — preparing to teach and teaching, meta-analysis](https://zendy.io/title/10.1111/jpr.12221)
- [Kobayashi 2024 — teaching expectancy, meta-analysis](https://www.x-mol.com/paperRedirect/1763030854519197696)
- [MIT — Four-Component Instructional Design (4C/ID)](https://openlearning.mit.edu/mit-faculty/research-based-learning-findings/four-component-instructional-design-4cid)
- [Kalyuga 2007 — the expertise reversal effect](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf)
- [Bachiri et al. 2025 — generative AI flashcards in MOOCs](https://files.eric.ed.gov/fulltext/EJ1481879.pdf)
- [An et al. 2025 — LLM-generated retrieval practice](https://arxiv.org/pdf/2507.05629v2)
