"use client";

// The two whole-screen states that stand in for the app: the mark held while
// the saved run loads, and the gate below the 768px minimum (#8).

import { InkRule } from "@/components/Pending";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";

const STRINGS = {
  en: {
    tagline: "Atlas · learn anything, deeply",
    narrowTitle: "Atlas is best on a desktop screen",
    narrowBody:
      "The living concept map needs room to breathe. Open Atlas on a laptop or desktop — your progress is saved to your account and will be right where you left it.",
  },
  "pt-BR": {
    tagline: "Atlas · aprenda qualquer coisa, a fundo",
    narrowTitle: "O Atlas funciona melhor em uma tela de computador",
    narrowBody:
      "O mapa vivo de conceitos precisa de espaço. Abra o Atlas em um notebook ou computador — seu progresso fica salvo na sua conta, exatamente onde você parou.",
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

export default function AppGate({ narrow }: { narrow: boolean }) {
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
      </div>
    </div>
  );
}
