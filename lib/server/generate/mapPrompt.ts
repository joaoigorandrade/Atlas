// The map prompt: everything that builds the words the model is asked, kept
// apart from the validation and layout that interpret its answer.
//
// The split is not filing — it is the two halves of `map.ts` having genuinely
// different reasons to change. A new domain row or a reworded size rule is a
// prompt edit; a new field on a node is a validator edit. Holding both in one
// file is what pushed it past its ceiling once the domain axis landed.

import { sizeRule } from "./common";
import { PARETO_DEFAULT, type GoalKind } from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";

const GOAL_HINT: Record<GoalKind, string> = {
  exam: "The learner is preparing for an exam — cover the canonical syllabus.",
  project: "The learner wants to build something real — bias toward applicable tools.",
  mastery: "The learner wants deep general mastery — favor conceptual foundations.",
  pareto: "", // supplied per-request by `paretoNote` — it depends on the chosen share.
};

export interface MapParams {
  topic: string;
  goal: GoalKind;
  /** Share of real-world results to cover when goal is "pareto" (#pareto):
   *  a smaller map of only the highest-leverage concepts. */
  paretoPct?: number;
  /** Extracted syllabus/outline text that grounds the map (#30), if uploaded. */
  outline?: string;
  language?: Language;
}

/** The opening every curriculum-adjacent prompt shares: what to build, what
 *  grounds it, and the too-broad escape hatch. */
function paretoNote(params: MapParams): string {
  if (params.goal !== "pareto") return "";
  const pct = params.paretoPct ?? PARETO_DEFAULT;
  return `The learner wants a Pareto map: only the concepts that carry roughly the top ${pct}% of real-world results in this topic, at the least effort. Ruthlessly drop edge cases, history, rarely-used variants and completeness-for-its-own-sake — keep what a competent practitioner actually uses ${pct === 80 ? "most weeks" : "every day"}. A smaller, higher-leverage map is the goal, not coverage.`;
}

/** Concept-count band per map: the range the prompt asks for, plus the
 *  validator bounds around it. A Pareto map is deliberately smaller. */
export function mapNodeBounds(paretoPct?: number): {
  ask: [number, number];
  min: number;
  max: number;
} {
  // The band is wide on purpose and the prompt picks from it: a topic that is
  // one technique is not 12 concepts, and asking for 12 anyway got 12 — the
  // surplus arriving as chapter headings and split hairs.
  // The band is the union across domains, because the prompt carries the
  // per-domain target and the model picks its own row: a Spanish map of 30
  // competencies and a formal map of 12 concepts come back through the same
  // validator. Its job here is catching nonsense (2 nodes, 90 nodes), not
  // enforcing a band the prompt states more precisely.
  if (paretoPct === undefined) return { ask: [6, 16], min: 5, max: 44 };
  // 20% -> ~7 concepts, 50% -> ~12, 80% -> ~17.
  const target = Math.round(4 + (paretoPct / 100) * 16);
  return {
    ask: [target - 1, target + 1],
    min: Math.max(4, target - 3),
    max: target + 4,
  };
}

export function mapContext(params: MapParams): string {
  const { topic, goal, outline } = params;
  const grounding = outline?.trim()
    ? `\nGround the map in this course outline the learner uploaded — its units and their order are the source of truth for what to cover:\n"""\n${outline.trim().slice(0, 6000)}\n"""\n`
    : "";
  return `Build a prerequisite concept map for the topic "${topic}". ${GOAL_HINT[goal]}${paretoNote(params)}
${grounding}
If (and only if) the topic is far too broad for one coherent concept map (e.g. "science", "math", "history"), instead return ONE object and nothing else:
{"tooBroad": true, "scopes": [{"label": "a focused sub-topic (2-4 words)", "note": "one sentence on what this scoped map covers"}, ...]}   // exactly 2-3 offers`;
}

export const graphShape = (ask: [number, number]) => `{
  "nodes": [{"id": "short-kebab-id", "label": "Concept Name", "summary": "one sentence on what this concept is", "kind": "fact|concept|procedure|principle", "domain": "formal|executable|empirical|interpretive|performative|craft|general"}, ...],   // ${ask[0]} to ${ask[1]} concepts, foundations through capstone
  "edges": [["prereq-id", "dependent-id"], ...]                        // direction is prerequisite -> dependent; must form a DAG; every non-root node needs at least one prerequisite
}`;

/**
 * What kind of thing each concept is — which decides how it gets practised.
 *
 * The discriminator is what the learner must be able to *do*, never the
 * subject area: "photosynthesis" and "how a bill becomes law" are both
 * `principle`. Ambiguity resolves to `concept`, which is what every node was
 * before kinds existed, so a bad pick costs nothing.
 */
export const KIND_RULE = `"kind" is exactly one of:
  "fact" — an arbitrary association with nothing to reason from: a date, a symbol, a constant, a term's name. Knowing it IS remembering it.
  "concept" — a class with defining attributes, members and non-members. The learner must be able to tell instances from near-misses.
  "procedure" — an ordered sequence the learner carries out to produce an outcome. The learner must be able to run it, not just describe it.
  "principle" — a causal relation or multi-stage mechanism. The learner must be able to predict what happens when one part changes.
Pick by what the learner must be able to DO, not by subject area. When two fit, choose "concept".`;

