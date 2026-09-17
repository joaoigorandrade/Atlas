import {
  ChatMessage,
  generateJson,
  streamJsonObjectsProgressive,
} from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";
import { logWarning } from "@/lib/log";

/** Shared verdict-first transport; incomplete streams use the retried path. */
export async function* judgeStream<T extends object>(
  messages: ChatMessage[],
  spec: {
    /** What object 1 must contain: the smallest thing that unblocks the UI. */
    firstShape: string;
    first: (raw: unknown) => Partial<T>;
    full: (raw: unknown) => T;
    label: string;
  },
): AsyncGenerator<StreamFrame> {
  const last = messages.length - 1;
  const streamed: ChatMessage[] = messages.map((m, i) =>
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
      yield { p: "judgement", v: item.value };
      if (complete) return;
    }
  } catch (err) {
    logWarning("judge_stream_fallback", err, { label: spec.label, sent });
  }
  // A later complete frame replaces the prefix or draft in the client.
  yield {
    p: "judgement",
    v: await generateJson(messages, spec.full, {
      label: spec.label,
      role: "judge",
    }),
  };
}
