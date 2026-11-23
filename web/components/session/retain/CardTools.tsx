"use client";

// The two ways out of a card that are not a grade: take back the last answer
// (a mis-tap on "Again" flags a node Shaky), and pull a wrong or useless card
// out of rotation. Quiet on purpose — under the card, never competing with the
// grade buttons. Ctrl/⌘+Z undoes, as in Anki.

import { useEffect } from "react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import { STRINGS } from "@/components/session/retainCopy";

export default function CardTools({
  canUndo,
  onUndo,
  onSuspend,
}: {
  canUndo: boolean;
  onUndo: () => void;
  onSuspend: () => void;
}) {
  const t = useT(STRINGS);

  useEffect(() => {
    if (!canUndo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement | null;
      // A text field's own undo is the field's.
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      e.preventDefault();
      onUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, onUndo]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 14,
      }}
    >
      <Button
        variant="quiet"
        data-testid="action-undo"
        title={t.undoHint}
        disabled={!canUndo}
        onClick={onUndo}
      >
        ↶ {t.undo}
      </Button>
      <Button
        variant="quiet"
        data-testid="action-suspend"
        title={t.suspendHint}
        onClick={onSuspend}
      >
        {t.suspend}
      </Button>
    </div>
  );
}
