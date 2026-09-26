// Fixture payloads, one per phase.
//
// Split from `fixtures.ts`, which holds the dispatch: this file is the DATA a
// phase renders, that one decides which data a request gets. Each payload is
// shaped to exercise its phase's own gate clause rather than a clean pass — a
// fixture run that only ever passes tests the screen and not the rule.

import type { GenerateBody } from "./jobInput";
import { continentLinksParams } from "./generate/continentLinks";
import { asDomain } from "@/lib/curriculum";
import type {
  DiagnosticQuestion,
  DiscriminateContent,
  Domain,
  DrillContent,
  PerformContent,
  PredictContent,
  ProduceContent,
  ProvenanceContent,
  RecallContent,
  SteelmanContent,
  TraceContent,
} from "@/lib/curriculum";

/** The substitutions every fixture builder shares. */
export interface Vars {
  nodeId: string;
  nodeLabel: string;
}

/** The order probe's events, which are also its answer — the screen cannot be
 *  completed unless every tappable label is orderable. */
const ORDERED = [
  "The dispute is first recorded",
  "Both sides formalize their claims",
  "A settlement is written down",
] as const;

/**
 * The placement probe, in the shape its domain actually asks for.
 *
 * It used to return an MCQ whatever the domain was — the same thing the live
 * prompt was doing by accident, and part of why neither was caught. A fixture
 * that only ever produces one of four shapes cannot exercise the three screens
 * behind the other three, and one of those was drawing the options list
 * underneath itself, unseen. Same rule as the phase fixtures below: written
 * against its own shape, not one payload wearing four names.
 */
const SHAPES: Partial<Record<Domain, (label: string) => Partial<DiagnosticQuestion>>> = {
  formal: (label) => ({
    type: "compute",
    q: `A run of ${label} starts at 12 and doubles twice. What does it reach?`,
    expected: ["48"],
  }),
  performative: (label) => ({
    type: "speak",
    q: `Say, in the target language, what ${label} is for.`,
    expected: ["it is for asking the way", "it asks for directions"],
  }),
  interpretive: (label) => ({
    type: "order",
    q: `Put these ${label} milestones in the order they happened.`,
    opts: ORDERED.map((label) => ({ label })),
    expected: [...ORDERED],
  }),
};

export const diagnosticFixture = (
  body: GenerateBody,
  label: string,
  nodeId: string,
): DiagnosticQuestion => ({
  tag: "Placement",
  q: `Which of these is what ${label} actually claims?`,
  note: "One objective probe — answer from what you already know.",
  nodeId,
  difficulty:
    body.difficulty === "easy" || body.difficulty === "hard" ? body.difficulty : "medium",
  opts: [
    { label: "It is a worked example." },
    { label: "It states a rule the rest of the topic leans on." },
    { label: "It is a naming convention only." },
    { label: "It has no bearing on the topic." },
  ],
  correctIndex: 1,
  // A shaped domain overrides the four options above; `general` keeps them.
  ...(SHAPES[asDomain(body.domain)]?.(label) ?? {}),
});

export const provenanceContent = (v: Vars): ProvenanceContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  source: {
    title: `A letter bearing on ${v.nodeLabel}`,
    attribution: "Written by a party to the dispute, to an audience it needed",
    date: "in the year it mattered",
    excerpt: `We hold, and have always held, that ${v.nodeLabel} is settled in our favour, as all reasonable men acknowledge.`,
  },
  // Mostly `asserts`, because that is the ruling learners collapse into
  // `proves` — and the one the gate's over-trust cap counts.
  claims: [0, 1, 2, 3, 4].map((i) => ({
    id: `pv-${v.nodeId}-${i + 1}`,
    claim: [
      `${v.nodeLabel} was settled in the author's favour`,
      "All reasonable men acknowledged the author's position",
      "The question was being actively disputed at this date",
      "The author held the office he writes from",
      "The opposing party had conceded",
    ][i],
    ruling: (["asserts", "asserts", "proves", "proves", "asserts"] as const)[i],
    because: [
      "The letter claims it; nothing here shows it was accepted.",
      "A rhetorical appeal, not evidence about what anyone acknowledged.",
      "A letter arguing the point is proof the point was live.",
      "The document is written in that capacity, which establishes it.",
      "Asserted by silence; the other party is not heard here.",
    ][i],
  })),
  silence: "The opposing party's account is absent, and it is the half that lost.",
});

export const steelmanContent = (v: Vars): SteelmanContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  question: `Did ${v.nodeLabel} settle the dispute, or only postpone it?`,
  positions: [
    {
      id: `sm-${v.nodeId}-1`,
      label: "It settled the dispute",
      heldBy: "the party that claimed the win",
      mustCover: [
        "the concession the other side actually made",
        "the decades of quiet that followed",
      ],
    },
    {
      id: `sm-${v.nodeId}-2`,
      label: "It only postponed it",
      heldBy: "later historians of the same period",
      mustCover: [
        "what the settlement left undefined",
        "the same dispute reopening under a new name",
      ],
    },
  ],
});

export const produceContent = (v: Vars): ProduceContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  scene: "Telling a colleague what happened last week.",
  turns: [0, 1, 2, 3].map((i) => ({
    id: `pd-${v.nodeId}-${i + 1}`,
    cue: [
      "Say what you finished, and when",
      "Say what you were working on while that happened",
      "Say what went wrong, once",
      "Say what you will do next",
    ][i],
    targetForms: [[v.nodeLabel], [v.nodeLabel], [v.nodeLabel], [v.nodeLabel]][i],
    seconds: 30,
  })),
});