/**
 * The second axis: what SETTLES a claim here.
 *
 * Independent of `kind` — a procedure exists in every domain — and, like kind,
 * never read off the subject. History and religion are both `interpretive`
 * because their epistemics are identical: a text, a context, a contested
 * reading, provenance that matters. The topic string already carries the
 * subject into every prompt; this carries the stance.
 */
export const DOMAIN_RULE = `"domain" is what SETTLES a claim in this corner of the world. It is INDEPENDENT of "kind" — a procedure exists in every domain — and, like kind, is never read off the subject area:
  "formal" — settled by derivation from stated rules. Mathematics, logic, theory.
  "executable" — settled by running it and watching it fail. Programming, engineering, protocols.
  "empirical" — settled by measurement, carrying uncertainty. The sciences, medicine, econometrics.
  "interpretive" — settled by a source read in context, and genuinely contested between honest readers. History, religion, law, literature, philosophy.
  "performative" — settled by producing it live, in real time, where fluency is the point. Languages, performance, rhetoric.
  "craft" — settled by a physical artifact no screen can inspect. Woodwork, cooking, welding, repair, gardening.
  "general" — none of those genuinely fits. Choose it rather than forcing one.
Decide the TOPIC'"'"'s domain first and build the whole map by its row below. Then tag each node with its OWN domain: most match the topic'"'"'s, but a machine-learning map has "formal" nodes (the gradient) and "executable" ones (implement the layer).`;

/**
 * Layer 1: what the domain does to the MAP, as opposed to what it does to a
 * node's prompt. Every row travels in every map prompt and the model applies
 * the one it chose — a separate classification call would put a second cold
 * generation on the onboarding path, which is the one place latency is already
 * the whole experience.
 *
 * These rows override the generic rules above them, including the size band,
 * which is why they are appended last.
 */
export const DOMAIN_MAP_RULE = `NOW APPLY YOUR CHOSEN DOMAIN. This row overrides anything above it that conflicts, the concept count included:
- formal: an edge means "B is incoherent until A is understood". Foundations to capstone, 10-14 concepts. Every node must be something the learner can be made to DO on paper, not only recognise.
- executable: an edge means "you cannot build B without A". 10-16 concepts, each one something that can be built and run.
- empirical: an edge means "B'"'"'s evidence assumes A". 10-18 concepts. Prefer nodes where a quantity is measured or a claim is tested over nodes that only name a phenomenon.
- interpretive: an edge means "A SET THE STAGE FOR B" — NOT "A is a prerequisite of B". Order the map CHRONOLOGICALLY, earliest first; the Council of Nicaea is not a prerequisite of the Great Schism, it is earlier. 22-40 nodes, and they are events, institutions, movements, controversies and DOCUMENTS — not "concepts". Include at least one node that is a single primary source, and one that is the historiography itself: how this story is told differently by different traditions. If the topic spans more than roughly three centuries, do not build one map — return the scope offer, and make the offers PERIODS rather than themes.
- performative: nodes are COMPETENCIES the learner performs, never concepts they understand — "ordering food", "the sounds that mark a foreign speaker", "the 300 highest-frequency words". An edge means "you need A to say B". Order by frequency x real utility, not by grammatical tidiness. 22-35 nodes. If the output language is closely related to the target (Portuguese and Spanish, say), say so and spend the map ONLY on the deltas — false friends, the contrasts that genuinely differ, and pronunciation — skipping everything that transfers for free. Include one node whose whole job is catching the learner being understood while still wrong.
- craft: the map IS the build sequence and it is IRREVERSIBLE — an edge means "A must be finished before B can start". 8-14 stages. The FIRST node is always the manifest: materials, cut list, tools, total cost and total hours, with nothing to learn and everything to gather. Every later node is a stage the learner carries out away from the screen, so each must name its tolerances and the ways it goes wrong.
- general: the generic rules above stand unchanged.`;

/** The summary rule, shared by the single-shot and streamed map prompts: it is
 *  the only thing the detail rail says about the topic itself, so it has to
 *  teach the gist rather than restate the label. */
export const SUMMARY_RULE = `"summary" is ONE sentence (max ~22 words) telling a learner who has never met this concept what it actually is and what it lets them do — concrete and specific to this topic. Never restate the label ("Gradient Descent is about gradient descent"), never describe the concept's role in the map or its difficulty, never start with "This concept".`;

export const mapRules = (ask: [number, number]) =>
  `Rules: labels are 1-3 words, capitalized the way the output language capitalizes a heading — English title case, but sentence case in languages that do not title-case (pt-BR: "Reações dependentes da luz", never "Reações Dependentes Da Luz"). ${SUMMARY_RULE}
${KIND_RULE}
${DOMAIN_RULE}
${sizeRule({
  unit: "concepts",
  min: ask[0],
  max: ask[1],
  atMin:
    "a topic that is one technique or one mechanism, where a handful of concepts genuinely is the whole of it",
  atMax: "a broad field with several separate branches a learner must cross",
})}
The map must read left-to-right from true foundations to the topic's capstone ideas. Every node is a CONCEPT the learner can be taught and then tested on — never a chapter heading or a container: no "Introduction", "Overview", "Fundamentals", "Advanced Topics", "Applications", "Conclusion".

${DOMAIN_MAP_RULE}`;
