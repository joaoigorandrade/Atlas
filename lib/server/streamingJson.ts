// Reading JSON out of a buffer that is still growing.
//
// A streamed generation arrives as bytes, not as objects: a screen has to paint
// the third section while the fourth is still being written. These are the two
// halves of that — pull out whatever is *complete*, and make something
// renderable out of whatever is not.
//
// Pure string work, deliberately apart from `openrouter.ts`: the transport
// there owns deadlines, the retry ladder and the model fallback chain, and none
// of that has anything to say about where a brace closes.

/** Pull complete top-level `{...}` objects out of a growing buffer, tolerant
 *  of whitespace/newlines/commas between them and of braces inside string
 *  literals. Returns what's left over (an in-progress object, or nothing). */
export function extractCompleteObjects(buf: string): {
  objects: string[];
  rest: string;
} {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  let lastEnd = 0;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(buf.slice(start, i + 1));
        lastEnd = i + 1;
        start = -1;
      }
    }
  }
  return { objects, rest: buf.slice(lastEnd) };
}

/**
 * Close an in-progress JSON object so half a decoded object can be shown while
 * the rest is still being written — the token-by-token layer under
 * `streamJsonObjectsProgressive`.
 *
 * The buffer is whatever came after the last complete object, so it is a prefix
 * of one object: an unterminated string, a dangling key, unclosed brackets.
 * Everything openable is closed and the result parsed; if that doesn't parse,
 * the last comma-separated fragment is dropped and it's tried again, because
 * the only part that can't be closed cleanly is the member currently being
 * written. Returns null when nothing coherent can be salvaged yet.
 *
 * Deliberately lenient and lossy: its output is only ever rendered, never
 * validated into a payload and never cached — `StreamFrame.partial` marks it.
 */
export function closePartialJson(buf: string): unknown | null {
  const start = buf.indexOf("{");
  if (start === -1) return null;
  let text = buf.slice(start);
  for (let attempt = 0; attempt < 3; attempt++) {
    const closed = closeOpenStructures(text);
    if (closed !== null) {
      try {
        const parsed: unknown = JSON.parse(closed);
        // An object with nothing in it yet is not a redraw worth sending.
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length === 0)
          return null;
        return parsed;
      } catch {
        // Falls through to the trim below.
      }
    }
    const cut = lastCommaOutsideString(text);
    if (cut === -1) return null;
    text = text.slice(0, cut);
  }
  return null;
}

/** Append the closers for every structure left open, after trimming whatever
 *  trailing fragment can't stand on its own (a dangling `,` or `key:`). */
function closeOpenStructures(text: string): string | null {
  const closers: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") closers.push("}");
    else if (ch === "[") closers.push("]");
    else if (ch === "}" || ch === "]") closers.pop();
  }
  if (closers.length === 0) return null;
  // A trailing backslash would escape the quote we're about to add.
  let body = esc ? text.slice(0, -1) : text;
  if (inStr) body += '"';
  body = body.replace(/\s+$/, "");
  // `{"a": 1,` and `{"a":` are both un-closable as they stand. A trailing comma
  // just goes; a trailing colon takes its key with it, since the value it
  // introduces hasn't been written yet.
  for (;;) {
    if (body.endsWith(",")) {
      body = body.slice(0, -1).replace(/\s+$/, "");
      continue;
    }
    if (!body.endsWith(":")) break;
    const cut = lastCommaOutsideString(body);
    body = (
      cut === -1 ? body.slice(0, body.lastIndexOf("{") + 1) : body.slice(0, cut)
    ).replace(/\s+$/, "");
  }
  return body + closers.reverse().join("");
}

/** Index of the last comma that isn't inside a string literal, or -1. */
function lastCommaOutsideString(text: string): number {
  let inStr = false;
  let esc = false;
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === ",") last = i;
  }
  return last;
}

/**
 * Validate one object off a stream, or drop it.
 *
 * A slot the model wrote badly costs that slot, not the pass. Throwing instead
 * sent the caller to its single-shot fallback, which re-generates and re-bills
 * the whole thing over one malformed object: a lens cost 7.8s + 6.1s and two
 * model calls, a socratic 29.6s + 27.6s. A stream where *every* object is bad
 * still yields nothing, and the caller's empty-stream throw routes that into
 * the same fallback — which is the case the fallback is actually for.
 */
export function validateSlot<T>(
  raw: string,
  index: number,
  label: string,
  validate: (value: unknown, index: number) => T,
): T | undefined {
  try {
    return validate(JSON.parse(raw), index);
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "stream_slot_dropped",
        kind: label,
        index,
        error: String(err instanceof Error ? err.message : err).slice(0, 200),
      }),
    );
    return undefined;
  }
}
