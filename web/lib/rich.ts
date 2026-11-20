// The markdown walk `components/Rich.tsx` renders, pulled out as a pure
// function so the *voice* can share it.
//
// Read-aloud sends prose to a hosted engine and gets back character offsets
// into the exact string it sent. For those offsets to mean anything on screen,
// the string the engine speaks and the string the reader sees have to be the
// same one — which means one definition of "strip the markup", not two that
// drift. `spokenText()` is that definition; `tokenizeRich()` is the same walk
// with the offsets attached, and `Rich` renders from it.

/** What a token renders as. Mirrors the elements `Rich` has always emitted. */
export type RichKind = "text" | "code" | "bold" | "em" | "fence";

export interface RichToken {
  kind: RichKind;
  /** The visible text, markers already consumed. */
  text: string;
  /** Where this token starts in `spokenText()`, or -1 when it isn't spoken. */
  at: number;
}

const INLINE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_/g;
const FENCE = /```[\w-]*\n?([\s\S]*?)```/g;

/**
 * Split one string of model-written markdown into renderable tokens.
 *
 * Fenced blocks carry `at: -1` and contribute nothing to `spokenText()`: a
 * voice reading `const a = 1;` aloud is noise, not prose. Everything else is
 * spoken, so the non-fence tokens' `text` concatenated *is* the spoken string —
 * which is what makes `at` a simple running total rather than an index map.
 */
export function tokenizeRich(text: string | undefined | null): RichToken[] {
  if (!text) return [];
  const out: RichToken[] = [];
  let spoken = 0;

  const push = (kind: RichKind, piece: string) => {
    if (!piece) return;
    if (kind === "fence") {
      out.push({ kind, text: piece, at: -1 });
      return;
    }
    out.push({ kind, text: piece, at: spoken });
    spoken += piece.length;
  };

  const inline = (slice: string) => {
    let last = 0;
    for (const m of slice.matchAll(INLINE)) {
      const at = m.index ?? 0;
      if (at > last) push("text", slice.slice(last, at));
      const [raw, code, bold, em, under] = m;
      if (code !== undefined) push("code", code);
      else if (bold !== undefined) push("bold", bold);
      else push("em", em ?? under);
      last = at + raw.length;
    }
    if (last < slice.length) push("text", slice.slice(last));
  };

  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    const at = m.index ?? 0;
    if (at > last) inline(text.slice(last, at));
    push("fence", m[1].replace(/\n$/, ""));
    last = at + m[0].length;
  }
  if (last < text.length) inline(text.slice(last));
  return out;
}

/**
 * What a voice should actually say: the visible text with every marker gone
 * and every fenced block dropped. This is the exact string sent to the speech
 * engine, so its character offsets index straight back into these tokens.
 */
export function spokenText(text: string | undefined | null): string {
  let out = "";
  for (const token of tokenizeRich(text)) if (token.kind !== "fence") out += token.text;
  return out;
}

/** A half-open `[from, to)` range of the spoken string — one word, usually. */
export interface SpeakRange {
  from: number;
  to: number;
}

/**
 * Where a range falls inside one token, as offsets into `token.text`, or null
 * when it doesn't touch this token at all. Clamped, so a range spanning a
 * markup boundary highlights its share of each token it crosses.
 */
export function tokenSlice(
  token: RichToken,
  range: SpeakRange | null | undefined,
): SpeakRange | null {
  if (!range || token.at < 0) return null;
  const from = Math.max(range.from - token.at, 0);
  const to = Math.min(range.to - token.at, token.text.length);
  return to > from ? { from, to } : null;
}
