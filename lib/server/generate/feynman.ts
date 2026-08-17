// ---- kind: feynman ---------------------------------------------------------
import {
  arr,
  boundaryNote,
  fail,
  interestNote,
  languageNote,
  obj,
  rejectEcho,
  sizeRule,
  str,
  user,
} from "./common";
import { FEYNMAN_BEAT_BOUNDS, FeynmanBeat } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson, streamJsonObjects } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

export const VERDICTS = ["good", "skipped", "confused"] as const;
/** Placement offsets for gap sub-nodes spawned from a teach-back, per beat. */
const FEYNMAN_GAP_OFFSETS: ReadonlyArray<[number, number]> = [
  [-140, 150],
  [70, 172],
  [-168, 66],
  [120, 150],
];

/** One teach-back beat — a rubric row, not a script. The gap offset is indexed
 *  modulo the offset table, so a beat validates identically whether it arrived
 *  in an array or alone. */
export function validateFeynmanBeat(nodeId: string) {
  return (raw: unknown, i: number): FeynmanBeat => {
    const b = obj(raw, `beats[${i}]`);
    const mustConvey = arr(b.mustConvey, `beats[${i}].mustConvey`, 1, 4).map((m, j) =>
      rejectEcho(str(m, `beats[${i}].mustConvey[${j}]`), `beats[${i}].mustConvey[${j}]`),
    );
    const fix = obj(b.fix, `beats[${i}].fix`);
    const fixReplies = arr(fix.replies, `beats[${i}].fix.replies`, 2, 3).map((r, j) => {
      const rep = obj(r, `beats[${i}].fix.replies[${j}]`);
      return {
        label: str(rep.label, `beats[${i}].fix.replies[${j}].label`),
        correct: rep.correct === true,
        response: str(rep.response, `beats[${i}].fix.replies[${j}].response`),
      };
    });
    if (!fixReplies.some((r) => r.correct) || !fixReplies.some((r) => !r.correct))
      fail(`beats[${i}].fix.replies needs one correct and one incorrect option`);
    const [dx, dy] = FEYNMAN_GAP_OFFSETS[i % FEYNMAN_GAP_OFFSETS.length];
    return {
      id: `ft-${nodeId}-${i + 1}`,
      subPoint: str(b.subPoint, `beats[${i}].subPoint`),
      mustConvey,
      fix: {
        probe: str(fix.probe, `beats[${i}].fix.probe`),
        replies: fixReplies,
      },
      gap: {
        id: `gap-ft-${nodeId}-${i + 1}`,
        label: str(b.gapLabel, `beats[${i}].gapLabel`),
        reason: str(b.gapReason, `beats[${i}].gapReason`),
        dx,
        dy,
      },
    };
  };
}

export function validateFeynman(nodeId: string) {
  const beat = validateFeynmanBeat(nodeId);
  return (raw: unknown): FeynmanBeat[] => {
    const root = obj(raw, "payload");
    return arr(root.beats, "beats", FEYNMAN_BEAT_BOUNDS.min, FEYNMAN_BEAT_BOUNDS.max).map(
      beat,
    );
  };
}

interface FeynmanParams {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  priorLabels?: string[];
  laterLabels?: string[];
}

/** The shared framing of both Feynman prompts. */
function feynmanContext(params: FeynmanParams): string {
  return `Write the RUBRIC for a Feynman teach-back on the concept "${params.nodeLabel}" within "${params.topic}": the sub-points a learner must cover to have genuinely explained it to someone who has never heard of it.
${sizeRule({
  unit: "sub-points",
  min: FEYNMAN_BEAT_BOUNDS.min,
  max: FEYNMAN_BEAT_BOUNDS.max,
  atMin: "a concept whose complete explanation genuinely is two things",
  atMax: "a concept a naive listener cannot follow without all four",
})}
The learner never sees these — they teach the concept from a blank page, and their explanation is diffed against these rows. So each sub-point is what a *complete* explanation contains, in the order it would naturally be taught, not a question or a prompt.
${interestNote(params.interests)}
${boundaryNote(params)}`;
}

