"use client";

// What a passed Crucible says, and the button that acts on it. Three different
// sentences, because a pass means three different things: a cold pass that
// lifts the node, a cold pass on a node that still owes a rung or holds a gap,
// and a guided pass — the re-attempt right after the re-explanation — which
// closes the gap and proves nothing until the cold problem holds tomorrow.

import { TRANSFER_COLOR } from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";
import { STRINGS } from "@/components/session/crucibleCopy";

export default function PassPanel({
  guided,
  lifts,
  onFinish,
}: {
  guided: boolean;
  lifts: boolean;
  onFinish: () => void;
}) {
  const t = useT(STRINGS);
  const [title, body, cta] = guided
    ? [t.guidedTitle, t.guidedBody, t.markGuided]
    : lifts
      ? [t.transferConfirmedTitle, t.transferConfirmedBody, t.markMastered]
      : [t.transferConfirmedTitle, t.transferConfirmedPartialBody, t.markCrucibleDone];
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 13,
          background: color.successBg,
          border: `1px solid rgba(74,117,82,0.34)`,
          borderRadius: 3,
          padding: "15px 18px",
          marginBottom: 18,
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: TRANSFER_COLOR.good,
            flex: "0 0 auto",
            marginTop: 5,
          }}
        />
        <div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 17,
              marginBottom: 3,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 13.5,
              color: color.inkMuted,
              lineHeight: 1.55,
            }}
          >
            {body}
          </div>
        </div>
      </div>
      <button
        className="at-press"
        data-testid="action-finish"
        onClick={onFinish}
        style={{
          padding: "15px 26px",
          background: color.accent,
          color: color.accentInk,
          border: "none",
          borderRadius: 3,
          fontSize: 15,
          fontFamily: font.caps,
          letterSpacing: "0.06em",
          cursor: "pointer",
          boxShadow: `inset 0 0 0 3px ${color.accent}, inset 0 0 0 4px rgba(246,239,223,0.34)`,
        }}
      >
        {cta}
      </button>
    </>
  );
}
