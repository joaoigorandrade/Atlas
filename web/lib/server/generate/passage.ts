// ---- kind: passage ---------------------------------------------------------
// "Ask about this" — the learner highlights a passage mid-reading and asks
// about it. Consume's one concession to interruption, and the only place in
// the phase where the learner sets the question.
//
// Never cached, for the same reason `judge` isn't: the payload is an answer to
// one learner's own words about one arbitrary substring of the prose. Two
// learners highlighting the same sentence have not asked the same thing.
import { arr, languageNote, obj, str, user } from "./common";
import { Language } from "@/lib/i18n";
import { generateJson, streamJsonObjectsProgressive } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

/** One paragraph of a streamed answer — its own JSON object so it renders the
 *  moment its closing brace lands. */
function validatePassagePart(raw: unknown, i: number): string {
  const o = obj(raw, `answer[${i}]`);
  return str(o.p, `answer[${i}].p`);
}

/** …and the same paragraph mid-sentence, for the token-by-token redraws. A
 *  paragraph is a bare string, so a partial one needs nothing but the prefix. */
function draftPassagePart(raw: unknown): string | null {
  const p = (raw as { p?: unknown })?.p;
  return typeof p === "string" && p.trim() ? p : null;
}

export function validatePassage(raw: unknown): string[] {
  const root = obj(raw, "payload");
  return arr(root.answer, "answer", 1, 4).map((p, i) => str(p, `answer[${i}]`));
}

export interface PassageParams {
  topic: string;
  nodeLabel: string;
  /** The section's kicker — "3 · Where it breaks". */
  kicker: string;
  /** The prose the learner is reading, as shown. */
  section: string;
  /** What they highlighted. */
  selection: string;
  /** What they asked, or empty — an empty question means "explain this". */
  question: string;
  language?: Language;
}

function passageContext(p: PassageParams): string {
  const asked = p.question.trim();
  return `A learner is part-way through the reading pass on "${p.nodeLabel}" within the topic "${p.topic}". They highlighted a passage in the section "${p.kicker}" and asked about it.

THE SECTION THEY ARE READING:
${p.section}

WHAT THEY HIGHLIGHTED:
"""
${p.selection}
"""

THEIR QUESTION:
${asked || "(none — they tapped “explain this”, so explain the highlighted passage.)"}

Answer THAT question, about THAT passage. Rules:
- Answer the question actually asked. Do not restate the passage back at them,
  do not summarize the section, do not open with a preamble about what a good
  question it is.
- Stay grounded in the section above — this is a clarification of material the
  learner is looking at, not a new lesson. If the honest answer is genuinely
  outside this section, say so in a sentence and give the short version anyway.
- If the question rests on a misunderstanding, name the misunderstanding first
  and plainly, then answer. Never validate faulty reasoning to be agreeable.
- If the passage is genuinely ambiguous or the sentence is poorly worded, say
  that rather than inventing a reading of it.
- Be concrete: a number, a case, the actual mechanism. 2-3 short paragraphs,
  and stop — they are mid-reading and want to get back to it.${languageNote(p.language)}`;
}

export async function generatePassage(params: PassageParams): Promise<string[]> {
  return generateJson(
    user(
      `${passageContext(params)}

Return JSON:
{
  "answer": ["paragraph 1", "paragraph 2"]   // 1-4 short paragraphs
}`,
    ),
    validatePassage,
    { label: "passage" },
  );
}

/**
 * Streamed variant: the answer paints word by word, paragraph by paragraph.
 * This is the one generation the learner waits on with the reading still on
 * screen behind it, so first-paint latency is the whole game — a complete
 * answer that arrives in one piece four seconds later reads as a hang.
 *
 * Token-by-token here rather than merely per-paragraph: an answer is 2-3
 * paragraphs, so paragraph frames alone still leave the panel empty for the
 * seconds it takes to write the first one.
 *
 * Falls back to the retried single-shot path if it fails before yielding
 * anything, exactly as the Consume stream does.
 */
export async function* generatePassageStream(
  params: PassageParams,
): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjectsProgressive(
      user(
        `${passageContext(params)}

Write the answer as 2-3 SEPARATE top-level JSON objects, one per paragraph, one
after another — NOT wrapped in an array or an object, no markdown fences, no
commentary before/after/between them. Each object has this shape:
{"p": "one paragraph of the answer"}`,
      ),
      validatePassagePart,
      { label: "passage-stream", partial: draftPassagePart },
    );
    for await (const part of stream) {
      if (part.partial) {
        yield { p: "answer", i: yielded, v: part.value, partial: true };
        continue;
      }
      yield { p: "answer", i: yielded++, v: part.value };
    }
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "passage_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const answer = await generatePassage(params);
    for (const [i, part] of answer.entries()) yield { p: "answer", i, v: part };
  }
}
