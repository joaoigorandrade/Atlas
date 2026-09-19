// ---- kind: produce ---------------------------------------------------------
// A scene and a handful of turns the learner SAYS, against the clock. The cue
// is written in the learner's own language so that reading it is never itself
// the test, and `targetForms` — which the learner never sees — is what the
// judge measures avoidance against.
//
// The judge's third verdict is what makes this phase its own: `thin` is an
// utterance that was understood while routing around the form the turn existed
// to elicit. Every other phase, and most conversations, score that as success.

import { arr, boundaryNote, fail, languageNote, obj, str, user } from "./common";
import { JUDGE_SYSTEM, judgeStream } from "./judge";
import {
  PRODUCE_VERDICTS,
  type Domain,
  type ProduceContent,
  type ProduceVerdict,
} from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { ChatMessage, generateJson } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

export const PRODUCE_TURN_BOUNDS = { min: 4, max: 8 } as const;
/** Short on purpose: an unbounded turn stops being production under pressure
 *  and becomes a writing exercise the learner reads aloud. */
const SECONDS = { min: 10, max: 45 } as const;

export function validateProduce(nodeId: string, nodeLabel: string) {
  return (raw: unknown): ProduceContent => {
    const root = obj(raw, "payload");
    const turns = arr(
      root.turns,
      "turns",
      PRODUCE_TURN_BOUNDS.min,
      PRODUCE_TURN_BOUNDS.max,
    ).map((v, i) => {
      const t = obj(v, `turns[${i}]`);
      const seconds = typeof t.seconds === "number" ? Math.round(t.seconds) : 30;
      return {
        id: `pd-${nodeId}-${i + 1}`,
        cue: str(t.cue, `turns[${i}].cue`),
        targetForms: arr(t.targetForms, `turns[${i}].targetForms`, 1, 3).map((f, j) =>
          str(f, `turns[${i}].targetForms[${j}]`),
        ),
        seconds: Math.min(SECONDS.max, Math.max(SECONDS.min, seconds)),
      };
    });
    // Without a form to elicit there is nothing for `thin` to mean, and the
    // gate collapses into "were you understood" — which every learner passes.
    if (turns.some((t) => t.targetForms.length === 0))
      fail("every turn must name at least one target form");
    return {
      nodeId,
      nodeLabel,
      scene: str(root.scene, "scene"),
      turns,
    };
  };
}

export interface ProduceParams {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  language?: Language;
  domain?: Domain;
  priorLabels?: string[];
  laterLabels?: string[];
}

export async function generateProduce(params: ProduceParams): Promise<ProduceContent> {
  const { topic, nodeLabel, language = "en" } = params;
  return generateJson(
    user(
      `Write a LIVE PRODUCTION pass for "${nodeLabel}" within "${topic}". The learner will SPEAK each turn out loud, first try, against a clock.
${boundaryNote(params)}

Set one ordinary situation the turns all happen inside — someone the learner would really talk to, about something they would really say.

Each "cue" is written in the LEARNER'S OWN language (the output language below) and says what to get across. Never write the target-language sentence in the cue: reading it aloud is not production.

"targetForms" names what the turn exists to elicit — the structure, tense, register or sound the learner should have to reach for. The learner never sees it. Choose turns where the form is genuinely hard to avoid while still saying the thing.

Turns run ${SECONDS.min}-${SECONDS.max} seconds. Keep each one to something a speaker would say in one breath or two.

Return JSON:
{
  "scene": "one sentence setting the situation",
  "turns": [
    { "cue": "what to get across, in the learner's own language",
      "targetForms": ["1-3 forms this turn exists to elicit"],
      "seconds": 30 },
    ...
  ]   // ${PRODUCE_TURN_BOUNDS.min}-${PRODUCE_TURN_BOUNDS.max} turns
}${languageNote(language)}`,
    ),
    validateProduce(params.nodeId, nodeLabel),
    { label: "produce" },
  );
}

// ---- the grader ------------------------------------------------------------

export interface ProduceJudgement {
  verdict: ProduceVerdict;
  read: string;
}

interface JudgeProduceParams {
  topic: string;
  nodeLabel: string;
  scene: string;
  cue: string;
  targetForms: string[];
  said: string;
  language?: Language;
}

export function validateProduceJudgement(raw: unknown): ProduceJudgement {
  const root = obj(raw, "payload");
  if (!(PRODUCE_VERDICTS as readonly string[]).includes(String(root.verdict)))
    fail("verdict must be good, thin or wrong");
  return { verdict: root.verdict as ProduceVerdict, read: str(root.read, "read") };
}

function produceJudgeMessages(params: JudgeProduceParams): ChatMessage[] {
  const { topic, nodeLabel, scene, cue, targetForms, said, language = "en" } = params;
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `A learner practising "${nodeLabel}" (topic: ${topic}) just SPOKE one turn out loud, unscripted. You are reading a speech transcript, so ignore punctuation, capitalisation and obvious transcription noise entirely.

The situation: """${scene}"""
What they were asked to get across: """${cue}"""
What this turn exists to elicit: ${targetForms.join("; ")}

What they said, as transcribed: """${said}"""

Rule it exactly one of:
- "good": a listener would understand them, AND they used what the turn exists to elicit. Natural variation, a different word order, a synonym a native speaker would use — all still "good". You are grading whether they produced it, not whether it matches a model answer.
- "thin": a listener would understand them, but they went AROUND the target form — said it another way, simplified past it, or used a form they were already sure of. This is the important call. Getting the meaning across while avoiding the structure is the habit that stalls a speaker for years, and it looks like success from the outside.
- "wrong": a listener would not follow them, or they reached for the target form and used it incorrectly.

Reaching for the form and getting it slightly wrong is "wrong", not "thin" — that learner tried. Never mark "thin" for an accent, a hesitation, or a transcription artefact.

In \`read\`, ONE sentence to the learner. For "thin", name what they said instead and what they avoided. For "wrong", say what a listener would have missed.

Return JSON: {"verdict": "good" | "thin" | "wrong", "read": "..."}${languageNote(language)}`,
    },
  ];
}

export async function judgeProduce(
  params: JudgeProduceParams,
): Promise<ProduceJudgement> {
  return generateJson(produceJudgeMessages(params), validateProduceJudgement, {
    label: "judge-produce",
    role: "judge",
  });
}

export function judgeProduceStream(
  params: JudgeProduceParams,
): AsyncGenerator<StreamFrame> {
  return judgeStream<ProduceJudgement>(produceJudgeMessages(params), {
    firstShape: '{"verdict": "good" | "thin" | "wrong"}',
    first: (raw) => ({
      verdict: validateProduceJudgement({ ...obj(raw, "payload"), read: "…" }).verdict,
    }),
    full: validateProduceJudgement,
    label: "judge-produce",
  });
}
