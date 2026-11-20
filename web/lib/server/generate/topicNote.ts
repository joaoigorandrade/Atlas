// ---- what the topic as a whole asks of every pass ----------------------------
// The topic-level axes (`withTopicAxes`), as prompt text. Split from
// `common.ts`, which `boundaryNote` still lives in and appends `topicNote` to.

import type { Boundary } from "./common";

/**
 * What the topic as a whole asks of every pass on it (W1.1, W2.5, W5.1): the
 * language being learned, the country whose rules apply, and what the learner
 * is ultimately trying to do. Empty on a topic with none — byte-identical to
 * the prompt before these existed, which is why they key only when set.
 */
export function topicNote(p: Boundary): string {
  const lines: string[] = [];
  if (p.targetLanguage)
    lines.push(
      `- The learner is learning to speak ${p.targetLanguage}. Every phrase they are to say, hear or recognise — examples, target forms, cues, model answers — is in ${p.targetLanguage}, in THAT variant's vocabulary, spelling and pronunciation (a Spain phrase is not a Mexico phrase). Explanations stay in the output language.`,
    );
  if (p.locale)
    lines.push(
      `- The rules that apply are those of the learner's country, ${p.locale} (ISO 3166). Use that country's instruments, institutions, products, taxes, laws and currency by name — generic or foreign ones only as a contrast. Education, never a recommendation.`,
    );
  if (p.target?.text)
    lines.push(
      `- What the learner is ultimately preparing to DO: "${p.target.text}" (${p.target.kind}${p.target.date ? `, by ${p.target.date}` : ""}). Make examples and cases serve that performance.`,
    );
  return lines.length ? `\nTHE TOPIC AS A WHOLE:\n${lines.join("\n")}\n` : "";
}

/** The reading a confessional or contested subject is taught through (W2.6),
 *  for the narrative passes only — Provenance and Steelman stay the same under
 *  either lens. */
export function lensNote(p: Boundary): string {
  return p.readingLens
    ? `\nTeach this through the learner's chosen reading: "${p.readingLens}". Present what that reading holds and why, with its own sources, and say plainly where another reading differs — never pretend the chosen one is the only one.\n`
    : "";
}
