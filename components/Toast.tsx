"use client";

import { color, font } from "@/lib/theme";

export interface ToastData {
  /** Small mono label above the message — "Map updated" for re-plans. */
  kicker?: string;
  message: string;
}

export default function Toast({ toast }: { toast: ToastData }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 26,
        left: "50%",
        transform: "translateX(-50%)",
        background: color.ink,
        color: color.accentInk,
        padding: "13px 20px",
        borderRadius: 11,
        fontSize: 14,
        zIndex: 40,
        boxShadow: "0 12px 32px rgba(44,40,35,0.3)",
        animation: "fadeUp 0.3s both",
        maxWidth: 520,
      }}
    >
      {toast.kicker && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 9.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#c99a2e",
            marginBottom: 5,
          }}
        >
          {toast.kicker}
        </div>
      )}
      {toast.message}
    </div>
  );
}
