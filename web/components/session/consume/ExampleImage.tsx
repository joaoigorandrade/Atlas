"use client";

import { useState } from "react";
import { BLUE } from "./shared";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";

const STRINGS = {
  en: { show: "Show figure", drawing: "Drawing the figure…" },
  "pt-BR": { show: "Ver figura", drawing: "Desenhando a figura…" },
};

/**
 * The picture for a visual worked example. Every draw is billed, so nothing is
 * fetched until the learner taps — an example nobody opens costs nothing. The
 * server keeps each learner's draws, so a second tap (or a reload) is free.
 * Any failure renders nothing: the steps below stand on their own.
 */
export function ExampleImage({ prompt, alt }: { prompt: string; alt: string }) {
  const t = useT(STRINGS);
  const [state, setState] = useState<"idle" | "loading" | "failed" | string>("idle");
  if (process.env.NEXT_PUBLIC_EXAMPLE_IMAGES === "0" || state === "failed") return null;

  const load = async () => {
    setState("loading");
    const res = await fetch("/api/example-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { url?: string } | null;
    setState(res?.ok && data?.url ? data.url : "failed");
  };

  const frame = {
    marginBottom: 14,
    width: "100%",
    aspectRatio: "4 / 3",
    borderRadius: 3,
    border: `1px solid ${color.hairline}`,
    background: "#fff",
  } as const;

  if (state === "idle")
    return (
      <button
        type="button"
        onClick={load}
        style={{
          marginBottom: 12,
          padding: "6px 12px",
          fontFamily: font.mono,
          fontSize: 10.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: BLUE,
          background: "transparent",
          border: `1px solid ${BLUE}`,
          borderRadius: 3,
          cursor: "pointer",
        }}
      >
        {t.show}
      </button>
    );
  if (state === "loading")
    return (
      <div
        role="status"
        style={{
          ...frame,
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          color: color.inkGhost,
        }}
      >
        {t.drawing}
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element -- a signed, per-learner URL; no optimizer
  return <img src={state} alt={alt} style={{ ...frame, objectFit: "contain", display: "block" }} />;
}
