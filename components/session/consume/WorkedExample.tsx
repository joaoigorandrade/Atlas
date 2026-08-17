"use client";

import { BLUE, STRINGS } from "./shared";
import { ConsumeExample } from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";
import Rich from "@/components/Rich";

export function WorkedExample({ example }: { example: ConsumeExample }) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        marginTop: 22,
        background: color.cardAlt,
        border: `1px solid ${color.hairline}`,
        borderLeft: `3px solid ${BLUE}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: BLUE,
          marginBottom: 8,
        }}
      >
        {t.workedExample}
      </div>
      <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 12 }}>
        <Rich text={example.title} />
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {example.steps.map((s, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 11,
              alignItems: "baseline",
              marginBottom: i === example.steps.length - 1 ? 0 : 10,
            }}
          >
            <span
              style={{
                flex: "0 0 auto",
                fontFamily: font.mono,
                fontSize: 10.5,
                color: color.inkGhost,
                paddingTop: 2,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ fontSize: 14.5, lineHeight: 1.6, color: color.ink }}>
              <Rich text={s} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * "Ask about this" — the learner's own question about the passage they just
 * highlighted, answered against this section.
 *
 * The draft question is local state on purpose: lifting every keystroke into
 * the session would re-render the whole reading column per character. Only a
 * submitted ask goes up, and the streamed answer comes back down.
 */
