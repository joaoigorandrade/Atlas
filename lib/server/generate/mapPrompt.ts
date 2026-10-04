// The map prompt: everything that builds the words the model is asked, kept
// apart from the validation and layout that interpret its answer.
//
// The split is not filing — it is the two halves of `map.ts` having genuinely
// different reasons to change. A new domain row or a reworded size rule is a
// prompt edit; a new field on a node is a validator edit. Holding both in one
// file is what pushed it past its ceiling once the domain axis landed.

import { sizeRule } from "./common";
import {
  DIFFICULTIES,
  GOAL_CELLS,
  IMPORTANCES,
  PARETO_DEFAULT,
  type GoalKind,
} from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";

const GOAL_HINT: Record<GoalKind, string> = {
  exam: "The learner is preparing for an exam — cover the canonical syllabus of exactly what the topic names.",
  project: "The learner wants to build something real — bias toward applicable tools.",
  mastery:
    "The learner wants deep general mastery — favor the conceptual foundations of exactly what the topic names.",
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
  /** This topic IS a scope the learner just picked off a too-broad offer, so
   *  the escape hatch is spent — offering it again is the app re-asking a
   *  question it has already been answered. See `mapContext`. */
  scoped?: boolean;
  /** The other maps of this map's continent (`withTopicAxes`) — each owns its
   *  own concepts, so this map must not carry them. */
  neighbours?: string[];
  /** The outline is the section list of the one part the topic names
   *  (`withSyllabus`) — the map's boundary, not a guide to it. */
  part?: boolean;
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

// "Circuitos elétricos capítulo 2" came back as the whole course: the goal
// hints and the syllabus step both read the book's name and mapped the book.
// A named part is the learner saying where they are — earlier parts are behind
// them, and a gap there surfaces through the checks, not through the map.
const PART_OF_WORK = `If the topic names ONE PART of a larger work — a chapter, section, unit or lecture of a book or course ("capítulo 2", "Ch. 3", "Lecture 5") — map ONLY that part. If the topic itself lists the part's sections or contents, those ARE the part, exactly. Otherwise first recall that part's own sections in that work; every concept comes from those sections, from the part's first idea to its capstone. Nothing an earlier part already taught is a concept here, not even as a root (for a textbook's chapter 2, chapter 1's definitions, units and sign conventions are held by the learner), and nothing a later part teaches either. Name the part's title as you understand it in the first concept's summary. A topic that names no such part is mapped as usual.`;

export function mapContext(params: MapParams): string {
  const { topic, goal, outline } = params;
  // As a guide, a chapter's section list still let chapter 1's sign
  // convention in as a root: the "foundations" rules outweighed it.
  const grounding = !outline?.trim()
    ? ""
    : params.part
      ? `\nThe learner named one part of a work. These are THAT part's sections, and they are the map's HARD BOUNDARY:\n"""\n${outline.trim().slice(0, 6000)}\n"""\nEvery concept must be one these sections themselves introduce. A concept they only use — taught in an earlier part — is NOT a node, not even a root or a foundation; the learner already holds it. Nothing past these sections either. This overrides every rule below about foundations.\n`
      : `\nGround the map in this course outline the learner uploaded — its units and their order are the source of truth for what to cover:\n"""\n${outline.trim().slice(0, 6000)}\n"""\n`;
  // A picked scope arrives as a bare label with its period or qualifier left
  // behind in the offer's note, so the model re-reads it as wide and offers to
  // scope it again — and again. Three rounds deep on church history the
  // learner still has no map, because `DOMAIN_MAP_RULE.interpretive` measures
  // centuries and a label carries no dates. The escape hatch is answered once.
  const escape = params.scoped
    ? `This topic is ALREADY a scoped sub-topic the learner chose from a list of offers. Build the map for it. Do NOT return "tooBroad" — narrow the treatment instead, and if the label is missing the period or qualifier that bounds it, pick the reading its offer plainly meant and say so in the first concept's summary.`
    : `If (and only if) the topic is far too broad for one coherent concept map (e.g. "science", "math", "history"), instead return ONE object and nothing else:
{"tooBroad": true, "scopes": [{"label": "a focused sub-topic (2-4 words)", "note": "one sentence on what this scoped map covers"}, ...]}   // exactly 2-3 offers`;
  // One country of a continent: its neighbours are whole maps of their own,
  // and a concept both of them carry is a lesson the learner sits twice.
  const continent = params.neighbours?.length
    ? `\nThis map is one country of a larger continent the learner is charting. The NEIGHBOURING maps below are separate maps with their own concepts:\n${params.neighbours.map((n) => `- ${n}`).join("\n")}\nNo concept on this map may duplicate or re-teach one of theirs. Where this topic genuinely rests on one of them, start from it as known instead of mapping it again.\n`
    : "";
  return `Build a prerequisite concept map for the topic "${topic}". ${GOAL_HINT[goal]}${paretoNote(params)}
${PART_OF_WORK}
${grounding}${continent}
${escape}`;
}

/**
 * The map as a whole, written once before any concept: what the server stamps
 * onto the topic (`stampTopicMeta`) and every later generation reads back
 * through `withTopicAxes`. One object rather than per-node fields, because
 * none of these is a property of a concept.
 */
export const ABOUT_SHAPE = `{"about": {"domain": "formal|executable|empirical|interpretive|performative|craft|general", "targetLanguage": "es-ES", "jurisdictional": false, "lenses": [], "shape": "hierarchy|timeline|scenarios|plan"}}`;

export const ABOUT_RULE = `The "about" object describes the map as a whole:
- "domain": the TOPIC's domain (see the domain rule), once.
- "targetLanguage": ONLY when the topic is learning to speak, hear or read a language — its BCP-47 tag WITH region, the variant the learner most plausibly wants ("es-ES" for Spain, "es-MX", "pt-PT", "en-GB", "fr-FR", "it-IT"). null for every other topic, including one merely written in a language.
- "jurisdictional": true when what is correct depends on the learner's country — personal finance, law, tax, medicine and prescribing, driving, employment. false for mathematics, science, history, languages, programming.
- "lenses": [] — except for a confessional or genuinely contested subject (religious history, a scripture, a political ideology), where it names TWO short readings a learner could study it through (e.g. "Academic historiography", "The Church's own reading, with its documents"). Never more than two.
- "shape": how the topic is best walked. "timeline" for history and anything whose spine is chronology; "scenarios" for a language learned for real situations (a trip, a job), where each concept is a situation; "plan" for a life domain learned to act on (money, health habits, a career move), where concepts are decisions in the order life presents them; "hierarchy" for everything else.`;

/** W3.1: the evidence that decides which HEAVY phases a node runs. Honest
 *  booleans, not a quota — most nodes are none of the three special cases. */
export const EVIDENCE_RULE = `Three booleans per concept decide which demanding exercises it gets, so answer them honestly:
  "contested" — true only when informed people genuinely disagree about it today (a live scholarly, political or practical dispute), so that arguing both sides teaches something. Settled material is false.
  "transferable" — true when applying it to a situation it was never taught in is meaningful (a principle, a method, a pattern); false for a label, a date, a one-off event or a convention.
  "individual" — true when the concept IS one named person, event, document or place, rather than a class of things with members and non-members.`;

/** One node as the model writes it — shared by the single-shot and streamed
 *  prompts so the two can't ask for different fields. */
export const NODE_SHAPE = `{"id": "short-kebab-id", "label": "Concept Name", "summary": "one sentence on what this concept is", "kind": "fact|concept|procedure|principle", "domain": "formal|executable|empirical|interpretive|performative|craft|general", "domainWhy": "only when the domain differs from the topic's", "importance": "core|working|peripheral", "difficulty": "easy|medium|hard", "contested": false, "transferable": true, "individual": false}`;

export const graphShape = (ask: [number, number]) => `{
  "about": ${ABOUT_SHAPE.slice(10, -1)},
  "nodes": [${NODE_SHAPE}, ...],   // ${ask[0]} to ${ask[1]} concepts, foundations through capstone
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
Decide the TOPIC'"'"'s domain ONCE, first, in the map's "about" object, and build the whole map by its row below. Every node INHERITS it. A node may carry a different "domain" only together with "domainWhy": one sentence on why what settles a claim about THIS node differs from the topic (a machine-learning map's gradient is "formal" because it is derived; implementing the layer is "executable" because it runs). Without "domainWhy" the node takes the topic'"'"'s domain — a budget is not code because it has steps.`;

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
- interpretive: an edge means "A SET THE STAGE FOR B" — NOT "A is a prerequisite of B". Order the map CHRONOLOGICALLY, earliest first; the Council of Nicaea is not a prerequisite of the Great Schism, it is earlier. 12-40 nodes — as many DISTINCT ones as the span genuinely holds: one life or one decade is nearer 15, three centuries nearer 40. They are events, institutions, movements, controversies and DOCUMENTS — not "concepts". Include at least one node that is a single primary source, and one that is the historiography itself: how this story is told differently by different traditions. If the topic spans more than roughly three centuries, do not build one map — return the scope offer, and make the offers PERIODS rather than themes.
- performative: nodes are COMPETENCIES the learner performs, never concepts they understand — "ordering food", "the sounds that mark a foreign speaker", "the 300 highest-frequency words". An edge means "you need A to say B". Order by frequency x real utility, not by grammatical tidiness. 22-35 nodes. If the output language is closely related to the target (Portuguese and Spanish, say), say so and spend the map ONLY on the deltas — false friends, the contrasts that genuinely differ, and pronunciation — skipping everything that transfers for free. Include one node whose whole job is catching the learner being understood while still wrong.
- craft: the map IS the build sequence and it is IRREVERSIBLE — an edge means "A must be finished before B can start". 8-14 stages. The FIRST node is always the manifest: materials, cut list, tools, total cost and total hours, with nothing to learn and everything to gather. Every later node is a stage the learner carries out away from the screen, so each must name its tolerances and the ways it goes wrong.
- general: the generic rules above stand unchanged.
Whatever the domain: a topic that names ONE PART of a larger work takes its concept count from that part alone — usually 6-10 — and that overrides the row's range.`;

/**
 * The two cost axes — importance sets the bar a node is held to, difficulty the
 * budget under it (`lib/curriculum/cells.ts`) — and, per goal, the cells a map
 * may hold at all. `nodeAxes` clamps anything outside `GOAL_CELLS` afterwards;
 * naming the cells here is what keeps a concept the goal does not need from
 * being generated in the first place.
 */
const AXES_MIX: Record<GoalKind, string> = {
  pareto: `Roughly half the concepts "core" and half "working".`,
  exam: `Roughly 40% "core" and the rest "working"; "peripheral" only for easy context the syllabus itself names.`,
  project: `Roughly 40% "core" and 60% "working". A hard idea the build needs is a TOOL here: rate its difficulty by how hard it is to USE, not by how hard it is to understand inside.`,
  mastery: `Weight the map to the core: at least half the concepts are "core". "working" and "peripheral" fill in what the core needs around it.`,
};

export function axesRule(goal: GoalKind): string {
  const pairs = GOAL_CELLS[goal]
    .map((c) => `${IMPORTANCES[Number(c[0]) - 1]}/${DIFFICULTIES[Number(c[1]) - 1]}`)
    .join(", ");
  return `"importance" is judged against the learner's goal above, never in general, and says how far the learner must take the concept:
  "core" — the goal rests on it: a hub many others build on, or a capstone the goal is about. The learner must MASTER it.
  "working" — the learner must be able to USE it to reach the core, not master it: a tool, a stepping stone.
  "peripheral" — context the learner only has to RECOGNISE when they meet it: a term, a detail, a side branch.
"difficulty" is how hard the concept is for a newcomer who ALREADY holds its prerequisites: "easy" when it lands on first explanation, "hard" only for the few concepts that genuinely resist — counter-intuitive, many moving parts, the classic stumbling blocks of this topic — and "medium" otherwise. Most nodes are "medium"; never mark everything the same.
For this goal, every node's importance/difficulty pair must be one of: ${pairs}. A concept that would fall outside that list does not belong on this map — leave it out rather than tag it outside the list. The mix that follows SPLITS the concepts the topic genuinely needs; it never adds any — the concept count comes from the size rule alone, and a row is never padded to reach its share. ${AXES_MIX[goal]} Never tag every concept "core".`;
}

/** The summary rule, shared by the single-shot and streamed map prompts: it is
 *  the only thing the detail rail says about the topic itself, so it has to
 *  teach the gist rather than restate the label. */
export const SUMMARY_RULE = `"summary" is ONE sentence (max ~22 words) telling a learner who has never met this concept what it actually is and what it lets them do — concrete and specific to this topic. Never restate the label ("Gradient Descent is about gradient descent"), never describe the concept's role in the map or its difficulty, never start with "This concept".`;

export const mapRules = (ask: [number, number], goal: GoalKind) =>
  `Rules: labels are 1-3 words, capitalized the way the output language capitalizes a heading — English title case, but sentence case in languages that do not title-case (pt-BR: "Reações dependentes da luz", never "Reações Dependentes Da Luz"). ${SUMMARY_RULE}
${KIND_RULE}
${DOMAIN_RULE}
${ABOUT_RULE}
${EVIDENCE_RULE}
${axesRule(goal)}
${sizeRule({
  unit: "concepts",
  min: ask[0],
  max: ask[1],
  atMin:
    "a topic that is one technique or one mechanism, where a handful of concepts genuinely is the whole of it",
  atMax: "a broad field with several separate branches a learner must cross",
})}
A prerequisite edge means "B cannot be UNDERSTOOD without A" — never "A came earlier" or "A is usually taught first". Concepts that do not need each other are siblings, not a chain.
The map must read left-to-right from true foundations to the topic's capstone ideas. Every node is a CONCEPT the learner can be taught and then tested on — never a chapter heading or a container: no "Introduction", "Overview", "Fundamentals", "Advanced Topics", "Applications", "Conclusion". Each concept appears ONCE: never write it again under a reworded label or a synonym ("Ministério Galileu" and "Ministério na Galileia" are one node) — when the distinct concepts run out, stop. Ids are plain ASCII kebab-case, accents dropped ("joao-batista").

${DOMAIN_MAP_RULE}`;
