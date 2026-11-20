"use client";

// The two whole-screen states that stand in for the app: the mark held while
// the saved run loads, and the map's gate below 768px: a phone gets every
// screen and phase sheet, only the canvas needs the room (#8).

import { InkRule } from "@/components/Pending";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";

const STRINGS = {
  en: {
    tagline: "Atlas · learn anything, deeply",
    narrowTitle: "The map needs a bigger screen",
    narrowBody:
      "The living concept map needs room to breathe — open it on a laptop or desktop. Your review, today's plan and every phase work right here.",
    back: "Back to today",
  },
  "pt-BR": {
    tagline: "Atlas · aprenda qualquer coisa, a fundo",
    narrowTitle: "O mapa precisa de uma tela maior",
    narrowBody:
      "O mapa vivo de conceitos precisa de espaço — abra-o em um notebook ou computador. Sua revisão, o plano de hoje e todas as fases funcionam aqui.",
    back: "Voltar para hoje",
  },
} as const;

const CENTERED: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  background: color.paper,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const TAGLINE: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: 11,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: color.inkFaint,
  marginBottom: 16,
};

export default function AppGate({
  narrow,
  onBack,
}: {
  narrow: boolean;
  onBack?: () => void;
}) {
  const t = useT(STRINGS);
  if (!narrow)
    return (
      <div style={CENTERED}>
        <div style={{ textAlign: "center", animation: "softIn 0.5s 0.4s both" }}>
          <div style={TAGLINE}>{t.tagline}</div>
          <InkRule width={180} />
        </div>
      </div>
    );
  return (
    <div
      style={{
        ...CENTERED,
        color: color.ink,
        fontFamily: font.sans,
        padding: 32,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 380, animation: "fadeUp 0.4s both" }}>
        <div style={TAGLINE}>{t.tagline}</div>
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 28,
            lineHeight: 1.2,
            marginBottom: 14,
          }}
        >
          {t.narrowTitle}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: color.inkSoft }}>
          {t.narrowBody}
        </div>
        {onBack && (
          <Button
            data-testid="action-gate-back"
            onClick={onBack}
            style={{ marginTop: 24 }}
          >
            {t.back}
          </Button>
        )}
      </div>
    </div>
  );
}
