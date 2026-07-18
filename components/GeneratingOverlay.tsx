"use client";

import { color, font, kicker } from "@/lib/theme";

/**
 * The full-screen "the AI is writing this" moment shown while a session's
 * content is generated. Blocks interaction — content arrives in one piece.
 */
export default function GeneratingOverlay({
  phase,
  message,
}: {
  phase: string;
  message: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(248,246,240,0.86)",
        backdropFilter: "blur(6px)",
        animation: "softIn 0.25s both",
      }}
    >
      <div style={{ textAlign: "center", animation: "fadeUp 0.5s both" }}>
        <div style={{ ...kicker(11, "0.18em"), marginBottom: 10 }}>{phase}</div>
        <div style={{ fontFamily: font.serif, fontSize: 24, color: color.ink }}>
          {message}
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: font.mono,
            fontSize: 11,
            color: color.inkGhost,
          }}
        >
          generating…
        </div>
      </div>
    </div>
  );
}
