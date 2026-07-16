"use client";

import { color } from "@/lib/theme";

export default function Toast({ message }: { message: string }) {
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
      {message}
    </div>
  );
}
