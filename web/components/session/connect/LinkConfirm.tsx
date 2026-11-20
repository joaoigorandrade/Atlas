"use client";

// The foot of a linking prompt: the button that confirms the link, the judge's
// read of it, and — only once it is confirmed — the map's own sentence, to
// compare against (W1.5).
//
// The suggestion used to be offered before confirming, and a confirmed link
// with an empty box became a card on it. Reading a plausible sentence and
// confirming it is recognition and encodes almost nothing; so the button stays
// shut until the box holds the learner's own words (`connectDraftReady`), the
// judge rules the sentence before it confirms, and the map's version appears
// afterwards, as a comparison, never as the card.

import {
  CONNECT_COLOR,
  connectDraftReady,
  type ConnectRuling,
  type ElaborationLink,
} from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";

const STRINGS = {
  en: {
    compare: "Compare with the map’s version:",
    ownWords:
      "Write the link in your own words — at least a full clause — to confirm it.",
    confirm: "Confirm this link →",
    checking: "Checking the link…",
    update: "Link confirmed · update",
    vague: "Confirmed, but thin — ",
    wrong: "Not confirmed — ",
  },
  "pt-BR": {
    compare: "Compare com a versão do mapa:",
    ownWords:
      "Escreva o vínculo com suas palavras — ao menos uma oração inteira — para confirmá-lo.",
    confirm: "Confirmar este vínculo →",
    checking: "Conferindo o vínculo…",
    update: "Vínculo confirmado · atualizar",
    vague: "Confirmado, mas raso — ",
    wrong: "Não confirmado — ",
  },
} as const;

export default function LinkConfirm({
  cand,
  draft,
  linked,
  ruling,
  judging,
  onConfirm,
}: {
  cand: ElaborationLink;
  draft: string;
  linked: boolean;
  ruling?: ConnectRuling;
  judging: boolean;
  onConfirm: (id: string) => void;
}) {
  const t = useT(STRINGS);
  const ready = connectDraftReady(draft, cand.rel) && !judging;
  const { accent, soft, border, glow } = CONNECT_COLOR;
  return (
    <>
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
        {judging ? t.checking : linked ? t.update : t.confirm}
      </button>
      {ruling && ruling.verdict !== "true" && (
        <div
          data-testid="connect-ruling"
          data-verdict={ruling.verdict}
          style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: color.amberInk }}
        >
          {ruling.verdict === "false" ? t.wrong : t.vague}
          {ruling.line}
        </div>
      )}
      {!ready && !judging && !linked && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: color.inkFaint }}>
          {t.ownWords}
        </div>
      )}
      {linked && cand.rel.trim() && (
        <div
          data-testid="connect-suggestion"
          style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: color.inkMuted }}
        >
          {t.compare} <span style={{ fontFamily: font.serif }}>“{cand.rel}”</span>
        </div>
      )}
    </>
  );
}
