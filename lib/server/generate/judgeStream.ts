import {
  ChatMessage,
  generateJson,
  streamJsonObjectsProgressive,
} from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";
import { logWarning } from "@/lib/log";

/**
 * A verdict Jev was sure of (`lib/server/decide.ts`), and how it lands.
 *
 * The LLM is *told* the verdict, so the critique it writes argues for it
 * instead of against it, and `pin` folds it over every object the LLM sends,
 * so no frame can carry a different ruling. Null — Jev unsure, down or off —
 * leaves the judge exactly as it was.
 */
export interface Decided<T> {
  verdict: Partial<T>;
  /** One line appended to the prompt stating the fixed ruling. */
  tell: string;
  /** Folds the verdict over an LLM object. Default: shallow merge. */
  pin?: (llm: Partial<T>, verdict: Partial<T>) => Partial<T>;
  /** Send the verdict as the first frame, before the LLM has said anything.
   *  Off for rubric judges, whose first frame must also carry the quotes. */
  early?: boolean;
}

function withDecision<T>(messages: ChatMessage[], d: Decided<T> | null) {
  if (!d) return { messages, pin: <V>(v: V) => v };
  const last = messages.length - 1;
  const pin = d.pin ?? ((llm, v) => ({ ...llm, ...v }));
  return {
    messages: messages.map((m, i) =>
      i === last
        ? {
            ...m,
            content: `${m.content}\n\nTHE RULING IS ALREADY MADE — a separate grader decided it, and your JSON must repeat it exactly: ${d.tell}\nWrite everything else (the reply, the quotes) so it is consistent with that ruling.`,
          }
        : m,
    ),
    pin: <V>(v: V) => pin(v as Partial<T>, d.verdict) as V,
  };
}

/** The single-shot judge, with the decision applied the same way. */
export async function judgeOnce<T>(
  messages: ChatMessage[],
  full: (raw: unknown) => T,
  label: string,
  decided?: Promise<Decided<T> | null>,
): Promise<T> {
  const { messages: told, pin } = withDecision(messages, (await decided) ?? null);
  return pin(await generateJson(told, full, { label, role: "judge" }));
}

/** Shared verdict-first transport; incomplete streams use the retried path. */
export async function* judgeStream<T extends object>(
  messages: ChatMessage[],
  spec: {
    /** What object 1 must contain: the smallest thing that unblocks the UI. */
    firstShape: string;
    first: (raw: unknown) => Partial<T>;
    full: (raw: unknown) => T;
    label: string;
    decided?: Promise<Decided<T> | null>;
  },
): AsyncGenerator<StreamFrame> {
  const d = (await spec.decided) ?? null;
  const { messages: told, pin } = withDecision(messages, d);
  if (d?.early) yield { p: "judgement", v: d.verdict };
  const last = told.length - 1;
  const streamed: ChatMessage[] = told.map((m, i) =>
    i === last
      ? {
          ...m,
          content: `${m.content}

Write TWO SEPARATE top-level JSON objects, one after another — do not wrap the
PAIR in an array, no markdown fences, nothing before/after/between them. Two
objects exactly: never one object per list item.

First, immediately, the verdict alone: ${spec.firstShape}
Then the full object described above (it repeats the verdict and adds the rest).`,
        }
      : m,
  );

  // Try the full judgement before the prefix. A model returning the complete
  // object at once must not trigger a second, unnecessary provider call.
  let complete = false;
  let sent = 0;
  try {
    for await (const item of streamJsonObjectsProgressive<Partial<T> | T>(
      streamed,
      (raw) => {
        try {
          const value = spec.full(raw);
          complete = true;
          return value;
        } catch {
          return spec.first(raw);
        }
      },
      {
        label: `${spec.label}-stream`,
        role: "judge",
        // Draft prose only. A partial verdict must never drive mastery writes.
        partial: (raw) => {
          const response = (raw as { response?: unknown })?.response;
          return typeof response === "string" && response.trim()
            ? ({ response } as unknown as Partial<T>)
            : null;
        },
      },
    )) {
      if (item.partial) {
        yield { p: "judgement", v: item.value, partial: true };
        continue;
      }
      sent++;
      yield { p: "judgement", v: pin(item.value) };
      if (complete) return;
    }
  } catch (err) {
    logWarning("judge_stream_fallback", err, { label: spec.label, sent });
  }
  // A later complete frame replaces the prefix or draft in the client.
  yield {
    p: "judgement",
    v: pin(await generateJson(told, spec.full, { label: spec.label, role: "judge" })),
  };
}
