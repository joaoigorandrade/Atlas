"use client";

import { useEffect, useState } from "react";
import { color, font } from "@/lib/theme";

/**
 * Time on screen this visit. Counts only while the tab is visible — the point
 * is how long the learner has been looking, not how long the tab was open.
 */
export default function ScreenTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <div
      title="Time on screen this visit"
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        zIndex: 40,
        background: color.chipBg,
        border: `1px solid ${color.hairline}`,
        borderRadius: 20,
        padding: "5px 11px",
        fontFamily: font.mono,
        fontSize: 12,
        color: color.inkFaint,
        pointerEvents: "none",
      }}
    >
      {mm}:{ss}
    </div>
  );
}
