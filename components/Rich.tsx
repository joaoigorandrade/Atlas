import { type ReactNode } from "react";
import { color, font } from "@/lib/theme";

// The model writes markdown-flavoured prose — `code`, **bold**, *italic*, and
// fenced blocks. Rendering it as raw text leaks the punctuation into the UI.
// ponytail: inline spans + fenced blocks only; no lists/links/headings — add a
// real markdown dependency when the model starts emitting those.

const INLINE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_/g;
const FENCE = /```[\w-]*\n?([\s\S]*?)```/g;

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

function inline(text: string, prefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [raw, code, bold, em, under] = m;
    const key = `${prefix}i${n++}`;
    out.push(
      code !== undefined ? (
        <code key={key} style={codeStyle}>
          {code}
        </code>
      ) : bold !== undefined ? (
        <strong key={key} style={{ fontWeight: 600 }}>
          {bold}
        </strong>
      ) : (
        <em key={key}>{em ?? under}</em>
      ),
    );
    last = at + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renders one string of model-written markdown inline (no wrapper element). */
export default function Rich({ text }: { text: string | undefined | null }) {
  if (!text) return null;
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(FENCE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(...inline(text.slice(last, at), `b${n}`));
    out.push(
      // ponytail: <code>, not <pre> — these land inside spans and buttons,
      // where a block element would be invalid nesting.
      <code
        key={`f${n++}`}
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
        {m[1].replace(/\n$/, "")}
      </code>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(...inline(text.slice(last), `b${n}`));
  // ponytail: one wrapper element, not a fragment — a flex/grid parent turns
  // loose children into separate items, and a `code` item shrinks to
  // min-content (one character per line). minWidth:0 keeps it from overflowing
  // when it *is* the flex item.
  return <span style={{ minWidth: 0 }}>{out}</span>;
}