const FEYNMAN_BEAT_SHAPE = `{
      "subPoint": "the sub-point a complete explanation must cover (3-6 words)",
      "mustConvey": ["2-3 specific things the learner's own words have to get across for this sub-point to count as taught — the grading rubric, concrete and checkable, not 'explains it well'"],
      "fix": {   // the targeted micro-pass that closes just this sub-point
        "probe": "one Socratic question aimed straight at the gap",
        "replies": [{"label": "...", "correct": true, "response": "..."}, {"label": "the misconception a real learner holds here, written out in their voice", "correct": false, "response": "the specific catch"}]
      },
      "gapLabel": "the gap's map label (2-5 words)",
      "gapReason": "why it split out, phrased to the learner ('the Z trap' — the sentence continues after a quote of their own words)"
    }`;

/** A filled-in beat on an unrelated everyday concept — `mustConvey` is the
 *  field that most often comes back as its own description ("explains it
 *  well"), and an example is the cheapest way to show it must be checkable. */
const FEYNMAN_BEAT_EXAMPLE = `Here is one filled-in beat, from an unrelated concept, to show the expected concreteness — copy its FORM, never its content:
{
      "subPoint": "Gears repackage the same work",
      "mustConvey": ["that a low gear lowers the force per pedal stroke", "that it raises the number of strokes the same climb takes", "that the total work against gravity is unchanged by the gear"],
      "fix": {
        "probe": "If a low gear really made the hill cheaper, what would stop you from fitting an ever-lower gear and climbing for free?",
        "replies": [
          {"label": "Nothing would stop me, but I'd be pedalling forever — the strokes multiply as the force drops.", "correct": true, "response": "That's the trade. The gear sets the exchange rate between force and strokes; it never discounts the climb."},
          {"label": "A low enough gear really would make the climb almost effortless.", "correct": false, "response": "Effortless per stroke, yes — but you'd need so many strokes that the total effort lands right back where it started."}
        ]
      },
      "gapLabel": "Gears as free effort",
      "gapReason": "you treated the lower gear as a discount on the climb rather than a different way of paying for it"
    }`;

export async function generateFeynman(params: FeynmanParams): Promise<FeynmanBeat[]> {
  return generateJson(
    user(
      `${feynmanContext(params)}

Return JSON:
{
  "beats": [${FEYNMAN_BEAT_SHAPE}, ...]   // ${FEYNMAN_BEAT_BOUNDS.min}-${FEYNMAN_BEAT_BOUNDS.max}, as many as the concept earns
}

${FEYNMAN_BEAT_EXAMPLE}${languageNote(params.language ?? "en")}`,
    ),
    validateFeynman(params.nodeId),
    { label: "feynman" },
  );
}

/**
 * Streamed variant: the first beat opens the teach-back instead of the learner
 * waiting on all four. This is the largest payload of any phase and the least
 * reliably warmed — Socratic only starts warming it at Socratic entry — so it
 * is the one most often paid for in full.
 *
 * One call, not four: the beats are explicitly a progression, and each `fix`
 * micro-pass belongs to its own beat, so a beat is self-contained the moment
 * it closes. `FeynmanView` dereferences `beat.fix.probe` directly, which is
 * why `fix` is never deferred out of the beat.
 */
export async function* generateFeynmanStream(
  params: FeynmanParams,
): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjects(
      user(
        `${feynmanContext(params)}

Write the beats as SEPARATE top-level JSON objects, one
after another — NOT wrapped in an array or a {"beats": [...]} object, no
markdown fences, no numbering, no commentary before/after/between them. Each
object has this shape:
${FEYNMAN_BEAT_SHAPE}

${FEYNMAN_BEAT_EXAMPLE}${languageNote(params.language ?? "en")}`,
      ),
      validateFeynmanBeat(params.nodeId),
      { label: "feynman-stream" },
    );
    for await (const beat of stream) yield { p: "beats", i: yielded++, v: beat };
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "feynman_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const beats = await generateFeynman(params);
    for (const [i, beat] of beats.entries()) yield { p: "beats", i, v: beat };
  }
}
