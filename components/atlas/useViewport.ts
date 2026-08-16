"use client";

// Responsive minimum (#8): track the viewport, collapse the rails below 1280.
// The app-wide gate below 768 is rendered by AtlasApp off `vw`.

import { useEffect, useState } from "react";

export function useViewport() {
  const [vw, setVw] = useState(1440);
  const [railOpen, setRailOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(true);

  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      if (w === 0) return; // hidden/backgrounded surface — keep the last real width
      setVw(w);
      if (w < 1280) {
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
