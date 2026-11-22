"use client";

// Which way this device reads a pass: as reels (the default — a card per
// screen, swiped) or as the page it used to be. Both draw the same
// `ConsumeSession` through the same callbacks, so switching mid-reading loses
// nothing. The choice is a per-device convenience, so it lives in
// localStorage and falls back to reels wherever storage is unavailable.

import { useCallback, useEffect, useState } from "react";
import ConsumeView, { type ConsumeViewProps } from "./ConsumeView";
import ConsumeReels from "./ConsumeReels";

const KEY = "atlas.consumeLayout";
type Layout = "reels" | "page";

export default function ConsumeScreen(props: Omit<ConsumeViewProps, "onSwitchView">) {
  const [layout, setLayout] = useState<Layout>("reels");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "page") setLayout("page");
    } catch {
      // Private mode or blocked storage: reels, as for everyone else.
    }
  }, []);
  const toggle = useCallback(() => {
    setLayout((was) => {
      const next: Layout = was === "reels" ? "page" : "reels";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // The switch still works for this visit.
      }
      return next;
    });
  }, []);
  return layout === "page" ? (
    <ConsumeView {...props} onSwitchView={toggle} />
  ) : (
    <ConsumeReels {...props} onSwitchView={toggle} />
  );
}
