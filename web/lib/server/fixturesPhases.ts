// Fixture payloads, one per phase.
//
// Split from `fixtures.ts`, which holds the dispatch: this file is the DATA a
// phase renders, that one decides which data a request gets. Each payload is
// shaped to exercise its phase's own gate clause rather than a clean pass — a
// fixture run that only ever passes tests the screen and not the rule.

import type { GenerateBody } from "./jobInput";
import { examFixture } from "./fixturesExam";
import { continentLinksParams } from "./generate/continentLinks";
import {} from "@/lib/curriculum";
import type { ExplainContent, PerformContent } from "@/lib/curriculum";

/** The substitutions every fixture builder shares. */
export interface Vars {
  nodeId: string;
  nodeLabel: string;
}

export const explainContent = (v: Vars): ExplainContent => ({
  nodeId: v.nodeId,
  nodeLabel: v.nodeLabel,
  problem: `What question does ${v.nodeLabel} answer, before anyone names it?`,
  analogy: {
    text: `${v.nodeLabel} works like a recipe card: the steps hold whoever cooks.`,
    breaks: "A recipe can be bent to taste; this rule does not bend.",
  },
  order: [
    "The problem it solves",
    `The rule ${v.nodeLabel} states`,
    "One case where it applies, one where it does not",
  ],
  misconception: {
    belief: `${v.nodeLabel} only applies to the example it was taught with.`,
    tempting: "Every case the listener has seen looked like that example.",
  },
  checkBack: {
    question: `Where else would ${v.nodeLabel} apply?`,
    rightAnswer: "A case that shares the requirement, not the surface.",
  },
  listener: {
    says: `So ${v.nodeLabel} is just about that one example, right?`,
    replies: [
      {
        label: `No — ${v.nodeLabel} is defined precisely, so it is general.`,
        correct: false,
        why: "Repeating the definition louder leaves the belief where it was.",
      },
      {
        label: "Here is a case that looks nothing like it and still follows the rule.",
        correct: true,
        why: "A second, unlike case breaks the link to the one example.",
      },
      {
        label: "The example was just a simplification, don't worry about it.",
        correct: false,
        why: "It dismisses the worry without showing why it is wrong.",
      },
    ],
  },
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

/** Every phase payload here that ships as `{ content }`, by kind. */
export const PHASE_CONTENT: Record<string, (v: Vars) => unknown> = {
  explain: explainContent,
  perform: performContent,
};

/**
 * Fixture kinds that are not a phase. A continent's links: two maps connect
 * when their subjects and concepts share a word of four letters or more — so a
 * fixture continent of look-alike maps is one landmass, and maps with nothing
 * in common stay islands, without a model deciding either.
 */
export function otherFixture(kind: string, body: GenerateBody) {
  if (kind === "exam") return { questions: examFixture(body) };
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
