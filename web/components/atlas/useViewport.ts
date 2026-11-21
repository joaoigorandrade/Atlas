"use client";

// Responsive minimum (#8): track the viewport, collapse the rails below 1280.
// Below `layout.phone` the map lays itself out for a phone off `vw`.

import { useEffect, useRef, useState } from "react";
import { layout } from "@/lib/theme";

export function useViewport() {
  const [vw, setVw] = useState(1440);
  const [railOpen, setRailOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(true);
  const wide = useRef<boolean | null>(null);

  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      if (w === 0) return; // hidden/backgrounded surface — keep the last real width
      setVw(w);
      // Only on crossing the line: a phone's keyboard or toolbar resizes the
      // window too, and that must not shut a drawer the learner just opened.
      if (wide.current === w >= layout.railsMin) return;
      wide.current = w >= layout.railsMin;
      if (w < layout.railsMin) {
        setRailOpen(false);
        setDetailOpen(false);
      } else {
        setRailOpen(true);
        setDetailOpen(true);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return { vw, railOpen, setRailOpen, detailOpen, setDetailOpen };
}
