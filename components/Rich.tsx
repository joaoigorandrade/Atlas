import { type ReactNode } from "react";
import { tokenSlice, tokenizeRich, type RichToken, type SpeakRange } from "@/lib/rich";
import { color, font } from "@/lib/theme";

// The model writes markdown-flavoured prose — `code`, **bold**, *italic*, and
// fenced blocks. Rendering it as raw text leaks the punctuation into the UI.
// ponytail: inline spans + fenced blocks only; no lists/links/headings — add a
// real markdown dependency when the model starts emitting those.
//
// The walk itself lives in `lib/rich.ts`, because read-aloud speaks the same
// stripped text and highlights the word being spoken *in this output*.

const codeStyle = {
  fontFamily: font.mono,
  fontSize: "0.88em",
  background: color.chipBg,
  border: `1px solid ${color.hairline}`,
  borderRadius: 4,
  padding: "0.1em 0.32em",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
};

// The read-along mark. `boxShadow` rather than `padding` gives the pill its
// breathing room without moving a single glyph — the highlight has to travel
// word by word through settled text, and a padded span would reflow the
// paragraph on every hop.
//
// Deliberately not animated: at three to five words a second, a fade-in per
// word is a strobe. The paragraph wash under it carries the motion instead.
const spokenStyle = {
  background: color.accentWash,
  borderRadius: 3,
  boxShadow: `0 0 0 2px ${color.accentWash}`,
};

/** One token's text, with the spoken slice of it marked. */
function content(token: RichToken, speak: SpeakRange | null): ReactNode {
  const cut = tokenSlice(token, speak);
  if (!cut) return token.text;
  return (
    <>
      {token.text.slice(0, cut.from)}
      <span style={spokenStyle}>{token.text.slice(cut.from, cut.to)}</span>
      {token.text.slice(cut.to)}
    </>
  );
}

/**
 * Renders one string of model-written markdown inline (no wrapper element).
 *
 * `speak` is a character range in `spokenText(text)` — the word the voice is
 * saying right now — or null when nothing is being read.
 */
export default function Rich({
  text,
  speak,
}: {
  text: string | undefined | null;
  speak?: SpeakRange | null;
}) {
  if (!text) return null;
  const range = speak ?? null;
  const out: ReactNode[] = tokenizeRich(text).map((token, i) => {
    const key = `t${i}`;
    switch (token.kind) {
      case "text":
        // A bare string when nothing is marked, so the common case adds no
        // element to the tree at all.
        return range ? <span key={key}>{content(token, range)}</span> : token.text;
      case "code":
        return (
          <code key={key} style={codeStyle}>
            {content(token, range)}
          </code>
        );
      case "bold":
        return (
          <strong key={key} style={{ fontWeight: 600 }}>
            {content(token, range)}
          </strong>
        );
      case "em":
        return <em key={key}>{content(token, range)}</em>;
      case "fence":
        return (
          // ponytail: <code>, not <pre> — these land inside spans and buttons,
          // where a block element would be invalid nesting.
          <code
            key={key}
            style={{
              ...codeStyle,
              display: "block",
              padding: "12px 14px",
              borderRadius: 8,
              margin: "10px 0",
              overflowX: "auto",
              lineHeight: 1.5,
            }}
          >
            {token.text}
          </code>
        );
    }
  });
  // ponytail: one wrapper element, not a fragment — a flex/grid parent turns
  // loose children into separate items, and a `code` item shrinks to
  // min-content (one character per line). minWidth:0 keeps it from overflowing
  // when it *is* the flex item.
  return <span style={{ minWidth: 0 }}>{out}</span>;
}
