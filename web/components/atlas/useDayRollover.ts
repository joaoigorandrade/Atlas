"use client";

// The calendar's two effects on adherence, lifted out of the shell.
//
// - Day rollover (#22): judge passed days whenever the calendar turns — on load
//   (after hydration applies it too) and once a minute while open.
// - Clearing the daily queue is the honest "done for today" — it marks the day
//   met, so the streak ticks forward and the flame reads lit everywhere.

import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  localDay,
  markTodayMet,
  rolloverAdherence,
  type AdherenceState,
} from "@/lib/curriculum";

export function useDayRollover(
  setAdherence: Dispatch<SetStateAction<AdherenceState>>,
  queueCleared: boolean | undefined,
) {
  useEffect(() => {
    const tick = () => {
      setAdherence((prev) =>
        prev.lastDay && prev.lastDay !== localDay() ? rolloverAdherence(prev) : prev,
      );
    };
    const id = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [setAdherence]);

  useEffect(() => {
    if (queueCleared) setAdherence((prev) => markTodayMet(prev));
  }, [queueCleared, setAdherence]);
}