export const discriminateContent = (v: Vars): DiscriminateContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  ask: "Which reading best classifies this case?",
  // Alternating instances and near-misses, so the over-inclusion clause in
  // `discriminatePassed` has something real to measure.
  cases: [0, 1, 2, 3].map((i) => ({
    id: `dc-${v.nodeId}-${i + 1}`,
    candidate: `Case ${i + 1}: a situation where the requirement ${
      i % 2 ? "is absent" : "holds"
    }, described without naming anything.`,
    readings: [
      `This is ${v.nodeLabel}`,
      "The requirement is missing",
      "The neighbouring idea",
    ],
    answerIndex: i % 2 ? 1 : 0,
    decidedBy: `The requirement ${i % 2 ? "is absent here" : "is met here"}, and that is what decides it.`,
    isInstance: i % 2 === 0,
  })),
});

export const predictContent = (v: Vars): PredictContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  setups: [0, 1, 2, 3].map((i) => ({
    id: `pd-${v.nodeId}-${i + 1}`,
    situation: `Setup ${i + 1}: the conditions ${v.nodeLabel} governs are set, and one of them is ${i % 2 ? "raised" : "lowered"}.`,
    outcomes: [
      "It moves the way the rule says",
      "It moves the opposite way",
      "Nothing changes",
    ],
    answerIndex: i % 2,
    because:
      "The requirement carries the change through to the outcome, one stage at a time.",
  })),
});

export const traceContent = (v: Vars): TraceContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  scenario: `One run of ${v.nodeLabel}, followed from the point where its requirement is first met.`,
  stages: [0, 1, 2, 3].map((i) => ({
    id: `tr-${v.nodeId}-${i + 1}`,
    reached: `Stage ${i + 1}: the run has produced what stage ${i} handed on.`,
    nexts: [
      `It hands stage ${i + 2} its input`,
      "It repeats the previous stage",
      "It skips ahead",
    ],
    answerIndex: i % 2,
    handsOn:
      "This stage consumes the last one's output and produces the next one's input.",
  })),
});

export const drillContent = (v: Vars): DrillContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  // Five reps: enough that `drillMedianMs` has a real middle value.
  reps: [0, 1, 2, 3, 4].map((i) => ({
    id: `dr-${v.nodeId}-${i + 1}`,
    prompt: `Rep ${i + 1}: what does ${v.nodeLabel} give for case ${i + 1}?`,
    answers: ["The stated value", "Twice the stated value", "Half of it"],
    answerIndex: i % 2,
    rule: "Read the requirement first; the value follows from it directly.",
  })),
});

export const recallContent = (v: Vars): RecallContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  brief: `From memory, write down everything you can still produce about ${v.nodeLabel}.`,
  scaffold: `Start from the one requirement ${v.nodeLabel} needs before it applies.`,
  rubric: [0, 1, 2].map((i) => ({
    id: `rc-${v.nodeId}-${i + 1}`,
    point: ["The requirement", "The rule itself", "What it rules out"][i],
    mustRetrieve: [
      [`that ${v.nodeLabel} needs its requirement met first`],
      [`the rule ${v.nodeLabel} states, in the learner's own words`],
      ["one case the rule excludes, and why"],
    ][i],
  })),
});

export const performContent = (v: Vars): PerformContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  task: `Work this case end to end: apply ${v.nodeLabel} where its requirement holds, with the values given, and show each step.`,
  scaffold: "Establish whether the requirement is met before you apply anything.",
  steps: [0, 1, 2].map((i) => ({
    id: `pf-${v.nodeId}-${i + 1}`,
    step: ["Requirement checked", "Rule applied", "Result stated"][i],
    mustShow: [
      ["that the requirement is met on this case"],
      ["the rule carried out on the given values"],
      ["the result, with its units"],
    ][i],
    // The last step is the skippable one, so a fixture run exercises both
    // halves of `performPassed` rather than only the all-good path.
    loadBearing: i < 2,
  })),
});

/** The judge fixtures for the two graded phases the domain axis adds — null
 *  when the mode is one `fixtures.ts` answers itself. */
export function domainPhaseJudgement(body: GenerateBody): Record<string, unknown> | null {
  switch (body.mode) {
    case "steelman":
      // One side stood up, one did not — the shape that exercises the gate's
      // own clause rather than a clean pass.
      return {
        verdicts: (body.positions ?? []).map((pos, i) => ({
          positionId: pos.id,
          verdict: i === 0 ? "strong" : "thin",
          ...(i === 0 ? null : { quote: "they were simply wrong about the law" }),
        })),
        response:
          "The first case is one its holders would recognise. The second states the position in terms they would reject.",
      };
    case "produce":
      return {
        verdict: "thin",
        read: "Understood — but you went around the form instead of through it.",
      };
    default:
      return null;
  }
}

/**
 * Fixture kinds that are not a phase. A continent's links: two maps connect
 * when their subjects and concepts share a word of four letters or more — so a
 * fixture continent of look-alike maps is one landmass, and maps with nothing
 * in common stay islands, without a model deciding either.
 */
export function otherFixture(kind: string, body: GenerateBody) {
  if (kind !== "continentLinks") return null;
  const { maps } = continentLinksParams(body, "fixture");
  const words = maps.map(
    (m) =>
      new Set(
        [m.subject, ...m.labels]
          .join(" ")
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length >= 4),
      ),
  );
  const links: [string, string][] = [];
  maps.forEach((a, i) =>
    maps.forEach((b, j) => {
      if (j > i && [...words[i]].some((w) => words[j].has(w)))
        links.push([a.subject, b.subject]);
    }),
  );
  return { links };
}
