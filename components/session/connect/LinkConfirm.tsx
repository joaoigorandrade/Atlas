"use client";

// The foot of a linking prompt: the map's suggestion, on demand, and the
// button that confirms the link.
//
// The suggestion is shown, never poured into the box. Handing the learner a
// plausible sentence to confirm turns writing a link into recognising one, so
// the button stays shut until the box holds their own words (`connectDraftReady`)
// — long enough to say something, and not the suggestion pasted back.

import { useState } from "react";
import { CONNECT_COLOR, connectDraftReady, type ElaborationLink } from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";

const STRINGS = {
  en: {
    showSuggestion: "Stuck? Show the map’s suggestion",
    suggestion: "The map suggests — say it your own way:",
    ownWords: "Write the link in your own words to confirm it.",
    confirm: "Confirm this link →",
    update: "Link confirmed · update",
  },
  "pt-BR": {
    showSuggestion: "Travou? Ver a sugestão do mapa",
    suggestion: "O mapa sugere — diga do seu jeito:",
    ownWords: "Escreva o vínculo com suas palavras para confirmá-lo.",
    confirm: "Confirmar este vínculo →",
    update: "Vínculo confirmado · atualizar",
  },
} as const;

export default function LinkConfirm({
  cand,
  draft,
  linked,
  onConfirm,
}: {
  cand: ElaborationLink;
  draft: string;
  linked: boolean;
  onConfirm: (id: string) => void;
}) {
  const t = useT(STRINGS);
  const [shown, setShown] = useState(false);
  const ready = connectDraftReady(draft, cand.rel);
  const { accent, soft, border, glow } = CONNECT_COLOR;
  return (
    <>
      {cand.rel.trim() &&
        (shown ? (
          <div
            data-testid="connect-suggestion"
            style={{
              marginTop: 10,
              fontSize: 13,
              lineHeight: 1.5,
              color: color.inkMuted,
            }}
          >
            {t.suggestion} <span style={{ fontFamily: font.serif }}>“{cand.rel}”</span>
          </div>
        ) : (
          <button
            className="at-press"
            onClick={() => setShown(true)}
            style={{
              display: "block",
              marginTop: 10,
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12.5,
              color: color.inkFaint,
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            {t.showSuggestion}
          </button>
        ))}
      <button
        className="at-press"
        data-testid="action-confirm-link"
        disabled={!ready}
        onClick={() => onConfirm(cand.id)}
        style={{
          marginTop: 14,
          width: "100%",
          padding: 13,
          borderRadius: 3,
          fontSize: 14.5,
          fontWeight: 600,
          cursor: ready ? "pointer" : "default",
          background: linked ? soft : ready ? accent : "rgba(43,33,24,0.07)",
          color: linked ? accent : ready ? color.accentInk : color.inkGhost,
          border: linked ? `1px solid ${border}` : "none",
          boxShadow: linked || !ready ? "none" : `0 8px 20px ${glow}`,
        }}
      >
        {linked ? t.update : t.confirm}
      </button>
      {!ready && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: color.inkFaint }}>
          {t.ownWords}
        </div>
      )}
    </>
  );
}
