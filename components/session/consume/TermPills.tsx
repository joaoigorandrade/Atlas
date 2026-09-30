"use client";

// A section's pre-taught terms: one pill each, opening its definition inline.
// Lifted out of ConsumeView to keep that file under its size ceiling.

import { STRINGS } from "./shared";
import type { ConsumeTerm } from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";
import Rich from "@/components/Rich";

export function TermPills({
  chunkId,
  terms,
  openKey,
  onToggle,
}: {
  chunkId: string;
  terms: ConsumeTerm[];
  /** The `chunkId:term` key of the definition open right now, if any. */
  openKey: string | null;
  onToggle: (key: string) => void;
}) {
  const t = useT(STRINGS);
  if (!terms.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
      {terms.map((term) => {
        const key = `${chunkId}:${term.t}`;
        const open = openKey === key;
        return (
          <div key={key} style={{ display: "flex", flexDirection: "column" }}>
            <button
              className="at-press"
              onClick={() => onToggle(key)}
              aria-expanded={open}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 11px",
                background: color.chipBg,
                border: `1px solid ${color.hairlineStrong}`,
                borderRadius: 20,
                fontSize: 12.5,
                color: color.inkSoft,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: color.amberInk,
                }}
              >
                {t.term}
              </span>
              <Rich text={term.t} />
            </button>
            {open && (
              <div
                style={{
                  marginTop: 7,
                  maxWidth: 340,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: color.inkSoft,
                  background: color.amberBg,
                  border: "1px solid rgba(160,106,48,0.2)",
                  borderRadius: 3,
                  padding: "9px 12px",
                  animation: "fadeUp .25s both",
                }}
              >
                <Rich text={term.d} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
