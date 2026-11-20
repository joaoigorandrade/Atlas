// ---- kind: model -----------------------------------------------------------
// One lens, opened over one section of the reading (see `ConsumeModelBeat`).
//
// This is the only generation in the app the learner asks for *from inside* a
// screen they are already reading, which shapes it twice over: it streams, so
// the first beat lands while the rest are still being written, and it is keyed
// on the section's own prose rather than on the node — two learners looking at
// the same cached section through the same lens share the row, and a section
// generated at temperature 0.6 can never be handed a walkthrough written for
// somebody else's wording of it.
import { arr, interestNote, languageNote, obj, rejectEcho, str, user } from "./common";
import { MODEL_BEAT_EXAMPLE, MODEL_BEAT_SHAPE } from "./shapes";
import {
  AltKey,
  ConsumeModelBeat,
  MODEL_BEAT_BOUNDS,
  altControls,
  lensNote,
} from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson, streamJsonObjectsProgressive } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

/** What each lens asks the model for. The learner-facing promise lives in
 *  `lensNote` (lib/curriculum.ts); these are its instructions. */
const LENS_BRIEF: Record<AltKey, string> = {
  simpler:
    "Strip the idea to its plainest form. Short sentences, no jargon that isn't defined on the spot, no loss of correctness — a plainer route to the same understanding, never a vaguer one.",
  example:
    "Work a SECOND, different concrete case end to end — different numbers, a different setting, the same mechanism. Show the actual work in each beat, never just describe it.",
  analogy:
    "Build one analogy from something the learner already understands and map it part by part onto the concept. Name where the analogy breaks down in the last beat — an unqualified analogy teaches a misconception.",
  deeper:
    "Go one layer below the reading: the precise statement, the condition that makes it hold, the case that motivates it. This is the small print a textbook would set apart — rigorous, and still explained.",
};

export function validateConsumeModelBeat(raw: unknown, i: number): ConsumeModelBeat {
  const b = obj(raw, `beats[${i}]`);
  return {
    label: rejectEcho(str(b.label, `beats[${i}].label`), `beats[${i}].label`),
    text: str(b.text, `beats[${i}].text`),
  };
}

/** A beat mid-sentence. `label` is written before `text`, so a redraw with a
 *  label and no prose is still worth showing — it names what is coming. */
function draftConsumeModelBeat(raw: unknown): ConsumeModelBeat | null {
  const b = raw as { label?: unknown; text?: unknown };
  const label = typeof b?.label === "string" ? b.label : "";
  const text = typeof b?.text === "string" ? b.text : "";
  return label || text ? { label, text } : null;
}

export function validateConsumeModel(raw: unknown): ConsumeModelBeat[] {
  const root = obj(raw, "payload");
  return arr(root.beats, "beats", MODEL_BEAT_BOUNDS.min, MODEL_BEAT_BOUNDS.max).map(
    validateConsumeModelBeat,
  );
}

export interface ModelParams {
  topic: string;
  nodeLabel: string;
  /** Which of the four controls the learner tapped. */
  lens: AltKey;
  /** The section being looked at, as it is on screen behind the view. */
  kicker: string;
  body: string[];
  takeaway: string;
  interests: string;
  language?: Language;
}

/** The shared framing of both model-view prompts. */
function modelContext(params: ModelParams): string {
  const {
    topic,
    nodeLabel,
    lens,
    kicker,
    body,
    takeaway,
    interests,
    language = "en",
  } = params;
  // The learner tapped a control in THEIR language — quoting the English one
  // back at the model while `languageNote` asks for Portuguese output describes
  // a button that isn't on their screen.
  const label = new Map(altControls(language)).get(lens) ?? lens;
  return `A learner is reading the section "${kicker}" of the pass on "${nodeLabel}" within "${topic}". This is the section, exactly as it sits on their screen:

${body.join("\n\n")}

Takeaway: ${takeaway}

They tapped "${label}" — "${lensNote(lens, language)}" — which opens a MODEL VIEW over that section. ${LENS_BRIEF[lens]}

The section is NOT replaced: it stays on screen underneath, and they will go back to it. So:
- Cover the SAME material. A model view that drifts to a neighbouring topic strands the learner.
- Never restate the prose above sentence for sentence — they just read it. This is a different route through it.
- Write ${MODEL_BEAT_BOUNDS.min}-${MODEL_BEAT_BOUNDS.max} beats that are revealed one at a time and build in order, each picking up where the last left off. The first beat must stand on its own, since it is on screen while the rest are still being written.
${interestNote(interests)}`;
}

export async function generateConsumeModel(
  params: ModelParams,
): Promise<ConsumeModelBeat[]> {
  return generateJson(
    user(
      `${modelContext(params)}

Return JSON:
{
  "beats": [${MODEL_BEAT_SHAPE}, ...]
}

${MODEL_BEAT_EXAMPLE}${languageNote(params.language)}`,
    ),
    validateConsumeModel,
    { label: "model" },
  );
}

/**
 * Streamed variant: the first beat is on screen — and reading — while the rest
 * are still being decoded, which is the whole point of a view opened from
 * inside a screen the learner is already on.
 *
 * Same fallback contract as the other streamed kinds: a failure before the
 * first beat drops to the retried single-shot path, since "the model ignored
 * the format" is indistinguishable from "nothing usable happened yet". After
 * that it surfaces, the client keeps what landed, and nothing incomplete is
 * cached — so reopening the lens retries.
 */
export async function* generateConsumeModelStream(
  params: ModelParams,
): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjectsProgressive(
      user(
        `${modelContext(params)}

Write the beats as SEPARATE top-level JSON objects, one after another — NOT
wrapped in an array or a {"beats": [...]} object, no markdown fences, no
numbering, no commentary before/after/between them. Each object has this shape:
${MODEL_BEAT_SHAPE}

${MODEL_BEAT_EXAMPLE}${languageNote(params.language)}`,
      ),
      validateConsumeModelBeat,
      { label: "model-stream", partial: draftConsumeModelBeat },
    );
    for await (const beat of stream) {
      if (beat.partial) {
        yield { p: "beats", i: yielded, v: beat.value, partial: true };
        continue;
      }
      yield { p: "beats", i: yielded++, v: beat.value };
    }
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "model_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const beats = await generateConsumeModel(params);
    for (const [i, beat] of beats.entries()) yield { p: "beats", i, v: beat };
  }
}
