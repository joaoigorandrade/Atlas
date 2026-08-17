// Structured logging, formalized.
//
// The server already logs `console.*(JSON.stringify({ evt, ... }))` in ~24
// places; this is that convention with the two things it was missing — one
// truncation length (it drifted between 300 and 600 chars) and a request id, so
// a learner saying "it failed" can be traced to the exact line without a
// telemetry vendor or a new table.
//
// Universal: the client writes the same shape, which is what makes a browser
// console paste readable next to a server log.

/** Upstream error bodies can be enormous. One length, everywhere. */
export const LOG_DETAIL_CHARS = 600;

export type LogFields = Record<string, unknown>;

/** An error as a log field: its message, bounded. Never its stack — these lines
 *  are read in a log viewer, not a debugger. */
export function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, LOG_DETAIL_CHARS);
}

function emit(
  write: (line: string) => void,
  lvl: "info" | "warn" | "error",
  evt: string,
  fields: LogFields,
): void {
  // Severity travels *in* the line, not only in which console stream it went
  // to: a drain that ingests the JSON body (Vercel → Datadog/Axiom/…) can then
  // filter an error budget with `lvl:error`, which is the whole point of
  // structured logs reaching somewhere queryable (docs/PLAN-QUALITY.md §3).
  //
  // Undefined fields are dropped rather than serialized as absent keys with
  // meaning — a log line should not imply a value was measured and empty.
  const entry: LogFields = { lvl, evt };
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined) entry[key] = value;
  write(JSON.stringify(entry));
}

/** A thing that happened. */
export function logEvent(evt: string, fields: LogFields = {}): void {
  emit((line) => console.log(line), "info", evt, fields);
}

/** A thing that failed. `err` is folded in as a bounded `error` field. */
export function logError(evt: string, err: unknown, fields: LogFields = {}): void {
  emit((line) => console.error(line), "error", evt, { ...fields, error: describe(err) });
}

/** A thing that failed but was handled — a swallowed warm, a best-effort read
 *  that fell back. Loud enough to find, quiet enough not to page anyone. */
export function logWarning(evt: string, err: unknown, fields: LogFields = {}): void {
  emit((line) => console.warn(line), "warn", evt, { ...fields, error: describe(err) });
}
