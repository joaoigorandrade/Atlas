// ---- kind: socratic --------------------------------------------------------
import {
  arr,
  boundaryNote,
  fail,
  interestNote,
  languageNote,
  obj,
  oneOf,
  rejectEcho,
  sizeRule,
  str,
  user,
} from "./common";
import {
  SOCRATIC_MAX_STEPS,
  SOCRATIC_MIN_STEPS,
  SOCRATIC_MIN_WRITTEN,
  SOCRATIC_SPARES,
  SOCRATIC_STEPS,
  SocraticStep,
} from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson, streamJsonObjects } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

const MOVES = [
  "Clarify",
  "Challenge the assumption",
  "Probe the reasoning",
  "Probe the implications",
] as const;
export const QUALITIES = ["correct", "near", "wrong", "lost"] as const;

/** The shared framing of both Socratic prompts. */
function socraticContext(params: {
  topic: string;
  nodeLabel: string;
  interests: string;
  priorLabels?: string[];
  laterLabels?: string[];
}): string {
  return `Write a Socratic questioning session for the concept "${params.nodeLabel}" within "${params.topic}".
The learner just finished a first reading. You are a contingent tutor: hint when near, teach when lost, and — most important — anti-sycophantic: a wrong reply is caught and named, gently but plainly.
${interestNote(params.interests)}
${sizeRule({
  unit: "CORE probes",
  min: SOCRATIC_MIN_STEPS,
  max: SOCRATIC_STEPS,
  atMin: "a single-mechanism idea with one way to get it wrong",
  atMax: "a genuinely layered concept",
})} Each core probe uses a different move, in the order listed, and picks up where the last left off.
Then write exactly ${SOCRATIC_SPARES} further ${SOCRATIC_SPARES === 1 ? "probe" : "probes"} marked "spare": true, last. A spare is held back — only ever asked of a learner who keeps needing help — so it must go DEEPER on the hardest part of the concept rather than restate an earlier probe.
${boundaryNote(params)}`;
}

const SOCRATIC_STEP_SHAPE = `{
      "spare": false,   // true only on the held-back extra probes, which come last
      "move": "Clarify" | "Challenge the assumption" | "Probe the reasoning" | "Probe the implications",   // core probes: each move once, in this order; a spare reuses whichever fits
      "prompt": "the probing question the tutor opens with",
      "replies": [    // 3 plausible learner replies; exactly one "correct"; one is the misconception a real learner actually holds, written out in their voice
        {"label": "the learner's reply, in their own words", "quality": "correct" | "near" | "wrong" | "lost", "response": "the tutor's honest, specific reaction"}
      ],
      "hint": "an 'I'm stuck' nudge that reframes without giving it away",
      "tell": "the direct instruction for 'Just tell me' — complete and precise"
    }`;

/** A filled-in step on an unrelated everyday concept. The schema above names
 *  the fields; only an example can show that `label` is a sentence a learner
 *  would actually say rather than a description of one — the failure
 *  `rejectEcho` exists to catch. */
const SOCRATIC_STEP_EXAMPLE = `Here is one filled-in step, from an unrelated concept, to show the expected concreteness — copy its FORM, never its content:
{
      "spare": false,
      "move": "Challenge the assumption",
      "prompt": "You said a low gear makes the bike easier to pedal. Easier in what sense — are you doing less work overall to get up the hill?",
      "replies": [
        {"label": "No, the total work is about the same, I just spread it over more pedal strokes.", "quality": "correct", "response": "Exactly — you traded force per stroke for number of strokes. The hill still costs what it costs."},
        {"label": "Yes, low gear means less effort to climb the hill.", "quality": "wrong", "response": "That would be a free lunch. You feel less force in each stroke, but you pedal many more times — add those up and the hill charges you the same."},
        {"label": "I think it's easier but I couldn't say why.", "quality": "near", "response": "You've got the feel right. Hold onto 'easier per stroke' and ask what has to grow in exchange."}
      ],
      "hint": "Count the pedal strokes it takes to reach the top in each gear, not how hard any one of them feels.",
      "tell": "A low gear reduces the force per pedal stroke but increases how many strokes the climb takes. The work against gravity is fixed by your weight and the height, so the gear only changes how that cost is packaged."
    }`;

export function validateSocraticStep(raw: unknown, i: number): SocraticStep {
  const s = obj(raw, `steps[${i}]`);
  const replies = arr(s.replies, `steps[${i}].replies`, 3, 4).map((r, j) => {
    const rep = obj(r, `steps[${i}].replies[${j}]`);
    return {
      label: rejectEcho(
        str(rep.label, `steps[${i}].replies[${j}].label`),
        `steps[${i}].replies[${j}].label`,
      ),
      quality: oneOf(rep.quality, QUALITIES, `steps[${i}].replies[${j}].quality`),
      response: str(rep.response, `steps[${i}].replies[${j}].response`),
    };
  });
  if (!replies.some((r) => r.quality === "correct"))
    fail(`steps[${i}].replies needs a correct option`);
  return {
    id: `s${i + 1}`,
    ...(s.spare === true ? { spare: true as const } : null),
    move: oneOf(s.move, MOVES, `steps[${i}].move`),
    prompt: str(s.prompt, `steps[${i}].prompt`),
    replies,
    hint: str(s.hint, `steps[${i}].hint`),
    tell: str(s.tell, `steps[${i}].tell`),
  };
}

export function validateSocratic(raw: unknown): SocraticStep[] {
  const root = obj(raw, "payload");
  return arr(root.steps, "steps", SOCRATIC_MIN_WRITTEN, SOCRATIC_MAX_STEPS).map(
    validateSocraticStep,
  );
}

export async function generateSocratic(params: {
  topic: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  priorLabels?: string[];
  laterLabels?: string[];
}): Promise<SocraticStep[]> {
  return generateJson(
    user(
      `${socraticContext(params)}

Return JSON:
{
  "steps": [${SOCRATIC_STEP_SHAPE}, ...]   // the core probes, then the ${SOCRATIC_SPARES} spare
}

${SOCRATIC_STEP_EXAMPLE}${languageNote(params.language ?? "en")}`,
    ),
    validateSocratic,
    { label: "socratic" },
  );
}

/**
 * Streamed variant: the tutor's first probe lands as soon as it is written
 * instead of the learner waiting on all four.
 *
 * The steps stay in ONE call rather than fanning out. The prompt requires a
 * progression — each move used once, in order, building on the last — and four
 * independent calls would each be written blind to the others. That coherence
 * is the pedagogy; no latency number buys it back.
 *
 * `hint` and `tell` stay inside their step. Beyond being small, `tell` is what
 * `AtlasApp` hands the judge as the reference answer, so a step without it
 * cannot be judged.
 */
export async function* generateSocraticStream(params: {
  topic: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  priorLabels?: string[];
  laterLabels?: string[];
}): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjects(
      user(
        `${socraticContext(params)}

Write the steps as SEPARATE top-level JSON objects, one after
another — NOT wrapped in an array or a {"steps": [...]} object, no markdown
fences, no numbering, no commentary before/after/between them. Each object has
this shape:
${SOCRATIC_STEP_SHAPE}

${SOCRATIC_STEP_EXAMPLE}${languageNote(params.language ?? "en")}`,
      ),
      validateSocraticStep,
      { label: "socratic-stream" },
    );
    for await (const step of stream) yield { p: "steps", i: yielded++, v: step };
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "socratic_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const steps = await generateSocratic(params);
    for (const [i, step] of steps.entries()) yield { p: "steps", i, v: step };
  }
}
