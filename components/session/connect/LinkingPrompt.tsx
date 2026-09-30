"use client";

// The open linking prompt for one candidate: the question, the learner's own
// sentence, and the confirm at its foot. Out of `ConnectView` so the link can
// be checked before it is confirmed (W1.5) without growing the shell.

import {
  CONNECT_COLOR,
  type ConnectRuling,
  type ElaborationLink,
} from "@/lib/curriculum";
import { MicButton } from "@/components/VoiceInput";
import LinkConfirm from "@/components/session/connect/LinkConfirm";
import { color, font } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const VIOLET = CONNECT_COLOR.accent;

const STRINGS = {
  en: {
    linkingPrompt: "Linking prompt",
    howDoes: (center: string, cand: string) => `How does ${center} relate to ${cand}?`,
    describeRelationship:
      "Describe the real relationship in your own words — writing it yourself is what makes it stick.",
    connectionPlaceholder: "Your connection…",
  },
  "pt-BR": {
    linkingPrompt: "Prompt de vínculo",
    howDoes: (center: string, cand: string) => `Como ${center} se relaciona com ${cand}?`,
    describeRelationship:
      "Descreva a relação real com suas próprias palavras — escrever você mesmo é o que fixa.",
    connectionPlaceholder: "Sua conexão…",
  },
} as const;

/** The open linking prompt for one candidate — the editable relationship draft. */
export default function LinkingPrompt({
  center,
  cand,
  draft,
  linked,
  ruling,
  judging,
  onDraft,
  onConfirm,
}: {
  center: string;
  cand: ElaborationLink;
  draft: string;
  linked: boolean;
  /** The judge's read of this link, once it has one. */
  ruling?: ConnectRuling;
  judging: boolean;
  onDraft: (id: string, value: string) => void;
  onConfirm: (id: string) => void;
}) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        background: color.card,
        border: `1px solid ${CONNECT_COLOR.border}`,
        borderRadius: 3,
        padding: "22px 22px 20px",
        animation: "fadeUp .3s both",
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: VIOLET,
          marginBottom: 12,
        }}
      >
        {t.linkingPrompt}
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 22,
          lineHeight: 1.28,
          marginBottom: 8,
        }}
      >
        {t.howDoes(center, cand.label)}
      </div>
      <div
        style={{
          fontSize: 13,
          color: color.inkFaint,
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        {t.describeRelationship}
      </div>
      <div
        style={{
          background: color.cardAlt,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 3,
          padding: 5,
        }}
      >
        <textarea
          value={draft}
          data-testid="field-connection"
          onChange={(e) => onDraft(cand.id, e.target.value)}
          placeholder={t.connectionPlaceholder}
          style={{
            width: "100%",
            // The seeded draft is a full sentence or two; a fixed box clipped it
            // mid-word, so the learner accepted words they couldn't read.
            fieldSizing: "content",
            minHeight: 120,
            resize: "vertical",
            border: "none",
            background: "transparent",
            fontFamily: font.serif,
            fontSize: 16,
            lineHeight: 1.55,
            color: color.ink,
            padding: "12px 13px",
          }}
        />
      </div>
      <MicButton
        value={draft}
        onChange={(next) => onDraft(cand.id, next)}
        accent={VIOLET}
      />
      <LinkConfirm
        cand={cand}
        draft={draft}
        linked={linked}
        ruling={ruling}
        judging={judging}
        onConfirm={onConfirm}
      />
    </div>
  );
}
