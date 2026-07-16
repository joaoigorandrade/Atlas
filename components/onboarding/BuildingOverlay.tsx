"use client";

import { color, font, kicker } from "@/lib/theme";

export default function BuildingOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 64,
        pointerEvents: "none",
      }}
    >
      <div style={{ textAlign: "center", animation: "fadeUp 0.6s both" }}>
        <div style={{ ...kicker(11, "0.18em"), marginBottom: 10 }}>
          Generating your map
        </div>
        <div style={{ fontFamily: font.serif, fontSize: 26, color: color.ink }}>
          Assembling the territory, foundations first…
        </div>
      </div>
    </div>
  );
}
