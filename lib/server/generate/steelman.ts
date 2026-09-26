// ---- kind: steelman --------------------------------------------------------
// A contested question and its two positions, each with the load-bearing points
// a strong version actually makes. Those points are the rubric the judge rules
// against; the learner never sees them.
//
// The prompt's hard requirement is that BOTH positions be genuinely defensible
// and named by who held them. A question with one respectable answer produces a
// phase where the learner writes one real case and one shrug, which is the
// habit this phase exists to break rather than rehearse.

import {
  type Boundary,
  arr,
  boundaryNote,
  fail,
  languageNote,
  obj,
  rejectEcho,
  str,
  user,
} from "./common";
import { JUDGE_SYSTEM, judgeStream } from "./judge";
import {
  STEELMAN_VERDICTS,
  type Domain,
  type SteelmanContent,
  type SteelmanVerdict,
} from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { ChatMessage, generateJson } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

export function validateSteelman(nodeId: string, nodeLabel: string) {
  return (raw: unknown): SteelmanContent => {
    const root = obj(raw, "payload");
    const positions = arr(root.positions, "positions", 2, 2).map((v, i) => {
      const p = obj(v, `positions[${i}]`);
      return {
        id: `sm-${nodeId}-${i + 1}`,
        label: rejectEcho(str(p.label, `positions[${i}].label`), `positions[${i}].label`),
        heldBy: str(p.heldBy, `positions[${i}].heldBy`),
        mustCover: arr(p.mustCover, `positions[${i}].mustCover`, 2, 4).map((m, j) =>
          str(m, `positions[${i}].mustCover[${j}]`),
        ),
      };
    });
    if (positions[0].label.toLowerCase() === positions[1].label.toLowerCase())
      fail("the two positions must genuinely differ");
    return {
      nodeId,
      nodeLabel,
      question: str(root.question, "question"),
      positions: [positions[0], positions[1]],
    };
  };
}

export interface SteelmanParams extends Boundary {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  language?: Language;
  domain?: Domain;
}

export async function generateSteelman(params: SteelmanParams): Promise<SteelmanContent> {
  const { topic, nodeLabel, language = "en" } = params;
  return generateJson(
    user(
      `Write a CONTESTED-QUESTION pass for "${nodeLabel}" within "${topic}". The learner will build the strongest case for EACH side, then say which they hold and what would change their mind.
${boundaryNote(params)}

Pick a question where informed, honest people genuinely disagree — about causes, about significance, about what an episode shows. Never a question of fact with a known answer, and never a question of religious truth: where a tradition's own claims are at issue, the contest is over how historians read the evidence, not over whether the faith is correct.

State the question so that NEITHER side is the default reading. Name each position by who actually held it — a named school, party, tradition or historian. A position nobody held is a strawman with better manners.

"mustCover" is the rubric: the load-bearing points a genuinely strong version of that side makes. The learner never sees it. Write it so that a case missing one of them is thinner, not wrong.

Return JSON:
{
  "question": "the contested question, stated so neither answer is the obvious one",
  "positions": [
    { "label": "the position, in 3-6 words",
      "heldBy": "who actually argued this, named",
      "mustCover": ["2-4 load-bearing points the strongest version of this side makes"] },
    { ... the other side, equally strong ... }
  ]   // exactly 2
}${languageNote(language)}`,
    ),
    validateSteelman(params.nodeId, nodeLabel),
    { label: "steelman" },
  );
}

// ---- the grader ------------------------------------------------------------

export interface SteelmanJudgement {
  verdicts: Array<{ positionId: string; verdict: SteelmanVerdict; quote: string }>;
  response: string;
}

interface JudgeSteelmanParams {
  topic: string;
  nodeLabel: string;
  question: string;
  positions: Array<{ id: string; label: string; heldBy: string; mustCover: string[] }>;
  cases: Record<string, string>;
  holds: string;
  disconfirmer: string;
  language?: Language;
}

/** The verdict-only first object of the streamed judgement: rulings without the
 *  written read, so the screen can mark each side before the prose lands. It
 *  must NOT require `response`, which by design has not been written yet. */
