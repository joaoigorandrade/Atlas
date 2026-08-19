"use client";

// The two collapsed-rail toggles at laptop-narrow widths (#8) — one for the
// plan rail on the left, one for the node detail on the right. They were the
// same button twice in `AtlasApp`, down to the shadow; the only differences
// are the side they hang off and what they say.

import { color } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    hidePlan: "⟨ Hide plan",
    showPlan: "Plan ⟩",
    hideNode: "Hide node ⟩",
    showNode: "⟨ Node",
  },
  "pt-BR": {
    hidePlan: "⟨ Ocultar plano",
    showPlan: "Plano ⟩",
    hideNode: "Ocultar nó ⟩",
    showNode: "⟨ Nó",
  },
} as const;

export default function RailToggle({
  side,
  open,
  onToggle,
}: {
  side: "plan" | "node";
  /** Whether the panel this toggles is currently showing. */
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT(STRINGS);
  const plan = side === "plan";
  return (
    <button
      className="at-press"
      onClick={onToggle}
      style={{
        position: "absolute",
        top: 70,
        ...(plan ? { left: open ? 274 : 12 } : { right: open ? 368 : 12 }),
        zIndex: 16,
        padding: "8px 11px",
        background: color.card,
        border: `1px solid ${color.hairlineStrong}`,
        borderRadius: 9,
        fontSize: 12.5,
        color: color.inkMuted,
        cursor: "pointer",
        boxShadow: "0 4px 14px rgba(44,40,35,0.08)",
      }}
    >
      {plan ? (open ? t.hidePlan : t.showPlan) : open ? t.hideNode : t.showNode}
    </button>
  );
}
