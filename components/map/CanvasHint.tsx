"use client";

// The one-line "how to drive the canvas" legend under the map.
//
// It lived inline in `AtlasApp` as an English string literal, which made it the
// largest piece of untranslated copy in a pt-BR run. Out here it gets both
// languages and `inkMuted` instead of `inkGhost`: an instruction nobody can
// read is not a decoration.

import { color, font } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    hint: "scroll to zoom · drag canvas to pan · drag a node to move · double-click a lit node to begin",
  },
  "pt-BR": {
    hint: "role para dar zoom · arraste a tela para mover · arraste um nó para reposicioná-lo · dê dois cliques num nó aceso para começar",
  },
} as const;

export default function CanvasHint({ left }: { left: number }) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        position: "absolute",
        bottom: 18,
        left,
        right: 18,
        fontFamily: font.mono,
        fontSize: 11,
        color: color.inkMuted,
        zIndex: 12,
        pointerEvents: "none",
      }}
    >
      {t.hint}
    </div>
  );
}