export function steelmanVerdictPrefix(ids: string[]) {
  const rows = new Map<string, SteelmanJudgement["verdicts"][number]>();
  return (raw: unknown): Partial<SteelmanJudgement> => {
    try {
      return { verdicts: validateSteelmanVerdicts(raw, ids) };
    } catch (whole) {
      // Not the wrapped array — and one ruling on its own is not a malformed
      // judgement, it is the shape the model actually streams: one top-level
      // object per position, whatever the prompt's example shows. Shipping
      // without this made the streamed half contribute nothing, so every
      // submission paid 3.6s and a whole generation for frames that were all
      // dropped, then fell back to a second call. Exactly what `verdictPrefix`
      // was taught for the rubric judges; Steelman shipped with the old shape.
      const row = obj(raw, "payload");
      const positionId = typeof row.positionId === "string" ? row.positionId : "";
      // Anything that is not one of ours is an object nobody asked for, and the
      // caller's own error is the more useful one to report for it.
      if (!ids.includes(positionId)) throw whole;
      if (!(STEELMAN_VERDICTS as readonly string[]).includes(String(row.verdict)))
        throw whole;
      // First ruling per position wins, exactly as the array path dedups.
      if (!rows.has(positionId))
        rows.set(positionId, {
          positionId,
          verdict: row.verdict as SteelmanVerdict,
          quote: typeof row.quote === "string" ? row.quote : "",
        });
      // Still a prefix of a prefix: buffer and wait for the rest. Its own
      // message rather than the validator's — this is the ordinary path for
      // every position but the last, and re-throwing "verdicts must be an
      // array" puts lines that look like a broken judge on the error dashboard
      // each time one works.
      if (rows.size < ids.length)
        throw new Error(
          `steelman verdict ${positionId} buffered — ${rows.size} of ${ids.length} so far`,
        );
      return { verdicts: ids.map((id) => rows.get(id)!) };
    }
  };
}

function validateSteelmanVerdicts(
  raw: unknown,
  ids: string[],
): SteelmanJudgement["verdicts"] {
  const root = obj(raw, "payload");
  const verdicts = arr(root.verdicts, "verdicts", ids.length, ids.length).map((v, i) => {
    const o = obj(v, `verdicts[${i}]`);
    const positionId = str(o.positionId, `verdicts[${i}].positionId`);
    if (!ids.includes(positionId))
      fail(`verdicts[${i}].positionId "${positionId}" is not one of the positions`);
    if (!(STEELMAN_VERDICTS as readonly string[]).includes(String(o.verdict)))
      fail(`verdicts[${i}].verdict must be strong, thin or strawman`);
    return {
      positionId,
      verdict: o.verdict as SteelmanVerdict,
      quote: typeof o.quote === "string" ? o.quote : "",
    };
  });
  if (new Set(verdicts.map((v) => v.positionId)).size !== ids.length)
    fail("each position must be ruled exactly once");
  return verdicts;
}

export function validateSteelmanJudgement(ids: string[]) {
  return (raw: unknown): SteelmanJudgement => ({
    verdicts: validateSteelmanVerdicts(raw, ids),
    response: str(obj(raw, "payload").response, "response"),
  });
}

function steelmanJudgeMessages(params: JudgeSteelmanParams): ChatMessage[] {
  const { topic, nodeLabel, question, positions, cases, holds, disconfirmer } = params;
  const rows = positions
    .map(
      (p) =>
        `Position ${p.id} — "${p.label}" (held by ${p.heldBy}). A strong case makes: ${p.mustCover.join("; ")}\nThe learner wrote: """${cases[p.id] ?? ""}"""`,
    )
    .join("\n\n");
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `The learner was asked to build the strongest case for BOTH sides of a contested question about "${nodeLabel}" (topic: ${topic}), then say which they hold.

The question: """${question}"""

${rows}

They hold: ${holds}
What would change their mind: """${disconfirmer}"""

Rule EACH position independently, by its id:
- "strong": the case makes the load-bearing points, in their own words, and a holder of that position would recognise it as their argument.
- "thin": the case is honest but misses points that carry it — true as far as it goes, and it does not go far.
- "strawman": the case is built to lose. It states the position in terms its holders would reject, argues against it while pretending to argue for it, or is markedly weaker than the case they wrote for the other side.
Judge the side they REJECT by exactly the same standard as the side they hold. A learner who writes a superb case for their own view and a shrug for the other has done the one thing this exercise forbids.
On "thin" and "strawman", quote the learner's own words that earned it in \`quote\` — under 20 words.

In \`response\`, 2-4 sentences. Say which case held and which did not, and name what the weaker one left out. If their disconfirmer is not something that could actually be found or happen, say so plainly.

Return JSON: {"verdicts": [{"positionId": "...", "verdict": "strong" | "thin" | "strawman", "quote": "..."}, ...one per position], "response": "..."}${languageNote(params.language ?? "en")}`,
    },
  ];
}

export async function judgeSteelman(
  params: JudgeSteelmanParams,
): Promise<SteelmanJudgement> {
  return generateJson(
    steelmanJudgeMessages(params),
    validateSteelmanJudgement(params.positions.map((p) => p.id)),
    { label: "judge-steelman", role: "judge" },
  );
}

export function judgeSteelmanStream(
  params: JudgeSteelmanParams,
): AsyncGenerator<StreamFrame> {
  const ids = params.positions.map((p) => p.id);
  return judgeStream<SteelmanJudgement>(steelmanJudgeMessages(params), {
    firstShape: '{"verdicts": [...], "response": "..."}',
    first: steelmanVerdictPrefix(ids),
    full: validateSteelmanJudgement(ids),
    label: "judge-steelman",
  });
}
