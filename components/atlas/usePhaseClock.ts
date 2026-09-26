"use client";

// How long a phase really took — active time only, posted to the node when the
// phase closes or the page hides (`/api/v1/topics/:id/time`). This is the
// measurement the per-cell budgets in `lib/curriculum/cells.ts` are tuned
// against, so it has to be honest rather than precise: a second counts only
// while the page is visible AND the learner did something in the last two
// minutes. A tab left open over lunch is not a forty-minute Drill.

import { useEffect } from "react";
import { PHASE_ORDER, type PhaseId } from "@/lib/curriculum";
import { generationTopic } from "@/lib/generationTopic";

/** Without input for this long, the learner has walked away. */
const IDLE_MS = 120_000;
const TICK_MS = 5_000;

const isPhase = (s: string | null): s is PhaseId =>
  !!s && (PHASE_ORDER as readonly string[]).includes(s);

export function usePhaseClock(sheet: string | null, nodeId: string | null): void {
  useEffect(() => {
    const topicId = generationTopic();
    if (!isPhase(sheet) || !nodeId || !topicId) return;
    let ms = 0;
    let last = Date.now();
    let active = Date.now();
    const poke = () => (active = Date.now());
    const tick = () => {
      const now = Date.now();
      if (document.visibilityState === "visible" && now - active < IDLE_MS)
        ms += now - last;
      last = now;
    };
    const flush = () => {
      tick();
      const seconds = Math.round(ms / 1000);
      ms = 0;
      if (seconds <= 0) return;
      // keepalive: the page may be going away as this is sent.
      void fetch(`/api/v1/topics/${topicId}/time`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, phase: sheet, seconds }),
      }).catch(() => {});
    };
    // Coming back starts a fresh interval: the hidden stretch is never counted.
    const onVisibility = () =>
      document.visibilityState === "hidden" ? flush() : (last = Date.now());
    const timer = setInterval(tick, TICK_MS);
    const events = ["pointerdown", "keydown", "scroll", "pointermove"] as const;
    for (const e of events) window.addEventListener(e, poke, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      for (const e of events) window.removeEventListener(e, poke);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [sheet, nodeId]);
}
